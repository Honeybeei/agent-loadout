# Close

Set a finished `decomposed` node to `done` once its own criteria hold. Its criteria cover how the children work together, so closing needs no worktree.

1. Confirm every child is `done` or `cancelled`. Otherwise, list the unfinished children and stop.
2. Verify each of the node's Completion criteria in this checkout: run the automated checks that the criteria or `AGENTS.md` name, and ask the user about criteria that need their judgment, such as an approval.
3. When every criterion holds, tick them, add `Closed: <how the children were verified together>, <evidence>` to Record, set `done`, regenerate the map, and offer the commit: `plan(<node>): close <title>`.
4. When a criterion does not hold, say which and why, and recommend a new child node for the missing work; the node stays `decomposed`. With the user's agreement, chart it with [dev-explore](../../dev-explore/SKILL.md) on this node.
