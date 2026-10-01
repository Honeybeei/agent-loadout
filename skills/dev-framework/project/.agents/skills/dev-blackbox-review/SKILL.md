---
name: dev-blackbox-review
description: Review a dispatched blackbox leaf of a Dev Framework project's Plan in the lead session. Merge a finished implementation, send findings back, or reopen a blocked or recalled one. Takes a blackbox leaf name and, optionally, recall.
disable-model-invocation: true
---

# Dev Blackbox Review

Decide what happens to a dispatched blackbox leaf once its implementation session reports. The user judges the output; the agent judges the code. Review reads code but never edits it, and findings go back to the implementation session.

Before starting, read [Blackbox nodes](../../../knowledge/dev-framework/plan-documentation/blackbox.md#judging-the-result) for how the result is judged, [Development workflow](../../../knowledge/dev-framework/workflow.md#review) for the review cases and the report format, and [Git workflow](../../../knowledge/dev-framework/git-workflow.md) for merging, approvals, and cleanup.

## 1. Orient

- Confirm the project root has `dev.yaml` and `knowledge/dev-framework.md`. Otherwise, suggest `dev-doctor` and stop.
- Confirm the session is at the main checkout on `main`. While a collaborative leaf is open, switch to `main` at a slice boundary first, as [dev-collaborate](../dev-collaborate/SKILL.md) says.
- Read the leaf. Its worktree is `../<repository directory>.worktrees/<node>`, and its report is `.tmp/reports/<node>.md` inside it.

## 2. Take the case

Read the reference for the case, and only that one:

| Case | Reference |
| --- | --- |
| An `in_progress` blackbox leaf whose report says `completed` | [Merge](references/merge.md) |
| An `in_progress` blackbox leaf whose report says `blocked`, or any `in_progress` blackbox leaf with the argument `recall` | [Reopen](references/reopen.md) |

A leaf without a report is still being implemented: say so and stop. For any other leaf, say why there is nothing to review, and follow [dev-next](../dev-next/SKILL.md).

## 3. Finish

After the reference's last step, follow [dev-next](../dev-next/SKILL.md), or return to the open collaborative leaf.

## Authority

| Without asking | Ask first | Always separate |
| --- | --- | --- |
| Reading any checkout of the repository; review subagents; running checks in this checkout; writing `.tmp/reviews/` in this checkout; regenerating the map | Each commit; the merge and its cleanup; discarding; removing a worktree that has uncommitted changes | Editing code; writing inside a worktree; pushes; installs |

## Map

Regenerate the map from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .
```
