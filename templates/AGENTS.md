# Autonomous Lance Memory (lance-mem0ry) Charter & Governance

All agents use the **`lance-memory-governance`** skill and the `lance-memory`
FastMCP backend (**5 tools only**). Embeddings: Ollama `nomic-embed-text` (768-dim).

---

## 1. Project Scoping & Partition Governance

- **Authorized Partitions Only**: Agents **MUST NOT** invent or pass arbitrary project IDs. New partitions are created exclusively by human administrators in the Web Panel.
- **Autonomous Project Selection**: Agents must identify their current workspace/task and target the corresponding configured project partition. Folder-name equality is never required.
- **Discover First**: Call `inspect_memory_system(action="projects")` to obtain the authoritative project list and routing profiles.
- **Routing Precedence**: If the nearest applicable `AGENTS.md` declares `lance_memory_project_id: <PROJECT_ID>`, use that ID when it is authorized. Otherwise choose the best contextual fit from project purpose, task, agent identity, aliases, workspace hints, ID tokens, and categories.
- Always pass the returned canonical `project_id` explicitly. A close-but-not-identical folder name is not a reason to refuse memory. There is no human-selected "Active Project" and no server-side default; missing or unknown IDs are rejected. Never mix partitions across unrelated codebases.

---

## 2. Category Governance & Selection

- **No Arbitrary Categories**: Agents **MUST NOT** invent custom category strings. Every memory must use an approved category defined in that project's registry.
- **Inspect Descriptions Before Deciding**:
  Agents can query the current category registry and read descriptions to decide the best category for their memory:
  ```python
  inspect_memory_system(action="categories", project_id="<PROJECT_ID>")
  ```

### Baseline Categories (Standard Across All Projects)

| Category | Bucket | Verified | Description & Lifecycle Rule |
|---|---|---|---|
| `key_facts` | `fact` | `true` | Ratified facts, verified patterns, stable APIs, and configuration constants (after proof). |
| `architectural_decisions` | `decision` | `true` | System architecture, design choices, invariants, patterns, and trade-offs. |
| `ongoing_tasks` | `state` | `false` | WIP blueprints, hypotheses, and pending implementation steps. |
| `session_handoff` | `state` | `false` | Session summaries, milestones reached, and next action items. |

Additional project-specific categories may be provisioned by administrators in `categories.json`.

Blueprints and hypotheses are never facts. Only verified working code/fixes get `verified=true`.

---

## 3. Before / During / After Workflow

### Before
Query memory before starting work on a topic or subsystem:
```python
recall(project_id="<PROJECT_ID>", query="<topic>", search_type="semantic", limit=8)
```

### During (WIP Blueprint)
```python
commit_memory(
    project_id="<PROJECT_ID>",
    text="Blueprint: implement feature X",
    type="discovery",
    metadata={"category": "ongoing_tasks", "verified": False},
)
```

### After Proof (Promotion to Verified Fact)
```python
commit_memory(
    project_id="<PROJECT_ID>",
    text="",
    type="promotion",
    metadata={
        "supersedes_id": "<DRAFT_ID>",
        "category": "key_facts",
        "evidence": "tests/build/runtime OK",
    },
)
```

### Milestone Continuity (Handoff)
```python
commit_memory(
    project_id="<PROJECT_ID>",
    text="Milestone summary",
    type="handoff",
    metadata={"shipped": "...", "open_items": "...", "paths": "..."},
)
```

Working-memory turns (optional): `sync_session_buffer` with `begin` / `read` / `write` / `flush`.

---

## 4. Five Tools

`recall` · `commit_memory` · `modify_memory` · `sync_session_buffer` · `inspect_memory_system`

---

## 5. Safety

- No secrets, tokens, or private credentials in memory.
- Check `inspect_memory_system(action="health")` before bulk writes.
- `modify_memory(..., action="purge")` requires explicit user confirmation (`patch_data.confirm=True`).
