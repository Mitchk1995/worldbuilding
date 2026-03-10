import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { createMemoryStore, DEFAULT_OPERATOR_DB_PATH } from "./memory/store.js";
import {
  COMMENT_END,
  COMMENT_START,
  findLatestReviewEvidenceComment,
  loadReviewEvidencePolicy
} from "./pr-review-evidence-core.js";
let cachedGhPath = null;
export {
  COMMENT_END,
  COMMENT_START,
  findLatestReviewEvidenceComment,
  isTrustedReviewEvidenceComment,
  loadReviewEvidencePolicy,
  parseReviewEvidenceComment,
  validateReviewEvidence
} from "./pr-review-evidence-core.js";

function runGh(args, { input = null } = {}) {
  return execFileSync(resolveGhPath(), args, {
    input,
    stdio: "pipe"
  }).toString();
}

function runGhJson(args, options) {
  return JSON.parse(runGh(args, options));
}

function resolveRepoNameWithOwner() {
  return runGh(
    ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]
  ).trim();
}

function currentGhLogin() {
  return runGh(["api", "user", "--jq", ".login"]).trim();
}

function resolveGhPath() {
  if (cachedGhPath) {
    return cachedGhPath;
  }

  if (process.env.GH_PATH) {
    cachedGhPath = process.env.GH_PATH;
    return cachedGhPath;
  }

  const pathEntries = String(process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const candidates = process.platform === "win32" ? ["gh.exe", "gh.cmd", "gh.bat"] : ["gh"];

  for (const entry of pathEntries) {
    for (const candidate of candidates) {
      const fullPath = join(entry, candidate);
      if (existsSync(fullPath)) {
        cachedGhPath = fullPath;
        return cachedGhPath;
      }
    }
  }

  if (process.platform === "win32") {
    const defaultWindowsPath = "C:\\Program Files\\GitHub CLI\\gh.exe";
    if (existsSync(defaultWindowsPath)) {
      cachedGhPath = defaultWindowsPath;
      return cachedGhPath;
    }
  }

  const locator = process.platform === "win32" ? "where.exe" : "which";
  const raw = execFileSync(locator, ["gh"], {
    stdio: "pipe"
  }).toString();
  cachedGhPath = raw.split(/\r?\n/).find(Boolean)?.trim();
  if (!cachedGhPath) {
    throw new Error("Unable to find the GitHub CLI. Install gh or set GH_PATH.");
  }
  return cachedGhPath;
}

export function buildReviewEvidencePayload(store, workItemId) {
  const workItem = store.getProjectWorkItem(workItemId);
  if (!workItem) {
    throw new Error(`Unknown work item: ${workItemId}`);
  }
  if (workItem.status !== "done") {
    throw new Error(`Work item ${workItemId} must be done before review evidence can be published.`);
  }
  if (!workItem.reviewedHeadSha) {
    throw new Error(`Work item ${workItemId} is missing reviewed head evidence.`);
  }

  const roundReviews = store
    .listProjectReviews(workItemId)
    .filter((review) => review.reviewRound === workItem.reviewRound);
  const latest = latestReviewsByType(roundReviews);
  const reviews = [];

  for (const reviewType of workItem.requiredReviewTypes) {
    const review = latest.get(reviewType);
    if (!review) {
      throw new Error(
        `Work item ${workItemId} is missing ${reviewType} review in round ${workItem.reviewRound}.`
      );
    }
    if (review.verdict !== "pass") {
      throw new Error(
        `Work item ${workItemId} has non-passing ${reviewType} review in round ${workItem.reviewRound}.`
      );
    }
    if (review.reviewedHeadSha !== workItem.reviewedHeadSha) {
      throw new Error(
        `Work item ${workItemId} has ${reviewType} review bound to ${review.reviewedHeadSha ?? "nothing"}, not completed head ${workItem.reviewedHeadSha}.`
      );
    }
    reviews.push({
      reviewType: review.reviewType,
      reviewer: review.reviewer,
      reviewerDisplayName: review.reviewerDisplayName ?? null,
      reviewerIdentityStatus: review.reviewerIdentityStatus ?? null,
      reviewerRegistered: Boolean(review.reviewerRegistered),
      verdict: review.verdict,
      reviewedHeadSha: review.reviewedHeadSha ?? null,
      createdAt: review.created_at
    });
  }

  return {
    workItemId: workItem.id,
    title: workItem.title,
    reviewRound: workItem.reviewRound,
    reviewedHeadSha: workItem.reviewedHeadSha,
    requiredReviewTypes: [...workItem.requiredReviewTypes],
    publishedAt: new Date().toISOString(),
    reviews
  };
}

export function buildReviewEvidenceComment(payload) {
  return [
    COMMENT_START,
    "Codex Review Evidence",
    "",
    `- Work item: \`${payload.workItemId}\``,
    `- Review round: ${payload.reviewRound}`,
    `- Reviewed head: \`${payload.reviewedHeadSha}\``,
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    COMMENT_END
  ].join("\n");
}

export function publishReviewEvidence({
  prNumber,
  workItemId,
  dbPath = DEFAULT_OPERATOR_DB_PATH
}) {
  const store = createMemoryStore(dbPath);
  const payload = buildReviewEvidencePayload(store, workItemId);
  store.close();

  const body = buildReviewEvidenceComment(payload);
  const repo = resolveRepoNameWithOwner();
  const policy = loadReviewEvidencePolicy();
  if (!policy.trustedAuthorLogins.includes(currentGhLogin())) {
    policy.trustedAuthorLogins = [...policy.trustedAuthorLogins, currentGhLogin()];
  }
  const comments = runGhJson(["api", `repos/${repo}/issues/${prNumber}/comments`]);
  const existing = findLatestReviewEvidenceComment(comments, policy);
  const requestBody = JSON.stringify({ body });

  if (existing) {
    runGh(
      [
        "api",
        "--method",
        "PATCH",
        `repos/${repo}/issues/comments/${existing.id}`,
        "--input",
        "-"
      ],
      { input: requestBody }
    );
  } else {
    runGh(
      [
        "api",
        "--method",
        "POST",
        `repos/${repo}/issues/${prNumber}/comments`,
        "--input",
        "-"
      ],
      { input: requestBody }
    );
  }

  return payload;
}

function printUsage() {
  console.error(
    "Usage: node src/pr-review-evidence.js <render|publish> <workItemId> [prNumber] [dbPath]"
  );
}

function main() {
  const [, , command, argA, argB, argC] = process.argv;
  if (command === "render") {
    if (!argA) {
      printUsage();
      process.exitCode = 1;
      return;
    }
    const store = createMemoryStore(argB ?? DEFAULT_OPERATOR_DB_PATH);
    const payload = buildReviewEvidencePayload(store, argA);
    store.close();
    console.log(buildReviewEvidenceComment(payload));
    return;
  }

  if (command === "publish") {
    const prNumber = argA;
    const workItemId = argB;
    const dbPath = argC ?? DEFAULT_OPERATOR_DB_PATH;
    if (!prNumber || !workItemId) {
      printUsage();
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(publishReviewEvidence({ prNumber, workItemId, dbPath }), null, 2));
    return;
  }

  printUsage();
  process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith("pr-review-evidence.js")) {
  main();
}
