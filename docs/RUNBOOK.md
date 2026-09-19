# LanceMemory Operational Runbook

This runbook covers deployment, operation, and maintenance of the
`lance_memory` library and the `memory_server.py` FastMCP service. It assumes
you have substituted your own host, paths, and service-account user for the
placeholders below.

---

## 1. Topology

```
Your host
├── ollama.service              (embeddings: nomic-embed-text, :11434)
├── lance-memory-http.service    (FastMCP HTTP, :8768) — 5 MCP tools + /health
├── lance-memory-admin.service   (Streamlit admin console, :8767) — optional
└── lance-memory-maintenance.timer  (nightly dedup/expiry sweep)

Storage: PROJECT_MEMORIES_ROOT/<project>/  (one LanceDB dir per project)
```

## 2. Managing services

```bash
# Status
systemctl status lance-memory-http.service lance-memory-admin.service lance-memory-maintenance.timer

# Health check
curl -s http://<host>:8768/health | jq .

# Restart
sudo systemctl restart lance-memory-http.service

# Logs
journalctl -u lance-memory-http.service -f
```

## 3. Using memories

### Python library

```python
from lance_memory import LanceMemory

memory = LanceMemory({
    "vector_store": {
        "config": {
            "uri": "./project_memories/my-project",
            "table": "memories",
            "embedding_model_dims": 768,
        }
    },
    "llm_available": False,  # infer=False bypasses extraction; no LLM cost
})

memory.add(
    "The API server binds to :8768 using stateless HTTP JSON-RPC.",
    project="my-project",
    agent_id="coder",
    infer=False,
)

results = memory.search("stateless connection", project="my-project")
for hit in results["results"]:
    print(f"[{hit['score']:.3f}] {hit['memory']}")
```

### MCP tool call (stateless HTTP)

```bash
curl -X POST http://<host>:8768/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "recall",
      "arguments": {
        "project_id": "my-project",
        "query": "stateless connection",
        "search_type": "semantic",
        "limit": 3
      }
    }
  }'
```

## 4. Working memory / sessions

The `sync_session_buffer` tool (or `SessionMemory` in Python) provides a
short-lived turn buffer in front of long-term storage:

```python
from lance_memory import LanceMemory
from lance_memory.session import SessionMemory

lt = LanceMemory()
session = SessionMemory(project="my-project", agent_id="coach", long_term=lt, max_turns=5)

session.begin_turn()
context = session.read(query="current task")
# ... generate a response ...
session.write(user_message="Deploy updates", assistant_response="Deployed.")

handoff_packet = session.handoff(reason="completed")
```

## 5. Maintenance

```bash
# Manual run
sudo systemctl start lance-memory-maintenance.service
journalctl -u lance-memory-maintenance.service -n 20 --no-pager

# Check the schedule
systemctl list-timers lance-memory-maintenance.timer
```

`nightly_maintenance.py` iterates every project directory under
`PROJECT_MEMORIES_ROOT` and applies deterministic (non-LLM) duplicate merges,
expired-record deletion, and stale-record demotion.

## 6. Bootstrap a new project partition

No allowlist is required.

1. Verify `PROJECT_MEMORIES_ROOT` points at your partition parent directory.
2. Call `inspect_memory_system(action="health")` and confirm the embedder is reachable.
3. Call `commit_memory(project_id="<new-project>", text="...", type="discovery", metadata={"category": "ongoing_tasks", "verified": false})`.
4. Recall it with `recall(project_id="<new-project>", ...)`.
5. Recall against a different project and confirm no leak.
6. Copy the `templates/` triplet into the new repository and set
   `<MEMORY_MCP_HOST>` in `.mcp.json`.

The server creates the project directory/table on first write. Do not create
a second LanceDB root or hardcode the project name into the server.

## 7. Configuration reference

| Variable | Suggested value | Purpose |
|---|---|---|
| `PROJECT_MEMORIES_ROOT` | `/opt/lance-memory/project_memories` | Partition parent |
| `PROJECT_MEMORY` | your default project | Fallback when a caller omits one |
| `PROJECT_MEMORY_PROJECTS` | optional | Comma-separated projects to pre-seed |
| `OLLAMA_HOST` | `http://127.0.0.1:11434` | Embedding service |
| `LANCE_MEMORY_TRANSPORT` | `http` | FastMCP transport |
| `ARCH_MEMORY_HOST` | `0.0.0.0` | Service bind host |
| `LANCE_MEMORY_PORT` | `8768` | HTTP port |
| `FASTMCP_STATELESS_HTTP` | `true` | Compatibility for stateless clients |
| `EXTRACTION_LLM_URL` | optional | OpenAI-compatible proxy for fact extraction |
| `EXTRACTION_LLM_MODEL` | optional | Extraction model name |
| `EXTRACTION_LLM_API_KEY` | secret/optional | Proxy credential; never commit |

## 8. Troubleshooting

1. `inspect_memory_system(action="health")` — verify service, partition paths, and Ollama.
2. `inspect_memory_system(action="stats", project_id="<PROJECT>")` — confirm exact project name and row counts.
3. If writes fail, verify the project name and filesystem permissions on `PROJECT_MEMORIES_ROOT`.
4. If recall is empty, try `search_type="recent"` and confirm records are `status="active"`.
5. If embedding dimensions differ from 768, stop writes and verify the `nomic-embed-text` model is pulled.
6. Inspect `journalctl -u lance-memory-http.service` before restarting.

## 9. Disaster recovery

Take a filesystem snapshot of `PROJECT_MEMORIES_ROOT` before any migration or
bulk maintenance change:

```bash
tar -czf backup_$(date -u +%Y%m%dT%H%M%SZ).tar.gz -C /opt/lance-memory project_memories
```

Rollback:

```bash
sudo systemctl stop lance-memory-http.service
tar -xzf backup_<timestamp>.tar.gz -C /opt/lance-memory
sudo systemctl start lance-memory-http.service
```


## Web Control Panel

The FastMCP HTTP service embeds an interactive Web Control Panel directly on the main HTTP port:

- **URL:** `http://<HOST>:8768/` or `http://<HOST>:8768/panel`
- **Features:**
  - Partition switcher (`FlamBot`, `SolarFlare`, `EventHorizon`, `FareverAPI`, etc.)
  - Multi-mode search (`semantic`, `symbol`, `recent`, `id`) with bucket and category filtering
  - Inline memory creator and editor with automatic vector re-embedding
  - One-click promotion from unverified blueprints to ratified facts
  - Live pairwise cosine duplicate & conflict scanner
  - Backend diagnostics (Ollama status, database storage path, disk usage)
