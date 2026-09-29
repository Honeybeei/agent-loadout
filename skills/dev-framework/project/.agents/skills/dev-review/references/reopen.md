# Reopen

Return a blocked or recalled node to exploration, keep what its implementation found, and discard or park the work.

1. For a recall, ask the user to stop the implementation session and to give the reason. For `blocked`, read the report's Blocker section.
2. Show the user what happened, the questions, and the worktree's uncommitted changes (`git -C <worktree> status --short`). Ask whether to discard the work, which is recommended, or park it, and whether the implementation session is closed.
3. Record on `main`: set the node to `exploring` and replace its stage block, as [Plan documentation](../../../../knowledge/dev-framework/plan-documentation.md) says; add the questions to Open questions and `Reopened: <why>, <what it found>` to Record; move facts that later work will rely on into Knowledge; and regenerate the map. Offer the commit: `plan(<node>): reopen after a blocked implementation`, or `after a recall`. When it changes Knowledge that another `in_progress` node relies on, handle that as [Development workflow](../../../../knowledge/dev-framework/workflow.md#changing-knowledge-while-implementations-run) says.
4. Once the session is closed:
   - Discard: run `git worktree remove --force <worktree>`, then `git branch -D impl/<node>`.
   - Park: run `git worktree remove --force <worktree>`, then `git branch -m impl/<node> parked/<node>-<n>` with the next free `<n>`, counting from 1. Only committed work is kept.
5. Delete `.tmp/reviews/<node>.md` if it exists, then suggest exploring the node.
