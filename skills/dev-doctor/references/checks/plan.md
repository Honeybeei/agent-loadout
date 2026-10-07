# Plan

Node frontmatter, kinds and status rules, the map, and what nodes contain.

## Script findings

| Finding | Usual fix |
| --- | --- |
| A Plan rule violation | Correct what the message names, then regenerate the map |
| A stale map | Regenerate it |

## Judgment

Unit: one node file, judged against [Plan documentation](../../../dev-framework/project/knowledge/dev-framework/plan-documentation.md), the document of the node's kind listed under its [Kinds](../../../dev-framework/project/knowledge/dev-framework/plan-documentation.md#kinds), and [What Knowledge holds](../../../dev-framework/project/knowledge/dev-framework/knowledge-documentation.md#what-knowledge-holds). Read with each node the Knowledge it links.

- To see whether a Goal changed, compare it with the node's first committed version: `git log --format=%h -- <node> | tail -1`, then `git show <commit>:<node>`.
- Content that belongs in Knowledge moves to the document that owns its topic, linked from the node; when no document fits, recommend one.

## Leaves in progress

An `in_progress` leaf is open work: a blackbox leaf belongs to its implementation session until review merges or reopens it, and an explore or collaborative leaf to the lead session until it finishes, as [Development workflow](../../../dev-framework/project/knowledge/dev-framework/workflow.md#sessions) says. Report its findings, script or judgment, and propose their fixes for after that point.
