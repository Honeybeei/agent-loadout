# Agent Loadout

This repository is the source of truth for the global prompt, personal skills, and the Dev Framework that are applied to every supported harness. Read [README.md](README.md) for the purpose, supported harnesses, and layout.

## Global prompt and Framework boundary

- The global prompt applies to every working directory in every harness, and most of those directories are not Dev Framework projects. Keep `prompt/` free of Framework rules, terms, and procedures.
- The global prompt may state only when the Framework applies (the repository root contains `dev.yaml`) and where its entry point is.
- Keep the Framework self-contained under `skills/`. Framework files must not depend on the global prompt for their rules, even when a Framework rule resembles a global default.
- Do not restate general defaults, such as writing style, in the Framework. Framework projects follow them like any other project; the Framework defines only rules specific to Framework projects.

## Harness neutrality

- Write skills, Framework text, and `prompt/common.md` so they read correctly in every supported harness. Do not assume one harness's tools, commands, or invocation syntax.
- Put material that only one harness needs in that harness's prompt addition or apply module.
- Keep harness settings out of this repository: themes, keybindings, models, authentication, Pi extensions, and Pi subagents.

## Skills layout

- Keep every skill, `dev-framework/`, and `dev-check/` as a direct child of `skills/`. Applied copies use the same flat layout, and sibling-relative links such as `../dev-framework/` depend on it.
- A skill directory must contain `SKILL.md`. `dev-framework/` and `dev-check/` are shared resources and have no `SKILL.md`.
- Keep links inside `skills/` relative, and make sure each target exists.
- When adding, renaming, or removing a skill, update the README and every link that names it.

## Applying to harnesses

- Editing this repository does not change any harness. Running the apply script writes to user directories outside this repository, so run it only when the user asks for that apply.
- Never modify `~/.claude/skills/synced/`; claude.ai manages it.
- Do not read credential files such as `~/.pi/agent/auth.json` or `~/.claude/.credentials.json`.

## Tooling

- Use Bun for installing, running, and testing: `bun install`, `bun run <script>`, `bun test`, and `bun <file>`. Do not use npm, npx, Node, or other test runners.
- Write scripts in TypeScript with the strict settings in [tsconfig.json](tsconfig.json).
- After changing TypeScript, run `bun run lint`, `bun run typecheck`, and `bun run test`.
