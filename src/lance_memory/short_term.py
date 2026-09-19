"""Short-term working memory for a single session/turn loop."""
from __future__ import annotations
import json
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any, Literal


TurnRole = Literal["user", "assistant", "system", "tool"]


@dataclass
class Turn:
    role: TurnRole
    content: str
    tool_name: str | None = None
    tool_args: dict | None = None
    tool_result: Any = None
    ts: float = field(default_factory=time.time)
    tokens: int = 0

    def to_message(self) -> dict:
        if self.role == "tool":
            return {"role": "tool", "name": self.tool_name, "content": _stringify(self.tool_result)}
        return {"role": self.role, "content": self.content}


@dataclass
class Scratchpad:
    intent: str | None = None
    pending_tasks: list[str] = field(default_factory=list)
    open_questions: list[str] = field(default_factory=list)
    corrections: list[str] = field(default_factory=list)
    entities_mentioned: list[str] = field(default_factory=list)
    mood: str | None = None
    phase: str | None = None

    def merge(self, **updates):
        for k, v in updates.items():
            cur = getattr(self, k, None)
            if isinstance(cur, list) and isinstance(v, list):
                setattr(self, k, cur + [x for x in v if x not in cur])
            else:
                setattr(self, k, v)


class ShortTermMemory:
    def __init__(self, *, session_id: str, project: str, user_id: str | None = None,
                 agent_id: str | None = None, run_id: str | None = None,
                 max_tokens: int = 4000, max_turns: int = 30, keep_system: bool = True):
        self.session_id = session_id
        self.project = project
        self.user_id = user_id
        self.agent_id = agent_id
        self.run_id = run_id
        self.max_tokens = max_tokens
        self.max_turns = max_turns
        self.keep_system = keep_system
        self.turns: list[Turn] = []
        self.scratchpad = Scratchpad()
        self.started_at = datetime.now(timezone.utc)
        self._read_count = 0
        self._write_count = 0
        self._system_message: dict | None = None

    def set_system(self, content: str):
        self._system_message = {"role": "system", "content": content}

    def record_turn(self, role: TurnRole, content: str = "",
                    tool_name: str | None = None, tool_args: dict | None = None,
                    tool_result: Any = None) -> Turn:
        turn = Turn(role=role, content=content, tool_name=tool_name,
                    tool_args=tool_args, tool_result=tool_result,
                    tokens=_estimate_tokens(content or _stringify(tool_result)))
        self.turns.append(turn)
        self._write_count += 1
        self._enforce_budget()
        return turn

    def update_scratchpad(self, **kwargs):
        self.scratchpad.merge(**kwargs)

    def _enforce_budget(self):
        while self._total_tokens() > self.max_tokens and len(self.turns) > 4:
            self.turns.pop(0)

    def _total_tokens(self) -> int:
        return sum(t.tokens for t in self.turns)

    def snapshot(self) -> dict:
        self._read_count += 1
        return {
            "system": self._system_message["content"] if self._system_message else None,
            "messages": [t.to_message() for t in self.turns],
            "scratchpad": asdict(self.scratchpad),
            "budget": {"used": self._total_tokens(), "cap": self.max_tokens, "turns": len(self.turns)},
        }

    def should_handoff(self) -> tuple[bool, str | None]:
        if len(self.turns) >= self.max_turns:
            return True, "turn_limit"
        if self._total_tokens() >= self.max_tokens:
            return True, "token_limit"
        return False, None

    def to_handoff_packet(self, summary: str, facts: list[str]) -> dict:
        return {
            "session_id": self.session_id,
            "handoff_at": datetime.now(timezone.utc).isoformat(),
            "project": self.project,
            "user_id": self.user_id,
            "agent_id": self.agent_id,
            "run_id": self.run_id,
            "summary": summary,
            "facts": facts,
            "scratchpad": asdict(self.scratchpad),
            "stats": {
                "turns": len(self.turns),
                "reads": self._read_count,
                "writes": self._write_count,
                "tokens_used": self._total_tokens(),
                "duration_seconds": (datetime.now(timezone.utc) - self.started_at).total_seconds(),
            },
        }


def _estimate_tokens(text: str) -> int:
    return max(1, len(text or "") // 4)


def _stringify(v: Any) -> str:
    if v is None: return ""
    if isinstance(v, str): return v
    try: return json.dumps(v)
    except Exception: return str(v)
