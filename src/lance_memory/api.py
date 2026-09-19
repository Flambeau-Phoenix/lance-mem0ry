"""FastAPI REST mirror of the MCP surface."""
from __future__ import annotations
import os
import uuid

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .memory import LanceMemory
from .session import SessionMemory
from .harness import MaintenanceHarness


app = FastAPI(title="LanceMemory API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

_memory = LanceMemory()
_mh = MaintenanceHarness(_memory)
_sessions: dict[str, SessionMemory] = {}
AUTH_TOKEN = os.environ.get("LANCE_MEMORY_TOKEN")


def _check_auth(authorization: str | None):
    if not AUTH_TOKEN:
        return
    if authorization != f"Bearer {AUTH_TOKEN}":
        raise HTTPException(status_code=401, detail="Unauthorized")


class AddRequest(BaseModel):
    messages: str | list[dict]
    project: str
    user_id: str | None = None
    agent_id: str | None = None
    run_id: str | None = None
    app_id: str | None = None
    metadata: dict | None = None
    categories: list[str] | None = None
    infer: bool = True
    immutable: bool = False
    expiration_date: str | None = None


class SearchRequest(BaseModel):
    query: str
    project: str
    filters: dict | None = None
    top_k: int = 10
    threshold: float = 0.1
    rerank: bool = False
    explain: bool = False
    show_expired: bool = False


class UpdateRequest(BaseModel):
    text: str | None = None
    metadata: dict | None = None
    expiration_date: str | None = None


class SessionBeginRequest(BaseModel):
    project: str
    user_id: str | None = None
    agent_id: str | None = None
    run_id: str | None = None
    session_id: str | None = None
    max_tokens: int = 4000
    max_turns: int = 30


class SessionReadRequest(BaseModel):
    query: str
    top_k: int = 5


class SessionWriteRequest(BaseModel):
    user_message: str | None = None
    assistant_response: str | None = None
    tool_calls: list[dict] | None = None
    scratchpad_updates: dict | None = None


class MaintenanceApplyRequest(BaseModel):
    action: str
    payload: dict


@app.get("/health")
def health():
    return {"status": "ok", "budget": _memory.write_harness.tracker.snapshot()}


@app.post("/memories")
def add(req: AddRequest, authorization: str | None = Header(None)):
    _check_auth(authorization)
    return _memory.add(req.messages, project=req.project, user_id=req.user_id, agent_id=req.agent_id,
                       run_id=req.run_id, app_id=req.app_id, metadata=req.metadata,
                       categories=req.categories, infer=req.infer,
                       immutable=req.immutable, expiration_date=req.expiration_date)


@app.post("/memories/search")
def search(req: SearchRequest, authorization: str | None = Header(None)):
    _check_auth(authorization)
    return _memory.search(req.query, project=req.project, filters=req.filters, top_k=req.top_k,
                          threshold=req.threshold, rerank=req.rerank,
                          explain=req.explain, show_expired=req.show_expired)


@app.post("/memories/get_all")
def get_all(project: str, filters: dict | None = None, page: int = 1, page_size: int = 100,
            show_expired: bool = False, authorization: str | None = Header(None)):
    _check_auth(authorization)
    return _memory.get_all(project=project, filters=filters, page=page, page_size=page_size,
                           show_expired=show_expired)


@app.get("/memories/{memory_id}")
def get(memory_id: str, project: str, authorization: str | None = Header(None)):
    _check_auth(authorization)
    try:
        return _memory.get(memory_id, project=project)
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.patch("/memories/{memory_id}")
def update(memory_id: str, project: str, req: UpdateRequest, authorization: str | None = Header(None)):
    _check_auth(authorization)
    try:
        return _memory.update(memory_id, project=project, text=req.text, metadata=req.metadata,
                              expiration_date=req.expiration_date)
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.delete("/memories/{memory_id}")
def delete(memory_id: str, project: str, delete_linked: bool = False,
           authorization: str | None = Header(None)):
    _check_auth(authorization)
    try:
        return _memory.delete(memory_id, project=project, delete_linked=delete_linked)
    except ValueError as e:
        raise HTTPException(404, str(e))


@app.delete("/memories")
def delete_all(project: str, user_id: str | None = None, agent_id: str | None = None,
               run_id: str | None = None, app_id: str | None = None,
               authorization: str | None = Header(None)):
    _check_auth(authorization)
    try:
        return _memory.delete_all(project=project, user_id=user_id, agent_id=agent_id,
                                  run_id=run_id, app_id=app_id)
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/memories/{memory_id}/history")
def history(memory_id: str, project: str, authorization: str | None = Header(None)):
    _check_auth(authorization)
    return _memory.history(memory_id, project=project)


@app.post("/sessions")
def session_begin(req: SessionBeginRequest, authorization: str | None = Header(None)):
    _check_auth(authorization)
    sid = req.session_id or str(uuid.uuid4())
    sm = SessionMemory(project=req.project, user_id=req.user_id, agent_id=req.agent_id, run_id=req.run_id,
                       session_id=sid, long_term=_memory,
                       max_tokens=req.max_tokens, max_turns=req.max_turns)
    sm.begin_turn()
    _sessions[sid] = sm
    return {"session_id": sid}


@app.post("/sessions/{session_id}/read")
def session_read(session_id: str, req: SessionReadRequest,
                 authorization: str | None = Header(None)):
    _check_auth(authorization)
    sm = _sessions.get(session_id)
    if not sm: raise HTTPException(404, "Unknown session")
    return sm.read(query=req.query, top_k=req.top_k)


@app.post("/sessions/{session_id}/write")
def session_write(session_id: str, req: SessionWriteRequest,
                  authorization: str | None = Header(None)):
    _check_auth(authorization)
    sm = _sessions.get(session_id)
    if not sm: raise HTTPException(404, "Unknown session")
    sm.write(user_message=req.user_message, assistant_response=req.assistant_response,
             tool_calls=req.tool_calls, scratchpad_updates=req.scratchpad_updates)
    sm.end_turn()
    return {"ok": True}


@app.post("/sessions/{session_id}/next_turn")
def session_next_turn(session_id: str, authorization: str | None = Header(None)):
    _check_auth(authorization)
    sm = _sessions.get(session_id)
    if not sm: raise HTTPException(404, "Unknown session")
    should, reason = sm.short.should_handoff()
    if should:
        packet = sm.handoff(reason=reason)
        _sessions.pop(session_id, None)
        return {"handoff": True, "reason": reason, "packet": packet}
    sm.begin_turn()
    return {"handoff": False}


@app.post("/sessions/{session_id}/handoff")
def session_handoff(session_id: str, reason: str = "session_end",
                    authorization: str | None = Header(None)):
    _check_auth(authorization)
    sm = _sessions.get(session_id)
    if not sm: raise HTTPException(404, "Unknown session")
    packet = sm.handoff(reason=reason)
    _sessions.pop(session_id, None)
    return packet


@app.post("/maintenance/scan")
def maintenance_scan(project: str, scan_type: str, threshold: float = 0.03,
                     older_than_days: int = 90, min_cluster: int = 3,
                     authorization: str | None = Header(None)):
    _check_auth(authorization)
    if scan_type == "duplicates":
        return {"worklist": _mh.scan_duplicates(project=project, threshold=threshold)}
    if scan_type == "expired":
        return {"worklist": _mh.scan_expired(project=project)}
    if scan_type == "stale":
        return {"worklist": _mh.scan_stale(project=project, older_than_days=older_than_days)}
    if scan_type == "synthesis":
        return {"worklist": _mh.scan_for_synthesis(project=project, min_cluster=min_cluster)}
    raise HTTPException(400, f"Unknown scan_type: {scan_type}")


@app.post("/maintenance/apply")
def maintenance_apply(req: MaintenanceApplyRequest,
                      authorization: str | None = Header(None)):
    _check_auth(authorization)
    if req.action == "merge_duplicate": return _mh.apply_duplicate_merge(**req.payload)
    if req.action == "delete_expired":  return _mh.apply_delete_expired(**req.payload)
    if req.action == "demote":          return _mh.apply_demote(**req.payload)
    if req.action == "promote":         return _mh.apply_promote(**req.payload)
    if req.action == "synthesize":      return _mh.apply_synthesize(**req.payload)
    raise HTTPException(400, f"Unknown action: {req.action}")


@app.get("/budget")
def budget(authorization: str | None = Header(None)):
    _check_auth(authorization)
    return _memory.write_harness.tracker.snapshot()
