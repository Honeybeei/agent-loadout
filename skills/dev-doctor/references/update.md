# Update

Bring a Framework project up to the installed Framework. Sync replaces managed material as a whole; project records change only through fixes the user approves.

## Propose

- Show what sync would change: the `Managed material` findings.
- When sync is blocked, show how to clear each problem: commit or stash the listed changes, move skills out of a real `.claude/skills/` directory into `.agents/skills/`, or repair the section markers.
- When `plan/` has uncommitted changes, ask the user to commit or set them aside first. The map script regenerates the map from the working tree, so the update's map would carry them.
- List the branches other than `main`, `impl/*`, and `prototype/*`, which [Git workflow](../../dev-framework/project/knowledge/dev-framework/git-workflow.md#branches) no longer uses, such as `parked/*`, with whether each is merged into `main`. Propose deleting the merged ones, and ask about the others.
- When `plan/nodes/` holds nodes without a `kind` field, the Plan was written for an earlier Framework without node kinds. There is no migration; the project starts a new Plan:
  1. Before the update, finish or discard each running implementation: its `impl/*` branch and worktree.
  2. After sync, empty `plan/nodes/` and write a new `root` goal with the old root's title and Goal. Deleting the old nodes needs the user's approval; Git history keeps them.
  3. Project Knowledge stays, and may be changed where the new rules need it.

  `dev-next` then recommends planning the root.
- Say that the check menu follows the update, because the checks read the project's copy of the rules.

## Apply

Run on `main` in the main checkout. When `impl/*` branches exist, implementations are running under the current rules: recommend updating after they are merged, and continue only when the user agrees. Commit message: `chore: update the Dev Framework`.

1. Run sync, then the map script. The map script may refuse records in an earlier format; the next step handles them.
2. Return to the diagnosis, which offers the check groups. Records written for an earlier Framework often need migration; when the checks report them, fix them this way:

   | Finding | Migration |
   | --- | --- |
   | Plan: nodes without `kind` | Start a new Plan, as Propose says |
   | Plan: unknown frontmatter fields | Keep the five node fields, and move other content into the node body |
   | Links to paths an earlier Framework used | Point them to `knowledge/dev-framework/` |
   | Leftovers | Migrate what the project still needs, then delete the rest after approval |
