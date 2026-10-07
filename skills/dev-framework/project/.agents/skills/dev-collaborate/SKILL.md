---
name: dev-collaborate
description: Build a collaborative leaf of a Dev Framework project's Plan together with the user in the lead session, slice by slice on its own branch, then merge it with its decisions and planning. Takes a collaborative leaf name.
disable-model-invocation: true
---

# Dev Collaborate

Build one collaborative leaf with the user in the main checkout. The user shapes the work: they may review each slice, change direction, or write the code while the agent guides and reviews. While the leaf is open, its node is the only record of new decisions; Knowledge and the rest of the Plan change once, in its merge.

The project's rules are indexed in [Dev Framework rules](../../../knowledge/dev-framework.md). Before starting, read [Collaborative nodes](../../../knowledge/dev-framework/plan-documentation/collaborative.md), and [Git workflow](../../../knowledge/dev-framework/git-workflow.md) for the branch, slice commits, and integration.

## 1. Orient

- Confirm the project root has `dev.yaml` and `knowledge/dev-framework.md`. Otherwise, suggest `dev-doctor` and stop.
- Confirm the session is at the main checkout: the first entry of `git worktree list`. Otherwise, say so and stop.
- The target is the collaborative leaf named in the arguments. When it is another kind, or `done` or `cancelled`, say so and follow [dev-next](../dev-next/SKILL.md).
- Read the target, its ancestors' Goal sections, what it relies on, the glossary if it exists, the relevant code, and the root `AGENTS.md`.
- An `in_progress` target continues at step 3: switch to `impl/<node>` if the checkout is on `main` with a clean working tree.

## 2. Start

1. Confirm the checkout is on `main`, its tracked files have no uncommitted changes, every node in the target's `depends_on` is `done`, no other explore or collaborative leaf is `in_progress`, and no `impl/<node>` branch exists. Otherwise, say which check failed and stop.
2. Set the target `in_progress`, regenerate the map (see [Map](#map)), and offer the commit: `plan(<node>): start <title>`.
3. Once it is committed, run `git switch -c impl/<node>` and the setup commands `AGENTS.md` names.

## 3. Work

- Agree with the user on how this session works: the agent builds and the user reviews each slice, or the user writes and the agent reviews.
- Work slice by slice: propose a thin vertical slice, build it or let the user build it, where the project has tests write a failing test first, then show the diff and the check results and wait for the user. Commit each slice the user approves, asking together with the slice review.
- Resolve a question the leaf needs in place, as an explore leaf resolves a ticket: [grilling](../grilling/SKILL.md), [research](../research/SKILL.md), [prototype](../prototype/SKILL.md), or a task. Write the decision into the node at once, and follow it.
- Write a topic with its own destination into the node for planning. Leave Knowledge and other nodes unchanged until step 4.
- Name things with the glossary's terms.
- To review or dispatch a blackbox leaf meanwhile, pause at a slice boundary: commit the slice, run `git switch main`, follow that skill, then run `git switch impl/<node>`. Other explore and collaborative leaves wait until this one merges.

## 4. Finish

When the user says the work is done:

1. **Verify.** Run the checks the node names and the checks `AGENTS.md` names, and show the results.
2. **Show the changes.** List every line of the node with where it goes, as Plan documentation's [Recording decisions](../../../knowledge/dev-framework/plan-documentation.md#recording-decisions) says; the planning it calls for; and the node updates. Ask once for the merge, including deleting the branch.
3. **Merge.** Commit any finished work, run `git switch main`, then `git merge --no-ff --no-commit impl/<node>`, and resolve conflicts.
4. **Apply.** Move each line as listed, leaving its gist and a link to its owner. Follow [dev-plan](../dev-plan/SKILL.md) step 2 for the goals the results affect. Set the leaf `done`, add `Implemented: <what was built>, <evidence>` to Record, and regenerate the map.
5. **Check and commit.** Run the automated checks `AGENTS.md` names. When one fails, run `git merge --abort`, switch back to `impl/<node>`, and fix it there. Otherwise, commit the merge as `plan(<node>): implement <title>`. When it changes a Knowledge document that an `in_progress` blackbox leaf relies on, name those leaves in the same prompt and recommend no effect, notify, or recall for each, as Development workflow's [Changing Knowledge while blackbox leaves run](../../../knowledge/dev-framework/workflow.md#changing-knowledge-while-blackbox-leaves-run) says.
6. **Clean up.** Run `git branch -d impl/<node>`.

Then follow [dev-next](../dev-next/SKILL.md).

## Authority

| Without asking | Ask first | Always separate |
| --- | --- | --- |
| Reading; editing code, tests, configuration, and other files in the leaf's scope on `impl/<node>`; editing this leaf's node; running the setup commands and checks `AGENTS.md` names; switching branches at a slice boundary; regenerating the map | Each commit; the merge, with its Knowledge and Plan changes; deleting the branch | Editing Knowledge or other nodes before the merge; pushes; installs; external services; destructive or hard-to-reverse actions; changes affecting security or cost |

## Map

Regenerate the map from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .
```
