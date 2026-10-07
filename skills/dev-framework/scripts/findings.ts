// Keeps dev-doctor's review findings in .tmp/doctor/findings.md, so no agent rewrites the file by hand.
// Usage: bun findings.ts [project-root] <command>
//   start <defect|polish> [<commit>]   begin a review, changed since <commit> or of every document; keeps declined findings
//   add [<report file>]                 add the findings of a review report, from the file or standard input
//   set <proposed|declined|applied> <id>...
//   summary                             counts, and one line per proposed finding, by file
//   commit                              record HEAD as checked, after the fixes are committed
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const FINDINGS = ".tmp/doctor/findings.md";
export const SEVERITIES = ["defect", "polish"] as const;
export type Severity = (typeof SEVERITIES)[number];
export const STATUSES = ["proposed", "declined", "applied"] as const;
export type Status = (typeof STATUSES)[number];
const FIELDS = ["File", "Quote", "Rule", "Problem", "Fix"] as const;

export interface Finding {
  id: string;
  severity: Severity;
  status: Status;
  file: string;
  quote: string;
  rule: string;
  problem: string;
  fix: string;
}

export interface Findings {
  commit: string;
  review: string;
  findings: Finding[];
}

/** The document a finding is in, without its line number. */
export const documentOf = (finding: { file: string }) =>
  finding.file.replace(/:\d+(?:-\d+)?$/, "");

/** One problem, whatever line it has moved to. */
const sameProblem = (a: Finding, b: Finding) =>
  documentOf(a) === documentOf(b) &&
  a.rule === b.rule &&
  a.quote.replace(/\s+/g, " ").trim() === b.quote.replace(/\s+/g, " ").trim();

/**
 * The findings in a text: blocks headed `## [<id or number> · ]<severity>[ · <status>]`,
 * each with a `- <Field>: <value>` line per field, whose value may go on in indented lines.
 */
export function parseFindings(text: string): {
  findings: Finding[];
  errors: string[];
} {
  const findings: Finding[] = [];
  const errors: string[] = [];
  let current: Partial<Finding> & { heading?: string } = {};
  let field: string | undefined;
  const finish = () => {
    field = undefined;
    if (current.heading === undefined) return;
    const missing = FIELDS.filter(
      (name) => !current[name.toLowerCase() as keyof Finding]?.trim(),
    );
    if (missing.length > 0)
      errors.push(`"${current.heading}" lacks ${missing.join(", ")}`);
    else {
      const { heading: _, ...finding } = current;
      findings.push(finding as Finding);
    }
    current = {};
  };
  for (const line of text.split(/\r?\n/)) {
    const heading =
      /^##\s+(?:(\S+)\s+·\s+)?(defect|polish)(?:\s+·\s+(\w+))?\s*$/.exec(line);
    if (heading) {
      finish();
      current = {
        heading: line.slice(3),
        id: heading[1] ?? "",
        severity: heading[2] as Severity,
        status: (STATUSES as readonly string[]).includes(heading[3] ?? "")
          ? (heading[3] as Status)
          : "proposed",
      };
      continue;
    }
    if (line.startsWith("#")) finish();
    if (current.heading === undefined || line.trim() === "") continue;
    const values = current as Record<string, string>;
    const start = /^[-*]\s+(\w+):\s*(.*)$/.exec(line);
    const name = FIELDS.find((f) => f === start?.[1])?.toLowerCase();
    if (name) {
      field = name;
      const value = (start?.[2] ?? "").trim();
      // A path may come in a code span or end a sentence.
      values[name] =
        name === "file" ? value.replace(/^`|`$|`?\.$/g, "") : value;
    } else if (field && /^\s/.test(line))
      values[field] = `${values[field]}\n${line.trimEnd()}`;
    else field = undefined;
  }
  finish();
  return { findings, errors };
}

export function readFindings(root: string): Findings | undefined {
  const path = join(root, FINDINGS);
  if (!existsSync(path)) return undefined;
  const text = readFileSync(path, "utf8");
  return {
    commit: /^- Commit: (\S+)/m.exec(text)?.[1] ?? "",
    review: /^- Review: (.*)$/m.exec(text)?.[1] ?? "",
    findings: parseFindings(text).findings,
  };
}

export function renderFindings(data: Findings): string {
  const blocks = data.findings.map((f) =>
    [
      `## ${f.id} · ${f.severity} · ${f.status}`,
      "",
      ...FIELDS.map((field) => {
        const value = f[field.toLowerCase() as keyof Finding];
        return `- ${field}:${value.startsWith("\n") ? "" : " "}${value}`;
      }),
    ].join("\n"),
  );
  return `${[
    "# Doctor Findings",
    `- Commit: ${data.commit}\n- Review: ${data.review}`,
    ...blocks,
  ].join("\n\n")}\n`;
}

/** Adds new findings with the next ids, and skips each one already in the file. */
export function addFindings(
  data: Findings,
  found: Finding[],
): { added: Finding[]; skipped: number } {
  let next =
    Math.max(0, ...data.findings.map((f) => Number(f.id.slice(1)) || 0)) + 1;
  const added: Finding[] = [];
  for (const finding of found) {
    if (data.findings.some((known) => sameProblem(known, finding))) continue;
    const entry = { ...finding, id: `F${next++}`, status: "proposed" as const };
    data.findings.push(entry);
    added.push(entry);
  }
  return { added, skipped: found.length - added.length };
}

export function summarize(data: Findings): string {
  const lines = [`Review: ${data.review}, checked at ${data.commit}`];
  for (const severity of SEVERITIES) {
    const counts = STATUSES.map(
      (status) =>
        `${data.findings.filter((f) => f.severity === severity && f.status === status).length} ${status}`,
    );
    lines.push(`${severity}: ${counts.join(", ")}`);
  }
  const proposed = data.findings.filter((f) => f.status === "proposed");
  for (const file of [...new Set(proposed.map(documentOf))].sort()) {
    lines.push(`\n${file}`);
    for (const f of proposed.filter((p) => documentOf(p) === file))
      lines.push(
        `- ${f.id} ${f.severity}, ${f.file}: ${f.problem.replace(/\s+/g, " ").trim()}`,
      );
  }
  return lines.join("\n");
}

const USAGE =
  "Usage: bun findings.ts [project-root] <start|add|set|summary|commit> ...";

function head(root: string): string {
  const result = spawnSync(
    "git",
    ["-C", root, "rev-parse", "--short", "HEAD"],
    {
      encoding: "utf8",
    },
  );
  return result.stdout.trim();
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const commands = ["start", "add", "set", "summary", "commit"];
  const at = args.findIndex((arg) => commands.includes(arg));
  const root = resolve(at === 1 ? (args[0] ?? ".") : ".");
  const [command, ...rest] = args.slice(at);
  const fail = (message: string) => {
    console.error(message);
    process.exit(2);
  };
  if (at < 0 || at > 1) fail(USAGE);
  const path = join(root, FINDINGS);
  const save = (data: Findings) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, renderFindings(data));
  };
  const data = readFindings(root);

  if (command === "start") {
    const [review, since] = rest;
    if (!(SEVERITIES as readonly string[]).includes(review ?? ""))
      fail(`${USAGE}\nstart <defect|polish> [<commit>]`);
    const declined = (data?.findings ?? []).filter(
      (f) => f.status === "declined",
    );
    save({
      commit: head(root),
      review: `${review}, ${since ? `changed since ${since}` : "every document"}`,
      findings: declined,
    });
    console.log(
      `Started a ${review} review; kept ${declined.length} declined findings`,
    );
  } else if (!data) fail(`${FINDINGS} does not exist; run start first`);
  else if (command === "add") {
    const text = readFileSync(rest[0] ?? 0, "utf8");
    const { findings, errors } = parseFindings(text);
    if (errors.length > 0)
      fail(
        `Nothing added; fix these blocks and add the report again:\n${errors.map((e) => `- ${e}`).join("\n")}`,
      );
    const { added, skipped } = addFindings(data, findings);
    save(data);
    console.log(
      `Added ${added.length} findings${skipped > 0 ? `; skipped ${skipped} already in the file` : ""}`,
    );
  } else if (command === "set") {
    const [status, ...ids] = rest;
    if (
      !(STATUSES as readonly string[]).includes(status ?? "") ||
      ids.length === 0
    )
      fail(`${USAGE}\nset <${STATUSES.join("|")}> <id>...`);
    const unknown = ids.filter((id) => !data.findings.some((f) => f.id === id));
    if (unknown.length > 0) fail(`No finding ${unknown.join(", ")}`);
    for (const finding of data.findings)
      if (ids.includes(finding.id)) finding.status = status as Status;
    save(data);
    console.log(`Set ${ids.length} findings ${status}`);
  } else if (command === "summary") console.log(summarize(data));
  else if (command === "commit") {
    data.commit = head(root);
    save(data);
    console.log(`Checked at ${data.commit}`);
  }
}
