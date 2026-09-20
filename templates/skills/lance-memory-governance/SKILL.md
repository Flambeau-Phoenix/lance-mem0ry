---
name: lance-memory-governance
description: Universal project-scoped engineering memory via FastMCP and LanceDB. Five routed tools — recall, commit_memory, modify_memory, sync_session_buffer, inspect_memory_system.
compatibility: fastmcp, cursor, opencode, codex, antigravity
---

# Lance Memory Governance (lance-mem0ry)

Use the `lance-memory` MCP server (5 tools only). Connection details belong in
`.mcp.json`. Tip embeddings: Ollama `nomic-embed-text` (768-dim).

## 1. Project Scoping & Partition Governance

Agents **MUST NOT** invent arbitrary project IDs. New partitions are created exclusively by human maintainers via the Web Panel (`➕ Provision New Project`). Agents must autonomously identify which authorized partition their current workspace/task belongs to from the configured projects on the system:

- First call `inspect_memory_system(action="projects")` to obtain the authoritative project list and routing profiles. Folder-name equality is never required.
- Always pass `project_id="<PROJECT_ID>"` explicitly matching the target codebase partition.
- If the nearest applicable `AGENTS.md` declares `lance_memory_project_id: <PROJECT_ID>`, use it when authorized. Otherwise choose the best contextual fit from project purpose, task, agent identity, aliases, workspace hints, ID tokens, and categories.
- A close-but-not-identical folder name is not a reason to refuse memory. There is no human-selected "Active Project" and no server-side default; missing or unknown project IDs are rejected.
- Never mix partitions across unrelated codebases.

## 2. Category Governance & Selection

Agents **MUST NOT** invent arbitrary category strings. Every memory commit must use an existing category defined in the project's category registry.

To discover all valid categories and their authoritative descriptions for a project:
```python
inspect_memory_system(action="categories", project_id="<PROJECT_ID>")
```

Always read category descriptions to choose the most appropriate category for your entry.

### Baseline Categories (Standard in All Partitions)

| Category | Bucket | Verified | Description / When |
|---|---|---|---|
| `key_facts` | `fact` | `true` | Ratified facts, verified patterns, stable APIs, and configuration constants (after proof). |
| `architectural_decisions` | `decision` | `true` | System architecture, design choices, invariants, patterns, and trade-offs. |
| `ongoing_tasks` | `state` | `false` | WIP blueprints, hypotheses, and pending implementation steps. |
| `session_handoff` | `state` | `false` | Session summaries, milestones reached, and next action items. |

Additional project-specific categories can be defined by administrators in `categories.json`.

Blueprints and hypotheses are never facts. Only verified working code/fixes get `verified=true`.

## 3. Before / During / After Workflow

1. **Before:** `recall(project_id="<PROJECT_ID>", query=..., search_type="semantic"|"symbol"|"recent")`
2. **During:** `commit_memory(project_id="<PROJECT_ID>", ..., type="discovery", metadata={category:"ongoing_tasks", verified:false})`
3. **After proof:** `commit_memory(project_id="<PROJECT_ID>", ..., type="promotion", metadata={supersedes_id, category:"key_facts", evidence})`  
   or fresh discovery with `verified=true` / ratified category when there was no prior draft
4. **Milestone:** `commit_memory(project_id="<PROJECT_ID>", ..., type="handoff", metadata={shipped, open_items, paths, ...})`

## 4. The Five Tools

### `recall`
`search_type`: `semantic` | `symbol` | `recent` | `id`  
`filters`: bucket/buckets, tags, agent_id, run_id, verified, memory_id

### `commit_memory`
`type`: `discovery` | `handoff` | `promotion`  
Promotion requires `metadata.supersedes_id`. Category must be a recognized category.

### `modify_memory`
`action`: `update` | `delete` | `archive` | `purge`  
Purge needs `patch_data.confirm=true` for a full project wipe.

### `sync_session_buffer`
`action`: `begin` | `read` | `write` | `flush` (working-memory turns)

### `inspect_memory_system`
`action`: `projects` | `health` | `stats` | `maintenance_scan` | `history` | `categories`

```python
# Check categories and their descriptions before recording memories
inspect_memory_system(action="categories", project_id="<PROJECT_ID>")

# Search relevant context
recall(project_id="<PROJECT_ID>", query="authentication flow", search_type="semantic", limit=8)

# Log WIP task
commit_memory(
    project_id="<PROJECT_ID>",
    text="Blueprint: Implement OAuth token refresh retry policy",
    type="discovery",
    metadata={"category": "ongoing_tasks", "verified": False},
)

# Promote to verified fact
commit_memory(
    project_id="<PROJECT_ID>",
    text="Verified OAuth refresh policy conforms to retry backoff specification.",
    type="promotion",
    metadata={
        "supersedes_id": "<DRAFT_ID>",
        "category": "key_facts",
        "evidence": "unit tests passed and verified against mock server",
    },
)

# End-of-session handoff
commit_memory(
    project_id="<PROJECT_ID>",
    text="Session handoff: completed token refresh policy implementation.",
    type="handoff",
    metadata={"shipped": "Token retry policy", "open_items": "None", "paths": "src/auth/client.py"},
)
```

## 5. Safety

No secrets in memory. Call `inspect_memory_system(action="health")` before writes.
Destructive `purge` / deletes require explicit user intent.
