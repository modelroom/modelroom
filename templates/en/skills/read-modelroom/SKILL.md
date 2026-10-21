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

3. Read `DESIGN.md` at the layer root. It names the design system the rooms draw
   from and, when the project reads it through Model Context Protocol, the MCP
   server that carries it. **Use that server's tools** to look up the components
   and tokens a room uses before you write markup — do not invent a colour or a
   component the design system already defines.
4. When the layer keeps a shared copy of the design system (`vendor/`) or its own
   shared CSS (`design.css`), read those files too — a room links them by relative
   path, and they are what the picture was drawn with. Never edit them from a room's
   work; they are the project's, refreshed by its own script.
5. Read, in order: `BRIEF.md`, `SPEC.md`, `BEHAVIOUR.md`.
6. **Look at `index.png`.** It is the room's screen at the committed width.
   Treat it as the visual source of truth; the html explains how it was drawn.
7. Work from the docs and the picture together. If they disagree, say so — do
   not quietly pick one.

## What the files mean

- `DESIGN.md` — the design system and the tokens/components shared across rooms.
- `design.css`, `vendor/` — the shared copy of those tokens and components; a room links them.
- `BRIEF.md` — why the room exists.
- `SPEC.md` — what the picture cannot show (devices, states, constraints).
- `BEHAVIOUR.md` — what the screen promises, each promise by id (`@checkout-1`).
- `index.png` — the screen, as it was last reviewed.
- `index.html` — the source that picture was rendered from.

## When you change the artifact

The snapshot is the deliverable, so it must match. After editing `index.html`,
run `render <room>` so the committed png is current. This is what the reviewer
reads, and what GitHub diffs on the pull request.