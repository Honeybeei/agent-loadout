---
name: dev-plan
description: Plan or close a goal of a Dev Framework project's Plan. Split it top-down into sub-goals and leaves of the right kind, or verify a goal whose children are finished and set it done. Takes a goal name, root by default.
disable-model-invocation: true
---

# Dev Plan

Decide the work under one goal, or finish a goal whose work is done. Planning decides the work and makes no technical decisions; a part that lacks them gets an explore leaf. When an explore or collaborative leaf finishes, its skill follows step 2 of this procedure for the goals its results affect.

The project's rules are indexed in [Dev Framework rules](../../../knowledge/dev-framework.md). Before writing to the Plan, read [Plan documentation](../../../knowledge/dev-framework/plan-documentation.md) and [Goal nodes](../../../knowledge/dev-framework/plan-documentation/goal.md), and the document of each kind you write: [Explore](../../../knowledge/dev-framework/plan-documentation/explore.md), [Collaborative](../../../knowledge/dev-framework/plan-documentation/collaborative.md), or [Blackbox](../../../knowledge/dev-framework/plan-documentation/blackbox.md) nodes. Commits follow [Git workflow](../../../knowledge/dev-framework/git-workflow.md#commits).

## 1. Orient

- Confirm the project root has `dev.yaml` and `knowledge/dev-framework.md`. Otherwise, suggest `dev-doctor` and stop.
- Confirm the session is at the main checkout on `main`. Otherwise, say so and stop.
- The target is the goal named in the arguments, or `root` when none is given. When the target is a leaf, say so and suggest the skill for its kind through [dev-next](../dev-next/SKILL.md).
- Read `plan/map.md`, the target, its ancestors' Goal sections, its children, the glossary if it exists, and the Knowledge the target's area relies on. If the map is missing or stale, regenerate it first (see [Map](#map)).
- A closable target goes to step 3. Any other open goal goes to step 2.

## 2. Plan

1. **Find the parts.** Survey the goal's whole scope breadth-first before going deep on any part. Ask the user with [grilling](../grilling/SKILL.md) about scope, priorities, and order; a question about what to build or how belongs to an explore leaf, not to planning.
2. **Find the missing decisions.** For each part, check whether Knowledge and finished explore leaves hold the decisions it needs. A part that lacks them gets an explore leaf whose Goal names what must be decided, and the part stays a goal without children that depends on it.
3. **Split.** Split each decided part top-down and recursively into sub-goals and leaves, until every leaf meets its kind's size rule. Prefer vertical slices that end in something runnable. Create only leaves whose template can be filled now.
4. **Choose kinds.** Recommend each leaf's kind with a one-line reason, as Goal nodes' "Choosing a leaf's kind" says. The user confirms.
5. **Write the nodes.** Fill each node's frontmatter and its kind's template with what is known, and wire `depends_on`. For each blackbox leaf, run the readiness check from Blackbox nodes; the user approves its Output and criteria. A leaf that fails becomes collaborative, or a goal that waits for an explore leaf.
6. **Show.** Add `Planned: <what the split produced, and why>` to the goal's Record. Regenerate the map, fix any problems it lists, and show the changed part of the tree with each leaf's kind and reason.
7. **Commit.** Offer the commit: `plan(<goal>): plan <what was added or changed>`. When a finishing leaf called this step, its own commit carries these changes instead.

## 3. Close

1. Confirm every child is `done` or `cancelled`. Otherwise, list the unfinished children and stop.
2. Verify each of the goal's Completion criteria on the combined result in this checkout: run the automated checks that the criteria or `AGENTS.md` name, and ask the user about criteria that need judgment.
3. When every criterion holds, tick them, add `Closed: <how the children were verified together>, <evidence>` to Record, set `done`, regenerate the map, and offer the commit: `plan(<goal>): close <title>`.
4. When a criterion does not hold, say which and why, and plan the missing work as a new child through step 2; the goal stays `open`.

Then follow [dev-next](../dev-next/SKILL.md).

## Authority

| Without asking | Ask first | Always separate |
| --- | --- | --- |
| Reading; adding and editing `todo` nodes under the target; regenerating the map; `.tmp/` material | Each commit; each leaf's kind; a blackbox leaf's Output and criteria; changing a Goal or Completion criteria the user set; changing nodes outside the target or nodes in progress | Technical decisions, which belong to explore leaves; product code; merges, pushes; installs; external services; destructive or hard-to-reverse actions |

## Map

Regenerate the map from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .
```
