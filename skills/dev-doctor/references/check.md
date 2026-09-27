# Check

Fix what breaks the Framework rules in a project whose managed material is current. Before proposing a fix, read the rule the finding refers to in the project's `knowledge/dev-framework/`.

## Fix findings

Branch: `work/conform-to-dev-framework`.

| Finding | Usual fix |
| --- | --- |
| A missing required file | Create it as [Adopt](adopt.md#apply) describes |
| `/.tmp/` not excluded | Add `/.tmp/` to the root `.gitignore` |
| A `CLAUDE.md` or a nested `AGENTS.md` | Move its rules into the root `AGENTS.md`, outside the managed section, then delete it |
| A workspace problem | Correct `dev.yaml`, or add the workspace README |
| `.claude/skills` not in Git | Include the link in the next commit |
| A Plan rule violation | Correct the frontmatter or status, then regenerate the map |
| A stale map | Regenerate it |
| A Knowledge frontmatter, heading, or file name problem | Add `canonical_for`, complete `subdocs`, keep one H1 heading, or rename the file and update its incoming links |
| A broken link | Point it to the current path, or remove it when the target is gone for good |
| Leftovers | Migrate what the project still needs, then delete the rest |

## Content review

Only when the user asks, also review what the script cannot judge. Read the owning rule before judging:

| Check | Rule |
| --- | --- |
| Plan content in Knowledge, or Knowledge content in Plan | [What Knowledge holds](../../dev-framework/project/knowledge/dev-framework/knowledge-documentation.md#what-knowledge-holds) |
| A topic with more than one detailed owner, or Framework rules restated in project Knowledge | [What Knowledge holds](../../dev-framework/project/knowledge/dev-framework/knowledge-documentation.md#what-knowledge-holds) |
| Knowledge or Plan that links to or depends on `.tmp/` | [Temporary material](../../dev-framework/project/knowledge/dev-framework/project-structure.md#temporary-material) |
| Documents not reachable from the root README, and links that do not say when to read them | [Navigation](../../dev-framework/project/knowledge/dev-framework/readme-agents-guideline.md#navigation) |
| Stage blocks that do not match the node's status, and Record lines that repeat detail instead of linking to its owner | [Plan documentation](../../dev-framework/project/knowledge/dev-framework/plan-documentation.md) |

Report what you find as findings, and propose fixes as for the script's findings.
