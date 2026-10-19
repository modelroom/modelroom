# AGENTS.md — design layer

This repository uses [modelroom](https://github.com/modelroom/modelroom): one room per screen,
with the reason, the invisible spec, the promises and the artifact kept apart.

You are working inside the design layer (`modelroom/`). Write the room's prose in English.

## Where you may write

- `rooms/<room>/BRIEF.md` — why this room exists
- `rooms/<room>/SPEC.md` — what the artifact cannot show (devices, states, constraints, what it may use)
- `rooms/<room>/BEHAVIOUR.md` — what it promises (operations and results)
- `rooms/<room>/index.html` — the artifact itself

Nothing else. Do not reach outside this directory; the design layer never reads the
application code. The application is handed this layer, not the other way round.

## How to work

1. Read the room's `BRIEF.md` first, then `SPEC.md` and `BEHAVIOUR.md`.
2. Change the artifact to match them. If they are wrong, say so — do not quietly reword them.
3. Keep the artifact self-contained: no CDN, no web fonts, no framework, no build step.
   It is going to be handed to implementation, so it must stand on its own.
4. Never restate in `SPEC.md` what can be seen in the artifact. Never copy a promise into
   two files; reference it by id (`@verb-1`) instead.
5. Promises that need the real system (records, timestamps, permissions) do not belong in
   this layer.

## Conventions

- Frontmatter keys (`title`, `status`, `summary`, `tags`) and promise ids (`@verb-1`) stay
  in English, whatever language the prose uses.
- Add `status: draft|review|adopted` to `BRIEF.md` when you want the dashboard to show a
  state. Changing it to `adopted` is a human decision, not yours.

See `docs/02-convention.md` in the modelroom package for the reasoning.
