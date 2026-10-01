---
name: dev-doctor
description: Bring the current repository in line with the installed Dev Framework. Diagnose it, adopt or update the Framework, or run the checks the user picks and fix what they find, with approval.
disable-model-invocation: true
---

# Dev Doctor

Bring the current repository in line with the installed Dev Framework. Diagnosis and checks only read; every change waits for a proposal the user approves.

Run the scripts from the project root. `<framework>` is `<this skill's directory>/../dev-framework`.

| Purpose | Command |
| --- | --- |
| Diagnose | `bun <framework>/scripts/check.ts .` |
| Run the script checks of groups | `bun <framework>/scripts/check.ts . --group <id>,<id>`, or `--group all` |
| Sync managed material | `bun <framework>/scripts/sync.ts .`, with `--check` to preview |
| Check the Plan and write the map | `bun .agents/skills/dev-framework/scripts/map.ts .`, once sync has run |

## 1. Diagnose

- Confirm the working directory is the Git top level and the main checkout: the first entry of `git worktree list`. In a Framework project, one with `dev.yaml`, also confirm the branch is `main`, because only the lead session edits Plan and Knowledge there. Otherwise, say so and stop.
- Run the diagnosis. It prints the state and the managed material findings. For a `current` project it also counts the script findings of each check group; for a project that is `not adopted`, it lists what blocks adoption.
- Show whether the Framework is adopted and whether its managed material is current, then continue by state:

| State | Meaning | Continue with |
| --- | --- | --- |
| `not adopted` | No `dev.yaml` | [Adopt](references/adopt.md), then step 4 |
| `outdated` | Managed material differs from the installed Framework | [Update](references/update.md), then step 4. The menu follows the update, because checks read the project's copy of the rules. |
| `current` | Managed material matches | Step 2 |

## 2. Menu

Show the check groups as a numbered list with each group's script finding count and what its judgment checks cover, and ask which to run: one or more numbers, or all. A group with no script findings can still have judgment findings.

| # | Group | `--group` id | Judgment checks | Reference |
| --- | --- | --- | --- | --- |
| 1 | Structure | `structure` | Setup commands and automated checks in `AGENTS.md` | [Structure](references/checks/structure.md) |
| 2 | Plan | `plan` | Kind templates, Record lines, Knowledge content in nodes | [Plan](references/checks/plan.md) |
| 3 | Knowledge form | `knowledge` | None | [Knowledge form](references/checks/knowledge.md) |
| 4 | SSoT | `ssot` | Topics with more than one detailed owner, restated Framework rules, Plan content in Knowledge, project rules in `AGENTS.md` | [SSoT](references/checks/ssot.md) |
| 5 | Links and navigation | `links` | Reading conditions on links, reachability of other documents, reliance on `.tmp/` | [Links and navigation](references/checks/links.md) |
| 6 | Writing style | `writing` | Language, concise sentences, lists and tables | [Writing style](references/checks/writing.md) |
| 7 | Leftovers | `leftovers` | None | [Leftovers](references/checks/leftovers.md) |

## 3. Check

1. Run the script checks of the selected groups. Besides findings, the script lists each group's judgment units: independent pieces of work, such as one topic, one node, or one document.
2. Read the reference of each selected group.
3. Run the judgment checks in parallel with subagents, across all selected groups at once. Give each subagent one unit, or a batch of small units from one group, with the group reference and the rules it names. Subagents only read, and return each finding with its file, the problem, the rule it breaks, and a recommended fix. Without subagents, check the units in turn.
4. Merge the results. Combine findings that several units reported for one problem.
5. Show the findings grouped by check group, and mark the ones that come from judgment.

## 4. Propose

Propose what the reference describes in one short list, and wait for approval.

- Propose one fix per finding, and group findings of one kind.
- When a fix needs judgment, such as which section a node's content belongs in, recommend a value for each case.
- List existing material that could later become Plan or Knowledge as later work; do not convert it now.

## 5. Apply

1. Work on the current branch, which step 1 confirmed, and create no other branch.
2. Apply only what the user approved.
3. Run the diagnosis, or the script checks of the groups you fixed, again. When findings remain that the approval did not cover, return to step 4 with them.
4. Show a short summary of the changes and the commit message, and ask whether to commit: the message the reference names, or `chore: conform to the Dev Framework` for check fixes. Commit by path: the Framework-managed material, including the `.claude/skills` link, the map, and the approved fixes. Leave every other change uncommitted.
5. Return to step 1, which leads to the menu with the remaining counts. When the user is done, follow the project's copy of `dev-next` at `.agents/skills/dev-next/SKILL.md`.

## Authority

| Before approval | After approval | Always separate |
| --- | --- | --- |
| Reading, including subagents; the check script, sync with `--check`, the map script with `--check` | The approved changes only | Commits, pushes; moving or deleting project files the proposal did not name |
