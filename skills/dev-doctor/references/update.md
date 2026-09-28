# Update

Bring a Framework project up to the installed Framework. Sync replaces managed material as a whole; project records change only through fixes the user approves.

## Propose

- Show what sync would change: the `Managed material` findings.
- When sync is blocked, show how to clear each problem: commit or stash the listed changes, move skills out of a real `.claude/skills/` directory into `.agents/skills/`, or repair the section markers.
- Say that the check menu follows the update, because the checks read the project's copy of the rules.

## Apply

Branch: `work/update-dev-framework` from `main`. When the project's latest records are on a work branch not yet merged, branch from that one instead, and say so.

1. Run sync, then the map script. The map script may refuse records in an earlier format; the next step handles them.
2. Return to the diagnosis, which offers the check groups. Records written for an earlier Framework often need migration; when the checks report them, fix them this way:

   | Finding | Migration |
   | --- | --- |
   | Plan: unknown frontmatter fields or old status values | Keep the four node fields, move other content into the node body, and recommend a status for each node |
   | Links to paths an earlier Framework used | Point them to `knowledge/dev-framework/` |
   | Leftovers | Migrate what the project still needs, then delete the rest after approval |
