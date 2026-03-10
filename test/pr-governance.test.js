import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePullRequestBinding,
  validatePullRequestGovernance
} from "../src/pr-governance.js";

function createReviewEvidence({ reviewedHeadSha = "abc123", reviewRound = 2 } = {}) {
  return {
    workItemId: "pr-change-binding",
    title: "Bind pull requests and review ledger entries to the exact reviewed change",
    reviewRound,
    reviewedHeadSha,
    requiredReviewTypes: ["research", "code", "qa", "independent"],
    publishedAt: new Date().toISOString(),
    reviews: [
      {
        reviewType: "research",
        reviewer: "main-agent",
        verdict: "pass",
        reviewRound,
        reviewedHeadSha
      },
      {
        reviewType: "code",
        reviewer: "main-agent",
        verdict: "pass",
        reviewRound,
        reviewedHeadSha
      },
      {
        reviewType: "qa",
        reviewer: "main-agent",
        verdict: "pass",
        reviewRound,
        reviewedHeadSha
      },
      {
        reviewType: "independent",
        reviewer: "subagent:reviewer",
        verdict: "pass",
        reviewRound,
        reviewedHeadSha
      }
    ]
  };
}

function createLedger({ reviewedHeadSha = "abc123", reviewRound = 2, status = "done" } = {}) {
  return {
    generatedAt: new Date().toISOString(),
    workItems: [
      {
        id: "pr-change-binding",
        title: "Bind pull requests and review ledger entries to the exact reviewed change",
        lane: "operator",
        owner: "main-agent",
        status,
        riskLevel: "normal",
        reviewRound,
        reviewedHeadSha,
        requiredReviewTypes: ["research", "code", "qa", "independent"],
        acceptance: [],
        reviews: createReviewEvidence({ reviewedHeadSha, reviewRound }).reviews
      }
    ]
  };
}

function createPrBody({ workItemId = "pr-change-binding", reviewRound = 2 } = {}) {
  return `## What changed

- tightened the review binding

## Why this is safe

- tied to the exact reviewed change

## Review binding

- Work item: \`${workItemId}\`
- Review round: ${reviewRound}

## Required review record

- [x] Current-source research checked where time-sensitive
- [x] Main implementation review completed
- [x] Tests or other verification completed
- [x] Independent second-agent review completed

## Anti-slop check

- [x] This does not build on something already marked obsolete
- [x] Old assumptions were re-checked if the area is fast-moving
- [x] This can be explained in plain English
`;
}

test("parsePullRequestBinding reads declared work item and review round", () => {
  const binding = parsePullRequestBinding(createPrBody());
  assert.equal(binding.workItemId, "pr-change-binding");
  assert.equal(binding.reviewRound, 2);
});

test("validatePullRequestGovernance passes when PR body, review evidence, and head sha all match", () => {
  const result = validatePullRequestGovernance({
    body: createPrBody(),
    reviewEvidence: createReviewEvidence(),
    pullRequestHeadSha: "abc123"
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.binding.workItemId, "pr-change-binding");
  assert.equal(result.binding.reviewRound, 2);
});

test("validatePullRequestGovernance fails when review evidence is bound to a different head", () => {
  const result = validatePullRequestGovernance({
    body: createPrBody(),
    reviewEvidence: createReviewEvidence({ reviewedHeadSha: "oldsha" }),
    pullRequestHeadSha: "newsha"
  });

  assert.match(result.errors.join("\n"), /Review evidence head oldsha does not match current PR head newsha/);
});

test("validatePullRequestGovernance fails when the PR body does not declare the binding", () => {
  const result = validatePullRequestGovernance({
    body: "## What changed\n\n- no binding here\n",
    reviewEvidence: createReviewEvidence(),
    pullRequestHeadSha: "abc123"
  });

  assert.match(result.errors.join("\n"), /must declare exactly one work item/);
  assert.match(result.errors.join("\n"), /must declare a numeric review round/);
});

test("validatePullRequestGovernance fails when the PR body declares multiple work items", () => {
  const body = `${createPrBody()}
- Work item: \`another-work-item\`
  `;
  const result = validatePullRequestGovernance({
    body,
    reviewEvidence: createReviewEvidence(),
    pullRequestHeadSha: "abc123"
  });

  assert.match(result.errors.join("\n"), /must declare exactly one work item/);
});

test("validatePullRequestGovernance fails when the trusted review evidence is missing", () => {
  const result = validatePullRequestGovernance({
    body: createPrBody(),
    reviewEvidence: null,
    pullRequestHeadSha: "abc123"
  });

  assert.match(result.errors.join("\n"), /missing trusted review evidence/);
});

test("validatePullRequestGovernance still accepts the legacy ledger path for the existing required check", () => {
  const result = validatePullRequestGovernance({
    body: createPrBody(),
    ledger: createLedger(),
    pullRequestHeadSha: "abc123"
  });

  assert.deepEqual(result.errors, []);
});

test("validatePullRequestGovernance still allows the legacy ledger-only post-review commit path", () => {
  const result = validatePullRequestGovernance({
    body: createPrBody(),
    ledger: createLedger({ reviewedHeadSha: "oldsha" }),
    pullRequestHeadSha: "newsha",
    changedPathsSinceReviewedHead: ["governance/review-ledger.json"]
  });

  assert.deepEqual(result.errors, []);
});

test("validatePullRequestGovernance rejects legacy ledger records whose completion head conflicts with the latest reviews", () => {
  const ledger = createLedger();
  ledger.workItems[0].reviewedHeadSha = "oldsha";

  const result = validatePullRequestGovernance({
    body: createPrBody(),
    ledger,
    pullRequestHeadSha: "newsha"
  });

  assert.match(
    result.errors.join("\n"),
    /stores reviewed head oldsha, but latest reviews are bound to abc123/
  );
});
