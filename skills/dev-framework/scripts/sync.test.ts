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
import { END, replaceSection, START } from "./sync.ts";

const SYNC = join(import.meta.dir, "sync.ts");
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
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dev-sync-")));
  roots.push(root);
  git(root, "init", "-q");
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

function sync(root: string, ...args: string[]) {
  const result = Bun.spawnSync(["bun", SYNC, root, ...args]);
  return {
    code: result.exitCode,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
}

const read = (root: string, path: string) =>
  readFileSync(join(root, path), "utf8");

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

describe("sync", () => {
  test("adds all managed material and keeps project content", () => {
    const root = repository({ "README.md": "# Project\n\nOwn words.\n" });
    const result = sync(root);
    expect(result.code).toBe(0);
    expect(read(root, "knowledge/dev-framework.md")).toContain(
      "managed_by: dev-framework",
    );
    expect(
      existsSync(join(root, "knowledge/dev-framework/plan-documentation.md")),
    ).toBe(true);
    expect(existsSync(join(root, ".agents/skills/dev-explore/SKILL.md"))).toBe(
      true,
    );
    expect(
      existsSync(join(root, ".agents/skills/dev-framework/scripts/map.ts")),
    ).toBe(true);
    expect(read(root, ".agents/skills/dev-framework/managed.txt")).toContain(
      ".agents/skills/grilling\n",
    );
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
    sync(root);
    commit(root);
    expect(sync(root).out).toContain("up to date");
    expect(sync(root, "--check").code).toBe(0);
  });

  test("--check reports changes without writing", () => {
    const root = repository();
    const result = sync(root, "--check");
    expect(result.code).toBe(1);
    expect(result.out).toContain("would create knowledge/dev-framework.md");
    expect(existsSync(join(root, "knowledge"))).toBe(false);
  });

  test("replaces changed managed material once it is committed", () => {
    const root = repository();
    sync(root);
    write(root, { ".agents/skills/grilling/SKILL.md": "edited\n" });
    expect(sync(root).err).toContain("commit or stash these changes first");
    commit(root);
    expect(sync(root).out).toContain("replace .agents/skills/grilling");
    expect(read(root, ".agents/skills/grilling/SKILL.md")).not.toBe("edited\n");
  });

  test("warns before replacing a directory no earlier sync wrote", () => {
    const root = repository({ ".agents/skills/research/SKILL.md": "mine\n" });
    expect(sync(root, "--check").out).toContain(
      "would replace .agents/skills/research: no earlier sync wrote it",
    );
    sync(root);
    commit(root);
    write(root, { ".agents/skills/research/SKILL.md": "edited\n" });
    commit(root);
    expect(sync(root, "--check").out).toContain(
      "would replace .agents/skills/research\n",
    );
  });

  test("removes material that the Framework no longer manages", () => {
    const root = repository();
    sync(root);
    write(root, { ".agents/skills/old-skill/SKILL.md": "old\n" });
    const manifest = ".agents/skills/dev-framework/managed.txt";
    write(root, {
      [manifest]: `${read(root, manifest)}.agents/skills/old-skill\n`,
    });
    commit(root);
    expect(sync(root).out).toContain("remove .agents/skills/old-skill");
    expect(existsSync(join(root, ".agents/skills/old-skill"))).toBe(false);
  });

  const refusals: [string, (root: string) => void, string][] = [
    [
      "a manifest path the Framework never manages",
      (root) =>
        write(root, {
          ".agents/skills/dev-framework/managed.txt": "../outside\n",
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
      const result = sync(root);
      expect(result.code).toBe(1);
      expect(result.err).toContain(message);
    });
  }

  test("refuses a directory below the Git top level", () => {
    const root = repository({ "sub/README.md": "x\n" });
    expect(sync(join(root, "sub")).err).toContain(
      "top level of a Git working tree",
    );
  });
});
