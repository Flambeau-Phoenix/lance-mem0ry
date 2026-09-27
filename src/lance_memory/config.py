"""Configuration -- mirrors Mem0's dict idiom."""
from __future__ import annotations
import os
from pathlib import Path
from typing import Any


DEFAULT_CONFIG: dict[str, Any] = {
    "project": os.environ.get("PROJECT_MEMORY", ""),
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


def _first_env(*names: str, default: str = "") -> str:
    for name in names:
        val = os.environ.get(name)
        if val is not None and str(val).strip() != "":
            return str(val)
    return default


def openai_compatible_preset(
    base_url: str = "http://127.0.0.1:8080/v1",
    model: str = "gpt-4o-mini",
    api_key: str = "dummy",
) -> dict[str, Any]:
    """Return LLM config for an OpenAI-compatible HTTP endpoint.

    Canonical env vars: EXTRACTION_LLM_URL / EXTRACTION_LLM_MODEL /
    EXTRACTION_LLM_API_KEY (or OPENAI_API_KEY / LANCE_MEMORY_LLM_*).
    Legacy BUTTER_* vars are still read as fallbacks.
    """
    return {
        "llm": {
            "provider": "openai_compatible",
            "config": {
                "base_url": _first_env(
                    "EXTRACTION_LLM_URL",
                    "LANCE_MEMORY_LLM_BASE",
                    "OPENAI_BASE_URL",
                    "BUTTER_URL",
                    default=base_url,
                ),
                "model": _first_env(
                    "EXTRACTION_LLM_MODEL",
                    "LANCE_MEMORY_LLM",
                    "BUTTER_MODEL",
                    default=model,
                ),
                "api_key": _first_env(
                    "EXTRACTION_LLM_API_KEY",
                    "OPENAI_API_KEY",
                    "BUTTER_API_KEY",
                    default=api_key,
                ),
                "temperature": 0.1,
                "max_tokens": 2000,
            },
        },
        "llm_available": True,
    }


def butter_preset(
    base_url: str = "http://127.0.0.1:8080/v1",
    model: str = "gpt-4o-mini",
    api_key: str = "dummy",
) -> dict[str, Any]:
    """Deprecated alias for openai_compatible_preset (kept for compat)."""
    return openai_compatible_preset(base_url=base_url, model=model, api_key=api_key)


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
    llm_prov = (cfg.get("llm", {}) or {}).get("provider")
    # Canonical: openai_compatible. Legacy: butter (same behavior).
    if llm_prov in ("openai_compatible", "butter", "openai"):
        llm_cfg = cfg["llm"].setdefault("config", {})
        llm_cfg.setdefault(
            "base_url",
            _first_env(
                "EXTRACTION_LLM_URL",
                "LANCE_MEMORY_LLM_BASE",
                "OPENAI_BASE_URL",
                "BUTTER_URL",
                default="http://127.0.0.1:8080/v1",
            ),
        )
        default_model = cfg["llm"]["config"].get("model") or "llama3.2:3b"
        if not llm_cfg.get("model") or llm_cfg.get("model") == "llama3.2:3b":
            llm_cfg["model"] = _first_env(
                "EXTRACTION_LLM_MODEL",
                "LANCE_MEMORY_LLM",
                "BUTTER_MODEL",
                default="gpt-4o-mini" if llm_prov != "ollama" else default_model,
            )
        llm_cfg.setdefault(
            "api_key",
            _first_env(
                "EXTRACTION_LLM_API_KEY",
                "OPENAI_API_KEY",
                "BUTTER_API_KEY",
                default="dummy",
            ),
        )
        if llm_prov == "butter":
            # Normalize legacy provider name in the live config.
            cfg["llm"]["provider"] = "openai_compatible"
        cfg["llm_available"] = True

    uri = Path(cfg["vector_store"]["config"]["uri"])
    uri.mkdir(parents=True, exist_ok=True)
    return cfg
