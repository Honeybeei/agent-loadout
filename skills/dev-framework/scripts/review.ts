// Prepares dev-doctor's reviews, the checks only judgment can settle. It changes nothing.
// Usage: bun review.ts [project-root] <defect|polish> [--changed-since <commit>] [--batch <n>]
// Documents of one type are packed into batches, each with the rule sections that type is judged
// against and the leads scripts found: spots a judge must look at, which may or may not break a rule.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  items,
  loadPlan,
  type PlanNode,
  sections,
} from "../project/.agents/skills/dev-framework/scripts/map.ts";
import {
  BUILD_STATUS,
  blankCode,
  type DocumentType,
  diagnose,
  markdownLinks,
  topicOwners,
} from "./check.ts";
import { documentOf, readFindings } from "./findings.ts";
import { END, START } from "./sync.ts";

export const REVIEWS = ["defect", "polish"] as const;
export type Review = (typeof REVIEWS)[number];

/** The batch order: entry points first, then Knowledge, then the Plan from the top down. */
export const TYPES: DocumentType[] = [
  "agents",
  "readme",
  "other",
  "knowledge",
  "goal",
  "explore",
  "collaborative",
  "blackbox",
];

/** Words of project text per batch; a larger document gets a batch of its own. */
export const BUDGET = 5000;

export const RULES_DIRECTORY = "knowledge/dev-framework";

const NODE = [
  "plan-documentation.md#node-frame",
  "plan-documentation.md#recording-decisions",
  "knowledge-documentation.md#what-knowledge-holds",
  "project-structure.md#temporary-material",
  "readme-agents-guideline.md#navigation",
  "knowledge-documentation.md#glossary",
  "writing-rules.md#language",
];

/**
 * The rule sections each type of document is judged against, in the project's copies under
 * knowledge/dev-framework/. A path without a fragment means every section of that document.
 */
export const RULES: Record<Review, Record<DocumentType, string[]>> = {
  defect: {
    agents: [
      "readme-agents-guideline.md#responsibilities",
      "readme-agents-guideline.md#agentsmd",
      "project-structure.md#framework-managed-material",
      "knowledge-documentation.md#what-knowledge-holds",
      "workflow.md",
      "git-workflow.md",
      "knowledge-documentation.md#glossary",
      "writing-rules.md#language",
    ],
    readme: [
      "readme-agents-guideline.md#responsibilities",
      "readme-agents-guideline.md#navigation",
      "knowledge-documentation.md#what-knowledge-holds",
      "knowledge-documentation.md#glossary",
      "writing-rules.md#language",
    ],
    other: [
      "readme-agents-guideline.md#navigation",
      "knowledge-documentation.md#what-knowledge-holds",
      "knowledge-documentation.md#glossary",
      "writing-rules.md#language",
    ],
    knowledge: [
      "knowledge-documentation.md#what-knowledge-holds",
      "knowledge-documentation.md#glossary",
      "knowledge-documentation.md#maintenance",
      "project-structure.md#framework-managed-material",
      "project-structure.md#temporary-material",
      "readme-agents-guideline.md#navigation",
      "writing-rules.md#language",
    ],
    goal: [
      ...NODE,
      "plan-documentation.md#kinds",
      "plan-documentation.md#status",
      "plan-documentation/goal.md",
    ],
    explore: [
      ...NODE,
      "plan-documentation.md#kinds",
      "plan-documentation/explore.md",
    ],
    collaborative: [...NODE, "plan-documentation/collaborative.md"],
    blackbox: [...NODE, "plan-documentation/blackbox.md"],
  },
  polish: {
    agents: [
      "writing-rules.md#documentation-style",
      "readme-agents-guideline.md#navigation",
    ],
    readme: [
      "writing-rules.md#documentation-style",
      "readme-agents-guideline.md#navigation",
    ],
    other: [
      "writing-rules.md#documentation-style",
      "readme-agents-guideline.md#navigation",
    ],
    knowledge: [
      "writing-rules.md#documentation-style",
      "knowledge-documentation.md#links-and-reading",
      "knowledge-documentation.md#length",
    ],
    goal: [
      "writing-rules.md#documentation-style",
      "plan-documentation.md#recording-decisions",
    ],
    explore: [
      "writing-rules.md#documentation-style",
      "plan-documentation.md#recording-decisions",
    ],
    collaborative: [
      "writing-rules.md#documentation-style",
      "plan-documentation.md#recording-decisions",
    ],
    blackbox: [
      "writing-rules.md#documentation-style",
      "plan-documentation.md#recording-decisions",
    ],
  },
};

/** Rule sections no review judges: scripts check them, or they govern steps rather than documents. */
export const UNREVIEWED = [
  "writing-rules.md#prose-wrapping",
  "project-structure.md#project-root",
  "project-structure.md#root-layout",
  "project-structure.md#workspaces",
  "project-structure.md#version-control",
  "knowledge-documentation.md#form",
  "knowledge-documentation.md#subdocuments",
  "plan-documentation.md#layout",
  "plan-documentation.md#frontmatter",
  "plan-documentation.md#map",
];

export interface Entry {
  path: string;
  type: DocumentType;
  words: number;
  /** Status, children, leads, and declined findings, one line each. */
  notes: string[];
}

export interface Batch {
  type: DocumentType;
  entries: Entry[];
}

function git(root: string, args: string[]) {
  return spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
}

const wordCount = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Lines outside frontmatter and code, numbered from 1 as in the file. */
function proseLines(text: string): { number: number; text: string }[] {
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text)?.[0];
  const offset = frontmatter ? frontmatter.split("\n").length - 1 : 0;
  // A Framework-managed section is the Framework's text, which no review judges.
  let managed = false;
  return blankCode(text.slice(frontmatter?.length ?? 0))
    .split("\n")
    .map((line, index) => {
      if (line.trimEnd() === START) managed = true;
      const kept = managed ? "" : line;
      if (line.trimEnd() === END) managed = false;
      return { number: index + 1 + offset, text: kept };
    })
    .filter((line) => line.text.trim() !== "");
}

const short = (text: string, length = 70) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > length ? `${flat.slice(0, length - 1)}…` : flat;
};

/** The rule files a type's rules for a review read, relative to the project root. */
export const ruleFiles = (review: Review, type: DocumentType) => [
  ...new Set(
    RULES[review][type].map(
      (rule) => `${RULES_DIRECTORY}/${rule.split("#")[0] ?? ""}`,
    ),
  ),
];

/** Words of eight in a row, the unit two texts must share to count as overlapping. */
const SHINGLE = 8;
const words = (line: string) =>
  line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) ?? [];
const shingles = (line: string) => {
  const list = words(line);
  return list
    .slice(0, Math.max(0, list.length - SHINGLE + 1))
    .map((_, i) => list.slice(i, i + SHINGLE).join(" "));
};
/** A repeat counts when it runs this many words, or covers this share of the line. */
const REPEAT_WORDS = 12;
const REPEAT_SHARE = 0.6;
const REPEATS_PER_DOCUMENT = 5;

const NON_ENGLISH =
  /[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Thai}\p{Script=Devanagari}]+/u;
const PROGRESS =
  /\b(?:not yet|yet to|so far|until then|for now|currently|at the moment|skeleton|TODO)\b/i;
const DATE = /\b\d{4}-\d{2}-\d{2}\b/;
const QUESTION =
  /\?\s*$|^[-*+]\s+(?:how|where|which|whether|what|when|why|should)\b/i;
const LONG_ITEM = 50;
const LEADS_PER_DOCUMENT = 12;

/** Spots in each document that a judge must look at, keyed by path. */
function findLeads(
  root: string,
  review: Review,
  documents: { path: string; type: DocumentType }[],
  everyDocument: { path: string; type: DocumentType }[],
  nodes: Map<string, PlanNode>,
  knowledgeDirectories: string[],
): Map<string, string[]> {
  const leads = new Map<string, string[]>();
  const add = (path: string, lead: string) =>
    leads.set(path, [...(leads.get(path) ?? []), lead]);
  const text = (path: string) => readFileSync(join(root, path), "utf8");
  const nodeOf = (path: string) =>
    nodes.get(/^plan\/nodes\/([^/]+)\.md$/.exec(path)?.[1] ?? "");

  if (review === "polish") {
    for (const { path, type } of documents) {
      const content = text(path);
      const lines = content.split("\n").length;
      if (type === "knowledge" && lines > 150)
        add(
          path,
          `${lines} lines, above the 150 at which Length asks to compress or split`,
        );
      const node = nodeOf(path);
      if (node)
        for (const item of items(node.body, "Record"))
          if (wordCount(item) > LONG_ITEM)
            add(
              path,
              `a Record line of ${wordCount(item)} words: "${short(item)}"`,
            );
    }
    return leads;
  }

  // Lines that repeat another document: Knowledge, a node, or a Framework rule.
  const corpus = [
    ...everyDocument.filter(
      (d) => d.type !== "agents" && d.type !== "readme" && d.type !== "other",
    ),
    ...listRules(root).map((path) => ({ path, type: "knowledge" as const })),
  ];
  const index = new Map<string, string[]>();
  for (const { path } of corpus)
    for (const line of proseLines(text(path)))
      for (const shingle of shingles(line.text))
        index.set(shingle, [
          ...(index.get(shingle) ?? []),
          `${path}:${line.number}`,
        ]);
  /** The other line this one repeats most, when the repeat is long enough to matter. */
  const repeats = (path: string, line: string) => {
    // A line that links the document it repeats is a summary with its link, which passes.
    const linked = markdownLinks(line).map((link) =>
      relative(
        root,
        resolve(dirname(join(root, path)), link.file || basename(path)),
      ),
    );
    const hits = new Map<string, number>();
    for (const shingle of shingles(line))
      for (const at of new Set(index.get(shingle))) {
        const other = at.slice(0, at.lastIndexOf(":"));
        if (other !== path && !linked.includes(other))
          hits.set(at, (hits.get(at) ?? 0) + 1);
      }
    const [at, count] = [...hits].sort((a, b) => b[1] - a[1])[0] ?? [];
    if (at === undefined || count === undefined) return undefined;
    const run = count + SHINGLE - 1;
    return run >= REPEAT_WORDS || run >= words(line).length * REPEAT_SHARE
      ? { at, run }
      : undefined;
  };

  const glossary = glossaryAvoids(root);
  for (const { path, type } of documents) {
    const content = text(path);
    const node = nodeOf(path);
    const repeated: { lead: string; run: number }[] = [];
    for (const line of proseLines(content)) {
      // Words in link targets are paths, not prose.
      const visible = line.text.replace(/\]\([^)]*\)/g, "]");
      const foreign = NON_ENGLISH.exec(visible)?.[0];
      if (foreign)
        add(
          path,
          `line ${line.number} has non-English text "${short(foreign, 30)}"`,
        );
      const repeat = repeats(path, line.text);
      if (repeat)
        repeated.push({
          run: repeat.run,
          lead: `line ${line.number} repeats ${repeat.run} or more words of ${repeat.at}: a gist with a link, or a second owner? "${short(line.text)}"`,
        });
      if (path !== "knowledge/glossary.md")
        for (const { word, term, used } of glossary)
          if (used(visible))
            add(
              path,
              `line ${line.number} uses ${word}, which the glossary avoids in favor of "${term}": the same sense?`,
            );
      if (type === "knowledge") {
        // A line the build-status check reports needs no lead.
        const progress = BUILD_STATUS.test(visible)
          ? undefined
          : PROGRESS.exec(visible)?.[0];
        if (progress)
          add(
            path,
            `line ${line.number} says "${progress}": build status, or a fact about the product?`,
          );
        const date = DATE.exec(visible)?.[0];
        if (date)
          add(
            path,
            `line ${line.number} has the date ${date}: history, or when a fact was checked?`,
          );
      }
    }
    for (const { lead } of repeated
      .sort((a, b) => b.run - a.run)
      .slice(0, REPEATS_PER_DOCUMENT))
      add(path, lead);
    if (type === "knowledge")
      for (const link of markdownLinks(content)) {
        const target = relative(
          root,
          resolve(dirname(join(root, path)), link.file),
        );
        const home = knowledgeDirectories.find((d) => path.startsWith(`${d}/`));
        const other = knowledgeDirectories.find((d) =>
          target.startsWith(`${d}/`),
        );
        if (target.startsWith("plan/nodes/") && target !== "plan/nodes/root.md")
          add(path, `links ${target}: work history or status in Knowledge?`);
        else if (
          other &&
          home &&
          other !== home &&
          home !== "knowledge" &&
          other !== "knowledge"
        )
          add(
            path,
            `links ${target} in another workspace's Knowledge: should the shared part live in root knowledge/?`,
          );
      }
    if (node) nodeLeads(root, path, node, (lead) => add(path, lead));
  }
  return leads;
}

function nodeLeads(
  root: string,
  path: string,
  node: PlanNode,
  add: (lead: string) => void,
): void {
  const goal = sections(node.body).find((s) => s.heading === "Goal");
  const record = items(node.body, "Record");
  if (goal && !record.some((line) => /^[-*+]\s+Goal changed:/.test(line))) {
    const first = firstVersion(root, path);
    const original =
      first === undefined
        ? undefined
        : sections(
            first.slice(
              /^---\r?\n[\s\S]*?\r?\n---/.exec(first)?.[0].length ?? 0,
            ),
          ).find((s) => s.heading === "Goal");
    const flat = (lines: string[]) =>
      lines.join(" ").replace(/\s+/g, " ").trim();
    if (original && flat(original.lines) !== flat(goal.lines))
      add(
        `its Goal differs from the node's first version, and Record has no "Goal changed:" line: did the meaning change?`,
      );
  }
  const finished = node.status === "done";
  for (const section of sections(node.body)) {
    if (section.heading === "Record") continue;
    for (const item of section.lines.filter((line) => /^[-*+]\s/.test(line))) {
      if (finished && node.kind !== "goal" && wordCount(item) > LONG_ITEM)
        add(
          `a ${wordCount(item)}-word line under ${section.heading} in a finished node: a gist with a link, or detail its owner should hold? "${short(item)}"`,
        );
      const asks =
        (node.kind === "explore" && section.heading === "Not yet specified") ||
        (finished &&
          section.heading !== "Decisions so far" &&
          !item.includes("→"));
      if (asks && QUESTION.test(item))
        add(
          `a question under ${section.heading}: ${node.status === "done" ? "is it answered and accounted for?" : "can it be stated precisely as a ticket?"} "${short(item)}"`,
        );
    }
  }
  if (node.kind === "goal") {
    if (
      node.children.length > 0 &&
      !sections(node.body).some((s) => s.heading === "Completion criteria")
    )
      add("a planned goal without Completion criteria: are they known yet?");
  }
}

/** The node's text when Git first saw it, following renames, or undefined when it is not committed. */
function firstVersion(root: string, path: string): string | undefined {
  let commit: string | undefined;
  let name: string | undefined;
  for (const line of git(root, [
    "log",
    "--follow",
    "--format=commit %h",
    "--name-only",
    "--",
    path,
  ])
    .stdout.split("\n")
    .filter(Boolean))
    if (line.startsWith("commit ")) commit = line.slice("commit ".length);
    else name = line;
  if (!commit || !name) return undefined;
  const shown = git(root, ["show", `${commit}:${name}`]);
  return shown.status === 0 ? shown.stdout : undefined;
}

/** The words the glossary says to avoid, each with a test for a line and the term to use instead. */
function glossaryAvoids(
  root: string,
): { word: string; term: string; used: (line: string) => boolean }[] {
  const path = join(root, "knowledge/glossary.md");
  if (!existsSync(path)) return [];
  const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const avoids: {
    word: string;
    term: string;
    used: (line: string) => boolean;
  }[] = [];
  for (const match of readFileSync(path, "utf8").matchAll(
    /^[-*+]\s+\*\*([^*\n]+)\*\*[^\n]*?\bAvoid:\s*([^\n]+)$/gm,
  )) {
    const term = (match[1] ?? "").trim();
    for (const entry of (match[2] ?? "").split(",")) {
      const word = entry.replace(/[."“”'`*]/g, "").trim();
      if (word === "") continue;
      // "<word> alone" avoids the word outside the term, so the term is removed before searching.
      const bare = word.replace(/\s+alone$/i, "");
      const pattern = new RegExp(`\\b${literal(bare)}s?\\b`, "i");
      const termPattern = new RegExp(literal(term), "gi");
      avoids.push({
        word,
        term,
        used: (line) => pattern.test(line.replace(termPattern, "")),
      });
    }
  }
  return avoids;
}

/** The project's copies of the Framework rule documents. */
function listRules(root: string): string[] {
  const files = git(root, [
    "ls-files",
    "-co",
    "--exclude-standard",
    "--",
    `${RULES_DIRECTORY}/*.md`,
    `${RULES_DIRECTORY}.md`,
  ])
    .stdout.split("\n")
    .filter(Boolean);
  return files.filter((path) => existsSync(join(root, path)));
}

/**
 * The documents a review covers, packed into batches. With a commit, only documents changed since,
 * documents whose type's rules changed since, and goals whose children changed.
 */
export function prepareReview(
  projectRoot: string,
  review: Review,
  since?: string,
): { batches: Batch[]; scope: string; total: number } {
  const root = realpathSync(projectRoot);
  const { documents } = diagnose(root);
  const plan = loadPlan(root);
  const knowledgeDirectories = [
    ...new Set(
      documents
        .filter((d) => d.type === "knowledge")
        .map((d) =>
          d.path.slice(0, d.path.indexOf("knowledge/") + "knowledge".length),
        ),
    ),
  ];
  let selected = documents;
  let scope = "every document";
  if (since !== undefined) {
    const changed = new Set(
      [
        ...git(root, ["diff", "--name-only", "-z", since]).stdout.split("\0"),
        ...git(root, [
          "ls-files",
          "-o",
          "--exclude-standard",
          "-z",
        ]).stdout.split("\0"),
      ].filter(Boolean),
    );
    const childChanged = (path: string) =>
      plan.nodes
        .get(basename(path, ".md"))
        ?.children.some((child) => changed.has(`plan/nodes/${child.id}.md`));
    selected = documents.filter(
      (d) =>
        changed.has(d.path) ||
        ruleFiles(review, d.type).some((file) => changed.has(file)) ||
        (review === "defect" && d.type === "goal" && childChanged(d.path)),
    );
    scope = `changed since ${since}`;
  }

  const leads = findLeads(
    root,
    review,
    selected,
    documents,
    plan.nodes,
    knowledgeDirectories,
  );
  const declined = readFindings(root)?.findings.filter(
    (f) => f.status === "declined" && f.severity === review,
  );
  const entries: Entry[] = selected.map(({ path, type }) => {
    const node = plan.nodes.get(
      /^plan\/nodes\/([^/]+)\.md$/.exec(path)?.[1] ?? "",
    );
    const found = leads.get(path) ?? [];
    return {
      path,
      type,
      words: wordCount(readFileSync(join(root, path), "utf8")),
      notes: [
        ...(node ? [`status ${node.status}`] : []),
        // A goal's children, for judging its planning; never cut short like leads.
        ...(review === "defect" && node?.kind === "goal"
          ? node.children.map(
              (child) =>
                `child ${child.id}: ${child.kind}, ${child.status}${child.dependsOn.length > 0 ? `, depends on ${child.dependsOn.join(", ")}` : ""}`,
            )
          : []),
        ...found.slice(0, LEADS_PER_DOCUMENT).map((lead) => `lead: ${lead}`),
        ...(found.length > LEADS_PER_DOCUMENT
          ? [`lead: ${found.length - LEADS_PER_DOCUMENT} more like these`]
          : []),
        ...(declined ?? [])
          .filter((f) => documentOf(f) === path)
          .map((f) => `declined ${f.id} at ${f.file}: ${f.problem}`),
      ],
    };
  });

  // Each document goes into the first batch of its type with room for it.
  const batches: (Batch & { words: number })[] = [];
  for (const type of TYPES)
    for (const entry of entries.filter((e) => e.type === type)) {
      let batch = batches.find(
        (b) => b.type === type && b.words + entry.words <= BUDGET,
      );
      if (!batch) {
        batch = { type, entries: [], words: 0 };
        batches.push(batch);
      }
      batch.entries.push(entry);
      batch.words += entry.words;
    }
  return { batches, scope, total: selected.length };
}

/** What a judge of a Knowledge batch needs to tell a summary from a second owner. */
function topicContext(root: string, documents: string[]): string[] {
  return [...topicOwners(root, documents).values()].map(
    ({ topic, owners }) => `"${topic}": ${owners.join(", ")}`,
  );
}

export function renderBatch(
  root: string,
  review: Review,
  batches: Batch[],
  number: number,
): string {
  const batch = batches[number - 1];
  if (!batch) return "";
  const lines = [
    `Batch ${number} of ${batches.length}: ${review} review of ${batch.type} documents`,
    "",
    "Rules: read these sections of the project's copies, and judge each document against every rule in them",
    ...RULES[review][batch.type].map(
      (rule) =>
        `- ${RULES_DIRECTORY}/${rule}${rule.includes("#") ? "" : " (every section)"}`,
    ),
  ];
  if (batch.type === "knowledge" && review === "defect") {
    const knowledge = diagnose(root)
      .documents.filter((d) => d.type === "knowledge")
      .map((d) => d.path);
    lines.push(
      "",
      "Topics and their owners: a document may summarize another's topic briefly with a link, never explain it in detail",
      ...topicContext(root, [...listRules(root), ...knowledge]).map(
        (line) => `- ${line}`,
      ),
    );
  }
  lines.push("", "Documents");
  for (const entry of batch.entries) {
    lines.push(`- ${entry.path} (${entry.words} words)`);
    for (const note of entry.notes) lines.push(`  - ${note}`);
  }
  return lines.join("\n");
}

const USAGE =
  "Usage: bun review.ts [project-root] <defect|polish> [--changed-since <commit>] [--batch <n>]";

if (import.meta.main) {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--changed-since" || arg === "--batch")
      options.set(arg, args[++i] ?? "");
    else positional.push(arg);
  }
  const review = positional.at(-1) as Review;
  const root = resolve(positional.length > 1 ? (positional[0] ?? ".") : ".");
  const since = options.get("--changed-since");
  const number = options.has("--batch")
    ? Number(options.get("--batch"))
    : undefined;
  if (
    positional.length === 0 ||
    positional.length > 2 ||
    !REVIEWS.includes(review) ||
    (number !== undefined && !(number >= 1)) ||
    (since !== undefined &&
      git(root, ["rev-parse", "--verify", "--quiet", `${since}^{commit}`])
        .status !== 0)
  ) {
    console.error(USAGE);
    process.exit(2);
  }
  const { batches, scope, total } = prepareReview(root, review, since);
  if (number !== undefined) {
    const text = renderBatch(realpathSync(root), review, batches, number);
    if (text === "") {
      console.error(
        `There is no batch ${number}; the review has ${batches.length}`,
      );
      process.exit(2);
    }
    console.log(text);
  } else {
    console.log(
      `${review[0]?.toUpperCase()}${review.slice(1)} review of ${total} documents, ${scope}: ${batches.length} batches`,
    );
    batches.forEach((batch, i) => {
      const words = batch.entries.reduce((sum, e) => sum + e.words, 0);
      const leads = batch.entries.reduce(
        (sum, e) => sum + e.notes.filter((n) => n.startsWith("lead:")).length,
        0,
      );
      console.log(
        `${i + 1}. ${batch.type}: ${batch.entries.length} documents, ${words} words, ${leads} leads`,
      );
    });
  }
}
