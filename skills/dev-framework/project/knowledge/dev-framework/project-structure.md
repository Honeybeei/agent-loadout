---
canonical_for:
  - Project root and layout
  - Workspaces
  - Temporary material
  - Framework-managed material
managed_by: dev-framework
---

# Project Structure

This document defines the root layout of a Framework project, its workspaces, and where temporary material goes. Knowledge document rules are in [Knowledge documentation](knowledge-documentation.md); README and AGENTS responsibilities are in the [README and AGENTS guideline](readme-agents-guideline.md).

## Project root

The agent's session cwd, the project root, and the Git worktree top-level directory (`git rev-parse --show-toplevel`) are the same directory. Linked worktrees are supported; each uses its own top-level directory as its project root. Blackbox implementation worktrees live outside the main checkout, as [Git workflow](git-workflow.md#worktrees) says.

## Root layout

```text
project-root/
├── .git              Directory, or file for a linked worktree
├── .gitignore        Must exclude /.tmp/
├── README.md         Human entry point, with a Framework-managed section
├── AGENTS.md         Agent entry point, root only, with a Framework-managed section
├── dev.yaml          Marks a Framework project and declares workspaces
├── knowledge/
│   ├── README.md          Index of project-wide and cross-workspace Knowledge
│   ├── dev-framework.md   Framework-managed index of the Framework rules
│   └── dev-framework/     Framework-managed Framework rules
├── plan/
│   ├── README.md     Entry point to the project Plan
│   ├── map.md        Generated map of the Plan
│   └── nodes/        One file per Plan node
├── .agents/
│   └── skills/       Agent skills: Framework-managed skills and any project skills
├── .claude/
│   └── skills        Link to ../.agents/skills, so Claude Code finds the same skills
└── .tmp/             Temporary material, created when needed
```

A project may contain other files and directories; the Framework does not require an `apps/`, `packages/`, or similar layout.

Every path in the tree is required, except `.tmp/`, which is created when needed. A project that lacks a required path is incompletely set up. Report the gap; missing structure alone does not authorize creating files.

## Workspaces

A workspace is an area of the project with its own purpose and responsibility. It does not need to be a separately built package.

`dev.yaml` declares workspaces as a list of root-relative directory paths:

```yaml
workspaces:
  - apps/desktop
  - tools/release
```

A declared workspace:

1. exists at the declared path;
2. has a `README.md`;
3. may have `knowledge/` for workspace-specific Knowledge. When it exists, it contains a `README.md` index that the workspace README links to.

Rules:

- Only `dev.yaml` makes a directory a workspace; a README alone does not.
- Workspaces do not nest.
- The root can be the workspace, declared as `.`. Then `.` is the only entry, and the root README and root `knowledge/` also serve the workspace.
- `knowledge/`, `plan/`, `.tmp/`, `.git`, `.agents/`, `.claude/`, and anything inside them cannot be declared as a workspace.
- Put Knowledge that spans workspaces in root `knowledge/`, not in copies inside several workspaces.
- Add fields to `dev.yaml` only when an agreed need exists.

## Temporary material

Root `.tmp/` holds temporary material such as research notes, prototypes, drafts, experiment output, handoffs, and the Plan's browser view. Sessions also pass records to each other through it: implementation reports and review findings, as [Development workflow](workflow.md#writing-across-sessions) says.

- Git must exclude it with `/.tmp/` in `.gitignore`.
- Use one subdirectory per purpose, such as `.tmp/research/<topic>/`, `.tmp/prototypes/<name>/`, `.tmp/reports/`, `.tmp/reviews/`, or `.tmp/handoffs/`.
- Knowledge and Plan must not link to, name a path in, or depend on `.tmp/`. Move needed conclusions into them so they stay understandable after `.tmp/` is deleted.
- Delete only material you created, and only after its conclusions are preserved. Report material of unclear origin instead of deleting it. Do not follow symlinks when deleting.

## Framework-managed material

The Framework adds the following to a project and replaces them when the project is updated to a newer Framework:

| Material | Purpose |
| --- | --- |
| `knowledge/dev-framework.md` | Index of the Framework rules |
| `knowledge/dev-framework/` | The Framework rules, including this document |
| Section in root `README.md` | Points readers to the Framework rules |
| Section in root `AGENTS.md` | Tells agents what to read before working |
| `.agents/skills/dev-next/`, `dev-plan/`, `dev-explore/`, `dev-collaborate/`, `dev-blackbox-dispatch/`, `dev-blackbox-implement/`, `dev-blackbox-review/` | The Framework's workflow skills |
| `.agents/skills/grilling/`, `research/`, `prototype/` | Skills the workflow skills use |
| `.agents/skills/dev-framework/` | Scripts the workflow skills use |
| `.claude/skills` | Link to `../.agents/skills` |

- A managed section starts with a `<!-- dev-framework:start -->` line and ends with a `<!-- dev-framework:end -->` line. A managed document has `managed_by: dev-framework` in its frontmatter. Managed skill directories are the ones listed above; give project-specific skills other names.
- Keep managed material unedited in the project. Put project-specific rules outside the managed sections, in `AGENTS.md` or project Knowledge. To change a Framework rule, change the Framework and update the project.

## Version control

Keep durable project material in Git: root README and AGENTS, `dev.yaml`, `.gitignore`, workspace READMEs, Knowledge, Plan, and all Framework-managed material. Read [Git workflow](git-workflow.md) before staging, committing, merging, or pushing; keeping material in Git does not authorize those actions.
