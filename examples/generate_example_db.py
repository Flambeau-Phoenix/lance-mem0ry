#!/usr/bin/env python3
"""Build a standalone example LanceDB database and JSON export for testing and backend development."""
from __future__ import annotations

import json
import os
import shutil
import tarfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
import math
import random

def make_unit_vector(seed_val: int) -> list[float]:
    rnd = random.Random(seed_val)
    vec = [rnd.gauss(0.0, 1.0) for _ in range(768)]
    norm = math.sqrt(sum(x * x for x in vec))
    return [round(x / norm, 6) for x in vec]

def generate():
    script_dir = Path(__file__).resolve().parent
    out_dir = script_dir / "example_project_db"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    categories = {
        "key_facts": {
            "description": "Ratified facts, verified patterns, stable APIs, and configuration constants.",
            "bucket": "fact"
        },
        "architectural_decisions": {
            "description": "System architecture, design choices, invariants, patterns, and trade-offs.",
            "bucket": "decision"
        },
        "ongoing_tasks": {
            "description": "WIP blueprints, hypotheses, and pending implementation steps.",
            "bucket": "state"
        },
        "session_handoff": {
            "description": "Session summaries, milestones reached, and next action items.",
            "bucket": "state"
        },
        "api_reference": {
            "description": "Verified external and internal API signatures, client bindings, and protocols.",
            "bucket": "fact"
        },
        "coding_standards": {
            "description": "Project-specific coding guidelines, error handling rules, and conventions.",
            "bucket": "decision"
        }
    }

    with open(out_dir / "categories.json", "w", encoding="utf-8") as f:
        json.dump(categories, f, indent=2)

    sample_data = [
        {
            "text": "Redis connection pool is configured with max_connections=20 and socket_timeout=5.0s in config/redis.json.",
            "category": "key_facts",
            "symbol": "RedisConnectionPool",
            "verified": True,
            "created_at": "2026-09-18T14:20:00Z",
            "entity_type": "Config",
            "project_id": "example_project",
            "bucket": "fact",
            "tags": ["redis", "networking", "caching"],
            "agent_id": "backend-agent",
            "source_ref": "src/config/redis.json",
            "status": "active"
        },
        {
            "text": "OAuth Token endpoint contract: POST /oauth/token accepts grant_type, client_id, client_secret, and code with response returning access_token and refresh_token.",
            "category": "api_reference",
            "symbol": "POST /oauth/token",
            "verified": True,
            "created_at": "2026-09-19T10:15:00Z",
            "entity_type": "Protocol",
            "project_id": "example_project",
            "bucket": "fact",
            "tags": ["auth", "oauth2", "api-contract"],
            "agent_id": "api-agent",
            "source_ref": "src/auth/routes.py",
            "status": "active"
        },
        {
            "text": "All vector embeddings must be exactly 768 dimensions using nomic-embed-text for LanceDB compatibility.",
            "category": "architectural_decisions",
            "symbol": "EMBED_DIM",
            "verified": True,
            "created_at": "2026-09-15T08:49:20Z",
            "entity_type": "Protocol",
            "project_id": "example_project",
            "bucket": "decision",
            "tags": ["lancedb", "embeddings", "ollama"],
            "agent_id": "architect",
            "source_ref": "docs/architecture.md",
            "status": "active"
        },
        {
            "text": "Blueprint: Implement distributed event bus adapter using Apache Kafka with at-least-once delivery semantics and dead-letter queue routing.",
            "category": "ongoing_tasks",
            "symbol": "KafkaEventBus",
            "verified": False,
            "created_at": "2026-09-19T16:45:00Z",
            "entity_type": "Directive",
            "project_id": "example_project",
            "bucket": "state",
            "tags": ["kafka", "events", "blueprint", "wip"],
            "agent_id": "orchestrator-agent",
            "source_ref": "src/events/bus.py",
            "status": "active"
        },
        {
            "text": "All HTTP REST API error responses must adhere strictly to RFC 7807 Problem Details with type, title, status, and detail fields.",
            "category": "coding_standards",
            "symbol": "RFC7807ProblemDetails",
            "verified": True,
            "created_at": "2026-09-17T11:00:00Z",
            "entity_type": "Rule",
            "project_id": "example_project",
            "bucket": "decision",
            "tags": ["rest", "rfc7807", "error-handling", "standards"],
            "agent_id": "linter-guard",
            "source_ref": "src/api/errors.py",
            "status": "active"
        },
        {
            "text": "Session Handoff: Completed core JWT validation middleware and unit tests. Next step is wiring refresh token rotation.",
            "category": "session_handoff",
            "symbol": "JWTMiddleware",
            "verified": False,
            "created_at": "2026-09-19T17:30:00Z",
            "entity_type": "General",
            "project_id": "example_project",
            "bucket": "state",
            "tags": ["handoff", "auth", "milestone"],
            "agent_id": "developer-agent",
            "source_ref": "src/auth/jwt.py",
            "status": "active"
        },
        {
            "text": "Database transaction isolation level is set to SERIALIZABLE on account balance transfers to prevent race conditions.",
            "category": "key_facts",
            "symbol": "BalanceTransferTx",
            "verified": True,
            "created_at": "2026-09-14T09:00:00Z",
            "entity_type": "Rule",
            "project_id": "example_project",
            "bucket": "fact",
            "tags": ["database", "acid", "transactions"],
            "agent_id": "dba-agent",
            "source_ref": "src/db/transactions.py",
            "status": "active"
        }
    ]

    rows = []
    for idx, d in enumerate(sample_data):
        rec_id = str(uuid.uuid4())
        mem_id = uuid.uuid4().hex
        vec = make_unit_vector(idx + 100)
        rows.append({
            "text": d["text"],
            "category": d["category"],
            "symbol": d["symbol"],
            "verified": d["verified"],
            "created_at": d["created_at"],
            "record_id": rec_id,
            "entity_type": d["entity_type"],
            "memory_id": mem_id,
            "project_id": d["project_id"],
            "bucket": d["bucket"],
            "tags": d["tags"],
            "agent_id": d["agent_id"],
            "run_id": "run-" + uuid.uuid4().hex[:8],
            "source_type": "agent",
            "source_ref": d["source_ref"],
            "updated_at": d["created_at"],
            "status": d["status"],
            "supersedes_id": "",
            "vector": vec
        })

    # If lancedb is available in python, build records.lance dataset
    try:
        import lancedb
        from server.memory_server import ArchitecturalMemory, TABLE_NAME, rebuild_fts
        db = lancedb.connect(str(out_dir))
        table = db.create_table(TABLE_NAME, schema=ArchitecturalMemory)
        table.add(rows)
        rebuild_fts(table)
        print(f"Created LanceDB dataset in: {out_dir}")
    except Exception as e:
        print(f"LanceDB build skipped (will build on host): {e}")

    # Build standalone JSON export
    export_payload = {
        "project_id": "example_project",
        "schema_version": "2.0.0",
        "description": "Example LanceDB project memory partition for backend testing and development.",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_records": len(rows),
        "embedding_model": "nomic-embed-text",
        "embedding_dimensions": 768,
        "categories": categories,
        "records": rows
    }

    json_path = script_dir / "example_database_export.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(export_payload, f, indent=2)
    print(f"Created JSON export in: {json_path}")

    # Archive tarball
    tar_path = script_dir / "example_project_db.tar.gz"
    if (out_dir / "records.lance").exists():
        with tarfile.open(tar_path, "w:gz") as tar:
            tar.add(out_dir, arcname="example_project_db")
        print(f"Created compressed archive in: {tar_path}")

if __name__ == "__main__":
    generate()
