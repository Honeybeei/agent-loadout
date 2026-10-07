---
canonical_for:
  - Blackbox node template
  - Blackbox readiness check
  - Blackbox blockers
  - Judging a blackbox result
managed_by: dev-framework
---

# Blackbox Nodes

A blackbox leaf is delegated whole to an implementation session in its own worktree. The user does not read its code; they judge its output. The node is therefore the only contract: concrete about the output, and silent about the internal structure, which the session decides. The frame and status are defined in [Plan documentation](../plan-documentation.md); dispatch, reports, and review in [Development workflow](../workflow.md).

## Template

```markdown
## Goal
<What to achieve and why>

## Output
<What the user will see or get. For UI: screens, components, shape, color, spacing, states.
For other work: observable behavior, results, examples. Images and references are welcome.>

## Completion criteria
- [ ] <A pass or fail statement checkable from the output>

## Interface
- <Only when other nodes use it: exact signatures, types, formats>

## Out of scope
- <What this leaf excludes, and why>

## Relies on
- <Link to each Knowledge document the work must follow>

## Verification
- <How the output is checked: screens to open, scenarios to run, commands>

## Record
- Dispatched: impl/<node>
- Implemented: <what was built, linking the Knowledge it implements>, <evidence such as checks and the merge>
- Reopened: <why the implementation stopped>, <the explore leaf that holds its questions>
- Spec gap: <what the review found missing from the node>
```

Goal, Output, Completion criteria, Verification, and Record are required; the map script checks them. Add the other sections when they apply.

## Readiness check

The agent runs this check when planning writes the leaf, and again at dispatch. A leaf that fails it is not dispatched.

1. **Build walk.** Walk through building the leaf and find the decisions that would stop the session, as [Blockers](#blockers) defines. Each must already be decided in Knowledge, or go to an explore leaf in `depends_on`. Internal decisions are not listed.
2. **Output walk.** Imagine checking the finished result and list what the user will look at, such as each screen, each state, and what an error looks like. Each is described in Output or the criteria.
3. Every Completion criterion is checkable from the output and holds on every supported platform.
4. Relies on holds every fact the work needs. Nothing lives only in `.tmp/`, external documents, or the conversation.
5. **Size.** One session can finish it, the user can check its output in one sitting, and it is one coherent output, such as one screen, one flow, or one feature.
6. The user approves the Output and the criteria.

## Blockers

The implementation session decides what the lead session would not have to record in Plan or Knowledge, and stops at anything it would. That one test separates the two:

| The session decides | The session stops at |
| --- | --- |
| Names, file layout, internal algorithms, test structure | The choice of a framework, a storage format, or an external service |
| A small utility library, noted under Deviations in the report | A change to the Goal, the Output, the Completion criteria, or the scope |
| | The shape of an API or behavior that other nodes use |
| | Edits outside the node's scope |
| | Verification that keeps failing for a cause outside the node |

- When unsure, pick the option that is easy to reverse and list it under Uncertain parts; stop when reversing it would be costly.
- A blocker means the node was not ready. The session stops building at once and writes a `blocked` report; it neither decides nor records the question.

## Judging the result

Review has two parts:

| Who | Judges |
| --- | --- |
| The user | The output: whether it meets the criteria, and whether the result is satisfying |
| The lead session agent | The code: the automated checks pass, the scope holds, nothing outside it changed, the Interface matches, and the project's rules are followed |

The user does not read the code, so the agent keeps broken code from merging. Anything the user dislikes in the output is a spec gap: add it to the node, ask for the fix, and add a Spec gap line to Record so later blackbox leaves are written better.
