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
- `server/init_project_memories.py` no longer seeds a `default` partition when
  `PROJECT_MEMORY_PROJECTS` is unset. This matches the documented blank-slate behavior
  and the existing `test_blank_initializer_does_not_seed_default`, which was failing.

### Removed

- Stray scratch files from the repository root (`arch_memory_output.txt`,
  `audit_report.md`, `coverage_summary.txt`) and a duplicate test file
  (`tests/test_project_memory.py` was byte-identical to `tests/test_lance_memory.py`).
