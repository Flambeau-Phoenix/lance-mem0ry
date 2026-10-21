# Contributing

Thanks for helping. By taking part you agree to the [code of conduct](CODE_OF_CONDUCT.md).

## Set up

Python 3.10+ is required.

```bash
git clone https://github.com/Flambeau-Phoenix/lance-mem0ry.git
cd lance-mem0ry
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
```

## Checks

```bash
pytest                        # full suite
pytest tests/test_hooks.py    # hook tests only; no LanceDB or Ollama needed
ruff check path/to/changed_file.py   # existing code has known findings; keep touched files clean
```

Please add or update tests with behavior changes, and keep the public tool surface at
exactly five tools: new capability should route through an existing tool's parameters.

## Guidelines

- Keep project partitioning and category governance intact: agents never invent project
  IDs or categories, and drafts are never stored as verified facts.
- Keep the hook script standard-library-only and fail-soft (always exit 0).
- No secrets, real memory databases, private hostnames or personal paths in commits.
  Use synthetic data (see `examples/`).
- Update the README, `docs/` and `CHANGELOG.md` for user-visible changes.

## Issues and pull requests

Describe the concrete problem, what you expected, versions (Python, LanceDB, Ollama) and
the smallest reproducer. For pull requests, say which checks you ran and which you could
not. Security problems go through [SECURITY.md](SECURITY.md), not public issues.
