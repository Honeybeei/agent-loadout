# Structure

Required files, the `.gitignore` entry for `.tmp/`, workspaces, and instruction files, as [Project structure](../../../dev-framework/project/knowledge/dev-framework/project-structure.md) defines them.

## Script findings

| Finding | Usual fix |
| --- | --- |
| A missing required file | Create it as [Adopt](../adopt.md#apply) describes |
| `/.tmp/` not excluded | Add `/.tmp/` to the root `.gitignore` |
| A `CLAUDE.md` or a nested `AGENTS.md` | Move its rules into the root `AGENTS.md`, outside the managed section, then delete it |
| A workspace problem | Correct `dev.yaml`, or add the workspace README |

## Judgment

Unit: the project rules in the root `AGENTS.md`, outside the managed section, judged against the [README and AGENTS guideline](../../../dev-framework/project/knowledge/dev-framework/readme-agents-guideline.md#responsibilities). Propose missing commands as [Adopt](../adopt.md#propose) says.
