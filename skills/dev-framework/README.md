# Dev Framework

Dev Framework is a method for managing a software project with AI agents. This directory is its source: the rules that every Framework project carries, and shared resources for the Framework's workflow skills.

## What a project receives

`project/` mirrors a project root. Its contents are copied into each Framework project as managed material:

| Source | Destination in the project |
| --- | --- |
| `project/knowledge/dev-framework.md` | `knowledge/dev-framework.md` |
| `project/knowledge/dev-framework/` | `knowledge/dev-framework/` |
| `project/README.section.md` | Managed section in root `README.md` |
| `project/AGENTS.section.md` | Managed section in root `AGENTS.md` |

Links inside `project/` resolve the same way in the source and in a project. Start at [Dev Framework rules](project/knowledge/dev-framework.md); the rules for managed material are in [Project structure](project/knowledge/dev-framework/project-structure.md#framework-managed-material).

The tool that copies this material into projects, the Plan documentation, and the workflow skills are not defined yet.
