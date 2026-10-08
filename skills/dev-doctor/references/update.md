# Update

Bring a Framework project up to the installed Framework. Sync replaces managed material as a whole; project records change only through fixes the user approves.

## Propose

- Show what sync would change: the `Managed material` findings.
- When sync is blocked, show how to clear each problem it lists, such as committing or stashing the listed changes. When sync would replace a project directory that has a managed name, rename that directory first.
- When `plan/` has uncommitted changes, ask the user to commit or set them aside first. The map script regenerates the map from the working tree, so the update's map would carry them.
- When `plan/nodes/` holds nodes without a `kind` field, the Plan was written for an earlier Framework without node kinds. There is no migration; the project starts a new Plan:
  1. Before the update, finish or discard each running implementation: its `impl/*` branch and worktree.
  2. After sync, empty `plan/nodes/` and write a new `root` goal with the old root's title and Goal. Deleting the old nodes needs the user's approval; Git history keeps them.
  3. Project Knowledge stays, and may be changed where the new rules need it.

  `dev-next` then recommends planning the root.
- Say that the menu follows the update, because reviews read the project's copy of the rules.

## Apply

Run on `main` in the main checkout. When a blackbox or collaborative leaf is `in_progress`, its implementation runs under the current rules: recommend updating after it merges, and continue only when the user agrees. Commit message: `chore: update the Dev Framework`.

1. Run sync, then the map script. The map script may refuse records in an earlier format, such as a done node without its finishing line or an untagged ticket; the next step handles them.
2. Return to the diagnosis, which offers the menu. Records written for an earlier Framework often break newer rules; the script messages give the fix. These need more:

   | Finding | Migration |
   | --- | --- |
   | Plan: nodes without `kind` | Start a new Plan, as Propose says |
   | Links to paths an earlier Framework used | Point them to `knowledge/dev-framework/` |
   | Build status in Knowledge, which an earlier Framework asked for | Remove it. The Implemented line of each done implementation leaf links the Knowledge it implements instead. |
   | `.tmp/doctor/findings.md`, which an earlier Framework kept | Nothing reads it now; the next review records its findings in `.dev/review.jsonl`. Delete it once that review has run. |
   | Knowledge outside a category, or in a workspace's `knowledge/` | Recommend a category for each document by the question it answers, and a name without a milestone. Commit the moves before splitting a mixed document, so Git keeps each file's history. |
