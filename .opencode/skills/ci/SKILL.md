---
name: CI
description: Run modelroom's own CI gates locally before pushing — the same commands the ci.yml workflow runs, in the same order, including the coverage thresholds and the Chromium pass. Use before a push or a PR, or when CI is red and you need to reproduce it.
---

# Run the gates

`.github/workflows/ci.yml` is the contract. Run its commands in order and stop at
the first failure; later gates hide behind earlier ones. `npm run verify` runs the
lint/format/typecheck/test/build block.

`npm run verify:ci` is the whole thing in one command — `verify`, then the browser
install (a no-op once Chromium is present), then `verify:ui`. `npm run verify:ui --
--headed` opens a visible browser.

```bash
npm install            # prepare builds web/ (dist + bundle + css) — needed by the tests
npm run lint           # oxlint
npm run lint:types     # oxlint --type-aware
npm run format:check   # oxfmt --check
npm run typecheck      # tsc --noEmit, then the client project
npm test               # vitest: unit + e2e, with coverage thresholds
npm run build          # server (tsc) + the UI bundle and stylesheet
npx playwright install --with-deps chromium
npm run verify:ui      # the Chromium pass: console, axe, the derived views
npx publint
npx attw --pack . --ignore-rules cjs-resolves-to-esm
```

`npm test` enforces the thresholds in `vitest.config.ts`: statements 75, branches
65, functions 80, lines 75. A drop below any of them fails the run. `bin/modelroom.ts`
and `server/artifact.ts` are excluded (the e2e drives them in a child process);
`core/`, `server/`, `i18n/` and the dashboard's pure rules
(`client/dashboard/{filter,sort,flow}.ts`, `client/lib/roomname.ts`) are measured.

## The browser pass

Anything that touches `client/`, `web/` or the styles needs the Chromium pass, and
CI runs it:

```bash
npx playwright install chromium   # once; --with-deps on CI
npm run verify:ui                 # console, axe, the theme, the derived views
```

It starts the server on a free port, drives the four pages, and writes screenshots
and `report.json` to `.modelroom/verify/` (git-ignored), and exits 1 on any failure.
It also stands up a throwaway project with several `app`s and a `next` chain, and
checks the app tabs, the flow graph (node/edge counts, a node opening its room),
the sort order, and that the app tab and a tag filter survive a room → back trip.

## What to keep in mind

- **The bundle and stylesheet are generated, not committed.** `npm install` runs
  `prepare`; a change to `client/` or `web/*.html` shows up only after a build.
  Never stage `web/assets/app.js` or `web/modelroom.css` — they are git-ignored.
- CI runs Node **22 and 24**. If a gate passes locally and fails there, suspect the
  Node version or the lockfile, not the code.
- The e2e starts the real server on a free port; nothing is mocked, and nothing is
  written outside the case's temp directory.
