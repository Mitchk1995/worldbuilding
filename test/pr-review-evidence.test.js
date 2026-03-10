import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMemoryStore } from "../src/memory/store.js";
import {
  buildReviewEvidencePayload,
  buildReviewEvidenceComment,
  findLatestReviewEvidenceComment,
  isTrustedReviewEvidenceComment,
  loadReviewEvidencePolicy,
  parseReviewEvidenceComment,
  validateReviewEvidence
} from "../src/pr-review-evidence.js";

function createPayload({ reviewedHeadSha = "abc123", reviewRound = 2 } = {}) {
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

function createTempStore() {
  const dir = mkdtempSync(join(tmpdir(), "review-evidence-store-"));
  return createMemoryStore(join(dir, "memory.sqlite"));
}

test("review evidence comment round-trips through render and parse", () => {
  const payload = createPayload();
  const comment = buildReviewEvidenceComment(payload);

  assert.deepEqual(parseReviewEvidenceComment(comment), payload);
});

test("buildReviewEvidencePayload reads the latest passing round from the operator store", () => {
  const store = createTempStore();
  const reviewedHeadSha = "abc123";
  store.upsertProjectWorkItem({
    id: "pr-change-binding",
    title: "Bind pull requests and review ledger entries to the exact reviewed change",
    status: "in_progress"
  });
  store.registerReviewerIdentity({
    agentId: "019cd626-761c-7a61-b3d3-90f6e9e520f6",
    displayName: "Ptolemy"
  });

  for (const reviewType of ["research", "code", "qa"]) {
    store.recordProjectReview({
      workItemId: "pr-change-binding",
      reviewType,
      reviewer: "main-agent",
      verdict: "pass",
      notes: `${reviewType} passed`,
      reviewedHeadSha
    });
  }
  store.recordProjectReview({
    workItemId: "pr-change-binding",
    reviewType: "independent",
    reviewer: "subagent:019cd626-761c-7a61-b3d3-90f6e9e520f6",
    verdict: "pass",
    notes: "independent passed",
    reviewedHeadSha
  });
  store.completeProjectWorkItem("pr-change-binding", { reviewedHeadSha });

  const payload = buildReviewEvidencePayload(store, "pr-change-binding");

  assert.equal(payload.workItemId, "pr-change-binding");
  assert.equal(payload.reviewRound, 1);
  assert.equal(payload.reviewedHeadSha, reviewedHeadSha);
  assert.deepEqual(
    payload.reviews.map((review) => review.reviewType),
    ["research", "code", "qa", "independent"]
  );

  store.close();
});

test("parseReviewEvidenceComment returns null for malformed trusted payloads", () => {
  const malformed = `<!-- codex-review-evidence:start -->
Codex Review Evidence

\`\`\`json
{ not valid json }
\`\`\`
<!-- codex-review-evidence:end -->`;

  assert.equal(parseReviewEvidenceComment(malformed), null);
});

test("trusted review evidence can be recognized by author association", () => {
  const payload = createPayload();
  const comment = {
    body: buildReviewEvidenceComment(payload),
    author_association: "OWNER",
    user: {
      login: "repo-owner"
    }
  };

  assert.equal(
    isTrustedReviewEvidenceComment(comment, {
      trustedAuthorLogins: [],
      trustedAuthorAssociations: ["OWNER"]
    }),
    true
  );
});

test("findLatestReviewEvidenceComment ignores untrusted comments", () => {
  const olderTrusted = {
    body: buildReviewEvidenceComment(createPayload({ reviewedHeadSha: "older" })),
    updated_at: "2026-03-10T00:00:00.000Z",
    author_association: "OWNER",
    user: {
      login: "repo-owner"
    }
  };
  const newerUntrusted = {
    body: buildReviewEvidenceComment(createPayload({ reviewedHeadSha: "newer" })),
    updated_at: "2026-03-10T01:00:00.000Z",
    author_association: "NONE",
    user: {
      login: "random-user"
    }
  };

  const found = findLatestReviewEvidenceComment([olderTrusted, newerUntrusted], {
    trustedAuthorLogins: [],
    trustedAuthorAssociations: ["OWNER"]
  });

  assert.equal(found, olderTrusted);
});

test("validateReviewEvidence fails when a required review type is missing from the payload declaration", () => {
  const payload = createPayload();
  payload.requiredReviewTypes = ["research", "code", "qa"];

  const errors = validateReviewEvidence({
    binding: {
      workItemId: "pr-change-binding",
      reviewRound: 2
    },
    pullRequestHeadSha: "abc123",
    reviewEvidence: payload
  });

  assert.match(errors.join("\n"), /does not declare required review type independent/);
});

test("loadReviewEvidencePolicy reads inspectable trust rules from disk", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-evidence-policy-"));
  const path = join(dir, "review-evidence-policy.json");
  writeFileSync(
    path,
    JSON.stringify(
      {
        trustedAuthorLogins: ["trusted-user"],
        trustedAuthorAssociations: ["OWNER", "MEMBER"]
      },
      null,
      2
    )
  );

  const policy = loadReviewEvidencePolicy(path);

  assert.deepEqual(policy, {
    trustedAuthorLogins: ["trusted-user"],
    trustedAuthorAssociations: ["OWNER", "MEMBER"]
  });
});
