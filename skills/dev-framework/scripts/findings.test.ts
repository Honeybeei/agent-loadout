import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  addFindings,
  FINDINGS,
  type Findings,
  parseFindings,
  renderFindings,
} from "./findings.ts";

const SCRIPT = join(import.meta.dir, "findings.ts");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const report = `I judged two documents.

## 1 · defect

- File: knowledge/ipc.md:17
- Quote: Desktop IPC does not say how the frontend follows state.
- Rule: knowledge/dev-framework/readme-agents-guideline.md#navigation
- Problem: The reason to read the link is now false.
- Fix: Say that IPC says how the frontend follows state.

## 2 · polish

- File: knowledge/ipc.md:30
- Quote: It is the case that commands are sent.
- Rule: knowledge/dev-framework/writing-rules.md#documentation-style
- Problem: Wordy.
- Fix: Commands are sent.

## Verdicts

- writing-rules.md#documentation-style: 2
`;

describe("parseFindings", () => {
  test("reads each block and ignores the verdicts", () => {
    const { findings, errors } = parseFindings(report);
    expect(errors).toEqual([]);
    expect(findings.map((f) => [f.severity, f.status, f.file])).toEqual([
      ["defect", "proposed", "knowledge/ipc.md:17"],
      ["polish", "proposed", "knowledge/ipc.md:30"],
    ]);
  });

  test("reads a value that goes on in indented lines, and ends it at the next unindented line", () => {
    const text =
      "## 1 · defect\n\n- File: a.md:1; b.md:2\n- Quote: x\n- Rule: r\n- Problem: Two READMEs lack links:\n  - a.md lacks one.\n- Fix:\n  - In both, add the link.\n\nNot part of the finding.\n";
    const [finding] = parseFindings(text).findings;
    expect(finding?.problem).toBe(
      "Two READMEs lack links:\n  - a.md lacks one.",
    );
    expect(finding?.fix).toBe("\n  - In both, add the link.");
    const data: Findings = { commit: "", review: "", findings: [] };
    addFindings(data, finding ? [finding] : []);
    const rendered = renderFindings(data);
    expect(rendered).toContain("- Fix:\n  - In both, add the link.\n");
    expect(parseFindings(rendered).findings).toEqual(data.findings);
  });

  test("reads a path in a code span or at the end of a sentence", () => {
    const block = (file: string) =>
      `## 1 · defect\n- File: ${file}\n- Quote: q\n- Rule: r\n- Problem: p\n- Fix: f\n`;
    for (const file of ["`plan/nodes/x.md:12`", "plan/nodes/x.md:12."])
      expect(parseFindings(block(file)).findings[0]?.file).toBe(
        "plan/nodes/x.md:12",
      );
  });

  test("names a block that lacks a field", () => {
    expect(
      parseFindings("## 1 · defect\n\n- File: a.md:1\n- Rule: x\n").errors,
    ).toEqual(['"1 · defect" lacks Quote, Problem, Fix']);
  });

  test("reads back what it renders", () => {
    const data: Findings = {
      commit: "abc1234",
      review: "defect, every document",
      findings: [],
    };
    addFindings(data, parseFindings(report).findings);
    const text = renderFindings(data);
    expect(parseFindings(text).findings).toEqual(data.findings);
    expect(text).toContain("## F2 · polish · proposed\n");
  });
});

test("addFindings skips a problem already in the file, on whatever line", () => {
  const data: Findings = { commit: "", review: "", findings: [] };
  const [first] = parseFindings(report).findings;
  if (!first) throw new Error("no finding");
  addFindings(data, [first]);
  const moved = { ...first, file: "knowledge/ipc.md:19" };
  expect(addFindings(data, [moved]).skipped).toBe(1);
  expect(data.findings.map((f) => f.id)).toEqual(["F1"]);
});

describe("command line", () => {
  function repository(): string {
    const root = realpathSync(mkdtempSync(join(tmpdir(), "dev-findings-")));
    roots.push(root);
    const git = (...args: string[]) =>
      Bun.spawnSync(["git", "-C", root, ...args], {
        env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: root },
      });
    git("init", "-q", "-b", "main");
    git("commit", "-q", "--allow-empty", "-m", "start", "--author=T <t@t>");
    return root;
  }
  const run = (root: string, args: string[], input?: string) => {
    const result = Bun.spawnSync(["bun", SCRIPT, root, ...args], {
      stdin: input === undefined ? "ignore" : Buffer.from(input),
      env: {
        ...process.env,
        GIT_COMMITTER_NAME: "T",
        GIT_COMMITTER_EMAIL: "t@t",
      },
    });
    return {
      code: result.exitCode,
      out: result.stdout.toString(),
      err: result.stderr.toString(),
    };
  };

  test("start, add, set, and summary keep the file without hand edits", () => {
    const root = repository();
    expect(run(root, ["add"], report).code).toBe(2);
    expect(run(root, ["start", "defect"]).out).toContain(
      "kept 0 declined findings",
    );
    expect(run(root, ["add"], report).out).toBe("Added 2 findings\n");
    expect(run(root, ["set", "declined", "F2"]).code).toBe(0);
    expect(run(root, ["set", "declined", "F9"]).err).toContain("No finding F9");
    const summary = run(root, ["summary"]).out;
    expect(summary).toContain("defect: 1 proposed, 0 declined, 0 applied");
    expect(summary).toContain(
      "knowledge/ipc.md\n- F1 defect, knowledge/ipc.md:17: The reason to read the link is now false.",
    );
    expect(run(root, ["start", "polish", "HEAD"]).out).toContain(
      "kept 1 declined findings",
    );
    expect(run(root, ["add"], report).out).toBe(
      "Added 1 findings; skipped 1 already in the file\n",
    );
    const text = readFileSync(join(root, FINDINGS), "utf8");
    expect(text).toContain("- Review: polish, changed since HEAD");
    expect(text).toContain("## F2 · polish · declined");
    expect(text).toContain("## F3 · defect · proposed");
  });

  test("refuses a report with a malformed block, and adds nothing", () => {
    const root = repository();
    run(root, ["start", "defect"]);
    const result = run(root, ["add"], "## 1 · defect\n\n- File: a.md:1\n");
    expect(result.code).toBe(2);
    expect(result.err).toContain("Nothing added");
  });
});
