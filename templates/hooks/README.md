# Claude Code hooks for lance-mem0ry

Give every Claude Code session a memory without relying on the agent to remember to
ask for it.

| Event | What the hook does |
| --- | --- |
| `SessionStart` (startup, resume, clear, compact) | Loads your project's most recent notes into the session's context, and tells the agent which `project_id` to use. |
| `PreCompact` and `SessionEnd` | Writes a small **checkpoint** to the project (an unverified `session_handoff` note). |

The hook is a single standard-library Python file. It starts instantly, needs no
install, and **never blocks a session**: if the server is down or anything fails, it
exits quietly and Claude Code carries on.

## Set it up

1. Run the lance-mem0ry server (see the main [README](../../README.md#quickstart)).
2. Copy the script into your project:

   ```bash
   mkdir -p .claude/hooks
   cp templates/hooks/lance_memory_hook.py .claude/hooks/
   ```

3. Merge `templates/hooks/settings.json` into your project's `.claude/settings.json`
   (or `~/.claude/settings.json` for every project). If you already have a `hooks`
   section, add these entries to it. On Windows, change `python` to `py -3` if needed.
4. Tell the hook which project partition to use, either way:
   - add `lance_memory_project_id: <PROJECT_ID>` to your project's `AGENTS.md`
     (the same line the agent charter already uses), or
   - set `LANCE_MEMORY_PROJECT_ID` in your environment.

   The ID must be an authorized partition created by an administrator; the hook never
   creates partitions.
5. Start a new Claude Code session. You should see a "Lance Memory is connected"
   note in the session's starting context.

## Settings

All optional, set as environment variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `LANCE_MEMORY_URL` | `http://127.0.0.1:8768` | Server base URL |
| `LANCE_MEMORY_PROJECT_ID` | from `AGENTS.md` | Project partition to use |
| `LANCE_MEMORY_HOOK_LIMIT` | `8` | Recent notes loaded at session start (1 to 25) |
| `LANCE_MEMORY_HOOK_WRITE` | `1` | Set to `0` for read-only mode: load memory, never write |
| `LANCE_MEMORY_HOOK_DEDUP` | `1` | Set to `0` to write a checkpoint every time, even if nothing changed |
| `LANCE_MEMORY_HOOK_TIMEOUT` | `4` | Seconds to wait for the server |
| `LANCE_MEMORY_HOOK_DEBUG` | off | Set to `1` to print why a hook did nothing |

## What gets written

Checkpoints are deliberately small and deterministic. They contain the time, the
event, the workspace **folder name** (not the full path), the git branch, short commit
and whether the working tree is clean. They never contain your prompts, the
transcript or file contents, and they are stored as `verified=false`, so they cannot
be mistaken for ratified facts. For a meaningful summary the agent should still call
`commit_memory(type="handoff")`; the session-start note reminds it to.

## Keeping memory useful

Checkpoints are meant to support your real notes, not bury them:

- **No repeats.** Before writing, the hook looks at the project's newest checkpoint and
  skips the write if the workspace state (folder, git branch, short commit, uncommitted
  file count) is unchanged. The time and triggering event are not part of that comparison.
- **At most one checkpoint on the way in.** At session start the hook over-fetches recent
  notes and shows your real notes first-class plus only the single newest checkpoint, so
  busy projects never fill the starting context with checkpoints.
- **Project only.** Everything is scoped by `project_id`. The hook never sets a user or
  agent identifier, so every agent working in the project sees and shares the same notes.

## Safety notes

- **Stored notes are data, not instructions.** The hook labels what it loads that way,
  strips control characters and caps the size. Still, treat memory content like any
  other untrusted text: do not store secrets, and review what your agents write.
- **The server has no authentication.** Keep `LANCE_MEMORY_URL` on localhost or a
  trusted network. Pointing it at a remote host sends session metadata and reads project
  notes over plain HTTP unless you put the server behind HTTPS and your own access
  controls.
- **Fail-soft by design.** Hooks always exit 0. Use `LANCE_MEMORY_HOOK_DEBUG=1` to
  diagnose, for example by running
  `echo '{}' | LANCE_MEMORY_HOOK_DEBUG=1 python .claude/hooks/lance_memory_hook.py session-start`.

## How it talks to the server

It calls the web panel's `POST /api/mcp/execute` with `recall` (recent) and
`commit_memory`, so it works wherever the panel does (default port `8768`). That
executor checks that the project is authorized and that the category is registered
for it, and the write path applies the verified-versus-blueprint guardrail.

## Tests

```bash
pytest tests/test_hooks.py
```

These run against a small in-process fake server and need neither LanceDB nor Ollama.
