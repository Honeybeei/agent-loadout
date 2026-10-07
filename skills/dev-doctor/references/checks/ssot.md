# SSoT

Each topic has one detailed owner, and Knowledge and Plan hold only their own content.

## Script findings

| Finding | Usual fix |
| --- | --- |
| A topic in `canonical_for` of two project documents | Recommend one owner. Move the detail there, and leave a short summary with a link in the other document. |
| A topic that a Framework document also owns | Remove the restated Framework rule and link to it. Keep only project-specific rules, under a topic the Framework does not own. |
| Knowledge that says what is not built yet | Remove the build status and keep the design. Text the product itself shows, such as an error message, goes in a code span, which the check skips. |

## Judgment

Units: one topic and the documents that own it; and the project rules in the root `AGENTS.md`, outside the managed section. Judge them against [What Knowledge holds](../../../dev-framework/project/knowledge/dev-framework/knowledge-documentation.md#what-knowledge-holds), [Framework-managed material](../../../dev-framework/project/knowledge/dev-framework/project-structure.md#framework-managed-material), and, for `AGENTS.md`, the [README and AGENTS guideline](../../../dev-framework/project/knowledge/dev-framework/readme-agents-guideline.md#responsibilities).

- Search Knowledge, README files, and `AGENTS.md` for the topic; a brief summary with a link passes.
- Compare the owner and the `AGENTS.md` rules with the rules in `knowledge/dev-framework/`, including concepts the Framework no longer uses, such as per-node work branches.
- Classify each part by the question it answers: goals, work done, remaining work, and order are Plan content.
- Look for decisions stated without approval, and for build status such as implemented, built, or not yet.

Move Plan content into the node it belongs to. When no node fits, list it as later work.

For a project rule that contradicts the Framework, ask whether it is a deliberate project choice. Keep a deliberate one, reworded in the Framework's current terms; remove a restatement and link to the Framework rule instead.
