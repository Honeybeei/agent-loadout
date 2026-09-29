---
name: dev-explore
description: Explore a node of a Dev Framework project's Plan. Chart its subtree breadth-first, then resolve its open questions with the user. Takes a node name, root by default.
disable-model-invocation: true
---

# Dev Explore

Turn an unclear part of the Plan into a clear subtree: nodes that are ready to dispatch, nodes split into children, and unknowns honestly marked as fog. Explore belongs to the main flow; it decides and records, and does not implement product code.

The project's rules are indexed in [Dev Framework rules](../../../knowledge/dev-framework.md). Before writing to the Plan, read [Plan documentation](../../../knowledge/dev-framework/plan-documentation.md): it owns node format, status, and how answers are recorded. Before the first commit, read [Git workflow](../../../knowledge/dev-framework/git-workflow.md#commits): every recorded answer, structure change, and Goal change is its own commit on `main`.

## 1. Orient

- Confirm the project root has `dev.yaml` and `knowledge/dev-framework.md`. Otherwise, suggest `dev-doctor` and stop.
- Confirm the session is at the main checkout on `main`, as [Development workflow](../../../knowledge/dev-framework/workflow.md) says. Otherwise, say so and stop.
- The target is the node named in the arguments, or `root` when none is given. A dispatched node (`in_progress`) belongs to its implementation session: say so, and suggest another branch of the tree, or reviewing that node once its report arrives.
- Read `plan/map.md`, the target node, its ancestors' Goal sections, the glossary if it exists, and the Knowledge the target relies on. If the map is missing or stale, regenerate it first (see [Map](#map)).

## 2. Chart

Skip this step when the target already has a clear subtree.

1. Interview the user breadth-first with [grilling](../grilling/SKILL.md): cover the target's whole scope (its parts, what is known, what is not) before going deep on any branch.
2. Write what became clear, immediately:
   - the target's Goal, known Completion criteria, and status;
   - child nodes, as many levels deep as they are clear;
   - for each node: its status, open questions, Not yet specified, and Out of scope.
3. Give an unclear area that can be named its own `fog` node. Do not split fog into guessed pieces.
4. Regenerate the map, show the changed part of the tree, and offer the commit (`chart`).

## 3. Resolve

Work the open questions in the target's subtree, leaving dispatched nodes alone. Take unblocked questions first, starting with those that block the most other work.

| Tag | How to resolve |
| --- | --- |
| `research` | Run a subagent per question by [research](../research/SKILL.md), in parallel when there are several; without subagents, research each question in turn. Keep raw notes in `.tmp/research/<topic>.md`. |
| `grilling` | Follow [grilling](../grilling/SKILL.md). Only the user answers. |
| `prototype` | Follow [prototype](../prototype/SKILL.md). Build in `.tmp/prototypes/<name>/`, or on a `prototype/<name>` branch when it must run inside the app. The user makes the choice it informs. |
| `task` | Do the work when allowed below; otherwise give the user a precise checklist. |

After each answer:

1. Record it at once, as Plan documentation's "Recording resolved questions" says, and remove the question from the node.
2. Add a glossary entry when the user agreed on a term.
3. Turn anything that became clear into new nodes or new questions, and remove it from Not yet specified.
4. When a node has no open questions and nothing left unspecified, set it to `ready` if one piece of work can implement and verify it, or split it and set it to `decomposed`.
5. Regenerate the map when frontmatter or open questions changed.
6. Offer the commit for this answer: `decide`, or `chart` when it split the node. When it changes a Knowledge document that an `in_progress` node relies on, name those nodes in the same prompt and recommend no effect, notify, or recall for each, as Development workflow's "Changing Knowledge while implementations run" says. For a recall, continue with [dev-review](../dev-review/SKILL.md) on that node after the commit.

## 4. Stop

Stop when no open question in the target's subtree can be resolved now, or when the user says so. Everything is already in the Plan, so the next run continues from the map.

Offer a commit for anything still uncommitted, then follow [dev-next](../dev-next/SKILL.md).

## Authority

| Without asking | Ask first | Always separate |
| --- | --- | --- |
| Reading; research subagents; adding and editing nodes in the target's subtree, except dispatched ones; recording the user's answers in Plan and Knowledge; regenerating the map; `.tmp/` material | Each commit; changing nodes outside the target's subtree; changing a Goal or Completion criteria the user set | Merges, pushes; installs; external services; destructive or hard-to-reverse actions; product code outside prototypes; setting a node `done` |

## Map

Regenerate the map from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .
```
