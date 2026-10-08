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
import { planSync, SOURCE } from "../cli/sync.ts";
import { anchors } from "../project/.agents/skills/dev-framework/scripts/check.ts";
import {
  knowledgeIndex,
  loadPlan,
  renderMap,
  sections,
} from "../project/.agents/skills/dev-framework/scripts/map.ts";
import {
  changedLines,
  prepareReview,
  RULES,
  RULES_DIRECTORY,
  readPlan,
  renderBatch,
  UNREVIEWED,
} from "../project/.agents/skills/dev-framework/scripts/review.ts";
import {
  readState,
  STATE,
  writeState,
} from "../project/.agents/skills/dev-framework/scripts/state.ts";

const SCRIPTS = join(
  import.meta.dir,
  "../project/.agents/skills/dev-framework/scripts",
);
const REVIEW = join(SCRIPTS, "review.ts");
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
  `---\ncanonical_for:\n  - ${title}\nread_when: before changing ${title}\n---\n\n# ${title}\n${body}`;

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
    "knowledge/product/chat.md": doc("Chat", "\nChat streams answers.\n"),
    "plan/README.md": "# Plan\n\nRead the [map](map.md).\n",
    "plan/nodes/root.md": node("root", null, "goal"),
    ...files,
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

/** An entry's notes, then its leads, as a judge reads them. */
const notes = (
  root: string,
  review: "defect" | "polish",
  path: string,
  since?: string,
) => {
  const entry = prepareReview(root, review, { since })
    .batches.flatMap((b) => b.entries)
    .find((e) => e.path === path);
  return entry
    ? [...entry.notes, ...entry.leads.map((lead) => `lead: ${lead.text}`)]
    : [];
};

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
  test("order documents by type, let small batches share a judge, and spare the managed and generated ones", () => {
    const root = project({
      "plan/nodes/a.md": node("a", "root", "explore"),
    });
    const { batches, total } = prepareReview(root, "defect");
    expect(batches.map((b) => [b.types, b.entries.map((e) => e.path)])).toEqual(
      [
        [
          ["agents", "readme", "knowledge", "goal", "explore"],
          [
            "AGENTS.md",
            "README.md",
            "plan/README.md",
            "knowledge/product/chat.md",
            "plan/nodes/root.md",
            "plan/nodes/a.md",
          ],
        ],
      ],
    );
    expect(total).toBe(6);
  });

  test("a batch holds about 5,000 words, and a larger document gets its own", () => {
    const long = (n: number) => `${"word ".repeat(n)}\n`;
    const root = project({
      "knowledge/product/a.md": doc("A", long(3000)),
      "knowledge/product/b.md": doc("B", long(3000)),
      "knowledge/product/c.md": doc("C", long(6000)),
    });
    const knowledge = prepareReview(root, "polish")
      .batches.map((b) =>
        b.entries.filter((e) => e.type === "knowledge").map((e) => e.path),
      )
      .filter((paths) => paths.length > 0);
    expect(knowledge).toEqual([
      ["knowledge/product/a.md", "knowledge/product/chat.md"],
      ["knowledge/product/b.md"],
      ["knowledge/product/c.md"],
    ]);
  });

  test("--changed-since takes changed documents, types whose rules changed, and goals whose children changed", () => {
    const root = project({ "plan/nodes/a.md": node("a", "root", "explore") });
    write(root, {
      "plan/nodes/a.md": node("a", "root", "explore", "\n## Notes\n- x\n"),
    });
    const paths = (review: "defect" | "polish") =>
      prepareReview(root, review, { since: "HEAD" }).batches.flatMap((b) =>
        b.entries.map((e) => e.path),
      );
    expect(paths("defect")).toEqual(["plan/nodes/root.md", "plan/nodes/a.md"]);
    write(root, {
      [`${RULES_DIRECTORY}/knowledge-documentation.md`]:
        "---\nmanaged_by: dev-framework\n---\n\n# Edited\n",
    });
    expect(paths("polish")).toEqual([
      "knowledge/product/chat.md",
      "plan/nodes/a.md",
    ]);
  });
});

describe("leads", () => {
  test("point at progress words, dates, glossary words, and links into the Plan in Knowledge", () => {
    const root = project({
      "knowledge/glossary.md": doc(
        "Glossary",
        "\n- **Desktop core**: the crate. Avoid: Core alone, engine.\n",
      ),
      "knowledge/product/chat.md": doc(
        "Chat",
        "\nThe engines stream for now.\n\nChecked on 2026-10-01.\n\nThe desktop core and the Core.\n\nStreaming is not yet implemented.\n\nSee [the leaf](../../plan/nodes/a.md) and [the crate](../../crates/desktop-core-engine/README.md).\n",
      ),
      "plan/nodes/a.md": node("a", "root", "explore"),
    });
    expect(notes(root, "defect", "knowledge/product/chat.md")).toEqual([
      'lead: line 9 uses engine, which the glossary avoids in favor of "Desktop core": the same sense?',
      'lead: line 9 says "for now": build status, or a fact about the product?',
      "lead: line 11 has the date 2026-10-01: history, or when a fact was checked?",
      'lead: line 13 uses Core alone, which the glossary avoids in favor of "Desktop core": the same sense?',
      "lead: links plan/nodes/a.md: work history or status in Knowledge?",
    ]);
  });

  test("point at Knowledge named after a milestone, one of root's child goals", () => {
    const root = project({
      "plan/nodes/02-mlp.md": node("02-mlp", "root", "goal"),
      "knowledge/product/mlp-definition.md": doc("EdgeKeep MLP settings"),
      "knowledge/product/settings.md": doc("Settings, like MLPs elsewhere"),
    });
    expect(
      notes(root, "defect", "knowledge/product/mlp-definition.md"),
    ).toEqual([
      "lead: its file name names mlp, as the goal 02-mlp does: a document scoped to a milestone or piece of work, rather than a subject?",
    ]);
    expect(notes(root, "defect", "knowledge/product/settings.md")).toEqual([]);
  });

  test("point at a repeat of another document, unless the line links it", () => {
    const sentence =
      "Every answer cites the passages it used, so the user can check each claim against its source.";
    const root = project({
      "knowledge/product/chat.md": doc("Chat", `\n${sentence}\n`),
      "plan/nodes/a.md": node(
        "a",
        "root",
        "explore",
        `\n## Notes\n- ${sentence}\n- As [Chat](../../knowledge/product/chat.md) says: ${sentence}\n`,
      ),
    });
    expect(notes(root, "defect", "plan/nodes/a.md")).toEqual([
      "status todo",
      `lead: line 15 repeats 17 or more words of knowledge/product/chat.md:9: a gist with a link, or a second owner? "- Every answer cites the passages it used, so the user can check each…"`,
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
      "knowledge/product/chat.md": doc("Chat", `\n${sentence}\n`),
    });
    write(root, {
      "plan/nodes/a.md": node(
        "a",
        "root",
        "explore",
        `\n## Notes\n- ${sentence}\n`,
      ),
    });
    const leads = notes(root, "defect", "plan/nodes/a.md", "HEAD");
    expect(leads[1]).toStartWith(
      "lead: line 15 repeats 17 or more words of knowledge/product/chat.md:9",
    );
  });

  test("point at history in a Goal, criteria after a Goal change, and questions left in an explore leaf", () => {
    const root = project({
      "plan/nodes/a.md": node(
        "a",
        "root",
        "explore",
        "\n## Not yet specified\n- Which formats does it read?\n",
      ).replace("A goal.", "A goal. It grew to include the icon."),
      "plan/nodes/g.md": node(
        "g",
        "root",
        "goal",
        "\n## Completion criteria\n- [ ] It runs.\n\n## Record\n- Goal changed: A smaller goal, the icon joined.\n",
      ),
    });
    expect(notes(root, "defect", "plan/nodes/a.md")).toEqual([
      "status todo",
      'lead: its Goal says "grew to": history that belongs in Record?',
      'lead: a question under Not yet specified: can it be stated precisely as a ticket? "- Which formats does it read?"',
    ]);
    expect(notes(root, "defect", "plan/nodes/g.md")).toEqual([
      "status open",
      "lead: its Goal changed: do the Completion criteria cover what the Goal gained?",
    ]);
  });

  test("leave whole decision lines and Goal changed lines in a finished node alone", () => {
    const long = "word ".repeat(60);
    const root = project({
      "plan/nodes/a.md": node(
        "a",
        "root",
        "explore",
        `\n## Decisions so far\n- Which format? → ${long}, 2026-10-01\n`,
      )
        .replace("status: todo", "status: done")
        .replace(
          /## Record\n$/,
          `## Record\n- Goal changed: ${long}, it grew.\n- Finished: decided.\n`,
        ),
    });
    expect(notes(root, "defect", "plan/nodes/a.md")).toEqual(["status done"]);
    expect(notes(root, "polish", "plan/nodes/a.md")).toEqual(["status done"]);
  });

  test("list a goal's children, and the declined findings in a document", () => {
    const root = project({ "plan/nodes/a.md": node("a", "root", "explore") });
    writeState(root, {
      verdicts: [],
      leads: [],
      findings: [
        {
          id: "F1",
          review: "defect",
          status: "declined",
          file: "knowledge/product/chat.md:9",
          quote: "Chat streams answers.",
          rule: "x",
          problem: "Vague.",
          fix: "y",
        },
      ],
    });
    expect(notes(root, "defect", "plan/nodes/root.md")).toContain(
      "child a: explore, todo",
    );
    expect(notes(root, "defect", "knowledge/product/chat.md")).toEqual([
      "declined F1 at knowledge/product/chat.md:9: Vague.",
    ]);
    expect(notes(root, "polish", "knowledge/product/chat.md")).toEqual([]);
  });

  test("polish points at long Knowledge and long Record lines", () => {
    const root = project({
      "knowledge/product/chat.md": doc("Chat", "\nline\n".repeat(80)),
      "plan/nodes/a.md": node("a", "root", "explore").replace(
        "## Record\n",
        `## Record\n- Planned: ${"word ".repeat(60)}\n`,
      ),
    });
    expect(notes(root, "polish", "knowledge/product/chat.md")).toEqual([
      "lead: 168 lines, above the 150 at which Length asks to compress or split",
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
      "Defect review of 5 documents, every document not verified at its current content: 1 batches\n1. agents, readme, knowledge, goal: 5 documents,",
    );
    expect(readPlan(root)?.batches.length).toBe(1);
    const batch = run(root, "--batch", "1").out;
    expect(batch).toStartWith(
      "Batch 1 of 1: defect review of agents, readme, knowledge, and goal documents\n\nRules for agents documents:",
    );
    expect(batch).toContain(
      `- ${RULES_DIRECTORY}/knowledge-documentation.md#what-knowledge-holds\n`,
    );
    expect(batch).toContain('- "Chat": knowledge/product/chat.md\n');
    expect(batch).toContain("\n- knowledge/product/chat.md (");
    expect(batch).toContain("words): judge it whole");
    expect(renderBatch(root, prepareReview(root, "defect"), 9)).toBe("");
  });

  test("rejects a missing review, an unknown commit, or a batch that does not exist", () => {
    const root = project();
    expect(run(root).code).toBe(2);
    expect(run(root, "style").code).toBe(2);
    expect(run(root, "defect", "--changed-since", "nope").code).toBe(2);
    expect(run(root, "--batch", "1").err).toContain(
      ".tmp/review/plan.json does not exist",
    );
    run(root, "defect");
    expect(run(root, "--batch", "9").err).toContain(
      "There is no batch 9; the review has 1",
    );
  });
});

describe("verdicts", () => {
  const entries = (root: string, options: { fresh?: boolean } = {}) =>
    prepareReview(root, "defect", options).batches.flatMap((b) => b.entries);
  const entry = (root: string, path: string) =>
    entries(root).find((e) => e.path === path);
  /** Records that a document held, as findings.ts does for a judge's "holds". */
  const verify = (root: string, path: string) => {
    const planned = entry(root, path);
    if (!planned) throw new Error(`${path} is not planned`);
    git(root, "hash-object", "-w", path);
    const state = readState(root);
    state.verdicts.push({
      review: "defect",
      path,
      blob: planned.blob,
      rules: planned.rules,
    });
    writeState(root, state);
  };

  test("a document that held is skipped, and judged only on the lines changed since", () => {
    const root = project();
    verify(root, "knowledge/product/chat.md");
    expect(entry(root, "knowledge/product/chat.md")).toBeUndefined();
    write(root, {
      "knowledge/product/chat.md": doc(
        "Chat",
        "\nChat streams answers.\n",
      ).replace("before changing Chat", "before changing chat streaming"),
    });
    expect(entry(root, "knowledge/product/chat.md")).toBeUndefined();
    write(root, {
      "knowledge/product/chat.md": doc(
        "Chat",
        "\nChat streams answers.\n\nIt cites its sources.\n",
      ),
    });
    expect(entry(root, "knowledge/product/chat.md")).toMatchObject({
      basis: "verdict",
      lines: [11],
    });
    expect(
      entries(root, { fresh: true }).find(
        (e) => e.path === "knowledge/product/chat.md",
      )?.basis,
    ).toBe("whole");
  });

  test("a changed rule section sets the verdicts of its documents aside", () => {
    const root = project();
    verify(root, "knowledge/product/chat.md");
    const rules = join(root, RULES_DIRECTORY, "knowledge-documentation.md");
    writeFileSync(
      rules,
      readFileSync(rules, "utf8").replace(
        "## What Knowledge holds\n",
        "## What Knowledge holds\n\nA new rule.\n",
      ),
    );
    expect(entry(root, "knowledge/product/chat.md")?.basis).toBe("whole");
  });

  test("a changed Knowledge document puts a lead on each line that links it", () => {
    const root = project({
      "plan/nodes/a.md": node(
        "a",
        "root",
        "explore",
        "\n## Notes\n- Streaming, as [Chat](../../knowledge/product/chat.md) says.\n",
      ),
    });
    verify(root, "knowledge/product/chat.md");
    verify(root, "plan/nodes/a.md");
    write(root, {
      "knowledge/product/chat.md": doc("Chat", "\nChat answers at once.\n"),
    });
    const linking = entry(root, "plan/nodes/a.md");
    expect(linking).toMatchObject({ basis: "link", lines: [15] });
    expect(linking?.leads.map((l) => l.text)).toEqual([
      `line 15 links knowledge/product/chat.md, which changed at ${entry(root, "knowledge/product/chat.md")?.blob.slice(0, 7)}: does what it says of it still hold?`,
    ]);
  });

  test("a lead with a verdict is not asked again while its line stays", () => {
    const root = project({
      "knowledge/glossary.md": doc(
        "Glossary",
        "\n- **Desktop core**: the crate. Avoid: engine.\n",
      ),
      "knowledge/product/chat.md": doc("Chat", "\nThe engine streams.\n"),
    });
    const [lead] = entry(root, "knowledge/product/chat.md")?.leads ?? [];
    expect(lead?.text).toStartWith("line 9 uses engine");
    writeState(root, {
      ...readState(root),
      leads: [
        {
          review: "defect",
          path: "knowledge/product/chat.md",
          id: lead?.id ?? "",
          verdict: "not a finding: the library's name",
        },
      ],
    });
    expect(entry(root, "knowledge/product/chat.md")?.leads).toEqual([]);
    write(root, {
      "knowledge/product/chat.md": doc(
        "Chat",
        "\nIntro.\n\nThe engine streams.\n",
      ),
    });
    expect(entry(root, "knowledge/product/chat.md")?.leads).toEqual([]);
    write(root, {
      "knowledge/product/chat.md": doc("Chat", "\nThe engine streams fast.\n"),
    });
    expect(entry(root, "knowledge/product/chat.md")?.leads).toHaveLength(1);
  });

  test("a review limited to a commit judges the lines the change wrote", () => {
    const root = project();
    write(root, {
      "knowledge/product/chat.md": doc(
        "Chat",
        "\nChat streams answers.\n\nIt cites its sources.\n",
      ),
    });
    expect(
      prepareReview(root, "defect", { since: "HEAD" })
        .batches.flatMap((b) => b.entries)
        .find((e) => e.path === "knowledge/product/chat.md"),
    ).toMatchObject({ basis: "change", lines: [11] });
  });

  test("changedLines finds the lines the new text adds or changes", () => {
    expect(changedLines("# T\n\na\nb\nc\n", "# T\n\na\nx\nc\n\nd\n")).toEqual([
      4, 7,
    ]);
  });

  test("the state file keeps one sorted line per entry", () => {
    const root = project();
    writeState(root, {
      verdicts: [
        { review: "defect", path: "b.md", blob: "2", rules: "r" },
        { review: "defect", path: "a.md", blob: "1", rules: "r" },
      ],
      leads: [],
      findings: [],
    });
    expect(readFileSync(join(root, STATE), "utf8")).toBe(
      '{"type":"verdict","review":"defect","path":"a.md","blob":"1","rules":"r"}\n{"type":"verdict","review":"defect","path":"b.md","blob":"2","rules":"r"}\n',
    );
  });
});
