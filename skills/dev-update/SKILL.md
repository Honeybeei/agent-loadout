---
name: dev-update
description: Update a Dev Framework project to the installed Framework. Replace its managed rules and skills, then check its records against the new rules and propose migrations.
disable-model-invocation: true
---

# Dev Update

Bring a Framework project up to the installed Framework. Managed material is replaced as a whole; project records are changed only through migrations the user approves.

Run the scripts from the project root:

- Sync managed material: `bun <this skill's directory>/../dev-framework/scripts/sync.ts .`, with `--check` to preview.
- Check the Plan and generate the map: `bun .agents/skills/dev-framework/scripts/map.ts .`

## 1. Preview

- Confirm the working directory is the Git top level and has `dev.yaml`. Otherwise, suggest `dev-init` and stop.
- Run sync with `--check`, and show what would change in a short list.
- If sync refuses, show how to clear each problem: commit or stash the listed changes, move skills out of a real `.claude/skills/` directory, or repair section markers.
- Ask once whether to apply.

## 2. Sync

1. Create `work/update-dev-framework` from `main`.
2. Run sync, then run the map script. The map script may report old record formats; step 3 handles them.

## 3. Check records against the new rules

Read the updated rules in `knowledge/dev-framework/`, then check:

| Area | Check |
| --- | --- |
| Structure | The required paths in Project structure exist, and `/.tmp/` is ignored |
| Plan | The problems the map script reports, such as old frontmatter fields, old status values, or inconsistent statuses |
| Knowledge | Every document has `canonical_for`, and `subdocs` lists every child |
| Leftovers | Material from earlier Framework versions that sync does not manage, such as old skills in `.agents/skills/` |

Propose one fix per finding. When a fix needs judgment, such as which status an old node should get, recommend a value for each node. Apply only the fixes the user approves, then regenerate the map.

## 4. Finish

Show a short summary of the changes, and ask whether to commit. Merge only when the user asks. Then follow the project's copy of `dev-next` at `.agents/skills/dev-next/SKILL.md`.

## Authority

| Before approval | After approval | Always separate |
| --- | --- | --- |
| Reading, and sync with `--check` | Sync, and the approved migrations only | Commits, merges, pushes; deleting leftover files the user has not approved |
