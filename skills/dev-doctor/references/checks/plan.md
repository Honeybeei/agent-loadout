# Plan

Node frontmatter, kinds and status rules, the map, and what nodes contain. Read [Plan documentation](../../../dev-framework/project/knowledge/dev-framework/plan-documentation.md) before judging or proposing a fix.

## Script findings

| Finding | Usual fix |
| --- | --- |
| A Plan rule violation | Correct the frontmatter, the status, or the missing section, then regenerate the map |
| A stale map | Regenerate it |

## Judgment checks

Unit: one node file.

| Check | Rule |
| --- | --- |
| The body follows its kind's template: the sections it requires, in order, and none from another kind. A collaborative body is free between Goal and Record. | The kind's document, listed under [Kinds](../../../dev-framework/project/knowledge/dev-framework/plan-documentation.md#kinds) |
| A blackbox leaf is concrete about its output and silent about its internal structure | [Blackbox nodes](../../../dev-framework/project/knowledge/dev-framework/plan-documentation/blackbox.md) |
| Record lines stay short and link to the owner of the detail instead of repeating it | [Recording decisions](../../../dev-framework/project/knowledge/dev-framework/plan-documentation.md#recording-decisions) |
| A finished node holds no Knowledge content: a rule, design, or fact that stays valid after the work belongs in Knowledge, linked from the node. A running explore or collaborative leaf holds its decisions until it finishes. | [What Knowledge holds](../../../dev-framework/project/knowledge/dev-framework/knowledge-documentation.md#what-knowledge-holds) |

## Leaves in progress

An `in_progress` leaf is open work: a blackbox leaf belongs to its implementation session until review merges or reopens it, and an explore or collaborative leaf to the lead session until it finishes, as [Development workflow](../../../dev-framework/project/knowledge/dev-framework/workflow.md#sessions) says. Report its findings, script or judgment, and propose their fixes for after that point.
