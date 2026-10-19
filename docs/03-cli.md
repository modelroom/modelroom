# CLI

```
modelroom [serve] [--port 4321] [--host 127.0.0.1] [--open] [--lang en|ja]
modelroom init [<room>] [--dir rooms] [--lang en|ja] [--force] [--skip-install] [--no-script]
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
modelroom init checkout --lang ja  # pin Japanese for the templates and the UI
modelroom init checkout --force    # overwrite existing files
```

### The `modelroom` script

If the project has a `package.json`, `init` also makes `npm run modelroom` work, the
way `npm run storybook` does — one script, and the package installed so the script
runs the pinned local version:

```jsonc
{
  "scripts": { "modelroom": "modelroom" },
  "devDependencies": { "modelroom": "^0.1.0" }
}
```

- The script is added **only when the key is missing**, and only to a `package.json`
  that already exists — `init` never creates one. `npx modelroom` stays the default
  and stays documented; this is a convenience for projects that already live in npm
  scripts.
- The dependency is installed with the project's own package manager, detected from
  the lockfile (`bun.lock*`, `pnpm-lock.yaml`, `yarn.lock`, otherwise npm). Writing a
  dependency entry by hand would leave the lockfile behind and break `npm ci`, so the
  manager is the only thing that ever touches it.
- `--skip-install` leaves dependencies alone and writes `"modelroom": "npx --yes modelroom"`
  instead, which needs no install at all.
- If the install fails (offline, no manager on `PATH`), `init` says so, keeps the `npx`
  script and continues — `npm run modelroom` works either way, and running the printed
  command later upgrades it to the local version.
- `--force` replaces an existing `modelroom` script; `--no-script` keeps `init` out of
  the `package.json` entirely.
- A project whose `package.json` cannot be read as JSON is left untouched, with a note.

### Language

Language is automatic by default. It is resolved in this order:

1. `--lang en|ja` (only when you want to pin it)
2. `lang` in `modelroom/modelroom.json`, when it is present
3. `MODELROOM_LANG`
4. `LC_ALL` / `LC_MESSAGES` / `LANG`
5. the OS locale
6. English

`init` never asks. It uses the detected language for the generated templates and writes
`lang` only when you passed `--lang`; without it the config has no `lang` and every run
keeps detecting. `--lang` on `init` (or a later one) pins the language for the CLI, the
web UI and new rooms.

Existing room documents are never rewritten; `--lang` affects new rooms only. To translate
a project that already has rooms, pin the language and ask the agent to translate the
existing `BRIEF.md` / `SPEC.md` / `BEHAVIOUR.md` files — the frontmatter keys and promise
ids stay as they are.

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
  "lang": "ja",                                 // optional; omitted = auto. "en" | "ja"
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
