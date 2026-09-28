import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
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
  orderSteps,
  renderHtml,
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
        "Generated from `plan/nodes/` by `.agents/skills/dev-framework/scripts/map.ts`. Do not edit. Open `.tmp/plan/map.html` in a browser for the full picture.",
        "",
        "Progress: 0 of 3 leaf nodes done (1 fog, 2 ready); 2 open questions",
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
        "## Order",
        "",
        "Unfinished leaf nodes in dependency order. Nodes in one step do not wait for each other.",
        "",
        "1. [Setup](nodes/setup.md), [Web](nodes/web.md)",
        "2. [Chat](nodes/chat.md)",
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

describe("orderSteps", () => {
  const ids = (root: string) =>
    orderSteps(loadPlan(root)).map((step) => step.map((n) => n.id));

  test("waiting for a parent means waiting for its unfinished leaves", () => {
    const root = project({
      ...sample,
      launch: node({
        title: "Launch",
        parent: "root",
        depends_on: ["apps"],
        status: "fog",
      }),
    });
    expect(ids(root)).toEqual([["setup", "web"], ["chat"], ["launch"]]);
  });

  test("leaves out finished nodes and the waits they end", () => {
    const root = project({
      ...sample,
      setup: node({
        title: "Setup",
        parent: "desktop",
        depends_on: [],
        status: "done",
      }),
    });
    expect(ids(root)).toEqual([["chat", "web"]]);
  });

  test("stops at a dependency cycle", () => {
    const root = project({
      root: sample.root,
      a: node({ title: "A", parent: "root", depends_on: ["b"], status: "fog" }),
      b: node({ title: "B", parent: "root", depends_on: ["a"], status: "fog" }),
    });
    expect(ids(root).flat().sort()).toEqual(["a", "b"]);
  });
});

describe("renderHtml", () => {
  const plan = () =>
    loadPlan(
      project({
        ...sample,
        setup: node(
          {
            title: "Setup <fast>",
            parent: "desktop",
            depends_on: [],
            status: "ready",
          },
          "\n## Completion criteria\n- [x] Runs `bun`\n- [ ] See [the guide](../../knowledge/guide.md)\n",
        ),
      }),
    );

  test("shows progress, the work possible now, the order, and every node", () => {
    const html = renderHtml(plan(), [
      { commit: "abc1234", date: "2026-09-28", subject: "Explore the root" },
    ]);
    expect(html).toContain("0 of 3 leaf nodes done · 1 fog, 2 ready");
    expect(html).toContain("1 of 2 criteria met");
    expect(html).toContain('<body data-start="setup">');
    expect(html).toContain("Step 2");
    for (const id of ["root", "apps", "desktop", "chat", "setup", "web"])
      expect(html).toContain(`data-detail="${id}"`);
    expect(html).toContain("<code>abc1234</code> 2026-09-28 Explore the root");
  });

  test("escapes text and renders checkboxes, code, and link text", () => {
    const html = renderHtml(plan());
    expect(html).toContain("Setup &lt;fast&gt;");
    expect(html).not.toContain("<fast>");
    expect(html).toContain("☑ Runs <code>bun</code>");
    expect(html).toContain("☐ See the guide");
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
  test("writes the map and the HTML view, then reports the map is up to date", () => {
    const root = project(sample);
    expect(run(root).out).toContain(
      "Wrote plan/map.md\nWrote .tmp/plan/map.html",
    );
    expect(
      readFileSync(join(root, ".tmp", "plan", "map.html"), "utf8"),
    ).toStartWith("<!doctype html>");
    expect(run(root, "--check")).toMatchObject({ code: 0 });
    expect(readFileSync(join(root, "plan", "map.md"), "utf8")).toStartWith(
      "# Plan Map",
    );
  });

  test("--check writes nothing", () => {
    const root = project(sample);
    expect(run(root, "--check")).toMatchObject({ code: 1 });
    expect(existsSync(join(root, "plan", "map.md"))).toBe(false);
    expect(existsSync(join(root, ".tmp"))).toBe(false);
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
    expect(existsSync(join(root, ".tmp"))).toBe(false);
  });
});
