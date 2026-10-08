// Diagnoses a project against the installed Dev Framework. It changes nothing.
// Usage: bun doctor.ts [project-root] [--group <id>[,<id>...]|all]
// The project's own rules are checked by the check script copied into it; this adds what only the
// installed Framework knows: whether the managed material is current, and leftovers of earlier Frameworks.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import {
  check,
  type Document,
  GROUPS as RULE_GROUPS,
} from "../project/.agents/skills/dev-framework/scripts/check.ts";
import { planSync } from "./sync.ts";

export const GROUPS = [...RULE_GROUPS, "leftovers"] as const;
export type Group = (typeof GROUPS)[number];
export type Area = "managed" | Group;
export type State = "not adopted" | "outdated" | "current";
export interface Finding {
  area: Area;
  message: string;
}

// Skills that earlier Framework versions put into projects.
const OLD_SKILL =
  /^(?:dev-check(?:-[a-z-]+)?|dev-conformance|dev-cycle|dev-framework-report|dev-init|dev-ssot|dev-update|development-cycle|inspect-project)$/;

export function diagnose(projectRoot: string): {
  state: State;
  findings: Finding[];
  documents: Document[];
} {
  const root = realpathSync(projectRoot);
  const { findings: ruled, documents } = check(root);
  const findings: Finding[] = [...ruled];
  const add = (area: Area, message: string) => findings.push({ area, message });
  const sync = planSync(root);
  for (const problem of sync.problems)
    add("managed", `blocks sync: ${problem}`);
  if (!existsSync(join(root, "dev.yaml")))
    return { state: "not adopted", findings, documents };
  for (const change of sync.changes)
    add(
      "managed",
      `sync would ${change.action} ${change.path}${change.note ? `: ${change.note}` : ""}`,
    );
  if (
    lstatSync(join(root, ".claude/skills"), { throwIfNoEntry: false }) &&
    spawnSync("git", ["-C", root, "ls-files", "--", ".claude/skills"], {
      encoding: "utf8",
    }).stdout === ""
  )
    add("managed", ".claude/skills is not in Git; commit the link");

  if (existsSync(join(root, "plan/map.yaml")))
    add(
      "leftovers",
      "plan/map.yaml is from an earlier Framework; move what the project still needs into the Plan, Knowledge, or AGENTS.md, then delete it",
    );
  const skills = join(root, ".agents/skills");
  if (existsSync(skills) && statSync(skills).isDirectory())
    for (const name of readdirSync(skills).sort())
      if (OLD_SKILL.test(name))
        add(
          "leftovers",
          `.agents/skills/${name} is from an earlier Framework; move what the project still needs into the Plan, Knowledge, or AGENTS.md, then delete it`,
        );

  const state: State =
    sync.changes.length > 0 || sync.problems.length > 0
      ? "outdated"
      : "current";
  return { state, findings, documents };
}

const USAGE =
  "Usage: bun doctor.ts [project-root] [--group <id>[,<id>...]|all]";

function print(title: string, lines: string[]): void {
  console.log(`\n${title}\n${lines.map((line) => `- ${line}`).join("\n")}`);
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const at = args.indexOf("--group");
  const groupArgument = at < 0 ? undefined : (args[at + 1] ?? "");
  const positional =
    at < 0 ? args : [...args.slice(0, at), ...args.slice(at + 2)];
  const selected =
    groupArgument === "all" ? [...GROUPS] : groupArgument?.split(",");
  if (
    positional.length > 1 ||
    positional.some((arg) => arg.startsWith("--")) ||
    selected?.some((id) => !(GROUPS as readonly string[]).includes(id))
  ) {
    console.error(`${USAGE}\nGroups: ${GROUPS.join(", ")}`);
    process.exit(2);
  }
  const root = resolve(positional[0] ?? ".");
  const { state, findings } = diagnose(root);
  const messages = (area: Area) =>
    findings.filter((f) => f.area === area).map((f) => f.message);
  console.log(`State: ${state}`);

  if (selected === undefined) {
    // The diagnosis: managed material, what blocks adoption, and counts per group.
    const shown =
      state === "not adopted" ? ["managed", ...GROUPS] : ["managed"];
    for (const area of shown as Area[])
      if (messages(area).length > 0)
        print(area === "managed" ? "Managed material" : area, messages(area));
    if (state === "current")
      print(
        "Groups",
        GROUPS.map((group) => `${group}: ${messages(group).length}`),
      );
    process.exit(state === "current" && findings.length === 0 ? 0 : 1);
  }

  for (const group of selected as Group[]) {
    const found = messages(group);
    console.log(`\n${group}: ${found.length} findings`);
    for (const message of found) console.log(`- ${message}`);
  }
  process.exit(
    findings.some((f) => (selected as string[]).includes(f.area)) ? 1 : 0,
  );
}
