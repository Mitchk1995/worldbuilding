import test from "node:test";
import assert from "node:assert/strict";
import {
  DESIRED_MAIN_BRANCH_PROTECTION,
  DESIRED_REPO_SETTINGS,
  compareStateSection,
  normalizeProtection,
  normalizeRepoSettings
} from "../src/github-policy.js";

test("normalizeProtection preserves required check app bindings", () => {
  const normalized = normalizeProtection({
    required_status_checks: {
      strict: true,
      contexts: ["review-record-trusted", "verify"],
      checks: [
        { context: "review-record-trusted", app_id: null },
        { context: "verify", app_id: 15368 }
      ]
    },
    enforce_admins: { enabled: true },
    required_pull_request_reviews: {
      dismiss_stale_reviews: false,
      require_code_owner_reviews: false,
      required_approving_review_count: 0,
      require_last_push_approval: false
    },
    required_linear_history: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
    block_creations: { enabled: false },
    required_conversation_resolution: { enabled: true },
    lock_branch: { enabled: false },
    allow_fork_syncing: { enabled: false }
  });

  assert.deepEqual(normalized.required_status_checks.checks, [
    { context: "review-record-trusted", app_id: null },
    { context: "verify", app_id: 15368 }
  ]);
});

test("compareStateSection flags untrusted required check sources", () => {
  const current = {
    ...DESIRED_MAIN_BRANCH_PROTECTION,
    required_status_checks: {
      ...DESIRED_MAIN_BRANCH_PROTECTION.required_status_checks,
      checks: [
        { context: "review-record-trusted", app_id: null },
        { context: "verify", app_id: 15368 }
      ]
    }
  };

  const mismatches = compareStateSection(
    "branch_protection",
    current,
    DESIRED_MAIN_BRANCH_PROTECTION
  );

  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].field, "branch_protection.required_status_checks");
});

test("normalizeRepoSettings keeps delete-branch-on-merge visible in policy state", () => {
  const normalized = normalizeRepoSettings({
    delete_branch_on_merge: false
  });
  assert.deepEqual(normalized, {
    delete_branch_on_merge: false
  });

  const mismatches = compareStateSection(
    "repo_settings",
    normalized,
    DESIRED_REPO_SETTINGS
  );
  assert.equal(mismatches.length, 1);
  assert.equal(mismatches[0].field, "repo_settings.delete_branch_on_merge");
});
