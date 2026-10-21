# CLI

```
modelroom [serve] [--port 4321] [--host 127.0.0.1] [--open] [--lang en|ja]
modelroom init [<room>] [--dir rooms] [--lang en|ja] [--force] [--skip-install] [--no-script]
modelroom add <room> [--title "Sign in"]
modelroom rename <old> <new> [--dry-run] [--force]
modelroom remove <room> [--yes] [--dry-run] [--force]
modelroom update [--dry-run]
modelroom check [--json] [--strict]
modelroom doctor
modelroom render [<room>] [--all] [--check] [--force] [--device sp|tablet|pc]
modelroom pr-body <room> [--image-url <url>]
modelroom --version | --help
```

`modelroom` with no command is `serve`. `serve` needs Node 20+ and nothing else. `init`
copies templates and asks which language to use. `add`, `rename` and `remove` keep the rooms
unique and their references in step. `update` refreshes the files modelroom generated.
`check` reads the frontmatter of every room and reports convention problems.

The tool UI does the same three room operations with this same code: the dashboard's **Add
room** button, and the pencil and ⋯ menu in a room's header. A room made in the browser is
byte-identical to one made with the command.
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
│   ├── DESIGN.md
│   ├── .agents/skills/         # read-modelroom, create-modelroom-pr, manage-modelroom-rooms
│   └── rooms/<room>/{BRIEF,SPEC,BEHAVIOUR}.md + index.html + index.png
└── .modelroom/                # git-ignored state
```

`init` writes the room templates and the three skills, and — if missing —
`modelroom/modelroom.json`, `modelroom/AGENTS.md`, `modelroom/DESIGN.md` and a
`/.modelroom/` line in the project's `.gitignore`.
An existing project keeps its config; running `init` again only adds what is
missing (`--force` overwrites).

The skills go to `.agents/skills/`, the portable location: OpenCode and Claude Code
both read it (OpenCode also reads its own `.opencode/skills/`).

```
modelroom init checkout            # asks which language, then modelroom/rooms/checkout/
modelroom init checkout --dir screens
modelroom init checkout --lang ja  # answer the language question without being asked
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
  that already exists — `init` never creates one. A project with no package manager
  keeps `npx modelroom` as its default; this is a convenience for projects that
  already live in npm scripts.
- The dependency is installed with the project's own package manager, detected from
  the lockfile (`bun.lock*`, `pnpm-lock.yaml`, `yarn.lock`, otherwise npm). Writing a
  dependency entry by hand would leave the lockfile behind and break `npm ci`, so the
  manager is the only thing that ever touches it.
- `--skip-install` leaves dependencies alone and writes that manager's runner instead
  of the local bin — `"modelroom": "npx --yes modelroom"` for npm, `pnpm dlx modelroom`,
  `yarn dlx modelroom`, `bunx modelroom` — so no install is needed.
- If the install fails (offline, no manager on `PATH`), `init` says so, keeps the
  runner script and continues — the script works either way, and running the printed
  command later upgrades it to the local version.
- The layer modelroom generates follows the same manager: `AGENTS.md`, the three
  skills and the CLI's `next:` line name the command that actually runs here — `npm
  run modelroom`, `pnpm modelroom`, `yarn modelroom`, `bun run modelroom` — not a
  hardcoded `npx`. That matters for a project that pins its manager through
  `devEngines`: npm then refuses **every** command, `npx modelroom` included, so a
  `npx` in the agent's instructions is a command that cannot run. Where no script was
  added, the manager's remote runner stands in (`pnpm dlx modelroom`, `bunx modelroom`,
  otherwise `npx modelroom`).
- `--force` replaces an existing `modelroom` script; `--no-script` keeps `init` out of
  the `package.json` entirely.
- A project whose `package.json` cannot be read as JSON is left untouched, with a note.

### Language

`init` asks which language to use when you run it at a terminal — ↑/↓ to choose, Enter to
confirm, starting on the one it detected. The question is shown in both languages,
because it is asked *because* the detection may be wrong. Escape answers nothing and
leaves the language automatic; Ctrl+C stops `init` with nothing written.

An answer, like `--lang en|ja`, is written to the project's config as `lang` — the
`modelroom/modelroom.json` of the current layout, or the root `modelroom.json` of a
project that has one — and from then on the CLI, the web UI and new rooms all speak it.
A config that already names a language is not asked about again.

When nobody is there to answer — no terminal, or `CI=1` — the language is resolved
without asking, in this order:

1. `lang` in the config, when it is present
2. `MODELROOM_LANG`
3. `LC_ALL` / `LC_MESSAGES` / `LANG`
4. the OS locale
5. English

Detection is a guess, and a poor one on macOS: the OS language is not visible to a Node
process there, only the shell's `LANG`, so a Mac set to Japanese whose shell exports
`LANG=en_US.UTF-8` detects English. That is why a terminal is asked rather than guessed
at. `--lang` answers the question without asking, which is what a script or CI wants.

Existing room documents are never rewritten; the language affects new rooms only. To
translate a project that already has rooms, pin the language and ask the agent to translate
the existing `BRIEF.md` / `SPEC.md` / `BEHAVIOUR.md` files — the frontmatter keys and
promise ids stay as they are.

## add

Adds one room to an existing project — the directory plus every doc the config names and
the artifact. It is additive: an existing directory is never overwritten. `add` is the
name; `new` is a hidden alias.

```
modelroom add checkout
modelroom add checkout --title "Checkout"
```

The name is the room's record, so it must be unique and it must be a lowercase slug
(`a-z`, `0-9`, `.`, `-`, `_`). A name that differs only by case from an existing room is
refused, because a case-insensitive disk cannot hold both. `--title` sets the human title
on `BRIEF.md` (frontmatter and H1) while the directory keeps the slug.

```
$ modelroom add sign-in
created room sign-in:
  modelroom/rooms/sign-in/BRIEF.md
  ...
next: npm run modelroom (or open http://127.0.0.1:4321/rooms/sign-in)
```

The `next:` line names the project's own command — `npm run modelroom` when `init`
added the script, `pnpm modelroom`, `yarn modelroom`, `bun run modelroom` in a pnpm,
yarn or bun project, and the manager's remote runner when there is no script.

## rename

Moves the directory and every reference to it. Run it with `--dry-run` first: it prints the
move and what it would rewrite without writing.

```
modelroom rename sign-in sign-in-v2 --dry-run
modelroom rename sign-in sign-in-v2
```

What is a *reference* is rewritten: the `superseded_by` frontmatter, `/rooms/<name>`,
`/files/<rooms>/<name>`, and relative links (`../<name>/…`) in every room's docs and html.
What is *prose* is not — a `title`, an H1, a sentence — because the directory name and the
name on the screen are allowed to differ. Those places are listed so a person (or the
agent) can decide:

```
renamed sign-in → sign-in-v2
rewrite  modelroom/rooms/checkout/SPEC.md  (2 reference(s))
    modelroom/rooms/checkout/SPEC.md:4  superseded_by: sign-in — replaced by
```

The room's chat session moves with it. Because a running `serve` holds that session in
memory, `rename` refuses while a server is up; stop it first, or pass `--force`.

## remove

Deleting a room is a human decision, so it takes `--yes`. An agent retires a room instead
with `deprecated: true` and `superseded_by: <room>`. A room another room points at is
refused unless `--force`, which leaves those references broken.

```
modelroom remove sign-in --dry-run    # who still points at it? (writes nothing)
modelroom remove sign-in --yes
```

`--dry-run` reports before it refuses, so it always shows the referencing rooms. There is no
undo beyond git: commit the removal on its own so it can be reverted.

## update

Refreshes the files modelroom generated — the skills in `.agents/skills/` and `AGENTS.md`
— from the installed version. Those change with the version, so this is how an existing
project picks them up. `@latest` fetches the new version first, so use the manager's
remote runner when the project pins one (`pnpm dlx modelroom@latest`, `yarn dlx`,
`bunx`):

```
npx modelroom@latest update
npx modelroom@latest update --dry-run
```

It never touches a room, `DESIGN.md` or `modelroom.json`: those are the project's, not
modelroom's. A new install gets the same generated files from `init`.

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
ok   design rules: modelroom/DESIGN.md
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
