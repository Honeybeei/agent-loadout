# Merge

Review a `completed` implementation in two parts, the code by the agent and the output by the user, then either send findings back, or merge it with the leaf's updates and clean up.

## Check freshness

1. Read the report. Confirm that `impl/<node>` points at the report's Branch commit and that `git -C <worktree> status --porcelain` prints nothing. Otherwise, the report is stale or work is uncommitted: say so in the review file (below) and stop.
2. Compare `main` with the report's Based on commit, outside Plan and Knowledge:

   ```bash
   git diff --quiet <based-on> main -- . ':(exclude)plan' ':(exclude,glob)**/knowledge/**'
   ```

   When it exits with 1, `main` has changes the implementation has not merged: ask in the review file for a refresh, merging `main` and verifying again, and stop.

## Review the code

Review the change with subagents in parallel, each with a fresh context and read-only access. They compare `git diff main...impl/<node>` with the leaf's Completion criteria, Interface, Out of scope, and Relies on, with the Knowledge on `main` now, with the project's rules, and with the report's Deviations and Uncertain parts. One of them checks that the report's evidence matches the diff. They judge whether the checks pass, the scope holds, nothing outside it changed, and the Interface matches; the user will not read the code.

## Review the output

1. Show the user a summary of the report in the user's language, the code findings with their severity, and how to see the output, taken from the leaf's Verification and the report.
2. Ask the user whether the output meets each Completion criterion and whether the result is satisfying.
3. Anything the user dislikes is a spec gap: a finding that also names what the node should have said.

## Send findings back

When code findings or spec gaps need fixes, write them to `.tmp/reviews/<node>.md` in this checkout, replacing any earlier file: one numbered finding per item, each with its file or the part of the output, the problem, and the rule, criterion, or user's wish it breaks. Tell the user: "In the implementation session, invoke dev-blackbox-implement with <node> again." Stop, and review again when the new report arrives.

## Merge

When nothing needs fixing, ask once, and show:

- `impl/<node>` merging into `main`, with the message `plan(<node>): implement <title>`;
- the leaf updates: the ticked criteria, any spec gaps added to Output or the criteria, the Record lines, and `done`; and what the report found that moves to its owner;
- the cleanup: removing the worktree and deleting the branch;
- the question whether the implementation session is closed.

On approval:

1. Run `git merge --no-ff --no-commit impl/<node>`.
2. Run the automated checks `AGENTS.md` names. When one fails, run `git merge --abort`, write the failure to the review file, tell the user, and stop.
3. Update the leaf: tick the met criteria, add each spec gap to Output or the criteria with a `Spec gap: <what was missing>` Record line, add its Implemented line to Record, as the [template](../../../../knowledge/dev-framework/plan-documentation/blackbox.md#template) gives it, and set `done`. Move what the report found that later work relies on to its owner, as [Recording decisions](../../../../knowledge/dev-framework/plan-documentation.md#recording-decisions) says. Regenerate the map, and stage exactly the files this step changed.
4. Commit the merge with its message.
5. Clean up when the worktree has no uncommitted or untracked files, the branch is fully merged, and the user confirmed the implementation session is closed: run `git worktree remove <worktree>` and `git branch -d impl/<node>`, and delete `.tmp/reviews/<node>.md`. Otherwise, leave them in place and say why.
