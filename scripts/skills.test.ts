import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO } from "./apply.ts";

// Harnesses skip a skill whose frontmatter is not valid YAML, often with only a warning.
function skillFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory())
      return entry.name === "node_modules" ? [] : skillFiles(path);
    return entry.name === "SKILL.md" ? [path] : [];
  });
}

const files = skillFiles(join(REPO, "skills"));

test("finds the skills, including the Framework's project skills", () => {
  expect(files.length).toBeGreaterThanOrEqual(10);
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
