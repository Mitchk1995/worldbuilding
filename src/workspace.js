import { execFileSync } from "node:child_process";

const GENERATED_REVIEW_ARTIFACT_PATTERNS = [
  /^governance[\\/](subagent-review-.*|.*-review\.diff)$/i
];

export function parseGitStatusPorcelain(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      code: line.slice(0, 2),
      path: line.slice(3)
    }));
}

function isGeneratedReviewArtifact(filePath) {
  return GENERATED_REVIEW_ARTIFACT_PATTERNS.some((pattern) => pattern.test(filePath));
}

export function classifyWorkspaceEntries(entries) {
  const generatedReviewArtifacts = [];
  const meaningfulChanges = [];

  for (const entry of entries) {
    if (isGeneratedReviewArtifact(entry.path)) {
      generatedReviewArtifacts.push(entry);
      continue;
    }
    meaningfulChanges.push(entry);
  }

  return {
    clean: entries.length === 0,
    entryCount: entries.length,
    generatedReviewArtifacts,
    meaningfulChanges,
    entries
  };
}

export function getWorkspaceAudit(cwd = process.cwd()) {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      stdio: "pipe"
    }).toString().trim();
    const statusOutput = execFileSync(
      "git",
      ["status", "--short", "--untracked-files=all"],
      {
        cwd,
        stdio: "pipe"
      }
    ).toString();
    const entries = parseGitStatusPorcelain(statusOutput);
    const classified = classifyWorkspaceEntries(entries);

    return {
      available: true,
      root,
      ...classified
    };
  } catch (error) {
    return {
      available: false,
      clean: true,
      reason: String(error.message ?? error)
    };
  }
}

export function buildWorkspaceDirtyMessage(audit) {
  if (!audit.available || audit.clean) {
    return null;
  }

  const meaningfulPreview = audit.meaningfulChanges
    .slice(0, 5)
    .map((entry) => `${entry.code} ${entry.path}`);
  const artifactPreview = audit.generatedReviewArtifacts
    .slice(0, 5)
    .map((entry) => `${entry.code} ${entry.path}`);
  const parts = [
    `Workspace is dirty: ${audit.meaningfulChanges.length} meaningful change(s)`
  ];

  if (audit.generatedReviewArtifacts.length > 0) {
    parts.push(
      `${audit.generatedReviewArtifacts.length} generated review artifact(s)`
    );
  }

  if (meaningfulPreview.length > 0) {
    parts.push(`First meaningful changes: ${meaningfulPreview.join(", ")}`);
  }

  if (artifactPreview.length > 0) {
    parts.push(`Generated review artifacts: ${artifactPreview.join(", ")}`);
  }

  parts.push("Run `node src/cli.js workspace audit` and commit or clean before calling work complete.");
  return parts.join(". ");
}
