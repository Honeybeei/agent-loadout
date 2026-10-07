// Generates plan/map.md and the browser view .tmp/plan/map.html from plan/nodes/*.md,
// and reports Plan structure problems.
// Usage: bun map.ts [project-root] [--check]
// Each problem blocks the map, so a check belongs here only when an edit to the node can always fix it.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

export const KINDS = ["goal", "explore", "collaborative", "blackbox"] as const;
export type Kind = (typeof KINDS)[number];

export const STATUSES = [
  "open",
  "todo",
  "in_progress",
  "done",
  "cancelled",
] as const;
export type Status = (typeof STATUSES)[number];

const KIND_STATUSES: Record<Kind, readonly Status[]> = {
  goal: ["open", "done", "cancelled"],
  explore: ["todo", "in_progress", "done", "cancelled"],
  collaborative: ["todo", "in_progress", "done", "cancelled"],
  blackbox: ["todo", "in_progress", "done", "cancelled"],
};

/** Each kind's sections in template order, from knowledge/dev-framework/plan-documentation/; a collaborative body is free between Goal and Record. */
const TEMPLATES: Record<Kind, string[] | undefined> = {
  goal: ["Goal", "Completion criteria", "Out of scope", "Record"],
  explore: [
    "Goal",
    "Notes",
    "Tickets",
    "Decisions so far",
    "For the Plan",
    "Not yet specified",
    "Out of scope",
    "Record",
  ],
  collaborative: undefined,
  blackbox: [
    "Goal",
    "Output",
    "Completion criteria",
    "Interface",
    "Out of scope",
    "Relies on",
    "Verification",
    "Record",
  ],
};

/** Sections each kind must have; a goal holds Goal alone until it is planned. */
const REQUIRED_SECTIONS: Record<Kind, string[]> = {
  goal: ["Goal"],
  explore: ["Goal", "Record"],
  collaborative: ["Goal", "Record"],
  blackbox: ["Goal", "Output", "Completion criteria", "Verification", "Record"],
};

/** The Record line that finishing a node of each kind adds. */
const FINISHED_LINE: Record<Kind, string> = {
  goal: "Closed",
  explore: "Finished",
  collaborative: "Implemented",
  blackbox: "Implemented",
};

const TICKET = /^[-*+]\s+\[(?:grilling|research|prototype|task)\]\s/;

export interface PlanNode {
  id: string;
  title: string;
  parent: string | null;
  dependsOn: string[];
  kind: Kind;
  status: Status;
  openTickets: number;
  /** The node file after its frontmatter. */
  body: string;
  children: PlanNode[];
}

export interface Plan {
  root?: PlanNode;
  nodes: Map<string, PlanNode>;
  errors: string[];
}

const FIELDS = ["title", "parent", "depends_on", "kind", "status"];
const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const finished = (node: PlanNode) =>
  node.status === "done" || node.status === "cancelled";

/** An open goal without children, which planning has not split yet. */
const needsPlanning = (node: PlanNode) =>
  node.kind === "goal" && node.status === "open" && node.children.length === 0;

/** An open goal whose children are all finished, ready to be closed. */
const closable = (node: PlanNode) =>
  node.kind === "goal" &&
  node.status === "open" &&
  node.children.length > 0 &&
  node.children.every(finished);

/** The node's H2 sections, in order, outside fenced code. */
export function sections(body: string): { heading: string; lines: string[] }[] {
  const result: { heading: string; lines: string[] }[] = [];
  let fence: string | undefined;
  for (const line of body.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (
      marker !== undefined &&
      (fence === undefined || marker.startsWith(fence))
    )
      fence = fence === undefined ? marker : undefined;
    else if (fence === undefined && line.startsWith("## ")) {
      result.push({ heading: line.slice(3).trim(), lines: [] });
      continue;
    }
    result.at(-1)?.lines.push(line);
  }
  return result;
}

/** The list items of one section, or none when the section is missing. */
export function items(body: string, heading: string): string[] {
  const lines = sections(body).find((s) => s.heading === heading)?.lines ?? [];
  return lines.filter((line) => /^[-*+]\s/.test(line));
}

export function countOpenTickets(body: string): number {
  return items(body, "Tickets").length;
}

/**
 * Paths into the project's .tmp/ that a text names, in prose, links, or code spans, but not in fenced code.
 * A path counts when it starts a token, alone or after ./, ../, or /; the regenerable .tmp/plan/ view is allowed.
 */
export function temporaryPaths(text: string): string[] {
  const prose = text.replace(/(```|~~~)[\s\S]*?\1/g, "");
  const paths = [
    ...prose.matchAll(
      /(?<=^|[\s(["'`])(?:\.{1,2}\/)*\/?\.tmp\/[\w.<-][^\s"'`()[\]<>|,;]*/gm,
    ),
  ].map((match) => match[0].replace(/[.:]+$/, ""));
  return [...new Set(paths)].filter(
    (path) => !/^(?:\.{1,2}\/)*\/?\.tmp\/(?:plan\/|$)/.test(path),
  );
}

/** The node frame and its kind's template, as knowledge/dev-framework/plan-documentation.md defines them. */
function checkFrame(
  id: string,
  title: string,
  kind: Kind,
  status: Status,
  body: string,
  errors: string[],
): void {
  const template = `knowledge/dev-framework/plan-documentation/${kind}.md`;
  const headings = sections(body).map((s) => s.heading);
  const h1 = /^# (.*)$/m.exec(body.split(/\n## /)[0] ?? "")?.[1]?.trim();
  if (h1 !== title.trim())
    errors.push(
      `${id}: the title heading must be "# ${title.trim()}", the node's title`,
    );
  if (headings[0] !== "Goal")
    errors.push(`${id}: the first section must be "## Goal"`);
  if (headings.includes("Record") && headings.at(-1) !== "Record")
    errors.push(`${id}: "## Record" must be the last section`);
  for (const heading of REQUIRED_SECTIONS[kind])
    if (!headings.includes(heading))
      errors.push(
        `${id}: kind ${kind} needs a "## ${heading}" section; add it as the template in ${template} shows`,
      );
  const order = TEMPLATES[kind];
  if (order) {
    for (const heading of headings.filter((h) => !order.includes(h)))
      errors.push(
        `${id}: kind ${kind} has no "## ${heading}" section; move its content into a section of the template in ${template}`,
      );
    const positions = headings
      .filter((h) => order.includes(h))
      .map((h) => order.indexOf(h));
    if (
      positions.some(
        (position, i) => i > 0 && position <= (positions[i - 1] ?? -1),
      )
    )
      errors.push(
        `${id}: put the sections in the order of the template in ${template}: ${order.filter((h) => headings.includes(h)).join(", ")}`,
      );
  }
  if (kind === "explore")
    for (const ticket of items(body, "Tickets"))
      if (!TICKET.test(ticket))
        errors.push(
          `${id}: tag the ticket "${ticket.slice(2, 60).trim()}" with [grilling], [research], [prototype], or [task]`,
        );
  const record = items(body, "Record");
  const finished = FINISHED_LINE[kind];
  if (
    status === "done" &&
    !record.some((line) => new RegExp(`^[-*+]\\s+${finished}:`).test(line))
  )
    errors.push(
      `${id}: a done ${kind} needs a "${finished}:" line in Record, as ${template} says`,
    );
  if (status === "cancelled" && record.length === 0)
    errors.push(`${id}: a cancelled node states its reason in Record`);
  if (
    status === "done" &&
    items(body, "Completion criteria").some((line) =>
      /^[-*+]\s+\[ \]/.test(line),
    )
  )
    errors.push(
      `${id}: a done ${kind} has an unticked Completion criterion; tick each verified one, or reopen the node`,
    );
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
      errors.push(
        `${id}: unknown frontmatter field "${key}"; keep the five node fields, and move other content into the node body`,
      );
  }
  const { title, parent, depends_on: dependsOn, kind, status } = fields;
  if (typeof title !== "string" || title.trim() === "")
    errors.push(`${id}: title must be a nonempty string`);
  if (parent !== null && typeof parent !== "string")
    errors.push(`${id}: parent must be a node name, or null for root`);
  if (
    !Array.isArray(dependsOn) ||
    !dependsOn.every((d) => typeof d === "string")
  )
    errors.push(`${id}: depends_on must be a list of node names`);
  if (!KINDS.includes(kind as Kind))
    errors.push(`${id}: kind must be one of ${KINDS.join(", ")}`);
  else if (!KIND_STATUSES[kind as Kind].includes(status as Status))
    errors.push(
      `${id}: status must be one of ${KIND_STATUSES[kind as Kind].join(", ")} for kind ${kind}`,
    );
  if (errors.length > before) return undefined;
  const body = text.slice(match[0].length);
  checkFrame(id, title as string, kind as Kind, status as Status, body, errors);
  if (kind === "explore" && status === "done")
    for (const heading of ["Tickets", "Not yet specified"])
      if (items(body, heading).length > 0)
        errors.push(
          `${id}: a done explore leaf has no ${heading} left; resolve or move each item as Finishing in knowledge/dev-framework/plan-documentation/explore.md says`,
        );
  // A running explore or collaborative leaf is the working record; the other nodes outlive .tmp/.
  const working =
    status === "in_progress" &&
    (kind === "explore" || kind === "collaborative");
  const named = working ? [] : temporaryPaths(body);
  if (named.length > 0)
    errors.push(
      `${id}: names ${named.join(", ")} in .tmp/, which may be deleted; move what later work needs into the node or Knowledge, and remove the path`,
    );
  return {
    id,
    title: title as string,
    parent: parent as string | null,
    dependsOn: dependsOn as string[],
    kind: kind as Kind,
    status: status as Status,
    openTickets: countOpenTickets(body),
    body,
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
  else {
    if (root.parent !== null) errors.push("root: parent must be null");
    if (root.kind !== "goal") errors.push("root: kind must be goal");
  }

  for (const node of nodes.values()) {
    if (node.parent === null) {
      if (node.id !== "root")
        errors.push(`${node.id}: only root has a null parent`);
    } else {
      const parent = nodes.get(node.parent);
      if (!parent)
        errors.push(`${node.id}: parent "${node.parent}" does not exist`);
      else if (parent.kind !== "goal")
        errors.push(
          `${node.id}: parent "${node.parent}" is a leaf (${parent.kind}); only goals have children`,
        );
      else parent.children.push(node);
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
    if (node.status === "done" && !node.children.every(finished))
      errors.push(`${node.id}: done needs every child to be done or cancelled`);
  }

  const collaborating = [...nodes.values()].filter(
    (n) => n.kind === "collaborative" && n.status === "in_progress",
  );
  if (collaborating.length > 1)
    errors.push(
      `${collaborating.map((n) => n.id).join(", ")}: at most one collaborative leaf may be in_progress`,
    );

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

const plural = (count: number, word: string, words = `${word}s`) =>
  `${count} ${count === 1 ? word : words}`;

/** The status, or for an open goal the state computed from its children. */
const state = (node: PlanNode) =>
  needsPlanning(node)
    ? "needs planning"
    : closable(node)
      ? "closable"
      : node.status;

/** Kind, state, and open tickets, for places that show waiting in another way. */
function summary(node: PlanNode): string {
  const parts = [node.kind, state(node)];
  if (node.openTickets > 0) parts.push(plural(node.openTickets, "open ticket"));
  return parts.join(", ");
}

function describe(node: PlanNode, nodes: Map<string, PlanNode>): string {
  const waiting = finished(node) ? [] : waitingFor(node, nodes);
  return waiting.length > 0
    ? `${summary(node)}, waits for ${waiting.join(", ")}`
    : summary(node);
}

/** Leaves being worked: blackbox leaves by their implementation sessions, the rest by the lead session. */
const running = (plan: Plan) =>
  treeOrder(checkedRoot(plan)).filter((n) => n.status === "in_progress");

/** The "Now possible" groups of the lead session, in the order dev-next takes them. */
function possibleWork(plan: Plan): [string, PlanNode[]][] {
  const order = treeOrder(checkedRoot(plan));
  const unblocked = (node: PlanNode) =>
    waitingFor(node, plan.nodes).length === 0;
  const startable = (kind: Kind) =>
    order.filter((n) => n.kind === kind && n.status === "todo" && unblocked(n));
  const groups: [string, PlanNode[]][] = [
    ["Close", order.filter(closable)],
    ["Plan", order.filter((n) => needsPlanning(n) && unblocked(n))],
    ["Explore", startable("explore")],
    ["Collaborate", startable("collaborative")],
    ["Dispatch", startable("blackbox")],
  ];
  return groups.filter(([, list]) => list.length > 0);
}

/** Leaves, the units of work, and how far they have come. */
function progress(plan: Plan) {
  const all = [...plan.nodes.values()];
  const leaves = all.filter(
    (n) => n.kind !== "goal" && n.status !== "cancelled",
  );
  const counts = STATUSES.filter((s) => s !== "cancelled")
    .map((status) => ({
      status,
      count: leaves.filter((n) => n.status === status).length,
    }))
    .filter(({ count }) => count > 0);
  return {
    done: leaves.filter((n) => n.status === "done").length,
    total: leaves.length,
    counts,
    open: counts
      .filter(({ status }) => status !== "done")
      .map(({ status, count }) => `${count} ${status}`),
    planning: all.filter(needsPlanning).length,
    tickets: all.reduce((sum, n) => sum + n.openTickets, 0),
  };
}

function progressFacts(plan: Plan): string[] {
  const { planning, tickets } = progress(plan);
  return [
    `${plural(planning, "goal needs", "goals need")} planning`,
    plural(tickets, "open ticket"),
  ];
}

function progressLine(plan: Plan): string {
  const { done, total, open } = progress(plan);
  const breakdown = open.length > 0 ? ` (${open.join(", ")})` : "";
  return `Progress: ${done} of ${plural(total, "leaf", "leaves")} done${breakdown}; ${progressFacts(plan).join("; ")}`;
}

/** The unfinished nodes without children under a node: the node itself when it has none. */
function unfinishedLeaves(plan: Plan, id: string): PlanNode[] {
  const node = plan.nodes.get(id);
  if (!node || finished(node)) return [];
  if (node.children.length === 0) return [node];
  return node.children.flatMap((child) => unfinishedLeaves(plan, child.id));
}

/** The unfinished work a node waits for; waiting for a goal means waiting for its unfinished leaves. */
const waitedLeaves = (plan: Plan, node: PlanNode): PlanNode[] => [
  ...new Set(
    node.dependsOn
      .flatMap((id) => unfinishedLeaves(plan, id))
      .filter((leaf) => leaf !== node),
  ),
];

/**
 * Unfinished leaves and goals that need planning, in steps: each comes one step after the latest work it waits for.
 * Waiting for a goal means waiting for its unfinished leaves.
 */
export function orderSteps(plan: Plan): PlanNode[][] {
  const leaves = treeOrder(checkedRoot(plan)).filter(
    (n) => n.children.length === 0 && !finished(n),
  );
  const steps = new Map<string, number>();
  const visiting = new Set<string>();
  const step = (node: PlanNode): number => {
    const known = steps.get(node.id);
    if (known !== undefined) return known;
    if (visiting.has(node.id)) return 0; // A dependency cycle; stop here.
    visiting.add(node.id);
    let result = 1;
    for (const dependency of waitedLeaves(plan, node))
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
  const working = running(plan);

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
    ...(working.length > 0
      ? [
          "## Running",
          "",
          "Leaves being worked. Review a blackbox leaf when its report arrives.",
          "",
          ...working.map((node) => `- ${link(node)} (${node.kind})`),
          "",
        ]
      : []),
    "## Now possible",
    "",
    ...(possible.length > 0
      ? possible
      : ["- Nothing: every open node is blocked or finished."]),
    "",
    "## Order",
    "",
    "Unfinished leaves and goals that need planning, in dependency order. Nodes in one step do not wait for each other.",
    "",
    ...(steps.length > 0 ? steps : ["- Nothing: all work is finished."]),
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
  --open: #1b7c83; --todo: #1a7f37; --in_progress: #0969da; --done: #8250df; --cancelled: #818b98; }
@media (prefers-color-scheme: dark) { :root { --bg: #0d1117; --fg: #e6edf3; --muted: #9198a1; --line: #3d444d; --panel: #151b23;
  --open: #39c5cf; --todo: #3fb950; --in_progress: #4493f8; --done: #ab7df8; --cancelled: #9198a1; } }
* { box-sizing: border-box; }
body { margin: 0 auto; max-width: 72rem; padding: 1.5rem 1rem 3rem; background: var(--bg); color: var(--fg); font: 15px/1.5 system-ui, sans-serif; }
h1 { margin: 0; font-size: 1.6rem; } h2 { font-size: 1.05rem; margin: 2rem 0 0.75rem; } h3 { margin: 0; font-size: 1.2rem; }
h4 { margin: 1.25rem 0 0.25rem; font-size: 0.95rem; } h5 { margin: 0.75rem 0 0.25rem; font-size: 0.9rem; }
p, ul { margin: 0.25rem 0; } ul { padding-left: 1.25rem; } code, pre { font-family: ui-monospace, monospace; font-size: 0.9em; }
pre { background: var(--panel); padding: 0.5rem; overflow-x: auto; }
a { color: inherit; }
.muted { color: var(--muted); font-size: 0.9rem; }
.bar { display: flex; height: 0.6rem; background: var(--panel); border: 1px solid var(--line); border-radius: 1rem; margin: 0.75rem 0 0.25rem; overflow: hidden; }
.bar span { height: 100%; background: var(--c); }
.legend { display: flex; flex-wrap: wrap; gap: 0.25rem 1rem; list-style: none; padding: 0; margin: 0.5rem 0 0; }
.open { --c: var(--open); } .todo { --c: var(--todo); } .in_progress { --c: var(--in_progress); } .done { --c: var(--done); } .cancelled { --c: var(--cancelled); }
button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; text-align: left; }
.status { color: var(--c); font-size: 0.85rem; }
.dot { display: inline-block; flex: none; width: 0.6rem; height: 0.6rem; border-radius: 50%; background: var(--c); border: 2px solid var(--c); margin-right: 0.4rem; }
.cancelled .dot, .dot.cancelled { background: transparent; }
.badge { display: inline-block; margin-left: 0.35rem; padding: 0 0.4rem; border: 1px solid var(--line); border-radius: 1rem; color: var(--muted); font-size: 0.75rem; white-space: nowrap; }
.card { display: block; width: 100%; padding: 0.4rem 0.6rem; border: 1px solid var(--line); border-left: 4px solid var(--c); border-radius: 6px; background: var(--bg); }
.card.blocked { border-left-style: dashed; }
.graph { position: relative; overflow-x: auto; padding-bottom: 0.5rem; }
.edges { position: absolute; top: 0; left: 0; pointer-events: none; }
.edges path { fill: none; stroke: var(--muted); stroke-width: 1.5; opacity: 0.6; marker-end: url(#arrow); }
.edges path.on { stroke: var(--fg); stroke-width: 2; opacity: 1; marker-end: url(#arrow-on); }
.edges path.off { opacity: 0.3; }
#arrow path { fill: var(--muted); } #arrow-on path { fill: var(--fg); }
.steps { position: relative; display: flex; gap: 2.5rem; width: max-content; min-width: 100%; list-style: none; margin: 0; padding: 0; }
.steps > li { flex: 1 0 10rem; max-width: 16rem; display: flex; flex-direction: column; gap: 0.5rem; }
.possible { list-style: none; padding: 0; display: flex; flex-wrap: wrap; gap: 0.5rem; } .possible .card { width: auto; }
.tree ul { list-style: none; padding-left: 1rem; } .tree > ul { padding-left: 0; } .tree li { margin: 0.2rem 0; }
.columns { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 1.5rem; align-items: start; }
.detail { position: sticky; top: 1rem; padding: 1rem; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.relations { display: grid; grid-template-columns: max-content 1fr; gap: 0.25rem 0.75rem; margin: 0.75rem 0 0; font-size: 0.9rem; }
.relations dt { color: var(--muted); } .relations dd { margin: 0; display: flex; flex-wrap: wrap; gap: 0.1rem 0.75rem; }
.relations a { display: inline-flex; align-items: center; text-decoration: none; } .relations a:hover .title { text-decoration: underline; }
.selected { outline: 2px solid var(--fg); outline-offset: 1px; } .before { outline: 2px dashed var(--c); } .after { outline: 2px dotted var(--c); }
.cancelled .title { text-decoration: line-through; }
li.check { list-style: none; margin-left: -1.1rem; }
@media (max-width: 48rem) { .columns { grid-template-columns: 1fr; } .detail { position: static; } }
`;

const SCRIPT = `
const graph = document.querySelector(".graph");
let current = "";
function draw() {
  if (!graph) return;
  const svg = graph.querySelector(".edges");
  svg.setAttribute("width", graph.scrollWidth);
  svg.setAttribute("height", graph.scrollHeight);
  const base = graph.getBoundingClientRect();
  const cards = new Map([...graph.querySelectorAll("[data-node]")].map((card) => [card.dataset.node, card]));
  let paths = "";
  for (const [id, card] of cards) {
    for (const from of card.dataset.waits.split(" ")) {
      const source = cards.get(from);
      if (!source) continue;
      const a = source.getBoundingClientRect(), b = card.getBoundingClientRect();
      const sx = a.right - base.left + graph.scrollLeft, sy = a.top - base.top + a.height / 2;
      const tx = b.left - base.left + graph.scrollLeft - 2, ty = b.top - base.top + b.height / 2;
      const bend = Math.max(16, (tx - sx) / 2);
      paths += '<path data-from="' + from + '" data-to="' + id + '" d="M' + sx + " " + sy + " C" + (sx + bend) + " " + sy + " " + (tx - bend) + " " + ty + " " + tx + " " + ty + '"/>';
    }
  }
  const arrow = (id) => '<marker id="' + id + '" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z"/></marker>';
  svg.innerHTML = "<defs>" + arrow("arrow") + arrow("arrow-on") + "</defs>" + paths;
  highlight();
}
function highlight() {
  if (!graph) return;
  const paths = [...graph.querySelectorAll(".edges path[data-from]")];
  const touching = paths.filter((path) => path.dataset.from === current || path.dataset.to === current);
  for (const path of paths) {
    path.classList.toggle("on", touching.includes(path));
    path.classList.toggle("off", touching.length > 0 && !touching.includes(path));
  }
}
function select(id) {
  const detail = document.querySelector('[data-detail="' + id + '"]');
  if (!detail) return false;
  current = id;
  const waits = detail.dataset.deps.split(" ");
  for (const element of document.querySelectorAll("[data-detail]")) element.hidden = element !== detail;
  for (const element of document.querySelectorAll("[data-node]")) {
    const node = element.dataset.node;
    element.classList.toggle("selected", node === id);
    element.classList.toggle("before", waits.includes(node));
    element.classList.toggle("after", element.dataset.deps.split(" ").includes(id));
  }
  highlight();
  return true;
}
function show(id) {
  if (!select(id)) return;
  history.replaceState(null, "", "#" + id);
  if (matchMedia("(max-width: 48rem)").matches) document.querySelector(".detail").scrollIntoView({ block: "start" });
}
document.addEventListener("click", (event) => {
  const element = event.target.closest("[data-node], [data-go]");
  if (!element) return;
  event.preventDefault();
  show(element.dataset.node ?? element.dataset.go);
});
if (!select(decodeURIComponent(location.hash.slice(1)))) select(document.body.dataset.start);
if (graph) new ResizeObserver(draw).observe(graph);
draw();
`;

/** A self-contained page that shows the Plan's progress, order, tree, and node details. */
export function renderHtml(plan: Plan, changes: Change[] = []): string {
  const root = checkedRoot(plan);
  const order = treeOrder(root);
  const possible = possibleWork(plan);
  const working = running(plan);
  const { done, total, counts, open } = progress(plan);
  const met = order.reduce((sum, n) => sum + criteria(n).met, 0);
  const allCriteria = order.reduce((sum, n) => sum + criteria(n).total, 0);
  const neededBy = (node: PlanNode) =>
    order.filter((n) => n.dependsOn.includes(node.id));

  /** A badge for unfinished work that waits for other unfinished work. */
  const waitBadge = (node: PlanNode) => {
    const waiting = finished(node) ? [] : waitingFor(node, plan.nodes);
    if (waiting.length === 0) return "";
    const titles = waiting.map((id) => plan.nodes.get(id)?.title ?? id);
    return `<span class="badge" title="Waits for ${escapeHtml(titles.join(", "))}">waits for ${waiting.length}</span>`;
  };
  const attributes = (node: PlanNode, extra = "") => {
    const blocked =
      !finished(node) && waitingFor(node, plan.nodes).length > 0
        ? " blocked"
        : "";
    return `type="button" class="${extra}${node.status}${blocked}" data-node="${escapeHtml(node.id)}" data-deps="${escapeHtml(node.dependsOn.join(" "))}"`;
  };
  const card = (node: PlanNode, waits = "") =>
    `<button ${attributes(node, "card ")}${waits}><span class="title">${escapeHtml(node.title)}</span><br><span class="status">${escapeHtml(summary(node))}</span>${waitBadge(node)}</button>`;
  const stepCard = (node: PlanNode) =>
    card(
      node,
      ` data-waits="${escapeHtml(
        waitedLeaves(plan, node)
          .map((n) => n.id)
          .join(" "),
      )}"`,
    );
  const branch = (node: PlanNode): string =>
    `<li><button ${attributes(node)}><span class="dot"></span><span class="title">${escapeHtml(node.title)}</span></button> <span class="muted">${escapeHtml(summary(node))}</span>${waitBadge(node)}${node.children.length > 0 ? `<ul>${node.children.map(branch).join("")}</ul>` : ""}</li>`;
  const go = (node: PlanNode) =>
    `<a href="#${escapeHtml(node.id)}" data-go="${escapeHtml(node.id)}" class="${node.status}" title="${node.status}"><span class="dot"></span><span class="title">${escapeHtml(node.title)}</span></a>`;
  const detail = (node: PlanNode) => {
    const { met: nodeMet, total: nodeTotal } = criteria(node);
    const facts = [
      `<span class="status ${node.status}">${escapeHtml(summary(node))}</span>`,
      `plan/nodes/${escapeHtml(node.id)}.md`,
      nodeTotal > 0 ? `${nodeMet} of ${nodeTotal} criteria met` : "",
    ].filter((fact) => fact !== "");
    const parent =
      node.parent === null ? undefined : plan.nodes.get(node.parent);
    const relations: [string, PlanNode[]][] = [
      ["Parent", parent ? [parent] : []],
      ["Depends on", node.dependsOn.flatMap((id) => plan.nodes.get(id) ?? [])],
      ["Needed by", neededBy(node)],
      ["Children", node.children],
    ];
    const rows = relations
      .filter(([, list]) => list.length > 0)
      .map(
        ([label, list]) => `<dt>${label}</dt><dd>${list.map(go).join("")}</dd>`,
      )
      .join("");
    const body = sections(node.body)
      .map(
        ({ heading, lines }) => `<h4>${inline(heading)}</h4>\n${blocks(lines)}`,
      )
      .join("\n");
    return `<article data-detail="${escapeHtml(node.id)}" data-deps="${escapeHtml(node.dependsOn.join(" "))}" hidden>
<h3>${escapeHtml(node.title)}</h3>
<p class="muted">${facts.join(" · ")}</p>
${rows === "" ? "" : `<dl class="relations">${rows}</dl>`}
${body}
</article>`;
  };
  const start = possible[0]?.[1][0] ?? root;
  const segments = [...counts]
    .reverse()
    .map(
      ({ status, count }) =>
        `<span class="${status}" style="width: ${(count / total) * 100}%" title="${count} ${status}"></span>`,
    )
    .join("");
  const legend = STATUSES.map(
    (status) =>
      `<li class="${status} muted"><span class="dot"></span>${status}</li>`,
  ).join("");

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
<div class="bar">${segments}</div>
<p>${done} of ${plural(total, "leaf", "leaves")} done${open.length > 0 ? ` · ${escapeHtml(open.join(", "))}` : ""} · ${progressFacts(plan).join(" · ")} · ${met} of ${allCriteria} criteria met</p>
<ul class="legend">${legend}<li class="muted"><span class="badge">waits for N</span> blocked by unfinished work</li></ul>
</header>
<main>
${
  working.length > 0
    ? `<h2>Running</h2>
<p class="muted">Leaves being worked. Review a blackbox leaf when its report arrives.</p>
<ul class="possible">${working.map((n) => `<li>${card(n)}</li>`).join("")}</ul>`
    : ""
}
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
<p class="muted">Unfinished leaves and goals that need planning, in dependency order. Nodes in one step do not wait for each other; an arrow leads from work to the work that waits for it. Select a node to see its details: a dashed outline marks the work it waits for, a dotted outline the work that waits for it.</p>
<div class="graph">
<svg class="edges" aria-hidden="true"></svg>
<ol class="steps">${orderSteps(plan)
    .map(
      (group, index) =>
        `<li><span class="muted">Step ${index + 1}</span>${group.map(stepCard).join("")}</li>`,
    )
    .join("")}</ol>
</div>
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
