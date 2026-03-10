import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
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

test("review evidence comment round-trips through render and parse", () => {
  const payload = createPayload();
  const comment = buildReviewEvidenceComment(payload);

  assert.deepEqual(parseReviewEvidenceComment(comment), payload);
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
