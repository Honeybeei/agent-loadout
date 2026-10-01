---
name: dev-blackbox-implement
description: Implement a dispatched blackbox leaf of a Dev Framework project's Plan inside its worktree, and write the report the lead session reviews. Takes a blackbox leaf name.
disable-model-invocation: true
---

# Dev Blackbox Implement

Build one dispatched blackbox leaf in its worktree, verify it, and end with a report for review. The user delegated the whole leaf: decide its internals yourself, deliver the output the node describes, and stop only at a blocker. The session writes code and other files within the leaf's scope, and never edits `plan/` or `knowledge/`, where the lead session records decisions.

Before starting, read [Blackbox nodes](../../../knowledge/dev-framework/plan-documentation/blackbox.md) for the contract and the blockers, [Development workflow](../../../knowledge/dev-framework/workflow.md#reports) for the report format, and [Git workflow](../../../knowledge/dev-framework/git-workflow.md#commits) for slice commits.

## 1. Orient

- Confirm the project root has `dev.yaml` and `knowledge/dev-framework.md`. Otherwise, suggest `dev-doctor` and stop.
- Confirm the session is in the leaf's worktree: the current branch is `impl/<node>`, and this checkout is not the first entry of `git worktree list`. Otherwise, say so and stop; `dev-blackbox-dispatch` creates the worktree.
- Read the node. It must be an `in_progress` blackbox leaf with a `Dispatched` Record line.
- Read its Output, Completion criteria, Interface, Out of scope, Relies on, and Verification, its ancestors' Goal sections, the glossary if it exists, the relevant code, and the root `AGENTS.md`. Run the setup commands `AGENTS.md` names for a new worktree.
- When the main checkout has `.tmp/reviews/<node>.md` newer than this worktree's `.tmp/reports/<node>.md`, this is a fix round: read the findings and address them in step 2.

## 2. Build

- Split the leaf, or the review findings, into thin vertical slices: each one cuts through every layer it needs and can be verified on its own.
- Where the project has tests, write a failing test for a slice before building it.
- Build every slice, and commit each verified slice.
- Match the Output exactly: it is what the user checks.
- Name things with the glossary's terms.
- At a blocker, as Blackbox nodes defines it, stop building at once and go to step 4 with a `blocked` report. Do not decide or record the question.

## 3. Verify

1. Commit all finished work, then merge `main` into `impl/<node>`. Resolve conflicts in favor of both sides' intent; a conflict that needs a recorded decision is a blocker.
2. Run the node's Verification, check each Completion criterion against the output, and run the checks `AGENTS.md` names. Keep each command and its result for the report, and say where the user can see the output.
3. Fix failures within the leaf's scope and verify again. Failures that keep coming from outside the leaf are a blocker.

## 4. Report

1. Write `.tmp/reports/<node>.md` in the format Development workflow gives, replacing any earlier report. Record the `main` commit you merged under Based on.
2. Confirm that `git status` shows no uncommitted changes, apart from work a blocker interrupted, which the report names under Blocker.
3. Tell the user the result and the next step: "Report written (<result>). In the lead session, invoke dev-blackbox-review with <node>."

Keep the session open: review fixes happen here, in a new fix round.

## Authority

| Without asking | Ask first | Always separate |
| --- | --- | --- |
| Editing code, tests, configuration, and other files in the leaf's scope inside this worktree; internal decisions the blockers leave to the session; running the setup commands and checks `AGENTS.md` names; slice commits; merging `main` into `impl/<node>`; writing the report | Nothing: a question that needs the user is a blocker | Editing `plan/` or `knowledge/`; writing outside this worktree; merging into `main`; pushes; other installs; external services; destructive or hard-to-reverse actions; changes affecting security or cost |
