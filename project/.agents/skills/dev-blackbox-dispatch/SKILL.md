---
name: dev-blackbox-dispatch
description: Dispatch a blackbox leaf of a Dev Framework project's Plan to a new implementation session in its own worktree, after checking that the leaf is ready. Takes a blackbox leaf name.
disable-model-invocation: true
---

# Dev Blackbox Dispatch

Hand one blackbox leaf to a new implementation session: check that the node is a complete contract, claim it on `main`, and create its branch and worktree. Dispatch belongs to the lead session and writes no product code. Before starting, read [Blackbox nodes](../../../knowledge/dev-framework/plan-documentation/blackbox.md) for the template and the readiness check, [Development workflow](../../../knowledge/dev-framework/workflow.md#dispatch) for dispatch, and [Git workflow](../../../knowledge/dev-framework/git-workflow.md) for the branch, worktree, and commit.

## 1. Check

- Confirm the project root has `dev.yaml` and `knowledge/dev-framework.md`. Otherwise, suggest `dev-doctor` and stop.
- Confirm the session is at the main checkout on `main`. While a collaborative leaf is open, switch to `main` at a slice boundary first, as [dev-collaborate](../dev-collaborate/SKILL.md) says.
- Read the leaf, its ancestors' Goal sections, and what it relies on. Dispatch only a `todo` blackbox leaf whose `depends_on` nodes are all `done`, with no `impl/<node>` branch and no `../<repository directory>.worktrees/<node>` directory. Otherwise, say why and follow [dev-next](../dev-next/SKILL.md).

## 2. Run the readiness check

The implementation session will work only from the node, the documents it relies on, and the project's rules, and the user will judge only its output. Run the readiness check from Blackbox nodes yourself, every step, and show its result.

- A gap the user can settle now, such as a missing state in Output, goes into the node with the user's answer.
- A gap that needs a decision recorded in Knowledge, or a leaf that is too large, means the leaf is not ready: stop, and suggest [dev-plan](../dev-plan/SKILL.md) on its goal to add an explore leaf or split it.
- Finish with the user's approval of the Output and the Completion criteria.

## 3. Claim

1. Set the leaf `in_progress`, add the Record line `Dispatched: impl/<node>`, and regenerate the map (see [Map](#map)).
2. Offer the commit, with the node changes from step 2: `plan(<node>): dispatch <title>`. Continue only once it is committed, because the worktree starts from `main`.

## 4. Create the worktree

Create the branch and its worktree beside the main checkout:

```bash
git worktree add -b impl/<node> ../<repository directory>.worktrees/<node> main
```

## 5. Hand over

Show:

```text
Dispatched: <node>
Worktree: <absolute path>, on impl/<node>
Next: open a new agent session in that directory and invoke dev-blackbox-implement with <node>.
```

The lead session does not wait: follow [dev-next](../dev-next/SKILL.md) for its next step, or return to the open collaborative leaf.

## Authority

| Without asking | Ask first | Always separate |
| --- | --- | --- |
| Reading; writing the user's answers into the leaf; regenerating the map; creating the branch and worktree after the claim commit | The claim commit; the Output and criteria approval | Merges, pushes; installs; product code; writing inside the worktree |

## Map

Regenerate the map from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .
```
