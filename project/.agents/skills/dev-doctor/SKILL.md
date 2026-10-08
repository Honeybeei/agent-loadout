---
name: dev-doctor
description: Bring this repository in line with its copy of the Dev Framework. Finish an adoption, migrate records after an update, fix what its scripts find, or run a defect or polish review, with approval.
disable-model-invocation: true
---

# Dev Doctor

Bring this repository in line with its copy of the Dev Framework. The user brings a newer Framework in with `dev-framework apply`; this skill does what needs judgment: finishing an adoption, migrating records written for an earlier Framework, and checking the project against the rules. Diagnosis, script checks, and reviews change nothing but the review state, `.dev/review.jsonl`, and the review plan in `.tmp/review/`; every other change waits for a proposal the user approves.

Scripts find every rule break they can, each with its fix. Reviews judge the rest: a defect review finds what could make a reader or agent act wrongly, and a polish review what only improves the form. The review state remembers which documents held, so a review judges only what is new or changed.

Run the scripts from the project root; `<scripts>` is `.agents/skills/dev-framework/scripts`.

| Purpose | Command |
| --- | --- |
| Script findings, with fixes | `bun <scripts>/check.ts .`, or `--group <id>,<id>` |
| Plan a review | `bun <scripts>/review.ts . <defect\|polish>`; `--fresh` judges documents that held too |
| Keep the review state | `bun <scripts>/findings.ts . <add\|set\|answer\|summary\|show>` |
| Check the Plan and Knowledge, and write the map and index | `bun <scripts>/map.ts .` |

## 1. Diagnose

- Confirm the working directory is the Git top level and the main checkout: the first entry of `git worktree list`. In a Framework project, one with `dev.yaml`, also confirm the branch is `main`, because only the lead session edits Plan and Knowledge there. Otherwise, say so and stop; while a collaborative leaf is open, say to run dev-doctor at a slice boundary, when the main checkout is back on `main`.
- Run the script checks, and continue by state:

| State | Meaning | Continue with |
| --- | --- | --- |
| `not adopted` | No `dev.yaml` | [Adopt](references/adopt.md), then step 4 |
| `updated` | `git status` lists `.dev/framework.json`: an apply is not committed yet | [Update](references/update.md), then step 4 |
| `current` | Otherwise | Step 2 |

## 2. Menu

Show the script finding counts by group, and offer these, recommending the first that applies:

| Choice | Recommend when |
| --- | --- |
| Continue with the proposed findings | `findings.ts summary` lists some outside `in_progress` leaves |
| Fix the script findings | Any remain that the user has not chosen to keep |
| Defect review | No other script findings remain |
| Polish review | The defect fixes are committed, and no defect is `proposed` outside `in_progress` leaves |

A review covers every document that has not held at its current content and rules; `--fresh` covers every document. Before running it, show its plan from `review.ts`: the documents and batches.

## 3. Check

For script findings, run the script checks of every group; their messages are the proposal. For a review:

1. Run `review.ts` for the plan.
2. Judge each batch: in parallel with subagents when the harness has them, one batch each, or else in turn. Give each judge only this, filled in: "Follow Judge in `.agents/skills/dev-framework/review.md` in `<project root>` for batch `<n>`."
3. Pass each judge's text to `findings.ts add <n>` unchanged, on standard input. When it refuses the text, complete it from the judge's text, or ask the judge again, and add it again.
4. Show `findings.ts summary`.

## 4. Propose

After Adopt or Update, propose what the reference describes in one short list. Otherwise:

- For script findings, propose the fixes their messages give, by group. When a fix needs judgment, such as which document a moved paragraph belongs in, recommend a value for each case. A finding that a row of [Migrations](references/update.md#migrations) covers takes that row's migration.
- For a review, the summary is the proposal. Ask each finding with a Decision first, one at a time, as [grilling](../grilling/SKILL.md) does, and record each answer with `findings.ts answer`. Then ask for approval of the rest by rule, by id, or for all. Mark every finding the user does not approve `declined` with `findings.ts set`, so later reviews skip it.
- Propose the fixes for an `in_progress` leaf for after it finishes, and leave its review findings `proposed`; the next review reports them again: a blackbox leaf belongs to its implementation session until review merges or reopens it, and an explore or collaborative leaf to the lead session until it finishes, as [Development workflow](../../../knowledge/dev-framework/workflow.md#sessions) says.
- List existing material that could later become Plan or Knowledge as later work; do not convert it now.

Then wait for approval.

## 5. Apply

1. Work on the current branch, which step 1 confirmed, and create no other branch.
2. Apply only what the user approved. For a review finding, write the exact text its fix or answer describes, keeping every condition and link of the text it replaces, and mark it `applied`.
3. After Adopt or Update, run the diagnosis again, and return to step 4 with any finding the approval did not cover. After fixes, run the [Commit gate](../dev-framework/review.md#commit-gate), which repairs at once a defect in text the fixes wrote; propose any other new finding at step 4. After two rounds in a row, stop and report what remains. Run the checks `AGENTS.md` names only when a fix changed a file other than Markdown.
4. Show a short summary of the changes, the repairs, and the commit message, and ask whether to commit: the message the reference names, or `chore: conform to the Dev Framework` for fixes. When the commit changes Knowledge that a dispatched blackbox leaf relies on, the question also follows [Changing Knowledge while blackbox leaves run](../../../knowledge/dev-framework/workflow.md#changing-knowledge-while-blackbox-leaves-run). Commit by path: the Framework-managed material with the `.claude/skills` link and `.dev/framework.json`, the map, the Knowledge index, the review state, and the approved fixes with their repairs. Leave every other change uncommitted.
5. Return to step 1, which leads to the menu with the remaining counts. When the user is done, follow [dev-next](../dev-next/SKILL.md).

## Authority

| Before approval | After approval | Always separate |
| --- | --- | --- |
| Reading, including subagents; the check, review, and findings scripts; the map script with `--check` | The approved changes, and repairs of defects they introduced | Commits, pushes; moving or deleting project files the proposal did not name |
