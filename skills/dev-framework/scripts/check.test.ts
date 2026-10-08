import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { hardWraps } from "../project/.agents/skills/dev-framework/scripts/check.ts";
import {
  knowledgeIndex,
  loadPlan,
  renderMap,
} from "../project/.agents/skills/dev-framework/scripts/map.ts";
import { type Area, diagnose } from "./doctor.ts";
import { planSync } from "./sync.ts";

const CHECK = join(import.meta.dir, "doctor.ts");
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
  git(root, "init", "-q", "-b", "main");
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
  `---\ntitle: ${id}\nparent: ${parent}\ndepends_on: []\nkind: ${kind}\nstatus: ${status}\n---\n\n# ${id}\n\n## Goal\nA goal.\n${kind === "goal" ? "" : "\n## Record\n"}`;

const doc = (title: string, fields = "") =>
  `---\ncanonical_for:\n  - ${title}\nread_when: before changing ${title}\n${fields}---\n\n# ${title}\n`;

/** Writes the files, then the Knowledge index the map script would generate for them. */
function writeIndexed(root: string, files: Record<string, string>) {
  write(root, files);
  write(root, { "knowledge/README.md": knowledgeIndex(root).text ?? "" });
}

/** An adopted project that follows every rule the script checks. */
function project(): string {
  const root = repository({
    "dev.yaml": "workspaces:\n  - .\n",
    "README.md":
      "# Project\n\nRead [AGENTS](AGENTS.md), [Knowledge](knowledge/README.md), and [Plan](plan/README.md).\n",
    "plan/README.md": "# Plan\n\nRead the [map](map.md).\n",
    "plan/nodes/root.md": node("root", null, "goal", "open"),
  });
  for (const change of planSync(root).changes) change.apply(root);
  writeIndexed(root, { "plan/map.md": renderMap(loadPlan(root)) });
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
      documents: [],
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
      { "knowledge/product/topic.md": "# Topic\n" },
      "knowledge",
      "knowledge/product/topic.md: frontmatter needs canonical_for",
    ],
    [
      "a Knowledge file name that is not kebab-case",
      { "knowledge/product/My_Topic.md": doc("My topic") },
      "knowledge",
      "knowledge/product/My_Topic.md: file name must be kebab-case",
    ],
    [
      "Knowledge with two H1 headings",
      { "knowledge/product/topic.md": `${doc("Topic")}\n# Another\n` },
      "knowledge",
      "knowledge/product/topic.md: needs exactly one H1 heading, has 2",
    ],
    [
      "a child document missing from subdocs",
      {
        "knowledge/product/topic.md": doc("Topic"),
        "knowledge/product/topic/part.md": doc("Part"),
      },
      "knowledge",
      "knowledge/product/topic.md: subdocs does not list ./topic/part.md",
    ],
    [
      "subdocs that lists a missing document",
      {
        "knowledge/product/topic.md": doc(
          "Topic",
          "subdocs:\n  - ./topic/gone.md\n",
        ),
      },
      "knowledge",
      "knowledge/product/topic.md: subdocs lists ./topic/gone.md, which does not exist",
    ],
    [
      "Knowledge in a workspace",
      {
        "dev.yaml": "workspaces:\n  - apps/web\n",
        "apps/web/README.md": "# Web\n",
        "apps/web/knowledge/api.md": doc("API"),
      },
      "knowledge",
      "apps/web/knowledge/ holds Knowledge outside root knowledge/",
    ],
    [
      "Knowledge outside a category",
      { "knowledge/topic.md": doc("Topic") },
      "knowledge",
      "knowledge/topic.md: move it, with any subdocuments, into the category whose question it answers",
    ],
    [
      "a directory that is not a category",
      { "knowledge/notes/topic.md": doc("Topic") },
      "knowledge",
      "knowledge/notes/ is not a category",
    ],
    [
      "a README inside a category",
      { "knowledge/product/README.md": "# Product\n" },
      "knowledge",
      "knowledge/product/README.md: a category holds only documents",
    ],
    [
      "Knowledge without read_when",
      {
        "knowledge/product/topic.md":
          "---\ncanonical_for:\n  - Topic\n---\n\n# Topic\n",
      },
      "knowledge",
      "knowledge/product/topic.md: frontmatter needs read_when",
    ],
    [
      "a stale Knowledge index",
      { "knowledge/product/topic.md": doc("Topic") },
      "knowledge",
      "knowledge/README.md is stale; regenerate it with the map script",
    ],
    [
      "a broken link",
      { "docs/guide.md": "# Guide\n\nSee [the topic](topic.md).\n" },
      "links",
      "docs/guide.md: broken link to topic.md",
    ],
    [
      "a topic with two owners",
      {
        "knowledge/delivery/deploy.md": doc("Deployment"),
        "knowledge/engineering/ops.md": doc("deployment"),
      },
      "ssot",
      '"Deployment" is in canonical_for of knowledge/delivery/deploy.md and knowledge/engineering/ops.md',
    ],
    [
      "build status in Knowledge",
      {
        "knowledge/product/chat.md": `${doc("Chat")}\nChat streams answers. Not yet implemented.\n`,
      },
      "ssot",
      'knowledge/product/chat.md:9: says "Not yet implemented"; Knowledge never states how far something is built',
    ],
    [
      "a topic that a Framework document owns",
      { "knowledge/engineering/style.md": doc("Documentation style") },
      "ssot",
      '"Documentation style" is in canonical_for of knowledge/dev-framework/writing-rules.md and knowledge/engineering/style.md',
    ],
    [
      "a link from Knowledge to .tmp/",
      {
        "knowledge/product/topic.md": `${doc("Topic")}\nSee [notes](../../.tmp/notes.md).\n`,
      },
      "links",
      "knowledge/product/topic.md: names ../../.tmp/notes.md in .tmp/, which may be deleted",
    ],
    [
      "a .tmp/ path that Knowledge names without a link",
      {
        "knowledge/product/topic.md": `${doc("Topic")}\nThe detail is in \`.tmp/research/topic.md\`.\n`,
      },
      "links",
      "knowledge/product/topic.md: names .tmp/research/topic.md in .tmp/",
    ],
    [
      "a link to a heading that does not exist",
      {
        "docs/guide.md":
          "# Guide\n\nRead [localization](../knowledge/product/topic.md#localization).\n",
        "knowledge/product/topic.md": `${doc("Topic")}\n## Pages and localization\n`,
      },
      "links",
      "docs/guide.md: broken link to ../knowledge/product/topic.md#localization, which matches no heading",
    ],
    [
      "a link to a heading of the same document that does not exist",
      { "docs/guide.md": "# Guide\n\nSee [below](#usage).\n" },
      "links",
      "docs/guide.md: broken link to #usage, which matches no heading",
    ],
    [
      "Knowledge the root README does not reach",
      { "knowledge/product/topic.md": doc("Topic") },
      "links",
      "knowledge/product/topic.md: not reachable from the root README",
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

test("reports every build-status line in Knowledge, and spares design prose and code", () => {
  const root = project();
  write(root, {
    "knowledge/product/chat.md": `${doc("Chat")}\nThese decisions are implemented.\n\nStreaming has been implemented.\n\nThe parser is implemented as a state machine. The \`not implemented\` error stays.\n`,
  });
  expect(messages(root, "ssot").split("\n")).toEqual([
    'knowledge/product/chat.md:9: says "are implemented"; Knowledge never states how far something is built, since the Plan and the code say that; keep the design and drop the status',
    'knowledge/product/chat.md:11: says "has been implemented"; Knowledge never states how far something is built, since the Plan and the code say that; keep the design and drop the status',
  ]);
});

describe("branches and worktrees", () => {
  /** A project with one leaf of the given kind and status, committed. */
  function withLeaf(kind: string, status: string): string {
    const root = project();
    write(root, {
      "plan/nodes/leaf.md": `${node("leaf", "root", kind, status).replace(/\n## Record\n$/, "")}\n## Output\nA page.\n\n## Completion criteria\n- [x] It loads.\n\n## Verification\n- Open it.\n\n## Record\n- Implemented: the page.\n`,
    });
    write(root, { "plan/map.md": renderMap(loadPlan(root)) });
    git(root, "add", "-A");
    git(root, "commit", "-q", "-m", "Add a leaf");
    return root;
  }
  const worktree = (root: string) =>
    join(dirname(root), `${basename(root)}.worktrees`, "leaf");
  afterEach(() => {
    for (const root of roots)
      rmSync(`${root}.worktrees`, { recursive: true, force: true });
  });

  test("a dispatched blackbox leaf with its branch and worktree passes", () => {
    const root = withLeaf("blackbox", "in_progress");
    git(
      root,
      "worktree",
      "add",
      "-q",
      "-b",
      "impl/leaf",
      worktree(root),
      "main",
    );
    expect(messages(root, "git")).toBe("");
  });

  test("an open collaborative leaf on its branch passes", () => {
    const root = withLeaf("collaborative", "in_progress");
    git(root, "branch", "impl/leaf");
    expect(messages(root, "git")).toBe("");
  });

  test("reports a running leaf without its branch, or a blackbox branch outside its worktree", () => {
    const root = withLeaf("blackbox", "in_progress");
    expect(messages(root, "git")).toContain(
      "leaf is an in_progress blackbox leaf without impl/leaf",
    );
    git(root, "branch", "impl/leaf");
    expect(messages(root, "git")).toContain(
      "leaf: impl/leaf is not checked out at",
    );
  });

  test("reports a branch the Framework does not use, and whether it is merged", () => {
    const root = withLeaf("blackbox", "todo");
    git(root, "branch", "parked/idea");
    expect(messages(root, "git")).toContain(
      "branch parked/idea is not main, impl/<node>, or prototype/<name>; it is merged into main, so delete it",
    );
  });

  test("reports a branch and a worktree left after the leaf finished", () => {
    const root = withLeaf("blackbox", "done");
    git(
      root,
      "worktree",
      "add",
      "-q",
      "-b",
      "impl/leaf",
      worktree(root),
      "main",
    );
    write(worktree(root), { "code.ts": "x\n" });
    git(worktree(root), "add", "-A");
    git(worktree(root), "commit", "-q", "-m", "Work");
    const found = messages(root, "git");
    expect(found).toContain(
      "branch impl/leaf remains while leaf is done; it has commits main lacks",
    );
    expect(found).toContain("which no in_progress blackbox leaf owns");
  });

  test("spares impl branches while the Plan has errors, since their nodes may not have loaded", () => {
    const root = project();
    git(root, "branch", "impl/old-node");
    git(root, "branch", "parked/idea");
    write(root, { "plan/nodes/broken.md": "no frontmatter\n" });
    const found = messages(root, "git");
    expect(found).not.toContain("impl/old-node");
    expect(found).toContain("branch parked/idea");
  });

  test("prototype branches pass", () => {
    const root = project();
    git(root, "branch", "prototype/sketch");
    expect(messages(root, "git")).toBe("");
  });
});

describe("no false findings", () => {
  test("frontmatter comments are not headings, and complete subdocs pass", () => {
    const root = project();
    writeIndexed(root, {
      "knowledge/product/topic.md": doc(
        "Topic",
        "# Add subdocs when this document has children:\nsubdocs:\n  - ./topic/part.md\n",
      ),
      "knowledge/product/topic/part.md": doc("Part"),
    });
    expect(messages(root, "knowledge")).toBe("");
  });

  test("a category dev.yaml declares passes", () => {
    const root = project();
    writeIndexed(root, {
      "dev.yaml":
        "workspaces:\n  - .\nknowledge_categories:\n  operations: How it runs in production\n",
      "knowledge/operations/runbook.md": doc("Runbook"),
    });
    expect(messages(root, "knowledge")).toBe("");
  });

  test("links in code, root-relative links, URLs, and anchors pass", () => {
    const root = project();
    write(root, {
      "docs/guide.md":
        "# Guide\n\n```md\n[x](gone.md)\n```\n\n`[y](gone.md)` [Plan](/plan/README.md) [Web](https://example.com) [Top](#guide)\n",
    });
    expect(messages(root, "links")).toBe("");
  });

  test("links to existing headings pass, as GitHub names them", () => {
    const root = project();
    write(root, {
      "docs/guide.md": [
        "# Guide",
        "",
        "[a](topic.md#pages-and-localization) [b](topic.md#the-dev-next-skill-v2)",
        "[c](topic.md#setup-1) [d](topic.md#legacy) [e](topic.md#한국어-제목)",
        "[f](topic.md#%ED%95%9C%EA%B5%AD%EC%96%B4-%EC%A0%9C%EB%AA%A9) [g](#top) [h](#guide)",
        "[i](../plan/README.md#plan) [j](../AGENTS.md) [k](topic.md#install) [l](topic.md#top)",
        "",
      ].join("\n"),
      "docs/topic.md": `${doc("Topic")}\n## Pages and localization\n\n## The \`dev-next\` skill (v2)\n\n## Setup\n\n## Setup\n\n<a id="legacy"></a>\n\n## 한국어 제목\n\n\`\`\`md\n## Not a heading\n\`\`\`\n\nInstall\n=======\n\n- not a heading\n---\n\n## Top\n`,
    });
    expect(messages(root, "links")).not.toContain("matches no heading");
  });

  test("Knowledge reached through a directory link and subdocs passes", () => {
    const root = project();
    writeIndexed(root, {
      "knowledge/product/topic.md": doc(
        "Topic",
        "subdocs:\n  - ./topic/part.md\n",
      ),
      "knowledge/product/topic/part.md": doc("Part"),
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

test("each maintained document has a type; managed and generated ones are left out", () => {
  const root = project();
  write(root, {
    "knowledge/product/topic.md": doc("Topic"),
    "docs/guide.md": "# Guide\n",
    "plan/nodes/leaf.md": node("leaf", "root", "explore", "todo"),
  });
  const types = Object.fromEntries(
    diagnose(root).documents.map((d) => [d.path, d.type]),
  );
  expect(types).toEqual({
    "AGENTS.md": "agents",
    "README.md": "readme",
    "docs/guide.md": "other",
    "knowledge/product/topic.md": "knowledge",
    "plan/README.md": "readme",
    "plan/nodes/leaf.md": "explore",
    "plan/nodes/root.md": "goal",
  });
});

describe("CLI", () => {
  const run = (...args: string[]) => Bun.spawnSync(["bun", CHECK, ...args]);

  test("the diagnosis exits 0 only for a current project without findings", () => {
    const current = run(project());
    expect(current.exitCode).toBe(0);
    expect(current.stdout.toString()).toBe(
      "State: current\n\nGroups\n- structure: 0\n- git: 0\n- plan: 0\n- knowledge: 0\n- ssot: 0\n- links: 0\n- writing: 0\n- leftovers: 0\n",
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

  test("--group prints the findings of the groups", () => {
    const root = project();
    write(root, { "docs/guide.md": "# Guide\n\nOne\ntwo\n" });
    const result = run(root, "--group", "plan,writing");
    expect(result.exitCode).toBe(1);
    const out = result.stdout.toString();
    expect(out).toContain("plan: 0 findings\n");
    expect(out).toContain(
      "writing: 1 findings\n- docs/guide.md: hard-wrapped prose at line 3; join each paragraph or list item onto one line\n",
    );
    expect(run(root, "--group", "structure").exitCode).toBe(0);
  });

  test("rejects an unknown group", () => {
    expect(run(project(), "--group", "style").exitCode).toBe(2);
  });
});
