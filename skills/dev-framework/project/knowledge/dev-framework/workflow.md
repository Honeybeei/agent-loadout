---
canonical_for:
  - Development workflow
  - Lead and implementation sessions
  - Dispatch, implementation reports, and reviews
managed_by: dev-framework
---

# Development Workflow

This document defines how work moves through a Framework project: the two flows, the sessions that run them, and the files they pass to each other. Node status and Record lines are defined in [Plan documentation](plan-documentation.md); branches, worktrees, commits, and merges in [Git workflow](git-workflow.md).

## Flows and sessions

| Flow | Session | Where | Skills |
| --- | --- | --- | --- |
| Main flow: choose work, explore, dispatch, review | The lead session | The main checkout, on `main` | `dev-next`, `dev-explore`, `dev-dispatch`, `dev-review` |
| Implement flow: build one dispatched node and report | An implementation session | The node's worktree, on `impl/<node>` | `dev-implement` |

```text
lead session                                            implementation session
dev-next → dev-explore → dev-dispatch ────────────────→ dev-implement → report
   ↑                                                                      │
   └──────────────────────────── dev-review ←─────────────────────────────┘
```

- The lead session persists across dispatches. Decisions are recorded in Plan and Knowledge as they are made, so a new lead session can continue from the files when the old one ends.
- Each dispatch gets a new implementation session, which the user opens in the worktree. It lasts until review merges or discards the worktree, and it also makes the fixes review asks for.
- The main flow does not wait for implementations. It keeps exploring and dispatching other nodes, and reviews each implementation when its report arrives. It leaves a dispatched node to its implementation session until review merges or reopens it, and explores other branches of the tree meanwhile.
- Only the main flow edits `plan/` and `knowledge/`. An implementation session writes code, tests, configuration, and other files within its node's scope, such as a workspace README the node's criteria require.
- Every implementation runs in its own worktree, however small.

## Writing across sessions

A session writes only inside its own checkout, and may read the other checkouts of the repository. The one exception is the worktree itself: the main flow creates and removes worktrees with `git worktree`, and removes one only after the user confirms that its implementation session is closed.

Sessions pass records to each other through files in their own `.tmp/`:

| File | Written by | Read by |
| --- | --- | --- |
| `.tmp/reports/<node>.md` in the worktree | The implementation session | `dev-next` and `dev-review` |
| `.tmp/reviews/<node>.md` in the main checkout | `dev-review` | The implementation session |

The lead session finds a node's worktree at `../<repository directory>.worktrees/<node>`, as [Git workflow](git-workflow.md#worktrees) says. The implementation session finds the main checkout as the first entry of `git worktree list`.

## Dispatch

A node can be dispatched when it is a `ready` leaf, every node in its `depends_on` is `done`, and no `impl/<node>` branch exists.

The implementation session works only from the node, the documents it relies on, and the project's rules. Dispatch is therefore the last chance to complete the node: whatever the implementation needs goes into its Completion criteria, Out of scope, or Relies on before the claim.

The user chooses a mode at dispatch:

| | Blackbox | Collaborative |
| --- | --- | --- |
| Use for | Parts with clear boundaries whose internals the user does not need to know | Important parts, structure the user wants to shape, parts the user wants to learn |
| Progress | The session builds the whole node and stops only at a blocker | One slice at a time: propose it, build it, show the diff and check results, wait for the user |
| Who writes code | The agent | The agent, or the user while the agent guides and reviews |

## Blockers

An implementation session decides what the main flow would not have to record in Plan or Knowledge, and stops at anything it would. That one test separates the two:

| The session decides | The session stops at |
| --- | --- |
| Names, file layout, internal algorithms, test structure | The choice of a framework, a storage format, or an external service |
| A small utility library, noted under Deviations in the report | A change to the Goal, the Completion criteria, or the scope |
| | The shape of an API or behavior that other nodes use |
| | Edits outside the node's scope |
| | Verification that keeps failing for a cause outside the node |

- When unsure, pick the option that is easy to reverse and list it under Uncertain parts; stop when reversing it would be costly.
- A blocker means the node was not explored enough. The session stops building at once and writes a `blocked` report; it neither decides nor records the question.
- In collaborative mode the user shapes only what the session may decide. A question that must be recorded goes back to the main flow like any other blocker.

## Reports

Every implementation ends with a report at `.tmp/reports/<node>.md` in its worktree, written in English. A fix round replaces it, so it always holds the latest state.

```markdown
# Implementation report: <node> — <title>

- Result: completed | blocked
- Mode: blackbox | collaborative
- Branch: impl/<node> at <short commit>
- Based on: main at <short commit>
- Written: <UTC time>

## Summary
<Two or three lines: what was built, or where and why it stopped>

## Completion criteria
- Met: <criterion> — <evidence: a command, a file, or a test>
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
<Only when blocked: what happened; why the node was not enough; the questions to explore, tagged like Plan open questions; the work so far, and whether it is worth parking>
```

Before a `completed` report, the session merges `main` into `impl/<node>`, verifies the result, and records that `main` commit under Based on. It commits all its work first, so the worktree is clean apart from ignored files.

## Review

`dev-review` decides what happens to a dispatched node after its report, and closes finished `decomposed` nodes:

| Case | Outcome |
| --- | --- |
| `completed`; `main` has no changes outside `plan/` and `knowledge/` since Based on; nothing to fix | Merge as [Git workflow](git-workflow.md#integration) says, with the node's updates, then clean up |
| `completed`, but `main` has other changes since Based on | Ask for a refresh: merge `main` and verify again |
| `completed`, with findings | Write them to the review file; the implementation session addresses them and reports again |
| `blocked`, or recalled by the main flow | Reopen: the node goes back to `exploring` with its findings and questions recorded. The work is discarded, or parked when the user chooses. |
| A `decomposed` node whose children are all `done` or `cancelled` | Close: verify its own criteria and set it `done`. An unmet criterion becomes a new child node. |

- Review verifies the merged result itself; the report's evidence counts only for manual verification.
- A report is removed with its worktree. Move what must last into Plan before cleanup.

## Changing Knowledge while implementations run

The main flow may change Knowledge at any time. When a commit changes a document that a dispatched node relies on, the commit prompt names those nodes and recommends one choice for each; the user decides:

| Choice | Meaning |
| --- | --- |
| No effect | The implementation continues unchanged |
| Notify | The user tells the implementation session to merge `main` and follow the change. The decision is already recorded, so it is not a blocker. |
| Recall | The dispatch is cancelled, and review reopens the node as for a blocker |

Review always judges an implementation against the Knowledge at merge time.
