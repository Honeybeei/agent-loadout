# Links and Navigation

Links resolve, every maintained document can be reached from the root README, and nothing relies on `.tmp/`. Read [Navigation](../../../dev-framework/project/knowledge/dev-framework/readme-agents-guideline.md#navigation) and [Temporary material](../../../dev-framework/project/knowledge/dev-framework/project-structure.md#temporary-material) before judging or proposing a fix.

## Script findings

The script checks reachability only for Knowledge, the Plan entry points, workspace READMEs, and `AGENTS.md`.

| Finding | Usual fix |
| --- | --- |
| A broken link, or a link to a heading that does not exist | Point it to the current path or heading, or remove it when the target is gone for good |
| A `.tmp/` path that Knowledge or Plan names | Move the needed conclusions into the document, then remove the path |
| A document the root README does not reach | Link it from the index of its area: a README, `knowledge/README.md`, or its parent's `subdocs` |

## Judgment checks

Unit: one document.

| Check | Rule |
| --- | --- |
| Each link to another document says when or why to read it; a link under a heading that already says so, such as Relies on in a Plan node, passes | [Navigation](../../../dev-framework/project/knowledge/dev-framework/readme-agents-guideline.md#navigation) |
| A maintained document outside the script's scope, such as `docs/guide.md`, is reachable from the root README; search for links to it | [Navigation](../../../dev-framework/project/knowledge/dev-framework/readme-agents-guideline.md#navigation) |
