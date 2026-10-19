# Preview images

A room is reviewed as a picture. This is the design of that picture: where it lives, when
it is made, and why it is done this way rather than with object storage or an attachment.

## What the picture is

Every room keeps a png next to its artifact — `rooms/<room>/index.html` and
`rooms/<room>/index.png`. The png is the artifact rendered at one device width. It is not
a cache: it is a deliverable, committed with the room, and it is what a reviewer reads.
`index.html` is the source the picture was drawn from.

The room's outputs are therefore the docs (`BRIEF`, `SPEC`, `BEHAVIOUR`) and the snapshot.
The html sits between them: it produces the picture, but it is not what a review turns on.

## The decision

**Commit the png. A fixed name, overwritten in place. Squash and Merge on the way in.**

1. **Generated, then committed.** `modelroom render <room>` writes `index.png` next to the
   artifact. It is committed like any other room file.
2. **One fixed name.** Never `checkout-2026-10-20.png` or `checkout-v3.png`. The name is
   always `index.png`.
3. **Overwritten in place.** A render writes over the previous file. When the bytes do not
   change, nothing is written at all, so the commit only moves when the picture does.
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
- **idempotent rendering** means a commit only happens when the picture changes;
- **Squash and Merge** means main keeps only the final image, and the revisions on the
  branch are pruned once it is deleted.

A repository that still feels large can put the snapshots behind **Git LFS**: add a
`.gitattributes` entry for `rooms/*/index.png` and let the image travel as a pointer. That
is a project decision, not a modelroom one — the tool works the same either way.