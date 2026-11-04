"""`lance-memory-api` must start a server, bound to loopback by default."""
from __future__ import annotations

import importlib

import pytest

from lance_memory import LanceMemory


@pytest.fixture()
def api(tmp_path, monkeypatch):
    memory = LanceMemory({
        "project": "Alpha",
        "vector_store": {"config": {"uri": str(tmp_path)}},
        "embedder": {"provider": "test", "config": {"dims": 8}},
        "llm_available": False,
        "enable_graph": False,
        "enable_temporal": False,
    })
    # lance_memory.api builds a global LanceMemory at import; keep it on the temp DB.
    with monkeypatch.context() as patch:
        patch.setattr("lance_memory.memory.LanceMemory", lambda: memory)
        module = importlib.import_module("lance_memory.api")
    for name in ("LANCE_MEMORY_API_HOST", "LANCE_MEMORY_API_PORT"):
        monkeypatch.delenv(name, raising=False)
    return module


def _capture(monkeypatch):
    calls: dict = {}
    monkeypatch.setattr("uvicorn.run", lambda app, **kw: calls.update(app=app, **kw))
    return calls


def test_main_serves_app_on_loopback_by_default(api, monkeypatch, capsys):
    calls = _capture(monkeypatch)
    api.main()
    assert calls["app"] is api.app
    assert (calls["host"], calls["port"]) == ("127.0.0.1", 8769)
    assert "Warning" not in capsys.readouterr().err


def test_main_warns_on_open_bind_without_token(api, monkeypatch, capsys):
    calls = _capture(monkeypatch)
    monkeypatch.setenv("LANCE_MEMORY_API_HOST", "0.0.0.0")
    monkeypatch.setattr(api, "AUTH_TOKEN", None)
    api.main()
    assert calls["host"] == "0.0.0.0"
    assert "without LANCE_MEMORY_TOKEN" in capsys.readouterr().err


def test_main_is_quiet_on_open_bind_with_token(api, monkeypatch, capsys):
    _capture(monkeypatch)
    monkeypatch.setenv("LANCE_MEMORY_API_HOST", "0.0.0.0")
    monkeypatch.setattr(api, "AUTH_TOKEN", "secret")
    api.main()
    assert "Warning" not in capsys.readouterr().err
