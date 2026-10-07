# Review

How to judge one batch of a defect or polish review. You are given the project root, the review, the batch number, and sometimes a commit. Change nothing; return your findings as text. `<scripts>` is `../../dev-framework/scripts/`, relative to this file.

## Judge

1. Print the batch: `bun <scripts>/review.ts <project root> <review> --batch <n>`, adding `--changed-since <commit>` when you were given one. It lists the rule sections and the documents, with notes for each.
2. Read every rule section listed, in the project's copies. Read each document whole. Read other files only to check what a document claims, such as a linked document or the work a node records.
3. Test each document against every rule in those sections. A lead marks a spot to decide; it is not a finding until you judge that it breaks a rule. A goal's child lines are there for judging its planning.

## Report

| Review | What to report | How many |
| --- | --- | --- |
| `defect` | Text that could make a reader or agent act wrongly or miss something, such as an ambiguity, a false statement, or a lost condition, rationale, or link; and content held by the wrong owner | Every one, not a sample |
| `polish` | A change that only improves the form | Up to three per document, those that most help a reader |

- Report one finding per problem. When a problem repeats across lines, report it once and list the lines.
- Skip what the scripts report, which `bun <scripts>/check.ts <project root> --group all` lists; the findings the batch lists as declined; and text inside the Framework-managed sections.
- Report findings in a leaf in progress like any other.

Return the findings in this form, numbered from 1, with the review you were given in place of `defect`:

```markdown
## 1 · defect

- File: <path>:<line>
- Quote: <the exact text, one sentence at most>
- Rule: knowledge/dev-framework/<document>#<section>
- Problem: <one sentence>
- Fix: <one line: the change to make; when content moves, the document and section it moves to>
```

End with `## Verdicts`: one line for each rule section the batch lists, saying `holds`, `n/a`, or the numbers of its findings.
