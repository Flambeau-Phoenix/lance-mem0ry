# Autonomous Project Memory Charter & Governance

All agents use the **`arch-memory-governance`** skill and the `project-memory`
FastMCP backend (**5 tools only**). Tip embeddings: Ollama `nomic-embed-text`
(768-dim).

---

## 1. Project scoping

- Derive `project_id` from the repository root (alias only if documented).
- Always pass `project_id="<ACTIVE_PROJECT>"`. Never mix partitions.

---

## 2. Before / During / After

### Before
```python
recall(project_id="<ACTIVE_PROJECT>", query="<topic>", search_type="semantic", limit=8)
```

### During (WIP only)
```python
commit_memory(
    project_id="<ACTIVE_PROJECT>",
    text="Blueprint / WIP",
    type="discovery",
    metadata={"category": "ongoing_tasks", "verified": False},
)
```

### After proof
```python
commit_memory(
    project_id="<ACTIVE_PROJECT>",
    text="",
    type="promotion",
    metadata={
        "supersedes_id": "<DRAFT_ID>",
        "category": "key_facts",
        "evidence": "tests/build/runtime OK",
    },
)
```

### Milestone
```python
commit_memory(
    project_id="<ACTIVE_PROJECT>",
    text="Milestone summary",
    type="handoff",
    metadata={"shipped": "...", "open_items": "...", "paths": "..."},
)
```

Working-memory turns (optional): `sync_session_buffer` with
`begin` / `read` / `write` / `flush`.

---

## 3. Categories

| Category | Bucket | Verified |
|---|---|---|
| `key_facts` | `fact` | `true` |
| `architectural_decisions` | `decision` | `true` |
| `ongoing_tasks` | `state` | `false` |
| `session_handoff` | `state` | `false` |

## 4. Five tools

`recall` · `commit_memory` · `modify_memory` · `sync_session_buffer` · `inspect_memory_system`

## 5. Safety

No secrets. Prefer `inspect_memory_system(action="health")` before writes.
`modify_memory(..., action="purge")` requires `patch_data.confirm=True`.
