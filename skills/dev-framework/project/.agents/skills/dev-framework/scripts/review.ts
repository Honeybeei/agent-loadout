// Plans the reviews that judge what scripts cannot: dev-doctor's, and the commit gate's.
// Usage: bun review.ts [project-root] <defect|polish> [--changed-since <commit>] [--fresh]
//        bun review.ts [project-root] --batch <n>
// Documents of one type are packed into batches, each with the rule sections that type is judged
// against and the leads scripts found: spots a judge must look at, which may or may not break a rule.
// A document that held is skipped while it and its rules stay unchanged, and judged on its changed lines
// after an edit. The plan goes to .tmp/review/plan.json for the judges and findings.ts; nothing else changes.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import {
  anchors,
  BUILD_STATUS,
  blankCode,
  check,
  type DocumentType,
  END,
  markdownLinks,
  START,
  topicOwners,
} from "./check.ts";
import { items, loadPlan, type PlanNode, sections } from "./map.ts";
import { type Finding, REVIEWS, type Review, readState } from "./state.ts";

export { REVIEWS, type Review };

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
      "knowledge-documentation.md#categories",
      "knowledge-documentation.md#links-and-reading",
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

export interface Lead {
  /** Stable while the document's line and the lead's wording stay, so a verdict on it is kept. */
  id: string;
  line?: number;
  text: string;
}

/**
 * What a judge covers in a document: all of it, or the lines changed since it last held (`verdict`),
 * since the commit a review is limited to (`change`), or that link a changed Knowledge document (`link`).
 */
export type Basis = "whole" | "verdict" | "change" | "link";

export interface Entry {
  path: string;
  type: DocumentType;
  words: number;
  basis: Basis;
  /** The lines to judge, unless the basis is whole. */
  lines: number[];
  /** The blob judged, and the hash of its type's rule sections, which a verdict records. */
  blob: string;
  rules: string;
  leads: Lead[];
  /** Status, children, and declined findings, one line each. */
  notes: string[];
}

export interface Batch {
  /** The types of its documents, in batch order. */
  types: DocumentType[];
  entries: Entry[];
}

export interface Plan {
  review: Review;
  scope: string;
  total: number;
  batches: Batch[];
}

export const PLAN = ".tmp/review/plan.json";

function git(root: string, args: string[]) {
  return spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 1 << 30,
  });
}

/** Git's blob id of a text. */
export const blobOf = (text: string) =>
  createHash("sha1")
    .update(`blob ${Buffer.byteLength(text)}\0`)
    .update(text)
    .digest("hex");

/** One rule as the project's copy states it: a section of a rule document, or all of it. */
function ruleText(root: string, rule: string): string {
  const [file = "", fragment] = rule.split("#");
  const path = join(root, RULES_DIRECTORY, file);
  if (!existsSync(path)) return "";
  const text = readFileSync(path, "utf8");
  if (fragment === undefined) return text;
  return sections(text)
    .filter(({ heading }) => anchors(`## ${heading}`).has(fragment))
    .map(({ heading, lines }) => [heading, ...lines].join("\n"))
    .join("\n");
}

/** A hash of the rule sections a type is judged against; it changes when any of them does. */
export const rulesHash = (root: string, review: Review, type: DocumentType) =>
  createHash("sha1")
    .update(
      RULES[review][type]
        .map((rule) => `${rule}\n${ruleText(root, rule)}`)
        .join("\n"),
    )
    .digest("hex")
    .slice(0, 12);

/** The body lines, without frontmatter, blank lines, or managed sections, numbered as in the file. */
function bodyLines(text: string): { number: number; text: string }[] {
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.exec(text)?.[0];
  const offset = frontmatter ? frontmatter.split("\n").length - 1 : 0;
  let managed = false;
  return text
    .slice(frontmatter?.length ?? 0)
    .split("\n")
    .map((line, index) => {
      if (line.trimEnd() === START) managed = true;
      const kept = managed ? "" : line.trim();
      if (line.trimEnd() === END) managed = false;
      return { number: index + 1 + offset, text: kept };
    })
    .filter((line) => line.text !== "");
}

/** The numbers of the lines in `after` that `before` lacks, by a longest common subsequence of body lines. */
export function changedLines(before: string, after: string): number[] {
  const a = bodyLines(before).map((line) => line.text);
  const b = bodyLines(after);
  const width = b.length + 1;
  const common = new Int32Array((a.length + 1) * width);
  const at = (i: number, j: number) => common[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      common[i * width + j] =
        a[i] === b[j]?.text
          ? at(i + 1, j + 1) + 1
          : Math.max(at(i + 1, j), at(i, j + 1));
  const changed: number[] = [];
  let i = 0;
  for (let j = 0; j < b.length; ) {
    if (i < a.length && a[i] === b[j]?.text) {
      i++;
      j++;
    } else if (i < a.length && at(i + 1, j) >= at(i, j + 1)) i++;
    else {
      changed.push(b[j]?.number ?? 0);
      j++;
    }
  }
  return changed;
}

/** "3, 12–15, 30" */
const ranges = (numbers: number[]) =>
  numbers
    .reduce<number[][]>((runs, n) => {
      const last = runs.at(-1);
      if (last && n === (last.at(-1) ?? 0) + 1) last.push(n);
      else runs.push([n]);
      return runs;
    }, [])
    .map((run) => (run.length === 1 ? `${run[0]}` : `${run[0]}–${run.at(-1)}`))
    .join(", ");

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
const HISTORY =
  /\b(?:first|once|originally) (?:read|covered|said)\b|\bgrew to\b|\bjoined because\b|\bre-?scoped\b|\ban earlier attempt\b/i;
const HANDOFF = ["Out of scope", "For the Plan"];
const LONG_ITEM = 50;

/** Spots in each document that a judge must look at, keyed by path. */
function findLeads(
  root: string,
  review: Review,
  documents: { path: string; type: DocumentType }[],
  everyDocument: { path: string; type: DocumentType }[],
  nodes: Map<string, PlanNode>,
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
        // A Goal changed line quotes the whole earlier Goal.
        for (const item of items(node.body, "Record"))
          if (
            !/^[-*+]\s+Goal changed:/.test(item) &&
            wordCount(item) > LONG_ITEM
          )
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
  // Root's child goals are often milestones, whose names a subject document does not carry.
  const milestones = (nodes.get("root")?.children ?? [])
    .filter((child) => child.kind === "goal")
    .map((child) => ({
      id: child.id,
      stem: child.id.replace(/^(?:\d+-)+/, ""),
    }))
    .filter(({ stem }) => stem !== "");
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
    if (type === "knowledge") {
      for (const link of markdownLinks(content)) {
        const target = relative(
          root,
          resolve(dirname(join(root, path)), link.file),
        );
        if (target.startsWith("plan/nodes/") && target !== "plan/nodes/root.md")
          add(path, `links ${target}: work history or status in Knowledge?`);
      }
      const names = [
        { what: "its file name", text: basename(path, ".md") },
        ...[...topicOwners(root, [path]).values()].map(({ topic }) => ({
          what: `its topic "${topic}"`,
          text: topic,
        })),
      ];
      for (const { id, stem } of milestones) {
        const words = new RegExp(
          `(?:^|[^a-z0-9])${stem.split("-").join("[ -]")}(?:$|[^a-z0-9])`,
          "i",
        );
        const named = names.find(({ text }) => words.test(text));
        if (named)
          add(
            path,
            `${named.what} names ${stem}, as the goal ${id} does: a document scoped to a milestone or piece of work, rather than a subject?`,
          );
      }
    }
    if (node) nodeLeads(node, (lead) => add(path, lead));
  }
  return leads;
}

function nodeLeads(node: PlanNode, add: (lead: string) => void): void {
  const goal = sections(node.body).find((s) => s.heading === "Goal");
  for (const line of goal?.lines ?? []) {
    const history = HISTORY.exec(line)?.[0];
    if (history)
      add(`its Goal says "${history}": history that belongs in Record?`);
  }
  if (
    items(node.body, "Record").some((line) =>
      /^[-*+]\s+Goal changed:/.test(line),
    ) &&
    sections(node.body).some((s) => s.heading === "Completion criteria")
  )
    add(
      "its Goal changed: do the Completion criteria cover what the Goal gained?",
    );
  const finished = node.status === "done";
  for (const section of sections(node.body)) {
    if (section.heading === "Record") continue;
    for (const item of section.lines.filter((line) => /^[-*+]\s/.test(line))) {
      // A decision line is the record of what the user approved, kept whole; a handed-off line points to its receiver.
      const decision =
        section.heading === "Decisions so far" ||
        (!HANDOFF.includes(section.heading) && item.includes("→"));
      if (
        finished &&
        node.kind !== "goal" &&
        !decision &&
        wordCount(item) > LONG_ITEM
      )
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

/** A lead's id: its document, its wording without line numbers, and the line it points at. */
const leadId = (path: string, text: string, line: string) =>
  createHash("sha1")
    .update(
      [
        path,
        text.replace(/\bline \d+\b/g, "line").replace(/(\.md):\d+/g, "$1"),
        line,
      ].join("\n"),
    )
    .digest("hex")
    .slice(0, 8);

/**
 * The documents a review covers, packed into batches. Without a commit, every document not verified at
 * its current content; with one, documents changed since, documents whose type's rules changed since,
 * and goals whose children changed. `fresh` sets the verdicts aside.
 */
export function prepareReview(
  projectRoot: string,
  review: Review,
  options: { since?: string; fresh?: boolean } = {},
): Plan {
  const { since, fresh = false } = options;
  const root = realpathSync(projectRoot);
  const { documents } = check(root);
  const plan = loadPlan(root);
  const state = readState(root);
  const text = (path: string) => readFileSync(join(root, path), "utf8");
  const nodeOf = (path: string) =>
    plan.nodes.get(/^plan\/nodes\/([^/]+)\.md$/.exec(path)?.[1] ?? "");

  let changed: Set<string> | undefined;
  let scope = fresh
    ? "every document"
    : "every document not verified at its current content";
  if (since !== undefined) {
    changed = new Set(
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
    scope = `changed since ${since}`;
  }
  const inScope = (path: string, type: DocumentType) =>
    changed === undefined ||
    changed.has(path) ||
    ruleFiles(review, type).some((file) => changed?.has(file)) ||
    (review === "defect" &&
      type === "goal" &&
      (nodeOf(path)?.children ?? []).some((child) =>
        changed?.has(`plan/nodes/${child.id}.md`),
      ));

  const verdicts = new Map(
    state.verdicts.filter((v) => v.review === review).map((v) => [v.path, v]),
  );
  const selected: Omit<Entry, "words" | "leads" | "notes">[] = [];
  for (const { path, type } of documents) {
    if (!inScope(path, type)) continue;
    const content = text(path);
    const entry = {
      path,
      type,
      blob: blobOf(content),
      rules: rulesHash(root, review, type),
    };
    const verdict = fresh ? undefined : verdicts.get(path);
    if (verdict?.rules === entry.rules) {
      if (verdict.blob === entry.blob) continue;
      const before = git(root, ["cat-file", "-p", verdict.blob]);
      if (before.status === 0) {
        const lines = changedLines(before.stdout, content);
        // Only frontmatter or blank lines changed: the verdict still holds.
        if (lines.length > 0)
          selected.push({ ...entry, basis: "verdict", lines });
        continue;
      }
    }
    const before =
      since !== undefined && changed?.has(path)
        ? git(root, ["show", `${since}:${path}`])
        : undefined;
    if (before?.status === 0) {
      const lines = changedLines(before.stdout, content);
      if (lines.length > 0) selected.push({ ...entry, basis: "change", lines });
    } else selected.push({ ...entry, basis: "whole", lines: [] });
  }

  // A changed Knowledge document can leave the lines that link it stale.
  const linkLeads: { path: string; line: number; text: string }[] = [];
  if (review === "defect")
    for (const target of selected.filter(
      (e) => e.type === "knowledge" && e.basis !== "whole",
    ))
      for (const { path, type } of documents) {
        const node = nodeOf(path);
        if (
          path === target.path ||
          node?.status === "done" ||
          node?.status === "cancelled"
        )
          continue;
        const linking = bodyLines(blankCode(text(path))).filter(({ text }) =>
          markdownLinks(text).some(
            (link) =>
              relative(root, resolve(dirname(join(root, path)), link.file)) ===
              target.path,
          ),
        );
        if (linking.length === 0) continue;
        let entry = selected.find((e) => e.path === path);
        if (!entry) {
          const content = text(path);
          entry = {
            path,
            type,
            blob: blobOf(content),
            rules: rulesHash(root, review, type),
            basis: "link",
            lines: [],
          };
          selected.push(entry);
        }
        for (const { number } of linking) {
          if (entry.basis !== "whole" && !entry.lines.includes(number))
            entry.lines.push(number);
          linkLeads.push({
            path,
            line: number,
            text: `line ${number} links ${target.path}, which changed at ${target.blob.slice(0, 7)}: does what it says of it still hold?`,
          });
        }
        entry.lines.sort((a, b) => a - b);
      }

  const found = findLeads(root, review, selected, documents, plan.nodes);
  for (const { path, text } of linkLeads)
    found.set(path, [...(found.get(path) ?? []), text]);
  const judged = new Set(
    state.leads.filter((l) => l.review === review).map((l) => l.id),
  );
  const declined = state.findings.filter(
    (f) => f.status === "declined" && f.review === review,
  );
  const documentOf = (finding: Finding) =>
    finding.file.replace(/:\d+(?:[-–]\d+)?$/, "");
  const entries: Entry[] = selected.map((entry) => {
    const lines = text(entry.path).split("\n");
    const node = nodeOf(entry.path);
    const leads = (found.get(entry.path) ?? [])
      .map((lead): Lead => {
        const line = Number(/^line (\d+)\b/.exec(lead)?.[1]) || undefined;
        return {
          id: leadId(
            entry.path,
            lead,
            line ? (lines[line - 1] ?? "").trim() : "",
          ),
          ...(line ? { line } : {}),
          text: lead,
        };
      })
      .filter(
        (lead) =>
          !judged.has(lead.id) &&
          (entry.basis === "whole" ||
            lead.line === undefined ||
            entry.lines.includes(lead.line)),
      );
    const judgedLines = entry.lines.map((n) => lines[n - 1] ?? "").join(" ");
    const all = wordCount(lines.join(" "));
    return {
      ...entry,
      leads,
      words:
        entry.basis === "whole"
          ? all
          : Math.min(all, 200 + wordCount(judgedLines)),
      notes: [
        ...(node ? [`status ${node.status}`] : []),
        // A goal's children, for judging its planning.
        ...(review === "defect" && node?.kind === "goal"
          ? node.children.map(
              (child) =>
                `child ${child.id}: ${child.kind}, ${child.status}${child.dependsOn.length > 0 ? `, depends on ${child.dependsOn.join(", ")}` : ""}`,
            )
          : []),
        ...declined
          .filter((f) => documentOf(f) === entry.path)
          .map((f) => `declined ${f.id} at ${f.file}: ${f.problem}`),
      ],
    };
  });

  // Each document goes into the first batch of its type with room for it.
  const batches: { type: DocumentType; entries: Entry[]; words: number }[] = [];
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
  // Small batches of different types share a judge, who reads each type's rules.
  const merged: { entries: Entry[]; words: number }[] = [];
  for (const batch of batches) {
    const last = merged.at(-1);
    if (last && last.words + batch.words <= BUDGET) {
      last.entries.push(...batch.entries);
      last.words += batch.words;
    } else merged.push({ entries: [...batch.entries], words: batch.words });
  }
  return {
    review,
    scope,
    total: entries.length,
    batches: merged.map(({ entries }) => ({
      types: [...new Set(entries.map((e) => e.type))],
      entries,
    })),
  };
}

export function savePlan(root: string, plan: Plan): void {
  const path = join(root, PLAN);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(plan, null, 1)}\n`);
}

export function readPlan(root: string): Plan | undefined {
  const path = join(root, PLAN);
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Plan)
    : undefined;
}

/** What a judge of a Knowledge batch needs to tell a summary from a second owner. */
function topicContext(root: string, documents: string[]): string[] {
  return [...topicOwners(root, documents).values()].map(
    ({ topic, owners }) => `"${topic}": ${owners.join(", ")}`,
  );
}

const covers = (entry: Entry) =>
  entry.basis === "whole"
    ? "judge it whole"
    : `judge only lines ${ranges(entry.lines)}, which ${
        {
          verdict: "changed since it last held",
          change: "the change wrote",
          link: "link a changed document",
        }[entry.basis]
      }`;

/** "a", "a and b", "a, b, and c" */
const listed = (words: string[]) =>
  words.length < 3
    ? words.join(" and ")
    : `${words.slice(0, -1).join(", ")}, and ${words.at(-1)}`;

export function renderBatch(root: string, plan: Plan, number: number): string {
  const batch = plan.batches[number - 1];
  if (!batch) return "";
  const { review } = plan;
  const lines = [
    `Batch ${number} of ${plan.batches.length}: ${review} review of ${listed(batch.types)} documents`,
  ];
  for (const type of batch.types)
    lines.push(
      "",
      `Rules for ${type} documents: read these sections of the project's copies, and judge each ${type} document against every rule in them`,
      ...RULES[review][type].map(
        (rule) =>
          `- ${RULES_DIRECTORY}/${rule}${rule.includes("#") ? "" : " (every section)"}`,
      ),
    );
  if (batch.types.includes("knowledge") && review === "defect") {
    const knowledge = check(root)
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
    lines.push(`- ${entry.path} (${entry.words} words): ${covers(entry)}`);
    for (const note of entry.notes) lines.push(`  - ${note}`);
    for (const lead of entry.leads)
      lines.push(`  - lead ${lead.id}: ${lead.text}`);
  }
  return lines.join("\n");
}

const USAGE = [
  "Usage: bun review.ts [project-root] <defect|polish> [--changed-since <commit>] [--fresh]",
  "       bun review.ts [project-root] --batch <n>",
].join("\n");

if (import.meta.main) {
  const args = process.argv.slice(2);
  const options = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (arg === "--changed-since" || arg === "--batch")
      options.set(arg, args[++i] ?? "");
    else if (arg === "--fresh") options.set(arg, "");
    else positional.push(arg);
  }
  const fail = (message: string) => {
    console.error(message);
    process.exit(2);
  };
  if (options.has("--batch")) {
    const number = Number(options.get("--batch"));
    const root = realpathSync(resolve(positional[0] ?? "."));
    const plan = readPlan(root);
    if (positional.length > 1 || options.size > 1 || !(number >= 1))
      fail(USAGE);
    if (!plan) fail(`${PLAN} does not exist; plan the review first`);
    const text = plan ? renderBatch(root, plan, number) : "";
    if (text === "")
      fail(
        `There is no batch ${number}; the review has ${plan?.batches.length}`,
      );
    console.log(text);
  } else {
    const review = positional.at(-1) as Review;
    const root = resolve(positional.length > 1 ? (positional[0] ?? ".") : ".");
    const since = options.get("--changed-since");
    if (
      positional.length === 0 ||
      positional.length > 2 ||
      !REVIEWS.includes(review) ||
      (since !== undefined &&
        git(root, ["rev-parse", "--verify", "--quiet", `${since}^{commit}`])
          .status !== 0)
    )
      fail(USAGE);
    const plan = prepareReview(root, review, {
      since,
      fresh: options.has("--fresh"),
    });
    savePlan(realpathSync(root), plan);
    console.log(
      `${review[0]?.toUpperCase()}${review.slice(1)} review of ${plan.total} documents, ${plan.scope}: ${plan.batches.length} batches`,
    );
    plan.batches.forEach((batch, i) => {
      const words = batch.entries.reduce((sum, e) => sum + e.words, 0);
      const leads = batch.entries.reduce((sum, e) => sum + e.leads.length, 0);
      console.log(
        `${i + 1}. ${batch.types.join(", ")}: ${batch.entries.length} documents, ${words} words, ${leads} leads`,
      );
    });
  }
}
