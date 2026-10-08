# Adopt

Make a repository without `dev.yaml` a Framework project. `dev-framework apply --adopt` has added the managed material; adoption adds the project files that need the user's answers. Before proposing, read [Project structure](../../../../knowledge/dev-framework/project-structure.md) and [Plan documentation](../../../../knowledge/dev-framework/plan-documentation.md).

## Investigate

Read the README, `AGENTS.md`, any `CLAUDE.md`, existing plan and documentation directories, `.agents/skills/`, `.gitignore`, and `git status`.

## Propose

- The project files to create (below).
- Workspaces: recommend `.` unless the project already has separate areas, each with its own purpose.
- The root node's title and Goal, taken from the README, or asked in one question when the README does not say.
- The project rules for the root `AGENTS.md`: the commands that set up a development environment in a new checkout or worktree, and the automated checks that must pass before a merge. Take them from the project's tooling, and confirm them with the user.
- A fix for each finding that blocks adoption, such as merging a `CLAUDE.md` into `AGENTS.md`.

## Apply

Commit message: `chore: adopt the Dev Framework`.

1. Create each missing project file, and keep every existing one:

   | File | Content |
   | --- | --- |
   | `dev.yaml` | The agreed `workspaces` list |
   | Workspace `README.md` | Purpose and responsibilities, for each declared workspace other than `.` |
   | `plan/README.md` | How to read the Plan, with links to `map.md` and to the managed Plan documentation |
   | `plan/nodes/root.md` | The root goal in the [Node frame](../../../../knowledge/dev-framework/plan-documentation.md#node-frame), with the agreed title and Goal, `parent: null`, `kind: goal`, and `status: open` |
   | `README.md` | Add the links the [README and AGENTS guideline](../../../../knowledge/dev-framework/readme-agents-guideline.md#responsibilities) requires of the root README, including every workspace README, and a short project introduction when it has none |
   | `.gitignore` | A `/.tmp/` line, if it is missing |
   | `AGENTS.md` | The agreed setup commands and automated checks, outside the managed section |

2. Run the map script, which writes `plan/map.md` and `knowledge/README.md`.

After adoption, `dev-next` usually recommends planning the root.
