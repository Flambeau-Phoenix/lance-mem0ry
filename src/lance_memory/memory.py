"""LanceMemory + AsyncLanceMemory -- Mem0-compatible public surface."""
from __future__ import annotations
import asyncio
import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from .config import load_config, openai_compatible_preset
from .embedding import Embedder
from .extraction import Extractor
from .filters import extract_scope, scope_key, to_lance_where
from .harness import (
    BudgetTracker, ReadHarness, ReadPolicy, WriteHarness, WritePolicy,
    heuristic_extract,
)
from .reranker import Reranker
from .retrieval import estimate_tokens, multi_signal_search, trim_to_budget
from .store import LanceStore


ALLOWED_MEMORY_TYPES = {None, "procedural_memory"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _normalize_messages(messages: str | list[Any]) -> list[dict]:
    if isinstance(messages, str):
        return [{"role": "user", "content": messages}]
    out = []
    for m in messages:
        if isinstance(m, str):
            out.append({"role": "user", "content": m})
        elif isinstance(m, dict):
            out.append(m)
        else:
            out.append({"role": "user", "content": str(m)})
    return out



def _hash(text: str, scopes: dict) -> str:
    scope_str = "|".join(
        f"{k}={scopes.get(k)}"
        for k in ("project_id", "user_id", "agent_id", "run_id", "app_id")
    )
    return hashlib.sha256(f"{text}::{scope_str}".encode()).hexdigest()


def _parse_date(d: str | None) -> datetime | None:
    if not d:
        return None
    try:
        return datetime.fromisoformat(d).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


class LanceMemory:
    def __init__(self, config: dict | None = None):
        self.config = load_config(config)
        vs_cfg = self.config["vector_store"]["config"]
        self.embedder = Embedder(self.config["embedder"])
        dims = getattr(self.embedder, "dims", int(vs_cfg.get("embedding_model_dims", 768)))
        self.store = LanceStore(
            uri=vs_cfg["uri"],
            table=vs_cfg["table"],
            metric=vs_cfg.get("metric", "cosine"),
            dims=dims,
        )
        self.extractor = Extractor(self.config["llm"])
        self.reranker: Reranker | None = Reranker.maybe_from_config(self.config.get("reranker"))
        self._custom_categories = self.config.get("custom_categories") or []

        self.write_harness = WriteHarness(
            policy=WritePolicy(
                llm_calls_per_hour=int(self.config.get("llm_calls_per_hour", 60)),
                llm_calls_per_day=int(self.config.get("llm_calls_per_day", 400)),
                min_tokens_for_llm=int(self.config.get("min_tokens_for_llm", 40)),
            ),
            tracker=BudgetTracker(self.store),
            llm_available=bool(self.config.get("llm_available", True)),
        )
        self.read_harness = ReadHarness(
            policy=ReadPolicy(
                max_candidate_pool=int(self.config.get("max_candidate_pool", 40)),
                enable_entity_signal=bool(self.config.get("enable_graph", True)),
                enable_keyword_signal=True,
            )
        )

    @classmethod
    def from_openai_compatible(
        cls,
        uri: str | None = None,
        base_url: str = "http://127.0.0.1:8080/v1",
        model: str = "local-model",
        table: str = "memories",
    ) -> LanceMemory:
        """Instantiate LanceMemory pre-configured for an OpenAI-compatible extraction proxy."""
        cfg = openai_compatible_preset(base_url=base_url, model=model)
        if uri:
            cfg.setdefault("vector_store", {}).setdefault("config", {})["uri"] = uri
        if table:
            cfg.setdefault("vector_store", {}).setdefault("config", {})["table"] = table
        return cls(config=cfg)


    def add(
        self,
        messages: str | list[dict],
        *,
        project: str | None = None,
        user_id: str | None = None,
        agent_id: str | None = None,
        run_id: str | None = None,
        app_id: str | None = None,
        metadata: dict | None = None,
        categories: list[str] | None = None,
        verified: bool = False,
        bucket: str = "state",
        custom_instructions: str | None = None,
        custom_categories: list[dict] | None = None,
        infer: bool = False,
        immutable: bool = False,
        expiration_date: str | None = None,
        memory_type: Literal["procedural_memory"] | None = None,
        timestamp: int | None = None,
    ) -> dict:
        if memory_type not in ALLOWED_MEMORY_TYPES:
            raise ValueError(
                f"memory_type '{memory_type}' is not implemented. "
                "Only 'procedural_memory' is supported; omit for ordinary memory."
            )
        if memory_type == "procedural_memory" and not agent_id:
            raise ValueError("procedural_memory requires agent_id")

        project = self._resolve_project(project)
        scopes = {
            "project_id": project,
            "user_id": user_id,
            "agent_id": agent_id,
            "run_id": run_id,
            "app_id": app_id,
        }

        norm = _normalize_messages(messages)
        scope = scope_key(scopes)
        self.store.append_conversation(scope, norm)
        context = [m["content"] for m in self.store.recent_conversation(scope, limit=15)]

        if memory_type == "procedural_memory":
            facts = [_content_to_text(m.get("content")) for m in norm if _content_to_text(m.get("content"))]
        else:
            mode = self.write_harness.decide(norm, infer)
            if mode == "llm":
                self.write_harness.charge()
                instructions = custom_instructions or self.config.get("custom_instructions")
                facts = self.extractor.extract(norm, context_memories=context, custom_instructions=instructions)
            elif mode == "heuristic":
                facts = heuristic_extract(norm)
            else:
                facts = [_content_to_text(m.get("content")) for m in norm if _content_to_text(m.get("content"))]

        if not facts:
            return {"results": [], "status": "SUCCEEDED", "message": "No facts extracted"}

        palette = custom_categories or self._custom_categories
        vectors = self.embedder.embed(facts)

        rows: list[dict] = []
        exp_dt = _parse_date(expiration_date) or _default_expiration(self.config)
        for fact, vec in zip(facts, vectors):
            h = _hash(fact, scopes)
            if self._hash_exists(h):
                continue
            cats = categories or (self.extractor.classify_categories(fact, palette) if palette else [])
            temporal = self.extractor.temporal_metadata(fact, "\n".join(context[-5:])) if self.config.get("enable_temporal") else {}
            rows.append({
                "memory": fact,
                "vector": vec,
                "hash": h,
                "project_id": project,
                "user_id": user_id, "agent_id": agent_id,
                "run_id": run_id, "app_id": app_id,
                "categories": cats,
                "metadata": metadata or {},
                "verified": verified,
                "bucket": bucket,
                "immutable": immutable,
                "expiration_date": exp_dt,
                "lifecycle_state": "active",
                "structured_attributes": temporal,
                "created_at": (datetime.fromtimestamp(timestamp, tz=timezone.utc) if timestamp else _utcnow()),
            })

        ids = self.store.insert_memories(rows)

        if self.config.get("enable_graph"):
            for row, mid in zip(rows, ids):
                for name in _extract_entity_names(row["memory"]):
                    ent_vec = self.embedder.embed(name)[0]
                    self.store.upsert_entity(name, ent_vec, mid, scope)
        for row, mid in zip(rows, ids):
            self.store.log_history(mid, "ADD", new_memory=row["memory"], input_messages=norm, scopes=scopes)

        self._mark_supersession(rows, ids, scopes)
        return {
            "results": [{"id": i, "memory": r["memory"]} for i, r in zip(ids, rows)],
            "status": "SUCCEEDED",
        }

    def record_discovery(
        self,
        text: str,
        *,
        project: str | None = None,
        category: str = "key_facts",
        verified: bool = True,
        bucket: str = "fact",
        symbol: str = "",
        tags: list[str] | None = None,
        agent_id: str | None = None,
        run_id: str | None = None,
        source_ref: str = "",
    ) -> dict:
        """Store a classified engineering fact, decision, procedure, or draft."""
        if verified and category == "ongoing_tasks":
            raise ValueError("ongoing_tasks must use verified=False")
        if not verified and bucket != "state":
            raise ValueError("unverified memories must use bucket='state'")
        metadata = {
            "symbol": symbol,
            "tags": tags or [],
            "source_ref": source_ref,
        }
        return self.add(
            text,
            project=project,
            agent_id=agent_id,
            run_id=run_id,
            metadata=metadata,
            categories=[category],
            verified=verified,
            bucket=bucket,
            infer=False,
        )

    def _hash_exists(self, h: str) -> bool:
        return bool(self.store.memories.search().where(f"hash = '{h}'").limit(1).to_list())

    def _mark_supersession(self, rows, ids, scopes):
        for row, mid in zip(rows, ids):
            where = _scope_where(scopes)
            hits = (
                self.store.memories.search(row["vector"], vector_column_name="vector")
                .metric("cosine")
                .where(f"{where} AND lifecycle_state = 'active' AND id != '{mid}'")
                .limit(1).to_list()
            )
            if hits and hits[0].get("_distance", 1.0) < 0.05:
                self.store.mark_superseded(hits[0]["id"], mid)

    def search(
        self,
        query: str,
        *,
        project: str | None = None,
        filters: dict | None = None,
        top_k: int | None = None,
        threshold: float | None = None,
        rerank: bool = False,
        explain: bool = False,
        show_expired: bool = False,
    ) -> dict:
        if not query or not query.strip():
            raise ValueError("query must be non-empty")
        project = self._resolve_project(project)
        filters = dict(filters or {})
        requested_project = filters.pop("project", None) or filters.get("project_id")
        if requested_project and requested_project != project:
            raise ValueError("project argument and project filter must match")
        filters["project_id"] = project
        scopes = extract_scope(filters)
        top_k = top_k or self.config["top_k_default"]
        threshold = threshold if threshold is not None else self.config["threshold_default"]

        where = to_lance_where(filters)
        if not show_expired:
            exp_clause = f"(expiration_date IS NULL OR expiration_date > {_now_iso()})"
            where = f"({where}) AND {exp_clause}" if where else exp_clause
        where = f"({where}) AND lifecycle_state = 'active'" if where else "lifecycle_state = 'active'"

        qvec = self.embedder.embed(query)[0]
        scope = scope_key(scopes)
        entity_names = _extract_entity_names(query)

        plan = self.read_harness.plan(
            query=query, filters=filters, top_k=top_k,
            has_reranker=self.reranker is not None,
        )

        candidates = multi_signal_search(
            self.store,
            query=query,
            query_vector=qvec,
            where=where,
            top_k=plan["candidate_pool"],
            scope=scope if plan["signals"]["entity"] else None,
            entity_names=entity_names if plan["signals"]["entity"] else None,
            metric=self.config["vector_store"]["config"].get("metric", "cosine"),
        )
        candidates = candidates[:top_k]

        for r in candidates:
            dist = r.get("_distance")
            r["score"] = 1.0 - float(dist) if dist is not None else float(r.get("_rrf_score", 0.0))
            r.pop("_distance", None); r.pop("_rrf_score", None); r.pop("_signal", None)
            r["metadata"] = _safe_json(r.get("metadata"))
            r["structured_attributes"] = _safe_json(r.get("structured_attributes"))

        candidates = [r for r in candidates if r["score"] >= threshold]

        if rerank and self.reranker and plan["rerank"]:
            docs = [r["memory"] for r in candidates]
            ranked = self.reranker.rerank(query, docs, top_k=top_k)
            if ranked:
                reordered = []
                for idx, score in ranked:
                    row = dict(candidates[idx]); row["rerank_score"] = score
                    reordered.append(row)
                candidates = reordered

        candidates = trim_to_budget(candidates, self.config["max_context_tokens"])
        if explain:
            for r in candidates:
                r.setdefault("score_details", {})
                r["score_details"].update({"combined": r["score"], "rerank": r.get("rerank_score")})
        for r in candidates:
            r.pop("vector", None)
        return {"results": candidates}

    def get_all(self, *, project: str | None = None, filters: dict | None = None, page: int = 1, page_size: int = 100, show_expired: bool = False) -> dict:
        project = self._resolve_project(project)
        filters = dict(filters or {})
        requested_project = filters.pop("project", None) or filters.get("project_id")
        if requested_project and requested_project != project:
            raise ValueError("project argument and project filter must match")
        filters["project_id"] = project
        scopes = extract_scope(filters)
        where = to_lance_where(filters) or ""
        if not show_expired:
            exp_clause = "(expiration_date IS NULL OR expiration_date > " + _now_iso() + ")"
            where = f"({where}) AND {exp_clause}" if where else exp_clause
        where = f"({where}) AND lifecycle_state = 'active'" if where else "lifecycle_state = 'active'"
        all_rows = self.store.memories.search().where(where).limit(page_size * page + page_size).to_list()
        all_rows.sort(key=lambda r: r["created_at"])
        start = (page - 1) * page_size
        page_rows = all_rows[start:start + page_size]
        for r in page_rows:
            r.pop("vector", None)
            r["metadata"] = _safe_json(r.get("metadata"))
            r["structured_attributes"] = _safe_json(r.get("structured_attributes"))
        return {
            "count": len(all_rows), "results": page_rows,
            "next": None if len(page_rows) < page_size else f"?page={page+1}",
            "previous": None if page == 1 else f"?page={page-1}",
        }

    def get(self, memory_id: str, *, project: str | None = None) -> dict:
        project = self._resolve_project(project)
        row = self.store.get_memory(memory_id)
        if not row or row.get("project_id") != project:
            raise ValueError(f"Memory {memory_id} not found")
        row.pop("vector", None)
        row["metadata"] = _safe_json(row.get("metadata"))
        row["structured_attributes"] = _safe_json(row.get("structured_attributes"))
        return row

    def history(self, memory_id: str, *, project: str | None = None) -> list[dict]:
        project = self._resolve_project(project)
        return self.store.get_history(memory_id, project_id=project)

    def get_summary(self, *, project: str | None = None, filters: dict | None = None) -> dict:
        rows = self.get_all(project=project, filters=filters, page=1, page_size=200)["results"]
        return {"count": len(rows), "memories": [r["memory"] for r in rows]}

    def update(self, memory_id: str, text: str | None = None,
               *, project: str | None = None,
               metadata: dict | None = None, expiration_date: str | None = None) -> dict:
        project = self._resolve_project(project)
        existing = self.store.get_memory(memory_id)
        if not existing or existing.get("project_id") != project:
            raise ValueError(f"Memory {memory_id} not found")
        updates: dict[str, Any] = {}
        if text is not None:
            updates["memory"] = text
            updates["vector"] = self.embedder.embed(text)[0]
        if metadata is not None:
            updates["metadata"] = metadata
        if expiration_date is not None:
            updates["expiration_date"] = _parse_date(expiration_date)
        self.store.update_memory(memory_id, updates)
        self.store.log_history(
            memory_id, "UPDATE",
            old_memory=existing["memory"], new_memory=text or existing["memory"],
            scopes={k: existing.get(k) for k in ("project_id", "user_id", "agent_id", "run_id", "app_id")},
        )
        return {"id": memory_id, **{k: v for k, v in updates.items() if k != "vector"}}

    def delete(self, memory_id: str, *, project: str | None = None, delete_linked: bool = False) -> dict:
        project = self._resolve_project(project)
        existing = self.store.get_memory(memory_id)
        if not existing or existing.get("project_id") != project:
            raise ValueError(f"Memory {memory_id} not found")
        cascade = 0
        if delete_linked:
            linked = self.store.memories.search().where(
                f"project_id = '{project}' AND replaced_by = '{memory_id}'"
            ).limit(10_000).to_list()
            for row in linked:
                self.store.delete_memory(row["id"]); cascade += 1
        self.store.delete_memory(memory_id)
        self.store.log_history(memory_id, "DELETE", old_memory=existing["memory"])
        return {"message": "Memory deleted successfully!", "cascade_count": cascade}

    def delete_all(self, *, project: str | None = None, confirm: bool = False, **scopes) -> dict:
        scopes["project_id"] = self._resolve_project(project)
        scopes = {k: v for k, v in scopes.items() if v is not None}
        secondary = {k: v for k, v in scopes.items() if k != "project_id"}
        if not secondary and not confirm:
            raise ValueError(
                "delete_all with only project requires confirm=True "
                "(this deletes every memory in the partition)"
            )
        count = self.store.delete_by_scope(**scopes)
        return {"message": f"Deleted {count} memories"}

    def batch_update(self, memories: list[dict], *, project: str | None = None) -> dict:
        if len(memories) > 1000:
            raise ValueError("Maximum of 1000 memories can be updated in a single request")
        for m in memories:
            self.update(m["memory_id"], project=project, text=m.get("text"), metadata=m.get("metadata"))
        return {"message": f"Successfully updated {len(memories)} memories"}

    def batch_delete(self, memories: list[dict], *, project: str | None = None) -> dict:
        if len(memories) > 1000:
            raise ValueError("Maximum of 1000 memories can be deleted in a single request")
        for m in memories:
            try:
                self.delete(m["memory_id"], project=project)
            except ValueError:
                continue
        return {"message": f"Successfully deleted {len(memories)} memories"}

    def _resolve_project(self, project: str | None) -> str:
        resolved = (project or self.config.get("project") or "").strip()
        if not resolved:
            raise ValueError("project is required; pass it explicitly")
        return resolved


class AsyncLanceMemory(LanceMemory):
    async def add(self, *a, **kw): return await asyncio.to_thread(super().add, *a, **kw)
    async def search(self, *a, **kw): return await asyncio.to_thread(super().search, *a, **kw)
    async def get_all(self, *a, **kw): return await asyncio.to_thread(super().get_all, *a, **kw)
    async def get(self, *a, **kw): return await asyncio.to_thread(super().get, *a, **kw)
    async def update(self, *a, **kw): return await asyncio.to_thread(super().update, *a, **kw)
    async def delete(self, *a, **kw): return await asyncio.to_thread(super().delete, *a, **kw)
    async def delete_all(self, *a, **kw): return await asyncio.to_thread(super().delete_all, *a, **kw)
    async def history(self, *a, **kw): return await asyncio.to_thread(super().history, *a, **kw)
    async def get_summary(self, *a, **kw): return await asyncio.to_thread(super().get_summary, *a, **kw)


def _scope_where(scopes: dict) -> str:
    return " AND ".join(f"{k} = '{v}'" for k, v in scopes.items() if v is not None) or "1=1"


def _now_iso() -> str:
    return f"to_timestamp('{_utcnow().isoformat()}')"


def _default_expiration(config: dict) -> datetime | None:
    days = config.get("expiration_default_days")
    return _utcnow() + timedelta(days=int(days)) if days else None


def _safe_json(v) -> dict:
    if v is None: return {}
    if isinstance(v, dict): return v
    try: return json.loads(v)
    except Exception: return {}


def _content_to_text(content: Any) -> str:
    if isinstance(content, str): return content
    if isinstance(content, list):
        return " ".join(
            b.get("text", "") if isinstance(b, dict) and b.get("type") == "text" else "[image]"
            for b in content
        )
    return str(content or "")


def _extract_entity_names(text: str) -> list[str]:
    import re
    candidates = re.findall(r"\b[A-Z][a-zA-Z]{2,}\b", text)
    quoted = re.findall(r"\"([^\"]+)\"", text)
    seen, out = set(), []
    for c in candidates + quoted:
        if c.lower() in {"the", "and", "but"}: continue
        if c not in seen:
            seen.add(c); out.append(c)
    return out[:10]
