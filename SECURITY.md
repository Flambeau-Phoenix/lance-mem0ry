# Security policy

## Reporting a vulnerability

Please report suspected vulnerabilities **privately** through GitHub's
[private vulnerability reporting](https://github.com/Flambeau-Phoenix/lance-mem0ry/security/advisories/new).
Do not open a public issue for a security problem.

Include the version (`pyproject.toml`), what you observed and the smallest reproducer
you can share. Do not attach real memory databases, credentials or private source.
You can expect an acknowledgement within a few days; fixes ship in a new release noted
in the [changelog](CHANGELOG.md).

## Supported versions

Security fixes target the latest version on the default branch.

## Know before you deploy

Lance Memory is built as a **local-first, trusted-network** tool. Please read this
before exposing it:

- **No built-in authentication.** The MCP server (`:8768`), its REST API and web panel,
  and the Streamlit console (`:8767`) accept any request that can reach them. The
  quickstart binds to `0.0.0.0` for convenience. Bind to `127.0.0.1`, or put the
  services behind a reverse proxy with TLS and authentication, a VPN or a firewall.
- **Memory is untrusted input to your agents.** Anything an agent can write can later be
  read back into another session's context. Treat recalled text as data, never as
  instructions, review what is stored, and never put secrets or credentials in memory.
  The Claude Code hooks label and size-limit what they load, but they cannot make
  poisoned content safe.
- **Destructive actions need care.** `modify_memory(action="purge")` requires explicit
  confirmation; keep backups (see the [runbook](docs/RUNBOOK.md)).
- **Secrets.** Keep real values in an untracked `.env`. Only `.env.example` belongs in
  the repository.

## Scope

In scope: authentication or authorization bypass in code this project provides, path
traversal or unsafe file handling in import/export and backup, injection through stored
records into the web panel, and secrets written to logs or exports.

Out of scope: deployments you chose to expose without protection, and vulnerabilities in
LanceDB, Ollama, FastMCP, Streamlit or other dependencies (report those upstream).
