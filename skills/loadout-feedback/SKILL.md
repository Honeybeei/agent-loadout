---
name: loadout-feedback
description: Report a problem or improvement in agent-loadout material, such as the Dev Framework, a skill, or the global prompt, as a file in this directory's .tmp/feedback/ for the agent-loadout session to act on.
disable-model-invocation: true
---

# Loadout Feedback

Record friction with agent-loadout material while it is fresh, so the session that maintains agent-loadout can fix it from the report alone. Agent-loadout material is everything its apply script installed: the global prompt, the harness skills such as `dev-doctor` and `handoff`, and the Dev Framework, including the rules and skills it copies into projects.

This skill only writes reports. It changes no other file and fixes nothing.

## 1. Pin down the problem

- Take the problem from the arguments and the conversation. When it is still unclear what went wrong or what the user wants instead, ask one question.
- Give each unrelated problem its own report, so each can be fixed and discarded on its own.
- Find the material responsible, as precisely as you can: the file and section, or the skill and step. Name Framework copies by their path in the project, such as `knowledge/dev-framework/git-workflow.md` or step 2 of `.agents/skills/dev-next/SKILL.md`, and other material by its name, such as the global prompt's Collaboration section.
- Choose the kind: `bug` (it does something wrong), `friction` (it works, but costs effort), `unclear` (its wording led to a wrong reading), `missing` (no rule or step covers the situation), or `proposal` (an improvement without a failure).

## 2. Collect evidence

- Quote the user's words about the problem verbatim, in their language.
- Record what happened, in order: the request, what the agent did, the commands with the relevant lines of their output, and the files involved. Keep facts apart from interpretation.
- Leave out secrets, credentials, and content unrelated to the problem.
- Record the versions, and write `unknown` for anything you cannot read:
  - the agent-loadout commit applied to this harness: `source.commit` and `source.dirty` in `<this skill's directory>/../.agent-loadout.json`;
  - for a Framework project, one whose root has `dev.yaml`, the first line of `bun <this skill's directory>/../dev-framework/scripts/check.ts .`, which says whether its Framework copy is `current` or `outdated`.

## 3. Write the report

1. When the session cwd is inside a Git repository, confirm that `git check-ignore -q .tmp/feedback/probe` succeeds. Otherwise, say that `.tmp/feedback/` is not ignored by Git, and stop without writing.
2. Write each report in English, in the format below, to `.tmp/feedback/<UTC time as YYYY-MM-DDTHH-MM-SSZ>-<short kebab-case gist>.md` in the session cwd.
3. Show each report's absolute path and Summary, and say: "Give this path to the agent-loadout session."

## Report format

```markdown
# Feedback: <one-line gist>

- Created: <UTC time>
- Project: <session cwd>
- Harness: <harness and model, as far as known>
- agent-loadout commit: <commit>, <clean or dirty>
- Framework state: <current | outdated | not a Framework project | unknown>
- Area: <the material and its location>
- Kind: <bug | friction | unclear | missing | proposal>

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
<Optional: an idea for a fix, marked as a proposal; the agent-loadout session decides>
```

## Authority

| Without asking | Always separate |
| --- | --- |
| Reading; running the check script; writing reports in `.tmp/feedback/` | Any other file change; commits; changing agent-loadout material |
