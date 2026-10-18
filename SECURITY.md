# Security

## Reporting a vulnerability

Do **not** open a public issue. Use GitHub's private vulnerability reporting:

<https://github.com/modelroom/modelroom/security/advisories/new>

Please include the version, a minimal reproduction, and what an attacker gains. You can expect an
acknowledgement within a few days.

## Scope

modelroom runs locally and binds to `127.0.0.1` by default. It serves your repository read-only
and writes only the room docs listed in `cfg.docs`. The guards that matter:

- path traversal and dotfiles are refused (`withinRoot` in `lib/server.ts`)
- served artifacts are byte-identical to disk; no scripts are injected
- the agent adapter spawns the CLI you configure, with your environment

Findings in these areas are in scope. Vulnerabilities in a coding agent you connect (OpenCode,
Claude Code, …) are theirs, not modelroom's — but tell us if modelroom makes them worse.

## Supported versions

The latest release on npm. Fixes land on `main` and ship as a patch release.
