"""The library MCP entry point must import and register tools with any supported mcp."""
from __future__ import annotations

import asyncio


def test_library_mcp_server_registers_tools():
    from lance_memory import mcp_server

    tools = asyncio.run(mcp_server.mcp.list_tools())
    names = {tool.name for tool in tools}
    assert {"memory_add", "memory_search", "memory_update", "memory_delete"} <= names
    assert callable(mcp_server.main)
