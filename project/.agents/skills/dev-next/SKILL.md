---
name: dev-next
description: Show where a Dev Framework project stands in its Plan and recommend what to work on next. Use when the user asks where things stand or what to do next, and after another lead-session skill finishes.
---

# Dev Next

Show where the project stands and recommend the lead session's next step, as [Development workflow](../../../knowledge/dev-framework/workflow.md) defines it. This is a recommendation, not a gate: when the user has already said what to do next, skip it and do that.

Keep it light: read the map, the reports, and the nodes you recommend. Run no reviews and no subagents. Node kinds, status, and blocking follow [Plan documentation](../../../knowledge/dev-framework/plan-documentation.md).

## 1. Read the state

- Regenerate the map, which also refreshes the browser view, then read `plan/map.md`. While a collaborative leaf is open, the main checkout is on its `impl/<node>`, so the map there shows that branch's Plan.
- The lead session's open leaf: an `in_progress` explore leaf, or the `in_progress` collaborative leaf. The lead session runs one at a time.
- For each `in_progress` blackbox leaf, look for its report at `../<repository directory>.worktrees/<node>/.tmp/reports/<node>.md` and its review file in this checkout; whether it waits for review follows [Writing across sessions](../../../knowledge/dev-framework/workflow.md#writing-across-sessions).
- Find what just happened: the result of the skill that called this one, or, when invoked alone, the last few commits and the newest Record lines.

## 2. Choose up to three recommendations

Take them in this order:

| Order | Situation | Recommend |
| --- | --- | --- |
| 1 | A blackbox leaf waiting for review | Review it |
| 2 | The lead session's open leaf | Continue it |
| 3 | A closable goal | Close it |
| 4 | An unblocked `todo` blackbox leaf | Dispatch it, starting with one that blocks other nodes |
| 5 | An unblocked `todo` collaborative or explore leaf, when no leaf is open | Start it, starting with one whose result blocks the most other work |
| 6 | An unblocked goal that needs planning | Plan it, starting with one near the current work |

- Finished implementations come first: reviewing them frees their worktrees and unblocks the nodes that wait for them.
- Work that builds comes before more planning. Plans that grow ahead of working results are the failure this order prevents.
- Leave running implementations alone: a blackbox leaf that does not wait for review belongs to its implementation session.
- While a collaborative leaf is open, work on `main`, such as a review or a dispatch, waits for a slice boundary, as [Git workflow](../../../knowledge/dev-framework/git-workflow.md#implementation-branches) says.
- Within the same order, prefer nodes under the same goal as the work just done, then map order.

## 3. Show

```text
Just now: <one or two lines on what changed>

Open: Explore auth (3 tickets left)
Running: Static serving (report waiting), Settings screen

<the part of the map around the current work, or the whole map when it is small>

Next
1. Review: Static serving, whose report is waiting
2. Continue: Explore auth
3. Dispatch: Settings export, because it blocks Sync

Full picture: .tmp/plan/map.html
```

Give one line per recommendation, with its reason.

## 4. Continue with the user's choice

When the user picks a recommendation or names other work, read the matching skill and follow it, passing the node as its argument:

| Choice | Skill |
| --- | --- |
| Plan or close a goal | [dev-plan](../dev-plan/SKILL.md) |
| Start or continue an explore leaf | [dev-explore](../dev-explore/SKILL.md) |
| Start or continue a collaborative leaf | [dev-collaborate](../dev-collaborate/SKILL.md) |
| Dispatch a blackbox leaf | [dev-blackbox-dispatch](../dev-blackbox-dispatch/SKILL.md) |
| Review a blackbox leaf | [dev-blackbox-review](../dev-blackbox-review/SKILL.md) |

The user's choice counts as invoking that skill. Until the user chooses, wait.

## Map

Regenerate the map from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .
```
