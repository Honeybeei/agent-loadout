---
canonical_for:
  - Explore node template
  - Wayfinding
managed_by: dev-framework
---

# Explore Nodes

An explore leaf is wayfinding: it turns low-resolution ideas, concepts, flows, and designs into decisions, so the goal it serves can be planned. It produces decisions, not deliverables; planning and implementation come after it. The frame, status, and how decisions are recorded are defined in [Plan documentation](../plan-documentation.md).

## Template

```markdown
## Goal
<The destination: what must be decided, and which planning it enables>

## Notes
- <Optional: skills to consult, standing preferences, and links to the Knowledge this leaf starts from>

## Tickets
- [grilling] <Question for the user>
- [research] <Question the agent can answer by investigating>
- [prototype] <Question that needs a rough artifact to react to>
- [task] <Work that must happen before a question can be answered> (blocked by: <ticket>)

## Decisions so far
- <Question gist> → <answer gist>

## For the Plan
- <A topic with its own destination, or other input for planning>

## Not yet specified
- <In scope, but cannot be phrased as a question yet>

## Out of scope
- <Ruled out of this explore, and why>

## Record
- Finished: <where the decisions went>, <what planning changed>
```

Omit a section while it is empty, except Goal and Record. Each ticket is one line with its tag, and `(blocked by: <ticket>)` when it waits for another.

## Destination

The Goal is the destination, and it fixes the scope. Name it first; every ticket serves it. An explore leaf with two unrelated destinations is two explore leaves.

## Fog or ticket

Beyond the tickets lies fog: questions you can tell are coming but cannot pin down yet. The test is whether the question can be stated precisely now, not whether it can be answered now.

- Make it a ticket when it can be stated precisely, even if it is blocked.
- Put it under Not yet specified when it cannot. Do not slice fog into guessed tickets; one patch may later become several tickets, or none.
- A question needed to reach a leaf's destination is a ticket or fog in that leaf, whoever raises it: the leaf itself, another leaf's finishing, or planning. Scope handed to a leaf extends its Goal. A topic with its own destination goes to For the Plan and later becomes its own explore leaf.
- Work beyond the destination goes to Out of scope. It never becomes a ticket; it returns only as a new explore leaf with a new destination.
- Notes hold facts and standing preferences, never a question.

## While running

- When a ticket is resolved, remove it from Tickets and add its line to Decisions so far at once, so a session end loses nothing.
- When an answer makes fog specific, turn it into tickets and remove it from Not yet specified.
- When a later decision reverses an earlier one, replace the earlier line.

## Finishing

An explore leaf finishes when everything its Goal names is decided and no question is left anywhere in it, so Tickets and Not yet specified are empty. When the user ends it earlier, move what remains to For the Plan or Out of scope first.

1. Account for every line of the node, as Plan documentation's [Recording decisions](../plan-documentation.md#recording-decisions) says.
2. Plan the goals the results affect, applying For the Plan, as [Goal nodes](goal.md#planning) says.
3. Set the leaf `done` with a Finished line in Record.
