// Checks a project against the rules of its copy of the Dev Framework. It changes nothing.
// Usage: bun check.ts [project-root] [--group <id>[,<id>...]]
// Each message names the rule broken and the fix. What only judgment can settle goes to review.ts.
// dev-doctor's diagnosis adds the managed material and leftovers of earlier Frameworks.
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
  knowledgeIndex,
  loadPlan,
  type PlanNode,
  renderMap,
  temporaryPaths,
} from "./map.ts";

// The groups that script findings are reported in, in order.
export const GROUPS = [
  "structure",
  "git",
  "plan",
  "knowledge",
  "ssot",
  "links",
  "writing",
] as const;
export type Group = (typeof GROUPS)[number];
export interface Finding {
  area: Group;
  message: string;
}
/** The lines that open and close a Framework-managed section of README.md or AGENTS.md. */
export const START = "<!-- dev-framework:start -->";
export const END = "<!-- dev-framework:end -->";
/** What a maintained document is, which decides the rules a review judges it against. */
export type DocumentType =
  | "agents"
  | "readme"
  | "other"
  | "knowledge"
  | "goal"
  | "explore"
  | "collaborative"
  | "blackbox";
export interface Document {
  path: string;
  type: DocumentType;
}
type Add = (area: Group, message: string) => void;

const REQUIRED = [
  "README.md",
  "AGENTS.md",
  "knowledge/README.md",
  "plan/README.md",
  "plan/map.md",
];
const RESERVED = [
  "knowledge",
  "plan",
  ".tmp",
  ".dev",
  ".git",
  ".agents",
  ".claude",
];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MANAGED_DOCUMENT = /^knowledge\/dev-framework(?:\.md$|\/)/;
// Progress wording that Knowledge must not hold.
export const BUILD_STATUS = new RegExp(
  [
    String.raw`\bnot (?:yet )?(?:been )?implemented\b`,
    String.raw`\bnot (?:yet built|built yet)\b`,
    String.raw`\bunimplemented\b`,
    String.raw`\bnot yet (?:been )?(?:built|added|installed|checked|verified|tested)\b`,
    String.raw`\b(?:has|have) (?:now |already |fully )?been implemented\b`,
    String.raw`\b(?:is|are) (?:now |already |fully )?implemented(?=\s*(?:[.,;:)]|$))`,
    String.raw`\bimplemented as (?:a )?skeletons?\b`,
  ].join("|"),
  "i",
);

function git(root: string, args: string[]) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

const isDirectory = (path: string) =>
  existsSync(path) && statSync(path).isDirectory();

const withoutCode = (text: string) =>
  text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");

/** The text with code blanked out, so line numbers stay true. */
export const blankCode = (text: string) =>
  text
    .replace(/(```|~~~)[\s\S]*?\1/g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/`[^`\n]*`/g, (span) => " ".repeat(span.length));

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
      add(
        "structure",
        `workspace ${declared} is outside the project; correct dev.yaml`,
      );
      continue;
    }
    if (RESERVED.includes(workspace.split("/")[0] ?? "")) {
      add(
        "structure",
        `workspace ${workspace} is inside a reserved area; correct dev.yaml`,
      );
      continue;
    }
    if (!isDirectory(join(root, workspace))) {
      add(
        "structure",
        `workspace ${workspace} does not exist; correct dev.yaml, or create the directory`,
      );
      continue;
    }
    if (!existsSync(join(root, workspace, "README.md")))
      add(
        "structure",
        `workspace ${workspace} has no README.md; add one that states its purpose and responsibilities`,
      );
    if (isDirectory(join(root, workspace, "knowledge")))
      add(
        "knowledge",
        `${workspace}/knowledge/ holds Knowledge outside root knowledge/; move each document into the root category whose question it answers, as Categories in knowledge/dev-framework/knowledge-documentation.md says, then fix the links to it`,
      );
    for (const other of workspaces)
      if (other.startsWith(`${workspace}/`))
        add(
          "structure",
          `workspace ${other} is nested inside ${workspace}; correct dev.yaml`,
        );
  }
  return workspaces;
}

/** Branches and worktrees against the node status they stand for, as git-workflow.md defines them. */
function checkGit(
  root: string,
  nodes: Map<string, PlanNode> | undefined,
  add: Add,
): void {
  const lines = (args: string[]) =>
    git(root, args).stdout.split("\n").filter(Boolean);
  const merged = (branch: string) =>
    git(root, ["merge-base", "--is-ancestor", branch, "main"]).status === 0;
  const branches = lines([
    "for-each-ref",
    "--format=%(refname:short)",
    "refs/heads",
  ]);
  const worktrees = git(root, ["worktree", "list", "--porcelain"])
    .stdout.split("\n\n")
    .map((entry) => ({
      path: /^worktree (.*)$/m.exec(entry)?.[1] ?? "",
      branch: /^branch refs\/heads\/(.*)$/m.exec(entry)?.[1],
    }))
    .filter((worktree) => worktree.path !== "");
  const [main, ...linked] = worktrees;
  if (!main) return;
  const place = (node: string) =>
    join(dirname(main.path), `${basename(main.path)}.worktrees`, node);
  for (const branch of branches) {
    if (branch === "main" || branch.startsWith("prototype/")) continue;
    const id = /^impl\/(.+)$/.exec(branch)?.[1];
    if (id !== undefined && !nodes) continue;
    const node = id === undefined ? undefined : nodes?.get(id);
    const state = merged(branch)
      ? "it is merged into main, so delete it"
      : "it has commits main lacks; ask the user whether to merge or discard them";
    if (id === undefined)
      add(
        "git",
        `branch ${branch} is not main, impl/<node>, or prototype/<name>; ${state}`,
      );
    else if (!node)
      add("git", `branch ${branch} has no node plan/nodes/${id}.md; ${state}`);
    else if (node.kind !== "blackbox" && node.kind !== "collaborative")
      add(
        "git",
        `branch ${branch} belongs to a ${node.kind} node; only implementation leaves have one; ${state}`,
      );
    else if (node.status !== "in_progress")
      add(
        "git",
        `branch ${branch} remains while ${id} is ${node.status}; ${state}, removing its worktree first`,
      );
  }
  if (!nodes) return;
  for (const node of nodes.values()) {
    if (node.status !== "in_progress") continue;
    const branch = `impl/${node.id}`;
    if (
      (node.kind === "blackbox" || node.kind === "collaborative") &&
      !branches.includes(branch)
    )
      add(
        "git",
        `${node.id} is an in_progress ${node.kind} leaf without ${branch}; create the branch as git-workflow.md says, or set the leaf back to todo`,
      );
    if (
      node.kind === "blackbox" &&
      branches.includes(branch) &&
      !linked.some((w) => w.branch === branch && w.path === place(node.id))
    )
      add(
        "git",
        `${node.id}: ${branch} is not checked out at ${place(node.id)}, where git-workflow.md puts a blackbox leaf's worktree`,
      );
  }
  for (const worktree of linked) {
    const id = /^impl\/(.+)$/.exec(worktree.branch ?? "")?.[1];
    const node = id === undefined ? undefined : nodes.get(id);
    if (worktree.branch?.startsWith("prototype/")) continue;
    if (node?.kind !== "blackbox" || node.status !== "in_progress")
      add(
        "git",
        `worktree ${worktree.path} holds ${worktree.branch ?? "a detached HEAD"}, which no in_progress blackbox leaf owns; remove it once the user confirms its session is closed and its work is preserved`,
      );
  }
}

function checkKnowledge(root: string, path: string, add: Add): void {
  const file = join(root, path);
  const { fields, body } = splitFrontmatter(readFileSync(file, "utf8"));
  if (!KEBAB.test(basename(file, ".md")))
    add(
      "knowledge",
      `${path}: file name must be kebab-case; rename it, and update its incoming links and subdocs entries`,
    );
  const titles = withoutCode(body)
    .split("\n")
    .filter((line) => line.startsWith("# ")).length;
  if (titles !== 1)
    add(
      "knowledge",
      `${path}: needs exactly one H1 heading, has ${titles}; keep one title, and demote the other headings`,
    );
  const topics = fields?.canonical_for;
  if (
    !Array.isArray(topics) ||
    topics.length === 0 ||
    !topics.every((t) => typeof t === "string" && t.trim() !== "")
  )
    add(
      "knowledge",
      `${path}: frontmatter needs canonical_for, a nonempty list of topics; list the topics the document owns`,
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
      add(
        "knowledge",
        `${path}: subdocs lists ${doc}, which does not exist; correct or remove the entry`,
      );
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
          `${path}: subdocs does not list ./${basename(children)}/${child}; add it`,
        );
}

/** Maps each topic, compared without case, to its name and the documents that own it. */
export function topicOwners(
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

/** The anchors a link fragment can target: heading slugs, numbered when repeated, HTML ids, and `top`. */
export function anchors(text: string): Set<string> {
  const found = new Set<string>();
  const repeats = new Map<string, number>();
  const add = (heading: string) => {
    const base = slug(heading);
    let anchor = base;
    while (found.has(anchor)) {
      const count = (repeats.get(base) ?? 0) + 1;
      repeats.set(base, count);
      anchor = `${base}-${count}`;
    }
    found.add(anchor);
  };
  let fence: string | undefined;
  let previous = "";
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
      previous = "";
      continue;
    }
    const atx = /^ {0,3}#{1,6}(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(line);
    // A setext underline makes the paragraph line above it a heading.
    const setext =
      /^ {0,3}(?:=+|-+)[ \t]*$/.test(line) &&
      /^ {0,3}[^\s#>|*+\-`~<]/.test(previous) &&
      !/^ {0,3}\d+[.)]\s/.test(previous);
    if (atx) add(atx[1] ?? "");
    else if (setext) add(previous);
    for (const match of line.matchAll(/<[a-z][^>]*\s(?:id|name)="([^"]+)"/gi))
      found.add(match[1] ?? "");
    previous = atx || setext ? "" : line;
  }
  found.add("top");
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

/** The findings of every group, and the documents a review judges; none without dev.yaml but misplaced instruction files. */
export function check(projectRoot: string): {
  findings: Finding[];
  documents: Document[];
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
      "CLAUDE.md exists; AGENTS.md is the only instruction file; move its rules into AGENTS.md, outside the managed section, then delete it",
    );
  for (const path of markdown) {
    if (basename(path) === "AGENTS.md" && path !== "AGENTS.md")
      add(
        "structure",
        `${path}: AGENTS.md belongs only at the project root; move its rules into the root AGENTS.md, outside the managed section, then delete it`,
      );
    if (basename(path) === "CLAUDE.md" && path !== "CLAUDE.md")
      add(
        "structure",
        `${path}: AGENTS.md is the only instruction file; move its rules into the root AGENTS.md, outside the managed section, then delete it`,
      );
  }
  if (!exists("dev.yaml")) return { findings, documents: [] };

  // Structure
  for (const path of REQUIRED)
    if (!exists(path))
      add(
        "structure",
        path === "plan/map.md" || path === "knowledge/README.md"
          ? `${path} is missing; generate it with the map script`
          : `${path} is missing; create it as dev-doctor's Adopt describes`,
      );
  if (
    !git(root, ["check-ignore", "-v", ".tmp/probe"]).stdout.startsWith(
      ".gitignore:",
    )
  )
    add(
      "structure",
      "the root .gitignore must exclude /.tmp/; add a /.tmp/ line",
    );
  const workspaces = checkWorkspaces(root, add);

  // Plan
  const plan = loadPlan(root);
  for (const error of plan.errors) add("plan", error);
  // Nodes that failed to load would make their branches look orphaned.
  checkGit(root, plan.errors.length > 0 ? undefined : plan.nodes, add);
  if (
    plan.errors.length === 0 &&
    exists("plan/map.md") &&
    readFileSync(join(root, "plan/map.md"), "utf8") !== renderMap(plan)
  )
    add("plan", "plan/map.md is stale; regenerate it with the map script");

  // Knowledge and SSoT
  const knowledge = (
    isDirectory(join(root, "knowledge"))
      ? markdownFiles(join(root, "knowledge"))
      : []
  )
    .map((file) => relative(root, file))
    .filter((path) => basename(path) !== "README.md")
    .sort();
  for (const path of knowledge)
    if (!MANAGED_DOCUMENT.test(path)) checkKnowledge(root, path, add);
  const index = knowledgeIndex(root);
  for (const error of index.errors) add("knowledge", error);
  if (
    index.errors.length === 0 &&
    exists("knowledge/README.md") &&
    readFileSync(join(root, "knowledge/README.md"), "utf8") !== index.text
  )
    add(
      "knowledge",
      "knowledge/README.md is stale; regenerate it with the map script",
    );
  const topics = [...topicOwners(root, knowledge).values()];
  for (const { topic, owners } of topics)
    if (owners.length > 1)
      add(
        "ssot",
        owners.some((o) => MANAGED_DOCUMENT.test(o))
          ? `"${topic}" is in canonical_for of ${owners.join(" and ")}; the Framework owns it, so remove the restated rule, link to the Framework's, and keep only project-specific rules, under a topic the Framework does not own`
          : `"${topic}" is in canonical_for of ${owners.join(" and ")}; give it one owner, which keeps the detail, and leave a short summary with a link in the other`,
      );
  for (const path of knowledge) {
    if (MANAGED_DOCUMENT.test(path)) continue;
    blankCode(readFileSync(join(root, path), "utf8"))
      .split("\n")
      .forEach((line, index) => {
        const status = BUILD_STATUS.exec(line)?.[0];
        if (status)
          add(
            "ssot",
            `${path}:${index + 1}: says "${status}"; Knowledge never states how far something is built, since the Plan and the code say that; keep the design and drop the status`,
          );
      });
  }

  // Links
  const inKnowledgeOrPlan = (path: string) =>
    path.startsWith("plan/") || path.startsWith("knowledge/");
  const anchorsOf = new Map<string, Set<string>>();
  for (const path of markdown)
    for (const { target, fragment, resolved } of relativeLinks(root, path)) {
      const inTemporary = !relative(join(root, ".tmp"), resolved).startsWith(
        "..",
      );
      // Reported below as a .tmp/ path, or by the Plan checks for a node.
      if (inTemporary && inKnowledgeOrPlan(path)) continue;
      if (!existsSync(resolved))
        add(
          "links",
          `${path}: broken link to ${target}; point it to the current path, or remove it when the target is gone for good`,
        );
      else if (fragment !== undefined && resolved.endsWith(".md")) {
        const found =
          anchorsOf.get(resolved) ?? anchors(readFileSync(resolved, "utf8"));
        anchorsOf.set(resolved, found);
        if (!found.has(fragment))
          add(
            "links",
            `${path}: broken link to ${target}, which matches no heading; point it to an existing heading`,
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
  // The links each entry point owes, as the README and AGENTS guideline's Responsibilities say.
  const owed: [string, string[]][] = [
    [
      "README.md",
      [
        "AGENTS.md",
        "knowledge/README.md",
        "plan/README.md",
        ...workspaces.filter((w) => w !== ".").map((w) => `${w}/README.md`),
      ],
    ],
    ["plan/README.md", ["plan/map.md"]],
  ];
  for (const [from, targets] of owed) {
    if (!exists(from)) continue;
    const reached = new Set(
      relativeLinks(root, from).map(({ resolved }) =>
        relative(
          root,
          isDirectory(resolved) ? join(resolved, "README.md") : resolved,
        ),
      ),
    );
    for (const target of targets)
      if (exists(target) && !reached.has(target))
        add(
          "links",
          `${from}: link to ${target}, as the Responsibilities in knowledge/dev-framework/readme-agents-guideline.md require`,
        );
  }
  const linked = reachable(root);
  const navigable = (path: string) =>
    path === "AGENTS.md" ||
    path === "plan/README.md" ||
    path === "plan/map.md" ||
    workspaces.some((w) => w !== "." && path === `${w}/README.md`) ||
    path.startsWith("knowledge/");
  for (const path of markdown)
    if (navigable(path) && !MANAGED_DOCUMENT.test(path) && !linked.has(path))
      add(
        "links",
        `${path}: not reachable from the root README through links or subdocs; link it from the index of its area: a README, knowledge/README.md, or its parent's subdocs`,
      );

  // Writing: documents the project maintains, without managed and generated ones.
  const documents = markdown.filter(
    (path) =>
      !path.split("/").some((part) => part.startsWith(".")) &&
      !MANAGED_DOCUMENT.test(path) &&
      path !== "plan/map.md" &&
      path !== "knowledge/README.md",
  );
  for (const path of documents) {
    const lines = hardWraps(readFileSync(join(root, path), "utf8"));
    if (lines.length > 0)
      add(
        "writing",
        `${path}: hard-wrapped prose at line ${lines.slice(0, 5).join(", ")}${lines.length > 5 ? `, and ${lines.length - 5} more` : ""}; join each paragraph or list item onto one line`,
      );
  }

  const typeOf = (path: string): DocumentType => {
    const node = /^plan\/nodes\/([^/]+)\.md$/.exec(path)?.[1];
    if (node !== undefined) return plan.nodes.get(node)?.kind ?? "other";
    if (path === "AGENTS.md") return "agents";
    if (basename(path) === "README.md") return "readme";
    return knowledge.includes(path) ? "knowledge" : "other";
  };
  return {
    findings,
    documents: documents.map((path) => ({ path, type: typeOf(path) })),
  };
}

const USAGE = "Usage: bun check.ts [project-root] [--group <id>[,<id>...]]";

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--group");
  const selected = at < 0 ? [...GROUPS] : (args[at + 1] ?? "").split(",");
  const positional =
    at < 0 ? args : [...args.slice(0, at), ...args.slice(at + 2)];
  if (
    positional.length > 1 ||
    positional.some((arg) => arg.startsWith("--")) ||
    selected.some((id) => !(GROUPS as readonly string[]).includes(id))
  ) {
    console.error(`${USAGE}\nGroups: ${GROUPS.join(", ")}`);
    process.exit(2);
  }
  const { findings } = check(resolve(positional[0] ?? "."));
  for (const group of selected) {
    const found = findings.filter((f) => f.area === group);
    console.log(`${group}: ${found.length} findings`);
    for (const { message } of found) console.log(`- ${message}`);
  }
  process.exit(findings.some((f) => selected.includes(f.area)) ? 1 : 0);
}
