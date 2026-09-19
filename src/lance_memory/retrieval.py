"""Multi-signal retrieval: semantic + keyword + entity, fused, then trimmed."""
from __future__ import annotations
from typing import Any

from .store import LanceStore


def semantic_search(store: LanceStore, vector, where, limit, metric="cosine") -> list[dict]:
    q = store.memories.search(vector, vector_column_name="vector").metric(metric)
    if where:
        q = q.where(where)
    rows = q.limit(limit).to_list()
    for r in rows:
        r["_distance"] = r.get("_distance", 0.0)
        r["_signal"] = "semantic"
    return rows


def keyword_search(store: LanceStore, query: str, where, limit) -> list[dict]:
    safe = query.replace("'", "''")
    kw = f"memory LIKE '%{safe}%'"
    full = f"({where}) AND ({kw})" if where else kw
    rows = store.memories.search().where(full).limit(limit).to_list()
    for r in rows:
        r["_signal"] = "keyword"
    return rows


def entity_search(store: LanceStore, entity_names: list[str], scope: str, limit: int) -> list[dict]:
    if not entity_names:
        return []
    ents = store.find_entities(entity_names, scope)
    if not ents:
        return []
    memory_ids: set[str] = set()
    for e in ents:
        memory_ids.update(e.get("memory_ids") or [])
    if not memory_ids:
        return []
    quoted = ", ".join(f"'{mid}'" for mid in memory_ids)
    rows = store.memories.search().where(f"id IN ({quoted})").limit(limit).to_list()
    for r in rows:
        r["_signal"] = "entity"
    return rows


def reciprocal_rank_fusion(ranked_lists: list[list[dict]], k: int = 60) -> list[dict]:
    scores: dict[str, float] = {}
    by_id: dict[str, dict] = {}
    for ranked in ranked_lists:
        for rank, row in enumerate(ranked):
            rid = row["id"]
            scores[rid] = scores.get(rid, 0.0) + 1.0 / (k + rank + 1)
            if rid not in by_id:
                by_id[rid] = row
            elif row.get("_distance") is not None and by_id[rid].get("_distance") is None:
                by_id[rid] = row
    ordered = sorted(by_id.values(), key=lambda r: -scores[r["id"]])
    for r in ordered:
        r["_rrf_score"] = scores[r["id"]]
    return ordered


def multi_signal_search(
    store: LanceStore,
    *,
    query: str,
    query_vector,
    where,
    top_k: int,
    candidate_multiplier: int = 4,
    scope: str | None = None,
    entity_names: list[str] | None = None,
    metric: str = "cosine",
) -> list[dict]:
    n = top_k * candidate_multiplier
    lists = [
        semantic_search(store, query_vector, where, n, metric=metric),
        keyword_search(store, query, where, n),
    ]
    if scope and entity_names:
        lists.append(entity_search(store, entity_names, scope, n))
    fused = reciprocal_rank_fusion(lists)
    return fused[:top_k]


def trim_to_budget(rows: list[dict], max_tokens: int) -> list[dict]:
    out, used = [], 0
    for r in rows:
        t = estimate_tokens(r.get("memory", ""))
        if used + t > max_tokens and out:
            break
        out.append(r)
        used += t
    return out


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)
