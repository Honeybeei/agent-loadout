---
name: resolve-feedback
description: Resolve loadout-feedback reports in the agent-loadout repository. Read them, grill the user until each problem and its fix are clear, then apply and publish the change. Takes report files, a directory of reports, or pasted report text.
disable-model-invocation: true
---

# Resolve Feedback

Turn feedback reports into changes to this repository's material. Each report records friction that appeared in another project; this skill finds its cause, settles the fix with the user, and applies it. Handle every report as [AGENTS.md](../../../AGENTS.md#feedback-reports) says.

## 1. Collect

- The arguments are report files, directories whose `*.md` files, not their subdirectories, are all reports, or report text the user pasted, often from another machine. Read each report completely.
- When a path cannot be read, a pasted report is cut off, or a text is not in the `loadout-feedback` report format, say so. Ask for the missing text, or leave the report out.

## 2. Triage

Investigate before asking anything: finding the facts is your job.

- Trace each report's Area to its source.
- Check each report's Kind: a `missing` report that quotes a rule covering its case is `unapplied`, and its cause is why that rule did not reach the agent.
- Check whether the source changed after the report's agent-loadout commit, with `git log --oneline <commit>..HEAD -- <source paths>`, and read those changes; they may already solve the problem.
- Find why the material is the way it is: the commits that shaped it (`git log -- <path>`, `git log -S '<phrase>'`) and any design notes in `.tmp/design/`.
- Group reports that share a cause. Note reports that contradict each other or a settled decision.

Show an overview with one row per group: its reports, Area, Kind, status (still present, possibly solved, or needs information), and a recommended order. Ask the user to confirm or change the order.

## 3. Grill

Work one group at a time with [grilling](../../../skills/dev-framework/project/.agents/skills/grilling/SKILL.md): one question per round, each with your recommended answer.

- Start with the problem, not the fix: confirm what went wrong and why, until the cause is clear.
- When the fix would change a deliberate decision, show the decision's original reason beside the report's evidence, and let the user judge whether the new evidence outweighs it.
- Recommend the first fix in [Keeping rules small](../../../AGENTS.md#keeping-rules-small) that solves the cause, in the document or skill that owns it.
- When grilling runs past a few questions, record settled decisions in `.tmp/design/<topic>.md` as you go.

A group is settled when its cause, its fix, and the files to change are agreed. Summarize the settled groups and the groups set aside with their reasons, and wait for the user's confirmation.

## 4. Apply

1. On `main`, create `work/<short-purpose>` before the first edit.
2. Make the agreed changes, one group at a time, following this repository's AGENTS.md: update the README and every link a change affects, and keep skills harness-neutral.
3. Run `bun run lint`, `bun run typecheck`, and `bun run test`, and fix the failures the change caused.
4. Show the result per group: the files changed, the size report [Keeping rules small](../../../AGENTS.md#keeping-rules-small) asks for, and the check results.

## 5. Publish

Ask once whether to commit, merge into `main` with `--no-ff`, push, and apply with `bun run apply all`. Offer one commit per group, in the style of recent commits, with a `Feedback: <report file name>` line in the body for each report it resolves. Carry out the steps the user approves.

## 6. Close

List the reports resolved, the reports set aside with their reasons, and the projects that need `dev-doctor` to receive a Framework change. Reports in other projects are the user's to delete; delete one inside this repository's `.tmp/` only when the user agrees.
