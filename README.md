# Lance Memory (lance-mem0ry)

Persistent, project-scoped memory for AI agents, backed by LanceDB and local
Ollama embeddings. Ships as a Python library (`lance_memory`) and a FastMCP
server exposing exactly **five** agent-facing tools.

## What is LanceMemory?

- **Zero-cost primary path** — 768-dim embeddings generated locally via Ollama
  (`nomic-embed-text`); no cloud vector DB or paid embedding API required.
- **Project partitions, not `user_id` gating** — memories belong to a
  `project_id` you choose (e.g. your repo name). Any non-empty name works;
  there is no project allowlist to edit.
- **Verified vs. blueprint guardrail** — drafts/plans are stored as
  `verified=false` state; only proven facts/decisions can be `verified=true`.
- **Five-tool MCP surface** — `recall`, `commit_memory`, `modify_memory`,
  `sync_session_buffer`, `inspect_memory_system`. No 20+ tool wall for the
  agent to pick from; each tool routes internally by parameter.
- **Native Web Control Panel** — Access `http://localhost:8768/` or `http://localhost:8768/panel` directly in your browser. Maintain, search, inline-edit, promote blueprints, and resolve duplicate candidate memories with zero extra server processes or npm builds.
- **Optional Streamlit console** — an alternative Streamlit app (`admin_app.py`) for legacy workflows.

## Package layout

```
lance-memory-oss/
├── src/lance_memory/          # Core library (LanceMemory, SessionMemory, ...)
├── server/
│   ├── static/index.html      # Built-in Web Control Panel UI
│   ├── memory_server.py       # FastMCP server: recall / commit_memory /
│   │                          #   modify_memory / sync_session_buffer /
│   │                          #   inspect_memory_system + /health route
│   ├── admin_app.py           # Streamlit "LanceDB Control" console
│   ├── admin_cli.py           # SSH-friendly backup/audit CLI
│   ├── init_project_memories.py  # Scaffold empty project partitions
│   └── scripts/nightly_maintenance.py  # Dedup/expiry sweep (systemd timer)
├── systemd/                   # Example unit files (edit paths/user first)
├── templates/                 # Drop into any repo to wire up an agent:
│   ├── .mcp.json               #   MCP endpoint config
│   ├── AGENTS.md                #   Agent governance charter
│   └── skills/lance-memory-governance/SKILL.md
├── docs/
│   ├── MEMORY_SYSTEM_REFERENCE.md  # Full tool + schema reference
│   └── RUNBOOK.md                  # Generic operational runbook
├── tests/test_project_memory.py
└── pyproject.toml
```

## Quickstart

### 1. Install

```bash
pip install -e .
```

### 2. Start local embeddings

```bash
ollama pull nomic-embed-text
ollama serve
```

### 3. Run the FastMCP server

```bash
export PROJECT_MEMORY=my-project
export PROJECT_MEMORIES_ROOT=./project_memories
export LANCE_MEMORY_TRANSPORT=http
export LANCE_MEMORY_PORT=8768
python server/memory_server.py
```

### 4. Connect your agent

Copy the triplet from `templates/` into your project repository:

- `.mcp.json` — replace `<MEMORY_MCP_HOST>` with your server host
- `AGENTS.md` — governance rules (before/during/after lifecycle)
- `skills/lance-memory-governance/SKILL.md` — agent skill definition

The project partition defaults to your repository-root folder name unless the
workspace documents an explicit alias.

## The five MCP tools

| Tool | Purpose | Key parameter |
|---|---|---|
| `recall` | Search/browse memories | `search_type`: `semantic` \| `symbol` \| `recent` \| `id` |
| `commit_memory` | Write discoveries, handoffs, promotions | `type`: `discovery` \| `handoff` \| `promotion` |
| `modify_memory` | Update/delete/archive/purge | `action`: `update` \| `delete` \| `archive` \| `purge` |
| `sync_session_buffer` | Short-lived multi-turn working memory | `action`: `begin` \| `read` \| `write` \| `flush` |
| `inspect_memory_system` | Health, stats, maintenance, history | `action`: `health` \| `stats` \| `maintenance_scan` \| `history` |

See `docs/MEMORY_SYSTEM_REFERENCE.md` for full parameter and routing details.

## Categories (agent lifecycle)

| Category | Bucket | Verified | When |
|---|---|---|---|
| `key_facts` | `fact` | `true` | After proof (tests/build/runtime confirmed) |
| `architectural_decisions` | `decision` | `true` | After ratification |
| `ongoing_tasks` | `state` | `false` | Plans, WIP, blueprints |
| `session_handoff` | `state` | `false` | Milestone continuity |

## Configuration reference

| Variable | Default | Purpose |
|---|---|---|
| `PROJECT_MEMORIES_ROOT` | `./project_memories` | Parent directory for project partitions |
| `PROJECT_MEMORY` | none | Default project when a caller omits one |
| `PROJECT_MEMORY_PROJECTS` | discovered directories | Optional comma-separated projects to pre-seed |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Ollama embedding endpoint |
| `LANCE_MEMORY_TRANSPORT` | `stdio` | FastMCP transport (`http`, `sse`, or `stdio`) |
| `ARCH_MEMORY_HOST` | `127.0.0.1` | Bind host |
| `LANCE_MEMORY_PORT` | `8768` | Bind port |
| `FASTMCP_STATELESS_HTTP` | `false` | Permit stateless HTTP clients when `true` |
| `EXTRACTION_LLM_URL` | none | Optional OpenAI-compatible proxy for fact extraction |
| `EXTRACTION_LLM_MODEL` | `local-model` | Optional extraction model name |
| `EXTRACTION_LLM_API_KEY` | none | Optional proxy credential; never commit it |

## First health check

1. Call `inspect_memory_system(action="health")` and confirm Ollama reports healthy.
2. Call `inspect_memory_system(action="stats", project_id="<PROJECT>")`.
3. Write a disposable unverified record via `commit_memory(..., type="discovery",
   metadata={"category": "ongoing_tasks", "verified": false})`, recall it with
   `recall`, confirm it is absent from another project, then delete it with
   `modify_memory(..., action="delete")`.

> **Security:** The bundled FastMCP and Streamlit services do not provide a
> complete public-internet authentication boundary. Bind to localhost or a
> trusted private interface and put an authenticated reverse proxy in front of
> anything reachable outside that boundary.

## Running tests

```bash
pip install -e ".[dev]"
pytest tests/
```

## License

Apache-2.0 — see `LICENSE`.
