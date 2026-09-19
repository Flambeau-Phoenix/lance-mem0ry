"""SessionMemory: one-turn read, one-turn write, handoff to LanceMemory."""
from __future__ import annotations
import uuid

from .short_term import ShortTermMemory
from .memory import LanceMemory


class SessionMemory:
    def __init__(self, *, project: str, user_id: str | None = None, agent_id: str | None = None,
                 run_id: str | None = None, session_id: str | None = None,
                 long_term: LanceMemory | None = None,
                 max_tokens: int = 4000, max_turns: int = 30):
        self.long_term = long_term or LanceMemory()
        self.short = ShortTermMemory(
            session_id=session_id or str(uuid.uuid4()),
            project=project, user_id=user_id, agent_id=agent_id, run_id=run_id,
            max_tokens=max_tokens, max_turns=max_turns,
        )
        self._turn_open = False
        self._turn_reads = 0
        self._turn_writes = 0
        self._extractor = self.long_term.extractor

    def begin_turn(self):
        if self._turn_open:
            raise RuntimeError("A turn is already open -- call end_turn() first")
        self._turn_open = True
        self._turn_reads = 0
        self._turn_writes = 0

    def end_turn(self):
        if not self._turn_open:
            raise RuntimeError("No turn is open")
        self._turn_open = False

    def read(self, *, query: str | None = None, filters: dict | None = None,
             recall_from_long_term: bool = True, top_k: int = 5) -> dict:
        if not self._turn_open:
            raise RuntimeError("read() must be called inside begin_turn()/end_turn()")
        if self._turn_reads > 0:
            raise RuntimeError("read() may only be called once per turn")
        self._turn_reads += 1

        snapshot = self.short.snapshot()
        recall: list[dict] = []
        if recall_from_long_term and query:
            flt = dict(filters or {})
            if self.short.user_id:
                flt.setdefault("user_id", self.short.user_id)
            if self.short.agent_id:
                flt.setdefault("agent_id", self.short.agent_id)
            try:
                recalled = self.long_term.search(
                    query, project=self.short.project, filters=flt, top_k=top_k
                )
                recall = recalled.get("results", [])
            except ValueError:
                recall = []
        snapshot["recall"] = recall
        return snapshot

    def write(self, *, user_message: str | None = None,
              assistant_response: str | None = None,
              tool_calls: list[dict] | None = None,
              scratchpad_updates: dict | None = None):
        if not self._turn_open:
            raise RuntimeError("write() must be called inside begin_turn()/end_turn()")
        if self._turn_writes > 0:
            raise RuntimeError("write() may only be called once per turn")
        self._turn_writes += 1
        if user_message:
            self.short.record_turn("user", user_message)
        if assistant_response:
            self.short.record_turn("assistant", assistant_response)
        for tc in tool_calls or []:
            self.short.record_turn("tool", tool_name=tc.get("name"),
                                   tool_args=tc.get("args"), tool_result=tc.get("result"))
        if scratchpad_updates:
            self.short.update_scratchpad(**scratchpad_updates)

    def handoff(self, *, reason: str | None = None) -> dict:
        messages = [t.to_message() for t in self.short.turns]
        if not messages:
            return self.short.to_handoff_packet(summary="", facts=[])

        facts = self._extractor.extract(
            messages, context_memories=[],
            custom_instructions=self.long_term.config.get("custom_instructions"),
        )
        summary = self._summarize(messages)

        scopes = {
            "project": self.short.project,
            "user_id": self.short.user_id,
            "agent_id": self.short.agent_id,
            "run_id": self.short.run_id or self.short.session_id,
        }
        if facts:
            self.long_term.add(
                facts, **scopes,
                metadata={"source": "session_handoff", "session_id": self.short.session_id},
                categories=["session_facts"], infer=False,
            )
        if summary:
            self.long_term.add(
                summary, **scopes,
                metadata={"source": "session_summary", "session_id": self.short.session_id,
                          "handoff_reason": reason},
                categories=["session_summary"], immutable=True, infer=False,
            )
        return self.short.to_handoff_packet(summary=summary, facts=facts)

    def _summarize(self, messages: list[dict]) -> str:
        try:
            client = self.long_term.extractor._client
            model = self.long_term.extractor.model
            text = "\n".join(
                f"{m.get('role')}: {m.get('content', '')[:500]}" for m in messages
            )
            resp = client.chat.completions.create(
                model=model, temperature=0.2, max_tokens=400,
                messages=[
                    {"role": "system", "content":
                        "Summarize this session in 3-6 sentences. Capture: intent, "
                        "key decisions, open questions, and anything the next session "
                        "should know to continue smoothly. Be concrete, no filler."},
                    {"role": "user", "content": text[:8000]},
                ],
            )
            return (resp.choices[0].message.content or "").strip()
        except Exception:
            return self._cheap_summary()

    def _cheap_summary(self) -> str:
        sp = self.short.scratchpad
        parts = []
        if sp.intent: parts.append(f"Intent: {sp.intent}")
        if sp.pending_tasks: parts.append(f"Open: {'; '.join(sp.pending_tasks[:3])}")
        if sp.open_questions: parts.append(f"Questions: {'; '.join(sp.open_questions[:2])}")
        last_user = next((t.content for t in reversed(self.short.turns) if t.role == "user"), "")
        last_asst = next((t.content for t in reversed(self.short.turns) if t.role == "assistant"), "")
        if last_user: parts.append(f"Last user: {last_user[:200]}")
        if last_asst: parts.append(f"Last reply: {last_asst[:200]}")
        return "\n".join(parts)


class AgentSession(SessionMemory):
    """First-class SessionMemory tailored for autonomous agent loops."""
    def __init__(
        self,
        project: str,
        session_id: str | None = None,
        long_term: LanceMemory | None = None,
        max_tokens: int = 6000,
        max_turns: int = 50,
    ):
        super().__init__(
            project=project,
            user_id="agent",
            agent_id="agent",
            session_id=session_id or f"session-{uuid.uuid4().hex[:8]}",
            long_term=long_term,
            max_tokens=max_tokens,
            max_turns=max_turns,
        )

