---
name: dev-doctor
description: Bring the current repository in line with the installed Dev Framework. Diagnose it, then, with approval, adopt the Framework, update it, or fix what breaks its rules.
disable-model-invocation: true
---

# Dev Doctor

Bring the current repository in line with the installed Dev Framework. Diagnosis only reads; every change waits for a proposal the user approves. Use no subagents unless the user asks.

Run the scripts from the project root:

| Purpose | Command |
| --- | --- |
| Diagnose | `bun <this skill's directory>/../dev-framework/scripts/check.ts .` |
| Sync managed material | `bun <this skill's directory>/../dev-framework/scripts/sync.ts .`, with `--check` to preview |
| Check the Plan and write the map | `bun .agents/skills/dev-framework/scripts/map.ts .`, once sync has run |

## 1. Diagnose

- Confirm the working directory is the Git top level. Otherwise, say so and stop.
- Run the check script. It prints the project's state and its findings by area.
- Read the reference for the state, and only that one:

| State | Meaning | Reference |
| --- | --- | --- |
| `not adopted` | No `dev.yaml`. The findings list what blocks adoption. | [Adopt](references/adopt.md) |
| `outdated` | Managed material differs from the installed Framework | [Update](references/update.md) |
| `current` | Managed material matches; any findings are rule violations | [Check](references/check.md) |

The script checks only what a script can decide: managed material, required paths, workspaces, Plan rules and the map, the form of Knowledge documents, relative links, and leftovers of earlier Framework versions. It does not judge content; review content only when the user asks, as [Content review](references/check.md#content-review) says.

## 2. Report

Show the state and the findings in a short list grouped by area. When the state is `current` and there are no findings, say so and stop.

## 3. Propose

Propose what the reference describes in one short list, and wait for approval.

- Propose one fix per finding, and group findings of one kind.
- When a fix needs judgment, such as which status an old Plan node gets, recommend a value for each case.
- List existing material that could later become Plan or Knowledge as later work; do not convert it now.

## 4. Apply

1. On `main`, create the branch the reference names before the first write. On another branch, say in the proposal which branch the changes go to.
2. Apply only what the user approved.
3. Run the check script again. When findings remain that the approval did not cover, return to step 3 with them.
4. Show a short summary of the changes, and ask whether to commit. Include all Framework-managed material, including the `.claude/skills` link. Merge only when the user asks.
5. Follow the project's copy of `dev-next` at `.agents/skills/dev-next/SKILL.md`.

## Authority

| Before approval | After approval | Always separate |
| --- | --- | --- |
| Reading; the check script, sync with `--check`, the map script with `--check` | The approved changes only | Commits, merges, pushes; moving or deleting project files the proposal did not name |
