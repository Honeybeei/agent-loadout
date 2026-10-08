import { expect, test } from "bun:test";
import { area, current, readingSet, words } from "./size.ts";

test("counts words without the frontmatter", () => {
  expect(
    words("---\nname: x\ndescription: y z\n---\n\n# Title\nOne two.\n"),
  ).toBe(4);
});

test("sorts files into areas, leaving out READMEs and third-party skills", () => {
  expect(area("project/knowledge/dev-framework.md")).toBe("Framework rules");
  expect(area("project/AGENTS.section.md")).toBe("Framework rules");
  expect(area("project/.agents/skills/dev-explore/SKILL.md")).toBe(
    "Workflow skills",
  );
  expect(area("project/.agents/skills/dev-doctor/SKILL.md")).toBe("dev-doctor");
  expect(area("project/.agents/skills/handoff/SKILL.md")).toBe("Other skills");
  expect(area(".agents/skills/resolve-feedback/SKILL.md")).toBe(
    "This repository's rules",
  );
  expect(area("README.md")).toBeUndefined();
  expect(
    area("project/.agents/skills/writing-for-agents/SKILL.md"),
  ).toBeUndefined();
});

test("a reading set holds the skill and the documents it links", () => {
  const set = readingSet(
    current(),
    "project/.agents/skills/dev-explore/SKILL.md",
  );
  expect(set[0]).toBe("project/.agents/skills/dev-explore/SKILL.md");
  expect(set).toContain(
    "project/knowledge/dev-framework/plan-documentation/explore.md",
  );
});
