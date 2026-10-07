---
name: dev-doctor
description: Bring the current repository in line with the installed Dev Framework. Diagnose it, adopt or update the Framework, or run the checks the user picks and fix what they find, with approval.
disable-model-invocation: true
---

# Dev Doctor

Bring the current repository in line with the installed Dev Framework. Diagnosis and checks change nothing but their findings file, `.tmp/doctor/findings.md`; every other change waits for a proposal the user approves.

Run the scripts from the project root. `<framework>` is `<this skill's directory>/../dev-framework`.

| Purpose | Command |
| --- | --- |
| Diagnose | `bun <framework>/scripts/check.ts .` |
| Run the script checks of groups | `bun <framework>/scripts/check.ts . --group <id>,<id>`, or `--group all`; add `--changed-since <commit>` to list only the judgment units changed since that commit |
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

Show the check groups as a numbered list with each group's script finding count, and ask which to run: one or more numbers, or all. A group with no script findings can still have judgment findings.

| # | Group | `--group` id | Reference |
| --- | --- | --- | --- |
| 1 | Structure | `structure` | [Structure](references/checks/structure.md) |
| 2 | Plan | `plan` | [Plan](references/checks/plan.md) |
| 3 | Knowledge form | `knowledge` | [Knowledge form](references/checks/knowledge.md) |
| 4 | SSoT | `ssot` | [SSoT](references/checks/ssot.md) |
| 5 | Links and navigation | `links` | [Links and navigation](references/checks/links.md) |
| 6 | Writing style | `writing` | [Writing style](references/checks/writing.md) |
| 7 | Leftovers | `leftovers` | [Leftovers](references/checks/leftovers.md) |

## 3. Check

1. Run the script checks of the selected groups. Besides findings, the script lists each group's judgment units: independent pieces of work, such as one topic, one node, or one document. When `.tmp/doctor/findings.md` remains from an earlier run, offer to continue at step 4 if it still has `proposed` findings; otherwise add `--changed-since` its commit for the groups it covered, unless the user asks for every unit.
2. Read the reference of each selected group.
3. Run the judgment checks in parallel with subagents, across all selected groups at once. Give each subagent one unit, or a batch of small units from one group, and this brief, filled in and otherwise unchanged:

   > Judge `<units>` of the `<group>` group in `<project root>`, and change nothing. Read `<reference path>` and every rule document it names, in the project's copies under `knowledge/dev-framework/`, and test each unit against every rule in them that applies. Report every break, not a sample: the file and line, the quoted text, the rule's document and section, the severity, and the fix. The severity is `defect` when the text could make a reader or agent act wrongly or miss something, or when content sits with the wrong owner, and `polish` when only its form could improve. A defect's fix is the exact replacement text, which meets the same rules and keeps every condition and link of the text it replaces; a polish fix takes one line. End with one line for each section of those documents: `holds`, `n/a`, or the numbers of its findings.

   Without subagents, check the units in turn the same way.
4. Merge the results, combining findings that several units reported for one problem, and write them to `.tmp/doctor/findings.md`, replacing any earlier file: the time, the commit checked, the groups, and whether every unit or only changed ones were judged; then each finding with an id, its group, its kind (`script`, `defect`, or `polish`), the brief's fields, and the status `proposed`.
5. Show a summary instead of the findings: per group, the number of script findings, defects, and polish; one line per defect; and the file's path.

## 4. Propose

The findings file is the proposal. Ask for approval by id, by group, or for all script findings and defects, and wait.

- Propose the fix the file gives for each script finding and defect, and group findings of one kind. Offer polish only when the user asks for it.
- When a fix needs judgment, such as which section a node's content belongs in, recommend a value for each case.
- List existing material that could later become Plan or Knowledge as later work; do not convert it now.
- Mark declined findings `declined` in the file, so no later run proposes them again.

## 5. Apply

1. Work on the current branch, which step 1 confirmed, and create no other branch.
2. Apply only what the user approved, as the file gives each fix, and mark it `applied`.
3. Check what the fixes changed. Run the diagnosis, then the script checks of the selected groups with `--changed-since` the file's commit, which list the units the fixes touched. Judge those units as in step 3, adding to the brief: "Judge only the lines that `git diff <commit>` shows, with the rest of each unit as context." Repair at once a defect in text the fixes wrote; add any other new finding to the file and propose it at step 4. Stop after two such passes, and report what remains. Run the checks `AGENTS.md` names only when a fix changed a file other than Markdown.
4. Show a short summary of the changes, the repairs, and the commit message, and ask whether to commit: the message the reference names, or `chore: conform to the Dev Framework` for check fixes. Commit by path: the Framework-managed material, including the `.claude/skills` link, the map, and the approved fixes. Leave every other change uncommitted. After the commit, set the findings file's commit to the new `HEAD`, so the next run judges only what changes after it.
5. Return to step 1, which leads to the menu with the remaining counts. When the user is done, follow the project's copy of `dev-next` at `.agents/skills/dev-next/SKILL.md`.

## Authority

| Before approval | After approval | Always separate |
| --- | --- | --- |
| Reading, including subagents; the check script, sync with `--check`, the map script with `--check`; writing `.tmp/doctor/findings.md` | The approved changes, and repairs of defects they introduced | Commits, pushes; moving or deleting project files the proposal did not name |
