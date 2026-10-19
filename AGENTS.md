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
lib/config.ts           config discovery (root modelroom.json, then modelroom/modelroom.json)
lib/lang.ts             Lang = 'en' | 'ja' (browser-safe)
lib/i18n.ts             the one catalog, shared by CLI, server and UI
lib/locale.ts           environment/OS language detection + the TTY prompt helper
lib/templates.ts        language template lookup with English fallback
lib/rooms.ts            room discovery, status parsing
lib/agents/index.ts     adapters: opencode | command
lib/artifact.ts         optional HTML → PNG (Playwright, dynamically imported)
web/                    the tool's UI source (React + Mantine + CodeMirror)
  src/theme.ts          the Mantine theme: colour ramps, radii, fonts
  src/components/       shared panels and pieces (chat · docs · artifact · session)
  src/dashboard/        the room list and its facet filters
    FacetFilter.tsx     the filter control (MultiSelect, or Combobox + virtualizer)
  src/room/             the room app
  src/settings/         the agent settings
  src/kit.tsx           the component workshop (`ui/kit.html`)
  src/main.tsx          the one entry: the apps, picked from the shell's `data-app`
scripts/build-web.mjs   esbuild → ui/assets/app.js (committed)
scripts/verify-ui.mjs   browser pass: console, axe, the filter, screenshots
ui/                     the tool's UI, as served (shells + built assets, committed)
ui/assets/app.js        the built bundle; never edited by hand
ui/*.html               the four shells: `data-app` + the bundle, nothing else
src/modelroom.css       Mantine's stylesheet + the tool's own extras → ui/modelroom.css
templates/<lang>/       what `modelroom init` writes (en, ja)
templates/modelroom.json  shared config template with {{rooms}}/{{state}}/{{lang}}
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
npm run build:css        # rebuild ui/modelroom.css after touching ui/*.html or src/modelroom.css
npm run dev:css          # the same, watching
npm run typecheck        # lib + web
npm run verify:ui        # Chromium pass: console, axe, the filter, screenshots
npm run doctor           # (via bin) check the local setup
```

There is **no build step for users**: `ui/modelroom.css` and `ui/assets/app.js` are
committed, so `npx modelroom` works with the plain package. If you change the markup,
the components or the styles, rebuild **and commit both** in the same change — otherwise
the UI silently loses classes or ships stale code. `npm run build` does all of it.

## Rules

1. **No new runtime dependencies.** `dependencies` stays empty. The tool's libraries
   (React, Mantine, @tanstack/react-virtual, CodeMirror, markdown-it, lucide) are
   devDependencies bundled into the committed `ui/assets/app.js`; anything optional
   (Playwright) is dynamically imported and degrades.
2. **Artifacts stay framework-free.** `templates/rooms/*/index.html` and `examples/rooms/*`
   use plain HTML and CSS — no framework, no CDN, no web fonts. They are handed to
   implementation and must render with no network.
3. **The tool UI is React + Mantine, and nothing else.** Use the component Mantine ships;
   style it with props, the Styles API or a class in `src/modelroom.css`. Do not add a
   second component library, a utility-class layer, or a bespoke control where Mantine has
   one. Every page is a shell that loads the same bundle; the CSS and bundle are committed.
4. **Server-rendered HTML is never modified.** `/files/...` must stay byte-identical to disk.
   Never inject scripts into served content; the tool's own UI lives in `ui/`.
5. **The design layer never reads the application.** Do not add features that read code
   outside `root`/`rooms`. `withinRoot()` in `lib/server.mjs` is the guard; keep it strict.
6. **Writable files are only `cfg.docs`.** Everything else answers 403. Do not widen it.
7. **Adapters close stdin** (`stdio: ['ignore', 'pipe', 'pipe']`) or agents hang.
8. **Docs are English.** Keep the tone plain: what it is, what it is not, how to run it.
9. **User-facing text goes through `t()`.** The catalog is `lib/i18n.ts`; `en` is the
   source of truth and `ja` must satisfy its type, so a missing translation is a type
   error. Templates live in `templates/<lang>/`; generated frontmatter keys, `status`
   values and promise ids stay in English whatever the prose language. The workshop
   (`/ui/kit.html`) uses the same catalog, not a second one.

## The tool UI (`web/`)

- **One entry, one bundle.** `web/src/main.tsx` renders the app the shell asks for
  (`data-app` = room | dashboard | settings | kit), so nothing is shipped twice and a page
  is a shell plus one script. `scripts/build-web.mjs` is the only build; it writes
  `ui/assets/app.js`.
- **One design system: Mantine, and its tokens are in `web/src/theme.ts`.** The theme is
  installed once in `web/src/main.tsx` (`MantineProvider` + `theme` +
  `cssVariablesResolver`). The switch is `data-mantine-color-scheme` on `<html>`, set
  before paint by a script in each shell. `src/modelroom.css` only holds what is not a
  component: scrollbars, the panel handles, the CodeMirror shell and the highlight.js
  palette. A new surface uses Mantine's components and CSS variables — there is no second
  component library and no utility-class layer.
- **Panels are panels.** The four columns and the docs' edit/preview split use
  `react-resizable-panels` (`web/src/components/Split.tsx`). Mantine ships no split pane;
  the library is pinned to the 3.x line — 4.x renamed the components.
- **The filter earns its two paths.** `web/src/dashboard/FacetFilter.tsx` renders Mantine's
  `MultiSelect`/`Select` up to 500 candidates, and a `Combobox` +
  `useVirtualizedCombobox` + `@tanstack/react-virtual` past that. The count gate lives in
  `SYNC_LIMIT`; the matching rule is `web/src/dashboard/filter.ts` and is unit-tested.
- **The markdown is escaped.** markdown-it runs with `html: false`, so a doc or a reply can
  never inject markup into the tool; links get `target="_blank"` and `rel="noopener"`.
- **Docs are written one way.** `GET /api/doc` returns the text and a content hash;
  `PUT /api/doc` sends the text back with the hash it was based on and is refused (409,
  with the current text) when they disagree. The mtime is still accepted as a fallback for
  scripts. Writes to one file are queued in the server, so an autosave and the agent's edit
  cannot interleave and silently lose one of them. `cfg.docs` is still the whole writable set.
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
