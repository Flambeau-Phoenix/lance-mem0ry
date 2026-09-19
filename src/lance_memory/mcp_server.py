"""FastMCP server: memory + session + maintenance tools."""
from __future__ import annotations
import uuid
from typing import Any

from mcp.server.fastmcp import FastMCP

from .memory import LanceMemory
from .session import SessionMemory
from .harness import MaintenanceHarness


mcp = FastMCP("lancedb-memory")
_memory: LanceMemory | None = None
_sessions: dict[str, SessionMemory] = {}


def memory() -> LanceMemory:
    global _memory
    if _memory is None:
        _memory = LanceMemory()
    return _memory


# ---------- memory tools ----------

@mcp.tool()
def memory_add(messages, project: str, user_id: str | None = None, agent_id: str | None = None,
               run_id: str | None = None, app_id: str | None = None,
               metadata: dict | None = None, categories: list[str] | None = None,
               custom_instructions: str | None = None, infer: bool = True,
               immutable: bool = False, expiration_date: str | None = None) -> dict:
    """Store facts in one project partition."""
    return memory().add(
        messages, project=project, user_id=user_id, agent_id=agent_id, run_id=run_id, app_id=app_id,
        metadata=metadata, categories=categories, custom_instructions=custom_instructions,
        infer=infer, immutable=immutable, expiration_date=expiration_date,
    )


@mcp.tool()
def record_discovery(
    text: str,
    project: str,
    category: str = "key_facts",
    verified: bool = True,
    bucket: str = "fact",
    symbol: str = "",
    tags: list[str] | None = None,
    agent_id: str | None = None,
    run_id: str | None = None,
    source_ref: str = "",
) -> dict:
    """Store a classified engineering memory in one project partition."""
    return memory().record_discovery(
        text,
        project=project,
        category=category,
        verified=verified,
        bucket=bucket,
        symbol=symbol,
        tags=tags,
        agent_id=agent_id,
        run_id=run_id,
        source_ref=source_ref,
    )


@mcp.tool()
def memory_search(query: str, project: str, filters: dict | None = None, top_k: int = 10, threshold: float = 0.1,
                  rerank: bool = False, explain: bool = False, show_expired: bool = False) -> dict:
    """Search active memory in one project partition."""
    return memory().search(query, project=project, filters=filters, top_k=top_k, threshold=threshold,
                           rerank=rerank, explain=explain, show_expired=show_expired)


@mcp.tool()
def memory_get_all(project: str, filters: dict | None = None, page: int = 1, page_size: int = 100,
                   show_expired: bool = False) -> dict:
    """List memories for a scope. Paginated."""
    return memory().get_all(project=project, filters=filters, page=page, page_size=page_size,
                            show_expired=show_expired)


@mcp.tool()
def memory_get(memory_id: str, project: str) -> dict:
    """Fetch a single memory."""
    return memory().get(memory_id, project=project)


@mcp.tool()
def memory_update(memory_id: str, project: str, text: str | None = None,
                  metadata: dict | None = None, expiration_date: str | None = None) -> dict:
    """Update a memory."""
    return memory().update(memory_id, project=project, text=text, metadata=metadata,
                           expiration_date=expiration_date)


@mcp.tool()
def memory_delete(memory_id: str, project: str, delete_linked: bool = False) -> dict:
    """Delete a memory."""
    return memory().delete(memory_id, project=project, delete_linked=delete_linked)


@mcp.tool()
def memory_delete_all(project: str, user_id: str | None = None, agent_id: str | None = None,
                      run_id: str | None = None, app_id: str | None = None,
                      confirm: bool = False) -> dict:
    """Delete memories in one project. Full wipe requires confirm=True."""
    return memory().delete_all(
        project=project, user_id=user_id, agent_id=agent_id,
        run_id=run_id, app_id=app_id, confirm=confirm,
    )


@mcp.tool()
def memory_history(memory_id: str, project: str) -> list[dict]:
    """Audit trail for a memory."""
    return memory().history(memory_id, project=project)


@mcp.tool()
def memory_summary(project: str, filters: dict | None = None) -> dict:
    """Compact count + list of texts."""
    return memory().get_summary(project=project, filters=filters)


# ---------- session tools ----------

@mcp.tool()
def session_begin(project: str, user_id: str | None = None, agent_id: str | None = None, run_id: str | None = None,
                  session_id: str | None = None, max_tokens: int = 4000,
                  max_turns: int = 30) -> dict:
    """Start a session. Returns session_id."""
    sid = session_id or str(uuid.uuid4())
    sm = SessionMemory(project=project, user_id=user_id, agent_id=agent_id, run_id=run_id,
                       session_id=sid, long_term=memory(),
                       max_tokens=max_tokens, max_turns=max_turns)
    sm.begin_turn()
    _sessions[sid] = sm
    return {"session_id": sid}


@mcp.tool()
def session_read(session_id: str, query: str, top_k: int = 5) -> dict:
    """One-shot read for the current turn."""
    sm = _sessions.get(session_id)
    if not sm:
        raise ValueError(f"Unknown session: {session_id}")
    return sm.read(query=query, top_k=top_k)


@mcp.tool()
def session_write(session_id: str, user_message: str | None = None,
                  assistant_response: str | None = None,
                  tool_calls: list[dict] | None = None,
                  scratchpad_updates: dict | None = None) -> dict:
    """One-shot write for the current turn."""
    sm = _sessions.get(session_id)
    if not sm:
        raise ValueError(f"Unknown session: {session_id}")
    sm.write(user_message=user_message, assistant_response=assistant_response,
             tool_calls=tool_calls, scratchpad_updates=scratchpad_updates)
    sm.end_turn()
    return {"ok": True}


@mcp.tool()
def session_next_turn(session_id: str) -> dict:
    """Open the next turn. Auto-handoff if over budget."""
    sm = _sessions.get(session_id)
    if not sm:
        raise ValueError(f"Unknown session: {session_id}")
    should, reason = sm.short.should_handoff()
    if should:
        packet = sm.handoff(reason=reason)
        _sessions.pop(session_id, None)
        return {"handoff": True, "reason": reason, "packet": packet}
    sm.begin_turn()
    return {"handoff": False}


@mcp.tool()
def session_handoff(session_id: str, reason: str = "session_end") -> dict:
    """Force a handoff."""
    sm = _sessions.get(session_id)
    if not sm:
        raise ValueError(f"Unknown session: {session_id}")
    packet = sm.handoff(reason=reason)
    _sessions.pop(session_id, None)
    return packet


# ---------- maintenance tools ----------

@mcp.tool()
def memory_maintenance_scan(project: str, scan_type: str, threshold: float = 0.03,
                            older_than_days: int = 90, min_cluster: int = 3) -> dict:
    """Read-only scan. Returns a worklist.

    scan_type: duplicates | expired | stale | synthesis
    """
    mh = MaintenanceHarness(memory())
    if scan_type == "duplicates":
        return {"worklist": mh.scan_duplicates(project=project, threshold=threshold)}
    if scan_type == "expired":
        return {"worklist": mh.scan_expired(project=project)}
    if scan_type == "stale":
        return {"worklist": mh.scan_stale(project=project, older_than_days=older_than_days)}
    if scan_type == "synthesis":
        return {"worklist": mh.scan_for_synthesis(project=project, min_cluster=min_cluster)}
    raise ValueError(f"Unknown scan_type: {scan_type}")


@mcp.tool()
def memory_maintenance_apply(action: str, payload: dict) -> dict:
    """Execute a maintenance decision.

    action: merge_duplicate | delete_expired | demote | promote | synthesize
    """
    mh = MaintenanceHarness(memory())
    if action == "merge_duplicate":
        return mh.apply_duplicate_merge(**payload)
    if action == "delete_expired":
        return mh.apply_delete_expired(**payload)
    if action == "demote":
        return mh.apply_demote(**payload)
    if action == "promote":
        return mh.apply_promote(**payload)
    if action == "synthesize":
        return mh.apply_synthesize(**payload)
    raise ValueError(f"Unknown action: {action}")


@mcp.tool()
def memory_budget_status() -> dict:
    """Current LLM call budget usage."""
    return memory().write_harness.tracker.snapshot()


def main():
    mcp.run()


if __name__ == "__main__":
    main()
