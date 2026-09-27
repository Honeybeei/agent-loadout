import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("ensure-ignored.ts", import.meta.url));
function findGit(): string {
  const path = Bun.which("git");
  assert.ok(path, "Git is required for these tests");
  return path;
}
const realGit = findGit();

function fixture(t: TestContext, repository = true) {
  const temp = realpathSync(mkdtempSync(join(tmpdir(), "handoff-gate-")));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const cwd = join(temp, "project with spaces");
  mkdirSync(cwd);
  const emptyConfig = join(temp, "empty-config");
  writeFileSync(emptyConfig, "");
  const env: NodeJS.ProcessEnv = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
    ),
    HOME: temp,
    XDG_CONFIG_HOME: temp,
    GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "core.excludesFile",
    GIT_CONFIG_VALUE_0: emptyConfig,
    GIT_CONFIG_KEY_1: "core.hooksPath",
    GIT_CONFIG_VALUE_1: join(temp, "no-hooks"),
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
  };
  function git(args: string[]) {
    return execFileSync(realGit, args, { cwd, env, encoding: "utf8" });
  }
  if (repository)
    git(["-c", "init.templateDir=", "init", "--initial-branch=main"]);
  function run(
    args: string[] = [],
    overrides: NodeJS.ProcessEnv = {},
    from = cwd,
  ) {
    return spawnSync(process.execPath, [script, ...args], {
      cwd: from,
      env: { ...env, ...overrides },
      encoding: "utf8",
    });
  }
  function ignore(rule = "/.tmp/handoffs/\n") {
    writeFileSync(join(cwd, ".gitignore"), rule);
  }
  function fakeGit(body: string) {
    const bin = join(temp, "bin");
    mkdirSync(bin);
    writeFileSync(
      join(bin, "git"),
      `#!/bin/sh\n${body}\nexec '${realGit.replaceAll("'", "'\\''")}' "$@"\n`,
      { mode: 0o755 },
    );
    return { PATH: `${bin}:${env.PATH}` };
  }
  return { cwd, temp, env, git, run, ignore, fakeGit };
}

test("verified non-Git cwd skips ignore checks without creating directories", (t) => {
  const f = fixture(t, false);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Not a Git worktree; ignore check skipped/);
  assert.ok(!existsSync(join(f.cwd, ".tmp")));
});

test("unignored directory fails without modifying the workspace", (t) => {
  const f = fixture(t);
  const before = f.git(["status", "--porcelain=v1", "--untracked-files=all"]);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /not ignored/);
  assert.equal(
    f.git(["status", "--porcelain=v1", "--untracked-files=all"]),
    before,
  );
  assert.ok(!existsSync(join(f.cwd, ".tmp")));
  assert.ok(!existsSync(join(f.cwd, ".gitignore")));
});

for (const rule of ["/.tmp/\n", "/.tmp/handoffs/\n"]) {
  for (const existing of [false, true]) {
    test(`directory-only ignore ${rule.trim()} passes with existing=${existing}`, (t) => {
      const f = fixture(t);
      f.ignore(rule);
      if (existing)
        mkdirSync(join(f.cwd, ".tmp/handoffs"), { recursive: true });
      const before = f.git([
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]);
      const result = f.run();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Git-ignored and untracked/);
      assert.equal(
        f.git(["status", "--porcelain=v1", "--untracked-files=all"]),
        before,
      );
      assert.equal(existsSync(join(f.cwd, ".tmp/handoffs")), existing);
    });
  }
}

test("ignore rules can come from .git/info/exclude", (t) => {
  const f = fixture(t);
  mkdirSync(join(f.cwd, ".git/info"), { recursive: true });
  writeFileSync(join(f.cwd, ".git/info/exclude"), "/.tmp/handoffs/\n");
  assert.equal(f.run().status, 0);
});

for (const committed of [false, true]) {
  test(`rejects tracked handoffs with committed=${committed}`, (t) => {
    const f = fixture(t);
    mkdirSync(join(f.cwd, ".tmp/handoffs"), { recursive: true });
    writeFileSync(join(f.cwd, ".tmp/handoffs/note.md"), "checkpoint\n");
    f.git(["add", ".tmp/handoffs/note.md"]);
    if (committed) f.git(["commit", "-m", "Track checkpoint"]);
    f.ignore();
    const before = f.git(["status", "--porcelain=v1"]);
    const result = f.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /tracked files/);
    assert.equal(f.git(["status", "--porcelain=v1"]), before);
  });
}

test("uses nested session cwd rather than the repository root", (t) => {
  const f = fixture(t);
  f.ignore();
  const nested = join(f.cwd, "packages/app");
  mkdirSync(nested, { recursive: true });
  assert.equal(
    f.run([], {}, nested).status,
    1,
    "root ignore must not authorize nested destination",
  );
  writeFileSync(join(nested, ".gitignore"), "/.tmp/handoffs/\n");
  const result = f.run([], {}, nested);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`Handoffs: ${nested}/.tmp/handoffs`));
  assert.ok(!existsSync(join(nested, ".tmp")));
});

test("works in a linked Git worktree", (t) => {
  const f = fixture(t);
  f.git(["commit", "--allow-empty", "-m", "Init"]);
  const worktree = join(f.temp, "worktree");
  f.git(["worktree", "add", "-b", "test-worktree", worktree]);
  writeFileSync(join(worktree, ".gitignore"), "/.tmp/handoffs/\n");
  const result = f.run([], {}, worktree);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes(`Handoffs: ${worktree}/.tmp/handoffs`));
});

test("missing Git fails closed even outside Git", (t) => {
  const f = fixture(t, false);
  const result = f.run([], { PATH: join(f.temp, "missing") });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot run Git/);
});

for (const command of ["rev-parse", "ls-files", "check-ignore"]) {
  test(`Git ${command} error fails closed`, (t) => {
    const f = fixture(t);
    f.ignore();
    const env = f.fakeGit(
      `for arg in "$@"; do\n  if [ "$arg" = '${command}' ]; then echo 'simulated failure' >&2; exit 128; fi\ndone`,
    );
    const result = f.run([], env);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /simulated failure/);
    assert.doesNotMatch(result.stdout, /skipped|Git-ignored/);
  });
}

test("a damaged .git directory is not treated as non-Git", (t) => {
  const f = fixture(t, false);
  mkdirSync(join(f.cwd, ".git"));
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot determine Git worktree/);
});

test("a bare repository is not treated as non-Git", (t) => {
  const f = fixture(t, false);
  f.git(["init", "--bare", "--initial-branch=main"]);
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /bare repository/);
});

test("Git directory overrides cannot redirect the gate", (t) => {
  const f = fixture(t);
  const result = f.run([], { GIT_DIR: join(f.temp, "elsewhere") });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Unset GIT_DIR/);
});

for (const part of [".tmp", ".tmp/handoffs"]) {
  for (const repository of [false, true]) {
    test(`rejects escaping ${part} symlink with Git=${repository}`, (t) => {
      const f = fixture(t, repository);
      if (repository) f.ignore("/.tmp/\n");
      const outside = join(f.temp, "outside");
      mkdirSync(outside);
      mkdirSync(dirname(join(f.cwd, part)), { recursive: true });
      symlinkSync(outside, join(f.cwd, part), "dir");
      const result = f.run();
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Symlink paths/);
      assert.ok(!existsSync(join(outside, "handoffs")));
    });
  }
}

test("rejects dangling directory symlinks and non-directory components", (t) => {
  const f = fixture(t);
  f.ignore("/.tmp/\n");
  symlinkSync(join(f.temp, "absent"), join(f.cwd, ".tmp"), "dir");
  assert.match(f.run().stderr, /Symlink paths/);
  rmSync(join(f.cwd, ".tmp"));
  writeFileSync(join(f.cwd, ".tmp"), "not a directory");
  assert.match(f.run().stderr, /Expected a directory/);
});

test("candidate and explicit checkpoint paths are checked without reading or creating files", (t) => {
  const f = fixture(t);
  f.ignore();
  const candidate = ".tmp/handoffs/2026-01-01T00-00-00Z-001.md";
  assert.equal(f.run([candidate]).status, 0);
  assert.ok(!existsSync(join(f.cwd, ".tmp")));
  mkdirSync(join(f.cwd, ".tmp/handoffs"), { recursive: true });
  writeFileSync(join(f.cwd, candidate), "private checkpoint");
  assert.equal(f.run([candidate]).status, 0);
  assert.equal(
    readFileSync(join(f.cwd, candidate), "utf8"),
    "private checkpoint",
  );
  writeFileSync(join(f.cwd, "unignored.md"), "not ignored");
  assert.match(f.run(["unignored.md"]).stderr, /not ignored/);
  assert.match(
    f.run([join(f.temp, "outside.md")]).stderr,
    /inside session cwd/,
  );
  assert.match(f.run(["../outside.md"]).stderr, /Parent traversal/);
  symlinkSync(join(f.temp, "outside.md"), join(f.cwd, ".tmp/handoffs/link.md"));
  assert.match(f.run([".tmp/handoffs/link.md"]).stderr, /Symlink paths/);
});

for (const repository of [false, true]) {
  test(`rejects symlink/.. before normalization with Git=${repository}`, (t) => {
    const f = fixture(t, repository);
    if (repository) f.ignore();
    mkdirSync(join(f.cwd, ".tmp/handoffs"), { recursive: true });
    const outside = join(f.temp, "outside");
    mkdirSync(join(outside, "inner"), { recursive: true });
    writeFileSync(join(outside, "note.md"), "outside checkpoint");
    writeFileSync(join(f.cwd, ".tmp/handoffs/note.md"), "inside checkpoint");
    symlinkSync(
      join(outside, "inner"),
      join(f.cwd, ".tmp/handoffs/link"),
      "dir",
    );
    const path = ".tmp/handoffs/link/../note.md";
    for (const candidate of [path, `${f.cwd}/${path}`]) {
      const result = f.run([candidate]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Parent traversal/);
      assert.doesNotMatch(result.stdout, /passed/);
    }
    assert.equal(
      readFileSync(join(outside, "note.md"), "utf8"),
      "outside checkpoint",
    );
    assert.equal(
      readFileSync(join(f.cwd, ".tmp/handoffs/note.md"), "utf8"),
      "inside checkpoint",
    );
  });
}

test("explicit paths with glob characters use literal Git pathspecs", (t) => {
  const f = fixture(t);
  f.ignore("/.tmp/handoffs/\n/notes/\n");
  mkdirSync(join(f.cwd, "notes"));
  writeFileSync(join(f.cwd, "notes/[draft].md"), "checkpoint");
  f.git(["--literal-pathspecs", "add", "-f", "notes/[draft].md"]);
  assert.match(f.run(["notes/[draft].md"]).stderr, /tracked files/);
});

test("rejects extra script arguments", (t) => {
  const f = fixture(t);
  assert.match(f.run(["one", "two"]).stderr, /Usage:/);
});

test("internal documents and assets are reachable through relative links", () => {
  const skill = resolve(dirname(script), "..");
  for (const path of [
    "SKILL.md",
    "references/create.md",
    "references/resume.md",
  ]) {
    const source = join(skill, path);
    const text = readFileSync(source, "utf8");
    for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
      assert.ok(match[1]);
      assert.ok(
        existsSync(resolve(dirname(source), match[1])),
        `${path}: broken link ${match[1]}`,
      );
    }
  }
  assert.ok(!existsSync(resolve(skill, "../resume-handoff/SKILL.md")));
});
