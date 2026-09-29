---
name: dev-implement
description: Implement a dispatched node of a Dev Framework project's Plan inside its worktree, in blackbox or collaborative mode, and write the report the lead session reviews. Takes a node name and, optionally, blackbox or collaborative.
disable-model-invocation: true
---

# Dev Implement

Build one dispatched node in its worktree, verify it, and end with a report for review. This is the implement flow: the session writes code and other files within the node's scope, and never edits `plan/` or `knowledge/`, where the main flow records decisions.

Before starting, read [Development workflow](../../../knowledge/dev-framework/workflow.md) for the modes, blockers, and the report format, and [Git workflow](../../../knowledge/dev-framework/git-workflow.md#commits) for slice commits.

## 1. Orient

- Confirm the project root has `dev.yaml` and `knowledge/dev-framework.md`. Otherwise, suggest `dev-doctor` and stop.
- Confirm the session is in the node's worktree: the current branch is `impl/<node>`, and this checkout is not the first entry of `git worktree list`. Otherwise, say so and stop; `dev-dispatch` creates the worktree.
- Read the node. It must be `in_progress` with a `Dispatched` Record line. Take the mode from the arguments, or from that line.
- Read what the node relies on, its Completion criteria, Verification, and Out of scope, its ancestors' Goal sections, the glossary if it exists, the relevant code, and the root `AGENTS.md`. Run the setup commands `AGENTS.md` names for a new worktree.
- When the main checkout has `.tmp/reviews/<node>.md` newer than this worktree's `.tmp/reports/<node>.md`, this is a fix round: read the findings and address them in step 2.

## 2. Build

- Split the node, or the review findings, into thin vertical slices: each one cuts through every layer it needs and can be verified on its own.
- Where the project has tests, write a failing test for a slice before building it.
- Blackbox: build every slice, and commit each verified slice. Collaborative: propose each slice, build it, show its diff and check results, and commit it when the user approves.
- Name things with the glossary's terms.
- At a blocker, as Development workflow defines it, stop building at once and go to step 4 with a `blocked` report. Do not decide or record the question.

## 3. Verify

1. Commit all finished work, then merge `main` into `impl/<node>`. Resolve conflicts in favor of both sides' intent; a conflict that needs a recorded decision is a blocker.
2. Run the node's Verification, check each Completion criterion, and run the checks `AGENTS.md` names. Keep each command and its result for the report.
3. Fix failures within the node's scope and verify again. Failures that keep coming from outside the node are a blocker.

## 4. Report

1. Write `.tmp/reports/<node>.md` in the format Development workflow gives, replacing any earlier report. Record the `main` commit you merged under Based on.
2. Confirm that `git status` shows no uncommitted changes, apart from work a blocker interrupted, which the report names under Blocker.
3. Tell the user the result and the next step: "Report written (<result>). In the lead session, invoke dev-review with <node>."

Keep the session open: review fixes happen here, in a new fix round.

## Authority

| Without asking | Ask first | Always separate |
| --- | --- | --- |
| Editing code, tests, configuration, and other files in the node's scope inside this worktree; running the setup commands and checks `AGENTS.md` names; blackbox slice commits; merging `main` into `impl/<node>`; writing the report | Collaborative slice commits | Editing `plan/` or `knowledge/`; writing outside this worktree; merging into `main`; pushes; other installs; external services; destructive or hard-to-reverse actions; changes affecting security or cost |
