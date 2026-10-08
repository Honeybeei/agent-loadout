---
canonical_for:
  - Branches and worktrees
  - Commits and commit messages
  - Git integration and approvals
managed_by: dev-framework
---

# Git Workflow

This document defines branches, worktrees, commits, integration, and the approvals Git operations need. Which session takes each step is defined in [Development workflow](workflow.md).

## Branches

| Branch | Holds | Lifetime |
| --- | --- | --- |
| `main` | The integration baseline: the Plan and Knowledge the lead session commits, and the implementations merged into it. Merging into `main` is not a release. | Permanent |
| `impl/<node>` | One implementation leaf, created from `main` when it starts | Until it is merged or discarded |
| `prototype/<name>` | A prototype that must run inside the app; never merged | Kept for reference; its decision lives in the Plan or Knowledge |

Create no other branches. Planning and explore leaves commit to `main`.

## Worktrees

- Each blackbox leaf's `impl/<node>` has its own worktree beside the main checkout, at `../<repository directory>.worktrees/<node>`. For example, `~/code/app` keeps its worktrees in `~/code/app.worktrees/`.
- Run each agent session at its checkout's root. Two agents that write must not share a working directory.
- Only the lead session creates and removes worktrees; see [Writing across sessions](workflow.md#writing-across-sessions).
- Uncommitted and untracked changes are a normal state. Preserve them instead of resetting or cleaning them to make an operation easier.

## Implementation branches

Starting an implementation leaf: set it `in_progress` on `main` and commit, then create `impl/<node>` from `main`.

| Kind | Where `impl/<node>` is checked out |
| --- | --- |
| Blackbox | Its own worktree: `git worktree add -b impl/<node> ../<repository directory>.worktrees/<node> main` |
| Collaborative | The main checkout: `git switch -c impl/<node>` |

- The main checkout stays on `main`, except while a collaborative leaf is open: then it is on that leaf's branch.
- While a collaborative leaf is open, the lead session switches to `main` only at a slice boundary, once the slice is committed and the working tree is clean apart from ignored files, and switches back afterwards.

## Commits

| Branch | Unit | Approval |
| --- | --- | --- |
| `main` | One step that changes the Plan: a planning, a finished explore leaf, the start of an implementation, a merge, a reopened or closed node, a cancellation, or a changed Goal; or one adoption, update, or conformance fix of the Framework | Ask each time: say what was done since the last commit, and show the files and the message |
| `impl/<node>`, blackbox | One verified slice | None: the branch stays disposable until review |
| `impl/<node>`, collaborative | One slice the user reviewed | Ask together with the slice review |

- Before a commit on `main` that changes Plan or Knowledge, run the [commit gate](../../.agents/skills/dev-framework/review.md#commit-gate): the Framework checks and a defect review of the change, whose findings in text the change wrote are fixed before the commit. Commits that adopt or update the Framework skip it.
- Commit only the files the step wrote, by path, with the review state `.dev/review.jsonl` the gate updated. Leave other changes and the staging area as they are. A declined commit stays uncommitted.
- Write commit messages in English, in the Conventional Commits form `<type>(<scope>): <subject>`.
- A commit of a step that changes the Plan follows one pattern: `plan(<node>): <what happened>`, with the node the step is about as the scope. For example, `plan(web-service): plan three leaves and an explore`. `git log --grep '^plan('` then reads as the project's history of decisions and work. Commits that adopt or update the Framework, or bring the project in line with it, use `chore:`.
- Code commits on `impl/<node>` follow the project's convention in `AGENTS.md`, or Conventional Commits types such as `feat` and `fix` when it has none.

## Integration

An implementation leaf, blackbox or collaborative, is merged the same way:

1. In the main checkout on `main`, run `git merge --no-ff --no-commit impl/<node>`, and resolve any conflicts.
2. Add the leaf's updates: ticked criteria, Record, and `done`. A collaborative leaf also finishes its node and its planning here, as [Collaborative nodes](plan-documentation/collaborative.md#finishing) says.
3. Run the automated checks `AGENTS.md` names. Commit as `plan(<node>): implement <title>`, or run `git merge --abort` when a check fails.

- A blackbox branch must already contain the latest code on `main`; its implementation session merges `main` before reporting.
- Use squash or rebase only when the user chooses it.

## Approvals

Each approval covers only its own step:

| Approval | Covers | Does not cover |
| --- | --- | --- |
| A commit on `main` | That commit | Other commits, merges, pushes |
| Merging an implementation | The merge once the checks pass, removing its worktree, and deleting its branch | Pushing |
| Discarding an implementation | Its worktree and branch, including unmerged commits | Anything else |
| Cleaning up a named branch or worktree | That branch or worktree | Deleting anything else |

- Pushing always needs its own approval.
- The user may approve several steps at once, such as "commit and push". Carry out the approved steps without asking again.

## Cleanup

- Delete a merged `impl/<node>` only when it is fully merged. For a blackbox leaf, remove its worktree first, and only when the worktree has no uncommitted or untracked files and the user confirmed its implementation session is closed. Otherwise, leave both and report why.
- After a failed operation, report the actual state instead of rolling back or cleaning up automatically.
