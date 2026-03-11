import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

const CONTEXT_FILE_MAX_CHARS = 20_000;
const SKIP_DIRS = new Set(["node_modules", "__pycache__", "venv", ".venv"]);
const SNAPSHOT_START = "<!-- BEGIN AUTO-GENERATED BUILDER CONTINUITY -->";
const SNAPSHOT_END = "<!-- END AUTO-GENERATED BUILDER CONTINUITY -->";
const PROMPT_SAFETY_RULES = JSON.parse(
  readFileSync(new URL("../../tools/prompt_safety_rules.json", import.meta.url), "utf8")
);

const THREAT_PATTERNS = PROMPT_SAFETY_RULES.patterns.map(({ pattern, id }) => [
  new RegExp(pattern, "i"),
  id
]);

const INVISIBLE_CHARS = new Set(
  PROMPT_SAFETY_RULES.invisible_chars.map((entry) =>
    JSON.parse(`"${entry.replace(/\\/g, "\\\\")}"`)
  )
);

function scanContext(content, label) {
  const findings = [];
  for (const char of INVISIBLE_CHARS) {
    if (content.includes(char)) {
      findings.push(`invisible unicode U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}`);
    }
  }
  for (const [pattern, name] of THREAT_PATTERNS) {
    if (pattern.test(content)) {
      findings.push(name);
    }
  }
  if (findings.length > 0) {
    return `[BLOCKED: ${label} contained potential prompt injection (${findings.join(", ")}).]`;
  }
  return content;
}

function truncateContent(content, label) {
  if (content.length <= CONTEXT_FILE_MAX_CHARS) {
    return content;
  }
  const headChars = Math.floor(CONTEXT_FILE_MAX_CHARS * 0.7);
  const tailChars = Math.floor(CONTEXT_FILE_MAX_CHARS * 0.2);
  return [
    content.slice(0, headChars),
    `\n\n[...truncated ${label}: kept ${headChars}+${tailChars} of ${content.length} chars.]\n\n`,
    content.slice(-tailChars)
  ].join("");
}

function walkAgentsFiles(rootDir, currentDir, found = []) {
  for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      walkAgentsFiles(rootDir, join(currentDir, entry.name), found);
      continue;
    }
    if (entry.name.toLowerCase() === "agents.md") {
      found.push(join(currentDir, entry.name));
    }
  }
  return found.sort((left, right) => left.split(/[\\/]/).length - right.split(/[\\/]/).length);
}

function maybeReadFile(filePath) {
  try {
    return readFileSync(filePath, "utf8").trim();
  } catch {
    return "";
  }
}

function stripGeneratedBuilderSnapshot(content) {
  const start = content.indexOf(SNAPSHOT_START);
  const end = content.indexOf(SNAPSHOT_END);
  if (start === -1 || end === -1 || end < start) {
    return content;
  }

  return `${content.slice(0, start).trimEnd()}\n${content.slice(end + SNAPSHOT_END.length).trimStart()}`
    .trim();
}

export function discoverProjectContext(cwd = process.cwd(), options = {}) {
  const rootDir = resolve(cwd);
  const sections = [];
  const stripRootSnapshot = options.stripRootSnapshot ?? false;

  const topLevelAgents = ["AGENTS.md", "agents.md"]
    .map((name) => join(rootDir, name))
    .find((candidate) => existsSync(candidate));
  if (topLevelAgents) {
    const agentsFiles = walkAgentsFiles(rootDir, rootDir);
    const content = agentsFiles
      .map((filePath) => {
        let raw = maybeReadFile(filePath);
        if (raw && stripRootSnapshot && resolve(filePath) === resolve(topLevelAgents)) {
          raw = stripGeneratedBuilderSnapshot(raw);
        }
        if (!raw) {
          return "";
        }
        return `## ${relative(rootDir, filePath)}\n\n${scanContext(raw, relative(rootDir, filePath))}`;
      })
      .filter(Boolean)
      .join("\n\n");
    if (content) {
      sections.push(truncateContent(content, "AGENTS.md"));
    }
  }

  const cursorFiles = [
    join(rootDir, ".cursorrules"),
    join(rootDir, ".cursor", "rules")
  ];
  const cursorSections = [];
  for (const cursorFile of cursorFiles) {
    if (!existsSync(cursorFile)) {
      continue;
    }
    const stats = statSync(cursorFile);
    if (stats.isDirectory()) {
      for (const entry of readdirSync(cursorFile, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith(".mdc")) {
          continue;
        }
        const filePath = join(cursorFile, entry.name);
        const raw = maybeReadFile(filePath);
        if (!raw) {
          continue;
        }
        cursorSections.push(
          `## ${relative(rootDir, filePath)}\n\n${scanContext(raw, relative(rootDir, filePath))}`
        );
      }
      continue;
    }

    const raw = maybeReadFile(cursorFile);
    if (!raw) {
      continue;
    }
    cursorSections.push(
      `## ${relative(rootDir, cursorFile)}\n\n${scanContext(raw, relative(rootDir, cursorFile))}`
    );
  }
  if (cursorSections.length > 0) {
    sections.push(truncateContent(cursorSections.join("\n\n"), ".cursorrules"));
  }

  const hermesHome = process.env.HERMES_HOME ?? join(homedir(), ".hermes");
  const soulPath =
    [join(rootDir, "SOUL.md"), join(rootDir, "soul.md")].find((candidate) => existsSync(candidate)) ??
    [join(hermesHome, "SOUL.md"), join(hermesHome, "soul.md")].find(
      (candidate) => existsSync(candidate)
    );
  if (soulPath) {
    const raw = maybeReadFile(soulPath);
    if (raw) {
      const soulContent = truncateContent(scanContext(raw, "SOUL.md"), "SOUL.md");
      sections.push(
        `## SOUL.md\n\nIf SOUL.md is present, embody its persona and tone. Avoid stiff, generic replies; follow its guidance unless higher-priority instructions override it.\n\n${soulContent}`
      );
    }
  }

  return sections;
}

export function buildProjectContextPrompt(cwd = process.cwd(), options = {}) {
  const sections = discoverProjectContext(cwd, options);
  if (sections.length === 0) {
    return "";
  }

  return `# Project Context\n\nThe following project context files have been loaded and should be followed:\n\n${sections.join("\n")}`;
}
