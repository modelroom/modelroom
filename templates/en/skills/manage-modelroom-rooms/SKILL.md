---
name: manage-modelroom-rooms
description: >-
  Create, rename or remove a modelroom room. Use when the person asks for a new
  room, or to rename or delete one. The directory name is the record: it stays
  unique, it carries the required docs, and every reference to it has to move
  with it.
---

# Manage modelroom rooms

A room is `rooms/<room>/` with the required docs and an artifact. **The directory
name is the room.** It must be unique, it must be a lowercase slug, and it must
carry every doc `modelroom.json` names.

Do not create, move or delete a room directory by hand. `mkdir`, `mv` and `rm`
leave the references behind; the CLI keeps the name and the links in step. The
tool UI's **Add room** button and a room header's pencil/⋯ menu run this same
code, when a person would rather click than type a command.

## Add a room

```sh
npx modelroom add <room> --title "Sign in"
```

Then write the room, `BRIEF.md` first, and finish with:

```sh
npx modelroom render <room>
npx modelroom check
```

## Rename a room

Look before you move:

```sh
npx modelroom rename <old> <new> --dry-run
```

The dry run prints the directory move and every reference it would rewrite. Run
it again without `--dry-run` to do it. The CLI rewrites what is a reference — the
`superseded_by` frontmatter, the `/rooms/<name>` and `/files/<rooms>/<name>`
paths, relative links — and lists the places that still mention the old name.

Then finish what it cannot do:

1. Read every listed mention and decide whether it should change.
2. A `title` and an H1 are prose, not paths: the directory name and the name on
   the screen are allowed to differ. Change them only if the screen really
   renames.
3. `npx modelroom check`, then `npx modelroom render <room>`, then read
   `git diff` for what the script could not see.

Stop `npx modelroom` first. The running server holds the room's chat session in
memory, and a rename underneath it loses that; the command refuses while a server
is up.

## Remove a room

Removal is a human decision. An agent retires a room instead:

```yaml
deprecated: true
superseded_by: <the room that replaced it>
```

Only when the person has clearly asked to delete it:

```sh
npx modelroom remove <room> --dry-run   # who still points at it?
npx modelroom remove <room> --yes
```

`remove` refuses while another room points at it, unless you pass `--force`; a
forced removal leaves those references broken, so fix them. There is no undo
beyond git — commit the removal on its own so it can be reverted.

## Refresh the layer's generated files

The skills and `AGENTS.md` are generated from the installed modelroom, so a new
version can change them:

```sh
npx modelroom@latest update            # refresh the generated files
npx modelroom@latest update --dry-run  # show what would change
```

It never touches a room or `modelroom.json`.
