# modelroom

[![CI](https://github.com/modelroom/modelroom/actions/workflows/ci.yml/badge.svg)](https://github.com/modelroom/modelroom/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/modelroom/modelroom/branch/main/graph/badge.svg)](https://codecov.io/gh/modelroom/modelroom)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/modelroom/modelroom/badge)](https://scorecard.dev/viewer/?uri=github.com/modelroom/modelroom)
[![npm](https://img.shields.io/npm/v/modelroom.svg)](https://www.npmjs.com/package/modelroom)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A full-scale model room for UI — convincing, not yet real.**

modelroom is a workspace for designing screens with coding agents. Each screen is a **room**:
a reason (`BRIEF.md`), an invisible spec (`SPEC.md`), a set of promises (`BEHAVIOUR.md`) and the
artifact (`index.html`) — kept apart, side by side, on one page.

It is agent-agnostic. Bring OpenCode, Claude Code, Codex, or any CLI. modelroom bundles no model
and no chat product: it gives your agent a place to work, and gives you a place to look.

```bash
npx modelroom init checkout    # a room, with its docs and a starter artifact
npx modelroom                  # → http://127.0.0.1:4321
```

`init` keeps the design layer in one place — `modelroom/` for what you commit and
`.modelroom/` for local state — and picks the language from your environment (pass
`--lang en` / `--lang ja` to pin it):

```
your-repo/
├── modelroom/                 # committed
│   ├── modelroom.json
│   ├── AGENTS.md
│   └── rooms/checkout/
│       ├── BRIEF.md
│       ├── SPEC.md
│       ├── BEHAVIOUR.md
│       └── index.html
└── .modelroom/                # git-ignored state
```

| Path | Committed? | What it is |
|---|---|---|
| `modelroom/modelroom.json` | yes | the config: agent, rooms, language |
| `modelroom/AGENTS.md` | yes | what the agent may write, and in which language |
| `modelroom/rooms/<room>/` | yes | one screen: `BRIEF`, `SPEC`, `BEHAVIOUR`, the artifact |
| `.modelroom/state.json` | no | local session ids and settings changed from `/settings` |

`.modelroom/` is disposable: delete it to reset sessions and local settings. The committed
design layer is untouched.

If the repository already has a `package.json`, `init` also adds a `modelroom` script, so
the everyday command is `npm run modelroom` — the way `npm run storybook` works. The package
is installed with your own package manager (detected from the lockfile), so the script runs
the pinned local version; `--skip-install` writes `"modelroom": "npx --yes modelroom"`
instead and touches no dependencies, and `--no-script` leaves `package.json` alone entirely.
A `package.json` is never created: `npx modelroom` stays the default.

## Why "model room"

A model room in real estate is furnished, full scale, and convincing enough to decide in — but it
is not the apartment you will live in. That is the point: decide here, build the real thing after.
The design layer is the model room; implementation is the building.

Because a room is **not** the real thing, the promises that only the real system can keep —
records, timestamps, rounding, permissions — do not live here. The design layer never reads your
application code.

## What you get

| Where | What |
|---|---|
| `/` | every room, side by side, with thumbnails — full-text search and filters built from the records |
| `/rooms/<name>` | chat, the room's docs (editable), and the artifact — updating as the agent works |
| `/settings` | which agent to run, and with which model |
| `/files/<path>` | the design layer (`modelroom/`), served read-only and **unmodified** (no injected scripts) |

The room's docs are the only files the UI can write. Changing `index.html` (from the agent or by
hand) reloads the preview with no manual refresh; changes elsewhere in the room stream in the same way.

## The convention in one table

| File | Answers | Shown to |
|---|---|---|
| `BRIEF.md` | why does this room exist? | director, everyone |
| `SPEC.md` | what the artifact cannot show (devices, states, constraints, what it may use) | designer, agent, implementer |
| `BEHAVIOUR.md` | what it promises (operations and results) | tests, implementer |
| `index.html` | what it looks like — the artifact itself | director, owner, implementer |

Two rules do the work: **the artifact owns what is visible** (specs never restate it), and **a
statement lives in one file** (others reference it by id). See [`docs/02-convention.md`](docs/02-convention.md).

Each room's frontmatter is its record. A few keys are reserved (`title`, `summary`,
`key_points`, `tags`, `status`, `version`, `deprecated`, `superseded_by`); **everything else
becomes a facet on the dashboard automatically** — a string turns into a select, a list into
checkboxes, built from the values that actually exist. Search covers the docs, not just the
titles.

```yaml
---
title: Sign in
status: draft
version: 1
summary: A boring front door — signed in, or told plainly why not.
tags: [auth, form]
---
```

An agent adds; it does not delete. Retiring a room is `deprecated: true` plus
`superseded_by: <room>`, so the record stays and git can bring it back. `modelroom check`
verifies the convention without writing anything. `adopted` is a human decision — an agent
must never set it.

## Agents

```jsonc
// modelroom/modelroom.json
{
  "root": ".",
  "rooms": "rooms",
  "state": "../.modelroom",
  "lang": "ja",                                // optional; omit it and the OS decides
  "agent": {
    "adapter": "opencode",                       // or "command" for any CLI
    "command": "opencode",
    "agent": "build",
    "model": "openrouter/deepseek/deepseek-v4.1-flash",
    "standalone": true
  }
}
```

`adapter: "command"` runs anything: `{ "command": "claude", "args": ["-p", "{prompt}"] }`.
Full detail, including how to scope an agent so it can only write room files, is in
[`docs/04-agents.md`](docs/04-agents.md).

## From source

```bash
git clone https://github.com/modelroom/modelroom && cd modelroom
npm install                 # dev only: Mantine + React (both bundled, committed) + playwright (optional)
npm test                    # smoke checks
npm run modelroom           # serves templates/en/example/rooms
npm run build:css           # after changing ui/*.html or client/modelroom.css
npm run build:client        # after changing client/**
```

The stylesheet and the JS bundle in `ui/` are built and committed, so users never run a build
step. The tool's UI is React + [Mantine](https://mantine.dev); artifacts (in `templates/`)
are deliberately framework-free: plain HTML and CSS, no CDN, no web fonts — they
are handed to implementation and must render with no network.

PNG thumbnails are optional and need Playwright:

```bash
npm i -D playwright && npx playwright install chromium
```

## Development

```bash
npm ci
npm run dev        # serve, watching the source
npm run verify     # lint, types, format, tests, build — the same gates as CI
```

Source is TypeScript (erasable syntax only) and runs directly on Node 22.18+. `npm run build`
emits `dist/` with declarations; that is what npm publishes. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the rules.

## Docs

- [`docs/01_concept.md`](docs/01_concept.md) — the layers, their audiences, the one-way dependency
- [`docs/02-convention.md`](docs/02-convention.md) — the files, the rules, the naming
- [`docs/03-cli.md`](docs/03-cli.md) — commands and configuration
- [`docs/04-agents.md`](docs/04-agents.md) — adapters and how to write one
- [`AGENTS.md`](AGENTS.md) — for agents working **on** modelroom

## What it is not

- Not an app builder (v0, Lovable, bolt.new). Those put chat first; this puts the room first.
- Not a fork of anything. It is a convention plus a small local server.
- Not a replacement for your agent. It drives the one you already use.

## Status

Early (`0.0.1`) — the first release. The convention comes from a real project; expect churn.

## License

MIT
