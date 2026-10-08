# Dev Framework

Dev Framework is a method for managing a software project with AI agents. This repository is its source, together with the `dev-framework` command, which copies the Framework into a project and updates it there.

A Framework project carries its own copy of the Framework: the rules in `knowledge/dev-framework/`, managed sections in its root README and AGENTS, and the skills in `.agents/skills/`. Any person or agent can read the rules and use the skills from that copy, without this repository or any harness configuration. A project keeps its Framework version until `dev-framework apply` runs in it.

## Supported harnesses

A harness finds the skills in the project: Pi and Codex read `.agents/skills/`, and Claude Code reads `.claude/skills`, which links to it. The skills and rules are written to read the same in each.

## Install

Requirements: Bun 1.3.14 and Git. Clone this repository anywhere, then run, on a clean `main`:

```bash
bun run setup   # or: bun setup
```

It pulls `main`, builds a snapshot of the command and the Framework in `${XDG_DATA_HOME:-~/.local/share}/dev-framework/`, and writes the `dev-framework` command into Bun's bin directory, `~/.bun/bin` unless `BUN_INSTALL` says otherwise, which Bun's installer puts on `PATH`. Run it again to update. The command applies the snapshot, so editing this checkout or switching its branch changes nothing until the next setup.

To try a change before merging it, run the command from this checkout in the project: `bun <this checkout>/cli/main.ts apply --allow-unmerged`.

## Usage

Run it at the root of the project's main checkout:

| Command | Effect |
| --- | --- |
| `dev-framework apply --check` | Show what would change, and write nothing |
| `dev-framework apply` | Update a Framework project, one with `dev.yaml`, to this Framework |
| `dev-framework apply --adopt` | Add the Framework to a repository without `dev.yaml` |
| `dev-framework --help` | Show the usage and every option |

Apply copies the managed material, links `.claude/skills` to `../.agents/skills`, records the source commit and the managed paths in `.dev/framework.json`, and regenerates the Plan map and the Knowledge index. It refuses to overwrite uncommitted work, and commits nothing. It also refuses, until the matching option overrides it:

- a source that is not a clean `main`, which only a run from this checkout can have (`--allow-unmerged`);
- a blackbox or collaborative leaf in progress, which runs under the current rules (`--allow-running`).

Then reload the harness, so it loads the new skills, and run `dev-doctor` in the project. It finishes an adoption, migrates records written for an earlier Framework, checks the project against the rules, and proposes the commit.

## What a project receives

`project/` mirrors a project root:

| Source | Destination in the project |
| --- | --- |
| `project/knowledge/dev-framework.md` and `project/knowledge/dev-framework/` | The rules index and the rules |
| `project/README.section.md`, `project/AGENTS.section.md` | Managed sections in root `README.md` and `AGENTS.md` |
| `project/.agents/skills/` | Every skill, and the scripts in `dev-framework/` that the skills use |

Links inside `project/` resolve the same way in the source and in a project. Start at [Dev Framework rules](project/knowledge/dev-framework.md); the list of managed material is in [Project structure](project/knowledge/dev-framework/project-structure.md#framework-managed-material).

| Skills | Purpose |
| --- | --- |
| `dev-next`, `dev-plan`, `dev-explore`, `dev-collaborate`, `dev-blackbox-dispatch`, `dev-blackbox-implement`, `dev-blackbox-review` | The workflow |
| `grilling`, `research`, `prototype` | Used by the workflow skills |
| `dev-doctor` | Finishes an adoption or update, and checks the project against the rules |
| `handoff` | Creates and resumes session checkpoints |
| `writing-for-agents` | Guides writing skills and agent instructions |
| `dev-framework-feedback` | Reports a problem with the Framework, for `resolve-feedback` in this repository |

## Layout

```
dev-framework/
├── .agents/skills/      Skills for working on this repository; not copied into projects
├── .claude/skills       Link to ../.agents/skills, for Claude Code
├── AGENTS.md            Rules for developing this repository
├── README.md
├── cli/                 The command's source and tests
├── project/             Mirrors a project root; copied into Framework projects
├── scripts/             The setup script, the size report, and repository tests
└── tests/               Tests of the scripts copied into projects
```

`.agents/skills/` holds `resolve-feedback`, which turns the reports `dev-framework-feedback` writes in projects into changes here, through grilling with the user. It also links `writing-for-agents` from `project/`, for writing skills here.

## Scripts

The project scripts live in `project/.agents/skills/dev-framework/scripts/`, beside [review.md](project/.agents/skills/dev-framework/review.md), which says how to run and judge a review.

| Script | Purpose |
| --- | --- |
| `map.ts` | Checks the Plan and the Knowledge layout, and generates `plan/map.md`, the browser view `.tmp/plan/map.html`, and `knowledge/README.md`; `--check` reports what is stale |
| `check.ts` | Every rule break a script can find, by group, with its fix, including leftovers of earlier Frameworks |
| `review.ts` | Plans a defect or polish review in batches, each with the rule sections its documents are judged against and the leads scripts found; skips what held and has not changed |
| `findings.ts` | Records judges' reports in the review state, `.dev/review.jsonl`, and lists, sets, and answers findings |
| `state.ts` | Reads and writes the review state |

A rule that a script can test without false alarms is checked by one. A check that runs in `map.ts` catches a mistake when a node or Knowledge document is written, because every workflow skill regenerates the map; it also blocks its output, so it belongs there only when an edit can always fix it. Other checks run in `check.ts`, at the commit gate and when `dev-doctor` runs. A pattern a script can find but only judgment can settle becomes a lead in `review.ts`.

The scripts need only Bun. Their tests live in `tests/`, outside `project/`, so they are not copied into projects.

## Changing the Framework

1. Edit the files here, then run `bun run lint`, `bun run typecheck`, and `bun run test`.
2. Merge into `main`, and run `bun run setup`.
3. Run `dev-framework apply` and then `dev-doctor` in each Framework project.

## Sources

| Material | Origin |
| --- | --- |
| `project/.agents/skills/handoff/` | my-pi `8b12776`, made harness-neutral |
| `project/.agents/skills/writing-for-agents/` | [mattpocock/skills](https://github.com/mattpocock/skills) `c55ee46`, unchanged; MIT, `LICENSE` included |
| `project/.agents/skills/grilling/` | The my-pi Framework version, adapted from mattpocock/skills `c55ee46`; MIT, `LICENSE` included |
| `project/.agents/skills/research/`, `prototype/` | mattpocock/skills `c55ee46`, unchanged; MIT, `LICENSE` included |
| `project/knowledge/dev-framework/plan-documentation/explore.md` | The explore node's wayfinding map is adapted from the `wayfinder` skill of mattpocock/skills `d81f3a1`; MIT |
| The rest of the Dev Framework | Redesigned here, using the my-pi Framework at `8b12776` as a reference; its writing rules are kept unchanged apart from frontmatter |

This repository was called agent-loadout until it stopped installing a global prompt and skills into each harness.

## Development

```bash
bun install
bun run lint
bun run typecheck
bun run test
bun run size [base]   # words agents read, and each skill's reading set, against main or base
```
