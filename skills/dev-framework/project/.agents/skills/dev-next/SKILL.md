---
name: dev-next
description: Show where a Dev Framework project stands in its Plan and recommend what to work on next. Use when the user asks where things stand or what to do next, and after another main-flow skill finishes.
---

# Dev Next

Show where the project stands and recommend the next step of the main flow, which [Development workflow](../../../knowledge/dev-framework/workflow.md) defines. This is a recommendation, not a gate: when the user has already said what to do next, skip it and do that.

Keep it light: read the map, the reports, and the nodes you recommend. Run no reviews and no subagents. Node status and blocking follow [Plan documentation](../../../knowledge/dev-framework/plan-documentation.md).

## 1. Read the state

- Regenerate the map, which also refreshes the browser view, then read `plan/map.md`.
- For each `in_progress` node, look for its report at `../<repository directory>.worktrees/<node>/.tmp/reports/<node>.md`. A report means the implementation is waiting for review; no report means it is still running.
- Find what just happened: the result of the skill that called this one, or, when invoked alone, the last few commits and the newest Record lines.

## 2. Choose up to three recommendations

Take them in this order:

| Order | Situation | Recommend |
| --- | --- | --- |
| 1 | An `in_progress` node with a report | Review it |
| 2 | A `decomposed` node whose children are all `done` or `cancelled` | Close it with review |
| 3 | An unblocked `ready` node | Dispatch it, starting with one that blocks other nodes |
| 4 | An unblocked `exploring` node | Explore it, starting with one whose questions block ready work |
| 5 | An unblocked `fog` node | Explore it, starting with one near the current work |

- Finished implementations come first: reviewing them frees their worktrees and unblocks the nodes that wait for them.
- Dispatchable work comes before more exploration. Plans that grow ahead of working results are the failure this order prevents.
- Leave running implementations alone: an `in_progress` node without a report belongs to its implementation session.
- Within the same order, prefer nodes under the same parent as the work just done, then map order.
- Recommend a mode with each dispatch, as Development workflow describes: blackbox or collaborative, with a one-line reason.

## 3. Show

```text
Just now: <one or two lines on what changed>

Running: Core skeleton (report waiting), Web skeleton

<the part of the map around the current work, or the whole map when it is small>

Next
1. Review: Core skeleton, whose report is waiting
2. Dispatch (blackbox): Foundation, because it blocks Web skeleton
3. Explore: Web service, the least clear part of MLP

Full picture: .tmp/plan/map.html
```

Give one line per recommendation, with its reason.

## 4. Continue with the user's choice

When the user picks a recommendation or names other work, read the matching skill and follow it, passing the node and mode as its arguments:

| Choice | Skill |
| --- | --- |
| Review a node, or close a decomposed node | [dev-review](../dev-review/SKILL.md) |
| Dispatch a node | [dev-dispatch](../dev-dispatch/SKILL.md) |
| Explore a node | [dev-explore](../dev-explore/SKILL.md) |

The user's choice counts as invoking that skill. Until the user chooses, wait.

## Map

Regenerate the map from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .
```
