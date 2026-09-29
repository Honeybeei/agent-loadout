import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { REPO } from "./apply.ts";

// Every relative link in the repository's Markdown must point at a file or directory that exists.
function markdownFiles(path: string): string[] {
  if (path.endsWith(".md")) return [path];
  if (!existsSync(path) || path.endsWith("node_modules")) return [];
  try {
    return readdirSync(path).flatMap((name) => markdownFiles(join(path, name)));
  } catch {
    return [];
  }
}

function relativeLinks(text: string): string[] {
  const prose = text.replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
  return [...prose.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => (match[1] ?? "").split("#")[0] ?? "")
    .filter((target) => target !== "" && !/^[a-z][a-z0-9+.-]*:/i.test(target));
}

const files = ["README.md", "AGENTS.md", "prompt", "skills", ".agents"].flatMap(
  (path) => markdownFiles(join(REPO, path)),
);

test("finds the documents to check", () => {
  expect(files.length).toBeGreaterThan(20);
});

for (const file of files) {
  test(`${relative(REPO, file)} has no broken relative links`, () => {
    const broken = relativeLinks(readFileSync(file, "utf8")).filter(
      (target) => !existsSync(resolve(dirname(file), target)),
    );
    expect(broken).toEqual([]);
  });
}
