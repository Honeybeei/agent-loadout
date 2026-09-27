---
canonical_for:
  - Knowledge content and ownership
  - Knowledge document format
managed_by: dev-framework
---

# Knowledge Documentation

This document defines what Knowledge holds and how Knowledge documents are written. A Knowledge document is any Markdown file under root `knowledge/` or a workspace's `knowledge/`, except the `README.md` indexes, which follow the [README and AGENTS guideline](readme-agents-guideline.md).

## What Knowledge holds

Knowledge holds current facts and approved product or technical requirements, rules, and designs, with their rationale. Plan holds goals, the work done toward them, and the work that remains.

Classify content by the question it answers:

| Content | Owner |
| --- | --- |
| What the product must do, which technical rule or design governs it, and why | Knowledge, including approved but unimplemented decisions |
| What a piece of work aims to achieve and how success is judged | Plan |
| What was tried, decided, implemented, or verified for that work | Plan |
| Remaining work, order, blockers, and deferred choices | Plan |

For example, "exports must preserve all user data" is Knowledge; "implement export, then test recovery" is Plan, even when approved.

- Label approved but unimplemented decisions as such.
- Keep proposals under consideration out of Knowledge until they are approved.
- Give each topic one detailed owner. Other documents may summarize it briefly and link to it.
- Put project-wide and cross-workspace Knowledge in root `knowledge/`, and workspace-specific Knowledge in that workspace's `knowledge/`.
- Framework rules live only in the Framework-managed documents under `knowledge/dev-framework/`. Do not restate or adapt them in other project Knowledge; see [Framework-managed material](project-structure.md#framework-managed-material).
- Do not link to or depend on `.tmp/` material. Move needed conclusions into the document.

## Form

Use a kebab-case filename and exactly one H1 heading. Choose body sections that fit the topic.

Start with YAML frontmatter:

| Field | Rule |
| --- | --- |
| `canonical_for` | Always required. A nonempty list of the topics this document owns, as short English phrases. |
| `subdocs` | Required when the document has child documents: a complete list of document-relative paths to its direct children. Omit it otherwise. |

A project may add fields when it defines their meaning. Added fields cannot replace or weaken the two above. The Framework uses `managed_by: dev-framework` to mark its managed documents.

A new document starts like this:

```markdown
---
canonical_for:
  - <Topic this document owns>
# Add subdocs when this document has children:
# subdocs:
#   - ./<document-basename>/<child>.md
---

# <Document title>
```

## Subdocuments

Put child documents in a directory named after the parent document:

```text
knowledge/
├── README.md
├── architecture.md       subdocs lists both files below
└── architecture/
    ├── persistence.md
    └── communication.md
```

- A child with its own children declares them; each document lists only its direct children.
- A subdocument directory is not a workspace and needs no README.
- Split only when it makes the topic easier to understand.

## Links and reading

- Use document-relative links.
- State when to read each linked document, for example "read before changing persistence behavior".
- Read only the documents a task needs, following those conditions. A summary does not replace an applicable detailed rule.

## Length

Aim for about 120 lines per document. Above 150 lines, consider compressing or splitting it. This is a review trigger, not a hard limit.

## Maintenance

- Update Knowledge when facts or approved decisions change, not when work progresses; progress belongs in Plan.
- When a rule is replaced, describe the current rule. Keep the reason for dropping the old rule only when it helps explain the new one.
- Keep history out of Knowledge: Git keeps edits, and Plan keeps work-time context.
- When moving or splitting documents, update `subdocs`, indexes, and incoming links.
