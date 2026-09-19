---
name: arch-memory-governance
description: Universal project-scoped engineering memory via FastMCP and LanceDB. Five routed tools — recall, commit_memory, modify_memory, sync_session_buffer, inspect_memory_system.
compatibility: fastmcp, cursor, opencode, codex, antigravity
---

# Architectural Memory Governance

Use the `project-memory` MCP server (5 tools only). Connection details belong in
`.mcp.json`. Tip embeddings: Ollama `nomic-embed-text` (768-dim).

## 1. Project resolution

Always pass `project_id="<ACTIVE_PROJECT>"` (derive from repo root unless the
user overrides). Never mix partitions.

## 2. Categories

| Category | Bucket | Verified | When |
|---|---|---|---|
| `key_facts` | `fact` | `true` | After proof |
| `architectural_decisions` | `decision` | `true` | After ratification |
| `ongoing_tasks` | `state` | `false` | Plans / WIP |
| `session_handoff` | `state` | `false` | Milestone continuity |

Blueprints are never facts. Only verified working code/fixes get `verified=true`.

## 3. Before / During / After

1. **Before:** `recall(project_id=..., query=..., search_type="semantic"|"symbol"|"recent")`
2. **During:** `commit_memory(..., type="discovery", metadata={category:"ongoing_tasks", verified:false})`
3. **After proof:** `commit_memory(..., type="promotion", metadata={supersedes_id, category, evidence})`  
   or fresh discovery with `verified=true` / `key_facts` when there was no draft
4. **Milestone:** `commit_memory(..., type="handoff", metadata={shipped, open_items, paths, ...})`

## 4. The five tools

### `recall`
`search_type`: `semantic` | `symbol` | `recent` | `id`  
`filters`: bucket/buckets, tags, agent_id, run_id, verified, memory_id

### `commit_memory`
`type`: `discovery` | `handoff` | `promotion`  
Promotion requires `metadata.supersedes_id`.

### `modify_memory`
`action`: `update` | `delete` | `archive` | `purge`  
Purge needs `patch_data.confirm=true` for a full project wipe.

### `sync_session_buffer`
`action`: `begin` | `read` | `write` | `flush` (working-memory turns)

### `inspect_memory_system`
`action`: `health` | `stats` | `maintenance_scan` | `history`

```python
recall(project_id="<ACTIVE_PROJECT>", query="migrations", search_type="semantic", limit=8)

commit_memory(
    project_id="<ACTIVE_PROJECT>",
    text="Blueprint: try X",
    type="discovery",
    metadata={"category": "ongoing_tasks", "verified": False},
)

commit_memory(
    project_id="<ACTIVE_PROJECT>",
    text="",
    type="promotion",
    metadata={
        "supersedes_id": "<DRAFT_ID>",
        "category": "key_facts",
        "evidence": "pytest passed",
    },
)

commit_memory(
    project_id="<ACTIVE_PROJECT>",
    text="Milestone done",
    type="handoff",
    metadata={"shipped": "...", "open_items": "...", "paths": "..."},
)

inspect_memory_system(action="health")
```

## 5. Safety

No secrets in memory. Call `inspect_memory_system(action="health")` before writes.
Destructive `purge` / deletes require explicit user intent.
