# Merge

Review a `completed` implementation, then send findings back, or merge it with the leaf's updates and clean up.

## Check freshness

1. Read the report. Confirm that `impl/<node>` points at the report's Branch commit and that `git -C <worktree> status --porcelain` prints nothing. Otherwise, the report is stale or work is uncommitted: say so in the review file (below) and stop.
2. Compare `main` with the report's Based on commit, outside Plan and Knowledge:

   ```bash
   git diff --quiet <based-on> main -- . ':(exclude)plan' ':(exclude,glob)**/knowledge/**'
   ```

   When it exits with 1, `main` has changes the implementation has not merged: ask in the review file for a refresh, merging `main` and verifying again, and stop.

## Review the code

Judge `impl/<node>` in its worktree by the [brief](judge.md), with the report, and with the brief's fix-round line when the review file names a reviewed commit. Combine findings that several subagents reported for one problem.

## Review the output

1. While the judging runs, show the user, in the user's language, a summary of the report and how to see the output, from the leaf's Verification and the report; when it ends, the breaks and the other findings with recommendations, in a fix round only what changed.
2. Ask where each other finding goes, and settle any decision a break's fix needs, as [Judging the result](../../../../knowledge/dev-framework/plan-documentation/blackbox.md#judging-the-result) says.
3. Ask the user to judge the output where it changed since the user last did. The user may put this off only while findings go back; a merge needs it, or the user's word to merge without it.

## Send findings back

Once the user has answered, when a break or a spec gap needs a fix, write `.tmp/reviews/<node>.md` in this checkout, replacing any earlier file but keeping its other findings: the round, the commit reviewed, and whether the user has judged the output; one numbered finding per break or spec gap, with its file or part of the output, the problem, the text or wish it breaks, and any decision its fix needs; and the other findings with the user's placements, which the implementation session leaves alone. Before writing findings back a third time, ask whether to merge now instead, planning the unmet criteria as a new leaf. Tell the user, with absolute paths: "Review written to <review file>. In the implementation session at <worktree>, invoke dev-blackbox-implement with <node>; it reads the review itself." Stop, and review again when the new report arrives.

## Merge

When no break or spec gap remains, or the user chose to merge, plan any later work the user placed, and one new leaf for any unmet criteria, which leave this leaf, through [dev-plan](../../dev-plan/SKILL.md) step 2 under the leaf's goal. Then ask once, and show:

- `impl/<node>` merging into `main`, with the message `plan(<node>): implement <title>`;
- the leaf updates: the ticked criteria, any spec gaps added to Output or the criteria, the Record lines, and `done`; what the report found that moves to its owner; and the nodes planned for later work;
- the cleanup: removing the worktree and deleting the branch;
- the question whether the implementation session is closed.

On approval:

1. Run `git merge --no-ff --no-commit impl/<node>`.
2. Run the automated checks `AGENTS.md` names. When one fails, run `git merge --abort`, write the failure to the review file, tell the user, and stop.
3. Update the leaf: tick the met criteria, add each spec gap to Output or the criteria with a `Spec gap: <what was missing>` Record line, add its Implemented line and a Left line for each finding the user dropped or planned as later work to Record, as the [template](../../../../knowledge/dev-framework/plan-documentation/blackbox.md#template) gives them, and set `done`. Move what the report found that later work relies on to its owner, as [Recording decisions](../../../../knowledge/dev-framework/plan-documentation.md#recording-decisions) says. Regenerate the map, and stage exactly the files this step and the planning changed.
4. Commit the merge with its message.
5. Clean up when the worktree has no uncommitted or untracked files, the branch is fully merged, and the user confirmed the implementation session is closed: run `git worktree remove <worktree>` and `git branch -d impl/<node>`, and delete `.tmp/reviews/<node>.md`. Otherwise, leave them in place and say why.
