from __future__ import annotations
from pathlib import Path

import pytest

from lance_memory import LanceMemory
from lance_memory.filters import scope_key
from lance_memory.session import SessionMemory


@pytest.fixture()
def memory(tmp_path):
    return LanceMemory(
        {
            "vector_store": {"config": {"uri": str(tmp_path), "table": "memories"}},
            "embedder": {"provider": "test", "config": {"dims": 768}},
            "llm_available": False,
            "enable_graph": False,
        }
    )


def test_project_isolation(memory):
    memory.record_discovery(
        "Alpha uses port 8768.",
        project="Alpha",
        category="key_facts",
        verified=True,
        bucket="fact",
    )

    assert memory.get_all(project="Alpha")["count"] == 1
    assert memory.get_all(project="Beta")["count"] == 0
    assert memory.search("port 8768", project="Beta", threshold=0)["results"] == []


def test_verified_blueprint_gate(memory):
    with pytest.raises(ValueError, match="ongoing_tasks"):
        memory.record_discovery(
            "This draft may work.",
            project="Alpha",
            category="ongoing_tasks",
            verified=True,
            bucket="state",
        )

    result = memory.record_discovery(
        "Evaluate a new cache.",
        project="Alpha",
        category="ongoing_tasks",
        verified=False,
        bucket="state",
    )
    row = memory.get(result["results"][0]["id"], project="Alpha")
    assert row["verified"] is False
    assert row["bucket"] == "state"


def test_session_handoff_is_project_scoped(memory, monkeypatch):
    session = SessionMemory(project="Alpha", long_term=memory)
    monkeypatch.setattr(session._extractor, "extract", lambda *args, **kwargs: ["Build passed."])
    monkeypatch.setattr(session, "_summarize", lambda messages: "Completed the build.")

    session.begin_turn()
    session.write(user_message="Run the build.", assistant_response="Build passed.")
    session.end_turn()
    packet = session.handoff(reason="completed")

    assert packet["project"] == "Alpha"
    assert memory.get_all(project="Alpha")["count"] == 2
    assert memory.get_all(project="Beta")["count"] == 0


def test_scope_key_requires_project():
    with pytest.raises(ValueError, match="project is required"):
        scope_key({"agent_id": "coder"})


def test_templates_and_services_unified():
    # Verify no arch-memory in templates or systemd
    repo_root = Path(__file__).resolve().parent.parent
    systemd_files = list((repo_root / "systemd").glob("*"))
    systemd_names = [f.name for f in systemd_files]
    assert "lance-memory-http.service" in systemd_names
    assert "lance-memory-admin.service" in systemd_names
    assert "arch-memory-http.service" not in systemd_names
    assert "arch-memory-admin.service" not in systemd_names

    skill_file = repo_root / "templates" / "skills" / "lance-memory-governance" / "SKILL.md"
    assert skill_file.exists()
    assert not (repo_root / "templates" / "skills" / "arch-memory-governance").exists()
    
    skill_content = skill_file.read_text(encoding="utf-8")
    assert "name: lance-memory-governance" in skill_content
    assert "arch-memory" not in skill_content.lower()
    assert 'inspect_memory_system(action="projects")' in skill_content
    assert "lance_memory_project_id" in skill_content

    for service_file in systemd_files:
        service_content = service_file.read_text(encoding="utf-8")
        assert "Environment=PROJECT_MEMORY=" not in service_content


def test_server_project_selection_is_contextual_and_authorized(tmp_path, monkeypatch):
    monkeypatch.setenv("PROJECT_MEMORIES_ROOT", str(tmp_path))
    monkeypatch.delenv("PROJECT_MEMORY_PROJECTS", raising=False)
    import server.memory_server as ms

    with pytest.raises(ValueError, match="project_id is required"):
        ms.resolve_project("")
    with pytest.raises(ValueError, match="unknown or unauthorized"):
        ms.resolve_project("invented-folder-name")

    project_dir = tmp_path / "ExampleAgentMemory"
    project_dir.mkdir()
    assert ms.resolve_project("exampleagentmemory") == "ExampleAgentMemory"

    profile = ms.project_routing_profile("ExampleAgentMemory")
    assert profile["project_id"] == "ExampleAgentMemory"
    assert profile["id_tokens"] == ["example", "agent", "memory"]
    assert profile["category_signals"]


def test_blank_initializer_does_not_seed_default(monkeypatch):
    monkeypatch.delenv("PROJECT_MEMORY_PROJECTS", raising=False)
    from server.init_project_memories import seed_project_names

    assert seed_project_names() == []


def test_server_record_update_and_purge(tmp_path, monkeypatch):
    monkeypatch.setenv("PROJECT_MEMORIES_ROOT", str(tmp_path))
    import server.memory_server as ms
    monkeypatch.setattr(ms, "embed_text", lambda text: [0.1] * 768)
    (tmp_path / "TestProj").mkdir()

    # 1. Create discovery record
    rec = ms.record_discovery_impl(
        "Initial technical specification.",
        project="TestProj",
        category="architectural_decisions",
        verified=True,
        bucket="decision",
    )
    mid = rec["memory_id"]
    assert rec["text"] == "Initial technical specification."
    assert rec["category"] == "architectural_decisions"

    # 2. Update record via update_record_impl
    updated = ms.update_record_impl(
        mid,
        patch_data={
            "text": "Updated technical specification with ratified protocol.",
            "category": "key_facts",
            "bucket": "fact",
        },
        project="TestProj",
    )
    assert updated["memory_id"] == mid
    assert updated["text"] == "Updated technical specification with ratified protocol."
    assert updated["category"] == "key_facts"
    assert updated["bucket"] == "fact"

    # 3. Retrieve and verify update took effect in records table
    row = ms.get_active_row_impl(mid, project="TestProj")
    assert row["text"] == "Updated technical specification with ratified protocol."
    assert row["category"] == "key_facts"

    # 4. Test purge
    purge_res = ms.purge_project_impl(project="TestProj")
    assert purge_res["status"] == "purged"
    assert purge_res["purged_records"] == 1

    tbl = ms.get_table("TestProj")
    assert tbl.count_rows() == 0


def test_web_panel_routes(tmp_path, monkeypatch):
    from starlette.testclient import TestClient
    monkeypatch.setenv('PROJECT_MEMORIES_ROOT', str(tmp_path))
    import server.memory_server as ms
    monkeypatch.setattr(ms, 'embed_text', lambda t: [0.05] * 768)
    (tmp_path / 'WebTest').mkdir()

    mcp = ms.build_mcp()
    client = TestClient(mcp.http_app())

    # 1. Panel page
    resp = client.get('/panel')
    assert resp.status_code == 200
    assert 'Lance Memory' in resp.text

    # 2. API Health
    resp = client.get('/api/health')
    assert resp.status_code == 200
    assert 'status' in resp.json()

    # 3. Create memory
    resp = client.post('/api/memories', json={
        'project': 'WebTest',
        'text': 'Native FastMCP Web Panel is operational.',
        'type': 'discovery',
        'metadata': {'category': 'key_facts', 'bucket': 'fact', 'verified': True}
    })
    assert resp.status_code == 200
    mid = resp.json()['record']['memory_id']

    # 4. Query memories
    resp = client.get('/api/memories?project=WebTest')
    assert resp.status_code == 200
    assert len(resp.json()['rows']) == 1

    # 5. Update memory
    resp = client.put(f'/api/memories/{mid}', json={
        'project': 'WebTest',
        'patch': {'text': 'Updated memory via REST API.'}
    })
    assert resp.status_code == 200
    assert resp.json()['record']['text'] == 'Updated memory via REST API.'
