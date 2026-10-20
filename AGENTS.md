# AGENTS.md — working on modelroom itself

This repository is both the **npm package** (`modelroom`, a local server + workspace) and the
**home of the convention**. Two audiences have documentation; keep them apart:

| Audience | Lives in |
|---|---|
| People/AI **using** modelroom | `README.md`, `docs/` |
| People/AI **changing** modelroom | this file |

## Layout

Five directories say where code runs. `bin/` and `server/` are Node, `client/` is the
browser, `core/` is the model the CLI and the server share, and `shared/` is the vocabulary
both sides of the wire agree on — safe to import from anywhere, so it may not touch `node:`
or the DOM. `test/unit/boundaries.test.mjs` holds the layers to that; it is the rule, not
just a picture of it.

```
bin/modelroom.ts        CLI: serve | init | check | doctor
bin/lint.ts             the convention checks behind `check`
bin/templates.ts        what `init` writes: template lookup, English fallback
bin/manifest.ts         the consumer's package.json, edited minimally (`npm run modelroom`)
server/http.ts          HTTP + SSE + static + agent spawn
server/agents/index.ts  adapters: opencode | command
server/opencode.ts      the opencode session reader (turns, parts, stats)
server/artifact.ts      HTML → PNG (Playwright, dynamically imported)
server/thumbs.ts        keeps every room's snapshot current (serial, idempotent)
core/config.ts          config and state: modelroom.json + .modelroom/state.json
core/rooms.ts           room discovery, status parsing
core/facets.ts          facets, filters, search built from the records
core/frontmatter.ts     frontmatter read/write, reserved keys
core/locale.ts          environment/OS language detection
core/pkg.ts             where the package lives (source or dist)
i18n/lang.ts            Lang = 'en' | 'ja' (browser-safe)
i18n/catalog.ts         the one catalog, shared by CLI, server and UI
api/chat.ts             the chat turn, as the browser receives it (types only)
server/parts.ts         opencode's message → that turn
client/                 the tool's UI source (React + Mantine + CodeMirror)
  theme.ts              the Mantine theme: colour ramps, radii, fonts
  components/           shared panels and pieces (chat · docs · artifact · session)
  dashboard/            the room list and its facet filters
    FacetFilter.tsx     the filter control (MultiSelect, or Combobox + virtualizer)
  room/                 the room app
  settings/             the agent settings
  kit.tsx               the component workshop (`web/kit.html`)
  main.tsx              the one entry: the apps, picked from the shell's `data-app`
  lib/api.ts            everything the UI asks of the server, typed once
  modelroom.css         Mantine's stylesheet + the tool's own extras → web/modelroom.css
scripts/build-client.mjs  esbuild → web/assets/app.js (committed)
scripts/verify-ui.mjs   browser pass: console, axe, the filter, screenshots
web/                     the tool's UI, as served (shells + built assets, committed)
web/assets/app.js        the built bundle; never edited by hand
web/*.html               the four shells: `data-app` + the bundle, nothing else
templates/<lang>/       what `modelroom init` writes (en, ja)
templates/<lang>/skills/ the two skills `init` drops into `.opencode/skills/`
templates/<lang>/example/rooms/  the demo room, per language (this repo serves the en one)
templates/modelroom.json  shared config template with {{rooms}}/{{state}}/{{lang}}
test/                   vitest: unit + one end-to-end pass over the server
docs/                   the convention, the CLI, agents
```

## Commands

```bash
npm test                 # unit + e2e (the e2e starts the server on a free port)
npm start                # = node bin/modelroom.ts serve
npm run build            # server (tsc) + UI bundle + CSS
npm run build:client     # rebuild web/assets/app.js after touching client/**
npm run dev:client       # the same, watching
npm run build:css        # rebuild web/modelroom.css after touching web/*.html or client/modelroom.css
npm run dev:css          # the same, watching
npm run typecheck        # bin · server · core · i18n · api + client
npm run verify:ui        # Chromium pass: console, axe, the filter, screenshots
npm run doctor           # (via bin) check the local setup
```

There is **no build step for users**: `web/modelroom.css` and `web/assets/app.js` are
committed, so `npx modelroom` works with the plain package. If you change the markup,
the components or the styles, rebuild **and commit both** in the same change — otherwise
the UI silently loses classes or ships stale code. `npm run build` does all of it.

## Rules

1. **No new runtime dependencies.** `dependencies` stays empty. The tool's libraries
   (React, Mantine, @tanstack/react-virtual, CodeMirror, markdown-it, lucide) are
   devDependencies bundled into the committed `web/assets/app.js`; anything optional
   (Playwright) is dynamically imported and degrades.
2. **Artifacts stay framework-free.** Every `index.html` under `templates/` — the blank
   `templates/<lang>/room/` and the example rooms in `templates/<lang>/example/rooms/` —
   uses plain HTML and CSS — no framework, no CDN, no web fonts. They are handed to
   implementation and must render with no network.
3. **The tool UI is React + Mantine, and nothing else.** Use the component Mantine ships;
   style it with props, the Styles API or a class in `client/modelroom.css`. Do not add a
   second component library, a utility-class layer, or a bespoke control where Mantine has
   one. Every page is a shell that loads the same bundle; the CSS and bundle are committed.
4. **Server-rendered HTML is never modified.** `/files/...` must stay byte-identical to disk.
   Never inject scripts into served content; the tool's own UI lives in `web/`.
5. **The design layer never reads the application.** Do not add features that read code
   outside `root`/`rooms`. `withinRoot()` in `server/http.ts` is the guard; keep it strict.
6. **The HTTP API writes only `cfg.docs`.** Everything else answers 403. Do not widen it.
   The one other file the server puts on disk is a room's snapshot (`<artifact>.png`),
   written by the renderer next to the artifact it belongs to — never by a request.
7. **Adapters close stdin** (`stdio: ['ignore', 'pipe', 'pipe']`) or agents hang.
8. **Docs are English.** Keep the tone plain: what it is, what it is not, how to run it.
9. **User-facing text goes through `t()`.** The catalog is `i18n/catalog.ts`; `en` is the
   source of truth and `ja` must satisfy its type, so a missing translation is a type
   error. Templates live in `templates/<lang>/`; generated frontmatter keys, `status`
   values and promise ids stay in English whatever the prose language. The workshop
   (`/web/kit.html`) uses the same catalog, not a second one.
10. **A layer imports only its neighbours.** `i18n/` and `api/` touch neither `node:` nor any
    package; `client/` imports only those two and itself, never `server/` or `core/`;
    `server/` and `bin/` never import `client/`. `test/unit/boundaries.test.mjs` fails when an
    import crosses a line.

## The tool UI (`client/`)

- **One entry, one bundle.** `client/main.tsx` renders the app the shell asks for
  (`data-app` = room | dashboard | settings | kit), so nothing is shipped twice and a page
  is a shell plus one script. `scripts/build-client.mjs` is the only build; it writes
  `web/assets/app.js`.
- **One design system: Mantine, and its tokens are in `client/theme.ts`.** The theme is
  installed once in `client/main.tsx` (`MantineProvider` + `theme` +
  `cssVariablesResolver`). The switch is `data-mantine-color-scheme` on `<html>`, set
  before paint by a script in each shell. `client/modelroom.css` only holds what is not a
  component: scrollbars, the panel handles, the CodeMirror shell and the highlight.js
  palette. A new surface uses Mantine's components and CSS variables — there is no second
  component library and no utility-class layer.
- **Panels are panels.** The four columns and the docs' edit/preview split use
  `react-resizable-panels` (`client/components/Split.tsx`). Mantine ships no split pane;
  the library is pinned to the 3.x line — 4.x renamed the components.
- **The filter earns its two paths.** `client/dashboard/FacetFilter.tsx` renders Mantine's
  `MultiSelect`/`Select` up to 500 candidates, and a `Combobox` +
  `useVirtualizedCombobox` + `@tanstack/react-virtual` past that. The count gate lives in
  `SYNC_LIMIT`; the matching rule is `client/dashboard/filter.ts` and is unit-tested.
- **The server's shapes are written twice.** `client/lib/api.ts` types every call by hand and
  nothing checks it against the server — only the e2e pass holds a few fields. `api/chat.ts`
  is the exception: the chat turn is defined once, as types, and imported by both sides;
  opencode's parsing of it lives in `server/parts.ts`.
- **The markdown is escaped.** markdown-it runs with `html: false`, so a doc or a reply can
  never inject markup into the tool; links get `target="_blank"` and `rel="noopener"`.
- **Docs are written one way.** `GET /api/doc` returns the text and a content hash;
  `PUT /api/doc` sends the text back with the hash it was based on and is refused (409,
  with the current text) when they disagree. The mtime is still accepted as a fallback for
  scripts. Writes to one file are queued in the server, so an autosave and the agent's edit
  cannot interleave and silently lose one of them. `cfg.docs` is still the whole writable set.
- **The workshop is the review surface.** A change to a primitive or a panel state should be
  visible at `/web/kit.html` without opening a room. That is the Storybook, without the
  dependency tree.

## Decisions that must not drift

- `SPEC.md` holds only what the artifact cannot show. Visible things belong to the artifact.
- A statement lives in one file; other files reference it by id.
- Files are named for what they are (`BRIEF`, `SPEC`, `BEHAVIOUR`) — no prefixes, no
  role names, no tool names.
- Scope is expressed by the directory (product → flow → room), not by the filename.
- `Status:` in a room's brief drives the badge. `adopted` is a human decision.
- A room's snapshot (`<artifact>.png`, so `index.png`) is a deliverable, not a cache: a
  fixed name, overwritten in place, committed next to the artifact, and reviewed on the
  pull request. Rendering is idempotent (only an artifact newer than its png renders, and
  an unchanged render writes nothing). The how and the why are in `docs/05-preview-images.md`.

## Commits

Small, one purpose each. Say what changed and why in the body; behaviour changes deserve a
line in the PR/commit body about the trade-off.
