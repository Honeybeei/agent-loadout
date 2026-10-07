---
canonical_for:
  - Collaborative node template
  - Collaborative implementation
managed_by: dev-framework
---

# Collaborative Nodes

A collaborative leaf is implementation the user shapes together with the agent in the lead session. The user may review each slice, change direction, or write the code while the agent guides and reviews. Its content changes often, so its form is free. The frame, status, and how decisions are recorded are defined in [Plan documentation](../plan-documentation.md).

## Template

```markdown
## Goal
<What to achieve and why>

<Free-form body: criteria, sketches, notes, questions, decisions — whatever helps the work>

## Record
- Implemented: <what was built>, <evidence such as checks and the merge>
```

One rule binds the body: decisions and new topics that must reach Knowledge or the Plan are written in the node as they come, in any form. Finishing collects them from the node. The lead session works on the leaf's branch in the main checkout, as [Git workflow](../git-workflow.md#implementation-branches) says.

## Finishing

When the user confirms the work is done, merge it as [Git workflow](../git-workflow.md#integration) says. The merge commit also carries:

1. every line of the node accounted for, as Plan documentation's [Recording decisions](../plan-documentation.md#recording-decisions) says;
2. planning for the goals the results affect, as [Goal nodes](goal.md#planning) says;
3. the leaf set `done` with an Implemented line in Record.

## Size

One feature that one or two sittings can finish. The main checkout stays on the leaf's branch until it merges, so a long leaf keeps interrupting other lead-session work.
