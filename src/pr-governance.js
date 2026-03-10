import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const REQUIRED_CHECKLIST_ITEMS = [
  "Current-source research checked where time-sensitive",
  "Main implementation review completed",
  "Tests or other verification completed",
  "Independent second-agent review completed",
  "This does not build on something already marked obsolete",
  "Old assumptions were re-checked if the area is fast-moving",
  "This can be explained in plain English"
];
const ALLOWED_POST_REVIEW_PATHS = new Set(["governance/review-ledger.json"]);

function latestReviewsByType(reviews) {
  const latest = new Map();
  for (const review of reviews) {
    latest.set(review.reviewType, review);
  }
  return latest;
}

export function parsePullRequestBinding(body) {
  const text = String(body ?? "");
  const workItemMatches = [...text.matchAll(/^- Work item:\s*`?([A-Za-z0-9._/-]+)`?\s*$/gim)];
  const reviewRoundMatches = [...text.matchAll(/^- Review round:\s*(\d+)\s*$/gim)];

  return {
    workItemId:
      workItemMatches.length === 1 ? workItemMatches[0][1] : null,
    reviewRound:
      reviewRoundMatches.length === 1
        ? Number.parseInt(reviewRoundMatches[0][1], 10)
        : null
  };
}

export function validatePullRequestRecord({ body, headSha, ledger }) {
  const errors = [];
  const text = String(body ?? "");
  const normalizedHeadSha = String(headSha ?? "").trim();

  const missingChecklist = REQUIRED_CHECKLIST_ITEMS.filter((label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const checked = new RegExp(`- \\[x\\] ${escaped}`, "i");
    return !checked.test(text);
  });

  if (missingChecklist.length > 0) {
    errors.push(
      `Pull request checklist is incomplete. Missing checked items: ${missingChecklist.join("; ")}`
    );
  }

  const binding = parsePullRequestBinding(text);
  if (!binding.workItemId) {
    errors.push("Pull request must declare exactly one work item using `- Work item: <id>`.");
  }
  if (!binding.reviewRound || binding.reviewRound < 1) {
    errors.push("Pull request must declare a numeric review round using `- Review round: <n>`.");
  }
  if (!normalizedHeadSha) {
    errors.push("Pull request head SHA is missing from workflow context.");
  }

  if (errors.length > 0) {
    return errors;
  }

  const workItem = (ledger.workItems ?? []).find((item) => item.id === binding.workItemId);
  if (!workItem) {
    errors.push(`Declared work item ${binding.workItemId} was not found in the review ledger.`);
    return errors;
  }

  if ((workItem.reviewRound ?? 1) !== binding.reviewRound) {
    errors.push(
      `Declared review round ${binding.reviewRound} does not match ledger round ${workItem.reviewRound ?? 1} for ${binding.workItemId}.`
    );
  }

  if (workItem.status !== "done") {
    errors.push(`Declared work item ${binding.workItemId} is ${workItem.status}, not done.`);
  }
  if (!workItem.reviewedHeadSha) {
    errors.push(
      `Declared work item ${binding.workItemId} is missing completion head evidence in the review ledger.`
    );
  }

  const roundReviews = (workItem.reviews ?? []).filter(
    (review) => (review.reviewRound ?? 1) === binding.reviewRound
  );
  const latest = latestReviewsByType(roundReviews);
  const latestRequiredReviews = [];

  for (const reviewType of workItem.requiredReviewTypes ?? []) {
    const review = latest.get(reviewType);
    if (!review) {
      errors.push(
        `Declared work item ${binding.workItemId} is missing ${reviewType} review in round ${binding.reviewRound}.`
      );
      continue;
    }
    latestRequiredReviews.push(review);
    if (review.verdict !== "pass") {
      errors.push(
        `Declared work item ${binding.workItemId} has non-passing ${reviewType} review in round ${binding.reviewRound}.`
      );
    }
    if (!review.reviewedHeadSha) {
      errors.push(
        `${reviewType} review for ${binding.workItemId} round ${binding.reviewRound} is not bound to a reviewed head SHA.`
      );
    }
  }

  const requiredReviewHeadShas = new Set(
    latestRequiredReviews
      .map((review) => review.reviewedHeadSha)
      .filter(Boolean)
  );

  if (requiredReviewHeadShas.size > 1) {
    errors.push(
      `Declared work item ${binding.workItemId} has conflicting reviewed head commits in round ${binding.reviewRound}.`
    );
    return errors;
  }

  const reviewedHeadSha =
    workItem.reviewedHeadSha ??
    (requiredReviewHeadShas.size === 1 ? [...requiredReviewHeadShas][0] : null);

  if (!reviewedHeadSha) {
    errors.push(
      `Declared work item ${binding.workItemId} is not bound to a reviewed head commit.`
    );
    return errors;
  }

  if (
    workItem.reviewedHeadSha &&
    requiredReviewHeadShas.size === 1 &&
    workItem.reviewedHeadSha !== [...requiredReviewHeadShas][0]
  ) {
    errors.push(
      `Declared work item ${binding.workItemId} stores reviewed head ${workItem.reviewedHeadSha}, but latest reviews are bound to ${[...requiredReviewHeadShas][0]}.`
    );
    return errors;
  }

  if (reviewedHeadSha !== normalizedHeadSha) {
    errors.push(
      `Declared work item ${binding.workItemId} is bound to reviewed head ${reviewedHeadSha}, not current PR head ${normalizedHeadSha}.`
    );
  }

  return errors;
}

export function loadReviewLedger(ledgerPath = resolve("governance", "review-ledger.json")) {
  return JSON.parse(readFileSync(ledgerPath, "utf8"));
}

export function validatePullRequestGovernance({
  body,
  ledger,
  pullRequestHeadSha,
  changedPathsSinceReviewedHead = []
}) {
  const binding = parsePullRequestBinding(body);
  let errors = validatePullRequestRecord({
    body,
    headSha: pullRequestHeadSha,
    ledger
  });
  const headMismatchPattern = /is bound to reviewed head .* not current PR head .*\.$/;

  if (
    errors.some((error) => headMismatchPattern.test(error)) &&
    canAcceptPostReviewAdvance(changedPathsSinceReviewedHead)
  ) {
    errors = errors.filter((error) => !headMismatchPattern.test(error));
  }

  return {
    binding,
    errors
  };
}

export function listChangedPathsSinceReviewedHead({
  reviewedHeadSha,
  pullRequestHeadSha,
  cwd = process.cwd()
}) {
  if (!reviewedHeadSha || !pullRequestHeadSha || reviewedHeadSha === pullRequestHeadSha) {
    return [];
  }

  try {
    return execFileSync("git", ["diff", "--name-only", `${reviewedHeadSha}..${pullRequestHeadSha}`], {
      cwd,
      stdio: "pipe"
    })
      .toString()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/\\/g, "/"));
  } catch {
    return [];
  }
}

export function canAcceptPostReviewAdvance(changedPaths) {
  return (
    Array.isArray(changedPaths) &&
    changedPaths.length > 0 &&
    changedPaths.every((path) => ALLOWED_POST_REVIEW_PATHS.has(path))
  );
}

function main() {
  const ledgerPath = process.argv[2]
    ? resolve(process.argv[2])
    : resolve("governance", "review-ledger.json");
  const ledger = loadReviewLedger(ledgerPath);
  const body = process.env.PR_BODY ?? "";
  const headSha = process.env.PR_HEAD_SHA ?? "";
  const binding = parsePullRequestBinding(body);
  const workItem = binding.workItemId
    ? (ledger.workItems ?? []).find((item) => item.id === binding.workItemId) ?? null
    : null;
  const result = validatePullRequestGovernance({
    body,
    ledger,
    pullRequestHeadSha: headSha,
    changedPathsSinceReviewedHead: listChangedPathsSinceReviewedHead({
      reviewedHeadSha: workItem?.reviewedHeadSha ?? null,
      pullRequestHeadSha: headSha
    })
  });

  if (result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(error);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    `Pull request record matches work item ${result.binding.workItemId} review round ${result.binding.reviewRound} and head ${headSha}.`
  );
}

if (process.argv[1] && process.argv[1].endsWith("pr-governance.js")) {
  main();
}
