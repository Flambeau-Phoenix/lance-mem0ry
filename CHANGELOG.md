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

- `pandas` and `requests` are now declared dependencies. `server/memory_server.py`
  imports `requests` and uses `to_pandas()` for recent listings, so a fresh install
  could not start the server or list recent memories. Streamlit is a new `admin` extra
  for the web console.

### Removed

- Stray scratch files from the repository root (`arch_memory_output.txt`,
  `audit_report.md`, `coverage_summary.txt`) and a duplicate test file
  (`tests/test_project_memory.py` was byte-identical to `tests/test_lance_memory.py`).

### Known issues

- `test_blank_initializer_does_not_seed_default` fails: `server/init_project_memories.py`
  still seeds a `default` partition when `PROJECT_MEMORY_PROJECTS` is unset, while the
  docs, `.env.example` and the agent charter describe a blank slate. Left unchanged
  deliberately; the docs and the code need to be reconciled one way or the other.
- The web panel's server bundle (`npm run build` in `web-panel/`) fails because
  `server.ts` imports `generateSyntheticVector`, which `src/initialData.ts` no longer
  exports. The Vite client build is unaffected.
