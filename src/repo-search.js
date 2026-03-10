import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const DEFAULT_IGNORED_DIRS = new Set([".git", "data", "node_modules"]);

function commandAvailable(command, args = ["--version"]) {
  try {
    execFileSync(command, args, {
      stdio: "pipe"
    });
    return true;
  } catch {
    return false;
  }
}

function normalizeRoots(cwd, roots) {
  const values = roots && roots.length > 0 ? roots : ["."];
  return values.map((root) => resolve(cwd, root));
}

function toRelativePath(cwd, absolutePath) {
  return relative(cwd, absolutePath).replaceAll("\\", "/");
}

function collectFiles(root, ignoredDirs, state) {
  let stats;
  try {
    stats = statSync(root);
  } catch {
    state.missingRoots.push(root);
    return state;
  }

  if (stats.isFile()) {
    state.files.push(root);
    return state;
  }

  if (!stats.isDirectory()) {
    return state;
  }

  const entries = readdirSync(root, {
    withFileTypes: true
  });

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) {
        continue;
      }
      collectFiles(join(root, entry.name), ignoredDirs, state);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    state.files.push(join(root, entry.name));
  }

  return state;
}

function isProbablyText(content) {
  return !content.includes("\u0000");
}

function searchWithJavaScript(query, { cwd, roots, limit }) {
  const normalizedQuery = query.toLowerCase();
  const matches = [];
  const missingRoots = [];

  for (const root of normalizeRoots(cwd, roots)) {
    const state = collectFiles(root, DEFAULT_IGNORED_DIRS, {
      files: [],
      missingRoots
    });
    for (const filePath of state.files) {
      if (matches.length >= limit) {
        return {
          engine: "javascript",
          query,
          roots: roots && roots.length > 0 ? roots : ["."],
          matches,
          warnings: missingRoots.map((item) => `Missing root: ${toRelativePath(cwd, item)}`),
          truncated: true
        };
      }

      let raw;
      try {
        raw = readFileSync(filePath, "utf8");
      } catch {
        continue;
      }

      if (!isProbablyText(raw)) {
        continue;
      }

      const lines = raw.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        if (!lines[index].toLowerCase().includes(normalizedQuery)) {
          continue;
        }

        matches.push({
          path: toRelativePath(cwd, filePath),
          lineNumber: index + 1,
          line: lines[index]
        });

        if (matches.length >= limit) {
          return {
            engine: "javascript",
            query,
            roots: roots && roots.length > 0 ? roots : ["."],
            matches,
            warnings: missingRoots.map((item) => `Missing root: ${toRelativePath(cwd, item)}`),
            truncated: true
          };
        }
      }
    }
  }

  return {
    engine: "javascript",
    query,
    roots: roots && roots.length > 0 ? roots : ["."],
    matches,
    warnings: missingRoots.map((item) => `Missing root: ${toRelativePath(cwd, item)}`),
    truncated: false
  };
}

function parseRipgrepLine(line) {
  const match = /^(.*?):(\d+):(.*)$/.exec(line);
  if (!match) {
    return null;
  }

  return {
    path: match[1].replaceAll("\\", "/"),
    lineNumber: Number(match[2]),
    line: match[3]
  };
}

function searchWithRipgrep(query, { cwd, roots, limit }) {
  const rootArgs = roots && roots.length > 0 ? roots : ["."];
  try {
    const output = execFileSync(
      "rg",
      [
        "--line-number",
        "--with-filename",
        "--color",
        "never",
        "--smart-case",
        "--glob",
        "!.git/**",
        "--glob",
        "!data/**",
        "--glob",
        "!node_modules/**",
        "--max-count",
        String(limit),
        query,
        ...rootArgs
      ],
      {
        cwd,
        stdio: ["ignore", "pipe", "pipe"]
      }
    ).toString();

    return {
      engine: "ripgrep",
      query,
      roots: rootArgs,
      matches: output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(parseRipgrepLine)
        .filter(Boolean),
      truncated: false
    };
  } catch (error) {
    const stdout = String(error.stdout ?? "").trim();
    if (!stdout) {
      return searchWithJavaScript(query, { cwd, roots: rootArgs, limit });
    }

    return {
      engine: "ripgrep",
      query,
      roots: rootArgs,
      matches: stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map(parseRipgrepLine)
        .filter(Boolean),
      truncated: false
    };
  }
}

export function searchWorkspaceText(
  query,
  {
    cwd = process.cwd(),
    roots = ["."],
    limit = 200,
    engine = "auto"
  } = {}
) {
  const trimmedQuery = String(query ?? "").trim();
  if (!trimmedQuery) {
    throw new Error("Workspace search requires a query.");
  }

  if (engine === "javascript") {
    return searchWithJavaScript(trimmedQuery, { cwd, roots, limit });
  }

  if (engine === "ripgrep") {
    return searchWithRipgrep(trimmedQuery, { cwd, roots, limit });
  }

  if (commandAvailable("rg")) {
    return searchWithRipgrep(trimmedQuery, { cwd, roots, limit });
  }

  return searchWithJavaScript(trimmedQuery, { cwd, roots, limit });
}
