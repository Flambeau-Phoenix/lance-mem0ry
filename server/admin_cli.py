#!/usr/bin/env python3
"""SSH-friendly administration and recovery CLI for architectural memory."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import lancedb

sys.path.insert(0, str(Path(__file__).resolve().parent))
from memory_server import (  # noqa: E402
    ArchitecturalMemory,
    EMBED_DIM,
    EMBED_MODEL,
    KNOWN_PROJECTS,
    OLLAMA_HOST,
    TABLE_NAME,
    VALID_ENTITY_TYPES,
    _row_public,
    embed_text,
    get_table,
    hybrid_search,
    invalidate_table,
    memories_root,
    project_db_path,
    project_paths,
    project_stats,
    rebuild_fts,
    resolve_project,
)

ROOT = Path(__file__).resolve().parent
BACKUP_ROOT = Path(os.environ.get("LANCE_MEMORY_BACKUP_ROOT", os.environ.get("ARCH_MEMORY_BACKUP_ROOT", str(ROOT / "backups"))))


def _projects(value: str) -> list[str]:
    if value:
        return [resolve_project(value)]
    names = list(KNOWN_PROJECTS) or list(project_paths().keys())
    if not names:
        raise ValueError(
            "No project specified and no projects discovered under "
            "PROJECT_MEMORIES_ROOT. Pass --project or set "
            "PROJECT_MEMORY_PROJECTS."
        )
    return names


def _unit_state(name: str) -> str:
    result = subprocess.run(["systemctl", "is-active", name], capture_output=True, text=True, timeout=5)
    return (result.stdout or result.stderr).strip() or "unknown"


def backup_project(project: str, label: str = "manual") -> Path:
    """Create a filesystem snapshot. For schema changes, stop writers first."""
    project = resolve_project(project)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    target = BACKUP_ROOT / f"{project}-{stamp}-{label}"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(project_db_path(project), target)
    manifest = {
        "project": project,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "source": str(project_db_path(project)),
        "reason": label,
    }
    (target / "BACKUP.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return target


def migrate_project(project: str, apply: bool = False) -> dict[str, Any]:
    """Upgrade legacy rows to schema v2 while preserving vectors and content."""
    project = resolve_project(project)
    table = get_table(project)
    columns = set(table.schema.names)
    needed = sorted({"record_id", "entity_type"} - columns)
    result: dict[str, Any] = {"project": project, "rows": table.count_rows(), "missing": needed, "applied": False}
    if not needed or not apply:
        return result
    backup = backup_project(project, "pre-schema-v2")
    frame = table.to_pandas()
    if "record_id" not in frame.columns:
        frame.insert(0, "record_id", [str(uuid.uuid4()) for _ in range(len(frame))])
    else:
        seen: set[str] = set()
        ids: list[str] = []
        for value in frame["record_id"]:
            candidate = str(value or "").strip()
            if not candidate or candidate in seen:
                candidate = str(uuid.uuid4())
            seen.add(candidate)
            ids.append(candidate)
        frame["record_id"] = ids
    if "entity_type" not in frame.columns:
        frame["entity_type"] = "General"
    else:
        frame["entity_type"] = frame["entity_type"].fillna("General").where(
            frame["entity_type"].isin(VALID_ENTITY_TYPES), "General"
        )
    for field, default in (("category", "general"), ("symbol", ""), ("created_at", "")):
        frame[field] = frame[field].fillna(default).astype(str)
    frame["text"] = frame["text"].fillna("").astype(str)
    frame["verified"] = frame["verified"].fillna(False).astype(bool)
    ordered = ["record_id", "text", "category", "symbol", "entity_type", "verified", "created_at", "vector"]
    records = frame[ordered].to_dict(orient="records")
    db = lancedb.connect(str(project_db_path(project)))
    db.create_table(TABLE_NAME, data=records, schema=ArchitecturalMemory, mode="overwrite")
    invalidate_table(project)
    rebuilt = rebuild_fts(get_table(project))
    result.update(applied=True, backup=str(backup), indexes=rebuilt, rows=get_table(project).count_rows())
    return result


def audit_project(project: str) -> dict[str, Any]:
    project = resolve_project(project)
    table = get_table(project)
    frame = table.to_pandas()
    columns = set(frame.columns)
    ids = frame["record_id"].fillna("").astype(str) if "record_id" in columns else None
    entities = frame["entity_type"].fillna("General").astype(str) if "entity_type" in columns else None
    return {
        **project_stats(project),
        "duplicate_text": int(frame.duplicated(subset=["text"], keep=False).sum()) if len(frame) else 0,
        "empty_text": int((frame["text"].fillna("").astype(str).str.strip() == "").sum()) if "text" in columns else len(frame),
        "empty_symbol": int((frame["symbol"].fillna("").astype(str).str.strip() == "").sum()) if "symbol" in columns else len(frame),
        "missing_record_id": int((ids.str.strip() == "").sum()) if ids is not None else len(frame),
        "duplicate_record_id": int(ids.duplicated(keep=False).sum()) if ids is not None else 0,
        "invalid_entity_type": int((~entities.isin(VALID_ENTITY_TYPES)).sum()) if entities is not None else len(frame),
    }


def cmd_status(_args: argparse.Namespace) -> int:
    payload = {
        "root": str(memories_root()),
        "ollama": OLLAMA_HOST,
        "model": EMBED_MODEL,
        "units": {name: _unit_state(name) for name in ("lance-memory-http.service", "lance-memory-admin.service")},
        "projects": [audit_project(name) for name in _projects("")],
    }
    print(json.dumps(payload, indent=2))
    return 0


def cmd_audit(args: argparse.Namespace) -> int:
    print(json.dumps([audit_project(name) for name in _projects(args.project)], indent=2))
    return 0


def cmd_migrate(args: argparse.Namespace) -> int:
    results = [migrate_project(name, apply=args.apply) for name in _projects(args.project)]
    print(json.dumps(results, indent=2))
    return 0


def cmd_backup(args: argparse.Namespace) -> int:
    for name in _projects(args.project):
        print(backup_project(name, args.label))
    return 0


def cmd_search(args: argparse.Namespace) -> int:
    print(json.dumps(hybrid_search(args.query, args.limit, args.project), indent=2))
    return 0


def cmd_export(args: argparse.Namespace) -> int:
    project = resolve_project(args.project)
    rows = [_row_public(row) for row in get_table(project).to_pandas().to_dict(orient="records")]
    out = Path(args.out) if args.out else ROOT / "exports" / f"{project}-backup.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"project": project, "count": len(rows), "records": rows}, indent=2), encoding="utf-8")
    print(out)
    return 0


def cmd_rebuild(args: argparse.Namespace) -> int:
    for name in _projects(args.project):
        print(name, rebuild_fts(get_table(name)))
    return 0


def cmd_optimize(args: argparse.Namespace) -> int:
    for name in _projects(args.project):
        result = get_table(name).optimize(cleanup_older_than=timedelta(days=args.keep_days))
        print(name, result)
    return 0


def cmd_embed(_args: argparse.Namespace) -> int:
    vector = embed_text("architectural memory health check")
    print(json.dumps({"ok": len(vector) == EMBED_DIM, "dimensions": len(vector), "model": EMBED_MODEL}))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Architectural memory administration")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("status", help="Service and data health as JSON")
    for name, help_text in (("audit", "Audit schemas and data quality"), ("migrate", "Upgrade legacy schemas"), ("backup", "Snapshot LanceDB directories"), ("rebuild-fts", "Rebuild full-text indexes"), ("optimize", "Compact and prune old versions")):
        command = sub.add_parser(name, help=help_text)
        command.add_argument("--project", default="", help="Project name; default: all discovered projects")
        if name == "migrate":
            command.add_argument("--apply", action="store_true", help="Apply migration; default is dry-run")
        elif name == "backup":
            command.add_argument("--label", default="manual")
        elif name == "optimize":
            command.add_argument("--keep-days", type=int, default=7)
    search = sub.add_parser("search")
    search.add_argument("query")
    search.add_argument("--project", required=True)
    search.add_argument("--limit", type=int, default=5)
    export = sub.add_parser("export")
    export.add_argument("--project", required=True)
    export.add_argument("--out", default="")
    sub.add_parser("embed-check")
    args = parser.parse_args()
    handlers = {"status": cmd_status, "audit": cmd_audit, "migrate": cmd_migrate, "backup": cmd_backup, "search": cmd_search, "export": cmd_export, "rebuild-fts": cmd_rebuild, "optimize": cmd_optimize, "embed-check": cmd_embed}
    return handlers[args.command](args)


if __name__ == "__main__":
    raise SystemExit(main())
