# The convention

A room is one screen. Everything in a room is a file with one job, and every file has one
audience. That is the whole idea; the rest follows.

## Files

```
modelroom/
├── AGENTS.md
├── modelroom.json
└── rooms/<room>/
    ├── BRIEF.md        why this room exists        → director, everyone
    ├── SPEC.md         what the artifact cannot show → designer, agent, implementer
    ├── BEHAVIOUR.md    what it promises             → tests, implementer
    ├── index.html      the artifact (the screen)    → director, owner, implementer
    └── index.png       the screen, as reviewed      → reviewer, agent
```

Local state lives in `.modelroom/` next to `modelroom/`, and is never committed.

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

- Self-contained: no CDN, no web fonts, no framework, no build step. It is going to be handed
  to implementation, so it has to stand on its own (and render with no network).
- One file per state (`index-error.html` and so on). Steps in a flow are separate rooms.
- Anything shared (a component, a token) is named in `SPEC.md`, not reinvented per room.

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
| `updated_at` | date string | sort order (falls back to file mtime) |
| `deprecated` | boolean | hidden unless archived is on |
| `superseded_by` | string | a pointer to the room that replaced this one |

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
