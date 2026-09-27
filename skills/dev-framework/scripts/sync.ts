// Copies the Dev Framework's managed material into a project, or reports what would change.
// Usage: bun sync.ts [project-root] [--check]
// Git is the preview and the undo: the script refuses to overwrite uncommitted work.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

export const SOURCE = resolve(import.meta.dir, "../project");
export const START = "<!-- dev-framework:start -->";
export const END = "<!-- dev-framework:end -->";
const MANIFEST = ".agents/skills/dev-framework/managed.txt";
const MANAGED_PATH =
  /^(?:knowledge\/dev-framework(?:\.md)?|\.agents\/skills\/[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const CLAUDE_LINK = ".claude/skills";
const CLAUDE_TARGET = "../.agents/skills";
const SECTIONS: [string, string][] = [
  ["README.md", "README.section.md"],
  ["AGENTS.md", "AGENTS.section.md"],
];

type Tree = Map<string, Buffer>;
type Action = "create" | "replace" | "remove";
interface Change {
  path: string;
  action: Action;
  apply: (root: string) => void;
}

function readTree(
  directory: string,
  prefix = "",
  tree: Tree = new Map(),
): Tree {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) readTree(path, relative, tree);
    else tree.set(relative, readFileSync(path));
  }
  return tree;
}

function sameTree(a: Tree, b: Tree): boolean {
  return (
    a.size === b.size &&
    [...a].every(([path, content]) => b.get(path)?.equals(content))
  );
}

function writeTree(directory: string, tree: Tree): void {
  rmSync(directory, { recursive: true, force: true });
  for (const [path, content] of tree) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), content);
  }
}

/** Replaces the one managed section, or appends it when the file has none. */
export function replaceSection(
  current: string | undefined,
  section: string,
): string {
  const block = section.trimEnd();
  if (current === undefined || current.trim() === "") return `${block}\n`;
  const lines = current.split("\n");
  const starts = lines.flatMap((line, i) =>
    line.trimEnd() === START ? [i] : [],
  );
  const ends = lines.flatMap((line, i) => (line.trimEnd() === END ? [i] : []));
  if (starts.length === 0 && ends.length === 0)
    return `${current}${current.endsWith("\n") ? "" : "\n"}\n${block}\n`;
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
      "expected exactly one start and one end marker, in that order",
    );
  return [
    ...lines.slice(0, start),
    ...block.split("\n"),
    ...lines.slice(end + 1),
  ].join("\n");
}

function git(root: string, args: string[]): string {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(result.stderr.trim() || `git ${args[0]} failed`);
  return result.stdout;
}

/** Works out every change, and every problem that must block writing. */
export function planSync(projectRoot: string): {
  changes: Change[];
  problems: string[];
} {
  const root = realpathSync(projectRoot);
  const changes: Change[] = [];
  const problems: string[] = [];

  try {
    if (
      realpathSync(git(root, ["rev-parse", "--show-toplevel"]).trim()) !== root
    )
      problems.push(
        "the project root must be the top level of a Git working tree",
      );
  } catch (error) {
    problems.push(`not a Git working tree: ${(error as Error).message}`);
  }

  // Managed files and directories, replaced as a whole.
  const units: [string, Tree | Buffer][] = [
    [
      "knowledge/dev-framework.md",
      readFileSync(join(SOURCE, "knowledge/dev-framework.md")),
    ],
    [
      "knowledge/dev-framework",
      readTree(join(SOURCE, "knowledge/dev-framework")),
    ],
  ];
  for (const name of readdirSync(join(SOURCE, ".agents/skills")).sort())
    units.push([
      `.agents/skills/${name}`,
      readTree(join(SOURCE, ".agents/skills", name)),
    ]);
  const managed = units.map(([path]) => path);
  const frameworkTree = units.find(
    ([path]) => path === ".agents/skills/dev-framework",
  )?.[1];
  if (frameworkTree instanceof Map)
    frameworkTree.set("managed.txt", Buffer.from(`${managed.join("\n")}\n`));

  for (const [path, wanted] of units) {
    const target = join(root, path);
    const exists = existsSync(target);
    if (wanted instanceof Map) {
      if (exists && !lstatSync(target).isDirectory())
        problems.push(`${path} exists but is not a directory`);
      else if (!exists || !sameTree(readTree(target), wanted))
        changes.push({
          path,
          action: exists ? "replace" : "create",
          apply: (r) => writeTree(join(r, path), wanted),
        });
    } else {
      const current = exists ? readFileSync(target) : undefined;
      if (current && !/^managed_by: dev-framework$/m.test(current.toString()))
        problems.push(`${path} exists but is not Framework-managed`);
      else if (!current?.equals(wanted))
        changes.push({
          path,
          action: exists ? "replace" : "create",
          apply: (r) => {
            mkdirSync(dirname(join(r, path)), { recursive: true });
            writeFileSync(join(r, path), wanted);
          },
        });
    }
  }

  // Material an earlier Framework managed but this one no longer has.
  const manifest = join(root, MANIFEST);
  if (existsSync(manifest)) {
    for (const path of readFileSync(manifest, "utf8")
      .split("\n")
      .filter(Boolean)) {
      if (!MANAGED_PATH.test(path))
        problems.push(
          `${MANIFEST} lists a path the Framework never manages: ${path}`,
        );
      else if (!managed.includes(path) && existsSync(join(root, path)))
        changes.push({
          path,
          action: "remove",
          apply: (r) => rmSync(join(r, path), { recursive: true, force: true }),
        });
    }
  }

  // Git can restore only committed work, so refuse to overwrite anything else.
  const touched = changes
    .filter((change) => change.action !== "create")
    .map((change) => change.path);
  if (touched.length > 0 && problems.length === 0) {
    const dirty = git(root, [
      "status",
      "--porcelain",
      "--untracked-files=all",
      "--",
      ...touched,
    ]).trim();
    if (dirty) problems.push(`commit or stash these changes first:\n${dirty}`);
  }

  for (const [file, fragment] of SECTIONS) {
    const target = join(root, file);
    const current = existsSync(target)
      ? readFileSync(target, "utf8")
      : undefined;
    try {
      const next = replaceSection(
        current,
        readFileSync(join(SOURCE, fragment), "utf8"),
      );
      if (next !== current)
        changes.push({
          path: `${file} (section)`,
          action: current === undefined ? "create" : "replace",
          apply: (r) => writeFileSync(join(r, file), next),
        });
    } catch (error) {
      problems.push(`${file}: ${(error as Error).message}`);
    }
  }

  const link = join(root, CLAUDE_LINK);
  const stat = lstatSync(link, { throwIfNoEntry: false });
  if (!stat) {
    changes.push({
      path: `${CLAUDE_LINK} -> ${CLAUDE_TARGET}`,
      action: "create",
      apply: (r) => {
        mkdirSync(join(r, ".claude"), { recursive: true });
        symlinkSync(CLAUDE_TARGET, join(r, CLAUDE_LINK));
      },
    });
  } else if (!stat.isSymbolicLink() || readlinkSync(link) !== CLAUDE_TARGET) {
    problems.push(
      `${CLAUDE_LINK} must be a link to ${CLAUDE_TARGET}; move its contents into .agents/skills/ first`,
    );
  }

  return { changes, problems };
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const options = args.filter((arg) => arg.startsWith("--"));
  const positional = args.filter((arg) => !arg.startsWith("--"));
  if (positional.length > 1 || options.some((option) => option !== "--check")) {
    console.error("Usage: bun sync.ts [project-root] [--check]");
    process.exit(2);
  }
  const projectRoot = resolve(positional[0] ?? ".");
  const { changes, problems } = planSync(projectRoot);
  if (problems.length > 0) {
    console.error(`Cannot sync:\n${problems.map((p) => `- ${p}`).join("\n")}`);
    process.exit(1);
  }
  if (changes.length === 0) {
    console.log("Framework-managed material is up to date");
    process.exit(0);
  }
  const check = options.includes("--check");
  for (const change of changes) {
    if (!check) change.apply(realpathSync(projectRoot));
    console.log(`${check ? "would " : ""}${change.action} ${change.path}`);
  }
  if (check) process.exit(1);
}
