# Create a checkpoint

Internal create procedure for [handoff](../SKILL.md). Follow the parent's routing and shared safety gate. Creation preserves context; it does not authorize implementation or publication of the recorded next action.

## 1. Establish the destination

Resolve canonical session cwd and run `../scripts/ensure-ignored.ts` with Bun, resolving that script relative to this reference's directory while keeping session cwd unchanged. Stop on failure. Use only `<session-cwd>/.tmp/handoffs/` as the destination; do not replace session cwd with Git root.

Capture one UTC second for both the document's `Created` value and filename prefix `YYYY-MM-DDTHH-MM-SSZ`. Infer focus when not supplied by `create <focus>`.

**Complete when:** the storage base, destination, focus, creation instant, and successful gate result (including any non-Git skip) are known.

## 2. Capture continuation state

Inspect the conversation and only the project artifacts needed to reconstruct the work. For Git worktrees, capture branch, abbreviated HEAD, and complete working-tree status before creating the handoff directory or file. Include every uncommitted change relevant to continuation, including changes elsewhere in the same repository when they affect this task.

Read [the checkpoint template](../assets/checkpoint.md) in full. Keep all headings and fill every section with verified facts, `None`, or `Not run`. Distinguish observed results from assumptions or unresolved questions.

- `Next-session focus` is the immediate emphasis; `Objective` is the overall desired outcome.
- `Next action` is one concrete executable first action, with a path or command where useful.
- Record completed work, remaining work, failed approaches, decisions, constraints, blockers, and risks that change continuation.
- `Validation` lists exact checks and observed results; use `Not run` when none ran.
- Record the canonical session cwd in the workspace snapshot. Paths in the document are relative to that cwd unless explicitly identified otherwise. Clearly label references outside it; do not silently broaden the next session's scope.
- Existing specs, plans, ADRs, issues, commits, and diffs remain authoritative. Link them by path or URL instead of copying them; include only continuation-critical context.
- Suggest only currently model-visible skills that materially help the next action, and explain why; otherwise use `None`.
- Redact credentials, tokens, API keys, private personal data, and other sensitive values. When necessary, record only the existence or location of a secret.

**Complete when:** every template section is accounted for, continuation-critical state is represented, and validation claims have evidence.

## 3. Write and verify

After the directory gate succeeds, create `.tmp/handoffs/` if absent. Select the first free sequence `001` through `999` for:

```text
.tmp/handoffs/YYYY-MM-DDTHH-MM-SSZ-NNN.md
```

Run the gate again with the candidate path as its sole argument before file I/O. Reserve the candidate with exclusive creation and write through that reserved file descriptor; do not use an overwriting write tool for reservation. Existing checkpoints are immutable. On a collision, try the next suffix and gate it again. If all suffixes for that second exist, capture a later UTC second, update `Created`, and restart at `001`.

Close the written file, re-run the gate with its path, and read it back completely. Verify that the file is non-empty, all template headings remain, filename and `Created` use the same instant, the next action is executable, and sensitive values are absent. If writing or verification fails, report the incomplete artifact and stop; do not describe it as a usable checkpoint.

**Complete when:** one new checkpoint has been exclusively created and verified; pre-existing files, branches, and index state remain unchanged.

## 4. Report

Report the cwd-relative checkpoint path, recorded next action, and gate outcome (Git-ignored or non-Git skip). Mention invoking `handoff resume` from the same cwd to recover it.

**Complete when:** the user has the checkpoint location and next step. Do not begin the recorded work during creation.
