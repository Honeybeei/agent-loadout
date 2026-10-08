// Reports how many words agents read in this repository's material, against a base revision,
// and the reading set of each workflow skill: the skill and every document it links.
// Usage: bun scripts/size.ts [base], where base defaults to main.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { markdownLinks } from "../skills/dev-framework/project/.agents/skills/dev-framework/scripts/check.ts";
import { REPO } from "./apply.ts";

/** The areas agents read; a file counts in the first area that matches it. */
export const AREAS: [string, RegExp][] = [
  ["Global prompt", /^prompt\//],
  [
    "Framework rules",
    /^skills\/dev-framework\/project\/(?:knowledge\/|[^/]+\.section\.md$)/,
  ],
  ["Workflow skills", /^skills\/dev-framework\/project\/\.agents\/skills\//],
  ["dev-doctor", /^skills\/dev-doctor\//],
  ["Other skills", /^skills\/(?!dev-framework\/)[^/]+\//],
  ["This repository's rules", /^(?:AGENTS\.md$|\.agents\/skills\/)/],
];

// Third-party skills kept unchanged, as the README's Sources table lists them.
const THIRD_PARTY =
  /^skills\/(?:writing-for-agents|dev-framework\/project\/\.agents\/skills\/(?:research|prototype))\//;

const SKILL =
  /^skills\/(?:dev-doctor|dev-framework\/project\/\.agents\/skills\/dev-[^/]+)\/SKILL\.md$/;

export const area = (path: string) =>
  THIRD_PARTY.test(path)
    ? undefined
    : AREAS.find(([, pattern]) => pattern.test(path))?.[0];

/** Words in a Markdown text, without its frontmatter, counted as `wc -w` does. */
export function words(text: string): number {
  return text
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "")
    .split(/\s+/)
    .filter((word) => word !== "").length;
}

export interface Version {
  files: string[];
  read: (path: string) => string | undefined;
}

function git(args: string[]) {
  return spawnSync("git", ["-C", REPO, ...args], { encoding: "utf8" });
}

/** The working tree, with untracked files that Git does not ignore. */
export function current(): Version {
  const files = git([
    "ls-files",
    "-co",
    "--exclude-standard",
    "-z",
    "--",
    "*.md",
  ])
    .stdout.split("\0")
    .filter((path) => path !== "" && existsSync(join(REPO, path)));
  return {
    files,
    read: (path) =>
      existsSync(join(REPO, path))
        ? readFileSync(join(REPO, path), "utf8")
        : undefined,
  };
}

function at(base: string): Version {
  const files = git(["ls-tree", "-r", "-z", "--name-only", base])
    .stdout.split("\0")
    .filter((path) => path.endsWith(".md"));
  const known = new Set(files);
  const cache = new Map<string, string>();
  return {
    files,
    read: (path) => {
      if (!known.has(path)) return undefined;
      const text = cache.get(path) ?? git(["show", `${base}:${path}`]).stdout;
      cache.set(path, text);
      return text;
    },
  };
}

/** A skill and every Markdown file it links, one link away. */
export function readingSet(version: Version, skill: string): string[] {
  const linked = markdownLinks(version.read(skill) ?? "")
    .filter((link) => link.file !== "")
    .map((link) =>
      relative(REPO, resolve(dirname(join(REPO, skill)), link.file)),
    )
    .filter((path) => path.endsWith(".md") && version.read(path) !== undefined);
  return [...new Set([skill, ...linked])];
}

const total = (version: Version, paths: string[]) =>
  paths.reduce((sum, path) => sum + words(version.read(path) ?? ""), 0);

const signed = (change: number) => (change > 0 ? `+${change}` : `${change}`);

function table(rows: string[][]): string {
  const widths = rows[0]?.map((_, column) =>
    Math.max(...rows.map((row) => (row[column] ?? "").length)),
  );
  return rows
    .map((row) =>
      row
        .map((cell, column) =>
          column === 0
            ? cell.padEnd(widths?.[column] ?? 0)
            : cell.padStart(widths?.[column] ?? 0),
        )
        .join("  "),
    )
    .join("\n");
}

if (import.meta.main) {
  const base = process.argv[2] ?? "main";
  if (
    git(["rev-parse", "--verify", "--quiet", `${base}^{commit}`]).status !== 0
  ) {
    console.error(
      `Usage: bun scripts/size.ts [base]\nUnknown revision: ${base}`,
    );
    process.exit(2);
  }
  const now = current();
  const then = at(base);
  const rows = [["Area", "Words", "Change"]];
  let nowTotal = 0;
  let thenTotal = 0;
  for (const [name] of AREAS) {
    const nowWords = total(
      now,
      now.files.filter((path) => area(path) === name),
    );
    const thenWords = total(
      then,
      then.files.filter((path) => area(path) === name),
    );
    nowTotal += nowWords;
    thenTotal += thenWords;
    rows.push([name, `${nowWords}`, signed(nowWords - thenWords)]);
  }
  rows.push(["Total", `${nowTotal}`, signed(nowTotal - thenTotal)]);
  const sets = [["Reading set", "Documents", "Words", "Change"]];
  for (const skill of now.files.filter((path) => SKILL.test(path)).sort()) {
    const nowSet = readingSet(now, skill);
    const nowWords = total(now, nowSet);
    const thenWords = total(then, readingSet(then, skill));
    sets.push([
      skill.split("/").at(-2) ?? skill,
      `${nowSet.length}`,
      `${nowWords}`,
      signed(nowWords - thenWords),
    ]);
  }
  console.log(
    `Words agents read, without frontmatter, against ${base}\n\n${table(rows)}\n\nEach skill with the documents it links directly; documents those link are not counted\n\n${table(sets)}`,
  );
}
