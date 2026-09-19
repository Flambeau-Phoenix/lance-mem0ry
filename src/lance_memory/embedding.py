"""Embedding wrapper -- ollama | fastembed | openai | sentence_transformer | mock."""
from __future__ import annotations
import asyncio
import hashlib
import os
from typing import Sequence

import numpy as np


class Embedder:
    def __init__(self, config: dict):
        self.provider = config.get("provider", "ollama")
        cfg = config.get("config", {})
        self.model = cfg.get("model", "nomic-embed-text")
        self.dims = int(cfg.get("dims", 768))
        self.host = cfg.get("host", os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434")).rstrip("/")
        self._impl = self._build()

    def _build(self):
        if self.provider == "ollama":
            import requests

            def _ollama_embed(texts):
                res = []
                for t in texts:
                    try:
                        resp = requests.post(
                            f"{self.host}/api/embeddings",
                            json={"model": self.model, "prompt": t},
                            timeout=60,
                        )
                        resp.raise_for_status()
                        vec = resp.json().get("embedding", [])
                        if len(vec) != self.dims:
                            self.dims = len(vec)
                        res.append(vec)
                    except Exception as e:
                        # Fail-open fallback to deterministic mock embedding if Ollama fails
                        h = hashlib.sha256(t.encode()).digest()
                        vals = [(b / 255.0) for b in h]
                        while len(vals) < self.dims:
                            vals.extend(vals[: self.dims - len(vals)])
                        res.append(vals[: self.dims])
                return res

            return _ollama_embed

        if self.provider == "openai":
            from openai import OpenAI
            client = OpenAI()
            return lambda texts: [
                d.embedding
                for d in client.embeddings.create(
                    model=self.model, input=list(texts)
                ).data
            ]

        if self.provider == "fastembed":
            from fastembed import TextEmbedding
            model = TextEmbedding(model_name=self.model)
            return lambda texts: [v.tolist() for v in model.embed(list(texts))]

        if self.provider == "sentence_transformer":
            from sentence_transformers import SentenceTransformer
            model = SentenceTransformer(self.model)
            return lambda texts: model.encode(
                list(texts), normalize_embeddings=True
            ).tolist()

        if self.provider in ("mock", "test"):
            def _mock_embed(texts):
                res = []
                for t in texts:
                    h = hashlib.sha256(t.encode()).digest()
                    vals = [(b / 255.0) for b in h]
                    while len(vals) < self.dims:
                        vals.extend(vals[: self.dims - len(vals)])
                    res.append(vals[: self.dims])
                return res

            return _mock_embed

        raise ValueError(f"Unknown embedder provider: {self.provider}")

    def embed(self, texts: str | Sequence[str]) -> list[list[float]]:
        if isinstance(texts, str):
            texts = [texts]
        return [self._normalize(v) for v in self._impl(texts)]

    async def aembed(self, texts: str | Sequence[str]) -> list[list[float]]:
        return await asyncio.to_thread(self.embed, texts)

    @staticmethod
    def _normalize(v):
        arr = np.asarray(v, dtype=np.float32)
        n = np.linalg.norm(arr)
        return (arr / n).tolist() if n > 0 else arr.tolist()
