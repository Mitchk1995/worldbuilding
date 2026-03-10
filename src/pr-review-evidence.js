import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMemoryStore, DEFAULT_OPERATOR_DB_PATH } from "./memory/store.js";

export const COMMENT_START = "<!-- codex-review-evidence:start -->";
export const COMMENT_END = "<!-- codex-review-evidence:end -->";
const DEFAULT_POLICY_PATH = resolve("governance", "review-evidence-policy.json");
const DEFAULT_REQUIRED_REVIEW_TYPES = ["research", "code", "qa", "independent"];

function latestReviewsByType(reviews) {
  const latest = new Map();
  for (const review of reviews) {
    latest.set(review.reviewType, review);
  }
  return latest;
}

function runGh(args, { input = null } = {}) {
  return execFileSync("gh", args, {
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

export function loadReviewEvidencePolicy(policyPath = DEFAULT_POLICY_PATH) {
  const raw = JSON.parse(readFileSync(policyPath, "utf8"));
  const trustedAuthorLogins = Array.isArray(raw.trustedAuthorLogins)
    ? raw.trustedAuthorLogins.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const trustedAuthorAssociations = Array.isArray(raw.trustedAuthorAssociations)
    ? raw.trustedAuthorAssociations.map((value) => String(value).trim().toUpperCase()).filter(Boolean)
    : ["OWNER"];

  return {
    trustedAuthorLogins,
    trustedAuthorAssociations
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

export function parseReviewEvidenceComment(body) {
  const text = String(body ?? "");
  const match = text.match(
    /<!-- codex-review-evidence:start -->[\s\S]*?```json\s*([\s\S]*?)\s*```[\s\S]*?<!-- codex-review-evidence:end -->/i
  );
  if (!match) {
    return null;
  }
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

export function isTrustedReviewEvidenceComment(comment, policy = {}) {
  if (!String(comment?.body ?? "").includes(COMMENT_START)) {
    return false;
  }

  const trustedAuthorLogins = new Set(
    (policy.trustedAuthorLogins ?? []).map((value) => String(value).trim()).filter(Boolean)
  );
  const trustedAuthorAssociations = new Set(
    (policy.trustedAuthorAssociations ?? ["OWNER"])
      .map((value) => String(value).trim().toUpperCase())
      .filter(Boolean)
  );
  const login = String(comment?.user?.login ?? "").trim();
  const association = String(comment?.author_association ?? "").trim().toUpperCase();

  return trustedAuthorLogins.has(login) || trustedAuthorAssociations.has(association);
}

export function findLatestReviewEvidenceComment(comments, policy = {}) {
  const matches = (comments ?? []).filter((comment) => {
    return isTrustedReviewEvidenceComment(comment, policy);
  });

  return matches
    .sort((left, right) => String(right.updated_at ?? "").localeCompare(String(left.updated_at ?? "")))[0] ?? null;
}

export function validateReviewEvidence({
  binding,
  pullRequestHeadSha,
  reviewEvidence,
  requiredReviewTypes = DEFAULT_REQUIRED_REVIEW_TYPES
}) {
  const errors = [];
  if (!reviewEvidence) {
    return ["Pull request is missing trusted review evidence."];
  }
  if (reviewEvidence.workItemId !== binding.workItemId) {
    errors.push(
      `Review evidence is for ${reviewEvidence.workItemId}, not declared work item ${binding.workItemId}.`
    );
  }
  if ((reviewEvidence.reviewRound ?? null) !== binding.reviewRound) {
    errors.push(
      `Review evidence round ${reviewEvidence.reviewRound ?? "unknown"} does not match declared round ${binding.reviewRound}.`
    );
  }
  if (reviewEvidence.reviewedHeadSha !== pullRequestHeadSha) {
    errors.push(
      `Review evidence head ${reviewEvidence.reviewedHeadSha ?? "unknown"} does not match current PR head ${pullRequestHeadSha}.`
    );
  }

  const declaredRequiredReviewTypes = new Set(
    (reviewEvidence.requiredReviewTypes ?? []).map((value) => String(value).trim()).filter(Boolean)
  );
  const latest = latestReviewsByType(reviewEvidence.reviews ?? []);
  for (const reviewType of requiredReviewTypes) {
    if (!declaredRequiredReviewTypes.has(reviewType)) {
      errors.push(`Review evidence does not declare required review type ${reviewType}.`);
    }
    const review = latest.get(reviewType);
    if (!review) {
      errors.push(`Review evidence is missing ${reviewType} review.`);
      continue;
    }
    if (review.verdict !== "pass") {
      errors.push(`Review evidence has non-passing ${reviewType} review.`);
    }
    if (review.reviewedHeadSha !== pullRequestHeadSha) {
      errors.push(
        `${reviewType} evidence is bound to ${review.reviewedHeadSha ?? "unknown"}, not current PR head ${pullRequestHeadSha}.`
      );
    }
  }

  return errors;
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
