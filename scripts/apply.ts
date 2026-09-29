// Installs this repository's skills and global prompt into each harness, or reports what would change.
// Usage: bun scripts/apply.ts <pi | claude-code | all> [--check] [--force]
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type Harness, harnesses } from "./harnesses.ts";

export const REPO = resolve(import.meta.dir, "..");
export const START = "<!-- agent-loadout:start -->";
export const END = "<!-- agent-loadout:end -->";
const NOTE =
  "<!-- Managed by agent-loadout. Edit prompt/ in the agent-loadout repository and apply again. -->";
const MANIFEST = ".agent-loadout.json";

type Tree = Map<string, Buffer>;
type Hashes = Record<string, string>;
interface Manifest {
  source?: { commit: string; dirty: boolean };
  skills: Record<string, Hashes>;
  prompts: Record<string, string>;
}
export interface Step {
  description: string;
  apply: () => void;
}
export interface HarnessPlan {
  harness: Harness;
  steps: Step[];
  problems: string[];
  warnings: string[];
  unchanged: number;
}

const sha = (content: Buffer | string) =>
  createHash("sha256").update(content).digest("hex");

function readTree(
  directory: string,
  prefix = "",
  tree: Tree = new Map(),
): Tree {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory())
      readTree(join(directory, entry.name), relative, tree);
    else tree.set(relative, readFileSync(join(directory, entry.name)));
  }
  return tree;
}

function hashes(tree: Tree): Hashes {
  return Object.fromEntries(
    [...tree].map(([path, content]) => [path, sha(content)]).sort(),
  );
}

const sameHashes = (a: Hashes, b: Hashes) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Each direct child directory of skills/, without test files. */
export function sourceSkills(): Map<string, Tree> {
  const skills = new Map<string, Tree>();
  const entries = readdirSync(join(REPO, "skills"), { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : 1));
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const tree = readTree(join(REPO, "skills", entry.name));
    for (const path of tree.keys())
      if (path.endsWith(".test.ts")) tree.delete(path);
    skills.set(entry.name, tree);
  }
  return skills;
}

export function promptSection(harness: Harness): string {
  const parts = harness.promptParts
    .map((part) => join(REPO, "prompt", part))
    .filter((path) => existsSync(path))
    .map((path) => readFileSync(path, "utf8").trim());
  return [START, NOTE, "", parts.join("\n\n"), END].join("\n");
}

/** Finds the one managed section; undefined when there is none. */
export function findSection(
  text: string,
): { start: number; end: number } | undefined {
  const lines = text.split("\n");
  const starts = lines.flatMap((line, i) =>
    line.trimEnd() === START ? [i] : [],
  );
  const ends = lines.flatMap((line, i) => (line.trimEnd() === END ? [i] : []));
  if (starts.length === 0 && ends.length === 0) return undefined;
  const [start] = starts;
  const [end] = ends;
  if (
    starts.length !== 1 ||
    ends.length !== 1 ||
    start === undefined ||
    end === undefined ||
    end < start
  )
    throw new Error(
      "expected exactly one agent-loadout start and end marker, in that order",
    );
  return { start, end };
}

function sectionText(
  text: string,
  section: { start: number; end: number },
): string {
  return text
    .split("\n")
    .slice(section.start, section.end + 1)
    .join("\n");
}

export function replaceSection(
  text: string | undefined,
  block: string,
): string {
  if (text === undefined || text.trim() === "") return `${block}\n`;
  const section = findSection(text);
  if (!section) return `${text}${text.endsWith("\n") ? "" : "\n"}\n${block}\n`;
  const lines = text.split("\n");
  return [
    ...lines.slice(0, section.start),
    block,
    ...lines.slice(section.end + 1),
  ].join("\n");
}

function sourceState(): { commit: string; dirty: boolean } {
  const git = (...args: string[]) =>
    spawnSync("git", ["-C", REPO, ...args], { encoding: "utf8" }).stdout.trim();
  return {
    commit: git("rev-parse", "HEAD"),
    dirty: git("status", "--porcelain") !== "",
  };
}

function readManifest(harness: Harness): Manifest {
  const path = join(harness.skillsDir, MANIFEST);
  if (!existsSync(path)) return { skills: {}, prompts: {} };
  const manifest = JSON.parse(readFileSync(path, "utf8")) as Partial<Manifest>;
  return {
    ...manifest,
    skills: manifest.skills ?? {},
    prompts: manifest.prompts ?? {},
  };
}

function writeTree(directory: string, tree: Tree): void {
  rmSync(directory, { recursive: true, force: true });
  for (const [path, content] of tree) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), content);
  }
}

export function planHarness(harness: Harness, force: boolean): HarnessPlan {
  const plan: HarnessPlan = {
    harness,
    steps: [],
    problems: [],
    warnings: [],
    unchanged: 0,
  };
  const manifest = readManifest(harness);
  const next: Manifest = {
    source: sourceState(),
    skills: { ...manifest.skills },
    prompts: { ...manifest.prompts },
  };
  const edited = (name: string, installed: Hashes) => {
    const applied = manifest.skills[name];
    return applied !== undefined && !sameHashes(applied, installed);
  };
  const refuseEdit = (what: string) => {
    if (!force)
      plan.problems.push(
        `${what} was edited after the last apply; move the edits into this repository, or pass --force to discard them`,
      );
  };

  const skills = sourceSkills();
  for (const [name, tree] of skills) {
    const target = join(harness.skillsDir, name);
    if (harness.reserved.includes(name)) {
      plan.problems.push(
        `skill name "${name}" is reserved in ${harness.skillsDir}`,
      );
      continue;
    }
    for (const shadow of harness.shadowDirs)
      if (existsSync(join(shadow, name)))
        plan.warnings.push(
          `${join(shadow, name)} is read first and hides the applied ${name}`,
        );
    const wanted = hashes(tree);
    next.skills[name] = wanted;
    if (!existsSync(target)) {
      plan.steps.push({
        description: `add skill ${name}`,
        apply: () => writeTree(target, tree),
      });
      continue;
    }
    const installed = hashes(readTree(target));
    if (!(name in manifest.skills))
      plan.problems.push(
        `${target} exists but was not applied by agent-loadout`,
      );
    else if (sameHashes(installed, wanted)) plan.unchanged++;
    else {
      if (edited(name, installed)) refuseEdit(target);
      plan.steps.push({
        description: `update skill ${name}`,
        apply: () => writeTree(target, tree),
      });
    }
  }

  for (const name of Object.keys(manifest.skills)) {
    if (skills.has(name)) continue;
    delete next.skills[name];
    const target = join(harness.skillsDir, name);
    if (!existsSync(target)) continue;
    if (edited(name, hashes(readTree(target)))) refuseEdit(target);
    plan.steps.push({
      description: `remove skill ${name}`,
      apply: () => rmSync(target, { recursive: true, force: true }),
    });
  }

  const block = promptSection(harness);
  next.prompts[harness.name] = sha(block);
  const current = existsSync(harness.promptPath)
    ? readFileSync(harness.promptPath, "utf8")
    : undefined;
  try {
    const section = current === undefined ? undefined : findSection(current);
    const installed =
      current !== undefined && section
        ? sectionText(current, section)
        : undefined;
    if (installed === block) plan.unchanged++;
    else {
      const applied = manifest.prompts[harness.name];
      if (
        installed !== undefined &&
        applied !== undefined &&
        sha(installed) !== applied
      )
        refuseEdit(`the prompt section in ${harness.promptPath}`);
      plan.steps.push({
        description: `${installed === undefined ? "add" : "update"} the prompt section in ${harness.promptPath}`,
        apply: () => {
          mkdirSync(dirname(harness.promptPath), { recursive: true });
          writeFileSync(harness.promptPath, replaceSection(current, block));
        },
      });
    }
  } catch (error) {
    plan.problems.push(`${harness.promptPath}: ${(error as Error).message}`);
  }

  if (plan.steps.length > 0)
    plan.steps.push({
      description: `record the applied state in ${join(harness.skillsDir, MANIFEST)}`,
      apply: () => {
        mkdirSync(harness.skillsDir, { recursive: true });
        writeFileSync(
          join(harness.skillsDir, MANIFEST),
          `${JSON.stringify(next, null, 2)}\n`,
        );
      },
    });
  return plan;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const options = args.filter((arg) => arg.startsWith("--"));
  const [target, ...rest] = args.filter((arg) => !arg.startsWith("--"));
  const all = harnesses(process.env.AGENT_LOADOUT_HOME ?? homedir());
  const selected =
    target === "all" ? all : all.filter((h) => h.name === target);
  if (
    selected.length === 0 ||
    rest.length > 0 ||
    options.some((o) => o !== "--check" && o !== "--force")
  ) {
    console.error(
      `Usage: bun scripts/apply.ts <${all.map((h) => h.name).join(" | ")} | all> [--check] [--force]`,
    );
    process.exit(2);
  }
  const check = options.includes("--check");
  const plans = selected.map((harness) =>
    planHarness(harness, options.includes("--force")),
  );
  let exitCode = 0;
  for (const plan of plans) {
    console.log(`${plan.harness.name}:`);
    for (const warning of plan.warnings) console.log(`  warning: ${warning}`);
    for (const problem of plan.problems)
      console.log(`  cannot apply: ${problem}`);
    if (plan.problems.length > 0) exitCode = 1;
    else {
      for (const step of plan.steps) {
        if (!check) step.apply();
        console.log(`  ${check ? "would " : ""}${step.description}`);
      }
      if (check && plan.steps.length > 0) exitCode = 1;
    }
    console.log(
      `  ${plan.unchanged} item${plan.unchanged === 1 ? "" : "s"} unchanged`,
    );
  }
  process.exit(exitCode);
}
