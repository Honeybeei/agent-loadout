---
canonical_for:
  - Branches and worktrees
  - Git integration and approvals
managed_by: dev-framework
---

# Git Workflow

This document defines branches, worktrees, integration, and the approvals Git operations need.

## Branches

- `main` is the integration baseline for validated, user-approved changes. Merging into `main` is not a release.
- Work on a branch named `work/<short-purpose>` in lowercase English kebab-case, such as `work/improve-chat-responsiveness`. Name the outcome, not a change type such as feature or fix.
- Start new branches from `main`. Start from another work branch only when the work depends on its unmerged changes, and say so.
- A branch does not map one-to-one to a Plan item.
- A UI prototype that must run inside the app lives on a `prototype/<name>` branch, which is never merged. Record its decision in the Plan or Knowledge; the branch only keeps the prototype for reference.
- Renaming existing branches to this convention is a separate change.

## Worktrees

- Use a separate worktree only to run independent work in parallel, to inspect another branch while keeping current changes, or to isolate an experiment.
- Run each agent session at its worktree's root. Two agents that write must not share a working directory.
- Uncommitted and untracked changes are a normal state. Preserve them instead of resetting or cleaning them to make an operation easier.

## Integration

- Merge with `--no-ff` by default. Use squash or rebase only when the user chooses it.
- Before merging, name the source and target branches, run the project's validation, show the result, and get the user's approval.

## Approvals

Each approval covers only its own step:

| Approval | Does not cover |
| --- | --- |
| Design, implementation, or record edits | Staging, commits, merges, or pushes |
| Staging and committing | Merging into `main` or pushing |
| Merging | Pushing, releasing, or deleting branches and worktrees |
| Cleanup of a named branch or worktree | Deleting anything else |

The user may approve several steps at once, such as "commit and merge". Carry out the approved steps without asking again.

## Cleanup

- Keep branches and worktrees after merging. Propose cleanup only after checking that the work is merged, nothing still uses it, and no untracked or ignored files need keeping.
- After a failed operation, report the actual state instead of rolling back or cleaning up automatically.
