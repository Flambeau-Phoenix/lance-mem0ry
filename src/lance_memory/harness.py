"""Write, Read, and Maintenance harnesses + budget tracking + heuristics."""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import pyarrow as pa


# ---------- Budget ----------

class BudgetTracker:
    def __init__(self, store):
        self.store = store
        self._ensure_table()

    def _ensure_table(self):
        listed = self.store._db.list_tables()
        names = listed.tables if hasattr(listed, "tables") else listed
        if "budget" not in names:
            schema = pa.schema([
                pa.field("bucket", pa.string()),
                pa.field("count", pa.int32()),
                pa.field("updated_at", pa.timestamp("us")),
            ])
            self.store._db.create_table("budget", schema=schema)
        self.tbl = self.store._db.open_table("budget")

    def _bucket(self, kind: str) -> str:
        now = datetime.now(timezone.utc)
        if kind == "hour": return f"hour:{now.strftime('%Y-%m-%dT%H')}"
        if kind == "day":  return f"day:{now.strftime('%Y-%m-%d')}"
        raise ValueError(f"Unknown bucket kind: {kind}")

    def count(self, kind: str) -> int:
        b = self._bucket(kind)
        rows = self.tbl.search().where(f"bucket = '{b}'").limit(1).to_list()
        return int(rows[0]["count"]) if rows else 0

    def incr(self, kind: str):
        b = self._bucket(kind)
        rows = self.tbl.search().where(f"bucket = '{b}'").limit(1).to_list()
        now = datetime.now(timezone.utc)
        if rows:
            self.tbl.update(
                where=f"bucket = '{b}'",
                values={"count": int(rows[0]["count"]) + 1, "updated_at": now},
            )
        else:
            self.tbl.add([{"bucket": b, "count": 1, "updated_at": now}])

    def snapshot(self) -> dict:
        return {"hour": self.count("hour"), "day": self.count("day")}


# ---------- Write harness ----------

ExtractionMode = Literal["llm", "heuristic", "raw"]


@dataclass
class WritePolicy:
    llm_calls_per_hour: int = 60
    llm_calls_per_day: int = 400
    min_tokens_for_llm: int = 40
    heuristic_fallback: bool = True
    force_llm_patterns: list[str] = field(default_factory=lambda: [
        r"\bremember\b", r"\bdon't forget\b", r"\bnote that\b",
        r"\bimportant:\b", r"\balways\b", r"\bnever\b",
    ])


class WriteHarness:
    def __init__(self, policy: WritePolicy, tracker: BudgetTracker, llm_available: bool = True):
        self.policy = policy
        self.tracker = tracker
        self.llm_available = llm_available
        self._force_re = re.compile("|".join(policy.force_llm_patterns), re.I) if policy.force_llm_patterns else None

    def decide(self, messages: list[dict], infer: bool) -> ExtractionMode:
        if not infer:
            return "raw"
        text = "\n".join(str(m.get("content", "")) for m in messages)
        if len(text.split()) < self.policy.min_tokens_for_llm:
            if not (self._force_re and self._force_re.search(text)):
                return "raw"
        if not self.llm_available:
            return "heuristic" if self.policy.heuristic_fallback else "raw"
        if self.tracker.count("hour") >= self.policy.llm_calls_per_hour:
            return "heuristic" if self.policy.heuristic_fallback else "raw"
        if self.tracker.count("day") >= self.policy.llm_calls_per_day:
            return "heuristic" if self.policy.heuristic_fallback else "raw"
        return "llm"

    def charge(self):
        self.tracker.incr("hour")
        self.tracker.incr("day")


# ---------- Heuristic extraction ----------

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_FILLER = re.compile(
    r"^(hi|hey|hello|thanks|thank you|ok|okay|sure|cool|nice|lol|haha|"
    r"yeah|yep|nope|got it|sounds good|no problem|you're welcome)[,.!]*$",
    re.I,
)
_FIRST_PERSON = re.compile(
    r"\b(i\s+am|i'm|i\s+have|i've|i\s+like|i\s+love|i\s+prefer|"
    r"i\s+want|i\s+need|i\s+don't|i\s+do\s+not|i\s+can't|i\s+cannot|"
    r"i\s+hate|my\s+\w+|mine|i'm\s+allergic)\b",
    re.I,
)
_IMPERATIVE = re.compile(r"\b(remember|note that|keep in mind|don't forget|always|never|make sure)\b", re.I)
_PROPER_NOUN = re.compile(r"\b[A-Z][a-z]{2,}\b")
_HAS_NUMBER = re.compile(r"\d")


def heuristic_extract(messages: list[dict], *, max_facts: int = 8,
                      min_words: int = 3, max_words: int = 40) -> list[str]:
    raw = " ".join(
        str(m.get("content", ""))
        for m in messages
        if m.get("role") == "user" and m.get("content")
    )
    if not raw.strip():
        return []
    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(raw) if s.strip()]
    facts: list[str] = []
    seen: set[str] = set()
    for s in sentences:
        n = len(s.split())
        if n < min_words or n > max_words:
            continue
        if _FILLER.match(s):
            continue
        key = s.lower().strip(".!? ")
        if key in seen:
            continue
        keep = False
        if _FIRST_PERSON.search(s): keep = True
        elif _IMPERATIVE.search(s): keep = True
        elif _HAS_NUMBER.search(s) and n <= 20: keep = True
        elif _PROPER_NOUN.search(s) and _FIRST_PERSON.search(s): keep = True
        if keep:
            facts.append(s)
            seen.add(key)
        if len(facts) >= max_facts:
            break
    return facts


# ---------- Read harness ----------

@dataclass
class ReadPolicy:
    max_candidate_pool: int = 40
    enable_entity_signal: bool = True
    enable_keyword_signal: bool = True
    rerank_only_if_query_words: int = 5
    rerank_only_if_candidates: int = 10
    skip_rerank_if_scoped: bool = True


class ReadHarness:
    def __init__(self, policy: ReadPolicy):
        self.policy = policy

    def plan(self, query: str, filters: dict, top_k: int, has_reranker: bool) -> dict:
        words = len(query.split())
        narrow_scope = "run_id" in filters or "app_id" in filters
        use_keyword = self.policy.enable_keyword_signal
        use_entity = self.policy.enable_entity_signal and not narrow_scope
        use_rerank = has_reranker and words >= self.policy.rerank_only_if_query_words
        if self.policy.skip_rerank_if_scoped and narrow_scope:
            use_rerank = False
        return {
            "candidate_pool": min(top_k * 4, self.policy.max_candidate_pool),
            "signals": {
                "semantic": True,
                "keyword": use_keyword,
                "entity": use_entity,
            },
            "rerank": use_rerank,
            "narrow_scope": narrow_scope,
        }


# ---------- Maintenance harness ----------

class MaintenanceHarness:
    def __init__(self, memory):
        self.m = memory

    def scan_duplicates(self, *, project: str, threshold: float = 0.03, max_scan: int = 500) -> list[dict]:
        rows = self.m.get_all(project=project, page_size=max_scan)["results"]
        dupes: list[dict] = []
        seen: list[tuple[str, str, list[float]]] = []
        for r in rows:
            full = self.m.store.get_memory(r["id"])
            if not full:
                continue
            vec = full.get("vector") or []
            for other_id, other_text, other_vec in seen:
                if not vec or not other_vec:
                    continue
                dot = sum(a * b for a, b in zip(vec, other_vec))
                dist = 1 - dot
                if dist < threshold:
                    dupes.append({
                        "keep_id": other_id,
                        "keep_text": other_text,
                        "merge_id": r["id"],
                        "merge_text": r["memory"],
                        "distance": round(dist, 4),
                    })
                    break
            else:
                seen.append((r["id"], r["memory"], vec))
        return dupes

    def scan_expired(self, *, project: str) -> list[dict]:
        now_iso = datetime.now(timezone.utc).isoformat()
        where = (
            f"project_id = '{project}' AND expiration_date IS NOT NULL "
            f"AND expiration_date < to_timestamp('{now_iso}')"
        )
        rows = self.m.store.memories.search().where(where).limit(10_000).to_list()
        return [{"id": r["id"], "memory": r["memory"], "expiration_date": r.get("expiration_date")} for r in rows]

    def scan_stale(self, *, project: str, older_than_days: int = 90, min_access: int = 0) -> list[dict]:
        cutoff = (datetime.now(timezone.utc) - timedelta(days=older_than_days)).isoformat()
        rows = (
            self.m.store.memories.search()
            .where(f"project_id = '{project}' AND created_at < to_timestamp('{cutoff}')")
            .limit(10_000).to_list()
        )
        return [{"id": r["id"], "memory": r["memory"], "created_at": r.get("created_at")} for r in rows]

    def scan_for_synthesis(self, *, project: str, min_cluster: int = 3, max_scan: int = 500) -> list[dict]:
        rows = self.m.get_all(project=project, page_size=max_scan)["results"]
        clusters: dict[str, list[dict]] = {}
        for r in rows:
            full = self.m.store.get_memory(r["id"])
            if not full:
                continue
            cats = full.get("categories") or ["uncategorized"]
            for cat in cats:
                if cat in ("synthesized", "session_summary", "session_facts"):
                    continue
                clusters.setdefault(cat, []).append({"id": r["id"], "memory": r["memory"]})
        candidates = []
        for cat, mems in clusters.items():
            if len(mems) >= min_cluster:
                candidates.append({
                    "cluster_id": cat,
                    "count": len(mems),
                    "memories": mems[:20],
                    "suggested_action": "synthesize_preference_or_pattern",
                })
        candidates.sort(key=lambda c: -c["count"])
        return candidates

    def apply_duplicate_merge(self, *, keep_id: str, merge_id: str) -> dict:
        self.m.store.mark_superseded(merge_id, keep_id)
        self.m.store.log_history(merge_id, "UPDATE", old_memory="(duplicate)", new_memory=f"superseded by {keep_id}")
        return {"status": "merged", "keep": keep_id, "merged": merge_id}

    def apply_delete_expired(self, *, ids: list[str]) -> dict:
        deleted = 0
        for mid in ids:
            try:
                self.m.delete(mid)
                deleted += 1
            except ValueError:
                continue
        return {"status": "deleted", "count": deleted}

    def apply_demote(self, *, ids: list[str], reason: str = "stale") -> dict:
        for mid in ids:
            try:
                self.m.store.update_memory(mid, {"score_hint": -0.5})
            except Exception:
                continue
        return {"status": "demoted", "count": len(ids), "reason": reason}

    def apply_promote(self, *, ids: list[str], reason: str = "frequent") -> dict:
        for mid in ids:
            try:
                self.m.store.update_memory(mid, {"score_hint": 0.5})
            except Exception:
                continue
        return {"status": "promoted", "count": len(ids), "reason": reason}

    def apply_synthesize(self, *, project: str, cluster_id: str,
                         synthesized_text: str, source_ids: list[str]) -> dict:
        result = self.m.add(
            synthesized_text, project=project,
            categories=[cluster_id, "synthesized"],
            metadata={"sources": source_ids, "synthesized": True},
            infer=False,
        )
        for sid in source_ids:
            try:
                self.m.store.mark_superseded(sid, result["results"][0]["id"])
            except Exception:
                continue
        return {"status": "synthesized", "result": result, "sources": source_ids}
