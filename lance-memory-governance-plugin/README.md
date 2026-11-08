# Lance Memory integrations

Use the same Lance Memory partition when you open a checkout in Codex, OpenCode, or DeepSeek Harness. The adapters add shared instructions for project-scoped recall, verified discoveries, and handoffs. A separate Lance Memory MCP connection supplies the tools. The server remains responsible for authorization.

## Shared setup

Install Node.js 22 or newer. Create `~/.config/lance-memory-governance/settings.json` on the machine running the agents. Replace the example with the address of your Lance Memory web panel, separate from the MCP endpoint.

```json
{
  "panel": "https://memory.example.com/"
}
```

`LANCE_MEMORY_PANEL_URL` overrides the panel address. `LANCE_MEMORY_CONFIG_DIR` can point to another absolute directory containing `settings.json` and `projects.json`. Keep these files outside the repository so all installed copies share the same bindings.

When you open a checkout, the plugin checks an explicit local binding first, then looks for an exact folder hint in the panel's project inventory. The lookup stops at the nearest Git root. A nested repository, worktree, or separate clone can have its own hint or binding. Missing and ambiguous links produce a one-time advisory in the agent's normal reply. An unavailable inventory produces no creation advice. Successful inventory reads are cached for five minutes. Unmatched folders can refresh after 30 seconds.

## Create or link a partition

1. Open your Lance Memory panel. Choose **+ New Project Partition**, name it, and enter the absolute checkout folder as its folder hint. To reuse a partition, set its folder hint instead.
2. For a checkout that needs a local override, run `npm run project` from this plugin directory. It checks for an existing match before asking for a canonical ID. For a direct binding, use `npm run project -- "/absolute/path/to/checkout" example-id`.
3. After confirming the adapter resolves the right partition, remove the duplicated Lance Memory instructions from that checkout's `AGENTS.md`. Keep the rest of the file.

The binding command updates the shared `projects.json` and refuses to reassign a checkout implicitly. Local binding changes take effect on the next OpenCode or DeepSeek Harness request. Codex refreshes its hook context at session start, resume, or compaction. Start a new Codex session to apply a change immediately.

## Codex

Connect the Lance Memory MCP server if it is not already configured. Substitute your own endpoint.

```sh
codex mcp add lance-memory --url https://memory.example.com/mcp
codex plugin marketplace add /absolute/path/to/lance-memory-governance-plugin
codex plugin add lance-memory-governance@lance-memory-local
```

Open a fresh Codex session and review the plugin's `SessionStart` hook in `/hooks` if prompted. The hook resolves the checkout and supplies the instructions automatically. The bundled `lance-memory` skill supports deliberate recall and handoffs and can resolve the current checkout when hook context is absent.

## OpenCode 2

Merge this into the global `opencode.jsonc`. Use an absolute plugin directory or file URL. Keep your existing compaction and other settings.

```jsonc
{
  "plugins": ["file:///absolute/path/to/lance-memory-governance-plugin"],
  "mcp": {
    "servers": {
      "project-memory": {
        "type": "remote",
        "url": "https://memory.example.com/mcp"
      }
    }
  }
}
```

The adapter supplies instructions when the current session exposes Lance Memory's recall, commit, and inspect tools.

## DeepSeek Harness

Merge this into the user `cordis.patch.yml` under `DSH_HOME`, or pass it as a separate `--patch` file. If the profile already connects to Lance Memory, include only the adapter entry.

```yaml
- insert:
    - id: lance-memory-mcp
      name: '@deepseek-ai/dsh-mcp-client'
      config:
        serverName: lance-memory
        transport: streamable-http
        url: https://memory.example.com/mcp
    - id: lance-memory-governance
      name: 'file:///absolute/path/to/lance-memory-governance-plugin/deepseek.js'
```

## Other IDEs

Connect the same Lance Memory MCP server. An IDE extension or session hook can run the shared resolver and add the `instructions` field to the agent's workspace context.

```sh
node /absolute/path/to/lance-memory-governance-plugin/project.js --check /absolute/path/to/checkout
```

The JSON result reports `linked`, `unlinked`, `ambiguous`, `unavailable`, or `outside-workspace`. OpenCode, DeepSeek Harness, and Codex have bundled adapters. Antigravity and other IDEs can use this resolver with a compatible hook or use the bundled skill with a manual checkout check.

## Verify locally

Run `npm test` in the plugin directory. The tests cover partition isolation, exact hint matching, ambiguity, unavailability, and host adapter output. The integrations perform read-only project discovery and leave memory operations to explicit agent tool calls.
