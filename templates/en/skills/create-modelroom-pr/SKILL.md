---
name: create-modelroom-pr
description: >-
  Open or update a pull request for a modelroom room, with the snapshot png, the
  context and the BEHAVIOUR in front of the reviewer. Use when a room's change is
  ready to review, so the review is not markup-only.
---

# Open a modelroom pull request

A reviewer reads the picture first. The image has to be in the commit and named
in the description, or the review is markup-only.

The png is committed under a **fixed name** (`index.png`) and overwritten in
place every time. That is deliberate: GitHub diffs two versions of the *same
path* with **Files changed → image diff (Swipe / Onion Skin)**. Never rename it
to add a timestamp or a version — that would turn every change into two
unrelated files.

## Steps

1. Bring the snapshot up to date. Idempotent: nothing is written when the png
   already matches the artifact.

   ```sh
   npx modelroom render <room>
   ```

2. Commit the room's changed files **together** — the docs, `index.html`, and
   `index.png`. Stage only that room; do not sweep in unrelated work.

   ```sh
   git add rooms/<room>
   ```

3. Build the description from the room, then add the diff context yourself:

   ```sh
   npx modelroom pr-body <room>
   ```

   It prints the summary, where the snapshot is, and the BEHAVIOUR. Add a short
   note of what the change is for and why.

   To show the image inline in the description instead of pointing at it, pass a
   URL that renders for the reviewer — the raw file on the branch:

   ```sh
   npx modelroom pr-body <room> --image-url \
     "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/rooms/<room>/index.png"
   ```

4. Create or update the pull request:

   ```sh
   gh pr create --title "<room>: <what changed>" --body-file -
   gh pr edit  --body-file -        # when the PR already exists
   ```

## Why the snapshot is committed and overwritten

- A checked-out repository shows every screen without running anything — no
  Playwright, no server.
- A fixed path is what makes the pull request's image diff work.
- The binary churn that would normally bloat the repository is bounded by
  merging with **Squash and Merge**: main keeps the final image, and git
  collects the intermediate blobs once the branch goes away.

Do not attach the image to a PR comment as base64 — GitHub caps a comment at
65,536 characters, and a screen is far larger than that.