#!/usr/bin/env bash
set -euo pipefail
export PROJECT_MEMORIES_ROOT=${PROJECT_MEMORIES_ROOT:-/opt/lance-memory/project_memories}
export PROJECT_MEMORY=test_project_a
export PROJECT_MEMORY_PROJECTS=test_project_a,test_project_b
export OLLAMA_HOST=${OLLAMA_HOST:-http://127.0.0.1:11434}
ROOT=${LANCE_MEMORY_ROOT:-/opt/lance-memory}
cd "$ROOT"
PY=${LANCE_MEMORY_PYTHON:-$ROOT/.venv/bin/python}

echo "=== A. record_discovery verified fact + isolation ==="
$PY <<'PY'
from server.memory_server import record_discovery_impl, hybrid_search
out = record_discovery_impl(
    "Cutover smoke: FastMCP HTTP listens on 8768.",
    project="test_project_b",
    category="key_facts",
    verified=True,
    bucket="fact",
    tags=["smoke"],
)
print("wrote", out["memory_id"], out["project_id"])
hits = hybrid_search("FastMCP HTTP 8768", limit=3, project="test_project_b")
print("test_project_b_hits", len(hits), (hits[0]["text"][:60] if hits else None))
leak = hybrid_search("FastMCP HTTP 8768", limit=3, project="test_project_a")
print("test_project_a_leak", len(leak))
assert hits and "8768" in hits[0]["text"]
assert len(leak) == 0
print("PASS isolation")
PY

echo "=== B. verified/blueprint guardrail ==="
$PY <<'PY'
from server.memory_server import record_discovery_impl
try:
    record_discovery_impl(
        "draft plan",
        project="test_project_a",
        category="ongoing_tasks",
        verified=True,
        bucket="state",
    )
    raise SystemExit("FAIL: expected ValueError")
except ValueError as e:
    print("PASS guardrail", e)
draft = record_discovery_impl(
    "Evaluate cache layer",
    project="test_project_a",
    category="ongoing_tasks",
    verified=False,
    bucket="state",
)
assert draft["verified"] is False
print("PASS draft write", draft["memory_id"])
PY

echo "=== C. categories inspect action ==="
$PY <<'PY'
from server.memory_server import load_project_categories
cats = load_project_categories("test_project_a")
assert "key_facts" in cats
assert "ongoing_tasks" in cats
assert "description" in cats["key_facts"]
print("PASS categories discovery:", list(cats.keys()))
PY

echo "=== D. health after writes ==="
curl -fsS http://127.0.0.1:8768/health
echo

echo "=== E. admin import check ==="
$PY -c "from server.memory_server import VALID_ENTITY_TYPES, project_stats, rebuild_fts, invalidate_table; print('PASS admin helpers test_project_a:', project_stats('test_project_a')['rows'], 'test_project_b:', project_stats('test_project_b')['rows'])"

echo "ACCEPTANCE_OK"