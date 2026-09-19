"""Fact extraction, category classification, temporal metadata."""
from __future__ import annotations
import json
import os
import re
from typing import Any

from openai import OpenAI

DEFAULT_EXTRACTION_PROMPT = """You extract long-term memory facts from conversations.

Return ONLY JSON of the form {"facts": ["...", "..."]}.
Use {"facts": []} when nothing is worth storing.

Rules:
- Store stable facts, preferences, goals, constraints, and events.
- Skip greetings, filler, and pure pleasantries.
- Skip hypotheticals unless they describe a plan.
- One fact per array item; phrase each as a standalone sentence.
"""


class Extractor:
    def __init__(self, llm_config: dict):
        cfg = llm_config.get("config", {})
        self.provider = llm_config.get("provider", "ollama")
        default_model = (
            os.environ.get("EXTRACTION_LLM_MODEL", "local-model")
            if self.provider == "openai_compatible"
            else "llama3.2:3b"
        )
        self.model = cfg.get("model", default_model)
        self.temperature = cfg.get("temperature", 0.1)
        self.max_tokens = cfg.get("max_tokens", 2000)

        default_base = (
            os.environ.get("EXTRACTION_LLM_URL", "http://127.0.0.1:8080/v1")
            if self.provider == "openai_compatible"
            else "http://127.0.0.1:11434/v1"
            if self.provider == "ollama"
            else None
        )
        base_url = cfg.get(
            "base_url",
            os.environ.get("LANCE_MEMORY_LLM_BASE", default_base),
        )
        api_key = cfg.get(
            "api_key",
            os.environ.get(
                "EXTRACTION_LLM_API_KEY" if self.provider == "openai_compatible" else "OPENAI_API_KEY",
                "dummy" if self.provider == "openai_compatible" else "ollama" if self.provider == "ollama" else "",
            ),
        )
        try:
            if base_url:
                self._client = OpenAI(base_url=base_url, api_key=api_key or "dummy")
            elif api_key:
                self._client = OpenAI(api_key=api_key)
            else:
                self._client = None
        except Exception:
            self._client = None

    def extract(
        self,
        messages: list[dict],
        *,
        context_memories: list[str] | None = None,
        custom_instructions: str | None = None,
    ) -> list[str]:
        if not self._client:
            return []
        prompt = custom_instructions or DEFAULT_EXTRACTION_PROMPT
        if context_memories:
            prompt += "\n\nExisting memories (avoid duplicating these):\n"
            prompt += "\n".join(f"- {m}" for m in context_memories[:50])

        rendered = self._render(messages)
        try:
            try:
                resp = self._client.chat.completions.create(
                    model=self.model,
                    temperature=self.temperature,
                    max_tokens=self.max_tokens,
                    response_format={"type": "json_object"},
                    messages=[
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": rendered},
                    ],
                )
            except Exception:
                # Fallback for models that do not support response_format json_object
                resp = self._client.chat.completions.create(
                    model=self.model,
                    temperature=self.temperature,
                    max_tokens=self.max_tokens,
                    messages=[
                        {"role": "system", "content": prompt},
                        {"role": "user", "content": rendered},
                    ],
                )
            raw = resp.choices[0].message.content or "{}"
        except Exception:
            return []
        return _parse_facts(raw)

    def classify_categories(self, fact: str, palette: list[dict]) -> list[str]:
        if not self._client or not palette:
            return []
        catalog = "\n".join(
            f"- {next(iter(c))}: {next(iter(c.values()))}"
            for c in palette
            if isinstance(c, dict) and c
        )
        prompt = (
            "Classify the fact into zero or more categories from this catalog.\n"
            f"{catalog}\n\n"
            'Return ONLY JSON: {"categories": ["name1", "name2"]}'
        )
        try:
            resp = self._client.chat.completions.create(
                model=self.model,
                temperature=0.0,
                max_tokens=200,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": fact},
                ],
            )
            data = json.loads(resp.choices[0].message.content or "{}")
            cats = data.get("categories", [])
            valid = {next(iter(c)) for c in palette if isinstance(c, dict) and c}
            return [c for c in cats if c in valid]
        except Exception:
            return []

    def temporal_metadata(self, fact: str, source_text: str) -> dict:
        if not self._client:
            return {}
        prompt = (
            "Read the fact and its source. Return ONLY JSON with keys:\n"
            '  event_time: ISO date or null\n'
            '  ongoing: true|false|null\n'
            '  precision: "exact"|"day"|"month"|"year"|"vague"\n'
            '  memory_type: "event"|"state"|"plan"|"preference"|"relationship"|"absence"\n'
        )
        try:
            resp = self._client.chat.completions.create(
                model=self.model,
                temperature=0.0,
                max_tokens=200,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": f"Fact: {fact}\nSource: {source_text[:1500]}"},
                ],
            )
            return json.loads(resp.choices[0].message.content or "{}")
        except Exception:
            return {}

    @staticmethod
    def _render(messages: list[dict]) -> str:
        out = []
        for m in messages:
            role = m.get("role", "user")
            content = m.get("content", "")
            if isinstance(content, list):
                content = " ".join(
                    b.get("text", "[image]") if isinstance(b, dict) else str(b)
                    for b in content
                )
            out.append(f"{role}: {content}")
        return "\n".join(out)


def _parse_facts(raw: str) -> list[str]:
    try:
        data = json.loads(raw)
        facts = data.get("facts", [])
        if isinstance(facts, list):
            return [str(f).strip() for f in facts if str(f).strip()]
    except json.JSONDecodeError:
        pass
    # Salvage: find first {...}
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        try:
            data = json.loads(match.group(0))
            facts = data.get("facts", [])
            if isinstance(facts, list):
                return [str(f).strip() for f in facts if str(f).strip()]
        except Exception:
            pass
    # Last resort: non-empty lines
    return [l.strip("- •*").strip() for l in raw.splitlines() if l.strip()][:10]
