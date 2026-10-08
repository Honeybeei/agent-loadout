import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { guards, type Option } from "./main.ts";
import { END, RECORD, replaceSection, START } from "./sync.ts";

const MAIN = join(import.meta.dir, "main.ts");
const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function git(root: string, ...args: string[]) {
  const result = Bun.spawnSync(["git", "-C", root, ...args], {
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", HOME: root },
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
}

function repository(files: Record<string, string> = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dev-apply-")));
  roots.push(root);
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.name", "Test");
  git(root, "config", "user.email", "test@example.com");
  write(root, { ".gitignore": "/.tmp/\n", ...files });
  commit(root);
  return root;
}

function write(root: string, files: Record<string, string>) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

function commit(root: string) {
  git(root, "add", "-A");
  git(root, "commit", "-q", "--allow-empty", "-m", "test");
}

// This checkout may be on a work branch; the source guard has its own tests.
function apply(cwd: string, ...args: string[]) {
  const result = Bun.spawnSync(
    ["bun", MAIN, "apply", "--allow-unmerged", ...args],
    { cwd },
  );
  return {
    code: result.exitCode,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
}

const adopt = (root: string, ...args: string[]) =>
  apply(root, "--adopt", ...args);

const read = (root: string, path: string) =>
  readFileSync(join(root, path), "utf8");

const node = (id: string, kind: string, status: string) =>
  `---\ntitle: ${id}\nparent: root\ndepends_on: []\nkind: ${kind}\nstatus: ${status}\n---\n\n# ${id}\n\n## Goal\nA goal.\n\n## Record\n`;

/** A Framework project: adopted, with a root goal, committed on main. */
function project(): string {
  const root = repository({
    "dev.yaml": "workspaces:\n  - .\n",
    "plan/README.md": "# Plan\n",
    "plan/nodes/root.md":
      "---\ntitle: Root\nparent: null\ndepends_on: []\nkind: goal\nstatus: open\n---\n\n# Root\n\n## Goal\nA goal.\n",
  });
  adopt(root);
  commit(root);
  return root;
}

describe("replaceSection", () => {
  const section = `${START}\nnew\n${END}\n`;

  test("appends the section after existing content", () => {
    expect(replaceSection("# Title\n", section)).toBe(
      `# Title\n\n${START}\nnew\n${END}\n`,
    );
  });

  test("replaces only the existing section", () => {
    const current = `before\n${START}\nold\n${END}\nafter\n`;
    expect(replaceSection(current, section)).toBe(
      `before\n${START}\nnew\n${END}\nafter\n`,
    );
  });

  test("refuses unpaired markers", () => {
    expect(() => replaceSection(`${START}\nno end\n`, section)).toThrow();
  });
});

describe("apply", () => {
  test("adopting adds all managed material and keeps project content", () => {
    const root = repository({ "README.md": "# Project\n\nOwn words.\n" });
    const result = adopt(root);
    expect(result.code).toBe(0);
    expect(result.out).toContain("finish adopting the Framework");
    expect(read(root, "knowledge/dev-framework.md")).toContain(
      "managed_by: dev-framework",
    );
    for (const path of [
      "knowledge/dev-framework/plan-documentation.md",
      ".agents/skills/dev-explore/SKILL.md",
      ".agents/skills/dev-doctor/SKILL.md",
      ".agents/skills/handoff/scripts/ensure-ignored.ts",
      ".agents/skills/writing-for-agents/SKILL.md",
      ".agents/skills/dev-framework-feedback/SKILL.md",
      ".agents/skills/dev-framework/scripts/map.ts",
    ])
      expect(existsSync(join(root, path))).toBe(true);
    const record = JSON.parse(read(root, RECORD));
    expect(record.managed).toContain(".agents/skills/grilling");
    expect(record.source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(readlinkSync(join(root, ".claude/skills"))).toBe(
      "../.agents/skills",
    );
    expect(read(root, "README.md")).toStartWith(
      "# Project\n\nOwn words.\n\n<!-- dev-framework:start -->",
    );
    expect(read(root, "AGENTS.md")).toStartWith(START);
  });

  test("is idempotent, and --check agrees", () => {
    const root = repository();
    adopt(root);
    commit(root);
    expect(adopt(root).out).toContain("up to date");
    expect(adopt(root, "--check").code).toBe(0);
  });

  test("--check reports changes without writing", () => {
    const root = repository();
    const result = adopt(root, "--check");
    expect(result.code).toBe(1);
    expect(result.out).toContain("would create knowledge/dev-framework.md");
    expect(result.out).toContain(`would create ${RECORD}`);
    expect(existsSync(join(root, "knowledge"))).toBe(false);
  });

  test("replaces changed managed material once it is committed", () => {
    const root = repository();
    adopt(root);
    commit(root);
    write(root, { ".agents/skills/grilling/SKILL.md": "edited\n" });
    expect(adopt(root).err).toContain("commit or stash these changes first");
    commit(root);
    const result = adopt(root);
    expect(result.out).toContain("replace .agents/skills/grilling");
    expect(result.out).toContain(`replace ${RECORD}`);
    expect(read(root, ".agents/skills/grilling/SKILL.md")).not.toBe("edited\n");
  });

  test("refuses to overwrite an uncommitted record", () => {
    const root = repository();
    adopt(root);
    commit(root);
    write(root, {
      ".agents/skills/grilling/SKILL.md": "edited\n",
      [RECORD]: `${read(root, RECORD)}\n`,
    });
    git(root, "add", ".agents/skills/grilling");
    git(root, "commit", "-q", "-m", "edit");
    expect(adopt(root).err).toContain(RECORD);
  });

  test("warns before replacing a directory no earlier apply wrote", () => {
    const root = repository({ ".agents/skills/research/SKILL.md": "mine\n" });
    expect(adopt(root, "--check").out).toContain(
      "would replace .agents/skills/research: no earlier apply wrote it",
    );
    adopt(root);
    commit(root);
    write(root, { ".agents/skills/research/SKILL.md": "edited\n" });
    commit(root);
    expect(adopt(root, "--check").out).toContain(
      "would replace .agents/skills/research\n",
    );
  });

  test("removes material that the Framework no longer manages", () => {
    const root = repository();
    adopt(root);
    write(root, { ".agents/skills/old-skill/SKILL.md": "old\n" });
    const record = JSON.parse(read(root, RECORD));
    record.managed.push(".agents/skills/old-skill");
    write(root, { [RECORD]: JSON.stringify(record) });
    commit(root);
    expect(adopt(root).out).toContain("remove .agents/skills/old-skill");
    expect(existsSync(join(root, ".agents/skills/old-skill"))).toBe(false);
  });

  test("reads the managed paths an earlier Framework listed in managed.txt", () => {
    const root = repository({
      ".agents/skills/old-skill/SKILL.md": "old\n",
      ".agents/skills/dev-framework/managed.txt":
        ".agents/skills/dev-framework\n.agents/skills/old-skill\n",
    });
    const result = adopt(root);
    expect(result.out).toContain("remove .agents/skills/old-skill");
    expect(result.out).not.toContain("no earlier apply wrote it");
    expect(
      existsSync(join(root, ".agents/skills/dev-framework/managed.txt")),
    ).toBe(false);
  });

  test("a Framework project regenerates its map", () => {
    const root = project();
    write(root, { ".agents/skills/grilling/SKILL.md": "edited\n" });
    commit(root);
    const result = apply(root);
    expect(result.code).toBe(0);
    expect(result.out).toContain("plan/map.md");
    expect(result.out).toContain("migrate and check the project");
  });

  const refusals: [string, (root: string) => void, string][] = [
    [
      "a record path the Framework never manages",
      (root) =>
        write(root, {
          [RECORD]: JSON.stringify({ managed: ["../outside"] }),
        }),
      "lists a path the Framework never manages",
    ],
    [
      "an unmanaged file in the way",
      (root) => write(root, { "knowledge/dev-framework.md": "# Mine\n" }),
      "knowledge/dev-framework.md exists but is not Framework-managed",
    ],
    [
      "a real .claude/skills directory",
      (root) => write(root, { ".claude/skills/mine/SKILL.md": "x\n" }),
      ".claude/skills must be a link",
    ],
    [
      "malformed section markers",
      (root) => write(root, { "AGENTS.md": `${START}\nno end\n` }),
      "AGENTS.md: expected exactly one start and one end marker",
    ],
  ];
  for (const [name, setup, message] of refusals) {
    test(`refuses ${name}`, () => {
      const root = repository();
      setup(root);
      commit(root);
      const result = adopt(root);
      expect(result.code).toBe(1);
      expect(result.err).toContain(message);
    });
  }

  test("refuses a directory below the Git top level", () => {
    const root = repository({ "sub/README.md": "x\n" });
    expect(adopt(join(root, "sub")).err).toContain(
      "top level of a Git working tree",
    );
  });
});

describe("guards", () => {
  const clean = { commit: "0".repeat(40), branch: "main", dirty: false };
  const check = (root: string, options: Option[] = [], source = clean) =>
    guards(root, new Set(options), source).join("\n");

  test("a clean main source and a Framework project on main pass", () => {
    expect(check(project())).toBe("");
  });

  test("a source that is not a clean main needs --allow-unmerged", () => {
    const root = project();
    const work = { ...clean, branch: "work/x", dirty: true };
    expect(check(root, [], work)).toContain(
      "dev-framework is on work/x with uncommitted changes, not a clean main",
    );
    expect(check(root, ["--allow-unmerged"], work)).toBe("");
  });

  test("a repository without dev.yaml needs --adopt", () => {
    const root = repository();
    expect(check(root)).toContain("pass --adopt");
    expect(check(root, ["--adopt"])).toBe("");
  });

  test("a Framework project must be on main", () => {
    const root = project();
    git(root, "switch", "-q", "-c", "work/x");
    expect(check(root)).toContain("the project is on work/x; switch to main");
  });

  test("refuses a linked worktree", () => {
    const root = project();
    const linked = `${root}-linked`;
    roots.push(linked);
    git(root, "worktree", "add", "-q", "-b", "work/x", linked);
    expect(check(realpathSync(linked))).toContain(
      `run dev-framework apply in the main checkout, ${root}`,
    );
  });

  test("refuses uncommitted changes in plan/", () => {
    const root = project();
    write(root, { "plan/nodes/leaf.md": node("leaf", "explore", "todo") });
    expect(check(root)).toContain("commit or set aside the changes in plan/");
  });

  test("a running blackbox or collaborative leaf needs --allow-running", () => {
    const root = project();
    write(root, {
      "plan/nodes/built.md": node("built", "blackbox", "in_progress"),
      "plan/nodes/found.md": node("found", "explore", "in_progress"),
    });
    commit(root);
    const found = check(root);
    expect(found).toContain(
      "plan/nodes/built.md is an in_progress blackbox leaf",
    );
    expect(found).not.toContain("found.md");
    expect(check(root, ["--allow-running"])).toBe("");
  });
});

describe("command line", () => {
  const run = (...args: string[]) => Bun.spawnSync(["bun", MAIN, ...args]);

  test("help prints the usage", () => {
    const result = run("--help");
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("Usage: dev-framework apply");
  });

  test("rejects an unknown command or option", () => {
    expect(run().exitCode).toBe(2);
    expect(run("sync").exitCode).toBe(2);
    expect(run("apply", "--force").exitCode).toBe(2);
  });
});
