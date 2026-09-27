import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  countOpenQuestions,
  loadPlan,
  renderMap,
} from "../project/.agents/skills/dev-framework/scripts/map.ts";

const MAP = join(
  import.meta.dir,
  "../project/.agents/skills/dev-framework/scripts/map.ts",
);
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

interface Fields {
  title?: string;
  parent?: string | null;
  depends_on?: string[];
  status?: string;
  [extra: string]: unknown;
}

function node(fields: Fields, body = ""): string {
  const yaml = Object.entries(fields)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  return `---\n${yaml}\n---\n\n# ${fields.title ?? "Untitled"}\n\n## Goal\nA goal.\n${body}`;
}

function project(nodes: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "dev-map-"));
  roots.push(root);
  mkdirSync(join(root, "plan", "nodes"), { recursive: true });
  for (const [id, text] of Object.entries(nodes))
    writeFileSync(join(root, "plan", "nodes", `${id}.md`), text);
  return root;
}

function run(...args: string[]) {
  const result = Bun.spawnSync(["bun", MAP, ...args]);
  return {
    code: result.exitCode,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
}

const sample = {
  root: node({
    title: "Product",
    parent: null,
    depends_on: [],
    status: "decomposed",
  }),
  apps: node({
    title: "Apps",
    parent: "root",
    depends_on: [],
    status: "decomposed",
  }),
  desktop: node(
    { title: "Desktop", parent: "apps", depends_on: [], status: "exploring" },
    "\n## Open questions\n- [grilling] One?\n- [research] Two?\n",
  ),
  setup: node({
    title: "Setup",
    parent: "desktop",
    depends_on: [],
    status: "ready",
  }),
  chat: node({
    title: "Chat",
    parent: "desktop",
    depends_on: ["setup"],
    status: "ready",
  }),
  web: node({ title: "Web", parent: "root", depends_on: [], status: "fog" }),
};

describe("renderMap", () => {
  test("draws the tree and lists the work possible now", () => {
    const plan = loadPlan(project(sample));
    expect(plan.errors).toEqual([]);
    expect(renderMap(plan)).toBe(
      [
        "# Plan Map",
        "",
        "Generated from `plan/nodes/` by `.agents/skills/dev-framework/scripts/map.ts`. Do not edit.",
        "",
        "```text",
        "root: Product — decomposed",
        "├── apps: Apps — decomposed",
        "│   └── desktop: Desktop — exploring, 2 open questions",
        "│       ├── chat: Chat — ready, waits for setup",
        "│       └── setup: Setup — ready",
        "└── web: Web — fog",
        "```",
        "",
        "## Now possible",
        "",
        "- Implement: [Setup](nodes/setup.md)",
        "- Explore: [Desktop](nodes/desktop.md), [Web](nodes/web.md)",
        "",
      ].join("\n"),
    );
  });

  test("lists a decomposed node whose children are finished as closable", () => {
    const plan = loadPlan(
      project({
        root: node({
          title: "Product",
          parent: null,
          depends_on: [],
          status: "decomposed",
        }),
        one: node({
          title: "One",
          parent: "root",
          depends_on: [],
          status: "done",
        }),
        two: node({
          title: "Two",
          parent: "root",
          depends_on: [],
          status: "cancelled",
        }),
      }),
    );
    expect(renderMap(plan)).toContain("- Close: [Product](nodes/root.md)");
  });
});

test("counts open questions only inside their section", () => {
  const body = "## Open questions\n- a\n- b\n\n## Out of scope\n- c\n";
  expect(countOpenQuestions(body)).toBe(2);
});

describe("loadPlan problems", () => {
  const cases: [string, Record<string, string>, string][] = [
    [
      "missing root",
      {
        a: node({ title: "A", parent: "root", depends_on: [], status: "fog" }),
      },
      "root: plan/nodes/root.md is missing or invalid",
    ],
    [
      "old-format fields",
      {
        root: node({
          id: "root",
          summary: "x",
          title: "R",
          parent: null,
          depends_on: [],
          status: "planned",
        }),
      },
      'root: unknown frontmatter field "id"',
    ],
    [
      "invalid status",
      {
        root: node({
          title: "R",
          parent: null,
          depends_on: [],
          status: "planned",
        }),
      },
      "root: status must be one of",
    ],
    [
      "missing parent",
      {
        root: sample.root,
        a: node({ title: "A", parent: "nope", depends_on: [], status: "fog" }),
      },
      'a: parent "nope" does not exist',
    ],
    [
      "missing dependency",
      {
        root: node({
          title: "R",
          parent: null,
          depends_on: ["nope"],
          status: "fog",
        }),
      },
      'root: depends_on "nope" does not exist',
    ],
    [
      "parent cycle",
      {
        root: node({ title: "R", parent: null, depends_on: [], status: "fog" }),
        a: node({ title: "A", parent: "b", depends_on: [], status: "fog" }),
        b: node({ title: "B", parent: "a", depends_on: [], status: "fog" }),
      },
      "a: its parent chain has a cycle",
    ],
    [
      "ready parent with open children",
      {
        root: node({
          title: "R",
          parent: null,
          depends_on: [],
          status: "ready",
        }),
        a: node({ title: "A", parent: "root", depends_on: [], status: "fog" }),
      },
      "root: ready needs every child to be done or cancelled",
    ],
    [
      "decomposed leaf",
      {
        root: node({
          title: "R",
          parent: null,
          depends_on: [],
          status: "decomposed",
        }),
      },
      "root: decomposed needs child nodes",
    ],
    [
      "done parent with open children",
      {
        root: node({
          title: "R",
          parent: null,
          depends_on: [],
          status: "done",
        }),
        a: node({
          title: "A",
          parent: "root",
          depends_on: [],
          status: "exploring",
        }),
      },
      "root: done needs every child to be done or cancelled",
    ],
    [
      "file name",
      {
        root: sample.root,
        Bad_Name: node({
          title: "B",
          parent: "root",
          depends_on: [],
          status: "fog",
        }),
      },
      "Bad_Name: file name must be kebab-case",
    ],
  ];
  for (const [name, nodes, message] of cases) {
    test(name, () => {
      const errors = loadPlan(project(nodes)).errors;
      expect(errors.some((error) => error.startsWith(message))).toBe(true);
    });
  }
});

describe("command line", () => {
  test("writes the map, then reports it is up to date", () => {
    const root = project(sample);
    expect(run(root).out).toContain("Wrote plan/map.md");
    expect(run(root, "--check")).toMatchObject({ code: 0 });
    expect(readFileSync(join(root, "plan", "map.md"), "utf8")).toStartWith(
      "# Plan Map",
    );
  });

  test("--check fails when the map is stale", () => {
    const root = project(sample);
    run(root);
    writeFileSync(
      join(root, "plan", "nodes", "web.md"),
      node({
        title: "Web",
        parent: "root",
        depends_on: [],
        status: "exploring",
      }),
    );
    expect(run(root, "--check")).toMatchObject({ code: 1 });
  });

  test("reports problems without writing a map", () => {
    const root = project({
      root: node({
        title: "R",
        parent: null,
        depends_on: [],
        status: "planned",
      }),
    });
    const result = run(root);
    expect(result.code).toBe(1);
    expect(result.err).toContain("Plan problems:");
    expect(() => readFileSync(join(root, "plan", "map.md"))).toThrow();
  });
});
