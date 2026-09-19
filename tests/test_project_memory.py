from __future__ import annotations

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
