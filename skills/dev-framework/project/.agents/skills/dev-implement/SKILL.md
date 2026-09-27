---
name: dev-implement
description: Implement a ready node of a Dev Framework project's Plan in blackbox or collaborative mode, or close a decomposed node whose children are finished. Takes a node name and, optionally, blackbox or collaborative.
disable-model-invocation: true
---

# Dev Implement

Build one `ready` node and verify it against its Completion criteria. Before starting, read [Plan documentation](../../../knowledge/dev-framework/plan-documentation.md) for status and Record, and [Git workflow](../../../knowledge/dev-framework/git-workflow.md) for branches and approvals.

## Modes

| | Blackbox | Collaborative |
| --- | --- | --- |
| Use for | Parts with clear boundaries whose internals the user does not need to know | Important parts, structure the user wants to shape, parts the user wants to learn |
| Progress | Build the whole node; stop only for the reasons in [Stop and ask](#stop-and-ask) | One slice at a time: propose it, build it, show the diff and check results, wait for the user |
| Who writes code | The agent | The agent, or the user while the agent guides and reviews |

Take the mode from the arguments or from the user's choice in `dev-next`. If there is none, recommend one with a one-line reason and ask once.

## 1. Orient

- Confirm the project root has `dev.yaml` and `knowledge/dev-framework.md`. Otherwise, suggest `dev-init` and stop.
- Read the node. It must be `ready` or `in_progress`, have no unfinished children, and have every `depends_on` node `done`. Otherwise, say why and follow [dev-next](../dev-next/SKILL.md).
- Read what the node relies on, its Completion criteria, Verification, and Out of scope, its ancestors' Goal sections, the glossary if it exists, the relevant code, and the checks the root `AGENTS.md` names.

## 2. Prepare

- Create `work/<node>` from `main`. When resuming an `in_progress` node, continue on its existing branch.
- Set the node to `in_progress` and regenerate the map.

## 3. Build

- Split the node into thin vertical slices: each one cuts through every layer it needs and can be verified on its own.
- Where the project has tests, write a failing test for a slice before building it.
- Blackbox: build every slice. Collaborative: finish each slice with the user before starting the next.
- Name things with the glossary's terms.

## 4. Verify

Run the node's Verification, check each Completion criterion, and run the project's checks. Show the commands and their results as evidence.

## 5. Record and finish

1. Tick the met criteria and add a Record line: `Implemented (<mode>): <what was done>, <evidence>`.
2. Show the outcome and evidence, then ask once: "Completion criteria met. Mark done and commit?"
3. On approval, set the node to `done`, regenerate the map, and commit on the work branch. Merge only when the user asks.
4. Follow [dev-next](../dev-next/SKILL.md).

## Closing a decomposed node

When the node is `decomposed` and every child is `done` or `cancelled`, skip steps 2 and 3: check the node's own Completion criteria, which cover how the children work together, then continue at step 5.

## Stop and ask

Record the progress so far in Record, then stop and ask when:

- the work needs something outside the node's scope;
- an undecided question appears: add it to Open questions and set the node back to `exploring`, instead of guessing;
- verification keeps failing for a cause outside the node.

## Authority

| Without asking | Always separate |
| --- | --- |
| Editing code, tests, and documents within the node's scope; running checks; creating the work branch; ticking met criteria, adding Record lines, and setting the status up to `in_progress`; regenerating the map | Marking `done`; staging, commits, merges, pushes; installs; external services; destructive or hard-to-reverse actions; changes affecting security or cost |

## Map

Regenerate the map from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .
```
