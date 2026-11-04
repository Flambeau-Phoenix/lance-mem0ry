"""Regression coverage: caller-supplied values must never alter a LanceDB filter."""
from __future__ import annotations

import pytest

from lance_memory import LanceMemory
from lance_memory.filters import scope_clauses, sql_str

QUOTE_PAYLOAD = "zzz' OR id != '"


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


def add(memory, text, **kwargs):
    return memory.add(text, infer=False, **kwargs)["results"][0]["id"]


def count_all(memory):
    return len(memory.store.memories.search().where("id IS NOT NULL").limit(100).to_list())


def test_sql_str_doubles_quotes():
    assert sql_str("a'b") == "'a''b'"
    assert sql_str("'; DROP --") == "'''; DROP --'"


def test_scope_clauses_allow_list_and_escape():
    assert scope_clauses({"user_id": "o'neil", "run_id": None}) == ["user_id = 'o''neil'"]
    with pytest.raises(ValueError, match="Unknown scope key"):
        scope_clauses({"id": "x"})


def test_crafted_memory_id_cannot_delete_other_rows(memory):
    add(memory, "alpha one")
    add(memory, "alpha two", immutable=True)
    add(memory, "beta secret", project="Beta")
    before = count_all(memory)
    with pytest.raises(ValueError, match="not found"):
        memory.delete(QUOTE_PAYLOAD, project="Alpha")
    assert count_all(memory) == before


def test_crafted_memory_id_cannot_update_other_rows(memory):
    keep = add(memory, "alpha one")
    other = add(memory, "beta secret", project="Beta")
    with pytest.raises(ValueError, match="not found"):
        memory.update(QUOTE_PAYLOAD, project="Alpha", text="overwritten")
    assert memory.get(keep)["memory"] == "alpha one"
    assert memory.get(other, project="Beta")["memory"] == "beta secret"


def test_crafted_memory_id_cannot_read_other_project(memory):
    add(memory, "beta secret", project="Beta")
    with pytest.raises(ValueError, match="not found"):
        memory.get("zzz' OR project_id = 'Beta", project="Alpha")


def test_crafted_scope_values_cannot_widen_delete_all(memory):
    add(memory, "alpha one", user_id="u1")
    add(memory, "beta secret", project="Beta", user_id="u1")
    before = count_all(memory)
    memory.delete_all(user_id="x' OR project_id = 'Beta")
    assert count_all(memory) == before


def test_delete_all_rejects_unknown_scope_column(memory):
    add(memory, "alpha one")
    with pytest.raises(ValueError, match="Unknown scope key"):
        memory.store.delete_by_scope(id="anything")


def test_crafted_history_and_conversation_keys_are_inert(memory):
    mid = add(memory, "alpha one")
    assert memory.store.get_history(f"{mid}' OR memory_id != '", "Alpha") == []
    memory.store.append_conversation("scope-a", [{"role": "user", "content": "hi"}])
    assert memory.store.recent_conversation("x' OR scope_key != '") == []
    assert len(memory.store.recent_conversation("scope-a")) == 1


def test_entities_with_quotes_are_stored_and_found(memory):
    vec = [0.1] * 8
    memory.store.upsert_entity("O'Brien", vec, "mem-1", "scope-a")
    memory.store.upsert_entity("O'Brien", vec, "mem-2", "scope-a")
    found = memory.store.find_entities(["O'Brien"], "scope-a")
    assert len(found) == 1
    assert sorted(found[0]["memory_ids"]) == ["mem-1", "mem-2"]
    assert memory.store.find_entities(["x' OR name != '"], "scope-a") == []
