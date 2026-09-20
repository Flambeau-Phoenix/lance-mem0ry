"""Configuration -- mirrors Mem0's dict idiom."""
from __future__ import annotations
import os
from pathlib import Path
from typing import Any


DEFAULT_CONFIG: dict[str, Any] = {
    "project": "",
    "vector_store": {
        "provider": "lancedb",
        "config": {
            "uri": os.environ.get("LANCE_MEMORY_URI", "./lance_memory"),
            "table": "memories",
            "embedding_model_dims": int(os.environ.get("LANCE_MEMORY_EMBEDDER_DIMS", 768)),
            "index_type": "IVF_PQ",
            "metric": "cosine",
        },
    },
    "llm": {
        "provider": os.environ.get("LANCE_MEMORY_LLM_PROVIDER", "ollama"),
        "config": {
            "model": os.environ.get("LANCE_MEMORY_LLM", "llama3.2:3b"),
            "temperature": 0.1,
            "max_tokens": 2000,
            "enable_vision": False,
        },
    },
    "embedder": {
        "provider": os.environ.get("LANCE_MEMORY_EMBEDDER_PROVIDER", "ollama"),
        "config": {
            "model": os.environ.get("LANCE_MEMORY_EMBEDDER", "nomic-embed-text"),
            "dims": int(os.environ.get("LANCE_MEMORY_EMBEDDER_DIMS", 768)),
            "host": os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434"),
        },
    },
    "reranker": None,
    "custom_instructions": None,
    "custom_categories": [],
    "expiration_default_days": None,
    "top_k_default": 10,
    "threshold_default": 0.1,
    "max_context_tokens": 7000,
    "enable_graph": True,
    "enable_temporal": True,
    "llm_available": False,
    "llm_calls_per_hour": 60,
    "llm_calls_per_day": 400,
    "min_tokens_for_llm": 40,
    "max_candidate_pool": 40,
}


def openai_compatible_preset(
    base_url: str = "http://127.0.0.1:8080/v1",
    model: str = "local-model",
    api_key: str = "dummy",
) -> dict[str, Any]:
    """Return a ready-to-use LLM config dict for any OpenAI-compatible proxy."""
    return {
        "llm": {
            "provider": "openai_compatible",
            "config": {
                "base_url": os.environ.get("EXTRACTION_LLM_URL", base_url),
                "model": os.environ.get("EXTRACTION_LLM_MODEL", model),
                "api_key": os.environ.get("EXTRACTION_LLM_API_KEY", api_key),
                "temperature": 0.1,
                "max_tokens": 2000,
            },
        },
        "llm_available": True,
    }


def _deep_merge(base: dict, override: dict) -> dict:
    out = dict(base)
    for k, v in override.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def load_config(override: dict | None = None) -> dict:
    cfg = _deep_merge(DEFAULT_CONFIG, override or {})
    # If provider is openai_compatible and base_url/model not specified, apply defaults
    llm_prov = cfg.get("llm", {}).get("provider")
    if llm_prov == "openai_compatible":
        llm_cfg = cfg["llm"].setdefault("config", {})
        llm_cfg.setdefault("base_url", os.environ.get("EXTRACTION_LLM_URL", "http://127.0.0.1:8080/v1"))
        if not llm_cfg.get("model") or llm_cfg.get("model") == "llama3.2:3b":
            llm_cfg["model"] = os.environ.get("EXTRACTION_LLM_MODEL", "local-model")
        llm_cfg.setdefault("api_key", os.environ.get("EXTRACTION_LLM_API_KEY", "dummy"))
        cfg["llm_available"] = True



    uri = Path(cfg["vector_store"]["config"]["uri"])
    uri.mkdir(parents=True, exist_ok=True)
    return cfg
