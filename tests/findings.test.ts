import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { planSync } from "../cli/sync.ts";
import { parseReport } from "../project/.agents/skills/dev-framework/scripts/findings.ts";
import {
  knowledgeIndex,
  loadPlan,
  renderMap,
} from "../project/.agents/skills/dev-framework/scripts/map.ts";
import { readState } from "../project/.agents/skills/dev-framework/scripts/state.ts";

const SCRIPTS = join(
  import.meta.dir,
  "../project/.agents/skills/dev-framework/scripts",
);
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function write(root: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

function git(root: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", "-C", root, ...args], {
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: root },
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

const doc = (title: string, body = "") =>
  `---\ncanonical_for:\n  - ${title}\nread_when: before changing ${title}\n---\n\n# ${title}\n${body}`;

/** An adopted project with two Knowledge documents, one with a lead, committed. */
function project(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dev-findings-")));
  roots.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
  write(root, {
    ".gitignore": "/.tmp/\n",
    "dev.yaml": "workspaces:\n  - .\n",
    "README.md":
      "# Project\n\nRead [AGENTS](AGENTS.md), [Knowledge](knowledge/README.md), and [Plan](plan/README.md).\n",
    "knowledge/glossary.md": doc(
      "Glossary",
      "\n- **Desktop core**: the crate. Avoid: engine.\n",
    ),
    "knowledge/product/chat.md": doc("Chat", "\nThe engine streams answers.\n"),
    "knowledge/product/files.md": doc("Files", "\nFiles are kept.\n"),
    "plan/README.md": "# Plan\n\nRead the [map](map.md).\n",
    "plan/nodes/root.md":
      "---\ntitle: root\nparent: null\ndepends_on: []\nkind: goal\nstatus: open\n---\n\n# root\n\n## Goal\nA goal.\n",
  });
  for (const change of planSync(root).changes) change.apply(root);
  write(root, {
    "plan/map.md": renderMap(loadPlan(root)),
    "knowledge/README.md": knowledgeIndex(root).text ?? "",
  });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "Adopt");
  return root;
}

function run(root: string, script: string, args: string[], input = "") {
  const result = Bun.spawnSync(["bun", join(SCRIPTS, script), root, ...args], {
    stdin: new TextEncoder().encode(input),
  });
  return {
    code: result.exitCode,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
}

const finding = (n: number, file: string, extra = "") =>
  `## ${n} · defect\n\n- File: ${file}\n- Quote: The engine streams answers.\n- Rule: knowledge/dev-framework/knowledge-documentation.md#glossary\n- Problem: It uses a word the glossary avoids.\n- Failure: An agent reads "engine" as a second component.\n- Evidence: knowledge/glossary.md says to avoid "engine".\n- Fix: Say "desktop core".\n${extra}`;

describe("parseReport", () => {
  test("reads findings, leads, and verdicts", () => {
    const report = parseReport(
      `I judged it.\n\n${finding(1, "`knowledge/product/chat.md:9`.")}\n## Leads\n\n- 1a2b3c4d: finding 1\n- 5e6f7a8b: not a finding: a library's name\n\n## Verdicts\n\n- knowledge/product/chat.md: findings 1\n- knowledge/product/files.md: holds\n`,
      "defect",
    );
    expect(report.errors).toEqual([]);
    expect(report.findings.get(1)).toMatchObject({
      file: "knowledge/product/chat.md:9",
      failure: 'An agent reads "engine" as a second component.',
    });
    expect([...report.leads]).toEqual([
      ["1a2b3c4d", "finding 1"],
      ["5e6f7a8b", "not a finding: a library's name"],
    ]);
    expect(report.verdicts.get("knowledge/product/files.md")).toBe("holds");
  });

  test("a defect without Failure and Evidence is refused as polish", () => {
    const { errors } = parseReport(
      "## 1 · defect\n\n- File: a.md:1\n- Quote: x\n- Rule: r\n- Problem: p\n- Fix: f\n",
      "defect",
    );
    expect(errors).toEqual([
      '"1 · defect" lacks Failure, Evidence; a defect shows who, following the text, acts wrongly, and the evidence, or it is polish',
    ]);
  });

  test("reads a value that goes on in indented lines", () => {
    const { findings } = parseReport(
      "## 1 · polish\n\n- File: a.md:1\n- Quote: x\n- Rule: r\n- Problem: Two lines:\n  - one.\n- Fix: f\n\nNot part of it.\n",
      "polish",
    );
    expect(findings.get(1)?.problem).toBe("Two lines:\n  - one.");
  });
});

describe("the command line", () => {
  /** Plans a defect review, all in batch 1, and returns its leads. */
  const plan = (root: string) => {
    expect(run(root, "review.ts", ["defect"]).code).toBe(0);
    const batch = run(root, "review.ts", ["--batch", "1"]).out;
    expect(batch).toContain("- knowledge/product/chat.md (");
    return [...batch.matchAll(/lead (\w+): (.*)/g)].map((m) => ({
      id: m[1] ?? "",
      text: m[2] ?? "",
    }));
  };
  /** Verdicts for the documents besides chat.md, which hold. */
  const holds = [
    "AGENTS.md",
    "README.md",
    "plan/README.md",
    "knowledge/glossary.md",
    "knowledge/product/files.md",
    "plan/nodes/root.md",
  ]
    .map((path) => `- ${path}: holds\n`)
    .join("");

  test("add records findings, lead verdicts, and the documents that held", () => {
    const root = project();
    const leads = plan(root);
    expect(leads.map((l) => l.text)).toEqual([
      'line 9 uses engine, which the glossary avoids in favor of "Desktop core": the same sense?',
    ]);
    const report = `${finding(1, "knowledge/product/chat.md:9")}\n## Leads\n\n- ${leads[0]?.id}: finding 1\n\n## Verdicts\n\n- knowledge/product/chat.md: findings 1\n${holds}`;
    expect(run(root, "findings.ts", ["add", "1"], report)).toMatchObject({
      code: 0,
      out: "Recorded batch 1: 1 new findings, 6 documents verified\n",
    });
    const state = readState(root);
    expect(state.findings.map((f) => [f.id, f.status, f.file])).toEqual([
      ["F1", "proposed", "knowledge/product/chat.md:9"],
    ]);
    expect(state.leads.map((l) => l.verdict)).toEqual(["finding F1"]);
    expect(state.verdicts.map((v) => v.path)).toEqual([
      "AGENTS.md",
      "README.md",
      "knowledge/glossary.md",
      "knowledge/product/files.md",
      "plan/README.md",
      "plan/nodes/root.md",
    ]);
    // The next review leaves out the document that held.
    run(root, "review.ts", ["defect"]);
    expect(run(root, "review.ts", ["--batch", "1"]).out).not.toContain(
      "- knowledge/product/files.md (",
    );
    expect(run(root, "findings.ts", ["add", "1"], report).out).toContain(
      "0 new findings, 1 already recorded",
    );
  });

  test("add refuses a report without a verdict for each document and lead, and records nothing", () => {
    const root = project();
    plan(root);
    const result = run(
      root,
      "findings.ts",
      ["add", "1"],
      "## Verdicts\n\n- knowledge/product/chat.md: holds\n",
    );
    expect(result.code).toBe(2);
    expect(result.err).toContain(
      'no verdict for knowledge/product/files.md; add "- knowledge/product/files.md: holds"',
    );
    expect(result.err).toContain("no verdict for lead ");
    expect(readState(root)).toEqual({ verdicts: [], leads: [], findings: [] });
  });

  test("add refuses a verdict that cites a finding the report lacks", () => {
    const root = project();
    const leads = plan(root);
    // A heading the parser does not read drops the finding, so the verdict would stand for nothing.
    const report = `${finding(1, "knowledge/product/chat.md:9").replace("## 1 · defect", "## 1 - defect")}\n## Leads\n\n- ${leads[0]?.id}: not a finding: the same sense.\n\n## Verdicts\n\n- knowledge/product/chat.md: findings 1\n${holds}`;
    const result = run(root, "findings.ts", ["add", "1"], report);
    expect(result.code).toBe(2);
    expect(result.err).toContain(
      "the verdict for knowledge/product/chat.md cites finding 1, which the report does not have",
    );
    expect(readState(root)).toEqual({ verdicts: [], leads: [], findings: [] });
  });

  test("a finding with a Decision is applied only after its answer", () => {
    const root = project();
    const leads = plan(root);
    const report = `${finding(1, "knowledge/product/chat.md:9", "- Decision: Is the engine the desktop core? Options: rename, keep. Recommend: rename.\n")}\n## Leads\n\n- ${leads[0]?.id}: finding 1\n\n## Verdicts\n\n- knowledge/product/chat.md: findings 1\n${holds}`;
    run(root, "findings.ts", ["add", "1"], report);
    expect(run(root, "findings.ts", ["summary"]).out).toBe(
      [
        "defect: 6 of 7 documents verified at their current content",
        "polish: 0 of 7 documents verified at their current content",
        "",
        "Decisions to ask the user, one at a time (1)",
        "- F1 knowledge/product/chat.md:9: Is the engine the desktop core? Options: rename, keep. Recommend: rename.",
        "",
      ].join("\n"),
    );
    expect(run(root, "findings.ts", ["set", "applied", "F1"]).err).toContain(
      "F1 need the user's answer first",
    );
    expect(run(root, "findings.ts", ["answer", "F1", "Rename it."]).code).toBe(
      0,
    );
    expect(run(root, "findings.ts", ["show", "F1"]).out).toContain(
      "- Answer: Rename it.",
    );
    expect(run(root, "findings.ts", ["set", "applied", "F1"]).code).toBe(0);
    expect(readState(root).findings).toEqual([]);
  });

  test("the summary groups proposed findings by rule and links the same quote", () => {
    const root = project();
    const leads = plan(root);
    const second = finding(2, "knowledge/product/chat.md:9").replace(
      "#glossary",
      "#what-knowledge-holds",
    );
    run(
      root,
      "findings.ts",
      ["add", "1"],
      `${finding(1, "knowledge/product/chat.md:9")}\n${second}\n## Leads\n\n- ${leads[0]?.id}: finding 1\n\n## Verdicts\n\n- knowledge/product/chat.md: findings 1, 2\n${holds}`,
    );
    run(root, "findings.ts", ["set", "declined", "F2"]);
    expect(run(root, "findings.ts", ["summary"]).out).toContain(
      [
        "Proposed findings by rule (1)",
        "knowledge/dev-framework/knowledge-documentation.md#glossary (1)",
        "- F1 defect, knowledge/product/chat.md:9: It uses a word the glossary avoids.",
        "",
        "Declined: 1",
      ].join("\n"),
    );
  });
});
