import { expect, test } from "bun:test";
import { area, current, readingSet, words } from "./size.ts";

test("counts words without the frontmatter", () => {
  expect(
    words("---\nname: x\ndescription: y z\n---\n\n# Title\nOne two.\n"),
  ).toBe(4);
});

test("sorts files into areas, leaving out READMEs and third-party skills", () => {
  expect(area("skills/dev-framework/project/knowledge/dev-framework.md")).toBe(
    "Framework rules",
  );
  expect(area("skills/dev-framework/project/AGENTS.section.md")).toBe(
    "Framework rules",
  );
  expect(
    area("skills/dev-framework/project/.agents/skills/dev-explore/SKILL.md"),
  ).toBe("Workflow skills");
  expect(area("skills/handoff/SKILL.md")).toBe("Other skills");
  expect(area(".agents/skills/resolve-feedback/SKILL.md")).toBe(
    "This repository's rules",
  );
  expect(area("skills/dev-framework/README.md")).toBeUndefined();
  expect(area("skills/writing-for-agents/SKILL.md")).toBeUndefined();
});

test("a reading set holds the skill and the documents it links", () => {
  const set = readingSet(
    current(),
    "skills/dev-framework/project/.agents/skills/dev-explore/SKILL.md",
  );
  expect(set[0]).toBe(
    "skills/dev-framework/project/.agents/skills/dev-explore/SKILL.md",
  );
  expect(set).toContain(
    "skills/dev-framework/project/knowledge/dev-framework/plan-documentation/explore.md",
  );
});
