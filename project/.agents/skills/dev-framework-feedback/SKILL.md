---
name: dev-framework-feedback
description: Report a problem or improvement in the Dev Framework, such as a rule, a skill, or the dev-framework CLI, as a file in this directory's .tmp/feedback/ for the dev-framework session to act on.
disable-model-invocation: true
---

# Dev Framework Feedback

Record friction with the Dev Framework while it is fresh, so the session that maintains the dev-framework repository can fix it from the report alone, even on another machine. The Dev Framework is everything `dev-framework apply` puts in a project, such as its rules and the skills in `.agents/skills/`, and the `dev-framework` command itself.

This skill only writes reports. It changes no other file and fixes nothing.

## 1. Pin down the problem

- Take the problem from the arguments and the conversation. When it is still unclear what went wrong or what the user wants instead, ask one question.
- Give each unrelated problem its own report, so each can be fixed and discarded on its own.
- Find the material responsible, as precisely as you can, and name it by its source in the dev-framework repository, which the reader can open, with the section or the step:
  - material in a project: `project/` followed by its path in the project, such as `project/knowledge/dev-framework/git-workflow.md` for `knowledge/dev-framework/git-workflow.md`, or step 2 of `project/.agents/skills/handoff/SKILL.md`;
  - the `dev-framework` command: `cli/`, with the command and its output.

  Quote the text at fault. The path of the copy in the project may follow as a label.
- Choose the kind: `bug` (it does something wrong), `friction` (it works, but costs effort), `unclear` (its wording led to a wrong reading), `missing` (no rule or step covers the situation), `unapplied` (a rule or step covers it, but the agent did not apply it), or `proposal` (an improvement without a failure). For `unapplied`, name in Area both the rule and the skill step the agent was following when the rule should have applied, and say whether that step links the rule.

## 2. Collect evidence

- Write for a reader without the project. The dev-framework session may run on another machine and sees only the report's text. Put every fact the case needs into the report: quote the rule text, quote the relevant file excerpts, and describe the project's situation in a few sentences. A project path, commit, branch, or local file appears only as a label, with its meaning next to it.
- Quote the user's words about the problem verbatim, in their language.
- Record what happened, in order: the request, what the agent did, the commands with the relevant lines of their output, and the files involved, quoted where they matter. Keep facts apart from interpretation.
- Leave out secrets, credentials, and content unrelated to the problem.
- Record the Framework version the project received: `source.commit` and `source.dirty` in `.dev/framework.json` at the Git top level, or `unknown` when it cannot be read.

## 3. Write the report

1. When the session cwd is inside a Git repository, confirm that `git check-ignore -q .tmp/feedback/probe` succeeds. Otherwise, say that `.tmp/feedback/` is not ignored by Git, and stop without writing.
2. Write each report in English, in the format below, to `.tmp/feedback/<UTC time as YYYY-MM-DDTHH-MM-SSZ>-<short kebab-case gist>.md` in the session cwd.
3. Reread each report as the dev-framework session will: without the project, this conversation, or this machine. Write in anything the report leans on but does not contain.
4. Show each report's absolute path and its full content, and say: "Paste this report into the dev-framework session, or give it the path when both run on the same machine."

## Report format

```markdown
# Feedback: <one-line gist>

- Created: <UTC time>
- Project: <what the project is, in one line; the reader cannot open it>
- Harness: <harness and model, as far as known>
- Framework commit: <commit>, <clean or dirty>
- Area: <the material's source path in dev-framework, with its section or step>
- Kind: <bug | friction | unclear | missing | unapplied | proposal>

## Summary
<Two or three lines>

## What happened
<The sequence, with evidence>

## User's words
> <Verbatim quote>

## Expected
<What should have happened instead>

## Impact
<What it cost, and how often it happens, as far as known>

## Proposal
<Optional: an idea for a fix, marked as a proposal; the dev-framework session decides>
```

## Authority

| Without asking | Always separate |
| --- | --- |
| Reading; writing reports in `.tmp/feedback/` | Any other file change; commits; changing Framework material |
