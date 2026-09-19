"""LanceDB store -- connection, table lifecycle, low-level CRUD."""
from __future__ import annotations
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

import lancedb
import pyarrow as pa

from .schema import (
    get_memory_schema,
    get_entity_schema,
    HISTORY_SCHEMA,
    CONVERSATION_SCHEMA,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class LanceStore:
    def __init__(self, uri: str, table: str = "memories", metric: str = "cosine", dims: int = 768):
        self.uri = uri
        self.table_name = table
        self.metric = metric
        self.dims = dims
        self._db = lancedb.connect(uri)
        self.memories = self._ensure("memories", get_memory_schema(self.dims))
        self.entities = self._ensure("entities", get_entity_schema(self.dims))
        self.history = self._ensure("history", HISTORY_SCHEMA)
        self.conversations = self._ensure("conversations", CONVERSATION_SCHEMA)

    def _ensure(self, name: str, schema: pa.Schema):
        listed = self._db.list_tables()
        names = listed.tables if hasattr(listed, "tables") else listed
        if name in names:
            table = self._db.open_table(name)
            existing = set(table.schema.names)
            missing = [field for field in schema if field.name not in existing]
            if missing:
                # Additive migration preserves old rows. Newly required scopes remain
                # NULL until an operator explicitly maps legacy data to a project.
                table.add_columns(
                    pa.schema([pa.field(field.name, field.type) for field in missing])
                )
            return table
        return self._db.create_table(name, schema=schema)

    def ensure_vector_index(self, index_type: str = "IVF_PQ", num_partitions: int = 64):
        try:
            self.memories.create_index(
                metric=self.metric,
                vector_column_name="vector",
                index_type=index_type,
                num_partitions=num_partitions,
            )
        except Exception:
            pass

    def insert_memories(self, rows: list[dict]) -> list[str]:
        if not rows:
            return []
        ids: list[str] = []
        now = _utcnow()
        normalized = []
        for r in rows:
            rid = r.get("id") or str(uuid.uuid4())
            ids.append(rid)
            normalized.append({
                "id": rid,
                "memory": r["memory"],
                "vector": r["vector"],
                "project_id": r["project_id"],
                "user_id": r.get("user_id"),
                "agent_id": r.get("agent_id"),
                "run_id": r.get("run_id"),
                "app_id": r.get("app_id"),
                "categories": r.get("categories") or [],
                "metadata": json.dumps(r.get("metadata") or {}),
                "verified": bool(r.get("verified", False)),
                "bucket": r.get("bucket", "state"),
                "hash": r.get("hash"),
                "immutable": bool(r.get("immutable", False)),
                "created_at": r.get("created_at", now),
                "updated_at": r.get("updated_at", now),
                "expiration_date": r.get("expiration_date"),
                "replaced_by": r.get("replaced_by"),
                "lifecycle_state": r.get("lifecycle_state", "active"),
                "synthesized": bool(r.get("synthesized", False)),
                "structured_attributes": json.dumps(r.get("structured_attributes") or {}),
                "score_hint": float(r.get("score_hint") or 0.0),
            })
        self.memories.add(normalized)
        return ids

    def get_memory(self, memory_id: str) -> dict | None:
        tbl = self.memories.search().where(f"id = '{memory_id}'").limit(1).to_list()
        return tbl[0] if tbl else None

    def update_memory(self, memory_id: str, updates: dict) -> bool:
        existing = self.get_memory(memory_id)
        if not existing:
            return False
        payload = {"updated_at": _utcnow()}
        for k, v in updates.items():
            if k == "metadata" and isinstance(v, dict):
                payload["metadata"] = json.dumps(v)
            elif k == "expiration_date" and v is not None and not isinstance(v, datetime):
                payload["expiration_date"] = datetime.fromisoformat(v).replace(tzinfo=timezone.utc)
            elif k == "categories" and isinstance(v, list):
                payload["categories"] = v
            else:
                payload[k] = v
        self.memories.update(where=f"id = '{memory_id}'", values=payload)
        return True

    def mark_superseded(self, old_id: str, new_id: str):
        self.update_memory(old_id, {"replaced_by": new_id, "lifecycle_state": "superseded"})

    def delete_memory(self, memory_id: str) -> bool:
        existing = self.get_memory(memory_id)
        if not existing:
            return False
        self.memories.delete(f"id = '{memory_id}'")
        return True

    def delete_by_scope(self, **scopes) -> int:
        clauses = [f"{k} = '{v}'" for k, v in scopes.items() if v is not None]
        if not clauses:
            raise ValueError("delete_by_scope requires at least one scope filter")
        where = " AND ".join(clauses)
        count = len(self.memories.search().where(where).limit(10_000).to_list())
        self.memories.delete(where)
        return count

    def upsert_entity(self, name: str, vector: list[float], memory_id: str, scope_key: str):
        hits = self.entities.search().where(
            f"name = '{name}' AND scope_key = '{scope_key}'"
        ).limit(1).to_list()
        now = _utcnow()
        if hits:
            row = hits[0]
            ids = list(row.get("memory_ids") or [])
            if memory_id not in ids:
                ids.append(memory_id)
            self.entities.update(
                where=f"id = '{row['id']}'",
                values={"memory_ids": ids, "updated_at": now},
            )
        else:
            self.entities.add([{
                "id": str(uuid.uuid4()),
                "name": name,
                "vector": vector,
                "memory_ids": [memory_id],
                "scope_key": scope_key,
                "created_at": now,
                "updated_at": now,
            }])

    def find_entities(self, names: list[str], scope_key: str) -> list[dict]:
        if not names:
            return []
        quoted = ", ".join(f"'{n}'" for n in names)
        return (
            self.entities.search()
            .where(f"name IN ({quoted}) AND scope_key = '{scope_key}'")
            .limit(500)
            .to_list()
        )

    def log_history(
        self,
        memory_id: str,
        event: str,
        *,
        old_memory: str | None = None,
        new_memory: str | None = None,
        input_messages: list[dict] | None = None,
        scopes: dict | None = None,
    ):
        scopes = scopes or {}
        self.history.add([{
            "id": str(uuid.uuid4()),
            "memory_id": memory_id,
            "event": event,
            "old_memory": old_memory,
            "new_memory": new_memory,
            "input": json.dumps(input_messages or []),
            "project_id": scopes["project_id"],
            "user_id": scopes.get("user_id"),
            "agent_id": scopes.get("agent_id"),
            "run_id": scopes.get("run_id"),
            "app_id": scopes.get("app_id"),
            "created_at": _utcnow(),
        }])

    def get_history(self, memory_id: str, project_id: str) -> list[dict]:
        rows = (
            self.history.search()
            .where(f"memory_id = '{memory_id}' AND project_id = '{project_id}'")
            .limit(1000)
            .to_list()
        )
        rows.sort(key=lambda r: r["created_at"])
        return rows

    def append_conversation(self, scope_key: str, messages: Iterable[dict]):
        now = _utcnow()
        rows = [{
            "id": str(uuid.uuid4()),
            "scope_key": scope_key,
            "role": m.get("role", "user"),
            "content": _stringify_content(m.get("content")),
            "created_at": now,
        } for m in messages]
        if rows:
            self.conversations.add(rows)

    def recent_conversation(self, scope_key: str, limit: int = 20) -> list[dict]:
        rows = (
            self.conversations.search()
            .where(f"scope_key = '{scope_key}'")
            .limit(limit * 4)
            .to_list()
        )
        rows.sort(key=lambda r: r["created_at"])
        return rows[-limit:]


def _stringify_content(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif block.get("type") == "image_url":
                    parts.append("[image]")
                else:
                    parts.append(str(block))
            else:
                parts.append(str(block))
        return "\n".join(parts)
    return str(content)
