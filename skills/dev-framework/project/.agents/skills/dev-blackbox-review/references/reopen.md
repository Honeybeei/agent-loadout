# Reopen

Return a blocked or recalled blackbox leaf to `todo`, hand what its implementation found to a new explore leaf, and discard the work.

1. For a recall, ask the user to stop the implementation session and to give the reason. For `blocked`, read the report's Blocker section. When `.tmp/reviews/<node>.md` exists, the block came from a fix round; when the user can decide its question now, send the decision back as a numbered finding instead, as [Merge](merge.md#send-findings-back) says.
2. Show the user what happened, the questions, and the worktree's uncommitted changes (`git -C <worktree> status --short`). Say that the work will be discarded, and ask whether the implementation session is closed.
3. Record on `main`, as [Plan documentation](../../../../knowledge/dev-framework/plan-documentation.md) and its kind documents say:
   - Add an explore leaf under the same goal. Its Goal names what must be decided for the blackbox leaf to be ready, its Tickets hold the blocker's questions, and its Notes hold the facts the implementation found.
   - Set the blackbox leaf to `todo`, add the explore leaf to its `depends_on`, and add `Reopened: <why the implementation stopped>, <the explore leaf>` to Record.
   - Regenerate the map, and offer the commit: `plan(<node>): reopen after a blocked implementation`, or `after a recall`.
4. Once the session is closed, run `git worktree remove --force <worktree>`, then `git branch -D impl/<node>`.
5. Delete `.tmp/reviews/<node>.md` if it exists, then suggest running the new explore leaf with [dev-explore](../../dev-explore/SKILL.md).
