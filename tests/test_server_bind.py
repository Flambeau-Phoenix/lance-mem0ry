"""The HTTP server binds to loopback unless the operator opts in to a wider address."""
from __future__ import annotations

import pytest


@pytest.fixture()
def server(monkeypatch):
    import server.memory_server as ms

    calls: dict = {}

    class FakeMCP:
        def run(self, **kwargs):
            calls.update(kwargs)

    monkeypatch.setattr(ms, "build_mcp", lambda: FakeMCP())
    for name in ("LANCE_MEMORY_HOST", "ARCH_MEMORY_HOST", "LANCE_MEMORY_PORT", "ARCH_MEMORY_PORT"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("LANCE_MEMORY_TRANSPORT", "http")
    return ms, calls


def test_default_bind_is_loopback_without_warning(server, capsys):
    ms, calls = server
    ms.main([])
    assert calls["host"] == "127.0.0.1"
    assert "no built-in authentication" not in capsys.readouterr().err


def test_wider_bind_is_honoured_with_warning(server, monkeypatch, capsys):
    ms, calls = server
    monkeypatch.setenv("LANCE_MEMORY_HOST", "0.0.0.0")
    ms.main([])
    assert calls["host"] == "0.0.0.0"
    assert "no built-in authentication" in capsys.readouterr().err


def test_legacy_host_variable_still_read(server, monkeypatch):
    ms, calls = server
    monkeypatch.setenv("ARCH_MEMORY_HOST", "localhost")
    ms.main([])
    assert calls["host"] == "localhost"
