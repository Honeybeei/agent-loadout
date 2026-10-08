---
name: dev-doctor
description: Bring the current repository in line with the installed Dev Framework. Diagnose it, adopt or update the Framework, fix what its scripts find, or run a defect or polish review, with approval.
disable-model-invocation: true
---

# Dev Doctor

Bring the current repository in line with the installed Dev Framework. Diagnosis, script checks, and reviews change nothing but the review state, `.dev/review.jsonl`, and the review plan in `.tmp/review/`; every other change waits for a proposal the user approves.

Scripts find every rule break they can, each with its fix. Reviews judge the rest: a defect review finds what could make a reader or agent act wrongly, and a polish review what only improves the form. The review state remembers which documents held, so a review judges only what is new or changed.

Run the scripts from the project root. `<framework>` is `<this skill's directory>/../dev-framework`, and `<scripts>` is the project's `.agents/skills/dev-framework/scripts`, which exists once sync has run. Reviews use the project's copies, so they match its rules.

| Purpose | Command |
| --- | --- |
| Diagnose | `bun <framework>/scripts/doctor.ts .` |
| Script findings, with fixes | `bun <framework>/scripts/doctor.ts . --group all`, or `--group <id>,<id>` |
| Plan a review | `bun <scripts>/review.ts . <defect\|polish>`; `--fresh` judges documents that held too |
| Keep the review state | `bun <scripts>/findings.ts . <add\|set\|answer\|summary\|show>` |
| Sync managed material | `bun <framework>/scripts/sync.ts .`, with `--check` to preview |
| Check the Plan and Knowledge, and write the map and index | `bun <scripts>/map.ts .` |

## 1. Diagnose

- Confirm the working directory is the Git top level and the main checkout: the first entry of `git worktree list`. In a Framework project, one with `dev.yaml`, also confirm the branch is `main`, because only the lead session edits Plan and Knowledge there. Otherwise, say so and stop; while a collaborative leaf is open, say to run dev-doctor at a slice boundary, when the main checkout is back on `main`.
- Run the diagnosis. It prints the state and the managed material findings. For a `current` project it also counts the script findings of each group; for a project that is `not adopted`, it lists what blocks adoption.
- Show whether the Framework is adopted and whether its managed material is current, then continue by state:

| State | Meaning | Continue with |
| --- | --- | --- |
| `not adopted` | No `dev.yaml` | [Adopt](references/adopt.md), then step 4 |
| `outdated` | Managed material differs from the installed Framework | [Update](references/update.md), then step 4. The menu follows the update, because reviews read the project's copy of the rules. |
| `current` | Managed material matches | Step 2 |

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

- For script findings, propose the fixes their messages give, by group. When a fix needs judgment, such as which document a moved paragraph belongs in, recommend a value for each case.
- For a review, the summary is the proposal. Ask each finding with a Decision first, one at a time, as the project's `.agents/skills/grilling/SKILL.md` does, and record each answer with `findings.ts answer`. Then ask for approval of the rest by rule, by id, or for all. Mark every finding the user does not approve `declined` with `findings.ts set`, so later reviews skip it.
- Propose the fixes for an `in_progress` leaf for after it finishes, and leave its review findings `proposed`; the next review reports them again: a blackbox leaf belongs to its implementation session until review merges or reopens it, and an explore or collaborative leaf to the lead session until it finishes, as [Development workflow](../dev-framework/project/knowledge/dev-framework/workflow.md#sessions) says.
- List existing material that could later become Plan or Knowledge as later work; do not convert it now.

Then wait for approval.

## 5. Apply

1. Work on the current branch, which step 1 confirmed, and create no other branch.
2. Apply only what the user approved. For a review finding, write the exact text its fix or answer describes, keeping every condition and link of the text it replaces, and mark it `applied`.
3. After Adopt or Update, run the diagnosis again, and return to step 4 with any finding the approval did not cover. After fixes, run the [Commit gate](../dev-framework/project/.agents/skills/dev-framework/review.md#commit-gate), which repairs at once a defect in text the fixes wrote; propose any other new finding at step 4. After two rounds in a row, stop and report what remains. Run the checks `AGENTS.md` names only when a fix changed a file other than Markdown.
4. Show a short summary of the changes, the repairs, and the commit message, and ask whether to commit: the message the reference names, or `chore: conform to the Dev Framework` for fixes. When the commit changes Knowledge that a dispatched blackbox leaf relies on, the question also follows [Changing Knowledge while blackbox leaves run](../dev-framework/project/knowledge/dev-framework/workflow.md#changing-knowledge-while-blackbox-leaves-run). Commit by path: the Framework-managed material, including the `.claude/skills` link, the map, the Knowledge index, the review state, and the approved fixes with their repairs. Leave every other change uncommitted.
5. Return to step 1, which leads to the menu with the remaining counts. When the user is done, follow the project's copy of `dev-next` at `.agents/skills/dev-next/SKILL.md`.

## Authority

| Before approval | After approval | Always separate |
| --- | --- | --- |
| Reading, including subagents; the doctor, check, review, and findings scripts; sync and the map script with `--check` | The approved changes, and repairs of defects they introduced | Commits, pushes; moving or deleting project files the proposal did not name |
