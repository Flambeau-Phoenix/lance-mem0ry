"""Arrow schemas for LanceDB tables."""
from __future__ import annotations
import pyarrow as pa


def get_memory_schema(dims: int = 768) -> pa.Schema:
    return pa.schema([
        pa.field("id", pa.string(), nullable=False),
        pa.field("memory", pa.string(), nullable=False),
        pa.field("vector", pa.list_(pa.float32(), dims), nullable=False),
        pa.field("project_id", pa.string(), nullable=False),
        pa.field("user_id", pa.string()),
        pa.field("agent_id", pa.string()),
        pa.field("run_id", pa.string()),
        pa.field("app_id", pa.string()),
        pa.field("categories", pa.list_(pa.string())),
        pa.field("metadata", pa.string()),
        pa.field("verified", pa.bool_()),
        pa.field("bucket", pa.string()),
        pa.field("hash", pa.string()),
        pa.field("immutable", pa.bool_()),
        pa.field("created_at", pa.timestamp("us")),
        pa.field("updated_at", pa.timestamp("us")),
        pa.field("expiration_date", pa.timestamp("us")),
        pa.field("replaced_by", pa.string()),
        pa.field("lifecycle_state", pa.string()),
        pa.field("synthesized", pa.bool_()),
        pa.field("structured_attributes", pa.string()),
        pa.field("score_hint", pa.float32()),
    ])


def get_entity_schema(dims: int = 768) -> pa.Schema:
    return pa.schema([
        pa.field("id", pa.string(), nullable=False),
        pa.field("name", pa.string(), nullable=False),
        pa.field("vector", pa.list_(pa.float32(), dims)),
        pa.field("memory_ids", pa.list_(pa.string())),
        pa.field("scope_key", pa.string()),
        pa.field("created_at", pa.timestamp("us")),
        pa.field("updated_at", pa.timestamp("us")),
    ])


HISTORY_SCHEMA = pa.schema([
    pa.field("id", pa.string(), nullable=False),
    pa.field("memory_id", pa.string(), nullable=False),
    pa.field("event", pa.string(), nullable=False),
    pa.field("old_memory", pa.string()),
    pa.field("new_memory", pa.string()),
    pa.field("input", pa.string()),
    pa.field("project_id", pa.string(), nullable=False),
    pa.field("user_id", pa.string()),
    pa.field("agent_id", pa.string()),
    pa.field("run_id", pa.string()),
    pa.field("app_id", pa.string()),
    pa.field("created_at", pa.timestamp("us")),
])


CONVERSATION_SCHEMA = pa.schema([
    pa.field("id", pa.string(), nullable=False),
    pa.field("scope_key", pa.string(), nullable=False),
    pa.field("role", pa.string(), nullable=False),
    pa.field("content", pa.string()),
    pa.field("created_at", pa.timestamp("us")),
])


BUDGET_SCHEMA = pa.schema([
    pa.field("bucket", pa.string()),
    pa.field("count", pa.int32()),
    pa.field("updated_at", pa.timestamp("us")),
])

MEMORY_SCHEMA = get_memory_schema(768)
ENTITY_SCHEMA = get_entity_schema(768)
