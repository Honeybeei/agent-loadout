# Structure

Required files, the `.gitignore` entry for `.tmp/`, workspaces, and instruction files. Read [Project structure](../../../dev-framework/project/knowledge/dev-framework/project-structure.md) before proposing a fix.

## Script findings

| Finding | Usual fix |
| --- | --- |
| A missing required file | Create it as [Adopt](../adopt.md#apply) describes |
| `/.tmp/` not excluded | Add `/.tmp/` to the root `.gitignore` |
| A `CLAUDE.md` or a nested `AGENTS.md` | Move its rules into the root `AGENTS.md`, outside the managed section, then delete it |
| A workspace problem | Correct `dev.yaml`, or add the workspace README |

This group has no judgment checks.
