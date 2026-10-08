import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import {
  anchors,
  markdownLinks,
} from "../project/.agents/skills/dev-framework/scripts/check.ts";

const REPO = resolve(import.meta.dir, "..");

// Every relative link in the repository's Markdown must point at a file or directory that exists,
// and a fragment into a Markdown file at one of its headings.
function markdownFiles(path: string): string[] {
  if (path.endsWith(".md")) return [path];
  if (!existsSync(path) || path.endsWith("node_modules")) return [];
  try {
    return readdirSync(path).flatMap((name) => markdownFiles(join(path, name)));
  } catch {
    return [];
  }
}

const files = ["README.md", "AGENTS.md", "project", ".agents"].flatMap((path) =>
  markdownFiles(join(REPO, path)),
);

test("finds the documents to check", () => {
  expect(files.length).toBeGreaterThan(20);
});

for (const file of files) {
  test(`${relative(REPO, file)} has no broken relative links`, () => {
    const broken = markdownLinks(readFileSync(file, "utf8")).filter(
      ({ file: path, fragment }) => {
        const target = path === "" ? file : resolve(dirname(file), path);
        if (!existsSync(target)) return true;
        if (fragment === undefined || statSync(target).isDirectory())
          return false;
        return (
          target.endsWith(".md") &&
          !anchors(readFileSync(target, "utf8")).has(fragment)
        );
      },
    );
    expect(broken.map((link) => link.target)).toEqual([]);
  });
}
