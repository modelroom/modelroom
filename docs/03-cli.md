# CLI

```
modelroom [serve] [--port 4321] [--host 127.0.0.1] [--open]
modelroom init [<room>] [--dir rooms] [--force]
modelroom check [--json] [--strict]
modelroom doctor
modelroom --version | --help
```

`modelroom` with no command is `serve`. `serve` needs Node 20+ and nothing else. `init` only
copies templates. `check` reads the frontmatter of every room and reports convention problems.
`doctor` checks the setup and exits non-zero when something is broken (optionally missing things
do not count).

## serve

Starts the workspace on `127.0.0.1:4321` by default. `modelroom` alone does the same.

- `/` — every room, side by side
- `/room/<name>` — chat, the room's docs, the artifact
- `/settings` — which agent to run
- `/files/<path>` — your repository, served read-only and **unmodified** (no injection)

`--open` tries to open a browser; on a headless machine it is ignored.

## init

Copies the room templates and, if missing, `modelroom.json`, `AGENTS.md` and a
`.modelroom/` line in `.gitignore`.

```
modelroom init checkout            # creates rooms/checkout/
modelroom init checkout --dir design/screens
modelroom init checkout --force    # overwrite existing files
```

## check

```
modelroom check              # errors and warnings
modelroom check --json       # machine-readable
modelroom check --strict     # warnings fail too
```

It only reads the head of each doc (frontmatter lives there) and never writes:

```
FAIL  sign-in/BRIEF.md  reserved-type  tags must be array, got string
warn  checkout/BRIEF.md  h1-title       H1 "Checkout" differs from title "check out"
warn  sign-in/BRIEF.md   variant        status: draft / Draft — same value, different spelling

2 room(s), 1 error(s), 2 warning(s)
```

Exit code is 1 on errors (or on warnings with `--strict`).

## doctor

```
modelroom doctor
ok   node 22.14.0 (needs >= 20)
ok   root exists: /path/to/repo
ok   rooms dir exists: rooms
ok   rooms found: checkout, sign-in
ok   config: modelroom.json
ok   agent command on PATH: opencode
ok   png rendering (playwright): not installed (optional)
ok   room checkout: docs ok
```

## Config: `modelroom.json`

```jsonc
{
  "root": ".",                                  // where your repository is
  "rooms": "rooms",                             // rooms live here
  "artifact": "index.html",                     // the file that is the screen
  "docs": ["BRIEF.md", "SPEC.md", "BEHAVIOUR.md"], // the only files the UI may write
  "port": 4321,
  "agent": {
    "adapter": "opencode",                      // "opencode" | "command"
    "command": "opencode",
    "agent": "build",
    "model": null,                              // set this when your agent's default fails
    "standalone": true,
    "args": []                                  // adapter "command": e.g. ["-p", "{prompt}"]
  }
}
```

Anything you change from `/settings` is kept locally in `.modelroom/state.json`
(git-ignore it) — committed configuration stays in `modelroom.json`.

## Thumbnails

Rendering the artifact to PNG is optional and needs Playwright:

```
npm i -D playwright && npx playwright install chromium
```

Without it, rooms simply show no thumbnail and the **make png** button reports why.
