# AGENTS.md — design layer

This repository uses [modelroom](https://github.com/modelroom/modelroom): one room per screen,
with the reason, the invisible spec, the promises and the artifact kept apart.

You are working inside the design layer (`modelroom/`). Write the room's prose in English.

## Where you may write

- `rooms/<room>/BRIEF.md` — why this room exists
- `rooms/<room>/SPEC.md` — what the artifact cannot show (devices, states, constraints, what it may use)
- `rooms/<room>/BEHAVIOUR.md` — what it promises (operations and results)
- `rooms/<room>/index.html` — the artifact itself

`rooms/<room>/index.png` is the artifact's rendering: do not hand-edit it, produce
it with `npx modelroom render <room>` and commit it with the html.

A new room, a rename and a removal go through the CLI
(`npx modelroom add|rename|remove`), or the tool UI's add button and room menu —
the same code; the directory name is the room, and the references to it have to
move with it.

Nothing else. Do not reach outside this directory; the design layer never reads the
application code. The application is handed this layer, not the other way round.

## The layer's design rules

`DESIGN.md` holds what is shared across rooms — the tokens, the components, the
accessibility floor. A room takes from it and names what it took in its `SPEC.md`; it
does not invent a colour or a component that is already there. Change `DESIGN.md` only
when the decision is genuinely layer-wide — otherwise it belongs to the room.

A design system is shared too, and it is shared **once**: `vendor/<system>/` holds the
system's files (copied from the pinned package, committed) and `design.css` holds the
layer's own CSS. A room links both by relative path (`../../design.css`) — the same path
resolves when the artifact is rendered from disk and when it is served. Do not hand-edit
either file and do not install a framework inside a room; refreshing the copy is the
project's script. `DESIGN.md` names both, and the version the vendored copy was taken from.

It also names the design system's MCP server, when there is one. The server itself is
configured in `opencode.json`, which OpenCode reads from this layer; use its tools to
look components and tokens up before writing markup.

## How to work

1. Read the room's `BRIEF.md` first, then `SPEC.md` and `BEHAVIOUR.md`.
2. Change the artifact to match them. If they are wrong, say so — do not quietly reword them.
3. Keep the artifact self-contained: no CDN, no web fonts, no build step. It is going to be
   handed to implementation, so it must render with no network. Sharing is not the enemy of
   that — link `vendor/` and `design.css` relatively instead of fetching anything or copying
   a framework into the room.
4. Never restate in `SPEC.md` what can be seen in the artifact. Never copy a promise into
   two files; reference it by id (`@verb-1`) instead.
5. Promises that need the real system (records, timestamps, permissions) do not belong in
   this layer.
6. After changing `index.html`, run `npx modelroom render <room>` so `index.png` matches.
   The picture is what gets reviewed; a stale snapshot is worse than no commit.

## The picture is the deliverable

The room's reviewable output is the docs and the snapshot, not the markup. When a change
is meant to be invisible — an accessibility fix, a refactor that must not move a pixel —
`npx modelroom render <room> --check` proves the pixels are unchanged: it renders to a
temporary file and compares. A change that *is* meant to move the picture leaves a new
`index.png`, and the pull request shows it.

Three skills come with the layer, under `.agents/skills/`:

- `read-modelroom` — read the docs **and the picture** before changing the room.
- `create-modelroom-pr` — snapshot first, then open a PR carrying the image, the context
  and the BEHAVIOUR.
- `manage-modelroom-rooms` — create, rename or remove a room without leaving a broken
  reference behind.

The snapshot keeps a fixed name (`index.png`) and is overwritten in place, so GitHub can
diff it on the pull request. Merge with **Squash and Merge**: main keeps the final image
and git collects the intermediate ones.

## Conventions

- Frontmatter keys (`title`, `status`, `summary`, `tags`) and promise ids (`@verb-1`) stay
  in English, whatever language the prose uses.
- Add `status: draft|review|adopted` to `BRIEF.md` when you want the dashboard to show a
  state. Changing it to `adopted` is a human decision, not yours.

See `docs/02-convention.md` in the modelroom package for the reasoning.
