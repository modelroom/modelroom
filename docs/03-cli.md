# CLI

```
modelroom [serve] [--port 4321] [--host 127.0.0.1] [--open] [--lang en|ja]
modelroom init [<room>] [--dir rooms] [--lang en|ja] [--force] [--skip-install] [--no-script]
modelroom check [--json] [--strict]
modelroom doctor
modelroom render [<room>] [--all] [--check] [--force] [--device sp|tablet|pc]
modelroom pr-body <room> [--image-url <url>]
modelroom --version | --help
```

`modelroom` with no command is `serve`. `serve` needs Node 20+ and nothing else. `init` only
copies templates. `check` reads the frontmatter of every room and reports convention problems.
`doctor` checks the setup and exits non-zero when something is broken (optionally missing things
do not count). `render` keeps each room's snapshot png current; `pr-body` prints what a pull
request description should carry.

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
│   ├── .opencode/skills/       # read-modelroom, create-modelroom-pr
│   └── rooms/<room>/{BRIEF,SPEC,BEHAVIOUR}.md + index.html + index.png
└── .modelroom/                # git-ignored state
```

`init` writes the room templates, the two skills, and — if missing —
`modelroom/modelroom.json`, `modelroom/AGENTS.md` and a `/.modelroom/` line in the
project's `.gitignore`.
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

## render

`render` produces the snapshot png next to a room's artifact. It is idempotent: a room
is rendered only when its artifact is newer than its png, and a render whose bytes do
not change writes nothing — so the committed file moves only when the picture does.

```
modelroom render checkout          # one room, only if stale
modelroom render --all             # every room, the stale ones only
modelroom render checkout --force  # render even when it looks current
modelroom render checkout --device pc
```

`serve` runs the same pass in the background: on start, when an artifact changes, and
whenever the dashboard asks for the room list. You do not have to call `render` to make
the tool work; you call it to be sure a commit carries the current picture.

`--check` renders to a temporary file and compares instead of writing:

```
modelroom render --all --check
ok      checkout  (snapshot matches)
stale   sign-in   (snapshot no longer matches index.html)

1 snapshot(s) out of date
```

Exit code is 1 when a snapshot is missing or out of date — the gate for CI, and the way
to prove that a change meant to be invisible (an accessibility fix, a refactor) left the
pixels alone.

Rendering needs Playwright:

```
npm i -D playwright && npx playwright install chromium
```

Without it, `render` reports what is missing and the room keeps whatever snapshot is
already committed — which is exactly the point of committing it.

## pr-body

Prints, as markdown, what a pull request description should carry: the room's title and
summary, where its snapshot is, and its `BEHAVIOUR.md`.

```
modelroom pr-body checkout --image-url \
  "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/rooms/checkout/index.png"
```

Without `--image-url` it points the reviewer at the file instead of embedding it — the
primary way to read the picture is the pull request's **Files changed** image diff. The
command does not touch git or `gh`; those belong to the agent, which knows the branch and
the repository.

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
  "thumbnail": {
    "device": "tablet",                         // "sp" | "tablet" | "pc" — one per room
    "scale": 1                                  // 1 keeps the committed png small and stable
  },
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

## Snapshots

Each room keeps a png next to its artifact, rendered at one device (`thumbnail.device`)
and one scale. It is a deliverable, not a cache: it is committed with the room, a reviewer
reads it, and a pull request diffs it. `thumbnail.device` and `thumbnail.scale` are
committed configuration; keep them steady, since changing the device re-renders every
snapshot in the project.

Rendering needs Playwright:

```
npm i -D playwright && npx playwright install chromium
```

Without it, nothing breaks: a room keeps whatever snapshot is already committed, and
`render` (or the **make png** button) reports what is missing. Committing the png is what
lets someone review a room without installing anything.

The full reasoning — why the png is committed, why the name never changes, and why the
merge is a squash — is in `05-preview-images.md`.
