// Diagnoses a project against the installed Dev Framework. It changes nothing.
// Usage: bun check.ts [project-root] [--group <id>[,<id>...]|all]
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
  temporaryPaths,
} from "../project/.agents/skills/dev-framework/scripts/map.ts";
import { planSync } from "./sync.ts";

// The check groups that dev-doctor offers, in menu order.
export const GROUPS = [
  "structure",
  "plan",
  "knowledge",
  "ssot",
  "links",
  "writing",
  "leftovers",
] as const;
export type Group = (typeof GROUPS)[number];
export type Area = "managed" | Group;
export type State = "not adopted" | "outdated" | "current";
export interface Finding {
  area: Area;
  message: string;
}
// Independent pieces of work for each group's judgment checks.
export type Units = Partial<Record<Group, string[]>>;
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
const MANAGED_DOCUMENT = /^knowledge\/dev-framework(?:\.md$|\/)/;
// Progress wording that Knowledge must not hold.
const BUILD_STATUS =
  /\bnot yet (?:implemented|built)\b|\bnot (?:implemented|built) yet\b/i;
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

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function splitFrontmatter(text: string): {
  fields: Record<string, unknown> | undefined;
  body: string;
} {
  const match = FRONTMATTER.exec(text);
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
    add("structure", `dev.yaml is not valid YAML (${String(error)})`);
    return [];
  }
  const list = (data as { workspaces?: unknown } | null)?.workspaces;
  if (
    !Array.isArray(list) ||
    list.length === 0 ||
    !list.every((w) => typeof w === "string" && w !== "")
  ) {
    add(
      "structure",
      "dev.yaml must declare workspaces as a nonempty list of directory paths",
    );
    return [];
  }
  const workspaces = list.map(
    (w: string) => normalize(w).replace(/\/+$/, "") || ".",
  );
  if (workspaces.includes(".") && workspaces.length > 1)
    add("structure", 'dev.yaml: "." must be the only workspace when declared');
  for (const [index, workspace] of workspaces.entries()) {
    if (workspace === ".") continue;
    const declared = list[index] as string;
    if (isAbsolute(declared) || workspace.split("/")[0] === "..") {
      add("structure", `workspace ${declared} is outside the project`);
      continue;
    }
    if (RESERVED.includes(workspace.split("/")[0] ?? "")) {
      add("structure", `workspace ${workspace} is inside a reserved area`);
      continue;
    }
    if (!isDirectory(join(root, workspace))) {
      add("structure", `workspace ${workspace} does not exist`);
      continue;
    }
    if (!existsSync(join(root, workspace, "README.md")))
      add("structure", `workspace ${workspace} has no README.md`);
    if (
      isDirectory(join(root, workspace, "knowledge")) &&
      !existsSync(join(root, workspace, "knowledge", "README.md"))
    )
      add("structure", `${workspace}/knowledge/ has no README.md`);
    for (const other of workspaces)
      if (other.startsWith(`${workspace}/`))
        add("structure", `workspace ${other} is nested inside ${workspace}`);
  }
  return workspaces;
}

function checkKnowledge(root: string, path: string, add: Add): void {
  const file = join(root, path);
  const { fields, body } = splitFrontmatter(readFileSync(file, "utf8"));
  if (!KEBAB.test(basename(file, ".md")))
    add("knowledge", `${path}: file name must be kebab-case`);
  const titles = withoutCode(body)
    .split("\n")
    .filter((line) => line.startsWith("# ")).length;
  if (titles !== 1)
    add("knowledge", `${path}: needs exactly one H1 heading, has ${titles}`);
  const topics = fields?.canonical_for;
  if (
    !Array.isArray(topics) ||
    topics.length === 0 ||
    !topics.every((t) => typeof t === "string" && t.trim() !== "")
  )
    add(
      "knowledge",
      `${path}: frontmatter needs canonical_for, a nonempty list of topics`,
    );
  const subdocs = fields?.subdocs ?? [];
  if (
    !Array.isArray(subdocs) ||
    !subdocs.every((doc) => typeof doc === "string")
  ) {
    add("knowledge", `${path}: subdocs must be a list of paths`);
    return;
  }
  const listed = new Set(subdocs.map((doc) => resolve(dirname(file), doc)));
  for (const doc of subdocs)
    if (!existsSync(resolve(dirname(file), doc)))
      add("knowledge", `${path}: subdocs lists ${doc}, which does not exist`);
  const children = join(dirname(file), basename(file, ".md"));
  if (isDirectory(children))
    for (const child of readdirSync(children).sort())
      if (
        child.endsWith(".md") &&
        child !== "README.md" &&
        !listed.has(join(children, child))
      )
        add(
          "knowledge",
          `${path}: subdocs does not list ./${basename(children)}/${child}`,
        );
}

/** Maps each topic, compared without case, to its name and the documents that own it. */
function topicOwners(
  root: string,
  documents: string[],
): Map<string, { topic: string; owners: string[] }> {
  const topics = new Map<string, { topic: string; owners: string[] }>();
  for (const path of documents) {
    const { fields } = splitFrontmatter(readFileSync(join(root, path), "utf8"));
    const list = fields?.canonical_for;
    if (!Array.isArray(list)) continue;
    for (const topic of list) {
      if (typeof topic !== "string" || topic.trim() === "") continue;
      const key = topic.trim().toLowerCase();
      const entry = topics.get(key) ?? { topic: topic.trim(), owners: [] };
      if (!entry.owners.includes(path)) entry.owners.push(path);
      topics.set(key, entry);
    }
  }
  return topics;
}

export interface Link {
  /** The link as written, such as `guide.md#setup`. */
  target: string;
  /** The file part; empty for a link within the same document. */
  file: string;
  /** The decoded fragment, when the link has one. */
  fragment?: string;
}

/** The relative links of a Markdown text, outside code. */
export function markdownLinks(text: string): Link[] {
  return [...withoutCode(text).matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => match[1] ?? "")
    .filter((target) => !/^[a-z][a-z0-9+.-]*:/i.test(target))
    .map((target) => {
      const [file = "", raw = ""] = target.split(/#(.*)/s);
      let fragment = raw;
      try {
        fragment = decodeURIComponent(raw);
      } catch {}
      return fragment === "" ? { target, file } : { target, file, fragment };
    })
    .filter((link) => link.file !== "" || link.fragment !== undefined);
}

/** A heading's anchor as GitHub makes it from the heading's rendered text. */
const slug = (heading: string) =>
  heading
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`+([^`]*?)`+/g, "$1")
    .replace(/(^|[^\p{L}\p{N}])[*_]+(?=[\p{L}\p{N}])/gu, "$1")
    .replace(/(?<=[\p{L}\p{N}])[*_]+(?=[^\p{L}\p{N}]|$)/gu, "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");

/** The anchors a link fragment can target: ATX heading slugs, numbered when repeated, and HTML ids. */
export function anchors(text: string): Set<string> {
  const found = new Set(["top"]);
  const repeats = new Map<string, number>();
  let fence: string | undefined;
  for (const line of splitFrontmatter(text).body.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== undefined || marker !== undefined) {
      if (fence === undefined) fence = marker;
      else if (
        marker !== undefined &&
        marker[0] === fence[0] &&
        marker.length >= fence.length
      )
        fence = undefined;
      continue;
    }
    const heading = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(
      line,
    );
    if (heading) {
      const base = slug(heading[1] ?? "");
      let anchor = base;
      while (found.has(anchor)) {
        const count = (repeats.get(base) ?? 0) + 1;
        repeats.set(base, count);
        anchor = `${base}-${count}`;
      }
      found.add(anchor);
    }
    for (const match of line.matchAll(/<[a-z][^>]*\s(?:id|name)="([^"]+)"/gi))
      found.add(match[1] ?? "");
  }
  return found;
}

/** The relative links of a document, resolved to absolute paths; a link within the document resolves to itself. */
function relativeLinks(
  root: string,
  path: string,
): (Link & { resolved: string })[] {
  const document = join(root, path);
  return markdownLinks(readFileSync(document, "utf8")).map((link) => ({
    ...link,
    resolved:
      link.file === ""
        ? document
        : link.file.startsWith("/")
          ? join(root, link.file)
          : resolve(dirname(document), link.file),
  }));
}

/** Documents reachable from the root README through links, directory READMEs, and subdocs. */
function reachable(root: string): Set<string> {
  const seen = new Set(["README.md"]);
  for (const path of seen) {
    if (!existsSync(join(root, path))) continue;
    const { fields } = splitFrontmatter(readFileSync(join(root, path), "utf8"));
    const subdocs = fields?.subdocs;
    const targets = [
      ...relativeLinks(root, path).map((link) => link.resolved),
      ...(Array.isArray(subdocs) ? subdocs : [])
        .filter((doc): doc is string => typeof doc === "string")
        .map((doc) => resolve(dirname(join(root, path)), doc)),
    ];
    for (const target of targets) {
      const file = isDirectory(target) ? join(target, "README.md") : target;
      const next = relative(root, file);
      if (!next.startsWith("..") && next.endsWith(".md") && existsSync(file))
        seen.add(next);
    }
  }
  return seen;
}

/** Line numbers where a prose paragraph or list item continues on the next source line. */
export function hardWraps(text: string): number[] {
  const lines = text.split(/\r?\n/);
  const frontmatter = FRONTMATTER.exec(text)?.[0] ?? "";
  let index = frontmatter === "" ? 0 : frontmatter.split("\n").length - 1;
  let fence: string | undefined;
  let previous = "blank";
  let start = 0;
  let reported = false;
  const found: number[] = [];
  for (; index < lines.length; index++) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();
    const marker = /^(`{3,}|~{3,})/.exec(trimmed)?.[1];
    if (fence !== undefined || marker !== undefined) {
      if (fence === undefined) fence = marker;
      else if (marker?.startsWith(fence)) fence = undefined;
      previous = "code";
      continue;
    }
    let kind: string;
    if (trimmed === "") kind = "blank";
    else if (/^(?: {4}|\t)/.test(line) && ["blank", "code"].includes(previous))
      kind = "code";
    else if (trimmed.startsWith("<") || previous === "html") kind = "html";
    else if (/^(?:[-*+]|\d+[.)])(?:\s|$)/.test(trimmed)) kind = "item";
    else if (
      /^(?:#{1,6}(?:\s|$)|\||>|\[[^\]]+\]:|(?:-{3,}|\*{3,}|_{3,}|={3,})$)/.test(
        trimmed,
      )
    )
      kind = "other";
    else kind = "prose";
    if (kind === "prose" && (previous === "prose" || previous === "item")) {
      if (!reported) found.push(start + 1);
      reported = true;
    } else if (kind === "prose" || kind === "item") {
      start = index;
      reported = false;
    }
    previous = kind;
  }
  return found;
}

export function diagnose(projectRoot: string): {
  state: State;
  findings: Finding[];
  units: Units;
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
      "structure",
      "CLAUDE.md exists; AGENTS.md is the only instruction file",
    );
  for (const path of markdown) {
    if (basename(path) === "AGENTS.md" && path !== "AGENTS.md")
      add("structure", `${path}: AGENTS.md belongs only at the project root`);
    if (basename(path) === "CLAUDE.md" && path !== "CLAUDE.md")
      add("structure", `${path}: AGENTS.md is the only instruction file`);
  }
  const sync = planSync(root);
  for (const problem of sync.problems)
    add("managed", `blocks sync: ${problem}`);
  if (!exists("dev.yaml")) return { state: "not adopted", findings, units: {} };
  for (const change of sync.changes)
    add("managed", `sync would ${change.action} ${change.path}`);
  if (
    lstatSync(join(root, ".claude/skills"), { throwIfNoEntry: false }) &&
    git(root, ["ls-files", "--", ".claude/skills"]).stdout === ""
  )
    add("managed", ".claude/skills is not in Git; commit the link");
  const state: State =
    sync.changes.length > 0 || sync.problems.length > 0
      ? "outdated"
      : "current";

  // Structure
  for (const path of REQUIRED)
    if (!exists(path)) add("structure", `${path} is missing`);
  if (
    !git(root, ["check-ignore", "-v", ".tmp/probe"]).stdout.startsWith(
      ".gitignore:",
    )
  )
    add("structure", "the root .gitignore must exclude /.tmp/");
  const workspaces = checkWorkspaces(root, add);

  // Plan
  const plan = loadPlan(root);
  for (const error of plan.errors) add("plan", error);
  if (
    plan.errors.length === 0 &&
    exists("plan/map.md") &&
    readFileSync(join(root, "plan/map.md"), "utf8") !== renderMap(plan)
  )
    add("plan", "plan/map.md is stale; regenerate it with the map script");

  // Knowledge and SSoT
  const knowledgeDirectories = [
    "knowledge",
    ...workspaces.filter((w) => w !== ".").map((w) => `${w}/knowledge`),
  ].filter((directory) => isDirectory(join(root, directory)));
  const knowledge = knowledgeDirectories
    .flatMap((directory) => markdownFiles(join(root, directory)))
    .map((file) => relative(root, file))
    .filter((path) => basename(path) !== "README.md")
    .sort();
  for (const path of knowledge)
    if (!MANAGED_DOCUMENT.test(path)) checkKnowledge(root, path, add);
  const topics = [...topicOwners(root, knowledge).values()];
  for (const { topic, owners } of topics)
    if (owners.length > 1)
      add(
        "ssot",
        `"${topic}" is in canonical_for of ${owners.join(" and ")}; give it one owner`,
      );
  for (const path of knowledge) {
    if (MANAGED_DOCUMENT.test(path)) continue;
    const status = BUILD_STATUS.exec(
      withoutCode(readFileSync(join(root, path), "utf8")),
    )?.[0];
    if (status)
      add(
        "ssot",
        `${path}: says "${status}"; Knowledge states what must hold, and the Plan and the code say what is built`,
      );
  }

  // Links
  const inKnowledgeOrPlan = (path: string) =>
    path.startsWith("plan/") ||
    knowledgeDirectories.some((directory) => path.startsWith(`${directory}/`));
  const anchorsOf = new Map<string, Set<string>>();
  for (const path of markdown)
    for (const { target, fragment, resolved } of relativeLinks(root, path)) {
      const inTemporary = !relative(join(root, ".tmp"), resolved).startsWith(
        "..",
      );
      // Reported below as a .tmp/ path, or by the Plan checks for a node.
      if (inTemporary && inKnowledgeOrPlan(path)) continue;
      if (!existsSync(resolved))
        add("links", `${path}: broken link to ${target}`);
      else if (fragment !== undefined && resolved.endsWith(".md")) {
        const found =
          anchorsOf.get(resolved) ?? anchors(readFileSync(resolved, "utf8"));
        anchorsOf.set(resolved, found);
        if (!found.has(fragment))
          add(
            "links",
            `${path}: broken link to ${target}, which matches no heading`,
          );
      }
    }
  // Plan nodes are left to the Plan checks, which spare running leaves.
  for (const path of markdown)
    if (
      inKnowledgeOrPlan(path) &&
      !MANAGED_DOCUMENT.test(path) &&
      path !== "plan/map.md" &&
      !path.startsWith("plan/nodes/")
    ) {
      const named = temporaryPaths(readFileSync(join(root, path), "utf8"));
      if (named.length > 0)
        add(
          "links",
          `${path}: names ${named.join(", ")} in .tmp/, which may be deleted; move what it needs into the document, and remove the path`,
        );
    }
  const linked = reachable(root);
  const navigable = (path: string) =>
    path === "AGENTS.md" ||
    path === "plan/README.md" ||
    path === "plan/map.md" ||
    workspaces.some((w) => w !== "." && path === `${w}/README.md`) ||
    knowledgeDirectories.some((directory) => path.startsWith(`${directory}/`));
  for (const path of markdown)
    if (navigable(path) && !MANAGED_DOCUMENT.test(path) && !linked.has(path))
      add(
        "links",
        `${path}: not reachable from the root README through links or subdocs`,
      );

  // Writing: documents the project maintains, without managed and generated ones.
  const documents = markdown.filter(
    (path) =>
      !path.split("/").some((part) => part.startsWith(".")) &&
      !MANAGED_DOCUMENT.test(path) &&
      path !== "plan/map.md",
  );
  for (const path of documents) {
    const lines = hardWraps(readFileSync(join(root, path), "utf8"));
    if (lines.length > 0)
      add(
        "writing",
        `${path}: hard-wrapped prose at line ${lines.slice(0, 5).join(", ")}${lines.length > 5 ? `, and ${lines.length - 5} more` : ""}`,
      );
  }

  // Leftovers
  if (exists("plan/map.yaml"))
    add("leftovers", "plan/map.yaml is from an earlier Framework");
  if (isDirectory(join(root, ".agents/skills")))
    for (const name of readdirSync(join(root, ".agents/skills")).sort())
      if (OLD_SKILL.test(name))
        add("leftovers", `.agents/skills/${name} is from an earlier Framework`);

  const units: Units = {
    plan: documents.filter((path) => /^plan\/nodes\/[^/]+\.md$/.test(path)),
    ssot: topics
      .filter(({ owners }) => owners.some((o) => !MANAGED_DOCUMENT.test(o)))
      .map(({ topic, owners }) => `${topic}: ${owners.join(", ")}`),
    links: documents,
    writing: documents,
  };
  return { state, findings, units };
}

const USAGE = "Usage: bun check.ts [project-root] [--group <id>[,<id>...]|all]";

function print(title: string, lines: string[]): void {
  console.log(`\n${title}\n${lines.map((line) => `- ${line}`).join("\n")}`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const option = args.indexOf("--group");
  const groupArgument = option === -1 ? undefined : (args[option + 1] ?? "");
  const positional = args.filter(
    (_, i) => option === -1 || (i !== option && i !== option + 1),
  );
  const selected =
    groupArgument === "all" ? [...GROUPS] : groupArgument?.split(",");
  if (
    positional.length > 1 ||
    positional.some((arg) => arg.startsWith("--")) ||
    selected?.some((id) => !(GROUPS as readonly string[]).includes(id))
  ) {
    console.error(`${USAGE}\nGroups: ${GROUPS.join(", ")}`);
    process.exit(2);
  }
  const { state, findings, units } = diagnose(resolve(positional[0] ?? "."));
  const messages = (area: Area) =>
    findings.filter((f) => f.area === area).map((f) => f.message);
  console.log(`State: ${state}`);

  if (selected === undefined) {
    // The diagnosis: managed material, what blocks adoption, and counts per group.
    const shown =
      state === "not adopted" ? ["managed", ...GROUPS] : ["managed"];
    for (const area of shown as Area[])
      if (messages(area).length > 0)
        print(area === "managed" ? "Managed material" : area, messages(area));
    if (state === "current")
      print(
        "Groups",
        GROUPS.map((group) => `${group}: ${messages(group).length}`),
      );
    process.exit(state === "current" && findings.length === 0 ? 0 : 1);
  }

  for (const group of selected as Group[]) {
    const found = messages(group);
    console.log(`\n${group}: ${found.length} findings`);
    for (const message of found) console.log(`- ${message}`);
    const list = units[group];
    if (list === undefined) continue;
    console.log(`Judgment units: ${list.length}`);
    for (const unit of list) console.log(`- ${unit}`);
  }
  process.exit(
    findings.some((f) => (selected as string[]).includes(f.area)) ? 1 : 0,
  );
}
