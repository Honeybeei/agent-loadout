# Links and Navigation

Links resolve, every maintained document can be reached from the root README, and nothing relies on `.tmp/`.

## Script findings

The script checks reachability only for Knowledge, the Plan entry points, workspace READMEs, and `AGENTS.md`.

| Finding | Usual fix |
| --- | --- |
| A broken link, or a link to a heading that does not exist | Point it to the current path or heading, or remove it when the target is gone for good |
| A `.tmp/` path that Knowledge or Plan names | Move the needed conclusions into the document, then remove the path |
| A document the root README does not reach | Link it from the index of its area: a README, `knowledge/README.md`, or its parent's `subdocs` |

## Judgment

Unit: one document, judged against [Navigation](../../../dev-framework/project/knowledge/dev-framework/readme-agents-guideline.md#navigation), [Links and reading](../../../dev-framework/project/knowledge/dev-framework/knowledge-documentation.md#links-and-reading), and [Temporary material](../../../dev-framework/project/knowledge/dev-framework/project-structure.md#temporary-material).

- A link under a heading that already says when or why to read it, such as Relies on in a Plan node, passes.
- For a maintained document outside the script's scope, such as `docs/guide.md`, search for links to it.
