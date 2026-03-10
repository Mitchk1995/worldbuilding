import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createMemoryStore, DEFAULT_OPERATOR_DB_PATH } from "./memory/store.js";

const DEFAULT_LEDGER_PATH = resolve("governance", "review-ledger.json");

function latestReviewsByType(reviews) {
  const latest = new Map();
  for (const review of reviews) {
    latest.set(review.reviewType, review);
  }
  return latest;
}

function validateLedger(ledger) {
  const problems = [];

  for (const item of ledger.workItems ?? []) {
    if (item.status === "changes_requested") {
      problems.push(`${item.id} is still marked changes_requested`);
      continue;
    }

    if (item.status !== "done") {
      continue;
    }

    const currentRound = item.reviewRound ?? 1;
    const roundReviews = (item.reviews ?? []).filter(
      (review) => (review.reviewRound ?? 1) === currentRound
    );
    const latest = latestReviewsByType(roundReviews);
    for (const reviewType of item.requiredReviewTypes ?? []) {
      const review = latest.get(reviewType);
      if (!review) {
        problems.push(
          `${item.id} is done but missing ${reviewType} review in round ${currentRound}`
        );
        continue;
      }
      if (review.verdict !== "pass") {
        problems.push(`${item.id} has non-passing ${reviewType} review`);
      }
      if (reviewType === "independent" && review.reviewer === item.owner) {
        problems.push(`${item.id} has self-approved independent review`);
      }
      if (reviewType === "independent" && !String(review.reviewer).startsWith("subagent:")) {
        problems.push(`${item.id} independent review is not tied to a subagent`);
      }
      if (reviewType === "independent" && review.reviewerRegistered === false) {
        problems.push(`${item.id} independent review is not tied to a registered reviewer`);
      }
      if (reviewType === "independent" && review.reviewerIdentityStatus === "revoked") {
        problems.push(`${item.id} independent review uses a revoked reviewer identity`);
      }
    }
  }

  return problems;
}

function syncLedger(dbPath = DEFAULT_OPERATOR_DB_PATH, ledgerPath = DEFAULT_LEDGER_PATH) {
  const store = createMemoryStore(dbPath);
  const ledger = store.exportReviewLedger();
  store.close();

  mkdirSync(dirname(ledgerPath), { recursive: true });
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`);
  return ledger;
}

function checkLedger(ledgerPath = DEFAULT_LEDGER_PATH) {
  const raw = readFileSync(ledgerPath, "utf8");
  const ledger = JSON.parse(raw);
  const problems = validateLedger(ledger);
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(problem);
    }
    process.exitCode = 1;
    return;
  }
  console.log("Review ledger is valid.");
}

const [, , command, maybeA, maybeB] = process.argv;

if (command === "sync") {
  syncLedger(maybeA ?? DEFAULT_OPERATOR_DB_PATH, maybeB ?? DEFAULT_LEDGER_PATH);
} else if (command === "check") {
  checkLedger(maybeA ?? DEFAULT_LEDGER_PATH);
} else {
  console.error("Usage: node src/review-ledger.js <sync|check> [arg1] [arg2]");
  process.exitCode = 1;
}
