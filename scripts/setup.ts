// Installs the dev-framework command: pulls main, builds a snapshot of the command and the Framework, and puts the
// command on PATH. The installed command runs from the snapshot, so this checkout can change until the next install.
// Usage: bun run setup, or bun setup
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import {
  INSTALLED_SOURCE,
  REPO,
  type Source,
  sourceState,
} from "../cli/sync.ts";

const MARK = "# Installed by bun run setup in the dev-framework repository";

/** Where the snapshot and the command go: the XDG data directory, and Bun's bin directory, which Bun puts on PATH. */
export function locations(env: NodeJS.ProcessEnv = process.env) {
  return {
    data: join(
      env.XDG_DATA_HOME || join(homedir(), ".local", "share"),
      "dev-framework",
    ),
    bin: join(env.BUN_INSTALL || join(homedir(), ".bun"), "bin"),
  };
}

/** Replaces the snapshot in data with the command and the Framework of this checkout, and the source they came from. */
export function build(data: string, source: Source): void {
  const next = `${data}.next`;
  rmSync(next, { recursive: true, force: true });
  cpSync(join(REPO, "cli"), join(next, "cli"), {
    recursive: true,
    filter: (path) => !path.endsWith(".test.ts"),
  });
  cpSync(join(REPO, "project"), join(next, "project"), { recursive: true });
  writeFileSync(
    join(next, INSTALLED_SOURCE),
    `${JSON.stringify(source, null, 2)}\n`,
  );
  rmSync(data, { recursive: true, force: true });
  renameSync(next, data);
}

const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/** Writes the command that runs the snapshot; returns its path. */
export function writeCommand(bin: string, data: string): string {
  const path = join(bin, "dev-framework");
  if (existsSync(path) && !readFileSync(path, "utf8").includes(MARK))
    throw new Error(
      `${path} exists and was not installed by this script; remove it, then install again`,
    );
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    path,
    `#!/bin/sh\n${MARK}; run it again to update.\nexec bun ${quote(join(data, "cli", "main.ts"))} "$@"\n`,
  );
  chmodSync(path, 0o755);
  return path;
}

function git(...args: string[]) {
  return spawnSync("git", ["-C", REPO, ...args], { encoding: "utf8" });
}

function fail(message: string): never {
  console.error(`Cannot install: ${message}`);
  process.exit(1);
}

if (import.meta.main) {
  const pulled = process.argv.includes("--pulled");
  if (!pulled) {
    const branch = git("branch", "--show-current").stdout.trim();
    const dirty = git("status", "--porcelain").stdout.trim();
    if (branch !== "main" || dirty)
      fail(
        `install from a clean main; this checkout is on ${branch || "a detached HEAD"}${dirty ? " with uncommitted changes" : ""}`,
      );
    const before = git("rev-parse", "HEAD").stdout.trim();
    if (
      spawnSync("git", ["-C", REPO, "pull", "--ff-only"], { stdio: "inherit" })
        .status !== 0
    )
      fail("git pull failed; fix it, then install again");
    // A pull may change this script too, so the new version finishes the install.
    if (git("rev-parse", "HEAD").stdout.trim() !== before)
      process.exit(
        spawnSync(process.execPath, [import.meta.path, "--pulled"], {
          stdio: "inherit",
        }).status ?? 1,
      );
  }
  const { data, bin } = locations();
  const source = sourceState();
  build(data, source);
  let command: string;
  try {
    command = writeCommand(bin, data);
  } catch (error) {
    fail((error as Error).message);
  }
  console.log(
    `Installed dev-framework ${source.commit.slice(0, 7)} as ${command}`,
  );
  if (!(process.env.PATH ?? "").split(delimiter).includes(bin))
    console.log(
      `${bin} is not on PATH; add it in your shell profile:\n  export PATH="${bin}:$PATH"`,
    );
  else if (Bun.which("dev-framework") !== command)
    console.log(
      `Another dev-framework comes first on PATH: ${Bun.which("dev-framework")}; remove it`,
    );
}
