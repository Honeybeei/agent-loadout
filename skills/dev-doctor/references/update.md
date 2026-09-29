# Update

Bring a Framework project up to the installed Framework. Sync replaces managed material as a whole; project records change only through fixes the user approves.

## Propose

- Show what sync would change: the `Managed material` findings.
- When sync is blocked, show how to clear each problem: commit or stash the listed changes, move skills out of a real `.claude/skills/` directory into `.agents/skills/`, or repair the section markers.
- When `plan/` has uncommitted changes, ask the user to commit or set them aside first. The map script regenerates the map from the working tree, so the update's map would carry them.
- List the branches other than `main`, `impl/*`, `parked/*`, and `prototype/*`, which [Git workflow](../../dev-framework/project/knowledge/dev-framework/git-workflow.md#branches) no longer uses, with whether each is merged into `main`. Propose deleting the merged ones, and ask about the others.
- List `in_progress` nodes without a `Dispatched` Record line: an earlier Framework implemented them in place. Recommend finishing and merging each on its old branch before the update, or setting it back to `ready` after the update so it can be dispatched.
- Say that the check menu follows the update, because the checks read the project's copy of the rules.

## Apply

Run on `main` in the main checkout. When `impl/*` branches exist, implementations are running under the current rules: recommend updating after they are merged, and continue only when the user agrees. Commit message: `chore: update the Dev Framework`.

1. Run sync, then the map script. The map script may refuse records in an earlier format; the next step handles them.
2. Return to the diagnosis, which offers the check groups. Records written for an earlier Framework often need migration; when the checks report them, fix them this way:

   | Finding | Migration |
   | --- | --- |
   | Plan: unknown frontmatter fields or old status values | Keep the four node fields, move other content into the node body, and recommend a status for each node |
   | Links to paths an earlier Framework used | Point them to `knowledge/dev-framework/` |
   | Leftovers | Migrate what the project still needs, then delete the rest after approval |
