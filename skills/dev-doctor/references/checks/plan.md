# Plan

Node frontmatter, status rules, the map, and what nodes contain. Read [Plan documentation](../../../dev-framework/project/knowledge/dev-framework/plan-documentation.md) before judging or proposing a fix.

## Script findings

| Finding | Usual fix |
| --- | --- |
| A Plan rule violation | Correct the frontmatter or status, then regenerate the map |
| A stale map | Regenerate it |

## Judgment checks

Unit: one node file.

| Check | Rule |
| --- | --- |
| The stage block has the sections the node's status requires, in order, and none from another stage | [Node format](../../../dev-framework/project/knowledge/dev-framework/plan-documentation.md#node-format) |
| Record lines stay short and link to the owner of the detail instead of repeating it | [Recording resolved questions](../../../dev-framework/project/knowledge/dev-framework/plan-documentation.md#recording-resolved-questions) |
| The node holds no Knowledge content: a rule, design, or fact that stays valid after the work belongs in Knowledge, linked from a Decided line | [What Knowledge holds](../../../dev-framework/project/knowledge/dev-framework/knowledge-documentation.md#what-knowledge-holds) |
