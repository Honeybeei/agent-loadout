// Keeps the findings and verdicts of the review state, .dev/review.jsonl, so no agent edits it by hand.
// Usage: bun findings.ts [project-root] <command>
//   add <batch> [<report file>]          record a judge's report on a batch of the planned review, from the file or standard input
//   set <proposed|declined|applied> <id>...  applied removes the finding, which Git keeps
//   answer <id> <answer>                 record the user's answer to a finding's Decision
//   summary                              verified documents, Decisions to ask, and the proposed findings by rule
//   show <id>...                         findings in full
import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { check } from "./check.ts";
import { blobOf, PLAN, type Plan, readPlan, rulesHash } from "./review.ts";
import {
  type Finding,
  type LeadVerdict,
  REVIEWS,
  type Review,
  readState,
  STATE,
  STATUSES,
  type State,
  type Verdict,
  writeState,
} from "./state.ts";

const FIELDS = [
  "File",
  "Quote",
  "Rule",
  "Problem",
  "Failure",
  "Evidence",
  "Fix",
  "Decision",
] as const;
const REQUIRED: Record<Review, string[]> = {
  defect: ["File", "Quote", "Rule", "Problem", "Failure", "Evidence", "Fix"],
  polish: ["File", "Quote", "Rule", "Problem", "Fix"],
};

export interface Report {
  /** The findings by the number the judge gave them. */
  findings: Map<number, Omit<Finding, "id" | "status">>;
  leads: Map<string, string>;
  verdicts: Map<string, string>;
  errors: string[];
}

/**
 * A judge's report: blocks headed `## <number> · <review>`, each with a `- <Field>: <value>` line per field,
 * whose value may go on in indented lines; then `## Leads` and `## Verdicts`, one `- <id or path>: <verdict>` each.
 */
export function parseReport(text: string, review: Review): Report {
  const report: Report = {
    findings: new Map(),
    leads: new Map(),
    verdicts: new Map(),
    errors: [],
  };
  let block:
    | { heading: string; number: number; values: Record<string, string> }
    | undefined;
  let field: string | undefined;
  let list: Map<string, string> | undefined;
  const finish = () => {
    if (block) {
      const { heading, number, values } = block;
      const missing = REQUIRED[review].filter((name) => !values[name]?.trim());
      if (missing.length > 0)
        report.errors.push(
          `"${heading}" lacks ${missing.join(", ")}${review === "defect" && (missing.includes("Failure") || missing.includes("Evidence")) ? "; a defect shows who, following the text, acts wrongly, and the evidence, or it is polish" : ""}`,
        );
      else
        report.findings.set(number, {
          review,
          // A path may come in a code span or end a sentence.
          file: (values.File ?? "").replace(/^`|`$|`?\.$/g, ""),
          quote: values.Quote ?? "",
          rule: values.Rule ?? "",
          problem: values.Problem ?? "",
          fix: values.Fix ?? "",
          ...(values.Failure ? { failure: values.Failure } : {}),
          ...(values.Evidence ? { evidence: values.Evidence } : {}),
          ...(values.Decision ? { decision: values.Decision } : {}),
        });
    }
    block = undefined;
    field = undefined;
  };
  for (const line of text.split(/\r?\n/)) {
    const heading = /^##\s+(\d+)\s+·\s+(defect|polish)\s*$/.exec(line);
    if (heading) {
      finish();
      list = undefined;
      if (heading[2] !== review)
        report.errors.push(
          `"${line.slice(3)}" is not a ${review} finding; the planned review is ${review}`,
        );
      block = {
        heading: line.slice(3),
        number: Number(heading[1]),
        values: {},
      };
      continue;
    }
    if (/^##\s+Leads\s*$/.test(line) || /^##\s+Verdicts\s*$/.test(line)) {
      finish();
      list = line.includes("Leads") ? report.leads : report.verdicts;
      continue;
    }
    if (line.startsWith("#")) {
      finish();
      list = undefined;
      continue;
    }
    if (list) {
      const entry = /^[-*]\s+`?([^`:\s]+)`?:\s*(.+)$/.exec(line);
      if (entry) list.set(entry[1] ?? "", (entry[2] ?? "").trim());
      continue;
    }
    if (!block || line.trim() === "") continue;
    const start = /^[-*]\s+(\w+):\s*(.*)$/.exec(line);
    const name = FIELDS.find((f) => f === start?.[1]);
    if (name) {
      field = name;
      block.values[name] = (start?.[2] ?? "").trim();
    } else if (field && /^\s/.test(line))
      block.values[field] = `${block.values[field]}\n${line.trimEnd()}`;
    else field = undefined;
  }
  finish();
  return report;
}

const documentOf = (file: string) => file.replace(/:\d+(?:[-–]\d+)?$/, "");
const flat = (text: string) => text.replace(/\s+/g, " ").trim();

/** One problem, whatever line it has moved to. */
const sameProblem = (
  a: Omit<Finding, "id" | "status">,
  b: Omit<Finding, "id" | "status">,
) =>
  a.review === b.review &&
  documentOf(a.file) === documentOf(b.file) &&
  a.rule === b.rule &&
  flat(a.quote) === flat(b.quote);

/**
 * Records a judge's report on one batch: new findings, a verdict on every lead, and a verdict for each
 * document that holds, unless it changed since the plan or was judged only on lines a commit changed.
 */
export function addReport(
  root: string,
  plan: Plan,
  number: number,
  text: string,
): {
  state: State;
  added: Finding[];
  skipped: number;
  verified: number;
  errors: string[];
} {
  const state = readState(root);
  const batch = plan.batches[number - 1];
  const report = parseReport(text, plan.review);
  const errors = [...report.errors];
  if (!batch)
    errors.push(
      `There is no batch ${number}; the review has ${plan.batches.length}`,
    );
  for (const entry of batch?.entries ?? []) {
    const verdict = report.verdicts.get(entry.path);
    if (verdict === undefined)
      errors.push(
        `no verdict for ${entry.path}; add "- ${entry.path}: holds" or the numbers of its findings`,
      );
    else if (!/^holds$|^findings? [\d, and]+$/.test(verdict))
      errors.push(
        `the verdict for ${entry.path} is "${verdict}"; write "holds" or "findings <numbers>"`,
      );
    else
      for (const cited of verdict.match(/\d+/g) ?? [])
        if (!report.findings.has(Number(cited)))
          errors.push(
            `the verdict for ${entry.path} cites finding ${cited}, which the report does not have`,
          );
    for (const lead of entry.leads)
      if (
        !/^finding \d+$|^not a finding: \S/.test(
          report.leads.get(lead.id) ?? "",
        )
      )
        errors.push(
          `no verdict for lead ${lead.id}; add "- ${lead.id}: finding <number>" or "- ${lead.id}: not a finding: <reason>"`,
        );
  }
  for (const verdict of report.leads.values()) {
    const cited = Number(/^finding (\d+)$/.exec(verdict)?.[1]);
    if (cited && !report.findings.has(cited))
      errors.push(
        `a lead cites finding ${cited}, which the report does not have`,
      );
  }
  if (errors.length > 0 || !batch)
    return { state, added: [], skipped: 0, verified: 0, errors };

  let next =
    Math.max(0, ...state.findings.map((f) => Number(f.id.slice(1)) || 0)) + 1;
  const ids = new Map<number, string>();
  const added: Finding[] = [];
  for (const [n, finding] of report.findings) {
    const known = state.findings.find((f) => sameProblem(f, finding));
    if (known) {
      ids.set(n, known.id);
      continue;
    }
    const entry: Finding = { id: `F${next++}`, status: "proposed", ...finding };
    state.findings.push(entry);
    ids.set(n, entry.id);
    added.push(entry);
  }
  for (const entry of batch.entries) {
    for (const lead of entry.leads) {
      const said = report.leads.get(lead.id) ?? "";
      const cited = Number(/^finding (\d+)$/.exec(said)?.[1]);
      const record: LeadVerdict = {
        review: plan.review,
        path: entry.path,
        id: lead.id,
        verdict: cited ? `finding ${ids.get(cited)}` : said,
      };
      state.leads = [
        ...state.leads.filter(
          (l) => !(l.review === plan.review && l.id === lead.id),
        ),
        record,
      ];
    }
  }
  let verified = 0;
  for (const entry of batch.entries) {
    if (report.verdicts.get(entry.path) !== "holds") continue;
    // Lines one change wrote, or that link a changed document, say nothing of the rest.
    if (entry.basis === "change" || entry.basis === "link") continue;
    const content = readFileSync(join(root, entry.path), "utf8");
    if (blobOf(content) !== entry.blob) continue;
    // Keep the blob, so a later review can judge only what changes after it.
    spawnSync("git", ["-C", root, "hash-object", "-w", "--", entry.path]);
    const verdict: Verdict = {
      review: plan.review,
      path: entry.path,
      blob: entry.blob,
      rules: entry.rules,
    };
    state.verdicts = [
      ...state.verdicts.filter(
        (v) => !(v.review === plan.review && v.path === entry.path),
      ),
      verdict,
    ];
    verified++;
  }
  return {
    state,
    added,
    skipped: report.findings.size - added.length,
    verified,
    errors,
  };
}

export function summarize(root: string, state: State): string {
  const { documents } = check(root);
  const lines: string[] = [];
  for (const review of REVIEWS) {
    const verified = documents.filter(({ path, type }) => {
      const verdict = state.verdicts.find(
        (v) => v.review === review && v.path === path,
      );
      return (
        verdict !== undefined &&
        verdict.rules === rulesHash(root, review, type) &&
        verdict.blob === blobOf(readFileSync(join(root, path), "utf8"))
      );
    }).length;
    lines.push(
      `${review}: ${verified} of ${documents.length} documents verified at their current content`,
    );
  }
  const proposed = state.findings.filter((f) => f.status === "proposed");
  const line = (f: Finding) => {
    const same = state.findings
      .filter(
        (o) =>
          o.id !== f.id &&
          o.status === "proposed" &&
          flat(o.quote) === flat(f.quote),
      )
      .map((o) => o.id);
    return `- ${f.id} ${f.review}, ${f.file}: ${flat(f.problem)}${same.length > 0 ? ` (same quote as ${same.join(", ")})` : ""}`;
  };
  const decisions = proposed.filter((f) => f.decision && !f.answer);
  if (decisions.length > 0) {
    lines.push(
      "",
      `Decisions to ask the user, one at a time (${decisions.length})`,
    );
    for (const f of decisions)
      lines.push(`- ${f.id} ${f.file}: ${flat(f.decision ?? "")}`);
  }
  const rest = proposed.filter((f) => !decisions.includes(f));
  if (rest.length > 0) {
    lines.push("", `Proposed findings by rule (${rest.length})`);
    for (const rule of [...new Set(rest.map((f) => f.rule))].sort()) {
      const group = rest.filter((f) => f.rule === rule);
      lines.push(`${rule} (${group.length})`);
      for (const f of group) lines.push(line(f));
    }
  }
  const declined = state.findings.filter((f) => f.status === "declined").length;
  if (declined > 0) lines.push("", `Declined: ${declined}`);
  return lines.join("\n");
}

const show = (f: Finding) =>
  [
    `## ${f.id} · ${f.review} · ${f.status}`,
    "",
    `- File: ${f.file}`,
    `- Quote: ${f.quote}`,
    `- Rule: ${f.rule}`,
    `- Problem: ${f.problem}`,
    ...(f.failure ? [`- Failure: ${f.failure}`] : []),
    ...(f.evidence ? [`- Evidence: ${f.evidence}`] : []),
    `- Fix: ${f.fix}`,
    ...(f.decision ? [`- Decision: ${f.decision}`] : []),
    ...(f.answer ? [`- Answer: ${f.answer}`] : []),
  ].join("\n");

const USAGE =
  "Usage: bun findings.ts [project-root] <add|set|answer|summary|show> ...";

if (import.meta.main) {
  const args = process.argv.slice(2);
  const commands = ["add", "set", "answer", "summary", "show"];
  const at = args.findIndex((arg) => commands.includes(arg));
  const fail = (message: string) => {
    console.error(message);
    process.exit(2);
  };
  if (at < 0 || at > 1) fail(USAGE);
  const root = realpathSync(resolve(at === 1 ? (args[0] ?? ".") : "."));
  const [command, ...rest] = args.slice(at);
  const state = readState(root);
  const find = (ids: string[]) => {
    const unknown = ids.filter(
      (id) => !state.findings.some((f) => f.id === id),
    );
    if (unknown.length > 0)
      fail(`No finding ${unknown.join(", ")} in ${STATE}`);
    return state.findings.filter((f) => ids.includes(f.id));
  };

  if (command === "add") {
    const plan = readPlan(root);
    if (!plan) fail(`${PLAN} does not exist; plan the review first`);
    const number = Number(rest[0]);
    if (!(number >= 1)) fail(`${USAGE}\nadd <batch> [<report file>]`);
    const result = addReport(
      root,
      plan as Plan,
      number,
      readFileSync(rest[1] ?? 0, "utf8"),
    );
    if (result.errors.length > 0)
      fail(
        `Nothing recorded; fix the report and add it again:\n${result.errors.map((e) => `- ${e}`).join("\n")}`,
      );
    writeState(root, result.state);
    console.log(
      `Recorded batch ${number}: ${result.added.length} new findings${result.skipped > 0 ? `, ${result.skipped} already recorded` : ""}, ${result.verified} documents verified`,
    );
  } else if (command === "set") {
    const [status, ...ids] = rest;
    if (![...STATUSES, "applied"].includes(status ?? "") || ids.length === 0)
      fail(`${USAGE}\nset <${[...STATUSES, "applied"].join("|")}> <id>...`);
    const chosen = find(ids);
    const unanswered = chosen.filter(
      (f) => status === "applied" && f.decision && !f.answer,
    );
    if (unanswered.length > 0)
      fail(
        `${unanswered.map((f) => f.id).join(", ")} need the user's answer first; record it with answer`,
      );
    state.findings =
      status === "applied"
        ? state.findings.filter((f) => !ids.includes(f.id))
        : state.findings.map((f) =>
            ids.includes(f.id)
              ? { ...f, status: status as Finding["status"] }
              : f,
          );
    writeState(root, state);
    console.log(`Set ${ids.length} findings ${status}`);
  } else if (command === "answer") {
    const [id = "", ...words] = rest;
    const [finding] = find([id]);
    if (!finding?.decision) fail(`${id} has no Decision to answer`);
    if (words.join(" ").trim() === "") fail(`${USAGE}\nanswer <id> <answer>`);
    state.findings = state.findings.map((f) =>
      f.id === id ? { ...f, answer: words.join(" ").trim() } : f,
    );
    writeState(root, state);
    console.log(`Recorded the answer to ${id}`);
  } else if (command === "summary") console.log(summarize(root, state));
  else if (command === "show") console.log(find(rest).map(show).join("\n\n"));
}
