// Generates plan/map.md from plan/nodes/*.md and reports Plan structure problems.
// Usage: bun map.ts [project-root] [--check]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

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

export function renderMap(plan: Plan): string {
  const { root, nodes } = plan;
  if (!root || plan.errors.length > 0)
    throw new Error("Cannot render a Plan that has problems");

  const tree: string[] = [];
  const order: PlanNode[] = [];
  const describe = (node: PlanNode) => {
    const parts: string[] = [node.status];
    if (node.openQuestions > 0)
      parts.push(
        `${node.openQuestions} open question${node.openQuestions === 1 ? "" : "s"}`,
      );
    const waiting = waitingFor(node, nodes);
    if (waiting.length > 0 && !finished(node))
      parts.push(`waits for ${waiting.join(", ")}`);
    return `${node.id}: ${node.title} — ${parts.join(", ")}`;
  };
  const walk = (node: PlanNode, prefix: string, childPrefix: string) => {
    tree.push(prefix + describe(node));
    order.push(node);
    node.children.forEach((child, index) => {
      const last = index === node.children.length - 1;
      walk(
        child,
        childPrefix + (last ? "└── " : "├── "),
        childPrefix + (last ? "    " : "│   "),
      );
    });
  };
  walk(root, "", "");

  const unblocked = (node: PlanNode) => waitingFor(node, nodes).length === 0;
  const link = (node: PlanNode) => `[${node.title}](nodes/${node.id}.md)`;
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
  const possible = groups
    .filter(([, list]) => list.length > 0)
    .map(([label, list]) => `- ${label}: ${list.map(link).join(", ")}`);

  return [
    "# Plan Map",
    "",
    "Generated from `plan/nodes/` by `.agents/skills/dev-framework/scripts/map.ts`. Do not edit.",
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
  ].join("\n");
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
}
