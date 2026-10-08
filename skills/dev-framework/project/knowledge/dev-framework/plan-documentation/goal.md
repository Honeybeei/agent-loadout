---
canonical_for:
  - Goal node template
  - Planning rules
  - Choosing a leaf's kind
  - Closing a goal
managed_by: dev-framework
---

# Goal Nodes

A goal is a todo split into child nodes. It is never run directly: planning splits it, and closing finishes it once its children are done. The frame, status, and map are defined in [Plan documentation](../plan-documentation.md).

## Template

```markdown
## Goal
<What to achieve and why>

## Completion criteria
- [ ] <What must hold once the children are combined, as far as known>

## Out of scope
- <What this goal excludes, and why> → <receiver, or `not planned`>

## Record
- Planned: <what the split produced, and why>
- Closed: <how the children were verified together>, <evidence>
```

- Before planning, Goal alone is enough. Add the other sections as they become known.
- `root` is a goal.

## Planning

Planning decides the work. It runs when a goal needs planning, and when an explore or collaborative leaf finishes or a blackbox leaf merges with work left, for the goals its results affect. It never makes technical decisions; those belong to explore leaves.

- Give each part that lacks decisions an explore leaf. Its destination is what must be decided before that part can be planned.
- Split top-down and recursively, into sub-goals and leaves, until every leaf meets its kind's size rule. Prefer vertical slices that end in something runnable over layers.
- Create only leaves whose template can be filled now. Other work stays a goal without children, with the explore leaf it waits for in `depends_on`; later planning splits that goal or changes its kind to a leaf. A blackbox leaf written before its output can be described is an empty contract.
- A leaf that proves too large becomes a goal and is split.
- Recommend each leaf's kind with a one-line reason; the user confirms it.

### Choosing a leaf's kind

| Kind | Choose when |
| --- | --- |
| `explore` | Decisions are missing: what to build, how it behaves, or which technology to use |
| `collaborative` | The user wants to shape the structure or internals, or to learn the part; or the output must be found by building it |
| `blackbox` | The user does not care about the internal structure, or collaborative work brings no benefit; and the output can be described concretely now |

A leaf whose output cannot yet be described becomes collaborative, or waits as a goal for an explore leaf.

## Closing

A closable goal is finished by verifying its own Completion criteria on the combined result of its children:

- Run automated checks directly; ask the user about criteria that need judgment.
- When every criterion holds, set the goal `done` with a Closed line in Record.
- An unmet criterion becomes a new leaf through planning, and the goal stays `open`.
