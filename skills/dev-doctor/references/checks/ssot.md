# SSoT

Each topic has one detailed owner, and Knowledge and Plan hold only their own content. Read [What Knowledge holds](../../../dev-framework/project/knowledge/dev-framework/knowledge-documentation.md#what-knowledge-holds) before judging or proposing a fix.

## Script findings

| Finding | Usual fix |
| --- | --- |
| A topic in `canonical_for` of two project documents | Recommend one owner. Move the detail there, and leave a short summary with a link in the other document. |
| A topic that a Framework document also owns | Remove the restated Framework rule and link to it. Keep only project-specific rules, under a topic the Framework does not own. |

## Judgment checks

Unit: one topic and the documents that own it.

| Check | How |
| --- | --- |
| No other document explains the topic in detail | Search Knowledge, README files, and `AGENTS.md` for the topic; a brief summary with a link passes |
| The owner does not restate or adapt a Framework rule | Compare it with the rules in `knowledge/dev-framework/` |
| The owner holds no Plan content: goals, work done, remaining work, or order | Classify each part by the question it answers |
| Proposals still under consideration stay out, and approved but unimplemented decisions are labeled | Look for decisions stated without approval or status |

Move Plan content into the node it belongs to. When no node fits, list it as later work.
