---
name: dev-next
description: Show where a Dev Framework project stands in its Plan and recommend what to work on next. Use when the user asks where things stand or what to do next, and after dev-explore or dev-implement finishes.
---

# Dev Next

Show where the project stands and recommend the next work. This is a recommendation, not a gate: when the user has already said what to do next, skip it and do that.

Keep it light: read the map and the nodes you recommend. Run no reviews and no subagents. Node status and blocking follow [Plan documentation](../../../knowledge/dev-framework/plan-documentation.md).

## 1. Read the state

- Regenerate the map if it may be stale, then read `plan/map.md`.
- Find what just happened: the result of the skill that called this one, or, when invoked alone, the last few commits and the newest Record lines.

## 2. Choose up to three recommendations

Take them in this order:

| Order | Situation | Recommend |
| --- | --- | --- |
| 1 | An `in_progress` node | Continue implementing it |
| 2 | A `decomposed` node whose children are all `done` or `cancelled` | Close it |
| 3 | An unblocked `ready` node | Implement it, starting with one that blocks other nodes |
| 4 | An unblocked `exploring` node | Explore it, starting with one whose questions block ready work |
| 5 | An unblocked `fog` node | Explore it, starting with one near the current work |

- Implementable work comes before more exploration. Plans that grow ahead of working results are the failure this order prevents.
- Within the same order, prefer nodes under the same parent as the work just done, then map order.
- Recommend a mode with each implementation: blackbox when the boundaries are clear and the internals do not matter to the user; collaborative when it shapes core structure or the user may want to shape or learn it.

## 3. Show

```text
Just now: <one or two lines on what changed>

<the part of the map around the current work, or the whole map when it is small>

Next
1. Implement (blackbox): First-run setup, because it blocks Local chat
2. Explore: Web service, the least clear part of MLP
```

Give one line per recommendation, with its reason.

## 4. Continue with the user's choice

When the user picks a recommendation or names other work, read the matching skill and follow it, passing the node and mode as its arguments:

| Choice | Skill |
| --- | --- |
| Explore a node | [dev-explore](../dev-explore/SKILL.md) |
| Implement a node, or close a decomposed node | [dev-implement](../dev-implement/SKILL.md) |

The user's choice counts as invoking that skill. Until the user chooses, wait.

## Map

Regenerate the map from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .
```
