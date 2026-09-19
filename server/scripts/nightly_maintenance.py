"""Deterministic nightly maintenance pass. Zero LLM. Invoked by systemd timer.

Why rewritten: the previous copy was user_id-scoped; LanceMemory is now
project-partitioned. This script iterates every project under
PROJECT_MEMORIES_ROOT and runs duplicate/expired/stale scans.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Allow import when ExecStart runs from the package checkout or arch_memory cwd.
_HERE = Path(__file__).resolve().parent
_SERVER = _HERE.parent
if str(_SERVER) not in sys.path:
    sys.path.insert(0, str(_SERVER))

from lance_memory import LanceMemory
from lance_memory.harness import MaintenanceHarness


def project_names() -> list[str]:
    root = Path(os.environ.get("PROJECT_MEMORIES_ROOT", "")).expanduser()
    if not root.is_dir():
        return []
    configured = [
        name.strip()
        for name in os.environ.get("PROJECT_MEMORY_PROJECTS", "").split(",")
        if name.strip()
    ]
    discovered = [p.name for p in root.iterdir() if p.is_dir() and not p.name.startswith(".")]
    return sorted(set(configured) | set(discovered))


def main() -> int:
    projects = project_names()
    report = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "projects": {},
    }

    for project in projects:
        uri = str(Path(os.environ["PROJECT_MEMORIES_ROOT"]) / project)
        memory = LanceMemory(
            {
                "project": project,
                "vector_store": {"config": {"uri": uri, "table": "memories"}},
                "llm_available": False,
                "enable_graph": False,
            }
        )
        mh = MaintenanceHarness(memory)
        entry = {"duplicates_merged": 0, "expired_deleted": 0, "stale_demoted": 0}

        for dupe in mh.scan_duplicates(project=project, threshold=0.03)[:100]:
            mh.apply_duplicate_merge(keep_id=dupe["keep_id"], merge_id=dupe["merge_id"])
            entry["duplicates_merged"] += 1

        expired = mh.scan_expired(project=project)
        if expired:
            entry["expired_deleted"] = mh.apply_delete_expired(
                ids=[row["id"] for row in expired]
            )["count"]

        stale = mh.scan_stale(project=project, older_than_days=120)
        if len(stale) > 200:
            tail = [row["id"] for row in stale[200:]]
            mh.apply_demote(ids=tail, reason="stale")
            entry["stale_demoted"] = len(tail)

        report["projects"][project] = entry

    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
