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
import { dirname, join } from "node:path";
import { END, findSection, replaceSection, START } from "./apply.ts";

const APPLY = join(import.meta.dir, "apply.ts");
const homes: string[] = [];

afterEach(() => {
  for (const home of homes.splice(0))
    rmSync(home, { recursive: true, force: true });
});

function home(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "agent-loadout-home-"));
  homes.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

function apply(root: string, ...args: string[]) {
  const result = Bun.spawnSync(["bun", APPLY, ...args], {
    env: { ...process.env, AGENT_LOADOUT_HOME: root },
  });
  return { code: result.exitCode, out: result.stdout.toString() };
}

const read = (root: string, path: string) =>
  readFileSync(join(root, path), "utf8");

describe("prompt section", () => {
  const block = `${START}\nnew\n${END}`;

  test("appends after existing text and replaces only itself later", () => {
    const first = replaceSection("# Mine\n", block);
    expect(first).toBe(`# Mine\n\n${block}\n`);
    expect(replaceSection(first.replace("new", "old"), block)).toBe(first);
  });

  test("refuses unpaired markers", () => {
    expect(() => findSection(`${START}\n`)).toThrow();
  });
});

describe("apply", () => {
  test("--check lists everything without writing", () => {
    const root = home();
    const result = apply(root, "claude-code", "--check");
    expect(result.code).toBe(1);
    expect(result.out).toContain("would add skill dev-doctor");
    expect(existsSync(join(root, ".claude"))).toBe(false);
  });

  test("installs skills and the prompt section, then reports no changes", () => {
    const root = home({ ".claude/CLAUDE.md": "" });
    expect(apply(root, "claude-code").code).toBe(0);
    expect(existsSync(join(root, ".claude/skills/dev-doctor/SKILL.md"))).toBe(
      true,
    );
    expect(
      existsSync(
        join(root, ".claude/skills/handoff/scripts/ensure-ignored.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(root, ".claude/skills/handoff/scripts/ensure-ignored.test.ts"),
      ),
    ).toBe(false);
    const prompt = read(root, ".claude/CLAUDE.md");
    expect(prompt).toStartWith(START);
    expect(prompt).toContain("## Communication");
    expect(
      JSON.parse(read(root, ".claude/skills/.agent-loadout.json")).skills,
    ).toHaveProperty("dev-framework");
    const again = apply(root, "claude-code", "--check");
    expect(again.code).toBe(0);
    expect(again.out).not.toContain("would");
  });

  test("keeps text outside the prompt section", () => {
    const root = home({ ".pi/agent/AGENTS.md": "# Old prompt\n" });
    apply(root, "pi");
    expect(read(root, ".pi/agent/AGENTS.md")).toStartWith(
      `# Old prompt\n\n${START}`,
    );
  });

  test("refuses to overwrite edits made after the last apply, unless forced", () => {
    const root = home();
    apply(root, "claude-code");
    writeFileSync(join(root, ".claude/skills/handoff/SKILL.md"), "edited\n");
    const refused = apply(root, "claude-code");
    expect(refused.code).toBe(1);
    expect(refused.out).toContain("was edited after the last apply");
    expect(apply(root, "claude-code", "--force").code).toBe(0);
    expect(read(root, ".claude/skills/handoff/SKILL.md")).not.toBe("edited\n");
  });

  test("refuses an edited prompt section, unless forced", () => {
    const root = home();
    apply(root, "claude-code");
    const path = join(root, ".claude/CLAUDE.md");
    writeFileSync(
      path,
      readFileSync(path, "utf8").replace("## Communication", "## Talk"),
    );
    expect(apply(root, "claude-code").out).toContain("the prompt section in");
    expect(apply(root, "claude-code", "--force").code).toBe(0);
  });

  test("removes skills it applied that the repository no longer has", () => {
    const root = home();
    apply(root, "claude-code");
    const manifestPath = join(root, ".claude/skills/.agent-loadout.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    manifest.skills["old-skill"] = { "SKILL.md": "x" };
    writeFileSync(manifestPath, JSON.stringify(manifest));
    mkdirSync(join(root, ".claude/skills/old-skill"));
    const result = apply(root, "claude-code", "--force");
    expect(result.out).toContain("remove skill old-skill");
    expect(existsSync(join(root, ".claude/skills/old-skill"))).toBe(false);
  });

  test("refuses a same-named skill it did not apply, and leaves synced alone", () => {
    const root = home({
      ".claude/skills/handoff/SKILL.md": "mine\n",
      ".claude/skills/synced/note.md": "claude.ai\n",
    });
    const result = apply(root, "claude-code");
    expect(result.code).toBe(1);
    expect(result.out).toContain("was not applied by agent-loadout");
    expect(read(root, ".claude/skills/synced/note.md")).toBe("claude.ai\n");
  });

  test("gives Codex the prompt section and the skills it shares with Pi", () => {
    const root = home();
    expect(apply(root, "codex").code).toBe(0);
    expect(read(root, ".codex/AGENTS.md")).toStartWith(START);
    expect(existsSync(join(root, ".agents/skills/dev-doctor/SKILL.md"))).toBe(
      true,
    );
    const manifest = JSON.parse(
      read(root, ".agents/skills/.agent-loadout.json"),
    );
    expect(Object.keys(manifest.prompts)).toEqual(["codex"]);
  });

  test("plans a shared skills directory once, so a second apply changes nothing", () => {
    const root = home();
    const first = apply(root, "all");
    expect(first.code).toBe(0);
    expect(first.out).toContain("pi, codex:");
    const manifest = JSON.parse(
      read(root, ".agents/skills/.agent-loadout.json"),
    );
    expect(Object.keys(manifest.prompts).sort()).toEqual(["codex", "pi"]);
    const again = apply(root, "all", "--check");
    expect(again.code).toBe(0);
    expect(again.out).not.toContain("would");
  });

  test("warns when a Codex override file hides the prompt section", () => {
    const root = home({ ".codex/AGENTS.override.md": "# Override\n" });
    expect(apply(root, "codex").out).toContain(
      "AGENTS.override.md is not empty, so codex reads it instead",
    );
  });

  test("warns when an older Pi skill directory hides an applied skill", () => {
    const root = home({ ".pi/agent/skills/handoff/SKILL.md": "old\n" });
    expect(apply(root, "pi").out).toContain("hides the applied handoff");
  });
});
