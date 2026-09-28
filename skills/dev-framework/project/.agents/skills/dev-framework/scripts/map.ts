// Generates plan/map.md and the browser view .tmp/plan/map.html from plan/nodes/*.md,
// and reports Plan structure problems.
// Usage: bun map.ts [project-root] [--check]
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

export const STATUSES = [
  "fog",
  "exploring",
  "decomposed",
  "ready",
  "in_progress",
  "done",
  "cancelled",
] as const;
export type Status = (typeof STATUSES)[number];

export interface PlanNode {
  id: string;
  title: string;
  parent: string | null;
  dependsOn: string[];
  status: Status;
  openQuestions: number;
  /** The node file after its frontmatter. */
  body: string;
  children: PlanNode[];
}

export interface Plan {
  root?: PlanNode;
  nodes: Map<string, PlanNode>;
  errors: string[];
}

const FIELDS = ["title", "parent", "depends_on", "status"];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const finished = (node: PlanNode) =>
  node.status === "done" || node.status === "cancelled";

export function countOpenQuestions(body: string): number {
  let inSection = false;
  let count = 0;
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("## ")) inSection = line.trim() === "## Open questions";
    else if (inSection && line.startsWith("- ")) count++;
  }
  return count;
}

function parseNode(
  id: string,
  text: string,
  errors: string[],
): PlanNode | undefined {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) {
    errors.push(`${id}: missing frontmatter`);
    return undefined;
  }
  let data: unknown;
  try {
    data = Bun.YAML.parse(match[1] ?? "");
  } catch (error) {
    errors.push(`${id}: frontmatter is not valid YAML (${String(error)})`);
    return undefined;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    errors.push(`${id}: frontmatter must be a mapping`);
    return undefined;
  }
  const fields = data as Record<string, unknown>;
  const before = errors.length;
  for (const key of Object.keys(fields)) {
    if (!FIELDS.includes(key))
      errors.push(`${id}: unknown frontmatter field "${key}"`);
  }
  const { title, parent, depends_on: dependsOn, status } = fields;
  if (typeof title !== "string" || title.trim() === "")
    errors.push(`${id}: title must be a nonempty string`);
  if (parent !== null && typeof parent !== "string")
    errors.push(`${id}: parent must be a node name, or null for root`);
  if (
    !Array.isArray(dependsOn) ||
    !dependsOn.every((d) => typeof d === "string")
  )
    errors.push(`${id}: depends_on must be a list of node names`);
  if (!STATUSES.includes(status as Status))
    errors.push(`${id}: status must be one of ${STATUSES.join(", ")}`);
  if (errors.length > before) return undefined;
  return {
    id,
    title: title as string,
    parent: parent as string | null,
    dependsOn: dependsOn as string[],
    status: status as Status,
    openQuestions: countOpenQuestions(text.slice(match[0].length)),
    body: text.slice(match[0].length),
    children: [],
  };
}

export function loadPlan(projectRoot: string): Plan {
  const directory = join(projectRoot, "plan", "nodes");
  const nodes = new Map<string, PlanNode>();
  const errors: string[] = [];
  if (!existsSync(directory))
    return { nodes, errors: ["plan/nodes/ does not exist"] };

  for (const file of readdirSync(directory).sort()) {
    if (!file.endsWith(".md")) continue;
    const id = file.slice(0, -".md".length);
    if (!KEBAB.test(id)) errors.push(`${id}: file name must be kebab-case`);
    const node = parseNode(
      id,
      readFileSync(join(directory, file), "utf8"),
      errors,
    );
    if (node) nodes.set(id, node);
  }

  const root = nodes.get("root");
  if (!root) errors.push("root: plan/nodes/root.md is missing or invalid");
  else if (root.parent !== null) errors.push("root: parent must be null");

  for (const node of nodes.values()) {
    if (node.parent === null) {
      if (node.id !== "root")
        errors.push(`${node.id}: only root has a null parent`);
    } else {
      const parent = nodes.get(node.parent);
      if (parent) parent.children.push(node);
      else errors.push(`${node.id}: parent "${node.parent}" does not exist`);
    }
    for (const dependency of node.dependsOn) {
      if (dependency === node.id) errors.push(`${node.id}: depends on itself`);
      else if (!nodes.has(dependency))
        errors.push(`${node.id}: depends_on "${dependency}" does not exist`);
    }
  }

  for (const node of nodes.values()) {
    const seen = new Set<string>();
    let current: PlanNode | undefined = node;
    while (current && current.parent !== null) {
      if (seen.has(current.id)) {
        errors.push(`${node.id}: its parent chain has a cycle`);
        break;
      }
      seen.add(current.id);
      current = nodes.get(current.parent);
    }
  }

  for (const node of nodes.values()) {
    node.children.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const unfinished = node.children.some((child) => !finished(child));
    if (
      (node.status === "ready" || node.status === "in_progress") &&
      unfinished
    )
      errors.push(
        `${node.id}: ${node.status} needs every child to be done or cancelled`,
      );
    if (node.status === "decomposed" && node.children.length === 0)
      errors.push(`${node.id}: decomposed needs child nodes`);
    if (node.status === "done" && unfinished)
      errors.push(`${node.id}: done needs every child to be done or cancelled`);
  }

  return { root, nodes, errors };
}

function waitingFor(node: PlanNode, nodes: Map<string, PlanNode>): string[] {
  return node.dependsOn.filter((id) => nodes.get(id)?.status !== "done");
}

const treeOrder = (node: PlanNode): PlanNode[] => [
  node,
  ...node.children.flatMap(treeOrder),
];

function checkedRoot(plan: Plan): PlanNode {
  if (!plan.root || plan.errors.length > 0)
    throw new Error("Cannot render a Plan that has problems");
  return plan.root;
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

function describe(node: PlanNode, nodes: Map<string, PlanNode>): string {
  const parts: string[] = [node.status];
  if (node.openQuestions > 0)
    parts.push(plural(node.openQuestions, "open question"));
  const waiting = waitingFor(node, nodes);
  if (waiting.length > 0 && !finished(node))
    parts.push(`waits for ${waiting.join(", ")}`);
  return parts.join(", ");
}

/** Status and open questions, for places that show waiting in another way. */
const summary = (node: PlanNode) =>
  node.openQuestions > 0
    ? `${node.status}, ${plural(node.openQuestions, "open question")}`
    : node.status;

/** The "Now possible" groups, in the order dev-next takes them. */
function possibleWork(plan: Plan): [string, PlanNode[]][] {
  const order = treeOrder(checkedRoot(plan));
  const unblocked = (node: PlanNode) =>
    waitingFor(node, plan.nodes).length === 0;
  const groups: [string, PlanNode[]][] = [
    ["Continue", order.filter((n) => n.status === "in_progress")],
    [
      "Close",
      order.filter(
        (n) => n.status === "decomposed" && n.children.every(finished),
      ),
    ],
    ["Implement", order.filter((n) => n.status === "ready" && unblocked(n))],
    [
      "Explore",
      order.filter(
        (n) => (n.status === "fog" || n.status === "exploring") && unblocked(n),
      ),
    ],
  ];
  return groups.filter(([, list]) => list.length > 0);
}

/** Leaf nodes, the units of work, and how far they have come. */
function progress(plan: Plan) {
  const all = [...plan.nodes.values()];
  const leaves = all.filter(
    (n) => n.children.length === 0 && n.status !== "cancelled",
  );
  return {
    done: leaves.filter((n) => n.status === "done").length,
    total: leaves.length,
    open: STATUSES.filter((s) => s !== "done" && s !== "cancelled")
      .map((status) => ({
        status,
        count: leaves.filter((n) => n.status === status).length,
      }))
      .filter(({ count }) => count > 0)
      .map(({ status, count }) => `${count} ${status}`),
    questions: all.reduce((sum, n) => sum + n.openQuestions, 0),
  };
}

function progressLine(plan: Plan): string {
  const { done, total, open, questions } = progress(plan);
  const breakdown = open.length > 0 ? ` (${open.join(", ")})` : "";
  return `Progress: ${done} of ${plural(total, "leaf node")} done${breakdown}; ${plural(questions, "open question")}`;
}

/**
 * Unfinished leaf nodes in steps: each node comes one step after the latest work it waits for.
 * Waiting for a parent means waiting for its unfinished leaves.
 */
export function orderSteps(plan: Plan): PlanNode[][] {
  const leaves = treeOrder(checkedRoot(plan)).filter(
    (n) => n.children.length === 0 && !finished(n),
  );
  const expand = (id: string): PlanNode[] => {
    const node = plan.nodes.get(id);
    if (!node || finished(node)) return [];
    if (node.children.length === 0) return [node];
    return node.children.flatMap((child) => expand(child.id));
  };
  const steps = new Map<string, number>();
  const visiting = new Set<string>();
  const step = (node: PlanNode): number => {
    const known = steps.get(node.id);
    if (known !== undefined) return known;
    if (visiting.has(node.id)) return 0; // A dependency cycle; stop here.
    visiting.add(node.id);
    let result = 1;
    for (const id of node.dependsOn)
      for (const dependency of expand(id))
        if (dependency !== node)
          result = Math.max(result, step(dependency) + 1);
    visiting.delete(node.id);
    steps.set(node.id, result);
    return result;
  };
  const grouped: PlanNode[][] = [];
  for (const leaf of leaves) {
    const index = step(leaf) - 1;
    grouped[index] = [...(grouped[index] ?? []), leaf];
  }
  return grouped.filter((group) => group !== undefined);
}

export function renderMap(plan: Plan): string {
  const tree: string[] = [];
  const walk = (node: PlanNode, prefix: string, childPrefix: string) => {
    tree.push(
      `${prefix}${node.id}: ${node.title} — ${describe(node, plan.nodes)}`,
    );
    node.children.forEach((child, index) => {
      const last = index === node.children.length - 1;
      walk(
        child,
        childPrefix + (last ? "└── " : "├── "),
        childPrefix + (last ? "    " : "│   "),
      );
    });
  };
  walk(checkedRoot(plan), "", "");

  const link = (node: PlanNode) => `[${node.title}](nodes/${node.id}.md)`;
  const possible = possibleWork(plan).map(
    ([label, list]) => `- ${label}: ${list.map(link).join(", ")}`,
  );
  const steps = orderSteps(plan).map(
    (group, index) => `${index + 1}. ${group.map(link).join(", ")}`,
  );

  return [
    "# Plan Map",
    "",
    "Generated from `plan/nodes/` by `.agents/skills/dev-framework/scripts/map.ts`. Do not edit. Open `.tmp/plan/map.html` in a browser for the full picture.",
    "",
    progressLine(plan),
    "",
    "```text",
    ...tree,
    "```",
    "",
    "## Now possible",
    "",
    ...(possible.length > 0
      ? possible
      : ["- Nothing: every open node is blocked or finished."]),
    "",
    "## Order",
    "",
    "Unfinished leaf nodes in dependency order. Nodes in one step do not wait for each other.",
    "",
    ...(steps.length > 0 ? steps : ["- Nothing: every leaf node is finished."]),
    "",
  ].join("\n");
}

export interface Change {
  commit: string;
  date: string;
  subject: string;
}

/** The latest commits that touched the Plan; empty outside Git. */
export function recentChanges(projectRoot: string, limit = 10): Change[] {
  const result = spawnSync(
    "git",
    [
      "-C",
      projectRoot,
      "log",
      `-${limit}`,
      "--date=short",
      "--format=%h%x09%ad%x09%s",
      "--",
      "plan/",
    ],
    { encoding: "utf8" },
  );
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [commit = "", date = "", ...subject] = line.split("\t");
      return { commit, date, subject: subject.join("\t") };
    });
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Escapes text and renders inline code and bold; links keep only their text. */
function inline(text: string): string {
  return text
    .split("`")
    .map((part, index) =>
      index % 2 === 1
        ? `<code>${escapeHtml(part)}</code>`
        : escapeHtml(part)
            .replace(/\[([^\]]+)\]\([^)\s]+\)/g, "$1")
            .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>"),
    )
    .join("");
}

/** Renders the Markdown a node section uses: paragraphs, lists, checkboxes, headings, and code. */
function blocks(lines: string[]): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  let items: string[] = [];
  let code: string[] | undefined;
  const flushParagraph = () => {
    if (paragraph.length > 0) out.push(`<p>${inline(paragraph.join(" "))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (items.length > 0) out.push(`<ul>${items.join("")}</ul>`);
    items = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (code !== undefined) {
      if (trimmed.startsWith("```")) {
        out.push(`<pre>${escapeHtml(code.join("\n"))}</pre>`);
        code = undefined;
      } else code.push(line);
      continue;
    }
    const item = /^(?:[-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/.exec(trimmed);
    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      code = [];
    } else if (trimmed === "") {
      flushParagraph();
      flushList();
    } else if (item) {
      flushParagraph();
      const box = item[1] === undefined ? "" : item[1] === " " ? "☐ " : "☑ ";
      items.push(
        `<li${box === "" ? "" : ' class="check"'}>${box}${inline(item[2] ?? "")}</li>`,
      );
    } else if (/^#{3,6}\s/.test(trimmed)) {
      flushParagraph();
      flushList();
      out.push(`<h5>${inline(trimmed.replace(/^#+\s+/, ""))}</h5>`);
    } else {
      flushList();
      paragraph.push(trimmed);
    }
  }
  if (code !== undefined) out.push(`<pre>${escapeHtml(code.join("\n"))}</pre>`);
  flushParagraph();
  flushList();
  return out.join("\n");
}

/** The node's H2 sections, in order. */
function sections(body: string): { heading: string; lines: string[] }[] {
  const result: { heading: string; lines: string[] }[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith("## "))
      result.push({ heading: line.slice(3).trim(), lines: [] });
    else result.at(-1)?.lines.push(line);
  }
  return result;
}

function criteria(node: PlanNode): { met: number; total: number } {
  const lines =
    sections(node.body).find((s) => s.heading === "Completion criteria")
      ?.lines ?? [];
  const boxes = lines
    .map((line) => /^\s*[-*+]\s+\[([ xX])\]/.exec(line)?.[1])
    .filter((box) => box !== undefined);
  return {
    met: boxes.filter((box) => box !== " ").length,
    total: boxes.length,
  };
}

const STYLE = `
:root { color-scheme: light dark; --bg: #ffffff; --fg: #1f2328; --muted: #59636e; --line: #d1d9e0; --panel: #f6f8fa;
  --fog: #818b98; --exploring: #9a6700; --decomposed: #59636e; --ready: #1a7f37; --in_progress: #0969da; --done: #8250df; --cancelled: #818b98; }
@media (prefers-color-scheme: dark) { :root { --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d; --panel: #151b23;
  --exploring: #d29922; --decomposed: #9198a1; --ready: #3fb950; --in_progress: #4493f8; --done: #ab7df8; } }
* { box-sizing: border-box; }
body { margin: 0 auto; max-width: 72rem; padding: 1.5rem 1rem 3rem; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
h1 { margin: 0; font-size: 1.6rem; } h2 { font-size: 1.05rem; margin: 2rem 0 0.75rem; } h3 { margin: 0; font-size: 1.2rem; }
h4 { margin: 1.25rem 0 0.25rem; font-size: 0.95rem; } h5 { margin: 0.75rem 0 0.25rem; font-size: 0.9rem; }
p, ul { margin: 0.25rem 0; } ul { padding-left: 1.25rem; } code, pre { font-family: ui-monospace, monospace; font-size: 0.9em; }
pre { background: var(--panel); padding: 0.5rem; overflow-x: auto; }
.muted { color: var(--muted); font-size: 0.9rem; }
.bar { height: 0.5rem; background: var(--panel); border: 1px solid var(--line); border-radius: 1rem; margin: 0.75rem 0 0.25rem; overflow: hidden; }
.bar span { display: block; height: 100%; background: var(--done); }
.fog { --c: var(--fog); } .exploring { --c: var(--exploring); } .decomposed { --c: var(--decomposed); } .ready { --c: var(--ready); }
.in_progress { --c: var(--in_progress); } .done { --c: var(--done); } .cancelled { --c: var(--cancelled); }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
.status { color: var(--c); font-size: 0.85rem; }
.dot { display: inline-block; width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--c); margin-right: 0.4rem; }
.card { display: block; width: 100%; padding: 0.4rem 0.6rem; border: 1px solid var(--line); border-left: 4px solid var(--c); border-radius: 6px; background: var(--bg); }
.steps { display: flex; gap: 0.75rem; overflow-x: auto; list-style: none; padding: 0 0 0.5rem; }
.steps > li { flex: 1 0 9rem; display: flex; flex-direction: column; gap: 0.5rem; }
.possible { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; } .possible .card { width: auto; }
.tree ul { list-style: none; padding-left: 1rem; } .tree > ul { padding-left: 0; } .tree li { margin: 0.2rem 0; }
.columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 1.5rem; align-items: start; }
.detail { position: sticky; top: 1rem; padding: 1rem; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.selected { outline: 2px solid var(--fg); outline-offset: 1px; } .before { outline: 2px dashed var(--c); } .after { outline: 2px dotted var(--c); }
.cancelled .title { text-decoration: line-through; }
li.check { list-style: none; margin-left: -1.1rem; }
@media (max-width: 48rem) { .columns { grid-template-columns: 1fr; } .detail { position: static; } }
`;

const SCRIPT = `
function select(id) {
  const detail = document.querySelector('[data-detail="' + id + '"]');
  if (!detail) return false;
  const waits = detail.dataset.deps.split(" ");
  for (const element of document.querySelectorAll("[data-detail]")) element.hidden = element !== detail;
  for (const element of document.querySelectorAll("[data-node]")) {
    const node = element.dataset.node;
    element.classList.toggle("selected", node === id);
    element.classList.toggle("before", waits.includes(node));
    element.classList.toggle("after", element.dataset.deps.split(" ").includes(id));
  }
  history.replaceState(null, "", "#" + id);
  return true;
}
document.addEventListener("click", (event) => {
  const element = event.target.closest("[data-node]");
  if (element) select(element.dataset.node);
});
if (!select(decodeURIComponent(location.hash.slice(1)))) select(document.body.dataset.start);
`;

/** A self-contained page that shows the Plan's progress, order, tree, and node details. */
export function renderHtml(plan: Plan, changes: Change[] = []): string {
  const root = checkedRoot(plan);
  const order = treeOrder(root);
  const possible = possibleWork(plan);
  const { done, total, open, questions } = progress(plan);
  const met = order.reduce((sum, n) => sum + criteria(n).met, 0);
  const allCriteria = order.reduce((sum, n) => sum + criteria(n).total, 0);
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  const attributes = (node: PlanNode) =>
    `type="button" class="${node.status}" data-node="${escapeHtml(node.id)}" data-deps="${escapeHtml(node.dependsOn.join(" "))}"`;
  const card = (node: PlanNode) =>
    `<button ${attributes(node).replace('class="', 'class="card ')}><span class="title">${escapeHtml(node.title)}</span><br><span class="status">${escapeHtml(summary(node))}</span></button>`;
  const branch = (node: PlanNode): string =>
    `<li><button ${attributes(node)}><span class="dot"></span><span class="title">${escapeHtml(node.title)}</span></button> <span class="muted">${escapeHtml(summary(node))}</span>${node.children.length > 0 ? `<ul>${node.children.map(branch).join("")}</ul>` : ""}</li>`;
  const detail = (node: PlanNode) => {
    const { met: nodeMet, total: nodeTotal } = criteria(node);
    const facts = [
      `<span class="status ${node.status}">${node.status}</span>`,
      `plan/nodes/${escapeHtml(node.id)}.md`,
      node.parent === null
        ? ""
        : `parent: ${escapeHtml(plan.nodes.get(node.parent)?.title ?? node.parent)}`,
      node.dependsOn.length > 0
        ? `depends on: ${escapeHtml(node.dependsOn.map((id) => plan.nodes.get(id)?.title ?? id).join(", "))}`
        : "",
      nodeTotal > 0 ? `${nodeMet} of ${nodeTotal} criteria met` : "",
    ].filter((fact) => fact !== "");
    const body = sections(node.body)
      .map(
        ({ heading, lines }) => `<h4>${inline(heading)}</h4>\n${blocks(lines)}`,
      )
      .join("\n");
    return `<article data-detail="${escapeHtml(node.id)}" data-deps="${escapeHtml(node.dependsOn.join(" "))}" hidden>
<h3>${escapeHtml(node.title)}</h3>
<p class="muted">${facts.join(" · ")}</p>
${body}
</article>`;
  };
  const start = possible[0]?.[1][0] ?? root;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plan Map: ${escapeHtml(root.title)}</title>
<style>${STYLE}</style>
</head>
<body data-start="${escapeHtml(start.id)}">
<header>
<h1>${escapeHtml(root.title)}</h1>
<p class="muted">Generated from <code>plan/nodes/</code> by <code>.agents/skills/dev-framework/scripts/map.ts</code>. Do not edit.</p>
<div class="bar"><span style="width: ${percent}%"></span></div>
<p>${done} of ${plural(total, "leaf node")} done${open.length > 0 ? ` · ${escapeHtml(open.join(", "))}` : ""} · ${plural(questions, "open question")} · ${met} of ${allCriteria} criteria met</p>
</header>
<main>
<h2>Now possible</h2>
${
  possible.length > 0
    ? possible
        .map(
          ([label, list]) =>
            `<p class="muted">${label}</p><ul class="possible">${list.map((n) => `<li>${card(n)}</li>`).join("")}</ul>`,
        )
        .join("\n")
    : '<p class="muted">Nothing: every open node is blocked or finished.</p>'
}
<h2>Order</h2>
<p class="muted">Unfinished leaf nodes in dependency order. Nodes in one step do not wait for each other. Select a node to see its details: a dashed outline marks the work it waits for, a dotted outline the work that waits for it.</p>
<ol class="steps">${orderSteps(plan)
    .map(
      (group, index) =>
        `<li><span class="muted">Step ${index + 1}</span>${group.map(card).join("")}</li>`,
    )
    .join("")}</ol>
<div class="columns">
<section class="tree">
<h2>Tree</h2>
<ul>${branch(root)}</ul>
</section>
<section class="detail">
${order.map(detail).join("\n")}
</section>
</div>
<h2>Recent Plan changes</h2>
${
  changes.length > 0
    ? `<ul>${changes.map((c) => `<li><code>${escapeHtml(c.commit)}</code> ${escapeHtml(c.date)} ${escapeHtml(c.subject)}</li>`).join("")}</ul>`
    : '<p class="muted">No commits touch <code>plan/</code> yet.</p>'
}
</main>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const options = args.filter((arg) => arg.startsWith("--"));
  const positional = args.filter((arg) => !arg.startsWith("--"));
  if (positional.length > 1 || options.some((option) => option !== "--check")) {
    console.error("Usage: bun map.ts [project-root] [--check]");
    process.exit(2);
  }
  const projectRoot = resolve(positional[0] ?? ".");
  const plan = loadPlan(projectRoot);
  if (plan.errors.length > 0) {
    console.error(
      `Plan problems:\n${plan.errors.map((e) => `- ${e}`).join("\n")}`,
    );
    process.exit(1);
  }
  const output = renderMap(plan);
  const path = join(projectRoot, "plan", "map.md");
  const current = existsSync(path) ? readFileSync(path, "utf8") : undefined;
  if (current === output) {
    console.log("plan/map.md is up to date");
  } else if (options.includes("--check")) {
    console.error("plan/map.md is stale; regenerate it");
    process.exit(1);
  } else {
    writeFileSync(path, output);
    console.log("Wrote plan/map.md");
  }
  if (!options.includes("--check")) {
    const html = join(projectRoot, ".tmp", "plan", "map.html");
    mkdirSync(dirname(html), { recursive: true });
    writeFileSync(html, renderHtml(plan, recentChanges(projectRoot)));
    console.log("Wrote .tmp/plan/map.html");
  }
}
