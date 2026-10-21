"""Tests for the Claude Code hook script. No lancedb, Ollama or real server needed."""
from __future__ import annotations

import importlib.util
import io
import json
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

HOOK_PATH = Path(__file__).resolve().parents[1] / "templates" / "hooks" / "lance_memory_hook.py"
spec = importlib.util.spec_from_file_location("lance_memory_hook", HOOK_PATH)
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)


class FakeServer:
    """Minimal stand-in for the panel's POST /api/mcp/execute endpoint."""

    def __init__(self):
        self.calls: list[dict] = []
        self.rows: list = []
        self.status = 200
        self.reply: dict | None = None
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802
                length = int(self.headers.get("Content-Length", 0))
                body = json.loads(self.rfile.read(length) or b"{}")
                outer.calls.append({"path": self.path, **body})
                payload = outer.reply if outer.reply is not None else {"data": outer.rows, "isError": False}
                raw = json.dumps(payload).encode()
                self.send_response(outer.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def log_message(self, *args):
                pass

        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.httpd.server_port}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()


@pytest.fixture()
def server(monkeypatch):
    fake = FakeServer()
    monkeypatch.setenv("LANCE_MEMORY_URL", fake.url)
    monkeypatch.setenv("LANCE_MEMORY_PROJECT_ID", "demo")
    monkeypatch.delenv("LANCE_MEMORY_HOOK_WRITE", raising=False)
    monkeypatch.delenv("LANCE_MEMORY_HOOK_DEBUG", raising=False)
    yield fake
    fake.close()


def run(monkeypatch, capsys, command, event=None):
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(event or {})))
    code = hook.main([command])
    captured = capsys.readouterr()
    return code, captured.out, captured.err


def test_project_id_from_env_wins(monkeypatch, tmp_path):
    monkeypatch.setenv("LANCE_MEMORY_PROJECT_ID", "from_env")
    (tmp_path / "AGENTS.md").write_text("lance_memory_project_id: from_file\n", encoding="utf-8")
    assert hook.find_project_id(str(tmp_path)) == "from_env"


@pytest.mark.parametrize("line", [
    "lance_memory_project_id: my_proj",
    "- lance_memory_project_id: my_proj",
    "`lance_memory_project_id`: `my_proj`",
])
def test_project_id_from_nearest_agents_md(monkeypatch, tmp_path, line):
    monkeypatch.delenv("LANCE_MEMORY_PROJECT_ID", raising=False)
    (tmp_path / "AGENTS.md").write_text(f"# Charter\n\n{line}\n", encoding="utf-8")
    nested = tmp_path / "a" / "b"
    nested.mkdir(parents=True)
    assert hook.find_project_id(str(nested)) == "my_proj"


def test_project_id_absent(monkeypatch, tmp_path):
    monkeypatch.delenv("LANCE_MEMORY_PROJECT_ID", raising=False)
    assert hook.find_project_id(str(tmp_path)) is None


def test_session_start_injects_recent_memories(server, monkeypatch, capsys):
    server.rows = [
        {"text": "Auth uses\nrotating keys.", "category": "key_facts", "created_at": "2026-10-01T10:00:00Z"},
        {"error": "ignored row"},
    ]
    code, out, _ = run(monkeypatch, capsys, "session-start", {"hook_event_name": "SessionStart"})
    assert code == 0
    payload = json.loads(out)["hookSpecificOutput"]
    assert payload["hookEventName"] == "SessionStart"
    assert "[key_facts] Auth uses rotating keys. (2026-10-01)" in payload["additionalContext"]
    assert "not instructions" in payload["additionalContext"]
    assert "ignored row" not in payload["additionalContext"]
    call = server.calls[0]
    assert call["path"] == "/api/mcp/execute" and call["tool"] == "recall"
    assert call["arguments"] == {"project_id": "demo", "search_type": "recent", "limit": 8}


def test_session_start_caps_untrusted_text(server, monkeypatch, capsys):
    server.rows = [{"text": "x" * 5000 + "\x00\x1b[31m", "category": "key_facts"} for _ in range(10)]
    _, out, _ = run(monkeypatch, capsys, "session-start")
    context = json.loads(out)["hookSpecificOutput"]["additionalContext"]
    assert len(context) <= hook.MAX_CONTEXT_CHARS
    assert "\x00" not in context and "\x1b" not in context


def test_session_start_without_notes_still_names_the_project(server, monkeypatch, capsys):
    _, out, _ = run(monkeypatch, capsys, "session-start")
    assert "No stored notes yet" in json.loads(out)["hookSpecificOutput"]["additionalContext"]


def test_session_start_limit_is_clamped(server, monkeypatch, capsys):
    monkeypatch.setenv("LANCE_MEMORY_HOOK_LIMIT", "9999")
    run(monkeypatch, capsys, "session-start")
    assert server.calls[0]["arguments"]["limit"] == 25


def test_session_start_without_project_is_silent(server, monkeypatch, capsys, tmp_path):
    monkeypatch.delenv("LANCE_MEMORY_PROJECT_ID", raising=False)
    code, out, _ = run(monkeypatch, capsys, "session-start", {"cwd": str(tmp_path)})
    assert (code, out) == (0, "") and server.calls == []


def test_checkpoint_writes_unverified_handoff_without_private_paths(server, monkeypatch, capsys, tmp_path):
    event = {"hook_event_name": "SessionEnd", "reason": "clear", "cwd": str(tmp_path)}
    code, out, _ = run(monkeypatch, capsys, "checkpoint", event)
    assert (code, out) == (0, "")
    call = server.calls[0]
    assert call["tool"] == "commit_memory"
    args = call["arguments"]
    assert args["project_id"] == "demo"
    assert args["metadata"] == {"category": "session_handoff", "verified": False, "bucket": "state",
                                "tags": ["auto-checkpoint"]}
    assert "SessionEnd: clear" in args["text"] and tmp_path.name in args["text"]
    assert str(tmp_path) not in args["text"]


def test_checkpoint_read_only_mode(server, monkeypatch, capsys):
    monkeypatch.setenv("LANCE_MEMORY_HOOK_WRITE", "0")
    code, out, _ = run(monkeypatch, capsys, "checkpoint")
    assert (code, out) == (0, "") and server.calls == []


def test_server_error_is_swallowed(server, monkeypatch, capsys):
    server.status = 400
    server.reply = {"content": [{"type": "text", "text": "unknown project"}], "isError": True}
    code, out, err = run(monkeypatch, capsys, "session-start")
    assert (code, out, err) == (0, "", "")


def test_debug_mode_explains_failures(server, monkeypatch, capsys):
    server.status = 400
    server.reply = {"content": "unknown project", "isError": True}
    monkeypatch.setenv("LANCE_MEMORY_HOOK_DEBUG", "1")
    code, out, err = run(monkeypatch, capsys, "session-start")
    assert code == 0 and out == "" and "unknown project" in err


def test_unreachable_server_never_blocks(monkeypatch, capsys):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        free_port = sock.getsockname()[1]
    monkeypatch.setenv("LANCE_MEMORY_URL", f"http://127.0.0.1:{free_port}")
    monkeypatch.setenv("LANCE_MEMORY_PROJECT_ID", "demo")
    monkeypatch.setenv("LANCE_MEMORY_HOOK_TIMEOUT", "1")
    assert run(monkeypatch, capsys, "session-start")[:2] == (0, "")
    assert run(monkeypatch, capsys, "checkpoint")[:2] == (0, "")


def test_bad_url_scheme_is_rejected_quietly(monkeypatch, capsys):
    monkeypatch.setenv("LANCE_MEMORY_URL", "file:///etc/passwd")
    monkeypatch.setenv("LANCE_MEMORY_PROJECT_ID", "demo")
    assert run(monkeypatch, capsys, "session-start")[:2] == (0, "")


def test_unknown_or_missing_command_exits_zero(monkeypatch, capsys):
    monkeypatch.setattr("sys.stdin", io.StringIO(""))
    assert hook.main([]) == 0
    assert hook.main(["nonsense"]) == 0


def test_malformed_stdin_is_tolerated(server, monkeypatch, capsys):
    monkeypatch.setattr("sys.stdin", io.StringIO("not json"))
    assert hook.main(["session-start"]) == 0
    assert "additionalContext" in capsys.readouterr().out


def test_sample_settings_reference_the_script_and_valid_events():
    settings = json.loads((HOOK_PATH.parent / "settings.json").read_text(encoding="utf-8"))
    assert set(settings["hooks"]) == {"SessionStart", "PreCompact", "SessionEnd"}
    for groups in settings["hooks"].values():
        for group in groups:
            for entry in group["hooks"]:
                assert entry["type"] == "command" and "lance_memory_hook.py" in entry["command"]
                assert entry["command"].rsplit(" ", 1)[1] in hook.COMMANDS
