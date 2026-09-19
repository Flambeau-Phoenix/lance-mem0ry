"""Optional reranker. Fail-open: return None on any error."""
from __future__ import annotations
from typing import Sequence


class Reranker:
    def __init__(self, provider: str, config: dict):
        self.provider = provider
        self.config = config
        self._impl = self._build()

    @classmethod
    def maybe_from_config(cls, cfg: dict | None) -> "Reranker | None":
        if not cfg:
            return None
        try:
            return cls(cfg["provider"], cfg.get("config", {}))
        except Exception:
            return None

    def _build(self):
        if self.provider == "cohere":
            import cohere
            return cohere.Client(api_key=self.config["api_key"])
        if self.provider == "sentence_transformer":
            from sentence_transformers import CrossEncoder
            return CrossEncoder(self.config["model"], device=self.config.get("device", "cpu"))
        raise ValueError(f"Unsupported reranker provider: {self.provider}")

    def rerank(self, query: str, docs: Sequence[str], top_k: int | None = None):
        try:
            if self.provider == "cohere":
                resp = self._impl.rerank(
                    model=self.config.get("model", "rerank-v3.5"),
                    query=query,
                    documents=list(docs),
                    top_n=top_k or len(docs),
                )
                return [(r.index, float(r.relevance_score)) for r in resp.results]
            if self.provider == "sentence_transformer":
                pairs = [(query, d) for d in docs]
                scores = self._impl.predict(pairs)
                ranked = sorted(enumerate(scores), key=lambda x: -float(x[1]))
                if top_k:
                    ranked = ranked[:top_k]
                return [(int(i), float(s)) for i, s in ranked]
            return None
        except Exception:
            return None
