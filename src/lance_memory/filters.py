"""Translate Mem0 filter grammar into LanceDB SQL-ish predicates."""
from __future__ import annotations
import json
from datetime import datetime
from typing import Any

_OPERATORS = {"eq", "ne", "gt", "gte", "lt", "lte", "in", "nin", "contains", "icontains"}
_LOGICAL = {"AND", "OR", "NOT"}
_TIMESTAMP_FIELDS = {"created_at", "updated_at", "expiration_date"}


def to_lance_where(filters: dict) -> str | None:
    if not filters:
        return None
    clauses: list[str] = []
    for key, value in filters.items():
        if key in _LOGICAL:
            clauses.append(_logical_clause(key, value))
        else:
            clauses.append(_field_clause(key, value))
    clauses = [c for c in clauses if c]
    return " AND ".join(clauses) if clauses else None


def _logical_clause(op: str, value: Any) -> str:
    if not isinstance(value, list):
        raise ValueError(f"{op} expects a list of clauses, got {type(value).__name__}")
    sub = [to_lance_where(v) for v in value]
    sub = [s for s in sub if s]
    if not sub:
        return ""
    if op == "NOT":
        joined = " OR ".join(f"({s})" for s in sub)
        return f"NOT ({joined})"
    joined = f" {op} ".join(f"({s})" for s in sub)
    return f"({joined})"


def _field_clause(field: str, value: Any) -> str:
    if isinstance(value, dict) and value and all(k in _OPERATORS for k in value):
        return _operator_clause(field, value)
    return _eq(field, value)


def _operator_clause(field: str, ops: dict) -> str:
    parts: list[str] = []
    for op, v in ops.items():
        if op not in _OPERATORS:
            raise ValueError(
                f"Unsupported operator '{op}' on field '{field}'. "
                f"Supported: {sorted(_OPERATORS)}"
            )
        parts.append(_apply_op(field, op, v))
    return " AND ".join(p for p in parts if p)


def _apply_op(field: str, op: str, v: Any) -> str:
    if op == "eq": return _eq(field, v)
    if op == "ne": return f"{field} != {_lit(v, field)}"
    if op == "gt": return f"{field} > {_lit(v, field)}"
    if op == "gte": return f"{field} >= {_lit(v, field)}"
    if op == "lt": return f"{field} < {_lit(v, field)}"
    if op == "lte": return f"{field} <= {_lit(v, field)}"
    if op == "in":
        if not isinstance(v, list):
            raise ValueError(f"'in' requires a list, got {type(v).__name__}")
        return f"{field} IN ({', '.join(_lit(x, field) for x in v)})"
    if op == "nin":
        if not isinstance(v, list):
            raise ValueError(f"'nin' requires a list, got {type(v).__name__}")
        return f"{field} NOT IN ({', '.join(_lit(x, field) for x in v)})"
    if op == "contains":
        return f"{field} LIKE '%{_escape(v)}%'"
    if op == "icontains":
        return f"LOWER({field}) LIKE LOWER('%{_escape(v)}%')"
    raise ValueError(f"Unhandled operator {op}")


def _eq(field: str, value: Any) -> str:
    if value == "*":
        return f"{field} IS NOT NULL"
    return f"{field} = {_lit(value, field)}"


def _lit(value: Any, field: str = "") -> str:
    if value is None: return "NULL"
    if isinstance(value, bool): return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)): return str(value)
    if isinstance(value, datetime):
        return f"to_timestamp('{value.isoformat()}')"
    if field in _TIMESTAMP_FIELDS and isinstance(value, str):
        return f"to_timestamp('{_escape(value)}')"
    if isinstance(value, (list, dict)):
        return "'" + _escape(json.dumps(value)) + "'"
    return "'" + _escape(str(value)) + "'"


def _escape(s: Any) -> str:
    return str(s).replace("'", "''")


def extract_scope(filters: dict) -> dict:
    flat = _flatten(filters)
    return {
        k: flat[k]
        for k in ("project_id", "user_id", "agent_id", "run_id", "app_id")
        if flat.get(k)
    }


def _flatten(filters: dict) -> dict:
    out: dict[str, Any] = {}
    for k, v in (filters or {}).items():
        if k in _LOGICAL and isinstance(v, list):
            for item in v:
                out.update(_flatten(item))
        elif k in ("project", "project_id", "user_id", "agent_id", "run_id", "app_id") and isinstance(v, str):
            out["project_id" if k == "project" else k] = v
    return out


def scope_key(filters_or_ids: dict) -> str:
    ids = extract_scope(filters_or_ids) if any(k in filters_or_ids for k in _LOGICAL) else filters_or_ids
    project = ids.get("project_id") or ids.get("project")
    if not project:
        raise ValueError("project is required")
    parts = [f"project_id={project}"]
    parts.extend(
        f"{k}={ids[k]}"
        for k in ("user_id", "agent_id", "run_id", "app_id")
        if ids.get(k)
    )
    return "|".join(parts)
