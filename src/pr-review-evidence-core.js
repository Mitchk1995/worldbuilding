import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
