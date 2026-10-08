# Update

Bring a Framework project in line with the newer Framework that `dev-framework apply` copied in. Apply replaced the managed material as a whole and regenerated the map; project records change only through migrations and fixes the user approves.

## Propose

- Show what apply changed: `git status` and `git diff --stat` of the managed material.
- Records written for an earlier Framework often break newer rules: the map script may refuse them, and the script findings name the fix. Propose the [migration](#migrations) for each finding a row covers, and the script fixes for the rest.

## Apply

Commit message: `chore: update the Dev Framework`.

1. Apply the approved migrations and fixes, then run the map script.
2. Return to the diagnosis, which offers the menu.

## Migrations

| Finding | Migration |
| --- | --- |
| Plan: nodes without `kind` | Start a new Plan, as [A Plan without node kinds](#a-plan-without-node-kinds) says |
| Links to paths an earlier Framework used | Point them to `knowledge/dev-framework/` |
| Build status in Knowledge, which an earlier Framework asked for | Remove it. The Implemented line of each done implementation leaf links the Knowledge it implements instead. |
| `.tmp/doctor/findings.md`, which an earlier Framework kept | Nothing reads it now; the next review records its findings in `.dev/review.jsonl`. Delete it once that review has run. |
| Knowledge outside a category, or in a workspace's `knowledge/` | Recommend a category for each document by the question it answers, and a name without a milestone. Commit the moves before splitting a mixed document, so Git keeps each file's history. |

### A Plan without node kinds

Nodes in `plan/nodes/` without a `kind` field were written for an earlier Framework without node kinds. There is no migration; the project starts a new Plan:

1. Finish or discard each running implementation: its `impl/*` branch and worktree.
2. Empty `plan/nodes/` and write a new `root` goal with the old root's title and Goal. Deleting the old nodes needs the user's approval; Git history keeps them.
3. Project Knowledge stays, and may be changed where the new rules need it.

`dev-next` then recommends planning the root.
