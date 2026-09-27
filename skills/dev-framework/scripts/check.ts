// Diagnoses a project against the installed Dev Framework. It changes nothing.
// Usage: bun check.ts [project-root]
// Add a check only when the same mistake keeps recurring; judging content stays with the agent.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  relative,
  resolve,
} from "node:path";
import {
  loadPlan,
  renderMap,
} from "../project/.agents/skills/dev-framework/scripts/map.ts";
import { planSync } from "./sync.ts";

export const AREAS = [
  "Structure",
  "Managed material",
  "Plan",
  "Knowledge",
  "Links",
  "Leftovers",
] as const;
export type Area = (typeof AREAS)[number];
export type State = "not adopted" | "outdated" | "current";
export interface Finding {
  area: Area;
  message: string;
}
type Add = (area: Area, message: string) => void;

const REQUIRED = [
  "README.md",
  "AGENTS.md",
  "knowledge/README.md",
  "plan/README.md",
  "plan/map.md",
];
const RESERVED = ["knowledge", "plan", ".tmp", ".git", ".agents", ".claude"];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// Skills that earlier Framework versions put into projects.
const OLD_SKILL =
  /^(?:dev-check(?:-[a-z-]+)?|dev-conformance|dev-cycle|dev-framework-report|dev-init|dev-ssot|dev-update|development-cycle|inspect-project)$/;

function git(root: string, args: string[]) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

const isDirectory = (path: string) =>
  existsSync(path) && statSync(path).isDirectory();

const withoutCode = (text: string) =>
  text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");

function splitFrontmatter(text: string): {
  fields: Record<string, unknown> | undefined;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) return { fields: undefined, body: text };
  let data: unknown;
  try {
    data = Bun.YAML.parse(match[1] ?? "");
  } catch {
    data = undefined;
  }
  const fields =
    typeof data === "object" && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;
  return { fields, body: text.slice(match[0].length) };
}

function markdownFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

function checkWorkspaces(root: string, add: Add): string[] {
  let data: unknown;
  try {
    data = Bun.YAML.parse(readFileSync(join(root, "dev.yaml"), "utf8"));
  } catch (error) {
    add("Structure", `dev.yaml is not valid YAML (${String(error)})`);
    return [];
  }
  const list = (data as { workspaces?: unknown } | null)?.workspaces;
  if (
    !Array.isArray(list) ||
    list.length === 0 ||
    !list.every((w) => typeof w === "string" && w !== "")
  ) {
    add(
      "Structure",
      "dev.yaml must declare workspaces as a nonempty list of directory paths",
    );
    return [];
  }
  const workspaces = list.map(
    (w: string) => normalize(w).replace(/\/+$/, "") || ".",
  );
  if (workspaces.includes(".") && workspaces.length > 1)
    add("Structure", 'dev.yaml: "." must be the only workspace when declared');
  for (const [index, workspace] of workspaces.entries()) {
    if (workspace === ".") continue;
    const declared = list[index] as string;
    if (isAbsolute(declared) || workspace.split("/")[0] === "..") {
      add("Structure", `workspace ${declared} is outside the project`);
      continue;
    }
    if (RESERVED.includes(workspace.split("/")[0] ?? "")) {
      add("Structure", `workspace ${workspace} is inside a reserved area`);
      continue;
    }
    if (!isDirectory(join(root, workspace))) {
      add("Structure", `workspace ${workspace} does not exist`);
      continue;
    }
    if (!existsSync(join(root, workspace, "README.md")))
      add("Structure", `workspace ${workspace} has no README.md`);
    if (
      isDirectory(join(root, workspace, "knowledge")) &&
      !existsSync(join(root, workspace, "knowledge", "README.md"))
    )
      add("Structure", `${workspace}/knowledge/ has no README.md`);
    for (const other of workspaces)
      if (other.startsWith(`${workspace}/`))
        add("Structure", `workspace ${other} is nested inside ${workspace}`);
  }
  return workspaces;
}

function checkKnowledge(root: string, directory: string, add: Add): void {
  for (const file of markdownFiles(join(root, directory))) {
    const path = relative(root, file);
    if (
      basename(file) === "README.md" ||
      path === "knowledge/dev-framework.md" ||
      path.startsWith("knowledge/dev-framework/")
    )
      continue;
    const { fields, body } = splitFrontmatter(readFileSync(file, "utf8"));
    if (!KEBAB.test(basename(file, ".md")))
      add("Knowledge", `${path}: file name must be kebab-case`);
    const titles = withoutCode(body)
      .split("\n")
      .filter((line) => line.startsWith("# ")).length;
    if (titles !== 1)
      add("Knowledge", `${path}: needs exactly one H1 heading, has ${titles}`);
    const topics = fields?.canonical_for;
    if (
      !Array.isArray(topics) ||
      topics.length === 0 ||
      !topics.every((t) => typeof t === "string" && t.trim() !== "")
    )
      add(
        "Knowledge",
        `${path}: frontmatter needs canonical_for, a nonempty list of topics`,
      );
    const subdocs = fields?.subdocs ?? [];
    if (
      !Array.isArray(subdocs) ||
      !subdocs.every((doc) => typeof doc === "string")
    ) {
      add("Knowledge", `${path}: subdocs must be a list of paths`);
      continue;
    }
    const listed = new Set(subdocs.map((doc) => resolve(dirname(file), doc)));
    for (const doc of subdocs)
      if (!existsSync(resolve(dirname(file), doc)))
        add("Knowledge", `${path}: subdocs lists ${doc}, which does not exist`);
    const children = join(dirname(file), basename(file, ".md"));
    if (isDirectory(children))
      for (const child of readdirSync(children).sort())
        if (
          child.endsWith(".md") &&
          child !== "README.md" &&
          !listed.has(join(children, child))
        )
          add(
            "Knowledge",
            `${path}: subdocs does not list ./${basename(children)}/${child}`,
          );
  }
}

function brokenLinks(root: string, path: string): string[] {
  const text = withoutCode(readFileSync(join(root, path), "utf8"));
  return [...text.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => (match[1] ?? "").split("#")[0] ?? "")
    .filter((target) => target !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(target))
    .filter(
      (target) =>
        !existsSync(
          target.startsWith("/")
            ? join(root, target)
            : resolve(dirname(join(root, path)), target),
        ),
    );
}

export function diagnose(projectRoot: string): {
  state: State;
  findings: Finding[];
} {
  const root = realpathSync(projectRoot);
  const findings: Finding[] = [];
  const add: Add = (area, message) => findings.push({ area, message });
  const exists = (path: string) => existsSync(join(root, path));
  const markdown = git(root, [
    "ls-files",
    "-co",
    "--exclude-standard",
    "-z",
    "--",
    "*.md",
  ])
    .stdout.split("\0")
    .filter((path) => path !== "" && exists(path));

  if (lstatSync(join(root, "CLAUDE.md"), { throwIfNoEntry: false }))
    add(
      "Structure",
      "CLAUDE.md exists; AGENTS.md is the only instruction file",
    );
  for (const path of markdown) {
    if (basename(path) === "AGENTS.md" && path !== "AGENTS.md")
      add("Structure", `${path}: AGENTS.md belongs only at the project root`);
    if (basename(path) === "CLAUDE.md" && path !== "CLAUDE.md")
      add("Structure", `${path}: AGENTS.md is the only instruction file`);
  }
  const sync = planSync(root);
  for (const problem of sync.problems)
    add("Managed material", `blocks sync: ${problem}`);
  if (!exists("dev.yaml")) return { state: "not adopted", findings };
  for (const change of sync.changes)
    add("Managed material", `sync would ${change.action} ${change.path}`);
  if (
    lstatSync(join(root, ".claude/skills"), { throwIfNoEntry: false }) &&
    git(root, ["ls-files", "--", ".claude/skills"]).stdout === ""
  )
    add("Managed material", ".claude/skills is not in Git; commit the link");
  const state: State =
    sync.changes.length > 0 || sync.problems.length > 0
      ? "outdated"
      : "current";

  for (const path of REQUIRED)
    if (!exists(path)) add("Structure", `${path} is missing`);
  if (
    !git(root, ["check-ignore", "-v", ".tmp/probe"]).stdout.startsWith(
      ".gitignore:",
    )
  )
    add("Structure", "the root .gitignore must exclude /.tmp/");
  const workspaces = checkWorkspaces(root, add);

  const plan = loadPlan(root);
  for (const error of plan.errors) add("Plan", error);
  if (
    plan.errors.length === 0 &&
    exists("plan/map.md") &&
    readFileSync(join(root, "plan/map.md"), "utf8") !== renderMap(plan)
  )
    add("Plan", "plan/map.md is stale; regenerate it with the map script");

  const knowledge = [
    "knowledge",
    ...workspaces.filter((w) => w !== ".").map((w) => `${w}/knowledge`),
  ];
  for (const directory of knowledge)
    if (isDirectory(join(root, directory)))
      checkKnowledge(root, directory, add);

  for (const path of markdown)
    for (const target of brokenLinks(root, path))
      add("Links", `${path}: broken link to ${target}`);

  if (exists("plan/map.yaml"))
    add("Leftovers", "plan/map.yaml is from an earlier Framework");
  if (isDirectory(join(root, ".agents/skills")))
    for (const name of readdirSync(join(root, ".agents/skills")).sort())
      if (OLD_SKILL.test(name))
        add("Leftovers", `.agents/skills/${name} is from an earlier Framework`);

  return { state, findings };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => arg.startsWith("--"))) {
    console.error("Usage: bun check.ts [project-root]");
    process.exit(2);
  }
  const { state, findings } = diagnose(resolve(args[0] ?? "."));
  console.log(`State: ${state}`);
  for (const area of AREAS) {
    const messages = findings.filter((f) => f.area === area);
    if (messages.length > 0)
      console.log(
        `\n${area}\n${messages.map((f) => `- ${f.message}`).join("\n")}`,
      );
  }
  if (findings.length === 0) console.log("No findings.");
  process.exit(state === "current" && findings.length === 0 ? 0 : 1);
}
