---
name: Fix Dependabot
description: Triage and safely resolve a Dependabot pull request — pull in the latest base branch, understand what the bump breaks, fix the code (or decline the bump), run the repo's gates, push, and watch CI.
---

# Fix a Dependabot PR

Use this when a Dependabot PR is red, or when asked to land one. The goal is a
branch that is **up to date with its base and green**, or a clear, reversible
decision to close it. Nothing else.

## Safety rules

These outrank speed.

- **Never force-push** a Dependabot branch and never rewrite its history. Bring
  the base branch in with a merge (or `gh pr update-branch`), not a rebase.
- **Never `--no-verify`** to get past a hook. If a hook is wrong, fix the hook in
  its own commit and say why.
- **Never touch work you did not make.** Another worktree, another branch, an
  uncommitted change: leave it, or ask.
- **One purpose per commit.** The bump stays the bot's commit; the fix is yours;
  a tooling fix is a third.
- **Respect `AGENTS.md`.** In this repo that means `dependencies` stays empty,
  the committed `web/` bundle and stylesheet move with the source, and every gate
  in `.github/workflows/ci.yml` is the contract.
- If the change is bigger than the bump, stop and say so. A major bump that
  needs a rewrite is a project decision, not a chore.

## Workflow

### 1. Find the branch, don't move `main`

```bash
gh pr list --author "app/dependabot" --state open
gh pr view <n> --json number,title,headRefName,baseRefName,mergeable
```

Work in the branch's own worktree if one exists. If not, create one; do not
switch or reset the `main` checkout.

### 2. Pull in the latest base branch

Fetch first, so "latest" is true:

```bash
git fetch origin
```

Then bring `origin/main` into the branch, destructively-free:

```bash
gh pr update-branch <n>          # preferred: the server merges base into head
# or, locally:
git merge origin/main
```

If the lockfile conflicts, do **not** hand-merge it — take either side and
regenerate with `npm install` so the tree and the lock agree. Re-run the gates
afterwards. A conflict resolution is a commit; keep it separate and explain it.

### 3. See what actually breaks

Run the gates in CI order and stop at the first failure; later gates hide behind
earlier ones.

```bash
npm run lint          # oxlint
npm run lint:types    # oxlint --type-aware
npm run format:check  # oxfmt --check
npm run typecheck     # tsc --noEmit, then the client project
npm test              # vitest: unit + one e2e pass
npm run build         # server + committed web/assets/app.js + web/modelroom.css
npx publint
npx attw --pack . --ignore-rules cjs-resolves-to-esm
```

`npm run verify` bundles the first six. The CI log is one command away and worth
skimming before you guess:

```bash
gh pr checks <n>
gh run view --job <job-id> --log-failed
```

For a major bump, read the upgrade notes before editing. The renamed export, the
changed default, the unit that flipped — they are all in the changelog. Reading
the installed types is often faster than the docs:

```bash
cat node_modules/<pkg>/dist/*.d.ts
```

### 4. Decide, then do the smallest thing

- **The bump is wanted.** Migrate the code to the new API, minimally. Keep the
  library's new semantics rather than shimming the old ones away. Adapters like
  a single wrapper component are the right place to absorb a rename, so the call
  sites stay in the repo's own vocabulary. If the change touches the UI, rebuild
  the committed assets (`npm run build`) and commit them in the same commit, and
  run `npm run verify:ui` to prove the page still renders.
- **The bump is not wanted.** If the repo intentionally pins the old line, or
  the migration is a project of its own, revert the dependency files and leave a
  note on the PR. Do not leave a red branch half-migrated.

Either way, re-run step 3 until every gate is green locally. A fix you cannot
run is a guess.

### 5. Commit, push, watch CI

```bash
git commit -m "fix(deps): <what and why>"
git push origin HEAD
gh pr checks <n> --watch
```

Report the final CI state. If a gate fails in CI but passed locally, the
difference is the environment — check Node versions (CI runs 22 and 24), the
lockfile, and anything the local cache is hiding.

## Notes for this repo

- Only files under `cfg.docs` are writable at runtime; that is unrelated to a
  dependency fix, but the boundary tests will notice if you widen it.
- `web/assets/app.js` and `web/modelroom.css` are committed and never edited by
  hand. `npm run build` writes them; commit them with the source that produced
  them.
- The pre-commit hook (lefthook) lints staged files. A commit can stage only
  files that `oxlint` ignores (the rebuilt bundle), which once failed the hook;
  the jobs pass `--no-error-on-unmatched-pattern` so that is not mistaken for a
  lint error.
