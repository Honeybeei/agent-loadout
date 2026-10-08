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
  CATEGORIES,
  countOpenTickets,
  knowledgeIndex,
  loadPlan,
  orderSteps,
  renderHtml,
  renderMap,
  temporaryPaths,
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
  // A Record as finishing leaves it, unless the body has one; an open goal needs none.
  const finished = { goal: "Closed", explore: "Finished" }[fields.kind ?? ""];
  const line =
    fields.status === "done"
      ? `- ${finished ?? "Implemented"}: done.\n`
      : fields.status === "cancelled"
        ? "- Cancelled: dropped.\n"
        : "";
  const record =
    body.includes("## Record") || (fields.kind === "goal" && line === "")
      ? ""
      : `\n## Record\n${line}`;
  return `---\n${yaml}\n---\n\n# ${fields.title ?? "Untitled"}\n\n## Goal\nA goal.\n${body}${record}`;
}

/** The sections every blackbox node needs, with the given Completion criteria. */
const blackbox = (criteria = "") =>
  `\n## Output\nA result.\n\n## Completion criteria\n${criteria}\n## Verification\n- Run it.\n`;

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
      "a title heading that differs from the title",
      {
        root: sample.root,
        a: leaf("A", "root", "explore", "todo").replace("# A", "# Other"),
      },
      'a: the title heading must be "# A"',
    ],
    [
      "a section before Goal",
      {
        root: sample.root,
        a: leaf("A", "root", "explore", "todo").replace(
          "## Goal",
          "## Notes\n- x\n\n## Goal",
        ),
      },
      'a: the first section must be "## Goal"',
    ],
    [
      "a section after Record",
      {
        root: sample.root,
        a: leaf(
          "A",
          "root",
          "collaborative",
          "todo",
          "\n## Record\n\n## Notes\n",
        ),
      },
      'a: "## Record" must be the last section',
    ],
    [
      "a section the kind's template lacks",
      {
        root: sample.root,
        a: leaf("A", "root", "explore", "todo", "\n## Questions\n- Q?\n"),
      },
      'a: kind explore has no "## Questions" section',
    ],
    [
      "sections out of template order",
      {
        root: sample.root,
        a: leaf(
          "A",
          "root",
          "explore",
          "todo",
          "\n## Out of scope\n- x\n\n## Tickets\n- [task] y\n",
        ),
      },
      "a: put the sections in the order of the template",
    ],
    [
      "an untagged ticket",
      {
        root: sample.root,
        a: leaf(
          "A",
          "root",
          "explore",
          "todo",
          "\n## Tickets\n- Which stack?\n",
        ),
      },
      'a: tag the ticket "Which stack?"',
    ],
    [
      "a done leaf without its finishing line",
      {
        root: sample.root,
        a: leaf("A", "root", "explore", "done", "\n## Record\n- Planned: x\n"),
      },
      'a: a done explore needs a "Finished:" line in Record',
    ],
    [
      "a cancelled node without a reason",
      {
        root: sample.root,
        a: leaf("A", "root", "explore", "cancelled", "\n## Record\n"),
      },
      "a: a cancelled node states its reason in Record",
    ],
    [
      "a done blackbox leaf with an unticked criterion",
      {
        root: sample.root,
        a: leaf("A", "root", "blackbox", "done", blackbox("- [ ] It works.\n")),
      },
      "a: a done blackbox has an unticked Completion criterion",
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
    [
      "a finished node that names a .tmp/ path",
      {
        root: sample.root,
        a: leaf(
          "A",
          "root",
          "explore",
          "done",
          "\n## Decisions so far\n- Stack → Astro; detail in `.tmp/research/stack.md`.\n",
        ),
      },
      "a: names .tmp/research/stack.md in .tmp/, which may be deleted",
    ],
  ];
  for (const [name, nodes, message] of cases) {
    test(name, () => {
      const errors = loadPlan(project(nodes)).errors;
      expect(errors.some((error) => error.startsWith(message))).toBe(true);
    });
  }

  test("a collaborative body is free, a goal may hold Goal alone, and headings in code are not sections", () => {
    const errors = loadPlan(
      project({
        root: sample.root,
        a: leaf("A", "root", "collaborative", "todo", "\n## Sketch\n- x\n"),
        b: leaf(
          "B",
          "root",
          "explore",
          "todo",
          "\n## Notes\n```md\n## Example\n```\n",
        ),
        c: goal("C", "root"),
      }),
    ).errors;
    expect(errors).toEqual([]);
  });

  test("a running explore or collaborative leaf may name .tmp/ paths; a dispatched blackbox leaf may not", () => {
    const notes = "\n## Notes\n- Raw notes: `.tmp/research/stack.md`\n";
    const errors = loadPlan(
      project({
        root: sample.root,
        a: leaf("A", "root", "explore", "in_progress", notes),
        b: leaf("B", "root", "collaborative", "in_progress", notes),
        c: leaf(
          "C",
          "root",
          "blackbox",
          "in_progress",
          blackbox().replace(
            "A result.",
            "Raw notes: `.tmp/research/stack.md`",
          ),
        ),
      }),
    ).errors;
    expect(errors).toEqual([
      "c: names .tmp/research/stack.md in .tmp/, which may be deleted; move what later work needs into the node or Knowledge, and remove the path",
    ]);
  });

  test("unfinished work cannot depend on a cancelled node", () => {
    const waits = (title: string, status: string) =>
      node({
        title,
        parent: "root",
        depends_on: ["dropped"],
        kind: "explore",
        status,
      });
    const errors = loadPlan(
      project({
        root: goal("Product", null),
        dropped: leaf("Dropped", "root", "explore", "cancelled"),
        waiting: waits("Waiting", "todo"),
        finished: waits("Finished", "done"),
      }),
    ).errors;
    expect(errors).toEqual([
      'waiting: depends_on "dropped", which is cancelled; remove it, or depend on the node that holds that work now',
    ]);
  });

  test("a handed-off line in a goal or a done leaf links its receiver or says not planned", () => {
    const root = project({
      root: goal("Product", null).replace(
        "## Goal\nA goal.\n",
        "## Goal\nA goal.\n\n## Out of scope\n- Mobile apps: not planned, desktop only.\n- Settings: [Settings](settings.md) builds them.\n- Signing: someone builds it.\n- Login: [Login](login.md) was dropped.\n",
      ),
      settings: leaf("Settings", "root", "collaborative", "todo"),
      login: leaf("Login", "root", "collaborative", "cancelled"),
      a: leaf(
        "A",
        "root",
        "explore",
        "done",
        "\n## For the Plan\n- Pricing: the [glossary](../../knowledge/glossary.md) holds it.\n- Onboarding: the features that need it.\n",
      ),
      b: leaf(
        "B",
        "root",
        "explore",
        "todo",
        "\n## Out of scope\n- Theme switching.\n",
      ),
    });
    mkdirSync(join(root, "knowledge"));
    writeFileSync(join(root, "knowledge", "glossary.md"), "# Glossary\n");
    const rule =
      "names no receiver; link the node that holds it, not a cancelled one, or the Knowledge document, or say `not planned`, as Recording decisions in knowledge/dev-framework/plan-documentation.md says";
    expect(loadPlan(root).errors).toEqual([
      `a: the For the Plan line "Onboarding: the features that need it." ${rule}`,
      `root: the Out of scope line "Signing: someone builds it." ${rule}`,
      `root: the Out of scope line "Login: [Login](login.md) was dropped." ${rule}`,
    ]);
  });

  test("every edit to a Goal in Git needs a Goal changed line", () => {
    const root = project({
      root: goal("Product", null),
      a: leaf("A", "root", "explore", "todo"),
    });
    const git = (...args: string[]) =>
      Bun.spawnSync(["git", "-C", root, ...args], {
        env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: root },
      });
    git("init", "-q", "-b", "main");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.com");
    git("add", "-A");
    git("commit", "-q", "-m", "Plan");
    const path = join(root, "plan", "nodes", "a.md");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace("A goal.", "A wider goal."),
    );
    expect(loadPlan(root).errors).toEqual([
      'a: its Goal has had 2 versions in Git, but Record has 0 "Goal changed:" lines; add one for each edit, quoting the Goal before it, as Node frame in knowledge/dev-framework/plan-documentation.md says. Earlier Goals, oldest first: "A goal."',
    ]);
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace(
        "## Record\n",
        "## Record\n- Goal changed: A goal., the scope grew.\n",
      ),
    );
    git("commit", "-q", "-am", "Widen");
    // Reflowing a Goal is not an edit.
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace("A wider goal.", "A\n  wider goal."),
    );
    expect(loadPlan(root).errors).toEqual([]);
  });

  test("a done explore leaf dates each decision", () => {
    const errors = loadPlan(
      project({
        root: goal("Product", null),
        a: leaf(
          "A",
          "root",
          "explore",
          "done",
          "\n## Decisions so far\n- Which stack → Astro, 2026-10-01, over Next.js\n- Where it runs → Cloudflare\n",
        ),
      }),
    ).errors;
    expect(errors).toEqual([
      'a: the decision "Where it runs → Cloudflare" has no date; add the date the user approved it, as Recording decisions in knowledge/dev-framework/plan-documentation.md says',
    ]);
  });
});

describe("temporaryPaths", () => {
  test("finds paths into .tmp/ in prose, code spans, and links", () => {
    const text = [
      "Detail in `.tmp/research/web.md`.",
      "The wireframe is in .tmp/prototypes/first-run/, variant A.",
      "See [notes](../../.tmp/notes.md) and [root](/.tmp/drafts/a.md).",
      "Again: `.tmp/research/web.md`",
    ].join("\n");
    expect(temporaryPaths(text)).toEqual([
      ".tmp/research/web.md",
      ".tmp/prototypes/first-run/",
      "../../.tmp/notes.md",
      "/.tmp/drafts/a.md",
    ]);
  });

  test("skips fenced code, the directory itself, other .tmp directories, and the map view", () => {
    const text = [
      "```bash",
      "bun run shots --out .tmp/shots/",
      "```",
      "├── .tmp/             Temporary material",
      "The `.tmp/` directory is ignored.",
      "The app caches in `apps/web/.tmp/cache`, `~/.tmp/x`, and <data>/.tmp/y.",
      "Open `.tmp/plan/map.html` for the full picture.",
      "Nothing lives only in .tmp/.",
    ].join("\n");
    expect(temporaryPaths(text)).toEqual([]);
  });
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

describe("knowledgeIndex", () => {
  const doc = (title: string, readWhen: string, topics: string[], more = "") =>
    `---\ncanonical_for:\n${topics.map((t) => `  - ${t}\n`).join("")}read_when: ${readWhen}\n${more}---\n\n# ${title}\n`;
  const knowledge = (root: string, files: Record<string, string>) => {
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(join(root, "knowledge", path, ".."), { recursive: true });
      writeFileSync(join(root, "knowledge", path), text);
    }
  };

  test("lists each category's documents with read_when and canonical_for, subdocuments indented", () => {
    const root = project({ root: goal("Product", null) });
    knowledge(root, {
      "glossary.md": doc("Glossary", "before naming things", ["Terms"]),
      "dev-framework.md": "# Dev Framework rules\n",
      "architecture/persistence.md": doc(
        "Persistence",
        "before changing storage.",
        ["Persistence", "Backups policy"],
        "subdocs:\n  - ./persistence/backups.md\n",
      ),
      "architecture/persistence/backups.md": doc(
        "Backups",
        "before changing backups",
        ["Backups"],
      ),
      "product/chat.md": doc("Chat", "when adding chat text", ["Chat"]),
    });
    expect(knowledgeIndex(root)).toEqual({
      errors: [],
      text: [
        "# Knowledge",
        "",
        "The project's Knowledge by category, generated by the map script from each document's `read_when` and `canonical_for`; never edit it by hand. [Knowledge documentation](dev-framework/knowledge-documentation.md#categories) defines the categories.",
        "",
        "- [Glossary](glossary.md): read before naming things. Owns: Terms.",
        "- [Dev Framework rules](dev-framework.md): read before working, as `AGENTS.md` says. The Framework manages them.",
        "",
        "## Product",
        "",
        "What it must do, and why: purpose, behavior, API contracts.",
        "",
        "- [Chat](product/chat.md): read when adding chat text. Owns: Chat.",
        "",
        "## Architecture",
        "",
        "How it is structured: components, boundaries, state, technology.",
        "",
        "- [Persistence](architecture/persistence.md): read before changing storage. Owns: Persistence; Backups policy.",
        "  - [Backups](architecture/persistence/backups.md): read before changing backups. Owns: Backups.",
        "",
      ].join("\n"),
    });
  });

  test("reports documents outside categories, undeclared categories, a README in a category, and a missing read_when", () => {
    const root = project({ root: goal("Product", null) });
    writeFileSync(
      join(root, "dev.yaml"),
      "workspaces:\n  - .\nknowledge_categories:\n  operations: How it runs in production\n",
    );
    knowledge(root, {
      "mlp-definition.md": doc("MLP", "before x", ["MLP"]),
      "notes/a.md": doc("A", "before a", ["A"]),
      "operations/runbook.md": doc("Runbook", "before deploying", ["Runbook"]),
      "product/README.md": "# Product\n",
      "product/chat.md": "---\ncanonical_for:\n  - Chat\n---\n\n# Chat\n",
    });
    expect(knowledgeIndex(root).errors.map((e) => e.split(";")[0])).toEqual([
      "knowledge/mlp-definition.md: move it, with any subdocuments, into the category whose question it answers, as knowledge/<category>/mlp-definition.md, and update its incoming links, as Categories in knowledge/dev-framework/knowledge-documentation.md says",
      "knowledge/notes/ is not a category",
      "knowledge/product/README.md: a category holds only documents, and knowledge/README.md is the index",
      'knowledge/product/chat.md: frontmatter needs read_when, the tasks to read it before, such as "before changing persistence behavior"',
    ]);
  });

  test("the categories match the table in Knowledge documentation", () => {
    const rules = readFileSync(
      join(
        import.meta.dir,
        "../project/knowledge/dev-framework/knowledge-documentation.md",
      ),
      "utf8",
    );
    const table = Object.fromEntries(
      [...rules.matchAll(/^\| `([a-z-]+)\/` \| (.+) \|$/gm)].map((m) => [
        m[1],
        m[2],
      ]),
    );
    expect(table).toEqual(CATEGORIES);
  });

  test("the command line writes the index beside the map, and --check reports it stale", () => {
    const root = project(sample);
    knowledge(root, {
      "product/chat.md": doc("Chat", "before chat", ["Chat"]),
    });
    expect(run(root).out).toContain("Wrote knowledge/README.md");
    expect(run(root, "--check")).toMatchObject({ code: 0 });
    knowledge(root, {
      "product/files.md": doc("Files", "before files", ["Files"]),
    });
    expect(run(root, "--check")).toMatchObject({ code: 1 });
  });
});
