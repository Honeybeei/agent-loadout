---
name: dev-review
description: Review a node of a Dev Framework project's Plan in the main flow. Merge a finished implementation, reopen a blocked or recalled one, or close a decomposed node whose children are finished. Takes a node name and, optionally, recall.
disable-model-invocation: true
---

# Dev Review

Decide what happens to a dispatched node once its implementation session reports, or close a finished `decomposed` node. Review belongs to the main flow: it reads code but never edits it, and findings go back to the implementation session.

Before starting, read [Development workflow](../../../knowledge/dev-framework/workflow.md) for the review cases and the report format, and [Git workflow](../../../knowledge/dev-framework/git-workflow.md) for merging, approvals, and cleanup.

## 1. Orient

- Confirm the project root has `dev.yaml` and `knowledge/dev-framework.md`. Otherwise, suggest `dev-doctor` and stop.
- Confirm the session is at the main checkout on `main`. Otherwise, say so and stop.
- Read the node. A dispatched node's worktree is `../<repository directory>.worktrees/<node>`, and its report is `.tmp/reports/<node>.md` inside it.

## 2. Take the case

Read the reference for the case, and only that one:

| Case | Reference |
| --- | --- |
| An `in_progress` node whose report says `completed` | [Merge](references/merge.md) |
| An `in_progress` node whose report says `blocked`, or any `in_progress` node with the argument `recall` | [Reopen](references/reopen.md) |
| A `decomposed` node | [Close](references/close.md) |

An `in_progress` node without a report is still being implemented: say so and stop. For any other status, say why there is nothing to review, and follow [dev-next](../dev-next/SKILL.md).

## 3. Finish

After the reference's last step, follow [dev-next](../dev-next/SKILL.md).

## Authority

| Without asking | Ask first | Always separate |
| --- | --- | --- |
| Reading any checkout of the repository; review subagents; running checks in this checkout; writing `.tmp/reviews/` in this checkout; regenerating the map | Each commit; the merge and its cleanup; discarding or parking; removing a worktree that has uncommitted changes | Editing code; writing inside a worktree; pushes; installs |

## Map

Regenerate the map from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .
```
