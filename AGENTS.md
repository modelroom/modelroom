# AGENTS.md — working on modelroom itself

This repository is both the **npm package** (`modelroom`, a local server + workspace) and the
**home of the convention**. Two audiences have documentation; keep them apart:

| Audience | Lives in |
|---|---|
| People/AI **using** modelroom | `README.md`, `docs/` |
| People/AI **changing** modelroom | this file |

## Layout

```
bin/modelroom.mjs        CLI: serve | init | doctor
lib/server.mjs           HTTP + SSE + static + agent spawn
lib/config.mjs           modelroom.json (committed) and .modelroom/state.json (local)
lib/rooms.mjs            room discovery, status parsing
lib/agents/index.mjs     adapters: opencode | command
lib/artifact.mjs         optional HTML → PNG (Playwright, dynamically imported)
ui/                      the tool's UI (Tailwind + daisyUI, built CSS committed)
src/modelroom.css        Tailwind/daisyUI source → ui/modelroom.css
templates/               what `modelroom init` writes
examples/rooms/          the demo room(s) used by this repo's modelroom.json
test/smoke.mjs           mechanical checks; `npm test`
docs/                    the convention, the CLI, agents
```

## Commands

```bash
npm test                 # smoke checks (starts the server on a free port)
npm start                # = node bin/modelroom.mjs serve
npm run build:css        # rebuild ui/modelroom.css after touching ui/*.html or src/*.css
npm run dev:css          # the same, watching
npm run doctor           # (via bin) check the local setup
```

There is **no build step for users**: `ui/modelroom.css` is committed, so `npx modelroom`
works with the plain package. If you change the markup, rebuild and commit the CSS in the
same change — otherwise the UI silently loses classes.

## Rules

1. **No new runtime dependencies without a reason.** `dependencies` is currently empty and
   should stay that way; anything optional (Playwright) is dynamically imported and degrades.
2. **Artifacts stay framework-free.** `templates/rooms/*/index.html` and `examples/rooms/*`
   use plain HTML and CSS — no Tailwind, no CDN, no web fonts. They are handed to
   implementation and must render with no network.
3. **The tool UI may use Tailwind/daisyUI** (`ui/*.html`), but only from the committed CSS.
4. **Server-rendered HTML is never modified.** `/files/...` must stay byte-identical to disk.
   Never inject scripts into served content; the tool's own UI lives in `ui/`.
5. **The design layer never reads the application.** Do not add features that read code
   outside `root`/`rooms`. `withinRoot()` in `lib/server.mjs` is the guard; keep it strict.
6. **Writable files are only `cfg.docs`.** Everything else answers 403. Do not widen it.
7. **Adapters close stdin** (`stdio: ['ignore', 'pipe', 'pipe']`) or agents hang.
8. **Docs are English.** Keep the tone plain: what it is, what it is not, how to run it.

## Decisions that must not drift

- `SPEC.md` holds only what the artifact cannot show. Visible things belong to the artifact.
- A statement lives in one file; other files reference it by id.
- Files are named for what they are (`BRIEF`, `SPEC`, `BEHAVIOUR`) — no prefixes, no
  role names, no tool names.
- Scope is expressed by the directory (product → flow → room), not by the filename.
- `Status:` in a room's brief drives the badge. `adopted` is a human decision.

## Commits

Small, one purpose each. Say what changed and why in the body; behaviour changes deserve a
line in the PR/commit body about the trade-off.
