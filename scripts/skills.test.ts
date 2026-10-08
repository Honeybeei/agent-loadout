import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const REPO = resolve(import.meta.dir, "..");

// Harnesses skip a skill whose frontmatter is not valid YAML, often with only a warning.
function skillFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
      return entry.name === "node_modules" ? [] : skillFiles(path);
    return entry.name === "SKILL.md" ? [path] : [];
  });
}

// The skills projects receive, and the skills for working on this repository.
const files = [
  ...skillFiles(join(REPO, "project", ".agents", "skills")),
  ...skillFiles(join(REPO, ".agents", "skills")),
];

test("finds the skills projects receive and this repository's own", () => {
  const paths = files.map((file) => relative(REPO, file));
  expect(paths).toContain("project/.agents/skills/dev-doctor/SKILL.md");
  expect(paths).toContain("project/.agents/skills/dev-next/SKILL.md");
  expect(paths).toContain(".agents/skills/resolve-feedback/SKILL.md");
});

for (const file of files) {
  test(`${relative(REPO, file)} has valid frontmatter`, () => {
    const match = /^---\n([\s\S]*?)\n---\n/.exec(readFileSync(file, "utf8"));
    expect(match).not.toBeNull();
    const fields = Bun.YAML.parse(match?.[1] ?? "") as Record<string, unknown>;
    const directory = file.split("/").at(-2);
    expect(fields.name).toBe(directory);
    expect(typeof fields.description).toBe("string");
    expect((fields.description as string).length).toBeGreaterThan(20);
    expect((fields.description as string).length).toBeLessThanOrEqual(1024);
  });
}
