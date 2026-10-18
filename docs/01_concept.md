# Concept

modelroom is the **design layer** for software built with coding agents. It is a convention
plus a small local server; it does not bundle a model or a chat product.

## The model room

A model room in real estate is furnished, full scale, and convincing enough to decide in —
but it is not the apartment you will live in. The design layer works the same way:

- it is **not the real thing** (no database, no server clock, no permissions);
- it is **convincing enough** that a decision can be made in it;
- each room is **shown to someone** before the real build starts.

Everything below follows from that one property: because a room is not the real thing, the
promises that only the real thing can keep live somewhere else.

## Layers and who each file is shown to

Files are named by **what they are**, and each one has one audience. The audience decides
the wording.

| File | Answers | Written by | Shown to | Checked by |
|---|---|---|---|---|
| `BRIEF.md` | Why does this exist? What matters most? | director | director, everyone | humans |
| `SPEC.md` | What is on the screen that you cannot see? (devices, states, constraints, references) | designer | designer, agent, implementer | humans |
| `BEHAVIOUR.md` | What does it do? (operations and results) | designer | tests, implementer | system tests |
| `index.html`, `index.png` | What it looks like | agent | director, owner, implementer | screenshots + humans |
| `principles.md`, `components.md`, `design-tokens/` | The shared interior rules | designer | everyone | humans + tokens |

Two rules keep this from drifting:

1. **The artifact owns what is visible.** `SPEC.md` never lists what can be seen in
   `index.html`; if a statement can be shown in a screenshot, it belongs to the artifact.
2. **No statement lives in two files.** If a rule must reach another file, reference it
   (one line, by id) instead of copying it.

## One-way dependency

```
app  ──reads──▶  design        (artifacts, tokens)
design ──✗──▶    app           (the design layer never reads the application)
```

The design layer must not read the application. A model room has no plumbing, so promises
that depend on the real system (records, rounding, closing, permissions) are owned by the
application layer and are never copied here. What the design layer needs to know is handed
to it — in a brief, in an issue, or in conversation.

This is enforceable, not aspirational: an agent working in the design directory can be
denied access outside it.

## What "behaviour" means here

`BEHAVIOUR.md` holds promises that the room itself can keep — operations and results that a
system test can observe. Promises that need the real system (for example, that a record
carries the server's timestamp) belong to the application layer, not to this file.

## Why this shape

Agents make writing cheap; they do not make **agreement** cheap. A workspace that keeps the
reason (`BRIEF`), the invisible spec (`SPEC`), the promise (`BEHAVIOUR`) and the result (the
artifact) in separate, single-purpose files lets several agents — and several people — work
on the same screen without overwriting one another's meaning.

## Status

Early. This document records the design of the convention; see the repository README for
what is implemented today.
