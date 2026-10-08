// The dev-framework command: copies the Dev Framework into the project in the current directory.
// Usage: dev-framework apply [--check] [--adopt] [--allow-unmerged] [--allow-running]
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { planSync, RECORD, type Source, sourceState } from "./sync.ts";

const OPTIONS = [
  "--check",
  "--adopt",
  "--allow-unmerged",
  "--allow-running",
] as const;
export type Option = (typeof OPTIONS)[number];

const USAGE = `Usage: dev-framework apply [--check] [--adopt] [--allow-unmerged] [--allow-running]

Copies the Dev Framework into the Git repository in the current directory: its rules,
the skills in .agents/skills/, the managed sections of README.md and AGENTS.md, and the
.claude/skills link. Records the source commit in ${RECORD}. Commits nothing.

  --check           Show what would change, and write nothing
  --adopt           Apply to a repository without dev.yaml, to adopt the Framework
  --allow-unmerged  Apply from a dev-framework checkout that is not a clean main
  --allow-running   Apply while a blackbox or collaborative leaf is in progress`;

function git(root: string, ...args: string[]) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

/** Reasons to refuse that the copy itself does not see: the source, the checkout, and running work. */
export function guards(
  root: string,
  options: Set<Option>,
  source: Source = sourceState(),
): string[] {
  const problems: string[] = [];
  if (
    !options.has("--allow-unmerged") &&
    (source.branch !== "main" || source.dirty)
  )
    problems.push(
      `dev-framework is on ${source.branch || "a detached HEAD"}${source.dirty ? " with uncommitted changes" : ""}, not a clean main; merge the change into main, or pass --allow-unmerged to try it`,
    );
  const main = /^worktree (.+)$/m.exec(
    git(root, "worktree", "list", "--porcelain").stdout,
  )?.[1];
  if (main !== undefined && existsSync(main) && realpathSync(main) !== root)
    problems.push(
      `run dev-framework apply in the main checkout, ${main}, not in a linked worktree`,
    );

  if (!existsSync(join(root, "dev.yaml"))) {
    if (!options.has("--adopt"))
      problems.push(
        "no dev.yaml, so this is not a Framework project; pass --adopt to adopt the Framework",
      );
    return problems;
  }
  const branch = git(root, "branch", "--show-current").stdout.trim();
  if (branch !== "main")
    problems.push(
      `the project is on ${branch || "a detached HEAD"}; switch to main, where the lead session changes the Plan and Knowledge`,
    );
  const plan = git(
    root,
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    "plan",
  ).stdout.trimEnd();
  if (plan)
    problems.push(
      `commit or set aside the changes in plan/ first, because the map is regenerated from the working tree:\n${plan}`,
    );
  if (!options.has("--allow-running")) {
    const nodes = join(root, "plan/nodes");
    const files = existsSync(nodes) ? readdirSync(nodes).sort() : [];
    for (const file of files.filter((name) => name.endsWith(".md"))) {
      const frontmatter =
        /^---\n([\s\S]*?)\n---/.exec(
          readFileSync(join(nodes, file), "utf8"),
        )?.[1] ?? "";
      const kind = /^kind: (blackbox|collaborative)\s*$/m.exec(
        frontmatter,
      )?.[1];
      if (kind && /^status: in_progress\s*$/m.test(frontmatter))
        problems.push(
          `plan/nodes/${file} is an in_progress ${kind} leaf, which runs under the current rules; apply after it finishes, or pass --allow-running`,
        );
    }
  }
  return problems;
}

/** Regenerates the map and the Knowledge index with the project's new copy of the map script. */
function map(root: string): void {
  const result = spawnSync(
    process.execPath,
    [".agents/skills/dev-framework/scripts/map.ts", "."],
    { cwd: root, encoding: "utf8" },
  );
  process.stdout.write(result.stdout);
  if (result.status !== 0)
    console.log(
      `\nThe map script refused some records:\n${result.stderr.trimEnd()}\nRecords written for an earlier Framework often break newer rules; dev-doctor migrates them.`,
    );
}

function apply(options: Set<Option>): number {
  const root = realpathSync(process.cwd());
  const { changes, problems } = planSync(root);
  const blocking = [...guards(root, options), ...problems];
  if (blocking.length > 0) {
    console.error(
      `Cannot apply:\n${blocking.map((problem) => `- ${problem}`).join("\n")}`,
    );
    return 1;
  }
  if (changes.length === 0) {
    console.log("The Framework in this project is up to date");
    return 0;
  }
  const check = options.has("--check");
  for (const change of changes) {
    if (!check) change.apply(root);
    console.log(
      `${check ? "would " : ""}${change.action} ${change.path}${change.note ? `: ${change.note}` : ""}`,
    );
  }
  if (check) return 1;
  const adopted = existsSync(join(root, "dev.yaml"));
  if (adopted) map(root);
  console.log(
    `\nNext: reload the agent harness so it loads the new skills, then run dev-doctor to ${adopted ? "migrate and check the project" : "finish adopting the Framework"}. Nothing is committed.`,
  );
  return 0;
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "help" || command === "--help" || command === "-h") {
    console.log(USAGE);
    process.exit(0);
  }
  const options = new Set(rest) as Set<Option>;
  if (
    command !== "apply" ||
    options.size !== rest.length ||
    rest.some((arg) => !(OPTIONS as readonly string[]).includes(arg))
  ) {
    console.error(USAGE);
    process.exit(2);
  }
  process.exit(apply(options));
}
