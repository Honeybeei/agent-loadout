# Agent Loadout

Agent Loadout is the single source of truth for the material that every development harness should share: the global prompt, personal skills, and the Dev Framework. An apply script installs that material into each harness's user area, so the same skills and rules work regardless of which harness or inference provider runs the session.

## Why

Pi is not tied to one inference provider, while a Claude subscription can be used only inside Claude Code. Keeping shared material here, instead of inside one harness's configuration, lets both harnesses receive identical skills and Framework rules.

## Scope

This repository holds:

- The global prompt: a common part plus per-harness additions, combined per harness when applied.
- Personal skills that are useful in any project.
- The Dev Framework: a method for managing projects. It applies to a project whose repository root contains `dev.yaml`.

Projects hold only project-specific material, such as `AGENTS.md` with project rules, `plan/`, `knowledge/`, `dev.yaml`, and code. They contain no Framework copies.

Harness-specific settings stay in each harness's own configuration: themes, keybindings, models, authentication, Pi extensions, and Pi subagents.

## Supported harnesses

| Harness | Skills target | Global prompt target |
| --- | --- | --- |
| Pi | `~/.agents/skills/<name>/` | `~/.pi/agent/AGENTS.md` |
| Claude Code | `~/.claude/skills/<name>/` | `~/.claude/CLAUDE.md` |

Codex also reads `~/.agents/skills/`, so it receives the Pi skill copies without being an official target. Other harnesses may be added later with their own apply and check modules.

## Layout

```
agent-loadout/
├── AGENTS.md            Rules for developing this repository
├── README.md
├── package.json         Repository tooling
├── prompt/              Global prompt parts
│   ├── common.md        Shared by every harness
│   └── <harness>.md     Per-harness additions
├── scripts/             Apply and check scripts with their tests
└── skills/              Copied one-to-one into each harness's skills directory
    ├── dev-framework/   Framework specification and shared resources, no SKILL.md
    ├── dev-check/       Shared inspection resources, no SKILL.md
    └── <skill>/         One directory per skill
```

`skills/` mirrors the applied layout. Framework skills link to each other and to `dev-framework/` and `dev-check/` with sibling-relative paths such as `../dev-framework/`, so every entry must stay a direct child of `skills/`.

## Applying

Applying copies or generates files only when the script runs; it does not link harness directories to this repository. Editing files or switching branches here does not affect any harness until the next apply. The script reports differences between the applied state and this repository, and removes skills it previously applied that no longer exist here.

The apply script is not implemented yet.

## Status

The repository is being assembled by reviewing each file before adding it. The initial source is my-pi commit `8b12776`:

- Dev Framework: `extensions/dev-framework-manager/assets/`
- Personal skills: `skills/handoff/`
- Global prompt: `AGENTS.md`

Imported so far:

- `prompt/common.md`: the introduction and the writing, collaboration, changes, and verification and publication sections. The writing section merges the former global writing preferences with general rules from the Framework's former writing rules. The former web research and subagent delegation sections are not imported; each harness handles those itself.
- `skills/writing-for-agents/`: `SKILL.md` and `SKILL-MECHANICS.md` unchanged from [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-for-agents) commit `c55ee46`, with that repository's MIT `LICENSE`. The Codex-only `agents/openai.yaml` is not imported.
- `skills/grilling/`: the Framework version from my-pi, which adapts [mattpocock/skills](https://github.com/mattpocock/skills/tree/main/skills/productivity/grilling) commit `c55ee46` to ask one question per round and to end at a bounded judgment. The Dev Cycle sentence is removed so the skill reads correctly outside the Framework. Includes the upstream MIT `LICENSE`.
- `skills/handoff/`: all files from my-pi. `SKILL.md` and `references/create.md` replace Pi invocation syntax and the "Pi session" wording with harness-neutral text; the other files are unchanged.

The Framework's `references/writing-rules.md` is not imported. Framework projects follow the global writing defaults like any other project, so the Framework defines no writing rules of its own.

Until the Framework text is revised, parts of it still describe project-local Framework copies and managed root blocks, which the current model no longer uses.

## Development

Requirements: Bun 1.3.14.

```bash
bun install
bun run lint
bun run typecheck
bun run test
```
