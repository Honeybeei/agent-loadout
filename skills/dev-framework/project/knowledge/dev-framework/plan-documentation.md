---
canonical_for:
  - Plan layout and map
  - Plan node kinds and status
  - Plan node frame
  - Recording decisions
managed_by: dev-framework
subdocs:
  - ./plan-documentation/goal.md
  - ./plan-documentation/explore.md
  - ./plan-documentation/collaborative.md
  - ./plan-documentation/blackbox.md
---

# Plan Documentation

This document defines how a project's Plan is stored, the kinds of node it holds, their status, how decisions are recorded, and the map. Each kind's template and rules are in its own document, listed under [Kinds](#kinds). What belongs in Plan rather than Knowledge is defined in [Knowledge documentation](knowledge-documentation.md#what-knowledge-holds); which session runs each kind is defined in [Development workflow](workflow.md).

## Layout

```text
plan/
├── README.md       Entry point: how to read the Plan, link to the map
├── map.md          Generated map; never edited by hand
└── nodes/
    ├── root.md     The project itself
    └── <node>.md   Every other node, flat, whatever its depth
```

- The Plan is a tree-shaped todo list. A goal is a todo split into smaller todos; a leaf is one piece of work that can be run.
- `root` is the project itself, a goal. How its children are organized, such as milestones or areas, is the project's choice.
- The file name without `.md` is the node's identity. Use kebab-case. Siblings are ordered by file name, so a prefix such as `01-` can set their order.

## Kinds

| Kind | What it is | Template and rules |
| --- | --- | --- |
| `goal` | A todo split into child nodes; never run directly | [Goal nodes](plan-documentation/goal.md) |
| `explore` | Wayfinding: turns low-resolution ideas, concepts, flows, and designs into decisions | [Explore nodes](plan-documentation/explore.md) |
| `collaborative` | Implementation the user shapes together with the agent | [Collaborative nodes](plan-documentation/collaborative.md) |
| `blackbox` | Implementation delegated whole and judged by its output | [Blackbox nodes](plan-documentation/blackbox.md) |

- Exploring makes decisions, planning decides the work, and implementation builds it. Decisions come before planning: a part whose technical decisions are missing gets an explore leaf before it is split into implementation work.
- Only a goal has children. Every leaf is an `explore`, `collaborative`, or `blackbox` node.
- A topic an explore leaf surfaces becomes a new explore leaf under the goal it serves, never a child of the explore leaf.

## Frontmatter

| Field | Rule |
| --- | --- |
| `title` | Human-readable name |
| `parent` | Parent goal's file name; `null` only for `root` |
| `depends_on` | Nodes that must be done first; `[]` when none |
| `kind` | `goal`, `explore`, `collaborative`, or `blackbox` |
| `status` | One of the values its kind allows, below |

## Status

```text
goal   open ─────────────────close────────────────→ done
leaf   todo ──start──→ in_progress ──finish───────→ done
                            └──blocked (blackbox)──→ todo
```

| Status | Kinds | Meaning |
| --- | --- | --- |
| `open` | goal | Unfinished. Without children it needs planning; once every child is `done` or `cancelled` it is closable. |
| `todo` | leaves | Not started |
| `in_progress` | leaves | Being worked: an explore or collaborative leaf by the lead session, a blackbox leaf by its implementation session |
| `done` | all | Finished: an explore applied, an implementation merged, a goal closed |
| `cancelled` | all | Dropped or out of scope; the reason is in Record |

- Three states are computed, never stored. A node is **blocked** while any node in its `depends_on` is not `done`; waiting for a goal means waiting for its unfinished leaves. An `open` goal **needs planning** when it has no children, and is **closable** when every child is `done` or `cancelled`.
- A `done` goal has only `done` or `cancelled` children.
- At most one collaborative leaf is `in_progress` at a time, since it occupies the main checkout.

## Node frame

Every node has the same frame. Its kind's document defines the body between Goal and Record. The frame and that document govern every edit to the node, whichever skill makes it.

```markdown
---
title: <Title>
parent: <parent goal>
depends_on: []
kind: <kind>
status: <status>
---

# <Title>

## Goal
<What to achieve and why>

<body defined by the kind>

## Record
- <One line per event in the node's life, linking to the detail>
```

- Every edit to a Goal adds `Goal changed: <the Goal before the edit>, <the reason>` to Record, and brings the sections that depend on the Goal, such as Completion criteria, in line.

## Recording decisions

A decision, or a fact found along the way, is recorded with its owner:

| What is recorded | Its owner |
| --- | --- |
| A product or technical rule or design that stays valid | Knowledge |
| A decision about one piece of work, such as scope, order, or approach | That node |
| A fact found by investigation | Knowledge if later work will rely on it, otherwise a summary in the node; never the raw material |
| A term the user agrees on | The glossary |

- A running explore or collaborative leaf holds its decisions and findings in its own node. Knowledge and other nodes stay unchanged until it finishes, which saves repeated edits and absorbs decisions reversed along the way.
- When it finishes, it accounts for every line of the node, wherever it sits, Notes and inputs for other nodes included: the line moves to its owner, or is specific to this work and stays. A moved line leaves its gist and a link to the owner, never a restatement.
- A decision line records what the user approved: the question, the answer, the date, and the alternatives considered, with a link to its owner. It is never cut or edited once the node finishes; a later change is a new decision, and the owner holds the current rule.
- A line in Out of scope or For the Plan, or a `Left:` line, links its receiver, the node or Knowledge document that holds it, or says `not planned`. When no node fits, planning creates one.
- An answer the user gives is an approved decision. An agent's proposal stays open until the user confirms it.
- Keep Record lines short, apart from the Goal a `Goal changed:` line quotes. The detail lives in one owner, and Record links to it.
- Keep failed attempts and cancelled work in Record; they explain later choices.

## Map

`plan/map.md` is generated from the node files, together with a browser view, `.tmp/plan/map.html`. Run the map script from the project root:

```bash
bun .agents/skills/dev-framework/scripts/map.ts .           # check the Plan, and write the map and the view
bun .agents/skills/dev-framework/scripts/map.ts . --check   # only report whether the map is stale
```

The map shows, in order:

1. Progress: how many leaves are done, out of all leaves that are not `cancelled`; the unfinished ones by status; how many goals need planning; and the number of open explore tickets.
2. The tree, with one line per node: its file name, title, kind, status or computed goal state, open ticket count, and the dependencies it still waits for.
3. "Running", when any leaf is `in_progress`: those leaves and their kinds.
4. "Now possible":

   | Group | Nodes |
   | --- | --- |
   | Close | Closable goals |
   | Plan | Unblocked goals that need planning |
   | Explore | Unblocked `todo` explore leaves |
   | Collaborate | Unblocked `todo` collaborative leaves |
   | Dispatch | Unblocked `todo` blackbox leaves |

5. "Order": the unfinished leaves and the goals that need planning, in numbered steps. A node comes one step after the latest work it waits for. Nodes in one step do not wait for each other.

The view shows the same, plus each node's content, the Completion criteria met, and the latest commits that touched `plan/`. It also shows progress as a bar split by status, a badge on each blocked node with the number of nodes it waits for, arrows in Order from each piece of work to the work that waits for it, and links from each node's details to its parent, dependencies, dependents, and children. Selecting a node marks the work it waits for and the work that waits for it.

- The script writes no map while the Plan breaks a rule it checks; it lists the problems instead.
- Regenerate the map after adding, removing, or renaming a node, after changing frontmatter, or after changing an explore leaf's tickets. The view also shows node content, so regenerate before opening it.
- Never edit the map or the view by hand. A map that may be stale is not current evidence; read the node files instead.
