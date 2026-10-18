# AGENTS.md — working on modelroom itself

This repository is both the **npm package** (`modelroom`, a local server + workspace) and the
**home of the convention**. Two audiences have documentation; keep them apart:

| Audience | Lives in |
|---|---|
| People/AI **using** modelroom | `README.md`, `docs/` |
| People/AI **changing** modelroom | this file |

## Layout

```
bin/modelroom.ts        CLI: serve | init | check | doctor
lib/server.ts           HTTP + SSE + static + agent spawn
lib/config.ts           modelroom.json (committed) and .modelroom/state.json (local)
lib/rooms.ts            room discovery, status parsing
lib/agents/index.ts     adapters: opencode | command
lib/artifact.ts         optional HTML → PNG (Playwright, dynamically imported)
web/                    the tool's UI source (React + shadcn/ui + CodeMirror)
  src/components/ui/    shadcn/ui primitives, source we own
  src/components/       the room's panels (chat · docs · artifact · session)
  src/kit.tsx           the component workshop (`ui/kit.html`)
  src/main.tsx          the one entry: room app or workshop, from `data-app`
scripts/build-web.mjs   esbuild → ui/assets/app.js (committed)
ui/                     the tool's UI, as served (shells + built assets, committed)
ui/assets/app.js        the built bundle; never edited by hand
ui/kit.html             the workshop page: every primitive in isolation
ui/dashboard.html       the dashboard (still plain HTML + daisyUI)
src/modelroom.css       Tailwind/daisyUI source → ui/modelroom.css
templates/              what `modelroom init` writes
examples/rooms/         the demo room(s) used by this repo's modelroom.json
test/                   vitest: unit + one end-to-end pass over the server
docs/                   the convention, the CLI, agents
```

## Commands

```bash
npm test                 # unit + e2e (the e2e starts the server on a free port)
npm start                # = node bin/modelroom.ts serve
npm run build            # server (tsc) + UI bundle + CSS
npm run build:web        # rebuild ui/assets/app.js after touching web/**
npm run dev:web          # the same, watching
npm run build:css        # rebuild ui/modelroom.css after touching ui/*.html or web/**
npm run dev:css          # the same, watching
npm run typecheck        # lib + web
npm run doctor           # (via bin) check the local setup
```

There is **no build step for users**: `ui/modelroom.css` and `ui/assets/app.js` are
committed, so `npx modelroom` works with the plain package. If you change the markup,
the components or the styles, rebuild **and commit both** in the same change — otherwise
the UI silently loses classes or ships stale code. `npm run build` does all of it.

## Rules

1. **No new runtime dependencies.** `dependencies` stays empty. The tool's libraries
   (React, shadcn/ui, CodeMirror, markdown-it, Radix, lucide) are devDependencies bundled
   into the committed `ui/assets/app.js`; anything optional (Playwright) is dynamically
   imported and degrades.
2. **Artifacts stay framework-free.** `templates/rooms/*/index.html` and `examples/rooms/*`
   use plain HTML and CSS — no Tailwind, no CDN, no web fonts. They are handed to
   implementation and must render with no network.
3. **The tool UI is React + shadcn/ui.** Primitives live in `web/src/components/ui` as
   shadcn source we own — add one with `npx shadcn@latest add <name>`, then show it in the
   workshop. Tailwind classes are scanned from `web/**` and `ui/*.html`; the built CSS and
   bundle are committed.
4. **Server-rendered HTML is never modified.** `/files/...` must stay byte-identical to disk.
   Never inject scripts into served content; the tool's own UI lives in `ui/`.
5. **The design layer never reads the application.** Do not add features that read code
   outside `root`/`rooms`. `withinRoot()` in `lib/server.mjs` is the guard; keep it strict.
6. **Writable files are only `cfg.docs`.** Everything else answers 403. Do not widen it.
7. **Adapters close stdin** (`stdio: ['ignore', 'pipe', 'pipe']`) or agents hang.
8. **Docs are English.** Keep the tone plain: what it is, what it is not, how to run it.

## The tool UI (`web/`)

- **One entry, one bundle.** `web/src/main.tsx` renders the room app or the workshop from
  the shell's `data-app`, so nothing is shipped twice. `scripts/build-web.mjs` is the only
  build; it writes `ui/assets/app.js`.
- **shadcn on daisyUI's palette.** shadcn's token names (`background`, `card`, `muted`,
  `border`, `ring`, `destructive`) are mapped onto daisyUI's colours in `src/modelroom.css`,
  so one theme switch still drives everything. The React app does **not** use daisyUI
  component classes (`btn`, `badge`, `loading`); `dashboard.html` and `settings.html` still
  do, until they are ported.
- **Panels are panels.** The four columns and the docs' edit/preview split use shadcn's
  `resizable` (`react-resizable-panels`). It is pinned to the 3.x line — 4.x renamed the
  components, and shadcn's source targets 3.x.
- **The markdown is escaped.** markdown-it runs with `html: false`, so a doc or a reply can
  never inject markup into the tool; links get `target="_blank"` and `rel="noopener"`.
- **The workshop is the review surface.** A change to a primitive or a panel state should be
  visible at `/ui/kit.html` without opening a room. That is the Storybook, without the
  dependency tree.

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
