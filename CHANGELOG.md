# Changelog

Earlier history is in the Git log. Versions follow `pyproject.toml`.

## Unreleased

### Added

- **Claude Code hooks** (`templates/hooks/`): load recent project memory at
  `SessionStart` and write a small unverified checkpoint at `PreCompact` and
  `SessionEnd`. Standard library only, fail-soft, read-only mode, project ID from
  `AGENTS.md` or the environment. Covered by `tests/test_hooks.py`.
- Security policy, code of conduct, contributing guide, issue and pull-request
  templates, and a CI workflow for the hook tests.
- CI workflow (`.github/workflows/ci.yml`) running the full Python suite and the web
  panel type-check and build.

- Hook checkpoints no longer pile up: a checkpoint is skipped when the workspace state is
  unchanged since the last one (`LANCE_MEMORY_HOOK_DEDUP=0` disables this), and session
  start shows real notes plus only the newest checkpoint.

### Changed

- README rewritten with a feature overview, quickstart, hooks section, layout and a
  development guide, including a note that the services have no built-in
  authentication.
- `LICENSE` is now the complete, unmodified Apache License 2.0 text (the previous copy
  was abridged), so GitHub and tooling recognize it.
- Package metadata (authors, keywords, classifiers, project URLs).

### Fixed

- Immutable memories now reject direct updates and deletes, including REST PATCH
  and DELETE requests. Batches skip protected rows and count successful operations;
  scoped deletion, linked cascades, automatic supersession, and low-level maintenance
  writes preserve them. Delete history now receives the row's project scope.
  ([#5](https://github.com/Flambeau-Phoenix/lance-mem0ry/issues/5), reported by
  [mattabate](https://github.com/mattabate))
- Memory IDs, scope values, entity names and project names are now escaped (and scope
  column names allow-listed) before they reach LanceDB filter strings. Previously a
  crafted ID such as `x' OR id != '` could widen a delete or update to every row in
  the table, bypassing the project check and immutable protection. Server admin
  category filters and the record-listing filters (`status`, `bucket`, `category`)
  in `server/memory_server.py` are escaped the same way.
- `server/init_project_memories.py` no longer seeds a `default` partition when
  `PROJECT_MEMORY_PROJECTS` is unset, matching the documented blank-slate install.
- `lance_memory.mcp_server` (the `lance-memory-mcp` entry point) imports on a fresh
  install: `mcp` 2.x removed `mcp.server.fastmcp`, so it now prefers standalone
  `fastmcp` and falls back to the old SDK path. Dependencies are pinned to the tested
  pairing (`mcp>=2,<3`, `fastmcp>=4.1.6,<5`); `fastmcp` 4 imports from `mcp` 2 without
  declaring it, so loose bounds could install a broken combination.
- Web panel: the server bundle builds again (`generateSyntheticVector` restored in
  `src/initialData.ts`), and the built server starts (it is now emitted as ESM,
  `dist/server.mjs`, because `import.meta.url` is empty in CommonJS output). In
  `App.tsx` the data loaders shadowed the imported API functions and called themselves
  instead of the API, `simulateMissingRequirement` was never imported, and a few status
  unions were too narrow. `npm run lint` passes.
- `pandas` and `requests` are now declared dependencies. `server/memory_server.py`
  imports `requests` and uses `to_pandas()` for recent listings, so a fresh install
  could not start the server or list recent memories. Streamlit is a new `admin` extra
  for the web console.

### Removed

- Stray scratch files from the repository root (`arch_memory_output.txt`,
  `audit_report.md`, `coverage_summary.txt`) and a duplicate test file
  (`tests/test_project_memory.py` was byte-identical to `tests/test_lance_memory.py`).
