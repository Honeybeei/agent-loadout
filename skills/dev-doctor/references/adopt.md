# Adopt

Make a repository without `dev.yaml` a Framework project. Before proposing, read [Project structure](../../dev-framework/project/knowledge/dev-framework/project-structure.md) and [Plan documentation](../../dev-framework/project/knowledge/dev-framework/plan-documentation.md).

## Investigate

- Read the README, `AGENTS.md`, any `CLAUDE.md`, existing plan and documentation directories, `.agents/skills/`, `.claude/`, `.gitignore`, and `git status`.
- Run sync with `--check` to see the managed material it would add.

## Propose

- The project files to create (below), and the managed material sync adds.
- Workspaces: recommend `.` unless the project already has separate areas, each with its own purpose.
- The root node's title and Goal, taken from the README, or asked in one question when the README does not say.
- The project rules for the root `AGENTS.md`: the commands that set up a development environment in a new checkout or worktree, and the automated checks that must pass before a merge. Take them from the project's tooling, and confirm them with the user.
- A fix for each finding that blocks adoption: for example, merging a `CLAUDE.md` into `AGENTS.md`, or moving skills from a real `.claude/skills/` directory into `.agents/skills/`.

## Apply

Commit message: `chore: adopt the Dev Framework`.

1. Create each missing project file, and keep every existing one:

   | File | Content |
   | --- | --- |
   | `dev.yaml` | The agreed `workspaces` list |
   | Workspace `README.md` | Purpose and responsibilities, for each declared workspace other than `.` |
   | `knowledge/README.md` | A title and a line saying it indexes the project's Knowledge |
   | `plan/README.md` | How to read the Plan, with links to `map.md` and to the managed Plan documentation |
   | `plan/nodes/root.md` | A node with the agreed title and Goal, `parent: null`, `depends_on: []`, and `status: fog` |
   | `README.md` | A short project introduction, only when the file is missing. Add links to `AGENTS.md`, `knowledge/README.md`, and `plan/README.md` when it lacks them, as the [README and AGENTS guideline](../../dev-framework/project/knowledge/dev-framework/readme-agents-guideline.md#responsibilities) requires. |
   | `.gitignore` | A `/.tmp/` line, if it is missing |
   | `AGENTS.md` | The agreed setup commands and automated checks, kept outside the managed section; sync adds the section afterward |

2. Run sync, then the map script. Sync adds the managed sections to `README.md` and `AGENTS.md`, creating `AGENTS.md` when it is missing. It also links `.claude/skills` to `../.agents/skills`, because Claude Code reads project skills only from `.claude/skills/`.

After adoption, `dev-next` usually recommends exploring the root.
