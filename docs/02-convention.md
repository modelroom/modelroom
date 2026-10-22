# The convention

A room is one screen. Everything in a room is a file with one job, and every file has one
audience. That is the whole idea; the rest follows.

## Files

```
modelroom/
├── AGENTS.md          how to work in this layer    → agent
├── DESIGN.md          the layer's design rules     → designer, agent
├── modelroom.json
├── .agents/skills/    the agent's three skills
├── vendor/<system>/   the design system, copied once, pinned → every room
├── design.css         the layer's shared tokens and components → every room
└── rooms/<room>/
    ├── BRIEF.md        why this room exists        → director, everyone
    ├── SPEC.md         what the artifact cannot show → designer, agent, implementer
    ├── BEHAVIOUR.md    what it promises             → tests, implementer
    ├── index.html      the artifact (the screen)    → director, owner, implementer
    └── index.png       the screen, as reviewed      → reviewer, agent
```

Local state lives in `.modelroom/` next to `modelroom/`, and is never committed.

`DESIGN.md` holds what every room shares — the tokens, the components, the
accessibility floor — and names the design system they come from (and the MCP server
that carries it, when there is one). A room takes from it and names what it took in its
`SPEC.md`. It is the project's file: `init` seeds it once, `update` never touches it.

Two files above are shared and never a room's: `vendor/<system>/` is the design system
itself, copied once and pinned, and `design.css` is the layer's own CSS. A room links
both; see *The design system, shared once* below. `init` starts a layer with neither —
the first time two rooms need the same thing, they appear.

The artifact is the visible spec. `SPEC.md` is the invisible one. They must not overlap.

`index.png` is the artifact **rendered** — the same screen as a picture, committed next
to it under a fixed name. It is what a reviewer reads and what a pull request diffs; the
html is the source it was drawn from. See `05-preview-images.md` for why it is committed
and how it is kept current.

## Rules

1. **The artifact owns what is visible.** If a statement can be shown in a screenshot, it
   belongs to `index.html`, not to `SPEC.md`. The snapshot is that screenshot: when the
   artifact changes, regenerate it (`modelroom render`) so the room the reviewer reads is
   the room that was drawn.
2. **A statement lives in one file.** To reach another file, reference it by id
   (`@sign-in-1`) instead of copying it.
3. **The design layer never reads the application.** Rooms hold promises the room itself can
   keep. Anything that needs the real system — records, timestamps, rounding, permissions —
   belongs to the application and is handed over, not fetched.
4. **Implementation reads the design layer, never the other way round.**

This is enforceable rather than aspirational: an agent working in the design layer can be
denied access outside it (for example, OpenCode `permissions` with
`external_directory: deny` and write rules limited to `rooms/*`).

## The artifact

- **Self-contained means no network and no build step.** It is going to be handed to
  implementation, so it has to stand on its own: no CDN, no web fonts, nothing to install,
  nothing to compile. Open `index.html` from disk and the screen is there. It does *not* mean
  one file — a room may link what the layer shares (below).
- One file per state (`index-error.html` and so on). Steps in a flow are separate rooms.
- Anything shared (a component, a token) is decided in the layer's `DESIGN.md` and named in
  `SPEC.md`; it is written once for the layer, not reinvented per room.

## The design system, shared once

A project that draws from a real design system — Bootstrap, a house system, a vendor kit —
keeps **one** copy for the whole layer and lets the rooms link it. Copying the framework into
every room is the duplication `DESIGN.md` exists to prevent; hand-writing its components in
each room is the same duplication, one layer out.

```
modelroom/
├── DESIGN.md            names the system, its MCP, and the two files below
├── vendor/<system>/     the system's files, copied from the pinned package — committed
│   └── MANIFEST.json    the version, and a sha256 per file
├── design.css           the layer's own shared CSS: its tokens, its components — committed
└── rooms/<room>/index.html
```

- **One copy, at the layer root, outside `rooms/`.** Never per room, never a CDN.
- **A room links it, relative to itself**, so the same path resolves whether the artifact is
  opened from disk (`file://`, what `render` does) or served at
  `/files/rooms/<room>/index.html`:

  ```html
  <link rel="stylesheet" href="../../vendor/bootstrap/bootstrap.min.css">
  <link rel="stylesheet" href="../../design.css">
  ```

- **It is committed**, so the artifact renders with no network and travels with the layer when
  the layer is handed over.
- **The version is pinned and recorded.** The manifest next to the copy carries the version and
  a hash per file, and a script the project owns refreshes it from the package manager's cache;
  bumping the framework is one reviewable commit, not a search through rooms.
- **A room keeps what is its own.** Only what two rooms would otherwise repeat moves to
  `design.css`; a room's own styles stay in the room.
- **`SPEC.md` says what the room took and at which version.** Implementation installs the same
  version through its own dependency manager — the vendored copy is how the design layer draws
  the screen, not the production dependency. Saying so is what tells the implementer what to
  expect on the other side.

## Frontmatter is the record

The body is the content. The frontmatter is the record the dashboard reads: the title,
the one-line summary, the tags, the state. Nothing else stores it, so nothing has to be
kept in sync.

```yaml
---
title: Sign in
status: draft
version: 1
summary: A boring front door — the person is signed in, or told plainly why not.
tags: [auth, form]
---
```

Reserved keys — shape only, never a fixed vocabulary:

| Key | Shape | Shown as |
|---|---|---|
| `title` | string | the card's heading |
| `summary` | string | one line under the heading |
| `key_points` | string[] | up to three bullets |
| `tags` | string[] | chips, and a checkbox facet |
| `status` | string | a badge, and a facet |
| `version` | number or string | a `v3` badge |
| `updated_at` | date string, or epoch ms | sort order (falls back to file mtime) |
| `deprecated` | boolean | hidden unless archived is on |
| `superseded_by` | string | a pointer to the room that replaced this one |
| `device` | string | the device the snapshot renders at (`sp`, `tablet`, `pc`, or a name from `modelroom.json`) |
| `next` | string | the main transition: the next room in the flow |
| `app` | string | which application a room belongs to; the flow view groups by it |

`next` and `app` are how a set of rooms becomes a flow. `app` is free text — `user`,
`admin`, `user-legacy` — and, like every other key, it becomes a facet, so the dashboard's
app tabs are just the values that exist. `next` names one room: the main edge the wireframe
draws. It should stay inside its own `app`; a `next` that crosses apps is a `modelroom check`
warning, because a transition that changes app is a different flow.

```yaml
---
title: Sign in
app: user
next: top
---
```

The flow view draws these as a graph — one tab per `app`, arrows for `next` — and the room
cards can be walked in the preview itself: a link inside `index.html` opens the next room's
screen. Write it **relative to the room**, so it resolves whether the artifact is opened from
disk or served:

```html
<!-- rooms/sign-in/index.html → rooms/top/index.html -->
<a href="../top/index.html">Sign in</a>
```

An absolute `/rooms/top/index.html` does not work: `/rooms/` is the tool's own address for a
room, not a path to a file, and it breaks the disk case too.

`device` is the one reserved key with a fixed vocabulary: it must name a device the
project knows, because the renderer needs its width and height. `modelroom check` reports
a name that does not resolve.

**Everything else is a facet.** Add `category: kiosk`, `platform: tablet`, or anything
that helps you narrow the list; a string becomes a radio group or a select (built from
the values that exist, with counts), a list becomes checkboxes. The dashboard never
validates values — it shows what is there.

`adopted` (or `accepted`, `approved`) is a human decision. An agent must never set it.

## What an agent may do

An agent adds. It does not delete.

- new room, new key, new tag, new doc → fine
- merge two spellings → add an alias, leave both values in place
- retire a room → `deprecated: true` and `superseded_by: <room>`
- remove a file or a key → a human does it

A room is created, renamed and removed through the CLI (`modelroom add`, `rename`,
`remove`), because the directory name is the room and the references to it have to move
with it. `rename` rewrites the references it can see and lists the prose it leaves; a
removal takes `--yes` and is refused while another room points at the room.

That is what makes "the agent keeps the record tidy" safe: every move is additive and
reversible in git.

## The check

```
modelroom check
```

It reads the frontmatter — head of the file only — and reports what would stop the
dashboard from deriving the record: malformed or nested frontmatter, a reserved key with
the wrong shape, two spellings of the same value, a `title` that disagrees with the H1,
a `superseded_by` that points nowhere. Errors are fixable by an agent; warnings are for a
human. It never writes.

## Naming

- Files are named for **what they are**, not for who writes them and not for the tool:
  `BRIEF`, `SPEC`, `BEHAVIOUR`, `DESIGN`, `principles`, `components`, `tokens`.
- Avoid words that shift meaning with the reader (`context`, `system`, `ui`, `ux`) and words
  that name a medium (`screen`, `page`) when the thing is not a medium.
- **Scope is expressed by the directory, not by the filename.** One `BRIEF.md` per level —
  product, flow, room — read top-down, written only at your own level.
- Prefer one word that survives translation (see the list above) over a compound.
