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
import {
  loadPlan,
  renderMap,
} from "../project/.agents/skills/dev-framework/scripts/map.ts";
import { type Area, diagnose, hardWraps } from "./check.ts";
import { planSync } from "./sync.ts";

const CHECK = join(import.meta.dir, "check.ts");
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

function repository(files: Record<string, string> = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dev-check-")));
  roots.push(root);
  git(root, "init", "-q");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
  write(root, { ".gitignore": "/.tmp/\n", ...files });
  return root;
}

const node = (
  id: string,
  parent: string | null,
  kind: string,
  status: string,
) =>
  `---\ntitle: ${id}\nparent: ${parent}\ndepends_on: []\nkind: ${kind}\nstatus: ${status}\n---\n\n# ${id}\n\n## Goal\nA goal.\n`;

const doc = (title: string, fields = "") =>
  `---\ncanonical_for:\n  - ${title}\n${fields}---\n\n# ${title}\n`;

/** An adopted project that follows every rule the script checks. */
function project(): string {
  const root = repository({
    "dev.yaml": "workspaces:\n  - .\n",
    "README.md":
      "# Project\n\nRead [AGENTS](AGENTS.md), [Knowledge](knowledge/README.md), and [Plan](plan/README.md).\n",
    "knowledge/README.md": "# Knowledge\n",
    "plan/README.md": "# Plan\n\nRead the [map](map.md).\n",
    "plan/nodes/root.md": node("root", null, "goal", "open"),
  });
  for (const change of planSync(root).changes) change.apply(root);
  write(root, { "plan/map.md": renderMap(loadPlan(root)) });
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "Adopt the Dev Framework");
  return root;
}

const messages = (root: string, area: Area) =>
  diagnose(root)
    .findings.filter((finding) => finding.area === area)
    .map((finding) => finding.message)
    .join("\n");

describe("state", () => {
  test("a repository without dev.yaml is not adopted", () => {
    expect(diagnose(repository({ "README.md": "# Project\n" }))).toEqual({
      state: "not adopted",
      findings: [],
      units: {},
    });
  });

  test("reports what blocks adoption", () => {
    const root = repository({
      "CLAUDE.md": "Rules\n",
      ".claude/skills/mine/SKILL.md": "x\n",
    });
    const { state } = diagnose(root);
    expect(state).toBe("not adopted");
    expect(messages(root, "structure")).toContain("CLAUDE.md exists");
    expect(messages(root, "managed")).toContain(
      "blocks sync: .claude/skills must be a link",
    );
  });

  test("an adopted project that follows the rules is current, with no findings", () => {
    const { state, findings } = diagnose(project());
    expect({ state, findings }).toEqual({ state: "current", findings: [] });
  });

  test("changed managed material makes the project outdated", () => {
    const root = project();
    write(root, { ".agents/skills/grilling/SKILL.md": "edited\n" });
    expect(diagnose(root).state).toBe("outdated");
    expect(messages(root, "managed")).toContain(
      "sync would replace .agents/skills/grilling",
    );
  });
});

describe("findings", () => {
  const cases: [string, Record<string, string>, Area, string][] = [
    ["a CLAUDE.md", { "CLAUDE.md": "x\n" }, "structure", "CLAUDE.md exists"],
    [
      "a nested AGENTS.md",
      { "docs/AGENTS.md": "x\n" },
      "structure",
      "docs/AGENTS.md: AGENTS.md belongs only at the project root",
    ],
    [
      ".tmp/ missing from the root .gitignore",
      { ".gitignore": "" },
      "structure",
      "the root .gitignore must exclude /.tmp/",
    ],
    [
      "a workspace without a README",
      {
        "dev.yaml": "workspaces:\n  - apps/web\n",
        "apps/web/main.ts": "",
      },
      "structure",
      "workspace apps/web has no README.md",
    ],
    [
      "a missing workspace",
      { "dev.yaml": "workspaces:\n  - apps/web\n" },
      "structure",
      "workspace apps/web does not exist",
    ],
    [
      "the root declared with other workspaces",
      {
        "dev.yaml": "workspaces:\n  - .\n  - apps/web\n",
        "apps/web/README.md": "# Web\n",
      },
      "structure",
      '"." must be the only workspace',
    ],
    [
      "a workspace in a reserved area",
      { "dev.yaml": "workspaces:\n  - plan/web\n" },
      "structure",
      "workspace plan/web is inside a reserved area",
    ],
    [
      "nested workspaces",
      {
        "dev.yaml": "workspaces:\n  - apps\n  - apps/web\n",
        "apps/README.md": "# Apps\n",
        "apps/web/README.md": "# Web\n",
      },
      "structure",
      "workspace apps/web is nested inside apps",
    ],
    [
      "an invalid Plan node",
      { "plan/nodes/next.md": node("next", "root", "goal", "todo") },
      "plan",
      "next: status must be one of",
    ],
    [
      "a stale map",
      { "plan/nodes/next.md": node("next", "root", "explore", "todo") },
      "plan",
      "plan/map.md is stale",
    ],
    [
      "Knowledge without canonical_for",
      { "knowledge/topic.md": "# Topic\n" },
      "knowledge",
      "knowledge/topic.md: frontmatter needs canonical_for",
    ],
    [
      "a Knowledge file name that is not kebab-case",
      { "knowledge/My_Topic.md": doc("My topic") },
      "knowledge",
      "knowledge/My_Topic.md: file name must be kebab-case",
    ],
    [
      "Knowledge with two H1 headings",
      { "knowledge/topic.md": `${doc("Topic")}\n# Another\n` },
      "knowledge",
      "knowledge/topic.md: needs exactly one H1 heading, has 2",
    ],
    [
      "a child document missing from subdocs",
      {
        "knowledge/topic.md": doc("Topic"),
        "knowledge/topic/part.md": doc("Part"),
      },
      "knowledge",
      "knowledge/topic.md: subdocs does not list ./topic/part.md",
    ],
    [
      "subdocs that lists a missing document",
      { "knowledge/topic.md": doc("Topic", "subdocs:\n  - ./topic/gone.md\n") },
      "knowledge",
      "knowledge/topic.md: subdocs lists ./topic/gone.md, which does not exist",
    ],
    [
      "workspace Knowledge without canonical_for",
      {
        "dev.yaml": "workspaces:\n  - apps/web\n",
        "apps/web/README.md": "# Web\n",
        "apps/web/knowledge/README.md": "# Web Knowledge\n",
        "apps/web/knowledge/api.md": "# API\n",
      },
      "knowledge",
      "apps/web/knowledge/api.md: frontmatter needs canonical_for",
    ],
    [
      "a broken link",
      { "knowledge/README.md": "# Knowledge\n\nSee [the topic](topic.md).\n" },
      "links",
      "knowledge/README.md: broken link to topic.md",
    ],
    [
      "a topic with two owners",
      {
        "knowledge/deploy.md": doc("Deployment"),
        "knowledge/ops.md": doc("deployment"),
      },
      "ssot",
      '"Deployment" is in canonical_for of knowledge/deploy.md and knowledge/ops.md',
    ],
    [
      "a topic that a Framework document owns",
      { "knowledge/style.md": doc("Documentation style") },
      "ssot",
      '"Documentation style" is in canonical_for of knowledge/dev-framework/writing-rules.md and knowledge/style.md',
    ],
    [
      "a link from Knowledge to .tmp/",
      {
        "knowledge/topic.md": `${doc("Topic")}\nSee [notes](../.tmp/notes.md).\n`,
      },
      "links",
      "knowledge/topic.md: links to ../.tmp/notes.md in .tmp/",
    ],
    [
      "Knowledge the root README does not reach",
      { "knowledge/topic.md": doc("Topic") },
      "links",
      "knowledge/topic.md: not reachable from the root README",
    ],
    [
      "hard-wrapped prose",
      { "docs/guide.md": "# Guide\n\nThis sentence\nwraps.\n" },
      "writing",
      "docs/guide.md: hard-wrapped prose at line 3",
    ],
    [
      "an old plan/map.yaml",
      { "plan/map.yaml": "nodes: []\n" },
      "leftovers",
      "plan/map.yaml is from an earlier Framework",
    ],
    [
      "an old Framework skill",
      { ".agents/skills/dev-cycle/SKILL.md": "x\n" },
      "leftovers",
      ".agents/skills/dev-cycle is from an earlier Framework",
    ],
  ];
  for (const [name, files, area, message] of cases) {
    test(`reports ${name}`, () => {
      const root = project();
      write(root, files);
      expect(messages(root, area)).toContain(message);
    });
  }

  test("reports a .claude/skills link that is not in Git", () => {
    const root = project();
    git(root, "rm", "-q", "--cached", ".claude/skills");
    expect(messages(root, "managed")).toContain(".claude/skills is not in Git");
  });

  test("reports a missing required file", () => {
    const root = project();
    rmSync(join(root, "plan/README.md"));
    expect(messages(root, "structure")).toContain("plan/README.md is missing");
  });
});

describe("no false findings", () => {
  test("frontmatter comments are not headings, and complete subdocs pass", () => {
    const root = project();
    write(root, {
      "knowledge/topic.md": doc(
        "Topic",
        "# Add subdocs when this document has children:\nsubdocs:\n  - ./topic/part.md\n",
      ),
      "knowledge/topic/part.md": doc("Part"),
    });
    expect(messages(root, "knowledge")).toBe("");
  });

  test("links in code, root-relative links, URLs, and anchors pass", () => {
    const root = project();
    write(root, {
      "knowledge/README.md":
        "# Knowledge\n\n```md\n[x](gone.md)\n```\n\n`[y](gone.md)` [Plan](/plan/README.md) [Web](https://example.com) [Top](#knowledge)\n",
    });
    expect(messages(root, "links")).toBe("");
  });

  test("Knowledge reached through a directory link and subdocs passes", () => {
    const root = project();
    write(root, {
      "knowledge/README.md": "# Knowledge\n\nRead [the topic](topic.md).\n",
      "knowledge/topic.md": doc("Topic", "subdocs:\n  - ./topic/part.md\n"),
      "knowledge/topic/part.md": doc("Part"),
      "README.md":
        "# Project\n\n[AGENTS](AGENTS.md) [Knowledge](knowledge/) [Plan](plan/README.md)\n",
    });
    expect(messages(root, "links")).toBe("");
  });
});

describe("hard wraps", () => {
  test("finds the first line of each wrapped paragraph or list item", () => {
    expect(
      hardWraps("# T\n\nOne\ntwo\nthree\n\n- item\n  continues\n"),
    ).toEqual([3, 7]);
  });

  test("ignores structure: frontmatter, code, lists, tables, HTML, and headings", () => {
    const text = [
      "---",
      "canonical_for:",
      "  - Topic",
      "---",
      "# Title",
      "One paragraph.",
      "",
      "```text",
      "code",
      "lines",
      "```",
      "- one",
      "- two",
      "  - nested",
      "1. first",
      "",
      "| a | b |",
      "| --- | --- |",
      "",
      "<!-- start -->",
      "## Section",
      "<!-- end -->",
      "",
      "    indented",
      "    code",
    ].join("\n");
    expect(hardWraps(text)).toEqual([]);
  });
});

test("judgment units list nodes, topics, and maintained documents", () => {
  const root = project();
  write(root, { "knowledge/topic.md": doc("Topic") });
  const { units } = diagnose(root);
  expect(units.plan).toEqual(["plan/nodes/root.md"]);
  expect(units.ssot).toEqual(["Topic: knowledge/topic.md"]);
  expect(units.writing).toContain("knowledge/topic.md");
  expect(units.writing).not.toContain("plan/map.md");
  expect(units.writing).not.toContain("knowledge/dev-framework.md");
});

describe("CLI", () => {
  const run = (...args: string[]) => Bun.spawnSync(["bun", CHECK, ...args]);

  test("the diagnosis exits 0 only for a current project without findings", () => {
    const current = run(project());
    expect(current.exitCode).toBe(0);
    expect(current.stdout.toString()).toBe(
      "State: current\n\nGroups\n- structure: 0\n- plan: 0\n- knowledge: 0\n- ssot: 0\n- links: 0\n- writing: 0\n- leftovers: 0\n",
    );
    const bare = run(repository());
    expect(bare.exitCode).toBe(1);
    expect(bare.stdout.toString()).toContain("State: not adopted");
  });

  test("an outdated project shows managed material without group counts", () => {
    const root = project();
    write(root, { ".agents/skills/grilling/SKILL.md": "edited\n" });
    const out = run(root).stdout.toString();
    expect(out).toContain("Managed material\n");
    expect(out).toContain("- sync would replace .agents/skills/grilling\n");
    expect(out).not.toContain("Groups");
  });

  test("--group prints the findings and judgment units of the groups", () => {
    const root = project();
    write(root, { "docs/guide.md": "# Guide\n\nOne\ntwo\n" });
    const result = run(root, "--group", "plan,writing");
    expect(result.exitCode).toBe(1);
    const out = result.stdout.toString();
    expect(out).toContain(
      "plan: 0 findings\nJudgment units: 1\n- plan/nodes/root.md\n",
    );
    expect(out).toContain(
      "writing: 1 findings\n- docs/guide.md: hard-wrapped prose at line 3\n",
    );
    expect(run(root, "--group", "structure").exitCode).toBe(0);
  });

  test("rejects an unknown group", () => {
    expect(run(project(), "--group", "style").exitCode).toBe(2);
  });
});
