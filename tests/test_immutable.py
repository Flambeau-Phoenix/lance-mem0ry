"""Regression coverage for immutable memories (issue #5)."""
from __future__ import annotations

import importlib

import pytest
from fastapi.testclient import TestClient

from lance_memory import LanceMemory


@pytest.fixture()
def memory(tmp_path):
    return LanceMemory({
        "project": "Alpha",
        "vector_store": {"config": {"uri": str(tmp_path)}},
        "embedder": {"provider": "test", "config": {"dims": 8}},
        "llm_available": False,
        "enable_graph": False,
        "enable_temporal": False,
    })


def add(memory, text="Protected fact.", **kwargs):
    return memory.add(text, infer=False, **kwargs)["results"][0]["id"]


@pytest.mark.parametrize("patch", [
    {"text": "Replacement"},
    {"metadata": {"changed": True}},
    {"expiration_date": "2030-01-01"},
    {},
])
def test_immutable_update_has_no_side_effects(memory, monkeypatch, patch):
    mid = add(memory, immutable=True)
    before = memory.store.get_memory(mid)
    history = memory.history(mid)
    monkeypatch.setattr(memory.embedder, "embed", lambda *a: pytest.fail("must not embed"))
    with pytest.raises(ValueError, match="immutable"):
        memory.update(mid, **patch)
    assert memory.store.get_memory(mid) == before
    assert memory.history(mid) == history


@pytest.mark.parametrize("delete_linked", [False, True])
def test_immutable_delete_rejects_before_cascade(memory, delete_linked):
    mid = add(memory, immutable=True)
    linked = add(memory, "Linked fact.")
    memory.store.mark_superseded(linked, mid)
    with pytest.raises(ValueError, match="immutable"):
        memory.delete(mid, delete_linked=delete_linked)
    assert memory.get(mid)["immutable"] is True
    assert memory.get(linked)["replaced_by"] == mid
    assert len(memory.history(mid)) == 1


@pytest.mark.parametrize("operation", ["update", "delete"])
def test_wrong_project_still_reports_not_found(memory, operation):
    mid = add(memory, immutable=True)
    with pytest.raises(ValueError, match="not found"):
        getattr(memory, operation)(mid, project="Beta")


@pytest.mark.parametrize("operation", ["update_memory", "delete_memory", "mark_superseded"])
def test_store_blocks_immutable_mutations(memory, operation):
    mid = add(memory, immutable=True)
    before = memory.store.get_memory(mid)
    args = {
        "update_memory": (mid, {"immutable": False, "score_hint": 0.5}),
        "delete_memory": (mid,),
        "mark_superseded": (mid, "replacement"),
    }
    with pytest.raises(ValueError, match="immutable"):
        getattr(memory.store, operation)(*args[operation])
    assert memory.store.get_memory(mid) == before


def test_batch_update_skips_immutable_and_counts_changes(memory):
    protected = add(memory, immutable=True)
    mutable = add(memory, "Editable fact.")
    result = memory.batch_update([
        {"memory_id": protected, "text": "Forbidden"},
        {"memory_id": mutable, "text": "Updated fact."},
    ])
    assert result["message"] == "Successfully updated 1 memories"
    assert memory.get(protected)["memory"] == "Protected fact."
    assert memory.get(mutable)["memory"] == "Updated fact."
    with pytest.raises(ValueError, match="not found"):
        memory.batch_update([{"memory_id": protected}], project="Beta")


def test_batch_delete_skips_immutable_missing_and_wrong_project(memory):
    protected = add(memory, immutable=True)
    mutable = add(memory, "Deletable fact.")
    other = add(memory, "Other project.", project="Beta")
    result = memory.batch_delete([
        {"memory_id": mid} for mid in (protected, mutable, mutable, other, "missing")
    ])
    assert result["message"] == "Successfully deleted 1 memories"
    assert memory.get(protected)["immutable"] is True
    assert memory.get(other, project="Beta")["project_id"] == "Beta"
    with pytest.raises(ValueError, match="not found"):
        memory.get(mutable)


@pytest.mark.parametrize("scope", [{"confirm": True}, {"user_id": "user"}])
def test_delete_all_preserves_immutable_and_scope(memory, scope):
    protected = add(memory, immutable=True, user_id="user")
    mutable = add(memory, "Deletable fact.", user_id="user")
    other = add(memory, "Other project.", project="Beta", user_id="user")
    # NULL is the legacy value when the immutable column is added by migration.
    memory.store.memories.update(where=f"id = '{mutable}'", values={"immutable": None})
    assert memory.delete_all(**scope)["message"] == "Deleted 1 memories"
    assert memory.get(protected)["immutable"] is True
    assert memory.get(other, project="Beta")["project_id"] == "Beta"
    with pytest.raises(ValueError, match="not found"):
        memory.get(mutable)
    assert memory.delete_all(**scope)["message"] == "Deleted 0 memories"


def test_linked_cascade_preserves_immutable_and_other_project(memory):
    target = add(memory, "Current fact.")
    protected = add(memory, immutable=True)
    mutable = add(memory, "Old fact.")
    other = add(memory, "Other project.", project="Beta")
    for mid in (protected, mutable, other):
        memory.store.memories.update(where=f"id = '{mid}'", values={"replaced_by": target})
    result = memory.delete(target, delete_linked=True)
    assert result["cascade_count"] == 1
    assert memory.get(protected)["immutable"] is True
    assert memory.get(other, project="Beta")["project_id"] == "Beta"
    for mid in (target, mutable):
        with pytest.raises(ValueError, match="not found"):
            memory.get(mid)


@pytest.mark.parametrize("immutable", [False, True])
def test_automatic_supersession_respects_immutable(memory, monkeypatch, immutable):
    monkeypatch.setattr(memory.embedder, "embed", lambda texts: [[1.0] + [0.0] * 7])
    old = add(memory, immutable=immutable)
    new = add(memory, "New fact with the same embedding.")
    row = memory.get(old)
    assert row["lifecycle_state"] == ("active" if immutable else "superseded")
    assert row["replaced_by"] == (None if immutable else new)


@pytest.fixture()
def client(memory, monkeypatch):
    # The API creates a global memory at import; keep it on the temporary test DB.
    with monkeypatch.context() as patch:
        patch.setattr("lance_memory.memory.LanceMemory", lambda: memory)
        api = importlib.import_module("lance_memory.api")
    monkeypatch.setattr(api, "_memory", memory)
    monkeypatch.setattr(api, "AUTH_TOKEN", None)
    with TestClient(api.app) as client:
        yield client


@pytest.mark.parametrize("method", ["patch", "delete"])
def test_rest_rejects_immutable_and_allows_mutable(client, memory, method):
    protected = add(memory, immutable=True)
    mutable = add(memory, "Mutable REST fact.")
    kwargs = {"json": {"text": "Changed via REST"}} if method == "patch" else {}
    request = getattr(client, method)
    response = request(f"/memories/{protected}", params={"project": "Alpha"}, **kwargs)
    assert response.status_code == 404  # Existing ValueError mapping is preserved.
    assert "immutable" in response.json()["detail"]
    assert memory.get(protected)["memory"] == "Protected fact."
    response = request(f"/memories/{mutable}", params={"project": "Alpha"}, **kwargs)
    assert response.status_code == 200
