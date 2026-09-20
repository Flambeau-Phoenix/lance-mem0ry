"""Scaffold empty project LanceDB partitions under PROJECT_MEMORIES_ROOT.

Creates only the projects explicitly listed in PROJECT_MEMORY_PROJECTS
(comma-separated). With no configured names, the installation remains a blank
slate until an administrator provisions a project in the Web Panel.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from memory_server import (  # noqa: E402
    ArchitecturalMemory,
    TABLE_NAME,
    _ensure_fts,
    _validate_project_name,
    memories_root,
)

import lancedb

def seed_project_names() -> list[str]:
    configured = [
        name.strip()
        for name in os.environ.get("PROJECT_MEMORY_PROJECTS", "").split(",")
        if name.strip()
    ]
    return [_validate_project_name(name) for name in configured]


def create_blank_db(project: str) -> Path:
    root = memories_root()
    path = root / project
    path.mkdir(parents=True, exist_ok=True)
    db = lancedb.connect(str(path))
    listed = db.list_tables()
    names = listed.tables if hasattr(listed, "tables") else listed
    if TABLE_NAME not in names:
        table = db.create_table(TABLE_NAME, schema=ArchitecturalMemory)
        _ensure_fts(table)
        print(f"created blank table {TABLE_NAME} @ {path}")
    else:
        table = db.open_table(TABLE_NAME)
        _ensure_fts(table)
        print(f"opened existing table {TABLE_NAME} @ {path}")
    return path


def main() -> None:
    root = memories_root()
    root.mkdir(parents=True, exist_ok=True)
    print(f"PROJECT_MEMORIES_ROOT={root}")
    names = seed_project_names()
    if not names:
        print("No projects configured; leaving a blank slate for Web Panel provisioning.")
    for name in names:
        print(f"  scaffolding {name}")
        create_blank_db(name)
    print("Done.")


if __name__ == "__main__":
    main()
