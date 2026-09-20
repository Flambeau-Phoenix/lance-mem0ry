# Lance Memory (lance-mem0ry)

Persistent, project-scoped engineering memory for AI agents, backed by LanceDB and local
Ollama embeddings. Ships as a Python library (`lance_memory`) and a FastMCP
server exposing exactly **five** routed agent-facing tools.

---

## What is LanceMemory?

- **Zero-Cost Primary Path** — 768-dimensional embeddings generated locally via Ollama
  (`nomic-embed-text`); no paid cloud vector DB or third-party embedding API required.
- **Strict Project Partitioning & Governance** — Memories belong to isolated project partitions
  configured on the host (e.g. your repository or system name). Agents discover contextual routing
  profiles with `inspect_memory_system(action="projects")`; an authorized `lance_memory_project_id`
  in the nearest `AGENTS.md` takes precedence, otherwise they choose the best contextual fit. Folder
  names do not need to match partition IDs. Agents are **strictly forbidden from creating arbitrary
  project IDs**. New partitions are provisioned exclusively by administrators via the Web Portal or CLI.
- **Enforced Category Registry with Descriptions** — Every project maintains a `categories.json`
  catalog. Agents inspect category descriptions via `inspect_memory_system(action="categories")` to
  determine exactly where each memory belongs.
- **Verified vs. Blueprint Guardrail** — Drafts and WIP hypotheses are strictly stored as
  `verified=false` state (`ongoing_tasks`); only proven, tested code and ratified decisions can be promoted to `verified=true`.
- **Five-Tool FastMCP Surface** — `recall`, `commit_memory`, `modify_memory`,
  `sync_session_buffer`, `inspect_memory_system`. No massive wall of 20+ tools; each tool routes internally by parameter.
- **Comprehensive Web Admin & Control Portal** — Built-in Streamlit admin portal (`admin_app.py` on port `8767`)
  and native FastMCP web panel (`:8768`). Features full category management, cross-project category migration/copy,
  1-click project provisioning, Tantivy FTS search, duplicate detection, and vector-safe JSON export.

---

## Repository & Package Layout

```
lance-memory/
├── docs/
│   ├── WEB_PORTAL_BACKEND_REQUIREMENTS.md  # Backend architecture & REST API spec
│   ├── MEMORY_SYSTEM_REFERENCE.md          # Full tool & LanceDB schema reference
│   └── RUNBOOK.md                          # Operational runbook
├── examples/                               # Standalone example database & export
│   ├── example_project_db/                 # Real LanceDB dataset + categories.json
│   ├── example_project_db.tar.gz           # Portable database archive
│   ├── example_database_export.json        # Standalone JSON export with 768-dim vectors
│   └── README.md                           # Guide for querying via Python / TypeScript
├── server/
│   ├── memory_server.py                    # FastMCP server (recall, commit, inspect...)
│   ├── admin_app.py                        # Streamlit Web Control Panel
│   ├── admin_cli.py                        # SSH-friendly backup/audit CLI
│   ├── static/index.html                   # Built-in lightweight FastMCP web UI
│   └── scripts/
│       ├── acceptance_smoke.sh             # End-to-end smoke verification suite
│       └── nightly_maintenance.py          # Dedup/expiry sweep (systemd timer)
├── src/lance_memory/                       # Core library (LanceMemory, SessionMemory)
├── templates/                              # Drop into any project repo:
│   ├── .mcp.json                           #   MCP endpoint configuration
│   ├── AGENTS.md                           #   Agent governance charter
│   └── skills/lance-memory-governance/SKILL.md # Agent skill definition
├── tests/test_project_memory.py            # Pytest test suite
└── pyproject.toml                          # Project configuration & dependencies
```

---

## Quickstart

### 1. Install Dependencies

```bash
pip install -e .
```

### 2. Start Local Ollama Embeddings

```bash
ollama pull nomic-embed-text
ollama serve
```

### 3. Run the FastMCP Memory Server

```bash
export PROJECT_MEMORIES_ROOT=./project_memories
export LANCE_MEMORY_TRANSPORT=http
export LANCE_MEMORY_PORT=8768
python server/memory_server.py
```

### 4. Launch the Web Control Panel

```bash
streamlit run server/admin_app.py --server.port 8767 --server.address 0.0.0.0
```

Use the **➕ Provision New Project** button in the sidebar to create your first project partition.

---

## The Five MCP Tools

| Tool | Purpose | Key Parameters |
|---|---|---|
| `recall` | Search or browse memories | `search_type`: `semantic` \| `symbol` \| `recent` \| `id` |
| `commit_memory` | Write discoveries, handoffs, promotions | `type`: `discovery` \| `handoff` \| `promotion` |
| `modify_memory` | Update, delete, archive, or purge memories | `action`: `update` \| `delete` \| `archive` \| `purge` |
| `sync_session_buffer` | Short-lived multi-turn working memory | `action`: `begin` \| `read` \| `write` \| `flush` |
| `inspect_memory_system` | Project discovery, health, stats, maintenance, history, categories | `action`: `projects` \| `health` \| `stats` \| `maintenance_scan` \| `history` \| `categories` |

### Discovering Categories via FastMCP
Agents query valid categories and read descriptions before recording memories:
```python
inspect_memory_system(action="categories", project_id="<PROJECT_ID>")
```

---

## Category Governance & Agent Lifecycle

Every project partition contains a `categories.json` registry defining approved categories, their semantic bucket (`fact`, `decision`, `state`), and a human/agent-readable description.

### Baseline Categories (Standard in All Projects)

| Category | Bucket | Verified | Description & Lifecycle Rule |
|---|---|---|---|
| `key_facts` | `fact` | `true` | Ratified facts, verified patterns, stable APIs, and configuration constants (after proof). |
| `architectural_decisions` | `decision` | `true` | System architecture, design choices, invariants, patterns, and trade-offs. |
| `ongoing_tasks` | `state` | `false` | WIP blueprints, hypotheses, and pending implementation steps. |
| `session_handoff` | `state` | `false` | Session summaries, milestones reached, and next action items. |

Additional project-specific categories can be provisioned by administrators directly in `categories.json` or via the Web Control Panel.

---

## Web Control Panel Capabilities

The Streamlit Web Console (`server/admin_app.py`, default port `8767`) provides:

1. **Category Management Console (Tab 4)**:
   - Full catalog of categories per project with descriptions, buckets, and live record counts.
   - Form to add and edit categories with mandatory descriptions.
   - **Cross-Project Category Migration & Copy Tool**: Move or replicate an entire category between partitions with automatic FTS index rebuilding and provenance tagging.
   - Category rename with cascade record updates, and safe category deletion.
2. **Prominent Project Provisioning**:
   - 1-click `➕ Provision New Project` expander in the sidebar to scaffold clean LanceDB partitions with Tantivy FTS indices and default category registries.
3. **Safe Vector Serialization**:
   - Built-in `NumpyEncoder` handles LanceDB 768-dimensional NumPy vector arrays without JSON serialization crashes during export and inspection.
4. **Maintenance & Deduplication**:
   - Pairwise cosine distance vector deduplication scans ($\text{dist} < 0.15$).

---

## Configuration Reference

| Environment Variable | Default | Purpose |
|---|---|---|
| `PROJECT_MEMORIES_ROOT` | `./project_memories` | Root directory containing project partition folders |
| `PROJECT_MEMORY_PROJECTS` | discovered directories | Optional comma-separated list of authorized/pre-seeded project partitions; omit for a blank slate |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama embedding endpoint |
| `LANCE_MEMORY_TRANSPORT` | `stdio` | FastMCP transport (`http`, `sse`, or `stdio`) |
| `LANCE_MEMORY_PORT` | `8768` | FastMCP HTTP daemon port |
| `EXTRACTION_LLM_URL` | none | Optional OpenAI-compatible endpoint for memory extraction |

---

## Health Check & Verification

1. **MCP Health**: Call `inspect_memory_system(action="health")` and confirm Ollama and LanceDB report healthy.
2. **Project Discovery**: Call `inspect_memory_system(action="projects")`; prefer an authorized `lance_memory_project_id` from the nearest `AGENTS.md`, otherwise choose the best contextual routing profile. Folder-name equality is not required.
3. **Category Discovery**: Call `inspect_memory_system(action="categories", project_id="<PROJECT_ID>")`.
3. **Smoke Verification**:
   ```bash
   bash server/scripts/acceptance_smoke.sh
   ```

---

## License

Apache-2.0 — see `LICENSE`.
