# Merge

Review a `completed` implementation, then either send findings back, or merge it with the node's updates and clean up.

## Check freshness

1. Read the report. Confirm that `impl/<node>` points at the report's Branch commit and that `git -C <worktree> status --porcelain` prints nothing. Otherwise, the report is stale or work is uncommitted: say so in the review file (below) and stop.
2. Compare `main` with the report's Based on commit, outside Plan and Knowledge:

   ```bash
   git diff --quiet <based-on> main -- . ':(exclude)plan' ':(exclude,glob)**/knowledge/**'
   ```

   When it exits with 1, `main` has changes the implementation has not merged: ask in the review file for a refresh, merging `main` and verifying again, and stop.

## Review

1. Review the change with subagents in parallel, each with a fresh context and read-only access. They compare `git diff main...impl/<node>` with the node's Completion criteria, Out of scope, and Relies on, with the project's rules, and with the report's Deviations and Uncertain parts. One of them checks that the report's evidence matches the diff. Without subagents, make the same comparisons yourself, one part at a time.
2. Merge their results. Show the user a summary of the report in the user's language, the findings with their severity, and a recommendation.

## Send findings back

When findings need fixes, write them to `.tmp/reviews/<node>.md` in this checkout, replacing any earlier file: one numbered finding per item, each with its file, the problem, and the rule or criterion it breaks. Tell the user: "In the implementation session, invoke dev-implement with <node> again." Stop, and review again when the new report arrives.

## Merge

When nothing needs fixing, ask once, and show:

- `impl/<node>` merging into `main`, with the message `plan(<node>): implement <title>`;
- the node updates: the ticked criteria, the Record line, and `done`;
- the cleanup: removing the worktree and deleting the branch;
- the question whether the implementation session is closed.

On approval:

1. Run `git merge --no-ff --no-commit impl/<node>`.
2. Run the automated checks `AGENTS.md` names. When one fails, run `git merge --abort`, write the failure to the review file, tell the user, and stop.
3. Update the node: tick the met criteria, add `Implemented (<mode>): <what was done>, <evidence>` to Record, set `done`, and regenerate the map. Stage exactly these Plan files.
4. Commit the merge with its message.
5. Clean up when the worktree has no uncommitted or untracked files, the branch is fully merged, and the user confirmed the implementation session is closed: run `git worktree remove <worktree>` and `git branch -d impl/<node>`, and delete `.tmp/reviews/<node>.md`. Otherwise, leave them in place and say why.
