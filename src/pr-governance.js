import { validateReviewEvidence } from "./pr-review-evidence.js";

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

export function validatePullRequestRecord({ body, headSha }) {
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

  return errors;
}

function buildLegacyReviewEvidence({ binding, ledger }) {
  const errors = [];
  const workItem = (ledger?.workItems ?? []).find((item) => item.id === binding.workItemId);
  if (!workItem) {
    return {
      errors: [`Declared work item ${binding.workItemId} was not found in the review ledger.`],
      reviewEvidence: null
    };
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
    latestRequiredReviews.map((review) => review.reviewedHeadSha).filter(Boolean)
  );

  if (requiredReviewHeadShas.size > 1) {
    errors.push(
      `Declared work item ${binding.workItemId} has conflicting reviewed head commits in round ${binding.reviewRound}.`
    );
    return {
      errors,
      reviewEvidence: null
    };
  }

  if (
    workItem.reviewedHeadSha &&
    requiredReviewHeadShas.size === 1 &&
    workItem.reviewedHeadSha !== [...requiredReviewHeadShas][0]
  ) {
    errors.push(
      `Declared work item ${binding.workItemId} stores reviewed head ${workItem.reviewedHeadSha}, but latest reviews are bound to ${[...requiredReviewHeadShas][0]}.`
    );
    return {
      errors,
      reviewEvidence: null
    };
  }

  return {
    errors,
    reviewEvidence: {
      workItemId: workItem.id,
      title: workItem.title ?? "",
      reviewRound: binding.reviewRound,
      reviewedHeadSha:
        workItem.reviewedHeadSha ??
        (requiredReviewHeadShas.size === 1 ? [...requiredReviewHeadShas][0] : null),
      requiredReviewTypes: workItem.requiredReviewTypes ?? [],
      publishedAt: null,
      reviews: latestRequiredReviews
    }
  };
}

function canAcceptPostReviewAdvance(changedPaths) {
  return (
    Array.isArray(changedPaths) &&
    changedPaths.length > 0 &&
    changedPaths.every((path) => ALLOWED_POST_REVIEW_PATHS.has(path))
  );
}

export function validatePullRequestGovernance({
  body,
  pullRequestHeadSha,
  reviewEvidence,
  ledger = null,
  changedPathsSinceReviewedHead = [],
  requiredReviewTypes = ["research", "code", "qa", "independent"]
}) {
  const binding = parsePullRequestBinding(body);
  const errors = validatePullRequestRecord({
    body,
    headSha: pullRequestHeadSha
  });
  let effectiveReviewEvidence = reviewEvidence;
  let allowPostReviewAdvance = false;

  if (errors.length === 0 && !effectiveReviewEvidence && ledger) {
    const legacy = buildLegacyReviewEvidence({ binding, ledger });
    errors.push(...legacy.errors);
    effectiveReviewEvidence = legacy.reviewEvidence;
    allowPostReviewAdvance = canAcceptPostReviewAdvance(changedPathsSinceReviewedHead);
  }

  if (errors.length === 0) {
    let evidenceErrors = validateReviewEvidence({
        binding,
        pullRequestHeadSha,
        reviewEvidence: effectiveReviewEvidence,
        requiredReviewTypes
      });

    if (allowPostReviewAdvance) {
      evidenceErrors = evidenceErrors.filter((error) => {
        return !(
          /Review evidence head .* does not match current PR head .*\.$/.test(error) ||
          /evidence is bound to .* not current PR head .*\.$/.test(error)
        );
      });
    }

    errors.push(...evidenceErrors);
  }

  return {
    binding,
    errors
  };
}
