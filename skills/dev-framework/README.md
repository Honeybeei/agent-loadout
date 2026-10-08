# Dev Framework

Dev Framework is a method for managing a software project with AI agents. This directory is its source. It is installed in the harness only so that `dev-doctor` can copy it into projects and check them against it; agents work with the copies inside each project.

## What a project receives

`project/` mirrors a project root. Its contents are copied into each Framework project as managed material:

| Source | Destination in the project |
| --- | --- |
| `project/knowledge/dev-framework.md` and `project/knowledge/dev-framework/` | The rules index and the rules |
| `project/README.section.md`, `project/AGENTS.section.md` | Managed sections in root `README.md` and `AGENTS.md` |
| `project/.agents/skills/` | The workflow skills and the skills they use |

The copy step also links `.claude/skills` to `../.agents/skills` in the project. Links inside `project/` resolve the same way in the source and in a project. Start at [Dev Framework rules](project/knowledge/dev-framework.md); the list of managed material is in [Project structure](project/knowledge/dev-framework/project-structure.md#framework-managed-material).

`project/.agents/` is a hidden directory, so harnesses that scan this source for skills do not load the project skills from here.

## Changing the Framework

1. Edit the files here, then run `bun run lint`, `bun run typecheck`, and `bun run test` at the repository root.
2. Apply to the harnesses: `bun run apply all`.
3. Run `dev-doctor` in each Framework project. A project keeps its current Framework version until then.

## Scripts

The project scripts live in `project/.agents/skills/dev-framework/scripts/`, beside [review.md](project/.agents/skills/dev-framework/review.md), which says how to run and judge a review.

| Script | Runs in | Purpose |
| --- | --- | --- |
| [scripts/sync.ts](scripts/sync.ts) | The harness, for `dev-doctor` | Copies managed material into a project; `--check` previews |
| [scripts/doctor.ts](scripts/doctor.ts) | The harness, for `dev-doctor` | Reports whether a project is adopted and current, and, with `--group`, the findings of `check.ts` and the leftovers of earlier Frameworks |
| `map.ts` | Each project | Checks the Plan and the Knowledge layout, and generates `plan/map.md`, the browser view `.tmp/plan/map.html`, and `knowledge/README.md`; `--check` reports what is stale |
| `check.ts` | Each project | Every rule break a script can find, by group, with its fix |
| `review.ts` | Each project | Plans a defect or polish review in batches, each with the rule sections its documents are judged against and the leads scripts found; skips what held and has not changed |
| `findings.ts` | Each project | Records judges' reports in the review state, `.dev/review.jsonl`, and lists, sets, and answers findings |
| `state.ts` | Each project | Reads and writes the review state |

A rule that a script can test without false alarms is checked by one. A check that runs in `map.ts` catches a mistake when a node or Knowledge document is written, because every workflow skill regenerates the map; it also blocks its output, so it belongs there only when an edit can always fix it. Other checks run in `check.ts`, at the commit gate and when `dev-doctor` runs. A pattern a script can find but only judgment can settle becomes a lead in `review.ts`.

The scripts need only Bun. Their tests live in `scripts/` here, outside `project/`, so they are not copied into projects:

```bash
bun test skills/dev-framework/scripts
```
