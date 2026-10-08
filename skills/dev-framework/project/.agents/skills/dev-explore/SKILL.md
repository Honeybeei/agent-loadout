---
name: dev-explore
description: Run an explore leaf of a Dev Framework project's Plan. Chart its wayfinding map, resolve its tickets with the user, and once the way is clear, apply the decisions and plan the goals they affect. Takes an explore leaf name.
disable-model-invocation: true
---

# Dev Explore

Find the way: turn low-resolution ideas, concepts, flows, and designs into decisions, so the goal the leaf serves can be planned. Explore produces decisions, not deliverables. While it runs, the explore node is the only record; Knowledge and the rest of the Plan change once, when it finishes.

The project's rules are indexed in [Dev Framework rules](../../../knowledge/dev-framework.md). Before writing to the node, read [Explore nodes](../../../knowledge/dev-framework/plan-documentation/explore.md): it owns the template and the fog-or-ticket test. Commits follow [Git workflow](../../../knowledge/dev-framework/git-workflow.md#commits).

## 1. Orient

- Confirm the project root has `dev.yaml` and `knowledge/dev-framework.md`. Otherwise, suggest `dev-doctor` and stop.
- Confirm the session is at the main checkout on `main`. Otherwise, say so and stop.
- The target is the explore leaf named in the arguments. When it is another kind, or `done` or `cancelled`, say so and follow [dev-next](../dev-next/SKILL.md).
- The lead session runs one leaf at a time. When another explore or collaborative leaf is `in_progress`, say so, and ask whether to continue that one instead.
- Read `plan/map.md`, the target, the goal it serves and its ancestors' Goal sections, the glossary if it exists, and the Knowledge its area relies on. If the map is missing or stale, regenerate it first (see [Map](#map)).
- Set a `todo` target to `in_progress`, and chart it at step 2 from what its node already holds. Its finishing commit carries the change.
- A target that was already `in_progress` continues at step 3 when it has tickets, decisions, or fog.

## 2. Chart

1. **Name the destination.** Settle with the user, through [grilling](../grilling/SKILL.md), what this leaf must decide and which planning it enables. Write it as the Goal; it fixes the scope.
2. **Map the frontier.** Grill again, breadth-first: cover the whole destination before going deep on any part.
3. **Write the map.** Place every question, from the grilling or already in the node, as Explore nodes' [Fog or ticket](../../../knowledge/dev-framework/plan-documentation/explore.md#fog-or-ticket) says, each ticket with its tag and any `blocked by`.
4. **Start research.** Run a subagent per `research` ticket by [research](../research/SKILL.md), in parallel.

When charting finds nothing to decide, the way is already clear: go to step 4.

## 3. Resolve

Work the unblocked tickets, starting with those that block the most others:

| Tag | How to resolve |
| --- | --- |
| `grilling` | Follow [grilling](../grilling/SKILL.md). Only the user answers. |
| `research` | Run a subagent per ticket by [research](../research/SKILL.md), in parallel when there are several. Keep raw notes in `.tmp/research/<topic>.md`. |
| `prototype` | Follow [prototype](../prototype/SKILL.md). Build in `.tmp/prototypes/<name>/`, or on a `prototype/<name>` branch when it must run inside the app. The user makes the choice it informs. |
| `task` | Do the work when allowed below; otherwise give the user a precise checklist. |

After each answer, update only this node at once, as Explore nodes' [While running](../../../knowledge/dev-framework/plan-documentation/explore.md#while-running) says.

Stop when no ticket can be resolved now, or when the user says so. Summarize what is left; the next run continues from the node.

## 4. Finish

Finish when the leaf meets Explore nodes' [Finishing](../../../knowledge/dev-framework/plan-documentation/explore.md#finishing) condition, or when the user ends it early.

1. **Show the changes.** List every line of the node with where it goes, as Plan documentation's [Recording decisions](../../../knowledge/dev-framework/plan-documentation.md#recording-decisions) says, and what For the Plan will change. The user confirms.
2. **Apply.** Move each line as listed. A node you change follows its [Node frame](../../../knowledge/dev-framework/plan-documentation.md#node-frame) and kind document.
3. **Plan.** Follow [dev-plan](../dev-plan/SKILL.md) step 2 for the goals the results affect, applying For the Plan.
4. **Close the leaf.** Set it `done`, add `Finished: <where the decisions went>, <what planning changed>` to Record, and regenerate the map.
5. **Commit once.** Offer one commit with the node, Knowledge, and Plan changes: `plan(<node>): <what was decided and planned>`. When it changes a Knowledge document that an `in_progress` blackbox leaf relies on, name those leaves in the same prompt and recommend no effect, notify, or recall for each, as Development workflow's [Changing Knowledge while blackbox leaves run](../../../knowledge/dev-framework/workflow.md#changing-knowledge-while-blackbox-leaves-run) says. For a recall, continue with [dev-blackbox-review](../dev-blackbox-review/SKILL.md) on that leaf after the commit.

Then follow [dev-next](../dev-next/SKILL.md).

## Authority

| Without asking | Ask first | Always separate |
| --- | --- | --- |
| Reading; research subagents; editing this explore node; regenerating the map; `.tmp/` material | Changing the Goal once the user set it; the finishing changes to Knowledge and the Plan; the commit | Editing Knowledge or other nodes before finishing; product code outside prototypes; merges, pushes; installs; external services; destructive or hard-to-reverse actions |

## Map

Regenerate the map from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .
```
