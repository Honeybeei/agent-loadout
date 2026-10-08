# Review

How to run a review of what scripts cannot judge, and how to judge one batch of it. Run the scripts from the project root; `<scripts>` is `.agents/skills/dev-framework/scripts`. The review state, `.dev/review.jsonl`, keeps the findings, the leads judged, and the documents that held. Only the scripts write it.

## Commit gate

Before a commit on `main` that changes Plan or Knowledge, as [Git workflow](../../../knowledge/dev-framework/git-workflow.md#commits) requires:

1. Run `bun <scripts>/check.ts .`, and fix what it reports in the files the change wrote.
2. Run `bun <scripts>/review.ts . defect --changed-since HEAD`, which plans what the change wrote.
3. Have each batch judged as [Judge](#judge) says: by a subagent each when the harness has them, or else in turn. Pass each judge's text unchanged to `bun <scripts>/findings.ts . add <batch>` on standard input; when it refuses the text, complete it from the judge's text or ask the judge again.
4. Fix each defect in text the change wrote, keeping every condition and link, then run `findings.ts set applied <id>`. Ask the user each finding with a Decision, one at a time, and record the answer with `findings.ts answer <id> <answer>` before applying it. Other findings stay proposed for dev-doctor.
5. When the fixes wrote new text, repeat once from step 1. Commit `.dev/review.jsonl` with the change.

## Judge

You are given a batch number. Change nothing; return your findings as text.

1. Print the batch: `bun <scripts>/review.ts . --batch <n>`. It lists each document type's rule sections, and for each document what to judge, notes, and leads.
2. Read every rule section listed, in the project's copies. Read each document whole, even when you judge only some lines. Read other files only to check what a document claims.
3. Judge what each document's line says against every rule of its type. A goal's child lines are there for judging its planning. Do not report a finding listed as declined.
4. Give every lead a verdict. A lead marks a spot to decide; it is a finding only when you judge that it breaks a rule.

| Review | What to report | How many |
| --- | --- | --- |
| `defect` | Text that makes a reader or agent who follows it act wrongly or miss something, such as a false statement, an ambiguity, a lost condition, rationale, or link, or content held by the wrong owner | Every one you can show, not a sample |
| `polish` | A change that only improves the form | Up to three per document, those that most help a reader |

- Report one finding per problem. When a problem repeats across lines, report it once and list the lines.
- Skip what `bun <scripts>/check.ts .` reports, and text inside the Framework-managed sections. Report findings in a leaf in progress like any other.
- A defect names who, following the text, does what wrong, and the evidence that shows it. Without both, it is polish.
- When the fix needs the user's choice, such as between two meanings or whether to drop an approved decision, add a Decision.

Return this, numbered from 1, with the review in place of `defect`:

```markdown
## 1 · defect

- File: <path>:<line>
- Quote: <the exact text, one sentence at most>
- Rule: knowledge/dev-framework/<document>#<section>
- Problem: <one sentence>
- Failure: <who, following the text, does what wrong; defect only>
- Evidence: <the quoted document, code, or commit that shows it; defect only>
- Fix: <one line: the change; when content moves, the document and section it moves to>
- Decision: <only when the fix needs the user's choice: the question, the options, your recommendation>

## Leads

- <lead id>: finding <number>, or not a finding: <reason>

## Verdicts

- <path>: holds, or findings <numbers>
```
