---
canonical_for:
  - Plan layout and map
  - Plan node lifecycle and status
  - Plan node format
  - Recording resolved questions
managed_by: dev-framework
---

# Plan Documentation

This document defines how a project's Plan is stored, how a node moves from an unclear area to finished work, and what each node document contains. What belongs in Plan rather than Knowledge is defined in [Knowledge documentation](knowledge-documentation.md#what-knowledge-holds). Only the main flow edits the Plan, as [Development workflow](workflow.md) says.

## Layout

```text
plan/
├── README.md       Entry point: how to read the Plan, link to the map
├── map.md          Generated map; never edited by hand
└── nodes/
    ├── root.md     The project itself
    └── <node>.md   Every other node, flat, whatever its depth
```

- The Plan is one tree of **nodes**. A node is a goal: something the project wants to achieve. Open questions about a goal live inside its node, not as separate nodes.
- `root` is the project itself. How the root's children are organized, such as milestones or small tasks, is the project's choice.
- The file name without `.md` is the node's identity. Use kebab-case. Siblings are ordered by file name, so a prefix such as `01-` can set their order.

## Node frontmatter

| Field | Rule |
| --- | --- |
| `title` | Human-readable name |
| `parent` | Parent node's file name; `null` only for `root` |
| `depends_on` | Nodes that must be done first; `[]` when none |
| `status` | One of the values below |

## Lifecycle and status

```text
fog ──explore──→ exploring ──explore──┬─→ decomposed ──close──→ done
                     ↑                └─→ ready ──dispatch──→ in_progress ──review──→ done
                     └──────────────────── reopen ─────────────────┘
```

A `decomposed` node splits its work into child nodes, each with its own lifecycle.

| Status | Meaning | Next action |
| --- | --- | --- |
| `fog` | The area is known, but its goal cannot be stated clearly yet | Explore |
| `exploring` | The goal is clear, and the node has open questions | Explore |
| `decomposed` | No open questions at this level; child nodes carry the work | Close with review when the children finish and the criteria hold |
| `ready` | A leaf clear enough to implement | Dispatch |
| `in_progress` | Dispatched: an implementation session is building it in its worktree | Review when its report arrives |
| `done` | Completion criteria met, and the user approved | — |
| `cancelled` | Dropped or out of scope; the reason is in Record | — |

- `ready` and `in_progress` apply only to leaves: nodes with no unfinished children.
- `decomposed` applies only to nodes with children.
- A parent becomes `done` only when every child is `done` or `cancelled` and the parent's own criteria hold. Parents are not implemented directly.
- A node is blocked while any node in its `depends_on` is not `done`. Blocking is computed, not stored as a status.
- A `ready` node must be small enough to implement and verify in one piece of work on one branch. If it is larger, explore it further and split it.
- Inside a node, an unclear area that can be named becomes a `fog` child node. An area that cannot even be named yet stays in the node's Not yet specified section.

## Node format

Every node has the same frame, and one stage block that matches its status:

```markdown
---
title: <Title>
parent: <parent-node>
depends_on: []
status: <status>
---

# <Title>

## Goal
<What to achieve and why. When the goal changes, keep the original goal and the reason for the change.>

<stage block>

## Record
- Decided: <one-line gist> → <link to the owner>
- Dispatched (<blackbox or collaborative>): impl/<node>
- Implemented (<mode>): <what was done>, <evidence such as checks and the merge>
- Reopened: <why the implementation stopped>, <what it found>
- Closed: <how the children were verified together>, <evidence>
```

| Status | Stage block sections |
| --- | --- |
| `fog` | None; keep Goal short. Add Not yet specified when useful. |
| `exploring` | Completion criteria (as far as known), Open questions, Not yet specified, Out of scope |
| `decomposed` | Completion criteria (what must hold once the children are combined), Out of scope |
| `ready`, `in_progress`, `done` | Completion criteria, Out of scope, Relies on, Verification |
| `cancelled` | Keep the last stage block; state the reason in Record |

The stage block sections, in this order:

```markdown
## Completion criteria
- [ ] <A condition someone can check>

## Open questions
- [grilling] <Question for the user>
- [research] <Question the agent can answer by investigating>
- [prototype] <Question that needs a rough working artifact>
- [task] <Work that must happen before a question can be answered> (blocked by: <question>)

## Not yet specified
- <Something unclear that cannot be phrased as a question yet>

## Out of scope
- <What this goal excludes, and why>

## Relies on
- <Link to each Knowledge document the work must follow>

## Verification
- <How the result is checked>
```

- Write each open question on one line. The tag names how it gets resolved; `grilling` and `prototype` need the user.
- Omit a section of the stage block when it would be empty, except Completion criteria in `decomposed` and later stages.
- When the status changes, replace the stage block. A node becomes `ready` only when Open questions and Not yet specified are empty.

## Recording resolved questions

Record an answer as soon as the question is resolved:

| The answer is | Record it in |
| --- | --- |
| A product or technical rule or design that stays valid | Knowledge, labeled if not yet implemented, plus a Decided line in the node's Record that links to it |
| A decision about this work, such as scope, order, or approach | The node's Record |
| A fact found by investigation | Knowledge if later work will rely on it, otherwise a summary in Record; raw material stays in `.tmp/research/` |

- An answer the user gives is an approved decision. An agent's proposal stays an open question until the user confirms it.
- Keep Record lines short. The detail lives in one owner, and Record links to it.
- Keep failed attempts and cancelled work in Record; they explain later choices.
- Each resolved question is its own commit, offered once it is recorded, as [Git workflow](git-workflow.md#commits) says.

## Map

`plan/map.md` is generated from the node files, together with a browser view, `.tmp/plan/map.html`. Run the map script from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .           # check the Plan, and write the map and the view
bun .agents/skills/dev-framework/scripts/map.ts . --check   # only report whether the map is stale
```

The map shows, in order:

1. Progress: how many leaf nodes are done, out of all leaf nodes that are not `cancelled`; the unfinished ones by status; and the open question count. Leaf nodes are the units of work.
2. The tree, with one line per node: its file name, title, status, open question count, and the dependencies it still waits for.
3. "Running", when any node is `in_progress`: the dispatched nodes. They belong to their implementation sessions; the main flow reviews them when their reports arrive.
4. "Now possible":

   | Group | Nodes |
   | --- | --- |
   | Close | `decomposed` nodes whose children are all `done` or `cancelled` |
   | Dispatch | Unblocked `ready` nodes |
   | Explore | Unblocked `fog` and `exploring` nodes |

5. "Order": the unfinished leaf nodes in numbered steps. A node comes one step after the latest work it waits for, and waiting for a parent means waiting for its unfinished leaves. Nodes in one step do not wait for each other.

The view shows the same, plus each node's content, the Completion criteria met, and the latest commits that touched `plan/`. It also shows:

- Progress as a bar split by status, and a legend of the status colors.
- A badge on each blocked node, with the number of nodes it waits for.
- Arrows in Order, from each piece of work to the work that waits for it.
- Links from each node's details to its parent, dependencies, dependents, and children.

Selecting a node marks the work it waits for and the work that waits for it, and highlights its arrows.

- The script writes no map while the Plan breaks the rules in this document; it lists the problems instead.
- Regenerate the map after adding, removing, or renaming a node, after changing frontmatter, or after changing a node's open questions, since the map shows their count. The view also shows node content, so regenerate before opening it.
- Never edit the map or the view by hand. A map that may be stale is not current evidence; read the node files instead.
