---
canonical_for:
  - README and AGENTS responsibilities
  - Documentation navigation
managed_by: dev-framework
---

# README and AGENTS Guideline

This document defines the responsibilities of README files and the root `AGENTS.md`, and how documents link together so readers can find them. Layout rules and the rules for Framework-managed sections are in [Project structure](project-structure.md).

## Responsibilities

| Document | Responsibility |
| --- | --- |
| Root `README.md` | Introduce the project. Link to `AGENTS.md`, every workspace README, `knowledge/README.md`, and `plan/README.md`. Contains the Framework-managed section. |
| Workspace `README.md` | State the workspace's purpose and responsibilities. Link to its documents and rules, including its `knowledge/README.md` when that exists. |
| `knowledge/README.md` | Index the top-level project Knowledge topics of its area. Deeper documents are reached through `subdocs`. Root `knowledge/README.md` need not list the Framework-managed index, which the managed sections link. |
| `plan/README.md` | Explain how to read the Plan and link to `plan/map.md`. It does not own goals or work records itself. |
| Root `AGENTS.md` | Hold project-specific agent rules, such as commands, validation, and approval conditions. Name the commands that set up a development environment in a new checkout or worktree, and the automated checks that must pass before a merge. Contains the Framework-managed section. |

- When the root is the only workspace, the root README also serves as the workspace README.
- Sections, order, and length outside the managed sections are project choices. README and AGENTS files have no required frontmatter or line limit.
- Keep detailed rules in their owning documents; entry points summarize and link.

## AGENTS.md

`AGENTS.md` exists only at the project root and is the only project instruction file. Do not add workspace-level `AGENTS.md` files or a `CLAUDE.md`; Claude Code reads `AGENTS.md` only when no `CLAUDE.md` exists. Project rules go outside the Framework-managed section.

## Navigation

- Every maintained project document must be reachable from the root README through links or `subdocs`. Reachable does not mean required reading.
- State when and why to read each link.
- Use document-relative links, and update them when documents move.
- `dev.yaml` is the authority for workspace membership. READMEs reflect it; they do not declare workspaces.
