# CLI

```
modelroom [serve] [--port 4321] [--host 127.0.0.1] [--open] [--lang en|ja]
modelroom init [<room>] [--dir rooms] [--lang en|ja] [--force]
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
- `/rooms/<name>` — chat, the room's docs, the artifact
- `/settings` — which agent to run
- `/files/<path>` — your repository, served read-only and **unmodified** (no injection)

`--open` tries to open a browser; on a headless machine it is ignored.

## init

Creates the design layer in `modelroom/` and keeps local state outside it:

```
your-repo/
├── modelroom/                 # committed
│   ├── modelroom.json
│   ├── AGENTS.md
│   └── rooms/<room>/{BRIEF,SPEC,BEHAVIOUR}.md + index.html
└── .modelroom/                # git-ignored state
```

`init` writes the room templates and, if missing, `modelroom/modelroom.json`,
`modelroom/AGENTS.md` and a `/.modelroom/` line in the project's `.gitignore`.
An existing project keeps its config; running `init` again only adds what is
missing (`--force` overwrites).

```
modelroom init checkout            # modelroom/rooms/checkout/
modelroom init checkout --dir screens
modelroom init checkout --lang ja  # Japanese templates, no question
modelroom init checkout --force    # overwrite existing files
```

### Language

`init` decides the language in this order:

1. `--lang en|ja`
2. the existing `lang` in `modelroom/modelroom.json`
3. a question on an interactive terminal (the environment's language is the default)
4. the environment (`MODELROOM_LANG`, `LC_ALL`, `LC_MESSAGES`, `LANG`, then
   the OS locale), or English on a non-interactive machine / in CI

The chosen language is written to `modelroom/modelroom.json` (or the root config of an
existing project) and printed. It controls the templates, the CLI output and the web UI.
Existing room documents are never rewritten; `--lang` on a later `init` affects new rooms
only.

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
ok   node 22.14.0 (needs >= 22.18)
ok   root exists: /path/to/repo/modelroom
ok   rooms dir exists: modelroom/rooms
ok   rooms found: checkout, sign-in
ok   config: modelroom/modelroom.json
ok   state: .modelroom
ok   language: ja
ok   agent instructions: modelroom/AGENTS.md
ok   agent command on PATH: opencode
ok   png rendering (playwright): not installed (optional)
ok   room checkout: docs ok
```

## Config: `modelroom/modelroom.json`

```jsonc
{
  "root": ".",                                  // the design layer, relative to this file
  "rooms": "rooms",                             // rooms live here
  "state": "../.modelroom",                     // local state, relative to this file
  "lang": "ja",                                 // "en" | "ja" — CLI, UI and templates
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

`root` is what `/files/...` and the agent's working directory see. With a new
install that is `modelroom/`, so the design layer cannot read the application
code. `modelroom` looks for `./modelroom.json` first (the old layout) and then
`./modelroom/modelroom.json`; existing projects do not move.

Anything you change from `/settings` is kept locally in `.modelroom/state.json`
(git-ignore it) — committed configuration stays in `modelroom/modelroom.json`.

## Thumbnails

Rendering the artifact to PNG is optional and needs Playwright:

```
npm i -D playwright && npx playwright install chromium
```

Without it, rooms simply show no thumbnail and the **make png** button reports why.
