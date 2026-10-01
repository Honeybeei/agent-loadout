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
  countOpenTickets,
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
  kind?: string;
  status?: string;
  [extra: string]: unknown;
}

function node(fields: Fields, body = ""): string {
  const yaml = Object.entries(fields)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n");
  return `---\n${yaml}\n---\n\n# ${fields.title ?? "Untitled"}\n\n## Goal\nA goal.\n${body}`;
}

/** The sections every blackbox node needs, with the given Completion criteria. */
const blackbox = (criteria = "") =>
  `\n## Output\nA result.\n\n## Completion criteria\n${criteria}\n## Verification\n- Run it.\n\n## Record\n`;

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

const goal = (
  title: string,
  parent: string | null,
  depends_on: string[] = [],
) => node({ title, parent, depends_on, kind: "goal", status: "open" });

const sample = {
  root: goal("Product", null),
  apps: goal("Apps", "root"),
  desktop: goal("Desktop", "apps"),
  "explore-desktop": node(
    {
      title: "Explore desktop",
      parent: "desktop",
      depends_on: [],
      kind: "explore",
      status: "todo",
    },
    "\n## Tickets\n- [grilling] One?\n- [research] Two?\n",
  ),
  setup: node(
    {
      title: "Setup",
      parent: "desktop",
      depends_on: [],
      kind: "blackbox",
      status: "todo",
    },
    blackbox(),
  ),
  chat: node({
    title: "Chat",
    parent: "desktop",
    depends_on: ["setup"],
    kind: "collaborative",
    status: "todo",
  }),
  web: goal("Web", "root"),
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
        "Progress: 0 of 3 leaves done (3 todo); 1 goal needs planning; 2 open tickets",
        "",
        "```text",
        "root: Product — goal, open",
        "├── apps: Apps — goal, open",
        "│   └── desktop: Desktop — goal, open",
        "│       ├── chat: Chat — collaborative, todo, waits for setup",
        "│       ├── explore-desktop: Explore desktop — explore, todo, 2 open tickets",
        "│       └── setup: Setup — blackbox, todo",
        "└── web: Web — goal, needs planning",
        "```",
        "",
        "## Now possible",
        "",
        "- Plan: [Web](nodes/web.md)",
        "- Explore: [Explore desktop](nodes/explore-desktop.md)",
        "- Dispatch: [Setup](nodes/setup.md)",
        "",
        "## Order",
        "",
        "Unfinished leaves and goals that need planning, in dependency order. Nodes in one step do not wait for each other.",
        "",
        "1. [Explore desktop](nodes/explore-desktop.md), [Setup](nodes/setup.md), [Web](nodes/web.md)",
        "2. [Chat](nodes/chat.md)",
        "",
      ].join("\n"),
    );
  });

  test("lists leaves in progress as running, apart from the work possible now", () => {
    const plan = loadPlan(
      project({
        ...sample,
        setup: node(
          {
            title: "Setup",
            parent: "desktop",
            depends_on: [],
            kind: "blackbox",
            status: "in_progress",
          },
          blackbox(),
        ),
      }),
    );
    const map = renderMap(plan);
    expect(map).toContain(
      "## Running\n\nLeaves being worked. Review a blackbox leaf when its report arrives.\n\n- [Setup](nodes/setup.md) (blackbox)\n\n## Now possible",
    );
    expect(map).not.toContain("Dispatch: [Setup]");
    expect(renderMap(loadPlan(project(sample)))).not.toContain("## Running");
    const html = renderHtml(plan);
    expect(html).toContain("<h2>Running</h2>");
    expect(html).toContain('<body data-start="web">');
  });

  test("lists a goal whose children are finished as closable", () => {
    const plan = loadPlan(
      project({
        root: goal("Product", null),
        one: node({
          title: "One",
          parent: "root",
          depends_on: [],
          kind: "collaborative",
          status: "done",
        }),
        two: node({
          title: "Two",
          parent: "root",
          depends_on: [],
          kind: "explore",
          status: "cancelled",
        }),
      }),
    );
    const map = renderMap(plan);
    expect(map).toContain("root: Product — goal, closable");
    expect(map).toContain("- Close: [Product](nodes/root.md)");
  });

  test("lists collaborative leaves to start, and leaves blocked goals out of planning", () => {
    const map = renderMap(
      loadPlan(
        project({
          ...sample,
          web: goal("Web", "root", ["explore-desktop"]),
          setup: node(
            {
              title: "Setup",
              parent: "desktop",
              depends_on: [],
              kind: "blackbox",
              status: "done",
            },
            blackbox(),
          ),
        }),
      ),
    );
    expect(map).toContain("- Collaborate: [Chat](nodes/chat.md)");
    expect(map).not.toContain("- Plan:");
    expect(map).toContain(
      "└── web: Web — goal, needs planning, waits for explore-desktop",
    );
  });
});

describe("orderSteps", () => {
  const ids = (root: string) =>
    orderSteps(loadPlan(root)).map((step) => step.map((n) => n.id));

  test("waiting for a goal means waiting for its unfinished leaves", () => {
    const root = project({
      ...sample,
      launch: goal("Launch", "root", ["apps"]),
    });
    expect(ids(root)).toEqual([
      ["explore-desktop", "setup", "web"],
      ["chat"],
      ["launch"],
    ]);
  });

  test("leaves out finished nodes and the waits they end", () => {
    const root = project({
      ...sample,
      setup: node(
        {
          title: "Setup",
          parent: "desktop",
          depends_on: [],
          kind: "blackbox",
          status: "done",
        },
        blackbox(),
      ),
    });
    expect(ids(root)).toEqual([["chat", "explore-desktop", "web"]]);
  });

  test("stops at a dependency cycle", () => {
    const leaf = (title: string, dependency: string) =>
      node({
        title,
        parent: "root",
        depends_on: [dependency],
        kind: "collaborative",
        status: "todo",
      });
    const root = project({
      root: sample.root,
      a: leaf("A", "b"),
      b: leaf("B", "a"),
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
            kind: "blackbox",
            status: "todo",
          },
          blackbox(
            "- [x] Runs `bun`\n- [ ] See [the guide](../../knowledge/guide.md)\n",
          ),
        ),
      }),
    );

  test("shows progress, the work possible now, the order, and every node", () => {
    const html = renderHtml(plan(), [
      { commit: "abc1234", date: "2026-09-28", subject: "Plan the root" },
    ]);
    expect(html).toContain(
      "0 of 3 leaves done · 3 todo · 1 goal needs planning · 2 open tickets · 1 of 2 criteria met",
    );
    expect(html).toContain("1 of 2 criteria met");
    expect(html).toContain('<body data-start="web">');
    expect(html).toContain("Step 2");
    for (const id of [
      "root",
      "apps",
      "desktop",
      "chat",
      "explore-desktop",
      "setup",
      "web",
    ])
      expect(html).toContain(`data-detail="${id}"`);
    expect(html).toContain("<code>abc1234</code> 2026-09-28 Plan the root");
  });

  test("escapes text and renders checkboxes, code, and link text", () => {
    const html = renderHtml(plan());
    expect(html).toContain("Setup &lt;fast&gt;");
    expect(html).not.toContain("<fast>");
    expect(html).toContain("☑ Runs <code>bun</code>");
    expect(html).toContain("☐ See the guide");
  });

  test("marks blocked work and gives the order its arrows", () => {
    const html = renderHtml(
      loadPlan(
        project({ ...sample, launch: goal("Launch", "root", ["apps"]) }),
      ),
    );
    expect(html).toContain('class="card todo blocked" data-node="chat"');
    expect(html).toContain('title="Waits for Setup">waits for 1</span>');
    expect(html).toContain(
      'data-node="chat" data-deps="setup" data-waits="setup"',
    );
    expect(html).toContain(
      'data-node="launch" data-deps="apps" data-waits="chat explore-desktop setup"',
    );
    expect(html).toContain('data-node="setup" data-deps="" data-waits=""');
  });

  test("links each node to its parent, dependencies, dependents, and children", () => {
    const html = renderHtml(plan());
    const detail = (id: string) =>
      html.split(`<article data-detail="${id}"`)[1]?.split("</article>")[0] ??
      "";
    expect(detail("setup")).toContain('<dt>Parent</dt><dd><a href="#desktop"');
    expect(detail("setup")).toContain('<dt>Needed by</dt><dd><a href="#chat"');
    expect(detail("setup")).toContain(
      '<span class="status todo">blackbox, todo</span>',
    );
    expect(detail("chat")).toContain('<dt>Depends on</dt><dd><a href="#setup"');
    expect(detail("desktop")).toContain(
      '<dt>Children</dt><dd><a href="#chat" data-go="chat"',
    );
    expect(detail("root")).not.toContain("<dt>Parent</dt>");
  });

  test("splits the progress bar by status and shows a legend", () => {
    const html = renderHtml(plan());
    expect(html).toContain(
      '<div class="bar"><span class="todo" style="width: 100%" title="3 todo"></span></div>',
    );
    for (const status of ["open", "todo", "done", "cancelled"])
      expect(html).toContain(`<li class="${status} muted">`);
  });
});

test("counts open tickets only inside their section", () => {
  const body = "## Tickets\n- a\n- b\n\n## Out of scope\n- c\n";
  expect(countOpenTickets(body)).toBe(2);
});

describe("loadPlan problems", () => {
  const leaf = (
    title: string,
    parent: string,
    kind: string,
    status: string,
    body = "",
  ) => node({ title, parent, depends_on: [], kind, status }, body);
  const cases: [string, Record<string, string>, string][] = [
    [
      "missing root",
      { a: leaf("A", "root", "explore", "todo") },
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
          kind: "goal",
          status: "open",
        }),
      },
      'root: unknown frontmatter field "id"',
    ],
    [
      "a v1 node without a kind",
      {
        root: node({
          title: "R",
          parent: null,
          depends_on: [],
          status: "decomposed",
        }),
      },
      "root: kind must be one of goal, explore, collaborative, blackbox",
    ],
    [
      "a status the kind does not allow",
      {
        root: node({
          title: "R",
          parent: null,
          depends_on: [],
          kind: "goal",
          status: "todo",
        }),
      },
      "root: status must be one of open, done, cancelled for kind goal",
    ],
    [
      "a root that is not a goal",
      {
        root: node({
          title: "R",
          parent: null,
          depends_on: [],
          kind: "explore",
          status: "todo",
        }),
      },
      "root: kind must be goal",
    ],
    [
      "missing parent",
      { root: sample.root, a: leaf("A", "nope", "explore", "todo") },
      'a: parent "nope" does not exist',
    ],
    [
      "a leaf with children",
      {
        root: sample.root,
        a: leaf("A", "root", "explore", "todo"),
        b: leaf("B", "a", "explore", "todo"),
      },
      'b: parent "a" is a leaf (explore); only goals have children',
    ],
    [
      "missing dependency",
      { root: goal("R", null, ["nope"]) },
      'root: depends_on "nope" does not exist',
    ],
    [
      "parent cycle",
      { root: sample.root, a: goal("A", "b"), b: goal("B", "a") },
      "a: its parent chain has a cycle",
    ],
    [
      "done goal with open children",
      {
        root: node({
          title: "R",
          parent: null,
          depends_on: [],
          kind: "goal",
          status: "done",
        }),
        a: leaf("A", "root", "explore", "todo"),
      },
      "root: done needs every child to be done or cancelled",
    ],
    [
      "a blackbox node without its required sections",
      { root: sample.root, a: leaf("A", "root", "blackbox", "todo") },
      'a: kind blackbox needs a "## Output" section',
    ],
    [
      "a done explore leaf with tickets left",
      {
        root: sample.root,
        a: leaf(
          "A",
          "root",
          "explore",
          "done",
          "\n## Tickets\n- [grilling] Q?\n",
        ),
      },
      "a: a done explore leaf has no Tickets left",
    ],
    [
      "two collaborative leaves in progress",
      {
        root: sample.root,
        a: leaf("A", "root", "collaborative", "in_progress"),
        b: leaf("B", "root", "collaborative", "in_progress"),
      },
      "a, b: at most one collaborative leaf may be in_progress",
    ],
    [
      "file name",
      { root: sample.root, Bad_Name: leaf("B", "root", "explore", "todo") },
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
        kind: "goal",
        status: "cancelled",
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
