# Structure

Required files, the `.gitignore` entry for `.tmp/`, workspaces, and instruction files. Read [Project structure](../../../dev-framework/project/knowledge/dev-framework/project-structure.md) and the [README and AGENTS guideline](../../../dev-framework/project/knowledge/dev-framework/readme-agents-guideline.md#responsibilities) before judging or proposing a fix.

## Script findings

| Finding | Usual fix |
| --- | --- |
| A missing required file | Create it as [Adopt](../adopt.md#apply) describes |
| `/.tmp/` not excluded | Add `/.tmp/` to the root `.gitignore` |
| A `CLAUDE.md` or a nested `AGENTS.md` | Move its rules into the root `AGENTS.md`, outside the managed section, then delete it |
| A workspace problem | Correct `dev.yaml`, or add the workspace README |

## Judgment checks

Unit: the project rules in the root `AGENTS.md`, outside the managed section.

| Check | Why |
| --- | --- |
| It names the commands that set up a development environment in a new checkout or worktree | An implementation session runs them when it starts in a new worktree |
| It names the automated checks that must pass before a merge | Review runs them on the merged result before the merge lands |

To fix a gap, propose the commands from the project's tooling, such as its package scripts or build files, and confirm them with the user before writing them outside the managed section.
