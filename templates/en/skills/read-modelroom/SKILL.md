---
name: read-modelroom
description: >-
  Read a modelroom room before changing or implementing it — its docs and its
  committed snapshot png. Use when asked to work on a room, or to implement a
  screen the design layer describes.
---

# Read a modelroom room

A room is one screen. What it delivers is the **docs and the snapshot png**;
`index.html` is only the source the picture is drawn from. Read the picture, not
just the markup.

## Steps

1. Find the room: `rooms/<room>/` (the rooms directory is `rooms` unless
   `modelroom.json` says otherwise).
2. Make the snapshot current. This is idempotent — it writes nothing when the
   png already matches the artifact:

   ```sh
   npx modelroom render <room>
   ```

3. Read, in order: `BRIEF.md`, `SPEC.md`, `BEHAVIOUR.md`.
4. **Look at `index.png`.** It is the room's screen at the committed width.
   Treat it as the visual source of truth; the html explains how it was drawn.
5. Work from the docs and the picture together. If they disagree, say so — do
   not quietly pick one.

## What the files mean

- `BRIEF.md` — why the room exists.
- `SPEC.md` — what the picture cannot show (devices, states, constraints).
- `BEHAVIOUR.md` — what the screen promises, each promise by id (`@checkout-1`).
- `index.png` — the screen, as it was last reviewed.
- `index.html` — the source that picture was rendered from.

## When you change the artifact

The snapshot is the deliverable, so it must match. After editing `index.html`,
run `render <room>` so the committed png is current. This is what the reviewer
reads, and what GitHub diffs on the pull request.