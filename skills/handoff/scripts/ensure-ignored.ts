import { spawnSync } from "node:child_process";
import { lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const DIRECTORY = ".tmp/handoffs";

function stat(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

// Reject symlinks, including dangling ones: ignore rules must describe the actual
// destination, not a lexical alias. Only inspect metadata; never read handoffs.
function checkPath(base: string, target: string, directory: boolean) {
  const rel = relative(base, target);
  if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`Path must remain inside session cwd: ${target}`);
  }
  const parts = rel.split(sep);
  let current = base;
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const entry = stat(current);
    if (!entry) break;
    if (entry.isSymbolicLink()) {
      throw new Error(`Symlink paths are not allowed for handoffs: ${current}`);
    }
    const needsDirectory = directory || index < parts.length - 1;
    if (needsDirectory ? !entry.isDirectory() : !entry.isFile()) {
      throw new Error(
        `Expected a ${needsDirectory ? "directory" : "regular file"}: ${current}`,
      );
    }
  }
}

function git(cwd: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LC_ALL: "C", GIT_OPTIONAL_LOCKS: "0" },
  });
  if (result.error) throw new Error(`Cannot run Git: ${result.error.message}`);
  if (result.status === null)
    throw new Error(`Git terminated by ${result.signal}`);
  return result;
}

function hasGitMarker(base: string) {
  for (let path = base; ; path = dirname(path)) {
    if (stat(join(path, ".git"))) return true;
    if (dirname(path) === path) return false;
  }
}

function ensureIgnored() {
  const args = process.argv.slice(2);
  if (args.length > 1)
    throw new Error("Usage: ensure-ignored.ts [checkpoint-path]");
  for (const key of [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_COMMON_DIR",
    "GIT_CEILING_DIRECTORIES",
  ]) {
    if (process.env[key] !== undefined)
      throw new Error(`Unset ${key} so Git inspects the session cwd.`);
  }
  // Do not let normalization erase a symlink followed by '..'. Validate the
  // original argument before resolving it, even for otherwise contained paths.
  if (args[0]?.split(/[/\\]/).includes("..")) {
    throw new Error(
      "Parent traversal ('..') is not allowed in checkpoint paths. Supply a direct path inside session cwd.",
    );
  }
  const base = realpathSync(process.cwd());
  const directory = resolve(base, DIRECTORY);
  const checkpoint = args[0] === undefined ? undefined : resolve(base, args[0]);
  checkPath(base, directory, true);
  if (checkpoint) checkPath(base, checkpoint, false);

  const inside = git(base, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0) {
    // A missing binary, damaged repo, dubious ownership, or index failure must
    // never be confused with a genuinely non-Git directory.
    if (
      inside.status === 128 &&
      /^fatal: not a git repository\b/.test(inside.stderr) &&
      !hasGitMarker(base)
    ) {
      console.log(
        `Session cwd: ${base}\nHandoffs: ${directory}\nNot a Git worktree; ignore check skipped. Path checks passed.`,
      );
      return;
    }
    throw new Error(`Cannot determine Git worktree: ${inside.stderr.trim()}`);
  }
  if (inside.stdout.trim() !== "true")
    throw new Error(
      "Run from a working directory, not a bare repository or Git metadata directory.",
    );

  const paths = [DIRECTORY];
  if (checkpoint) paths.push(relative(base, checkpoint).split(sep).join("/"));
  const tracked = git(base, [
    "--literal-pathspecs",
    "ls-files",
    "-z",
    "--",
    ...paths,
  ]);
  if (tracked.status !== 0)
    throw new Error(`Cannot inspect tracked files: ${tracked.stderr.trim()}`);
  if (tracked.stdout)
    throw new Error(
      "Handoff path has tracked files. Review and untrack them explicitly before retrying.",
    );

  // The slash is essential for directory-only rules when the directory does
  // not exist yet. Quiet mode accepts exactly one pathname per invocation.
  for (const path of [`${DIRECTORY}/`, ...paths.slice(1)]) {
    const ignored = git(base, ["check-ignore", "-q", "--", path]);
    if (ignored.status === 1)
      throw new Error(
        `${path} is not ignored by Git. Add an applicable ignore rule (for example '/.tmp/handoffs/' in the session cwd's .gitignore) and retry.`,
      );
    if (ignored.status !== 0)
      throw new Error(
        `Cannot check Git ignore rules: ${ignored.stderr.trim()}`,
      );
  }
  console.log(
    `Session cwd: ${base}\nHandoffs: ${directory}\nGit-ignored and untracked; path checks passed.`,
  );
}

try {
  ensureIgnored();
} catch (error) {
  console.error(
    `${error instanceof Error ? error.message : String(error)}\nDo not create or read handoffs. This script does not modify files or Git settings.`,
  );
  process.exitCode = 1;
}
