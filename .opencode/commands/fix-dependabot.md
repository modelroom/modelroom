---
description: Pull in latest main and safely resolve a Dependabot PR, then watch CI
---

Load the `fix-dependabot` skill and follow its workflow end to end for $ARGUMENTS.

Start by identifying the PR (when none is given, use the open Dependabot PR whose
head is the current branch). Bring in the latest base branch without rewriting
history, find what the bump actually breaks by running the gates in CI order, fix
the code — or decline the bump with a reason — re-run every gate until green,
commit, push, and report the CI result.
