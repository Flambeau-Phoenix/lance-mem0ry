# LanceMemory System Reference

## 1. Architecture

- **Storage:** LanceDB, one directory per project partition under
  `PROJECT_MEMORIES_ROOT/<project>/`.
- **Embeddings:** Ollama `nomic-embed-text`, 768-dim, via
  `POST {OLLAMA_HOST}/api/embeddings` on every write and vector search.
- **Transport:** FastMCP server (`server/memory_server.py`), `stdio` | `http` | `sse`.
- **Optional extraction LLM:** any OpenAI-compatible endpoint via
  `EXTRACTION_LLM_URL` / `EXTRACTION_LLM_MODEL` / `EXTRACTION_LLM_API_KEY`
  (only used for `infer=True` fact extraction; disabled by default).

## 2. Schema (v2, backward compatible with v1)

| Column | Type | Notes |
|---|---|---|
| `text` / `content` | `str` | Same stored value; `content` is the v2 alias |
| `category` | `str` | Free-form; maps to `bucket` via `CATEGORY_BUCKET_MAP` |
| `symbol` | `str` | Exact-match code symbol, optional |
| `verified` | `bool` | `true` = ratified fact/decision; `false` = draft/state |
| `bucket` | `str` | `fact` \| `decision` \| `constraint` \| `preference` \| `procedure` \| `state` |
| `tags` | `list[str]` | Free-form tags; category is auto-appended |
| `memory_id` / `record_id` | `str` | Stable identifiers |
| `project_id` | `str` | Partition key |
| `agent_id` / `run_id` | `str` | Optional scoping |
| `source_type` | `str` | `agent` \| `user` \| `ast_index` \| `doc` \| `migration` |
| `status` | `str` | `active` \| `superseded` \| `deleted` |
| `supersedes_id` | `str` | Points to the record this one replaces |
| `created_at` / `updated_at` | `str` (ISO) | Timestamps |
| `vector` | `Vector(768)` | Ollama dense embedding |

## 3. Categories (agent-facing)

| Category | Bucket | Verified | When |
|---|---|---|---|
| `key_facts` | `fact` | `true` | After proof — working APIs, fixes, contracts |
| `architectural_decisions` | `decision` | `true` | After ratification |
| `ongoing_tasks` | `state` | `false` | Plans, WIP, blueprints |
| `session_handoff` | `state` | `false` | Milestone continuity |

Guardrails enforced server-side:
- `verified=true` + `category="ongoing_tasks"` → rejected.
- `verified=true` + `bucket="state"` (except `session_handoff`) → rejected.
- `verified=false` + `bucket != "state"` → rejected.

## 4. The five MCP tools

### `recall(project_id, query="", search_type="semantic", filters=None, limit=8)`

| `search_type` | Behavior |
|---|---|
| `semantic` | Hybrid vector + full-text search; `filters`: `bucket`/`buckets`, `tags`, `agent_id`, `run_id`, `verified` |
| `symbol` | Exact symbol match |
| `recent` | Newest active rows; optional `filters.memory_id` for a single lookup |
| `id` | Exact `memory_id`/`record_id` lookup |

### `commit_memory(project_id, text, type="discovery", metadata=None)`

| `type` | Behavior |
|---|---|
| `discovery` | Store a memory. `metadata`: `category`, `verified`, `bucket`, `symbol`, `tags`, `agent_id`, `run_id`, `source_type`, `source_ref`, `supersedes_id`, `entity_type` |
| `handoff` | Formats `text` + `metadata.shipped/open_items/paths/restart_steps/unverified_risks/reason` into a `category="session_handoff"`, `bucket="state"`, `verified=false` record |
| `promotion` | Requires `metadata.supersedes_id`; supersedes that record and writes a new `verified=true` row under `metadata.category` (`key_facts` or `architectural_decisions`), optionally appending `metadata.evidence` |

### `modify_memory(project_id, memory_id, action, patch_data=None)`

| `action` | Behavior |
|---|---|
| `update` | In-place text/metadata update (re-embeds if `patch_data.text` changes) |
| `delete` | Soft delete (`status="deleted"`) |
| `archive` | Soft archive (`status="superseded"`) |
| `purge` | Scoped bulk delete; a full-project wipe (no `user_id`/`agent_id`/`run_id`/`app_id` scope) requires `patch_data.confirm=True` |

### `sync_session_buffer(project_id, action, turn_data=None)`

Short-lived, in-memory working buffer for multi-turn tasks.

| `action` | Behavior |
|---|---|
| `begin` | Create a session; returns `session_id` |
| `read` | Read buffered context for the current turn |
| `write` | Append a `user_message`/`assistant_response` turn |
| `flush` | Summarize into long-term memory and close the session |

### `inspect_memory_system(action, project_id="", target_id="")`

| `action` | Behavior |
|---|---|
| `health` | Server status, project row counts, embedder check |
| `stats` | Total vs. active row counts for one project |
| `maintenance_scan` | Read-only duplicate/expired scan |
| `history` | Audit trail for `target_id` (requires it) |

An HTTP `GET /health` route is also exposed outside the MCP protocol for
lightweight client health checks.

## 5. Before / during / after lifecycle

1. **Before work:** `recall(project_id=..., query=..., search_type="semantic")`.
2. **During work:** `commit_memory(..., type="discovery", metadata={"category": "ongoing_tasks", "verified": false})`.
3. **After proof:** `commit_memory(..., type="promotion", metadata={"supersedes_id": ..., "category": "key_facts", "evidence": "..."})`, or a fresh `verified=true` discovery if there was no draft.
4. **After milestone:** `commit_memory(..., type="handoff", metadata={...})`.

## 6. Safety

- Never store secrets, credentials, or raw chat transcripts.
- Call `inspect_memory_system(action="health")` before relying on writes persisting.
- `modify_memory(..., action="purge")` on a whole project requires explicit `confirm=True`.
- Keep project names exact; never recall from one project while writing to another.
