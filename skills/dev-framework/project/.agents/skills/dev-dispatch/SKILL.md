---
name: dev-dispatch
description: Dispatch a ready node of a Dev Framework project's Plan to a new implementation session in its own worktree. Takes a node name and, optionally, blackbox or collaborative.
disable-model-invocation: true
---

# Dev Dispatch

Hand one `ready` node to a new implementation session: complete the node, claim it on `main`, and create its branch and worktree. Dispatch belongs to the main flow and writes no product code. Before starting, read [Development workflow](../../../knowledge/dev-framework/workflow.md) for dispatch and modes, and [Git workflow](../../../knowledge/dev-framework/git-workflow.md) for the branch, worktree, and commit.

## 1. Check

- Confirm the project root has `dev.yaml` and `knowledge/dev-framework.md`. Otherwise, suggest `dev-doctor` and stop.
- Confirm the session is at the main checkout on `main`. Otherwise, say so and stop.
- Read the node, its ancestors' Goal sections, and what it relies on. Dispatch only a `ready` leaf whose `depends_on` nodes are all `done`, with no `impl/<node>` branch and no `../<repository directory>.worktrees/<node>` directory. Otherwise, say why and follow [dev-next](../dev-next/SKILL.md).
- When `parked/<node>-<n>` branches exist, show them and ask whether to continue from the latest one or start fresh from `main`.

## 2. Complete the node

The implementation session will work only from the node, the documents it relies on, and the project's rules. Ask the user once whether it needs anything the node does not say, and write each answer into Completion criteria, Out of scope, or Relies on.

When an answer raises an undecided question, the node is not ready: stop, and suggest exploring it instead.

## 3. Choose the mode

Take blackbox or collaborative from the arguments. Otherwise, recommend one with a one-line reason from Development workflow's mode table, and ask once.

## 4. Claim

1. Set the node's status to `in_progress`, add the Record line `Dispatched (<mode>): impl/<node>`, and regenerate the map (see [Map](#map)).
2. Offer the commit, with the node completion from step 2: `plan(<node>): dispatch in <mode> mode`. Continue only once it is committed, because the worktree starts from `main`.

## 5. Create the worktree

Create the branch and its worktree beside the main checkout:

```bash
git worktree add -b impl/<node> ../<repository directory>.worktrees/<node> main
```

To continue from a parked branch, use `parked/<node>-<n>` instead of `main` as the start point, then delete the parked branch; its commits are now on `impl/<node>`, and the implementation session merges `main` before it reports.

## 6. Hand over

Show:

```text
Dispatched: <node> (<mode>)
Worktree: <absolute path>, on impl/<node>
Next: open a new agent session in that directory and invoke dev-implement with "<node> <mode>".
```

The main flow does not wait: follow [dev-next](../dev-next/SKILL.md) for the next main-flow step.

## Authority

| Without asking | Ask first | Always separate |
| --- | --- | --- |
| Reading; writing the user's answers into the node; regenerating the map; creating the branch and worktree after the claim commit; deleting a parked branch the user chose to continue from | The claim commit | Merges, pushes; installs; product code; writing inside the worktree |

## Map

Regenerate the map from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .
```
