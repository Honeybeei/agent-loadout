// Where each supported harness reads skills and its global prompt.
import { join } from "node:path";

export interface Harness {
  name: string;
  /** Directory that receives one copy of each skill; harnesses that read the same directory share it. */
  skillsDir: string;
  /** File that receives the global prompt section. */
  promptPath: string;
  /** A file the harness reads instead of promptPath when it is not empty. */
  promptOverride?: string;
  /** Files under prompt/ combined into the section, in order; missing files are skipped. */
  promptParts: string[];
  /** Other skill directories the harness reads first; a same-named skill there wins. */
  shadowDirs: string[];
  /** Entries in skillsDir that belong to someone else and are never touched. */
  reserved: string[];
}

export function harnesses(
  home: string,
  codexHome = join(home, ".codex"),
): Harness[] {
  return [
    {
      name: "pi",
      skillsDir: join(home, ".agents", "skills"),
      promptPath: join(home, ".pi", "agent", "AGENTS.md"),
      promptParts: ["common.md", "pi.md"],
      shadowDirs: [join(home, ".pi", "agent", "skills")],
      reserved: [],
    },
    {
      name: "claude-code",
      skillsDir: join(home, ".claude", "skills"),
      promptPath: join(home, ".claude", "CLAUDE.md"),
      promptParts: ["common.md", "claude-code.md"],
      shadowDirs: [],
      reserved: ["synced"],
    },
    {
      name: "codex",
      skillsDir: join(home, ".agents", "skills"),
      promptPath: join(codexHome, "AGENTS.md"),
      promptOverride: join(codexHome, "AGENTS.override.md"),
      promptParts: ["common.md", "codex.md"],
      shadowDirs: [],
      reserved: [],
    },
  ];
}
