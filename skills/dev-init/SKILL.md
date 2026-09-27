---
name: dev-init
description: Make the current repository a Dev Framework project. Add its project records, and copy the Framework's managed rules and skills into it.
disable-model-invocation: true
---

# Dev Init

Turn the current repository into a Dev Framework project. Before proposing anything, read [Project structure](../dev-framework/project/knowledge/dev-framework/project-structure.md) and [Plan documentation](../dev-framework/project/knowledge/dev-framework/plan-documentation.md).

Run the scripts from the project root:

- Sync managed material: `bun <this skill's directory>/../dev-framework/scripts/sync.ts .`, with `--check` to preview.
- Generate the map, once sync has run: `bun .agents/skills/dev-framework/scripts/map.ts .`

## 1. Investigate

This step only reads.

- Confirm the working directory is the Git top level. If `dev.yaml` exists, the project already uses the Framework: suggest `dev-update` and stop.
- Read the README, `AGENTS.md`, any `CLAUDE.md`, existing plan and documentation directories, `.agents/skills/`, `.claude/`, `.gitignore`, and `git status`.
- Run sync with `--check` to see what it would add and whether anything blocks it.

## 2. Propose

Show one short proposal, then wait for the user's approval:

- the project files to create (see step 3), and the managed material sync adds;
- workspaces: recommend `.` unless the project already has separate areas, each with its own purpose;
- the root node's title and Goal, taken from the README, or asked in one question when the README does not say;
- anything that blocks sync, with the fix: for example, merging a `CLAUDE.md` into `AGENTS.md`, or moving skills from a real `.claude/skills/` directory into `.agents/skills/`;
- existing plans and documents that could later become Plan nodes or Knowledge. List them as later work; do not convert them now.

## 3. Apply

1. When the repository has commits, create `work/adopt-dev-framework` from `main`.
2. Create each missing project file, and keep every existing one:

   | File | Content |
   | --- | --- |
   | `dev.yaml` | The agreed `workspaces` list |
   | Workspace `README.md` | Purpose and responsibilities, for each declared workspace other than `.` |
   | `knowledge/README.md` | A title and a line saying it indexes the project's Knowledge |
   | `plan/README.md` | How to read the Plan, with links to `map.md` and to the managed Plan documentation |
   | `plan/nodes/root.md` | A node with the agreed title and Goal, `parent: null`, `depends_on: []`, and `status: fog` |
   | `.gitignore` | A `/.tmp/` line, if it is missing |

3. Run sync, then generate the map. Sync also links `.claude/skills` to `../.agents/skills`, because Claude Code reads project skills only from `.claude/skills/`.

## 4. Finish

Show a short summary of the changes, and ask whether to commit. Merge only when the user asks. Then follow the project's copy of `dev-next` at `.agents/skills/dev-next/SKILL.md`; it usually recommends exploring the root.

## Authority

| Before approval | After approval | Always separate |
| --- | --- | --- |
| Reading, and sync with `--check` | The proposed changes only | Commits, merges, pushes; moving or deleting existing project files |
