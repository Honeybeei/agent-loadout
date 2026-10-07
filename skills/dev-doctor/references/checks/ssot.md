# SSoT

Each topic has one detailed owner, and Knowledge and Plan hold only their own content. Read [What Knowledge holds](../../../dev-framework/project/knowledge/dev-framework/knowledge-documentation.md#what-knowledge-holds) before judging or proposing a fix.

## Script findings

| Finding | Usual fix |
| --- | --- |
| A topic in `canonical_for` of two project documents | Recommend one owner. Move the detail there, and leave a short summary with a link in the other document. |
| A topic that a Framework document also owns | Remove the restated Framework rule and link to it. Keep only project-specific rules, under a topic the Framework does not own. |
| Knowledge that says what is not built yet | Remove the build status and keep the design; a sentence about the product's own behavior is reworded so it reads as such |

## Judgment checks

Unit: one topic and the documents that own it; and, as one more unit, the project rules in the root `AGENTS.md`, outside the managed section.

| Check | How |
| --- | --- |
| No other document explains the topic in detail | Search Knowledge, README files, and `AGENTS.md` for the topic; a brief summary with a link passes |
| The owner does not restate or adapt a Framework rule | Compare it with the rules in `knowledge/dev-framework/` |
| The owner holds no Plan content: goals, work done, remaining work, or order | Classify each part by the question it answers |
| Proposals still under consideration stay out, and Knowledge states no build status | Look for decisions stated without approval, and for wording such as implemented, built, or not yet |
| Project rules in `AGENTS.md` do not restate or contradict Framework rules, or rely on concepts the Framework no longer uses, such as per-node work branches | Compare each rule with the rules in `knowledge/dev-framework/` |

Move Plan content into the node it belongs to. When no node fits, list it as later work.

For a project rule that contradicts the Framework, ask whether it is a deliberate project choice. Keep a deliberate one, reworded in the Framework's current terms; remove a restatement and link to the Framework rule instead.
