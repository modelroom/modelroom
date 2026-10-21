# Contributing

Thanks for looking. modelroom is a small tool with a strict idea: the room is the record, and
the server never becomes an app builder. Changes that widen what the tool reads or writes will
be asked to explain themselves.

## Setup

```bash
git clone https://github.com/modelroom/modelroom.git
cd modelroom
npm ci
cp -r templates/en/example/rooms rooms   # or run `npm run modelroom` and use `npx modelroom init`
npm run modelroom            # http://127.0.0.1:4321
```

Node 22.18 or newer is required (the source is TypeScript, run through Node's type stripping in
development; the published package ships compiled JavaScript in `dist/`).

## Before you open a PR

```bash
npm run verify   # lint, type-aware lint, format check, typecheck, tests, build
```

`npm run verify` runs the same gates as CI. If you changed anything under `web/`, rebuild the
committed stylesheet and include it in the same commit:

```bash
npm run build:css
```

## What the checks mean

- `npm run lint` — oxlint (correctness, suspicious, perf)
- `npm run lint:types` — oxlint with type information
- `npm run format:check` — oxfmt; `npm run format` fixes
- `npm run typecheck` — `tsc --noEmit` (TypeScript 7)
- `npm test` — Vitest: unit tests plus an end-to-end run of the server
- `npm run build` — emits `dist/` and the `.d.ts` files

## Conventions

- Source is TypeScript with **erasable syntax only** (no `enum`, no parameter properties): Node
  runs it directly, and `tsc` only strips and emits.
- Imports use explicit `.ts` extensions; `tsc` rewrites them to `.js` on build.
- No new runtime dependencies without a reason. `dependencies` is empty and should stay that way;
  optional things (Playwright) are imported dynamically and degrade.
- The design layer never reads application code. `withinRoot()` in `server/http.ts` is the guard.
- The HTTP API writes only `cfg.docs`. Everything else answers 403. The one other file the
  server writes is a room's snapshot (`index.png`), produced by the renderer, never by a request.
- Artifacts and room docs render with no network and no build step; the templates ship as plain
  HTML and CSS. A project's rooms may link a design system vendored once at the layer root
  (`docs/02-convention.md`).
- Docs are English; keep the tone plain.

## Snapshots

A room's `index.png` is a deliverable, committed under a fixed name and overwritten in place,
so GitHub can diff it on a pull request. If you change a room's artifact, render its snapshot
in the same commit:

```bash
npx modelroom render <room>        # or: npm run modelroom render <room>
```

Merge PRs that touch snapshots with **Squash and Merge**, so main keeps a single current image
and git collects the revisions on the branch. The reasoning is in
[`docs/05-preview-images.md`](docs/05-preview-images.md).

## Commit messages

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). release-please reads them to
build the changelog and choose the version.

## Security

Please do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your work is licensed under the MIT License.
