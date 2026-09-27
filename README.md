# Agent Loadout

Agent Loadout is the single source of truth for the material that every development harness should share: the global prompt, personal skills, and the Dev Framework. An apply script installs the global prompt and skills into each harness's user area; the Framework's `dev-doctor` skill then copies the Framework into each project, keeps it up to date, and checks that the project follows its rules. The same skills and rules work regardless of which harness or inference provider runs the session.

## Why

Pi is not tied to one inference provider, while a Claude subscription can be used only inside Claude Code. Keeping shared material here, instead of inside one harness's configuration, gives both harnesses identical skills, and every Framework project the same rules.

## Scope

This repository holds:

- The global prompt: a common part plus per-harness additions, combined per harness when applied.
- Personal skills that are useful in any project.
- The Dev Framework: a method for managing projects. It applies to a project whose repository root contains `dev.yaml`.

A Framework project carries its own managed copy of the Framework: the rules in `knowledge/dev-framework/`, managed sections in its root README and AGENTS, and the workflow skills in `.agents/skills/`. `dev-doctor` puts them there, so any person or agent can read the rules and use the skills without this repository. See [skills/dev-framework/README.md](skills/dev-framework/README.md).

Harness-specific settings stay in each harness's own configuration: themes, keybindings, models, authentication, Pi extensions, and Pi subagents.

## Supported harnesses

| Harness | Skills target | Global prompt target |
| --- | --- | --- |
| Pi | `~/.agents/skills/<name>/` | `~/.pi/agent/AGENTS.md` |
| Claude Code | `~/.claude/skills/<name>/` | `~/.claude/CLAUDE.md` |

Codex also reads `~/.agents/skills/`, so it receives the Pi skill copies without being an official target. Another harness can be added later with an entry in [scripts/harnesses.ts](scripts/harnesses.ts).

## Layout

```
agent-loadout/
├── AGENTS.md            Rules for developing this repository
├── README.md
├── package.json         Repository tooling
├── prompt/              Global prompt parts
│   ├── common.md        Shared by every harness
│   └── <harness>.md     Per-harness additions
├── scripts/             Apply script and repository tests
└── skills/              Copied one-to-one into each harness's skills directory
    ├── dev-framework/   Framework source, no SKILL.md
    │   └── project/     Mirrors a project root; copied into Framework projects,
    │                    including the workflow skills in project/.agents/skills/
    ├── dev-doctor/      Adopts, updates, and checks the Framework in a project
    ├── handoff/
    └── writing-for-agents/
```

Every direct child of `skills/` is installed into the harness. The Framework's workflow skills (`dev-explore`, `dev-implement`, `dev-next`) and the skills they use (`grilling`, `research`, `prototype`) are not; they live in each Framework project, where they match that project's version of the rules.

## Applying

Applying copies or generates files only when the script runs; it does not link harness directories to this repository. Editing files or switching branches here does not affect any harness until the next apply.

```bash
bun run apply <pi | claude-code | all> --check   # show what would change
bun run apply <pi | claude-code | all>           # apply it
```

- Skills: every direct child of `skills/`, without test files, goes into the harness's skills directory. Skills applied earlier but no longer in this repository are removed.
- Global prompt: `prompt/common.md` plus `prompt/<harness>.md`, when it exists, goes into a section between `<!-- agent-loadout:start -->` and `<!-- agent-loadout:end -->`. Text outside the section stays as it is.
- `.agent-loadout.json` in each skills directory records what was applied, so the script can tell repository changes from edits made in the harness. It refuses to overwrite such edits unless `--force` is given, and never touches a skill it did not apply, or `~/.claude/skills/synced/`.
- Harness paths live in [scripts/harnesses.ts](scripts/harnesses.ts).

## Sources

| Material | Origin |
| --- | --- |
| `prompt/common.md` | Rewritten from the my-pi global prompt (`AGENTS.md` at my-pi `8b12776`); covers agent behavior only |
| `skills/handoff/` | my-pi `8b12776`, made harness-neutral |
| `skills/writing-for-agents/` | [mattpocock/skills](https://github.com/mattpocock/skills) `c55ee46`, unchanged; MIT, `LICENSE` included |
| `skills/dev-framework/project/.agents/skills/grilling/` | The my-pi Framework version, adapted from mattpocock/skills `c55ee46`; MIT, `LICENSE` included |
| `skills/dev-framework/project/.agents/skills/research/`, `prototype/` | mattpocock/skills `c55ee46`, unchanged; MIT, `LICENSE` included |
| The rest of the Dev Framework | Redesigned here, using the my-pi Framework at `8b12776` as a reference; its writing rules are kept unchanged apart from frontmatter |

## Development

Requirements: Bun 1.3.14.

```bash
bun install
bun run lint
bun run typecheck
bun run test
```
