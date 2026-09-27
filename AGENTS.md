# Agent Loadout

This repository is the source of truth for the global prompt, personal skills, and the Dev Framework. Harnesses receive the prompt and skills through the apply script; Framework projects receive the Framework through `dev-doctor`. Read [README.md](README.md) for the purpose, supported harnesses, and layout.

## Writing

Write this repository's documents by the Framework [writing rules](skills/dev-framework/project/knowledge/dev-framework/writing-rules.md). This repository has no `dev.yaml` and is not a Framework project; only the writing rules apply.

## Global prompt and Framework boundary

- The global prompt defines how an agent behaves in every working directory and harness. Keep `prompt/` free of project rules such as document writing rules, and of the Framework. Framework projects carry their own managed `AGENTS.md` section and rule copies, so the global prompt does not need to mention the Framework.
- Keep the Framework self-contained in `skills/dev-framework/` and `skills/dev-doctor/`. Framework files must not depend on the global prompt for their rules.

## Harness neutrality

- Write skills, Framework text, and `prompt/common.md` so they read correctly in every supported harness. Do not assume one harness's tools, commands, or invocation syntax.
- Put material that only one harness needs in that harness's prompt addition (`prompt/<harness>.md`) or its entry in `scripts/harnesses.ts`.
- Keep harness settings out of this repository: themes, keybindings, models, authentication, Pi extensions, and Pi subagents.

## Skills layout

- Every direct child of `skills/` is installed into the harness. A skill directory must contain `SKILL.md`; `dev-framework/` is the Framework source and has none.
- `dev-framework/project/` mirrors a project root and is copied into Framework projects. Keep its links valid from that root.
- Put the Framework's project skills in `dev-framework/project/.agents/skills/`, never directly under `skills/`: a harness copy would take precedence over the project copy in Claude Code.
- Name section fragments `*.section.md`, never `README.md` or `AGENTS.md`, and add no `.claude/` directory under `dev-framework/project/`, so no harness loads them as instructions or skills while working in this repository.
- Keep links inside `skills/` relative, and make sure each target exists.
- When adding, renaming, or removing a skill, update the README and every link that names it.

## Applying to harnesses

- Editing this repository does not change any harness. Running the apply script writes to user directories outside this repository, so run it only when the user asks for that apply.
- Never modify `~/.claude/skills/synced/`; claude.ai manages it.
- Do not read credential files such as `~/.pi/agent/auth.json` or `~/.claude/.credentials.json`.

## Tooling

- Use Bun for installing, running, and testing: `bun install`, `bun run <script>`, `bun test`, and `bun <file>`. Do not use npm, npx, Node, or other test runners.
- Write scripts in TypeScript with the strict settings in [tsconfig.json](tsconfig.json).
- After any change, run `bun run lint`, `bun run typecheck`, and `bun run test`. The tests also check every skill's frontmatter and every relative link in the documents.
