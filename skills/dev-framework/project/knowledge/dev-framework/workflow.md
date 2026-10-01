---
canonical_for:
  - Development workflow
  - Lead and implementation sessions
  - Blackbox dispatch, reports, and reviews
managed_by: dev-framework
---

# Development Workflow

This document defines who runs each kind of Plan work, where, and the files sessions pass to each other. Node kinds, status, and templates are defined in [Plan documentation](plan-documentation.md); branches, worktrees, commits, and merges in [Git workflow](git-workflow.md).

## Sessions

| Session | Where | Runs | Skills |
| --- | --- | --- | --- |
| The lead session | The main checkout | Planning, explore leaves, collaborative leaves, and the dispatch and review of blackbox leaves | `dev-next`, `dev-plan`, `dev-explore`, `dev-collaborate`, `dev-blackbox-dispatch`, `dev-blackbox-review` |
| An implementation session | A blackbox leaf's worktree, on `impl/<node>` | One blackbox leaf | `dev-blackbox-implement` |

```text
lead session                                                 implementation session
dev-next ──→ dev-plan, dev-explore, dev-collaborate
        └──→ dev-blackbox-dispatch ───────────────────────→ dev-blackbox-implement → report
                                                                                     │
             dev-blackbox-review ←───────────────────────────────────────────────────┘
```

- The lead session runs one leaf at a time, an explore or a collaborative leaf. Blackbox leaves run in parallel in their own sessions: the lead session dispatches them, keeps working, and reviews each when its report arrives. While a collaborative leaf is open, it reviews at a slice boundary, as [Git workflow](git-workflow.md#implementation-branches) says.
- Only the lead session edits `plan/` and `knowledge/`. An implementation session writes code, tests, configuration, and other files within its node's scope, such as a workspace README the node's criteria require.
- The lead session persists across leaves. Decisions are recorded in the Plan and Knowledge when each leaf finishes, and in the running leaf's node before that, so a new lead session can continue from the files.
- Each dispatch gets a new implementation session, which the user opens in the worktree. It lasts until review merges or discards the worktree, and it also makes the fixes review asks for.

## Writing across sessions

A session writes only inside its own checkout, and may read the other checkouts of the repository. The one exception is the worktree itself: the lead session creates and removes worktrees with `git worktree`, and removes one only after the user confirms that its implementation session is closed.

Sessions pass records to each other through files in their own `.tmp/`:

| File | Written by | Read by |
| --- | --- | --- |
| `.tmp/reports/<node>.md` in the worktree | The implementation session | `dev-next` and `dev-blackbox-review` |
| `.tmp/reviews/<node>.md` in the main checkout | `dev-blackbox-review` | The implementation session |

The lead session finds a node's worktree at `../<repository directory>.worktrees/<node>`, as [Git workflow](git-workflow.md#worktrees) says. The implementation session finds the main checkout as the first entry of `git worktree list`.

## Dispatch

A blackbox leaf can be dispatched when it is `todo`, every node in its `depends_on` is `done`, it passes the [readiness check](plan-documentation/blackbox.md#readiness-check), and no `impl/<node>` branch exists.

The implementation session works only from the node, the documents it relies on, and the project's rules. Whatever it needs must be in the node before the claim.

## Reports

Every blackbox implementation ends with a report at `.tmp/reports/<node>.md` in its worktree, written in English. A fix round replaces it, so it always holds the latest state.

```markdown
# Implementation report: <node> — <title>

- Result: completed | blocked
- Branch: impl/<node> at <short commit>
- Based on: main at <short commit>
- Written: <UTC time>

## Summary
<Two or three lines: what was built, or where and why it stopped>

## Completion criteria
- Met: <criterion> — <evidence: a command, a file, a test, or where to see the output>
- Not met: <criterion> — <reason>

## Verification
- `<command>` → <result>

## Commits
- <short commit> <subject>

## Deviations
<What differs from the node, and why; "None" when nothing does>

## Uncertain parts
<Where a reviewer should look closely; "None" when nothing is uncertain>

## Blocker
<Only when blocked: what happened; why the node was not enough; the questions to explore, tagged like explore tickets; the work so far>
```

Before a `completed` report, the session merges `main` into `impl/<node>`, verifies the result, and records that `main` commit under Based on. It commits all its work first, so the worktree is clean apart from ignored files.

## Review

`dev-blackbox-review` judges the result as [Blackbox nodes](plan-documentation/blackbox.md#judging-the-result) says, then decides what happens:

| Case | Outcome |
| --- | --- |
| `completed`; `main` has no changes outside `plan/` and `knowledge/` since Based on; nothing to fix | Merge as [Git workflow](git-workflow.md#integration) says, with the node's updates, then clean up |
| `completed`, but `main` has other changes since Based on | Ask for a refresh: merge `main` and verify again |
| `completed`, with findings in the output or the code | Write them to the review file; the implementation session addresses them and reports again |
| `blocked`, or recalled by the lead session | Reopen: discard the worktree and the branch, set the leaf back to `todo`, and add an explore leaf holding the blocker's questions to its `depends_on` |

- Review verifies the merged result itself; the report's evidence counts only for manual verification.
- A report is removed with its worktree. Move what must last into the Plan before cleanup.

## Changing Knowledge while blackbox leaves run

When the lead session commits a Knowledge change, such as a finished explore leaf or a collaborative merge, and a dispatched blackbox leaf relies on a changed document, the commit prompt names those leaves and recommends one choice for each; the user decides:

| Choice | Meaning |
| --- | --- |
| No effect | The implementation continues unchanged |
| Notify | The user tells the implementation session to merge `main` and follow the change. The decision is already recorded, so it is not a blocker. |
| Recall | The dispatch is cancelled, and review reopens the leaf as for a blocker |

Review always judges a blackbox implementation against the Knowledge at merge time, and resolves any mismatch there.
