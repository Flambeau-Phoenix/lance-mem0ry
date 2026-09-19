"""Lance Memory (lance-mem0ry) FastMCP — named project LanceDB + Ollama nomic-embed-text.

Durable Memory v2: the v1 columns (text/category/symbol/verified/created_at) are
retained verbatim because admin_app.py, admin_cli.py, and any external AST or
data-import scripts read them directly. v2 adds identity (memory_id),
lifecycle (status/supersedes_id) and scoping
(bucket/tags/agent_id/run_id/source_type) alongside them.

`content` is the v2 name for the stored `text` column. It is exposed on every
API response and accepted on write; it is not a second copy on disk.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional

import lancedb
import requests
from lancedb.pydantic import LanceModel, Vector
from pydantic import Field

try:
    from fastmcp import FastMCP
except ImportError:
    try:
        from mcp.server.fastmcp import FastMCP
    except ImportError:
        FastMCP = None  # type: ignore

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
EMBED_MODEL = "nomic-embed-text"
EMBED_DIM = 768
TABLE_NAME = "records"

_SCRIPT_DIR = Path(__file__).resolve().parent
# Tip default; Windows local DBs deprecated — always use PROJECT_MEMORIES_ROOT subdirs.
DEFAULT_MEMORIES_ROOT = Path(
    os.environ.get("PROJECT_MEMORIES_ROOT", "").strip()
    or str(_SCRIPT_DIR / "project_memories")
)

DEFAULT_PROJECT = os.environ.get("PROJECT_MEMORY", "").strip()
KNOWN_PROJECTS = tuple(
    name.strip()
    for name in os.environ.get("PROJECT_MEMORY_PROJECTS", "").split(",")
    if name.strip()
)
PROJECT_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$")

# Admin UI category slugs; legacy "general" still accepted.
MEMORY_CATEGORIES = (
    "key_facts",
    "ongoing_tasks",
    "session_handoff",
    "architectural_decisions",
    "hkx_hooks_and_targets",
    "verified_imgui_ui_elements",
    "imgui_structure",
    "solar_flare_design_decisions",
    "general",
)

# --- Durable Memory v2 vocabularies -----------------------------------------

BUCKETS = ("fact", "decision", "constraint", "preference", "procedure", "state")
DEFAULT_BUCKET = "fact"

STATUSES = ("active", "superseded", "deleted")
DEFAULT_STATUS = "active"

VALID_ENTITY_TYPES = (
    "Rule",
    "Directive",
    "Preference",
    "Hook",
    "UI Element",
    "Protocol",
    "State Schema",
    "Config",
    "General",
)

SOURCE_TYPES = ("agent", "user", "ast_index", "doc", "migration")
DEFAULT_SOURCE_TYPE = "agent"

# v1 category -> v2 bucket. Anything unmapped migrates to "fact"; the original
# category string is always preserved in tags so nothing is lost.
CATEGORY_BUCKET_MAP = {
    "key_facts": "fact",
    "architectural_decisions": "decision",
    "solar_flare_design_decisions": "decision",
    "ongoing_tasks": "state",
    "session_handoff": "state",
}

PROMOTE_CATEGORIES = ("key_facts", "architectural_decisions")

# Categories produced by the AST indexers rather than by an agent.
AST_CATEGORIES = {
    "code_symbol",
    "code_module",
    "code_function",
    "code_class",
    "code_method",
}


def bucket_for_category(category: str) -> str:
    cat = (category or "").strip()
    return CATEGORY_BUCKET_MAP.get(cat, DEFAULT_BUCKET)


def source_type_for_category(category: str) -> str:
    return "ast_index" if (category or "").strip() in AST_CATEGORIES else "agent"


def memories_root() -> Path:
    raw = os.environ.get("PROJECT_MEMORIES_ROOT", "").strip()
    if raw:
        return Path(raw)
    return Path(DEFAULT_MEMORIES_ROOT)


def project_paths() -> dict[str, Path]:
    """Discover project partitions beneath PROJECT_MEMORIES_ROOT."""
    root = memories_root()
    configured = set(KNOWN_PROJECTS)
    discovered = {p.name for p in root.iterdir() if p.is_dir()} if root.is_dir() else set()
    return {name: root / name for name in sorted(configured | discovered)}


def active_project() -> str:
    name = os.environ.get("PROJECT_MEMORY", DEFAULT_PROJECT).strip()
    if not name:
        raise ValueError("project is required (or set PROJECT_MEMORY)")
    return _validate_project_name(name)


def resolve_project(project: Optional[str] = None) -> str:
    """Prefer explicit tool `project` arg; fall back to PROJECT_MEMORY env."""
    if project is not None and str(project).strip():
        return _validate_project_name(str(project).strip())
    return active_project()


def project_db_path(project: Optional[str] = None) -> Path:
    return memories_root() / resolve_project(project)


def _validate_project_name(name: str) -> str:
    if not PROJECT_NAME_RE.fullmatch(name):
        raise ValueError(
            "project must be 1-128 characters using letters, numbers, '.', '_', or '-'"
        )
    return name


def _iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _new_memory_id() -> str:
    return uuid.uuid4().hex


def embed_text(text: str) -> list[float]:
    url = f"{OLLAMA_HOST}/api/embeddings"
    resp = requests.post(url, json={"model": EMBED_MODEL, "prompt": text}, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    vec = data.get("embedding")
    if not vec or len(vec) != EMBED_DIM:
        raise RuntimeError(
            f"Expected {EMBED_DIM}-dim embedding from {EMBED_MODEL}, got {len(vec) if vec else None}"
        )
    return list(vec)


class ArchitecturalMemory(LanceModel):
    # --- v1 columns (retained: external scripts read these by name) ---
    text: str
    category: str = "general"
    symbol: str = ""
    verified: bool = True
    created_at: str = Field(default_factory=_iso_now)
    # record_id/entity_type predate v2 and are populated on every legacy
    # row; the indexers write them. Retained so nothing is dropped.
    record_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    entity_type: str = "General"
    # --- v2 columns ---
    memory_id: str = Field(default_factory=_new_memory_id)
    project_id: str = ""
    bucket: str = DEFAULT_BUCKET
    tags: list[str] = Field(default_factory=list)
    agent_id: str = ""
    run_id: str = ""
    source_type: str = DEFAULT_SOURCE_TYPE
    source_ref: str = ""
    updated_at: str = Field(default_factory=_iso_now)
    status: str = DEFAULT_STATUS
    supersedes_id: str = ""
    vector: Vector(EMBED_DIM)


_tables: dict[str, Any] = {}


def _ensure_fts(table: Any) -> None:
    for field in ("text", "symbol"):
        try:
            table.create_fts_index(field, replace=True)
        except TypeError:
            try:
                table.create_fts_index(field)
            except Exception as e:
                print(f"Warning: FTS index ({field}): {e}", file=sys.stderr)
        except Exception as e:
            print(f"Warning: FTS index ({field}): {e}", file=sys.stderr)


def get_table(project: Optional[str] = None):
    proj = resolve_project(project)
    if proj in _tables:
        return _tables[proj]
    path = project_db_path(proj)
    path.mkdir(parents=True, exist_ok=True)
    db = lancedb.connect(str(path))
    listed = db.list_tables()
    names = set(listed.tables if hasattr(listed, "tables") else listed)
    # Fall back for older LanceDB builds that still expose table_names().
    if not names:
        try:
            names = set(db.table_names())
        except Exception:
            names = set()
    if TABLE_NAME not in names:
        table = db.create_table(TABLE_NAME, schema=ArchitecturalMemory)
        _ensure_fts(table)
    else:
        table = db.open_table(TABLE_NAME)
        _ensure_fts(table)
    _tables[proj] = table
    return table


def rebuild_fts(table: Any) -> dict[str, bool]:
    """Rebuild text/symbol FTS indexes. Used by admin_app and admin_cli."""
    _ensure_fts(table)
    return {"text": True, "symbol": True}


def invalidate_table(project: Optional[str] = None) -> None:
    """Drop a cached table handle so the next get_table() reopens it."""
    if project is None or not str(project).strip():
        _tables.clear()
        return
    _tables.pop(_validate_project_name(str(project).strip()), None)


def project_stats(project: Optional[str] = None) -> dict[str, Any]:
    """Partition ledger fields for admin_cli.audit_project / Streamlit."""
    proj = resolve_project(project)
    path = project_db_path(proj)
    disk_bytes = 0
    if path.exists():
        disk_bytes = sum(f.stat().st_size for f in path.rglob("*") if f.is_file())
    rows = 0
    indices: list[str] = []
    try:
        table = get_table(proj)
        rows = table.count_rows()
        indices = ["text", "symbol"]
    except Exception:
        pass
    return {
        "project": proj,
        "rows": rows,
        "disk_bytes": disk_bytes,
        "indices": indices,
        "schema_version": 2,
        "path": str(path),
    }


def table_columns(table: Any) -> set[str]:
    try:
        return set(table.schema.names)
    except Exception:
        return set()


def _row_public(row: dict) -> dict:
    """Public shape: v1 keys kept for existing callers, v2 keys added.

    `content` mirrors `text` — v2 name for the same stored column.
    """
    text = row.get("text", "")
    tags = row.get("tags") or []
    try:
        tags = [str(t) for t in tags]
    except Exception:
        tags = []
    return {
        # v1
        "text": text,
        "category": row.get("category", ""),
        "symbol": row.get("symbol", ""),
        "verified": row.get("verified", True),
        "created_at": row.get("created_at", ""),
        # v2
        "content": text,
        "memory_id": row.get("memory_id", ""),
        "record_id": row.get("record_id", ""),
        "entity_type": row.get("entity_type", ""),
        "project_id": row.get("project_id", ""),
        "bucket": row.get("bucket", ""),
        "tags": tags,
        "agent_id": row.get("agent_id", ""),
        "run_id": row.get("run_id", ""),
        "source_type": row.get("source_type", ""),
        "source_ref": row.get("source_ref", ""),
        "updated_at": row.get("updated_at", ""),
        "status": row.get("status", ""),
        "supersedes_id": row.get("supersedes_id", ""),
    }


# --- Retrieval v2 -----------------------------------------------------------


def _sql_str(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def build_predicate(
    cols: set[str],
    buckets: Optional[Iterable[str]] = None,
    agent_id: str = "",
    run_id: str = "",
    status: Optional[str] = DEFAULT_STATUS,
) -> str:
    """SQL prefilter. Silently drops clauses for columns a table lacks, so a
    table still on the v1 schema keeps answering queries."""
    clauses: list[str] = []
    if status and "status" in cols:
        clauses.append(f"status = {_sql_str(status)}")
    if buckets and "bucket" in cols:
        vals = ", ".join(_sql_str(b) for b in buckets)
        if vals:
            clauses.append(f"bucket IN ({vals})")
    if agent_id and "agent_id" in cols:
        clauses.append(f"agent_id = {_sql_str(agent_id)}")
    if run_id and "run_id" in cols:
        clauses.append(f"run_id = {_sql_str(run_id)}")
    return " AND ".join(clauses)


def _apply_where(query: Any, predicate: str) -> Any:
    if not predicate:
        return query
    try:
        return query.where(predicate, prefilter=True)
    except TypeError:
        return query.where(predicate)


def _tag_match(row: dict, tags: Optional[Iterable[str]]) -> bool:
    if not tags:
        return True
    have = {str(t) for t in (row.get("tags") or [])}
    return bool(have.intersection({str(t) for t in tags}))


def _row_key(row: dict) -> tuple:
    mid = row.get("memory_id")
    if mid:
        return ("id", mid)
    return ("txt", row.get("text"), row.get("symbol"), row.get("created_at"))


def recall_impl(
    query: str,
    project: Optional[str] = None,
    buckets: Optional[Iterable[str]] = None,
    agent_id: str = "",
    run_id: str = "",
    tags: Optional[Iterable[str]] = None,
    limit: int = 8,
    status: Optional[str] = DEFAULT_STATUS,
) -> list[dict]:
    """Conservative pipeline: project -> status -> metadata filters -> vector
    retrieval -> optional keyword boost -> top N. No graph, no reranker."""
    table = get_table(project)
    cols = table_columns(table)
    predicate = build_predicate(
        cols, buckets=buckets, agent_id=agent_id, run_id=run_id, status=status
    )
    # Overfetch so the python-side tag filter still has candidates to work with.
    fetch = max(limit * 4, limit) if tags else limit * 2

    vec = embed_text(query)
    try:
        vec_hits = _apply_where(table.search(vec), predicate).limit(fetch).to_list()
    except Exception as e:
        print(f"Warning: vector search failed: {e}", file=sys.stderr)
        vec_hits = []

    # Optional keyword boost: rows matching FTS as well as vector rank higher.
    try:
        fts_hits = (
            _apply_where(table.search(query, query_type="fts"), predicate)
            .limit(fetch)
            .to_list()
        )
    except Exception:
        fts_hits = []

    fts_keys = {_row_key(r) for r in fts_hits}

    merged: list[dict] = []
    seen: set = set()
    for row in vec_hits + fts_hits:
        key = _row_key(row)
        if key in seen:
            continue
        seen.add(key)
        if not _tag_match(row, tags):
            continue
        merged.append(row)

    # Stable boost: keyword-confirmed hits first, original order preserved.
    boosted = [r for r in merged if _row_key(r) in fts_keys]
    rest = [r for r in merged if _row_key(r) not in fts_keys]
    return [_row_public(r) for r in (boosted + rest)[:limit]]


def hybrid_search(query: str, limit: int = 5, project: Optional[str] = None) -> list[dict]:
    """v1 entry point — unchanged contract, now status-aware."""
    return recall_impl(query, project=project, limit=limit)


def assert_write_allowed(project: Optional[str] = None) -> str:
    """Autonomous agent access: resolves target project partition.

    Agents actively read and write the explicitly selected project partition.
    """
    return resolve_project(project)

def record_discovery_impl(
    text: str,
    symbol: str = "",
    category: str = "general",
    project: Optional[str] = None,
    verified: bool = True,
    bucket: str = "",
    tags: Optional[Iterable[str]] = None,
    agent_id: str = "",
    run_id: str = "",
    source_type: str = "",
    source_ref: str = "",
    supersedes_id: str = "",
    entity_type: str = "General",
) -> dict:
    proj = assert_write_allowed(project)
    table = get_table(proj)
    cat = category or "general"

    buck = (bucket or "").strip() or bucket_for_category(cat)
    if buck not in BUCKETS:
        raise ValueError(f"bucket={buck!r} not in {BUCKETS}")
    # Verified vs blueprint guardrail — drafts cannot be stored as ratified facts.
    if verified and cat == "ongoing_tasks":
        raise ValueError("ongoing_tasks must use verified=False")
    if verified and buck == "state" and cat != "session_handoff":
        raise ValueError("verified=True cannot use bucket='state' except session_handoff")
    if not verified and buck != "state":
        raise ValueError("unverified memories must use bucket='state'")
    src = (source_type or "").strip() or source_type_for_category(cat)
    if src not in SOURCE_TYPES:
        raise ValueError(f"source_type={src!r} not in {SOURCE_TYPES}")

    tag_list = [str(t) for t in (tags or []) if str(t).strip()]
    if cat and cat not in tag_list:
        tag_list.append(cat)

    now = _iso_now()
    vec = embed_text(text)
    rec = {
        "text": text,
        "category": cat,
        "symbol": symbol or "",
        "verified": bool(verified),
        "created_at": now,
        # table.add() takes a raw dict, so LanceModel defaults do not fire here.
        "record_id": str(uuid.uuid4()),
        "entity_type": entity_type or "General",
        "memory_id": _new_memory_id(),
        "project_id": proj,
        "bucket": buck,
        "tags": tag_list,
        "agent_id": agent_id or "",
        "run_id": run_id or "",
        "source_type": src,
        "source_ref": source_ref or "",
        "updated_at": now,
        "status": DEFAULT_STATUS,
        "supersedes_id": supersedes_id or "",
        "vector": vec,
    }
    table.add([rec])

    # Writing a replacement retires the row it supersedes.
    if supersedes_id:
        try:
            set_status_impl(supersedes_id, "superseded", project=proj)
        except Exception as e:
            print(f"Warning: could not mark {supersedes_id} superseded: {e}", file=sys.stderr)

    try:
        _ensure_fts(table)
    except Exception:
        pass
    out = _row_public(rec)
    if cat not in MEMORY_CATEGORIES:
        out["category_warning"] = f"category {cat!r} not in MEMORY_CATEGORIES"
    return out


def set_status_impl(
    memory_id: str, status: str, project: Optional[str] = None
) -> dict:
    """Lifecycle transition. Retrieval only returns status='active'."""
    if status not in STATUSES:
        raise ValueError(f"status={status!r} not in {STATUSES}")
    proj = assert_write_allowed(project)
    table = get_table(proj)
    if "status" not in table_columns(table):
        raise RuntimeError(f"project {proj} table has no status column; run the v2 migration")
    table.update(
        where=f"memory_id = {_sql_str(memory_id)}",
        values={"status": status, "updated_at": _iso_now()},
    )
    return {"memory_id": memory_id, "status": status, "project": proj}


def get_active_row_impl(memory_id: str, project: Optional[str] = None) -> dict:
    """Load one active row by memory_id, falling back to record_id."""
    proj = resolve_project(project)
    table = get_table(proj)
    cols = table_columns(table)
    mid = (memory_id or "").strip()
    if not mid:
        raise ValueError("memory_id is required")
    safe = _sql_str(mid)
    clauses: list[str] = []
    if "memory_id" in cols:
        clauses.append(f"memory_id = {safe}")
    if "record_id" in cols:
        clauses.append(f"record_id = {safe}")
    if not clauses:
        raise RuntimeError(f"project {proj} table has no memory_id/record_id columns")
    where = "(" + " OR ".join(clauses) + ")"
    if "status" in cols:
        where = f"({where}) AND status = 'active'"
    rows = table.search().where(where).limit(5).to_list()
    if not rows:
        raise ValueError(f"active memory {mid!r} not found in project {proj}")
    return rows[0]


def update_record_impl(
    memory_id: str,
    patch_data: dict,
    project: Optional[str] = None,
) -> dict:
    """Update an existing record in the primary 'records' table."""
    proj = assert_write_allowed(project)
    table = get_table(proj)
    existing = get_active_row_impl(memory_id, project=proj)
    
    values: dict[str, Any] = {"updated_at": _iso_now()}
    if "text" in patch_data and patch_data["text"] is not None:
        new_text = str(patch_data["text"]).strip()
        if new_text:
            values["text"] = new_text
            values["vector"] = embed_text(new_text)

    if "category" in patch_data and patch_data["category"] is not None:
        cat = str(patch_data["category"]).strip()
        values["category"] = cat
        curr_tags = list(existing.get("tags") or [])
        if cat and cat not in curr_tags:
            curr_tags.append(cat)
            values["tags"] = curr_tags

    if "bucket" in patch_data and patch_data["bucket"] is not None:
        b = str(patch_data["bucket"]).strip()
        if b not in BUCKETS:
            raise ValueError(f"bucket={b!r} not in {BUCKETS}")
        values["bucket"] = b

    if "verified" in patch_data and patch_data["verified"] is not None:
        values["verified"] = bool(patch_data["verified"])

    if "symbol" in patch_data and patch_data["symbol"] is not None:
        values["symbol"] = str(patch_data["symbol"]).strip()

    if "tags" in patch_data and patch_data["tags"] is not None:
        tag_list = [str(t) for t in patch_data["tags"] if str(t).strip()]
        values["tags"] = tag_list

    if "status" in patch_data and patch_data["status"] is not None:
        st = str(patch_data["status"]).strip()
        if st not in STATUSES:
            raise ValueError(f"status={st!r} not in {STATUSES}")
        values["status"] = st

    if "entity_type" in patch_data and patch_data["entity_type"] is not None:
        values["entity_type"] = str(patch_data["entity_type"]).strip()

    mid_safe = _sql_str(memory_id)
    table.update(
        where=f"memory_id = {mid_safe} OR record_id = {mid_safe}",
        values=values,
    )
    if "text" in values:
        try:
            _ensure_fts(table)
        except Exception:
            pass

    updated = dict(existing)
    updated.update(values)
    return _row_public(updated)


def purge_project_impl(project: Optional[str] = None) -> dict:
    """Purge all records in a project partition."""
    proj = assert_write_allowed(project)
    table = get_table(proj)
    count = table.count_rows()
    try:
        table.delete("1=1")
    except Exception:
        p = project_db_path(proj)
        db = lancedb.connect(str(p))
        try:
            db.drop_table(TABLE_NAME)
        except Exception:
            pass
        invalidate_table(proj)
        get_table(proj)
    invalidate_table(proj)
    return {"project": proj, "purged_records": count, "status": "purged"}


def promote_to_fact_impl(
    memory_id: str,
    project: str,
    category: str = "key_facts",
    text: str = "",
    symbol: str = "",
    evidence: str = "",
) -> dict:
    """Graduate an unverified WIP/state memory into a verified fact or decision.

    Supersedes the source row via record_discovery_impl(supersedes_id=...).
    """
    cat = (category or "key_facts").strip()
    if cat not in PROMOTE_CATEGORIES:
        raise ValueError(
            f"category must be one of {PROMOTE_CATEGORIES}, got {cat!r}"
        )
    src = get_active_row_impl(memory_id, project=project)
    src_public = _row_public(src)
    src_mid = (src_public.get("memory_id") or "").strip() or memory_id.strip()
    src_cat = (src_public.get("category") or "").strip()
    src_bucket = (src_public.get("bucket") or "").strip()
    src_verified = bool(src_public.get("verified", False))

    if src_verified and src_cat in PROMOTE_CATEGORIES:
        raise ValueError(
            f"memory {src_mid} is already a verified {src_cat}; nothing to promote"
        )
    if src_verified:
        raise ValueError(
            f"memory {src_mid} is already verified (category={src_cat!r}, "
            f"bucket={src_bucket!r}); refuse promote"
        )
    # Unverified drafts only (ongoing_tasks / state / other verified=false rows).

    body = (text or "").strip() or (src_public.get("text") or "").strip()
    if not body:
        raise ValueError("promote requires non-empty text (source or rewrite)")
    if (evidence or "").strip():
        body = f"{body}\nEvidence: {evidence.strip()}"

    tags = ["promoted"]
    if src_cat:
        tags.append(src_cat)
    new_row = record_discovery_impl(
        body,
        symbol=(symbol or "").strip() or (src_public.get("symbol") or ""),
        category=cat,
        project=project,
        verified=True,
        bucket="",
        tags=tags,
        source_type="agent",
        supersedes_id=src_mid,
        entity_type=src_public.get("entity_type") or "General",
    )
    return {
        "ok": True,
        "new_memory": new_row,
        "superseded_id": src_mid,
        "project": resolve_project(project),
        "from_category": src_cat,
        "to_category": cat,
    }


def search_by_symbol_impl(
    symbol: str, limit: int = 5, project: Optional[str] = None
) -> list[dict]:
    table = get_table(project)
    cols = table_columns(table)
    active = "status = 'active'" if "status" in cols else ""
    safe = _sql_str(symbol)
    where = f"symbol = {safe}" + (f" AND {active}" if active else "")
    try:
        rows = table.search().where(where).limit(limit).to_list()
        if rows:
            return [_row_public(r) for r in rows]
    except Exception:
        pass
    try:
        rows = table.search(symbol, query_type="fts").limit(limit * 3).to_list()
        filtered = [
            r
            for r in rows
            if (r.get("symbol") or "") == symbol
            and (not active or r.get("status", "active") == "active")
        ][:limit]
        if filtered:
            return [_row_public(r) for r in filtered]
    except Exception:
        pass
    try:
        df = table.to_pandas()
        matched = df[df["symbol"] == symbol]
        if active and "status" in df.columns:
            matched = matched[matched["status"] == "active"]
        return [_row_public(r) for r in matched.head(limit).to_dict(orient="records")]
    except Exception as e:
        return [{"error": str(e)}]


def list_recent_impl(limit: int = 10, project: Optional[str] = None) -> list[dict]:
    table = get_table(project)
    try:
        df = table.to_pandas()
        if "status" in df.columns:
            df = df[df["status"] == "active"]
        if "created_at" in df.columns:
            df = df.sort_values("created_at", ascending=False)
        rows = df.head(limit).to_dict(orient="records")
        return [_row_public(r) for r in rows]
    except Exception as e:
        return [{"error": str(e)}]


_PROJECT_DOC = "Any project name you choose (defaults to PROJECT_MEMORY env)"


def _health_payload() -> dict:
    projects_data = []
    total = 0
    for name in project_paths():
        try:
            p_db = lancedb.connect(str(project_db_path(name)))
            tbl = p_db.open_table(TABLE_NAME)
            cnt = tbl.count_rows()
        except Exception:
            cnt = 0
        projects_data.append({"project": name, "rows": cnt})
        total += cnt
    return {
        "ok": True,
        "status": "healthy",
        "projects": projects_data,
        "total_rows": total,
        "embedder": f"ollama/{EMBED_MODEL} ({EMBED_DIM}-dim)",
        "harness": "active",
    }


def _format_handoff_text(text: str, metadata: dict) -> str:
    """Build session_handoff body; `text` is the summary."""
    parts = [(text or "").strip()]
    for key, label in (
        ("shipped", "Shipped"),
        ("open_items", "Open"),
        ("paths", "Paths"),
        ("restart_steps", "Restart"),
        ("unverified_risks", "Unverified risks"),
        ("reason", "Reason"),
    ):
        val = str(metadata.get(key, "") or "").strip()
        if val:
            parts.append(f"{label}: {val}")
    body = "\n".join(p for p in parts if p)
    if not body.strip():
        raise ValueError("handoff summary/text is required")
    return body


def build_mcp():
    if FastMCP is None:
        raise RuntimeError("fastmcp not installed")
    mcp = FastMCP("lance-memory")

    # --- Custom HTTP Route for lightweight client health checks ---
    @mcp.custom_route("/health", methods=["GET"])
    async def health_endpoint(request):
        from starlette.responses import JSONResponse
        return JSONResponse(_health_payload())

    # --- LanceMemory & Session Engine (internal; not exposed as MCP tools) ---
    from lance_memory.memory import LanceMemory
    from lance_memory.session import SessionMemory
    from lance_memory.harness import MaintenanceHarness

    _lance_instances: dict[str, LanceMemory] = {}
    _sessions: dict[str, SessionMemory] = {}

    def _get_lm(p_name: Optional[str] = None) -> LanceMemory:
        p = resolve_project(p_name)
        if p not in _lance_instances:
            p_path = str(project_db_path(p))
            prov = os.environ.get("ARCH_MEMORY_LLM_PROVIDER", os.environ.get("LANCE_MEMORY_LLM_PROVIDER", "openai"))
            cfg = {
                "vector_store": {
                    "config": {
                        "uri": p_path,
                        "table": "memories",
                        "embedding_model_dims": EMBED_DIM,
                    }
                },
                "embedder": {
                    "provider": "ollama",
                    "config": {
                        "model": EMBED_MODEL,
                        "dims": EMBED_DIM,
                        "host": OLLAMA_HOST,
                    },
                },
                "llm": {
                    "provider": prov,
                    "config": {
                        "base_url": os.environ.get("EXTRACTION_LLM_URL", "http://127.0.0.1:8080/v1"),
                        "model": os.environ.get("EXTRACTION_LLM_MODEL", "local-model"),
                        "api_key": os.environ.get("EXTRACTION_LLM_API_KEY", "dummy"),
                    },
                },
                "llm_available": bool(os.environ.get("EXTRACTION_LLM_URL")),
            }
            _lance_instances[p] = LanceMemory(cfg)
        return _lance_instances[p]

    # --- Consolidated 5-tool MCP surface ---

    @mcp.tool()
    def recall(
        project_id: str,
        query: str = "",
        search_type: str = "semantic",
        filters: Optional[dict] = None,
        limit: int = 8,
    ) -> list[dict]:
        """Query or browse project memories.

        search_type: semantic | symbol | recent | id
        filters: bucket/buckets, tags, agent_id, run_id, verified, memory_id
        """
        filt = dict(filters or {})
        st = (search_type or "semantic").strip().lower()
        proj = project_id or ""

        if st == "symbol":
            if not (query or "").strip():
                raise ValueError("query (symbol name) is required for search_type=symbol")
            return search_by_symbol_impl(query.strip(), limit=limit, project=proj)

        if st == "id":
            mid = (query or "").strip() or str(filt.get("memory_id") or "").strip()
            if not mid:
                raise ValueError("query or filters.memory_id required for search_type=id")
            return [_row_public(get_active_row_impl(mid, project=proj))]

        if st == "recent":
            mid = str(filt.get("memory_id") or "").strip()
            if mid:
                return [_row_public(get_active_row_impl(mid, project=proj))]
            rows = list_recent_impl(limit=limit, project=proj)
        elif st == "semantic":
            buckets = filt.get("buckets")
            if buckets is None and filt.get("bucket"):
                buckets = [filt["bucket"]]
            if buckets:
                bad = [b for b in buckets if b not in BUCKETS]
                if bad:
                    raise ValueError(f"unknown buckets {bad}; valid: {list(BUCKETS)}")
            if not (query or "").strip():
                raise ValueError("query is required for search_type=semantic")
            rows = recall_impl(
                query.strip(),
                project=proj,
                buckets=buckets,
                agent_id=str(filt.get("agent_id") or ""),
                run_id=str(filt.get("run_id") or ""),
                tags=filt.get("tags"),
                limit=limit,
            )
        else:
            raise ValueError(
                f"unknown search_type={search_type!r}; use semantic|symbol|recent|id"
            )

        if "verified" in filt and filt["verified"] is not None:
            want = bool(filt["verified"])
            rows = [r for r in rows if bool(r.get("verified", False)) is want]
        return rows

    @mcp.tool()
    def commit_memory(
        project_id: str,
        text: str,
        type: str = "discovery",
        metadata: Optional[dict] = None,
    ) -> dict:
        """Store discoveries, milestone handoffs, or promote WIP to verified facts.

        type: discovery | handoff | promotion
        """
        meta = dict(metadata or {})
        ctype = (type or "discovery").strip().lower()
        proj = project_id

        if ctype == "discovery":
            return record_discovery_impl(
                text,
                symbol=str(meta.get("symbol") or ""),
                category=str(meta.get("category") or "general"),
                project=proj,
                verified=bool(meta["verified"]) if "verified" in meta else True,
                bucket=str(meta.get("bucket") or ""),
                tags=meta.get("tags"),
                agent_id=str(meta.get("agent_id") or ""),
                run_id=str(meta.get("run_id") or ""),
                source_type=str(meta.get("source_type") or ""),
                source_ref=str(meta.get("source_ref") or ""),
                supersedes_id=str(meta.get("supersedes_id") or ""),
                entity_type=str(meta.get("entity_type") or "General"),
            )

        if ctype == "handoff":
            body = _format_handoff_text(text, meta)
            return record_discovery_impl(
                body,
                project=proj,
                category="session_handoff",
                verified=False,
                bucket="state",
                tags=["handoff", "session_handoff"],
                source_type="agent",
                entity_type="General",
            )

        if ctype == "promotion":
            sid = str(meta.get("supersedes_id") or "").strip()
            if not sid:
                raise ValueError("metadata.supersedes_id is required for type=promotion")
            return promote_to_fact_impl(
                sid,
                project=proj,
                category=str(meta.get("category") or "key_facts"),
                text=(text or "").strip(),
                symbol=str(meta.get("symbol") or ""),
                evidence=str(meta.get("evidence") or ""),
            )

        raise ValueError(f"unknown type={type!r}; use discovery|handoff|promotion")

    @mcp.tool()
    def modify_memory(
        project_id: str,
        memory_id: str,
        action: str,
        patch_data: Optional[dict] = None,
    ) -> dict:
        """Mutate or lifecycle-update long-term memories.

        action: update | delete | archive | purge
        """
        patch = dict(patch_data or {})
        act = (action or "").strip().lower()
        proj = project_id
        mid = (memory_id or "").strip()

        if act == "purge":
            confirm = bool(patch.get("confirm", False))
            if not confirm:
                raise ValueError(
                    "modify_memory action=purge requires patch_data.confirm=True "
                    "(this deletes all records in the project partition)"
                )
            return {
                "action": "purge",
                "result": purge_project_impl(proj),
            }

        if not mid:
            raise ValueError("memory_id is required unless action=purge")

        if act == "update":
            return {
                "action": "update",
                "result": update_record_impl(mid, patch, project=proj),
            }

        if act == "delete":
            return {
                "action": "delete",
                "result": set_status_impl(mid, "deleted", project=proj),
            }

        if act == "archive":
            return {
                "action": "archive",
                "result": set_status_impl(mid, "superseded", project=proj),
            }

        raise ValueError(f"unknown action={action!r}; use update|delete|archive|purge")

    @mcp.tool()
    def sync_session_buffer(
        project_id: str,
        action: str,
        turn_data: Optional[dict] = None,
    ) -> dict:
        """Working-memory session buffer: begin | read | write | flush."""
        data = dict(turn_data or {})
        act = (action or "").strip().lower()
        proj = resolve_project(project_id)

        if act == "begin":
            lm = _get_lm(proj)
            sid = str(data.get("session_id") or uuid.uuid4())
            _sessions[sid] = SessionMemory(
                project=proj,
                user_id=data.get("user_id"),
                agent_id=data.get("agent_id"),
                run_id=data.get("run_id"),
                long_term=lm,
                max_turns=int(data.get("max_turns") or 10),
            )
            _sessions[sid].begin_turn()
            return {"session_id": sid, "project": proj, "status": "initialized"}

        sid = str(data.get("session_id") or "").strip()
        if not sid:
            raise ValueError("turn_data.session_id is required for read/write/flush")
        if sid not in _sessions:
            raise ValueError(f"Unknown session: {sid}")

        if act == "read":
            return _sessions[sid].read(
                query=str(data.get("query") or data.get("user_message") or ""),
                top_k=int(data.get("top_k") or 5),
            )

        if act == "write":
            return _sessions[sid].write(
                user_message=data.get("user_message"),
                assistant_response=data.get("assistant_response"),
                tool_calls=data.get("tool_calls"),
            )

        if act == "flush":
            packet = _sessions[sid].handoff(reason=str(data.get("reason") or "session_end"))
            del _sessions[sid]
            flushed_ids = []
            facts = packet.get("facts") or []
            summary = packet.get("summary") or ""
            for fact in facts:
                if isinstance(fact, str) and fact.strip():
                    rec = record_discovery_impl(
                        fact.strip(),
                        project=proj,
                        category="key_facts",
                        verified=True,
                        bucket="fact",
                        tags=["session_extracted"],
                        source_type="agent",
                    )
                    flushed_ids.append(rec.get("memory_id"))
            if summary:
                rec_handoff = record_discovery_impl(
                    f"Session handoff: {summary}",
                    project=proj,
                    category="session_handoff",
                    verified=False,
                    bucket="state",
                    tags=["handoff", "session_handoff"],
                    source_type="agent",
                )
                flushed_ids.append(rec_handoff.get("memory_id"))
            return {
                "status": "flushed_to_long_term",
                "packet": packet,
                "records_committed": len(flushed_ids),
                "committed_ids": flushed_ids,
            }

        raise ValueError(f"unknown action={action!r}; use begin|read|write|flush")

    @mcp.tool()
    def inspect_memory_system(
        action: str,
        project_id: str = "",
        target_id: str = "",
    ) -> dict:
        """Admin checks: health | stats | maintenance_scan | history."""
        act = (action or "health").strip().lower()

        if act == "health":
            return _health_payload()

        if act == "stats":
            proj = resolve_project(project_id or None)
            try:
                p_db = lancedb.connect(str(project_db_path(proj)))
                tbl = p_db.open_table(TABLE_NAME)
                cnt = tbl.count_rows()
                active_cnt = len(tbl.search().where("status = 'active'").limit(10_000).to_list())
            except Exception as e:
                return {"project": proj, "error": str(e)}
            return {
                "project": proj,
                "total_rows": cnt,
                "active_rows": active_cnt,
                "status": "healthy",
            }

        if act == "maintenance_scan":
            proj = resolve_project(project_id)
            table = get_table(proj)
            active_rows = table.search().where("status = 'active'").limit(1000).to_list()
            duplicates = []
            threshold = float((filters or {}).get("threshold", 0.03) if "filters" in locals() else 0.03)
            import numpy as np
            for i in range(len(active_rows)):
                v_i = active_rows[i].get("vector")
                if v_i is None:
                    continue
                v_i = np.array(v_i, dtype=float)
                norm_i = np.linalg.norm(v_i)
                if norm_i == 0:
                    continue
                for j in range(i + 1, len(active_rows)):
                    v_j = active_rows[j].get("vector")
                    if v_j is None:
                        continue
                    v_j = np.array(v_j, dtype=float)
                    norm_j = np.linalg.norm(v_j)
                    if norm_j == 0:
                        continue
                    cos_sim = float(np.dot(v_i, v_j) / (norm_i * norm_j))
                    cos_dist = 1.0 - cos_sim
                    if cos_dist <= threshold:
                        duplicates.append({
                            "id_a": active_rows[i].get("memory_id") or active_rows[i].get("record_id"),
                            "text_a": active_rows[i].get("text"),
                            "id_b": active_rows[j].get("memory_id") or active_rows[j].get("record_id"),
                            "text_b": active_rows[j].get("text"),
                            "cosine_distance": cos_dist,
                        })
            return {
                "project": proj,
                "duplicates": duplicates,
                "active_rows_scanned": len(active_rows),
                "status": "completed",
            }

        if act == "history":
            tid = (target_id or "").strip()
            if not tid:
                raise ValueError("target_id is required for action=history")
            proj = resolve_project(project_id)
            lm = _get_lm(proj)
            return {"memory_id": tid, "history": lm.history(tid, project=proj)}

        raise ValueError(
            f"unknown action={action!r}; use health|stats|maintenance_scan|history"
        )

    skills_root = _SCRIPT_DIR / "skills"

    if skills_root.is_dir():
        try:
            from fastmcp.server.providers.skills import SkillsDirectoryProvider

            mcp.add_provider(
                SkillsDirectoryProvider(roots=skills_root, reload=True)
            )
        except Exception as exc:
            print(f"Warning: skills provider not loaded: {exc}", file=sys.stderr)

    return mcp


def cli_test_add(text: str, symbol: str = "", project: Optional[str] = None) -> None:
    proj = resolve_project(project)
    print(f"project={proj} db={project_db_path(proj)}")
    out = record_discovery_impl(text, symbol=symbol, category="test", project=proj)
    print("OK added:", out)


def cli_test_search(query: str, project: Optional[str] = None) -> None:
    proj = resolve_project(project)
    print(f"project={proj} db={project_db_path(proj)}")
    hits = hybrid_search(query, limit=5, project=proj)
    print(f"OK search ({len(hits)} hits):")
    for i, h in enumerate(hits, 1):
        t = (h.get("text") or "")[:120]
        print(f"  {i}. [{h.get('symbol')}] {t}")


def main(argv: Optional[list[str]] = None) -> None:
    argv = list(sys.argv[1:] if argv is None else argv)
    if argv and argv[0] in ("test-add", "test-search"):
        parser = argparse.ArgumentParser(description="Architectural memory CLI")
        sub = parser.add_subparsers(dest="cmd", required=True)
        p_add = sub.add_parser("test-add")
        p_add.add_argument("text")
        p_add.add_argument("--symbol", default="")
        p_add.add_argument("--project", default="")
        p_search = sub.add_parser("test-search")
        p_search.add_argument("query")
        p_search.add_argument("--project", default="")
        args = parser.parse_args(argv)
        if args.cmd == "test-add":
            cli_test_add(args.text, symbol=args.symbol, project=args.project or None)
        else:
            cli_test_search(args.query, project=args.project or None)
        return

    mcp = build_mcp()
    transport = os.environ.get(
        "LANCE_MEMORY_TRANSPORT",
        os.environ.get("ARCH_MEMORY_TRANSPORT", "http")
    ).strip().lower() or "http"
    host = os.environ.get(
        "LANCE_MEMORY_HOST",
        os.environ.get("ARCH_MEMORY_HOST", "0.0.0.0")
    ).strip() or "0.0.0.0"
    port = int(
        os.environ.get("LANCE_MEMORY_PORT", os.environ.get("ARCH_MEMORY_PORT", "8768"))
        or "8768"
    )
    if not hasattr(mcp, "run"):
        raise RuntimeError("FastMCP instance has no run()")
    if transport == "stdio":
        print(f"Starting lance-memory stdio (default project={active_project()})", file=sys.stderr)
        mcp.run(transport="stdio")
    elif transport in ("http", "streamable-http"):
        print(
            f"Starting lance-memory streamable HTTP on http://{host}:{port}/mcp "
            f"(default project={active_project()}, root={memories_root()})",
            file=sys.stderr,
        )
        mcp.run(transport=transport, host=host, port=port)
    elif transport == "sse":
        print(
            f"Starting lance-memory SSE on http://{host}:{port}/sse "
            f"(default project={active_project()}, root={memories_root()})",
            file=sys.stderr,
        )
        mcp.run(transport=transport, host=host, port=port)
    else:
        raise ValueError(
            "LANCE_MEMORY_TRANSPORT / ARCH_MEMORY_TRANSPORT must be stdio, sse, http, or streamable-http; "
            f"got {transport!r}"
        )


if __name__ == "__main__":
    main()
