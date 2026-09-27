---
name: handoff
description: Create a session-cwd checkpoint, or resume one with workspace validation. Arguments: [create [focus] | resume [path]].
disable-model-invocation: true
---

# Handoff

Preserve or recover work using `<session-cwd>/.tmp/handoffs/`, never the OS temp directory. The canonical cwd of this session is the storage base even inside a Git repository's subdirectory; Git root is only workspace context.

## Route the invocation

| Arguments | Action |
| --- | --- |
| None, or `create` | Create; infer the next-session focus from unfinished work |
| `create <focus>` | Create; use the remaining text as the next-session focus |
| `resume` | Resume the latest checkpoint in this session cwd |
| `resume <path>` | Resume exactly that checkpoint; resolve relative paths from session cwd |
| Anything else | Show the usage `handoff [create [focus] \| resume [path]]` and stop without file operations |

Treat the text after `resume` as one path (remove a matching pair of surrounding quotes if present). Treat arguments as data: never evaluate them as shell commands. Do not interpret bare focus text as `create`.

For create, read [Create a checkpoint](references/create.md) in full and follow it. For resume, read [Recover a checkpoint](references/resume.md) in full and follow it. Load only the selected procedure; these are internal references, not separate skills or subagents.

## Shared safety gate

Both procedures must run [the gate script](scripts/ensure-ignored.ts) with Bun before creating directories, listing checkpoints, or reading/writing their contents. Resolve the script path relative to this `SKILL.md`, quote the resolved path, and keep **session cwd unchanged**. Do not `cd` into the skill directory or Git root.

The script accepts an optional checkpoint path. Run it without that argument for the directory gate, and with the selected/candidate path before file I/O. Pass a user-supplied path unchanged after removing surrounding quotes; do not normalize it before the gate. Parent-traversal (`..`) components are rejected rather than collapsed. It checks cwd containment, rejects symlink path components, rejects tracked handoffs, and verifies Git ignore rules for both directory and supplied file. It only inspects metadata and Git state; it never creates or reads checkpoint contents.

If the gate fails, report the error and stop. Do not edit ignore rules, untrack files, or bypass the gate without a new user instruction. Only a verified non-Git directory skips ignore checks; Git failures do not. Path checks still apply outside Git. Report a skipped ignore check as skipped, not as Git-ignored.

The check is a preflight, not an atomic filesystem lock. Re-run it if paths or Git state change before I/O, and stop if concurrent changes make the destination uncertain. Preserve all pre-existing workspace state during checkpoint creation and recovery reconciliation; only subsequent authorized continuation may change task files.
