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

- Confirm the working directory is the Git top level. Otherwise, say so and stop.
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
| 1 | Structure | `structure` | None | [Structure](references/checks/structure.md) |
| 2 | Plan | `plan` | Stage blocks, Record lines, Knowledge content in nodes | [Plan](references/checks/plan.md) |
| 3 | Knowledge form | `knowledge` | None | [Knowledge form](references/checks/knowledge.md) |
| 4 | SSoT | `ssot` | Topics with more than one detailed owner, restated Framework rules, Plan content in Knowledge | [SSoT](references/checks/ssot.md) |
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
- When a fix needs judgment, such as which status an old Plan node gets, recommend a value for each case.
- List existing material that could later become Plan or Knowledge as later work; do not convert it now.

## 5. Apply

1. On `main`, create the branch before the first write: the one the reference names, or `work/conform-to-dev-framework` for check fixes. On another branch, say in the proposal which branch the changes go to.
2. Apply only what the user approved.
3. Run the diagnosis, or the script checks of the groups you fixed, again. When findings remain that the approval did not cover, return to step 4 with them.
4. Show a short summary of the changes, and ask whether to commit. Include all Framework-managed material, including the `.claude/skills` link. Merge only when the user asks.
5. Return to step 1, which leads to the menu with the remaining counts. When the user is done, follow the project's copy of `dev-next` at `.agents/skills/dev-next/SKILL.md`.

## Authority

| Before approval | After approval | Always separate |
| --- | --- | --- |
| Reading, including subagents; the check script, sync with `--check`, the map script with `--check` | The approved changes only | Commits, merges, pushes; moving or deleting project files the proposal did not name |
