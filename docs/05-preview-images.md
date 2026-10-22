# Preview images

A room is reviewed as a picture. This is the design of that picture: where it lives, when
it is made, and why it is done this way rather than with object storage or an attachment.

## What the picture is

Every room keeps a png next to its artifact — `rooms/<room>/index.html` and
`rooms/<room>/index.png`. The png is the artifact rendered at the room's device (a width
and a height, sometimes rotated). It is not a cache: it is a deliverable, committed with
the room, and it is what a reviewer reads. `index.html` is the source the picture was
drawn from.

The device is the room's, not the project's: a kiosk, an admin PC and a phone in one
project each keep a snapshot that looks like the screen they are for. A room says which
in its frontmatter (`device: kiosk`); without one it uses `thumbnail.device`. The names,
widths, heights and rotation live in `modelroom.json` (or the built-ins `sp`, `tablet`,
`pc`). `docs/03-cli.md#snapshots` is the reference.

The room's outputs are therefore the docs (`BRIEF`, `SPEC`, `BEHAVIOUR`) and the snapshot.
The html sits between them: it produces the picture, but it is not what a review turns on.

## The decision

**Commit the png. A fixed name, overwritten in place. Squash and Merge on the way in.**

1. **Generated, then committed.** `modelroom render <room>` writes `index.png` next to the
   artifact. It is committed like any other room file.
2. **One fixed name.** Never `checkout-2026-10-20.png` or `checkout-v3.png`. The name is
   always `index.png`.
3. **Overwritten in place.** A render writes over the previous file. When the bytes do not
   change, nothing is written at all, so the commit only moves when the picture does. What
   that render drew from is recorded in local state (`.modelroom/state.json`, git-ignored)
   rather than in the png's timestamp — see *What "stale" means* below.
4. **Diffed by GitHub.** Because the path is stable, a pull request shows two versions of
   the same file under **Files changed**, with the image diff (Swipe / Onion Skin). That is
   the review surface.
5. **Squashed on merge.** The branch carries a binary per revision; a squash leaves main
   with a single current image, and git collects the intermediate blobs once the branch is
   gone.

## What each participant does

| | Does |
|---|---|
| `modelroom serve` | renders stale snapshots in the background, so the dashboard and the room show the current picture |
| `modelroom render` | the same, on demand and in CI (`--check` compares without writing) |
| the agent | reads the docs **and the picture**; commits the room's files together; opens the pull request |
| the reviewer | reads the picture in the pull request (and the docs and the BEHAVIOUR alongside it) |

modelroom renders and prints. It never touches git or `gh` — the branch, the commit and
the pull request belong to the agent, which already has them.

## What "stale" means

One definition, in `core/rooms.ts`: a room needs rendering when its artifact moved after
the last render, or a doc that names its device did. The artifact is the source of the
picture, and the device is part of what the picture is, so both date it.

The png's own mtime answers that question only when there is no record — a fresh checkout,
or a state file someone deleted. Normally there is one: every render, changed or not,
records the sources it drew from in `.modelroom/state.json`. That is what makes the promise
in point 3 work. A render that produces the same bytes must not touch the png, and if
staleness were read from the file's timestamp, that render would leave the room looking
stale forever — `serve` would render it again on the next change, and on the one after
that. The record is local and git-ignored on purpose: it says what *this machine* has
drawn, not something to commit.

## Why not the alternatives

**Object storage (S3, Cloudflare R2).** It removes the binary from the repository, but it
adds a service to run, credentials to hold, and — the decisive part — it puts design images
outside the machine that owns them. The tool stops being one command you can run anywhere.
An internal screen should not have to be uploaded to be reviewed.

**A base64 image in the pull request description.** GitHub caps a comment at 65,536
characters. A screen is far larger, so this cannot work for anything but a thumbnail.

**Renaming per revision.** Two files that are unrelated to GitHub is no diff at all — the
thing this design exists to produce.

**Committing without overwriting (keeping a history of images beside the artifact).** The
fixed name is what makes the diff; a directory of dated snapshots is a directory git cannot
compare.

## The one cost, and how it is paid

Binaries under version control grow a repository, because git keeps whole blobs and its
deltas are poor on already-compressed data. Here the growth is bounded three ways:

- **the fixed name** means one file per room, not one per revision;
- **idempotent rendering** means a commit only happens when the picture changes, and a
  render that changed nothing is remembered in local state instead of in the file;
- **Squash and Merge** means main keeps only the final image, and the revisions on the
  branch are pruned once it is deleted.

A repository that still feels large can put the snapshots behind **Git LFS**: add a
`.gitattributes` entry for `rooms/*/index.png` and let the image travel as a pointer. That
is a project decision, not a modelroom one — the tool works the same either way.