// The review state, .dev/review.jsonl: what judges verified, their verdicts on leads, and the findings not
// yet applied. Only the Framework's scripts write it: one JSON object per line, sorted, so diffs stay small.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const STATE = ".dev/review.jsonl";
export const REVIEWS = ["defect", "polish"] as const;
export type Review = (typeof REVIEWS)[number];
export const STATUSES = ["proposed", "declined"] as const;
export type Status = (typeof STATUSES)[number];

export interface Finding {
  id: string;
  review: Review;
  status: Status;
  file: string;
  quote: string;
  rule: string;
  problem: string;
  /** Who, following the text, does what wrong; required of a defect. */
  failure?: string;
  /** The quoted document, code, or commit that shows it; required of a defect. */
  evidence?: string;
  fix: string;
  /** The question the user must answer before the fix, with the options and a recommendation. */
  decision?: string;
  answer?: string;
}

/** A document held against the rule sections whose hash is `rules`, at the blob `blob`. */
export interface Verdict {
  review: Review;
  path: string;
  blob: string;
  rules: string;
}

/** A judge's verdict on a lead: "finding <id>", or "not a finding: <reason>". */
export interface LeadVerdict {
  review: Review;
  path: string;
  id: string;
  verdict: string;
}

export interface State {
  verdicts: Verdict[];
  leads: LeadVerdict[];
  findings: Finding[];
}

export function readState(root: string): State {
  const state: State = { verdicts: [], leads: [], findings: [] };
  const path = join(root, STATE);
  if (!existsSync(path)) return state;
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (line.trim() === "") return;
      let entry: { type?: unknown } & Record<string, unknown>;
      try {
        entry = JSON.parse(line);
      } catch {
        throw new Error(
          `${STATE}:${index + 1} is not valid JSON; restore the file from Git, since only the scripts write it`,
        );
      }
      const { type, ...fields } = entry;
      if (type === "verdict") state.verdicts.push(fields as unknown as Verdict);
      else if (type === "lead")
        state.leads.push(fields as unknown as LeadVerdict);
      else if (type === "finding")
        state.findings.push(fields as unknown as Finding);
    });
  return state;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const number = (id: string) => Number(id.replace(/^\D+/, "")) || 0;

export function writeState(root: string, state: State): void {
  const lines = [
    ...[...state.verdicts]
      .sort((a, b) => compare(a.review, b.review) || compare(a.path, b.path))
      .map(({ review, path, blob, rules }) =>
        JSON.stringify({ type: "verdict", review, path, blob, rules }),
      ),
    ...[...state.leads]
      .sort(
        (a, b) =>
          compare(a.review, b.review) ||
          compare(a.path, b.path) ||
          compare(a.id, b.id),
      )
      .map(({ review, path, id, verdict }) =>
        JSON.stringify({ type: "lead", review, path, id, verdict }),
      ),
    ...[...state.findings]
      .sort((a, b) => number(a.id) - number(b.id))
      .map((f) =>
        JSON.stringify({
          type: "finding",
          id: f.id,
          review: f.review,
          status: f.status,
          file: f.file,
          quote: f.quote,
          rule: f.rule,
          problem: f.problem,
          failure: f.failure,
          evidence: f.evidence,
          fix: f.fix,
          decision: f.decision,
          answer: f.answer,
        }),
      ),
  ];
  const path = join(root, STATE);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, lines.length > 0 ? `${lines.join("\n")}\n` : "");
}
