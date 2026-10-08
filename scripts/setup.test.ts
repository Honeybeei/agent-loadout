import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, locations, writeCommand } from "./setup.ts";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

function temp(): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "dev-install-")));
  roots.push(root);
  return root;
}

const source = { commit: "a".repeat(40), branch: "main", dirty: false };

test("locations follow XDG_DATA_HOME and BUN_INSTALL", () => {
  expect(locations({ XDG_DATA_HOME: "/d", BUN_INSTALL: "/b" })).toEqual({
    data: "/d/dev-framework",
    bin: "/b/bin",
  });
});

test("build copies the command without tests, the Framework, and the source", () => {
  const data = join(temp(), "dev-framework");
  build(data, source);
  expect(existsSync(join(data, "cli/main.ts"))).toBe(true);
  expect(existsSync(join(data, "cli/apply.test.ts"))).toBe(false);
  expect(
    existsSync(join(data, "project/.agents/skills/dev-doctor/SKILL.md")),
  ).toBe(true);
  expect(JSON.parse(readFileSync(join(data, "source.json"), "utf8"))).toEqual(
    source,
  );
  build(data, { ...source, commit: "b".repeat(40) });
  expect(readFileSync(join(data, "source.json"), "utf8")).toContain("bbbb");
  expect(existsSync(`${data}.next`)).toBe(false);
});

test("the installed command applies from the snapshot and records its source", () => {
  const root = temp();
  const data = join(root, "data");
  build(data, source);
  const command = writeCommand(join(root, "bin"), data);
  expect(statSync(command).mode & 0o111).not.toBe(0);
  const project = join(root, "project");
  mkdirSync(project);
  Bun.spawnSync(["git", "init", "-q", "-b", "main"], { cwd: project });
  const result = Bun.spawnSync([command, "apply", "--adopt"], {
    cwd: project,
  });
  expect(result.stderr.toString()).toBe("");
  const record = JSON.parse(
    readFileSync(join(project, ".dev/framework.json"), "utf8"),
  );
  expect(record.source).toEqual(source);
});

test("writeCommand replaces its own command and refuses any other file", () => {
  const root = temp();
  const bin = join(root, "bin");
  writeCommand(bin, join(root, "data"));
  expect(() => writeCommand(bin, join(root, "other"))).not.toThrow();
  expect(readFileSync(join(bin, "dev-framework"), "utf8")).toContain(
    `'${join(root, "other")}/cli/main.ts'`,
  );
  writeFileSync(join(bin, "dev-framework"), "#!/bin/sh\necho mine\n");
  expect(() => writeCommand(bin, join(root, "data"))).toThrow(
    "was not installed by this script",
  );
});
