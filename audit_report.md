# Codebase Audit Report: Lance Memory

## 1. Architecture Map
- **`server/memory_server.py`**: FastMCP server that exposes 5 primary tools (`recall`, `commit_memory`, `modify_memory`, `sync_session_buffer`, `inspect_memory_system`) and hosts the REST API / Web Panel routes. Integrates LanceDB operations and vector embedding logic (using local Ollama models).
- **`server/admin_app.py`**: A Streamlit web dashboard for database administration, handling category management, maintenance scans, project provisioning, and backup/restore workflows.
- **`src/lance_memory/memory.py`**: The core library interface (`LanceMemory`) implementing the logical operations of the persistent memory.
- **`src/lance_memory/api.py`**: FastAPI app acting as a REST mirror of the MCP surface, handling routes under `/v1/memories` and `/sessions`.
- **`src/lance_memory/retrieval.py`**: Multi-signal retrieval logic handling semantic, keyword, and entity search with fusing heuristics.
- **`src/lance_memory/store.py`**: LanceDB low-level CRUD operations, schema definitions, and table connections.
- **`server/admin_cli.py`**: CLI tool for server operations (audit, backup, export, optimize, rebuild indexes).

## 2. Dead Code, Broken Imports, and Code Issues
- **Unused Imports (Flagged by Ruff)**:
  - `pathlib.Path` in `src/lance_memory/harness.py`
  - `memory_server.EMBED_DIM` and `memory_server.VALID_ENTITY_TYPES` in `server/admin_app.py`
  - `lance_memory.harness.MaintenanceHarness` in `src/lance_memory/api.py`
  - `.retrieval.estimate_tokens` in `src/lance_memory/memory.py`
- **Unused Variables**:
  - Multiple instances of `except Exception as e:` where `e` is unused.
  - `scopes = extract_scope(filters)` in `src/lance_memory/memory.py` is assigned but never used.
- **Legacy References (`arch_memory`)**:
  - Found in `server/scripts/cutover_fresh_scaffold.sh` and `server/scripts/migrate_ast_symbols.py`. These paths (`/opt/eh-stack/app/arch_memory`) reflect the old project name and should be updated.
- **Missing Docstrings**: Pydocstyle output showed 60+ missing docstrings across classes and functions in `src` and `server`.
- **TODOs**: Leftover TODOs were found in `.git/hooks/sendemail-validate.sample` (irrelevant as it's a git sample) and `web-panel/src/utils/databaseAuditor.ts` (checking for literal 'todo' string in records, which is fine).

## 3. Outdated Dependencies
- Several packages are outdated compared to `pyproject.toml` environment bounds.
  - `playwright`: 1.58.0 -> 1.63.0
  - `pydantic-core`: 2.46.5 -> 2.49.0
  - Various `nvidia-*` and CUDA tooling wheels are outdated in the installed virtualenv (e.g., `cuda-toolkit` 13.0.3.0 -> 13.4.2).
  - Note: Code specifies `>=` boundaries for dependencies, so while newer versions exist on PyPI, constraints are not strictly broken.

## 4. Documentation (README.md) vs Code Discrepancies
- **Environment Variables**: The README notes `LANCE_MEMORY_*` properties and mentions `ARCH_MEMORY_*` as a deprecated fallback. The code accurately handles these fallbacks.
- **Tools**: The FastMCP tool surface described in the README (`recall`, `commit_memory`, `modify_memory`, `sync_session_buffer`, `inspect_memory_system`) matches exactly the 5 tools implemented in `server/memory_server.py`.
- **Ports**: The Streamlit control panel port `8767` and FastMCP HTTP port `8768` match between the README and code defaults.
- No direct disagreements were found between the README and code implementation.

## 5. Test Coverage and Untested Code
- **Total Coverage**: ~29% across `src/` and `server/`.
- **Untested Modules**:
  - `server/admin_app.py` (0%)
  - `server/admin_cli.py` (0%)
  - `src/lance_memory/api.py` (0%)
  - `src/lance_memory/mcp_server.py` (0%)
  - `src/lance_memory/cli.py` (0%)
- **Identical Files Hole**: The files `tests/test_lance_memory.py` and `tests/test_project_memory.py` are an **exact 100% duplicate** of each other.
- **Failing Tests**:
  - `test_blank_initializer_does_not_seed_default` fails because `seed_project_names()` returns `['default']` instead of `[]`.
  - `test_web_panel_routes` fails on `assert len(resp.json()['rows']) == 1` (it actually returns 2 rows).

## 6. Prioritized Issue List & Recommendations
1. **Fix Failing Tests (High Priority)**:
   - Resolve logic around `seed_project_names()` returning `['default']` when environment variables are cleared, or update the test expectation.
   - Fix data isolation in `test_web_panel_routes` so the `GET /api/memories` call doesn't bleed data or duplicate the single post response.
2. **De-duplicate Test Files (High Priority)**:
   - Delete `tests/test_project_memory.py` as it is an exact copy of `tests/test_lance_memory.py`.
3. **Clean Up Unused Imports and Dead Variables (Medium Priority)**:
   - Remove `pathlib.Path`, `estimate_tokens`, and unused `e`/`exc` exception variables.
   - Remove the unused `scopes` variable in `memory.py`.
4. **Increase Test Coverage (Medium Priority)**:
   - Write unit tests for `src/lance_memory/api.py` and `src/lance_memory/mcp_server.py` to cover the FastAPI routes and the alternative MCP surface.
5. **Remove Legacy Hardcoded Paths (Low Priority)**:
   - Update `server/scripts/cutover_fresh_scaffold.sh` and `server/scripts/migrate_ast_symbols.py` to stop using hardcoded `/opt/eh-stack/app/arch_memory` paths and use relative dynamic paths or environment variables.
6. **Improve Documentation (Low Priority)**:
   - Add proper docstrings to functions and classes currently flagged by `pydocstyle`.
