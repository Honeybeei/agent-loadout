import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  loadPlan,
  renderMap,
  sections,
} from "../project/.agents/skills/dev-framework/scripts/map.ts";
import { anchors } from "./check.ts";
import {
  prepareReview,
  RULES,
  RULES_DIRECTORY,
  renderBatch,
  UNREVIEWED,
} from "./review.ts";
import { planSync, SOURCE } from "./sync.ts";

const REVIEW = join(import.meta.dir, "review.ts");
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

const node = (id: string, parent: string | null, kind: string, body = "") =>
  `---\ntitle: ${id}\nparent: ${parent}\ndepends_on: []\nkind: ${kind}\nstatus: ${kind === "goal" ? "open" : "todo"}\n---\n\n# ${id}\n\n## Goal\nA goal.\n${body}${kind === "goal" ? "" : "\n## Record\n"}`;

const doc = (title: string, body = "") =>
  `---\ncanonical_for:\n  - ${title}\n---\n\n# ${title}\n${body}`;

/** An adopted project with one Knowledge document, committed. */
function project(files: Record<string, string> = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dev-review-")));
  roots.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
  write(root, {
    ".gitignore": "/.tmp/\n",
    "dev.yaml": "workspaces:\n  - .\n",
    "README.md":
      "# Project\n\nRead [AGENTS](AGENTS.md), [Knowledge](knowledge/README.md), and [Plan](plan/README.md).\n",
    "knowledge/README.md":
      "# Knowledge\n\n- [Chat](chat.md): read before changing chat.\n",
    "knowledge/chat.md": doc("Chat", "\nChat streams answers.\n"),
    "plan/README.md": "# Plan\n\nRead the [map](map.md).\n",
    "plan/nodes/root.md": node("root", null, "goal"),
    ...files,
  });
  for (const change of planSync(root).changes) change.apply(root);
  write(root, { "plan/map.md": renderMap(loadPlan(root)) });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "Adopt");
  return root;
}

const notes = (root: string, review: "defect" | "polish", path: string) =>
  prepareReview(root, review)
    .batches.flatMap((b) => b.entries)
    .find((e) => e.path === path)?.notes ?? [];

describe("rules", () => {
  const sourceRules = join(SOURCE, RULES_DIRECTORY);

  test("every rule a review names exists", () => {
    const named = [
      ...Object.values(RULES).flatMap((byType) => Object.values(byType).flat()),
      ...UNREVIEWED,
    ];
    for (const rule of new Set(named)) {
      const [file = "", fragment] = rule.split("#");
      const text = readFileSync(join(sourceRules, file), "utf8");
      if (fragment !== undefined)
        expect({ rule, found: anchors(text).has(fragment) }).toEqual({
          rule,
          found: true,
        });
    }
  });

  test("every section of every rule document is reviewed or left to scripts and steps on purpose", () => {
    const named = new Set([
      ...Object.values(RULES).flatMap((byType) => Object.values(byType).flat()),
      ...UNREVIEWED,
    ]);
    const files = [
      "writing-rules.md",
      "project-structure.md",
      "knowledge-documentation.md",
      "readme-agents-guideline.md",
      "workflow.md",
      "git-workflow.md",
      "plan-documentation.md",
      "plan-documentation/goal.md",
      "plan-documentation/explore.md",
      "plan-documentation/collaborative.md",
      "plan-documentation/blackbox.md",
    ];
    const missing = files.flatMap((file) =>
      named.has(file)
        ? []
        : sections(readFileSync(join(sourceRules, file), "utf8"))
            .map(({ heading }) => `${file}#${[...anchors(`## ${heading}`)][0]}`)
            .filter((section) => !named.has(section)),
    );
    expect(missing).toEqual([]);
  });
});

describe("batches", () => {
  test("pack documents of one type, and spare the managed and generated ones", () => {
    const root = project({
      "plan/nodes/a.md": node("a", "root", "explore"),
    });
    const { batches, total } = prepareReview(root, "defect");
    expect(batches.map((b) => [b.type, b.entries.map((e) => e.path)])).toEqual([
      ["agents", ["AGENTS.md"]],
      ["readme", ["README.md", "knowledge/README.md", "plan/README.md"]],
      ["knowledge", ["knowledge/chat.md"]],
      ["goal", ["plan/nodes/root.md"]],
      ["explore", ["plan/nodes/a.md"]],
    ]);
    expect(total).toBe(7);
  });

  test("a batch holds about 5,000 words, and a larger document gets its own", () => {
    const long = (n: number) => `${"word ".repeat(n)}\n`;
    const root = project({
      "knowledge/a.md": doc("A", long(3000)),
      "knowledge/b.md": doc("B", long(3000)),
      "knowledge/c.md": doc("C", long(6000)),
    });
    const knowledge = prepareReview(root, "polish").batches.filter(
      (b) => b.type === "knowledge",
    );
    expect(knowledge.map((b) => b.entries.map((e) => e.path))).toEqual([
      ["knowledge/a.md", "knowledge/chat.md"],
      ["knowledge/b.md"],
      ["knowledge/c.md"],
    ]);
  });

  test("--changed-since takes changed documents, types whose rules changed, and goals whose children changed", () => {
    const root = project({ "plan/nodes/a.md": node("a", "root", "explore") });
    write(root, {
      "plan/nodes/a.md": node("a", "root", "explore", "\n## Notes\n- x\n"),
    });
    const paths = (review: "defect" | "polish") =>
      prepareReview(root, review, "HEAD").batches.flatMap((b) =>
        b.entries.map((e) => e.path),
      );
    expect(paths("defect")).toEqual(["plan/nodes/root.md", "plan/nodes/a.md"]);
    write(root, {
      [`${RULES_DIRECTORY}/knowledge-documentation.md`]:
        "---\nmanaged_by: dev-framework\n---\n\n# Edited\n",
    });
    expect(paths("polish")).toEqual(["knowledge/chat.md", "plan/nodes/a.md"]);
  });
});

describe("leads", () => {
  test("point at progress words, dates, glossary words, and links into the Plan in Knowledge", () => {
    const root = project({
      "knowledge/glossary.md": doc(
        "Glossary",
        "\n- **Desktop core**: the crate. Avoid: Core alone, engine.\n",
      ),
      "knowledge/chat.md": doc(
        "Chat",
        "\nThe engines stream for now.\n\nChecked on 2026-10-01.\n\nThe desktop core and the Core.\n\nStreaming is not yet implemented.\n\nSee [the leaf](../plan/nodes/a.md) and [the crate](../crates/desktop-core-engine/README.md).\n",
      ),
      "plan/nodes/a.md": node("a", "root", "explore"),
    });
    expect(notes(root, "defect", "knowledge/chat.md")).toEqual([
      'lead: line 8 uses engine, which the glossary avoids in favor of "Desktop core": the same sense?',
      'lead: line 8 says "for now": build status, or a fact about the product?',
      "lead: line 10 has the date 2026-10-01: history, or when a fact was checked?",
      'lead: line 12 uses Core alone, which the glossary avoids in favor of "Desktop core": the same sense?',
      "lead: links plan/nodes/a.md: work history or status in Knowledge?",
    ]);
  });

  test("point at a repeat of another document, unless the line links it", () => {
    const sentence =
      "Every answer cites the passages it used, so the user can check each claim against its source.";
    const root = project({
      "knowledge/chat.md": doc("Chat", `\n${sentence}\n`),
      "plan/nodes/a.md": node(
        "a",
        "root",
        "explore",
        `\n## Notes\n- ${sentence}\n- As [Chat](../../knowledge/chat.md) says: ${sentence}\n`,
      ),
    });
    expect(notes(root, "defect", "plan/nodes/a.md")).toEqual([
      "status todo",
      `lead: line 15 repeats 17 or more words of knowledge/chat.md:8: a gist with a link, or a second owner? "- Every answer cites the passages it used, so the user can check each…"`,
    ]);
  });

  test("leave out the Framework-managed sections, which no review judges", () => {
    const root = project();
    expect(notes(root, "defect", "AGENTS.md")).toEqual([]);
    expect(notes(root, "defect", "README.md")).toEqual([]);
  });

  test("compare a changed document with every document, changed or not", () => {
    const sentence =
      "Every answer cites the passages it used, so the user can check each claim against its source.";
    const root = project({
      "knowledge/chat.md": doc("Chat", `\n${sentence}\n`),
    });
    write(root, {
      "plan/nodes/a.md": node(
        "a",
        "root",
        "explore",
        `\n## Notes\n- ${sentence}\n`,
      ),
    });
    const leads = prepareReview(root, "defect", "HEAD")
      .batches.flatMap((b) => b.entries)
      .find((e) => e.path === "plan/nodes/a.md")?.notes;
    expect(leads?.[1]).toStartWith(
      "lead: line 15 repeats 17 or more words of knowledge/chat.md:8",
    );
  });

  test("point at a changed Goal without its Record line, and at questions left in an explore leaf", () => {
    const root = project({ "plan/nodes/a.md": node("a", "root", "explore") });
    write(root, {
      "plan/nodes/a.md": node(
        "a",
        "root",
        "explore",
        "\n## Not yet specified\n- Which formats does it read?\n",
      ).replace("A goal.", "Another goal."),
    });
    expect(notes(root, "defect", "plan/nodes/a.md")).toEqual([
      "status todo",
      'lead: its Goal differs from the node\'s first version, and Record has no "Goal changed:" line: did the meaning change?',
      'lead: a question under Not yet specified: can it be stated precisely as a ticket? "- Which formats does it read?"',
    ]);
  });

  test("list a goal's children, and the declined findings in a document", () => {
    const root = project({ "plan/nodes/a.md": node("a", "root", "explore") });
    write(root, {
      ".tmp/doctor/findings.md":
        "# Doctor Findings\n\n- Commit: abc\n- Review: defect, every document\n\n## F1 · defect · declined\n\n- File: knowledge/chat.md:8\n- Quote: Chat streams answers.\n- Rule: x\n- Problem: Vague.\n- Fix: y\n",
    });
    expect(notes(root, "defect", "plan/nodes/root.md")).toContain(
      "child a: explore, todo",
    );
    expect(notes(root, "defect", "knowledge/chat.md")).toEqual([
      "declined F1 at knowledge/chat.md:8: Vague.",
    ]);
    expect(notes(root, "polish", "knowledge/chat.md")).toEqual([]);
  });

  test("polish points at long Knowledge and long Record lines", () => {
    const root = project({
      "knowledge/chat.md": doc("Chat", "\nline\n".repeat(80)),
      "plan/nodes/a.md": node("a", "root", "explore").replace(
        "## Record\n",
        `## Record\n- Planned: ${"word ".repeat(60)}\n`,
      ),
    });
    expect(notes(root, "polish", "knowledge/chat.md")).toEqual([
      "lead: 167 lines, above the 150 at which Length asks to compress or split",
    ]);
    expect(notes(root, "polish", "plan/nodes/a.md")[1]).toStartWith(
      "lead: a Record line of 62 words",
    );
  });
});

describe("command line", () => {
  const run = (...args: string[]) => {
    const result = Bun.spawnSync(["bun", REVIEW, ...args]);
    return {
      code: result.exitCode,
      out: result.stdout.toString(),
      err: result.stderr.toString(),
    };
  };

  test("lists the batches, and prints one with its rules, topics, and documents", () => {
    const root = project();
    expect(run(root, "defect").out).toStartWith(
      "Defect review of 6 documents, every document: 4 batches\n1. agents: 1 documents,",
    );
    const batch = run(root, "defect", "--batch", "3").out;
    expect(batch).toStartWith(
      "Batch 3 of 4: defect review of knowledge documents\n",
    );
    expect(batch).toContain(
      `- ${RULES_DIRECTORY}/knowledge-documentation.md#what-knowledge-holds\n`,
    );
    expect(batch).toContain('- "Chat": knowledge/chat.md\n');
    expect(batch).toContain("Documents\n- knowledge/chat.md (");
    expect(
      renderBatch(root, "defect", prepareReview(root, "defect").batches, 9),
    ).toBe("");
  });

  test("rejects a missing review, an unknown commit, or a batch that does not exist", () => {
    const root = project();
    expect(run(root).code).toBe(2);
    expect(run(root, "style").code).toBe(2);
    expect(run(root, "defect", "--changed-since", "nope").code).toBe(2);
    expect(run(root, "defect", "--batch", "9").err).toContain(
      "There is no batch 9; the review has 4",
    );
  });
});
