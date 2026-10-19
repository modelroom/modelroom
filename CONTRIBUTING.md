# Contributing

Thanks for looking. modelroom is a small tool with a strict idea: the room is the record, and
the server never becomes an app builder. Changes that widen what the tool reads or writes will
be asked to explain themselves.

## Setup

```bash
git clone https://github.com/modelroom/modelroom.git
cd modelroom
npm ci
cp -r examples/rooms rooms   # or run `npm run modelroom` and use `npx modelroom init`
npm run modelroom            # http://127.0.0.1:4321
```

Node 22.18 or newer is required (the source is TypeScript, run through Node's type stripping in
development; the published package ships compiled JavaScript in `dist/`).

## Before you open a PR

```bash
npm run verify   # lint, type-aware lint, format check, typecheck, tests, build
```

`npm run verify` runs the same gates as CI. If you changed anything under `ui/`, rebuild the
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
- Only `cfg.docs` is writable. Everything else answers 403.
- Artifacts and room docs stay framework-free: plain HTML and CSS, no network.
- Docs are English; keep the tone plain.

## Commit messages

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). release-please reads them to
build the changelog and choose the version.

## Security

Please do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your work is licensed under the MIT License.
