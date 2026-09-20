# Autonomous Project Memory System — Complete Reference & Architecture Guide

This document is the authoritative specification for the **LanceDB + FastMCP Architectural Memory System** (`project-memory`). It explains how the system operates, what prompts agents to interact with it, the full catalog of available tools, every database field across both storage tables, and how memory types, tagging, custom instructions, and async session buffering are fully implemented.

---

## 1. System Architecture & Philosophy

The memory layer is built to give AI agents (Antigravity, Cursor, Nanobot, Claude Desktop) a **persistent, autonomous engineering memory** that spans sessions, repositories, and reboots without paid LLM API lock-in:

- **Zero-Cost Embeddings:** 768-dimensional vector embeddings generated locally via Ollama (`nomic-embed-text`) on `127.0.0.1:11434` / `localhost:11434`.
- **Project Isolation:** Storage is strictly segregated into project partitions (e.g. your application, repository, or workspace name, such as `"my-project"`).
- **Universal Scope:** All memories in a partition belong to the shared engineering truth layer. No user credentials or identities gate retrieval or creation.
- **Autonomous FastMCP Backend:** Agents interact directly with the backend via the `project-memory` MCP server (`:8768` streamable HTTP or stdio).

---

## 2. What Prompts Agents (The Autonomous Lifecycle)

Agents do not wait for human instructions to use memory. Agents are governed by a **proactive 3-phase lifecycle**:

### A. Task Inception (Pre-Flight Recall)
- **What prompts the agent:** Receiving any user request involving codebase modification, bug fixing, architecture design, API integration, or system exploration.
- **What the agent does:** Before writing code or proposing a plan, the agent proactively runs:
  ```python
  recall(query="<search_terms>", project_id="<PROJECT_ID>", buckets=["decision", "fact"], limit=5)
  ```
- **What this solves:** Eliminates hallucinated API signatures, prevents re-introducing known regressions, and retrieves existing design choices.

### B. Execution & Verification Gate (Fact vs. Blueprint)
- **What prompts the agent:** 
  1. *Formulating unverified ideas:* If the agent creates plans, drafts, or WIP code, it saves them to `category="ongoing_tasks"`, `bucket="state"`, and `verified=false`.
  2. *Verifying working code:* The exact moment code compiles, unit tests pass, or a feature runs successfully, the agent records the ratified fact:
  ```python
  record_discovery(
      text="Ratified design choice or confirmed technical contract",
      project="<ACTIVE_PROJECT>",
      category="architectural_decisions",
      bucket="decision",
      verified=True
  )
  ```
- **What this solves:** Enforces a strict boundary where speculative assumptions never pollute the permanent truth layer.

### C. Session & Milestone Handoff
- **What prompts the agent:** Concluding a multi-step task, reaching a feature milestone, or preparing for an agent switch.
- **What the agent does:** Commits a handoff record via `session_handoff` or `category="session_handoff"` summarizing:
  1. What shipped and what was verified.
  2. Modified files and core components.
  3. Remaining open tasks and pending items.

---

## 3. Implementation of the Core Memory Capabilities

### 1. Memory Types (`memory-types.md`)
The system supports distinct operational memory paths:
- **Procedural Memory (Step-by-Step Task Knowledge):** How-to guides, execution sequences, and build/deploy routines. Recorded using `bucket="procedure"` in `record_discovery` or `categories=["procedural_memory"]` in `memory_add`.
- **Declarative / Architectural Memory:** Stable engineering facts and ratified decisions (`bucket="fact"` or `bucket="decision"`).
- **Working / State Memory:** Session turn buffers and active tasks (`bucket="state"`).
- **Scoping Dimensions:**
  - `project`: Primary namespace isolation.
  - `agent_id`: Optional role/persona tag (e.g. `coder`, `architect`, `auditor`).
  - `run_id`: Optional task or conversation thread identifier.

### 2. Tagging & Categorization (`tagging-and-organizing-memories.md`)
Memories are never dumped into an undifferentiated bucket. The system enforces two-tier classification:
- **Category Slugs (Tier 1):**
  - `architectural_decisions`: Ratified patterns, framework selections, structural architecture.
  - `key_facts`: Confirmed endpoints, hardware configurations, system properties.
  - `ongoing_tasks`: Active blueprints, in-progress drafts, unverified hypotheses.
  - `session_handoff`: State continuity and handoff summaries.
  - Custom domain categories provisioned per-project in `categories.json` (e.g. `api_reference`, `database_schema`, `coding_standards`).
- **v2 Buckets (Tier 2):** `fact`, `decision`, `constraint`, `preference`, `procedure`, `state`.
- **Tags (`tags`):** Arbitrary array of string keywords (e.g. `["networking", "caching", "oauth2"]`) for precise set-intersection filtering.

### 3. Custom Instructions (`custom-instructions.md`)
When adding memories with LLM-assisted extraction (`infer=True` in `memory_add`), the `custom_instructions` parameter steers fact extraction:
```python
memory_add(
    messages=[{"role": "user", "content": "..."}],
    project="<PROJECT_ID>",
    infer=True,
    custom_instructions="Extract strictly technical API contracts, port numbers, and library versions. Ignore casual user feedback and greetings."
)
```
This ensures zero conversational noise lands in the vector database.

### 4. Async & Session Memory (`async-memory.md`)
The backend provides non-blocking working memory session buffers via `SessionMemory`:
- `session_begin`: Allocates an in-memory conversational turn buffer tied to the project partition.
- `session_write`: Appends turn exchanges without blocking or immediate vector write overhead.
- `session_read`: Reads recent turn context.
- `session_handoff`: Flushes the buffer into long-term vector storage upon task completion.
- `memory_history`: Provides full audit trails for tracking memory mutations over time.

---

## 4. Complete Database Schema (All Fields)

LanceDB manages two distinct tables per project partition: the primary architectural table (`records`) and the Mem0 vector table (`memories`).

### Table 1: `records` (Primary Architectural Memory Table)

| Field Name | Type | Default | Purpose & Description | Example |
|---|---|---|---|---|
| `text` (or `content`) | `str` | *(Required)* | The stored technical fact, architectural decision, or procedure. | `"FastMCP server runs on port 8768"` |
| `category` | `str` | `"general"` | Standard category slug for high-level organization. | `"architectural_decisions"` |
| `symbol` | `str` | `""` | Exact code symbol, class name, method, or hook signature. | `"RedisPool.acquire"` |
| `verified` | `bool` | `True` | Guardrail flag. `True` for verified facts, `False` for WIP/blueprints. | `True` |
| `created_at` | `str` | `ISO-8601 UTC` | Timestamp when the record was initially created. | `"2026-09-18T12:30:00Z"` |
| `record_id` | `str` | `UUID4` | Legacy unique record identifier. | `"e4d9b2a1-..."` |
| `entity_type` | `str` | `"General"` | Classification entity (`Rule`, `Directive`, `Preference`, `Hook`, `UI Element`, `Protocol`, `Config`, `General`). | `"Protocol"` |
| `memory_id` | `str` | `UUID4.hex` | Durable v2 32-character hex memory identifier. | `"c530fc87d5e482a7..."` |
| `project_id` | `str` | *(Required)* | Canonical authorized partition ID selected from `inspect_memory_system(action="projects")`. | `"my-project"` |
| `bucket` | `str` | `"fact"` | v2 taxonomy (`fact`, `decision`, `constraint`, `preference`, `procedure`, `state`). | `"decision"` |
| `tags` | `list[str]` | `[]` | Array of search tags. Category is automatically mirrored here. | `["mcp", "networking"]` |
| `agent_id` | `str` | `""` | Optional role or subagent identity. | `"architect"` |
| `run_id` | `str` | `""` | Optional session or task run ID. | `"task-402"` |
| `source_type` | `str` | `"agent"` | Origin of the record (`agent`, `user`, `ast_index`, `doc`, `migration`). | `"agent"` |
| `source_ref` | `str` | `""` | Provenance link (file path, git commit SHA, URL, or test suite). | `"src/gateway/mcp.py:L45"` |
| `updated_at` | `str` | `ISO-8601 UTC` | Timestamp of the most recent modification. | `"2026-09-18T12:35:00Z"` |
| `status` | `str` | `"active"` | Lifecycle state (`active`, `superseded`, `deleted`). Only `active` rows are recalled. | `"active"` |
| `supersedes_id` | `str` | `""` | `memory_id` of the previous record that this row obsoletes. | `"33bf120a..."` |
| `vector` | `Vector(768)` | `float[768]` | 768-dimensional Ollama `nomic-embed-text` dense vector. | `[-0.0124, 0.0431, ...]` |

---

### Table 2: `memories` (Mem0 Integration Table)

| Field Name | Type | Purpose & Description |
|---|---|---|
| `id` | `str` | Unique memory UUID. |
| `memory` | `str` | Stored memory text / extracted fact. |
| `project_id` | `str` | Required primary project partition scope. |
| `hash` | `str` | Content hash for deduplication and duplicate prevention. |
| `metadata` | `dict` | Nested JSON containing provenance and extension fields. |
| `categories` | `list[str]` | Array of assigned category tags. |
| `verified` | `bool` | Validation gate; false for plans and hypotheses. |
| `bucket` | `str` | Operational taxonomy (`fact`, `decision`, `constraint`, `preference`, `procedure`, `state`). |
| `agent_id` | `str` | Scoping agent persona or ID. |
| `run_id` | `str` | Scoping task or run ID. |
| `app_id` | `str` | Tenant / project scoping mirror. |
| `created_at` | `str` | Creation timestamp. |
| `updated_at` | `str` | Last update timestamp. |
| `expiration_date` | `str \| None` | Optional TTL timestamp for automatic sunsetting. |
| `immutable` | `bool` | If true, updates and automatic mutations are blocked. |
| `lifecycle_state` | `str` | State of the record (`active`, `superseded`). |
| `score` | `float` | Vector similarity score returned during search. |
| `vector` | `Vector(768)` | Ollama dense embedding vector. |

---

## 5. FastMCP Tool Catalog (`project-memory`) — 5 routed tools

Tip MCP exposes **exactly five** agent-visible tools. Backend routing reuses
`record_discovery_impl`, `promote_to_fact_impl`, `recall_impl`, sessions, etc.

**Tip embeddings:** Ollama only (`nomic-embed-text`, 768-dim) via
`POST {OLLAMA_HOST}/api/embeddings` on every write and vector search.

### 1. `recall(project_id, query="", search_type="semantic", filters=None, limit=8)`

| `search_type` | Behavior |
|---|---|
| `semantic` | Hybrid vector + FTS (`recall_impl`); filters: buckets/bucket, tags, agent_id, run_id, verified |
| `symbol` | Exact symbol match |
| `recent` | Newest active rows; optional `filters.memory_id` |
| `id` | Exact memory_id / record_id lookup |

### 2. `commit_memory(project_id, text, type="discovery", metadata=None)`

| `type` | Behavior |
|---|---|
| `discovery` | `record_discovery_impl` (category/verified/bucket from metadata) |
| `handoff` | `session_handoff` + `bucket=state` + **`verified=false`** |
| `promotion` | `promote_to_fact_impl` — requires `metadata.supersedes_id` |

### 3. `modify_memory(project_id, memory_id, action, patch_data=None)`

| `action` | Behavior |
|---|---|
| `update` | In-place text/metadata update |
| `delete` | Soft status=`deleted` |
| `archive` | Soft status=`superseded` |
| `purge` | Scoped wipe; full project needs `patch_data.confirm=True` |

### 4. `sync_session_buffer(project_id, action, turn_data=None)`

`begin` | `read` | `write` | `flush` — working-memory turn buffer.

### 5. `inspect_memory_system(action, project_id="", target_id="")`

Use `action="projects"` without a project ID to discover authorized contextual routing profiles. Prefer `lance_memory_project_id` from the nearest applicable `AGENTS.md`; otherwise choose the best fit from project purpose, task, aliases, workspace hints, ID tokens, and categories. Folder-name equality is not required.

`health` | `stats` | `maintenance_scan` | `history` (needs `target_id`) | `categories` (returns project's category registry).

HTTP `/health` remains for external monitoring probes (not an MCP tool).

**Agent lifecycle:** before → `recall`; during → `commit_memory` discovery WIP;
after proof → `commit_memory` promotion; milestone → handoff.
