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
| `main` | The integration baseline: Plan and Knowledge that the main flow commits directly, and the reviewed implementations merged into it. Merging into `main` is not a release. | Permanent |
| `impl/<node>` | One dispatched node's implementation, created from `main` at dispatch | Until review merges or discards it |
| `parked/<node>-<n>` | A stopped implementation kept for a later dispatch; `<n>` counts from 1 | Until a dispatch continues from it or the user deletes it |
| `prototype/<name>` | A UI prototype that must run inside the app; never merged | Kept for reference; its decision lives in Plan or Knowledge |

Create no other branches. Exploration and dispatch commit to `main`.

## Worktrees

- Each `impl/<node>` has its own worktree beside the main checkout, at `../<repository directory>.worktrees/<node>`. For example, `~/code/app` keeps its worktrees in `~/code/app.worktrees/`. The main checkout stays on `main`.
- Run each agent session at its checkout's root. Two agents that write must not share a working directory.
- Only the main flow creates and removes worktrees; see [Writing across sessions](workflow.md#writing-across-sessions).
- Uncommitted and untracked changes are a normal state. Preserve them instead of resetting or cleaning them to make an operation easier.

## Commits

| Branch | Unit | Approval |
| --- | --- | --- |
| `main` | One unit of thought: a resolved question with its records, a change to the tree's structure, a changed Goal or criteria, a dispatch, a reopened node, a merge, or a closed node | Ask each time: say what was done since the last commit, and show the files and the message |
| `impl/<node>`, blackbox | One verified slice | None: the branch stays disposable until review |
| `impl/<node>`, collaborative | One slice the user reviewed | Ask together with the slice review |

- Commit only the files the step wrote, by path. Leave other changes and the staging area as they are. A declined commit stays uncommitted.
- Write commit messages in English, in the Conventional Commits form `<type>(<scope>): <subject>`.
- Main flow commits use the type `plan`, the node as the scope, and a subject that starts with one of these verbs:

  | Verb | Commit |
  | --- | --- |
  | `decide` | A resolved question and its records |
  | `chart` | New child nodes, or another change to the tree's structure |
  | `cancel` | A node set to `cancelled` |
  | `revise` | A changed Goal or Completion criteria |
  | `dispatch` | A claim: `plan(<node>): dispatch in <mode> mode` |
  | `reopen` | A node set back to `exploring` after a blocked or recalled implementation |
  | `implement` | The merge of a reviewed implementation: `plan(<node>): implement <title>` |
  | `close` | A finished `decomposed` node set to `done` |

  For example, `plan(01-mlp): chart nine ordered slices`. `git log --grep '^plan('` then reads as the project's decision history, and `git log --grep '^plan(<node>)'` as one node's history.
- Code commits on `impl/<node>` follow the project's convention in `AGENTS.md`, or Conventional Commits types such as `feat` and `fix` when it has none.

## Integration

- Merge `impl/<node>` into `main` with `--no-ff`, as the node's `implement` commit. That merge commit also carries the node's updates: ticked criteria, Record, and `done`.
- Merge only a branch that already contains the latest code on `main`; the implementation session merges `main` into it before reporting.
- Verify the merged result before it lands: in the main checkout, merge with `--no-commit`, run the automated checks `AGENTS.md` names, then commit, or run `git merge --abort` when a check fails.
- Use squash or rebase only when the user chooses it.

## Approvals

Each approval covers only its own step:

| Approval | Covers | Does not cover |
| --- | --- | --- |
| A commit on `main` | That commit | Other commits, merges, pushes |
| Merging a reviewed implementation | The merge once the checks pass, removing its worktree, and deleting its branch | Pushing |
| Discarding or parking an implementation | Its worktree and branch, including unmerged commits | Anything else |
| Cleaning up a named branch or worktree | That branch or worktree | Deleting anything else |

- Pushing always needs its own approval.
- The user may approve several steps at once, such as "commit and push". Carry out the approved steps without asking again.

## Cleanup

- Remove a merged implementation's worktree and delete `impl/<node>` only when the worktree has no uncommitted or untracked files, the branch is fully merged, and the user confirmed its implementation session is closed. Otherwise, leave both and report why.
- After a failed operation, report the actual state instead of rolling back or cleaning up automatically.
