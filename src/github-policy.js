import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_STATUS_CHECKS = ["review-record-trusted", "verify"];
const GITHUB_ACTIONS_APP_ID = 15368;
let cachedGhPath = null;

// GitHub UI approvals are not our real second-review signal here.
// The required independent review lives in the tracked review ledger,
// and the Quality Gate enforces that ledger on every pull request.
const DESIRED_REQUIRED_CHECKS = DEFAULT_STATUS_CHECKS.map((context) => ({
  context,
  app_id: GITHUB_ACTIONS_APP_ID
})).sort((left, right) => left.context.localeCompare(right.context));

export const DESIRED_MAIN_BRANCH_PROTECTION = {
  required_status_checks: {
    strict: true,
    contexts: [...DEFAULT_STATUS_CHECKS].sort(),
    checks: DESIRED_REQUIRED_CHECKS
  },
  enforce_admins: true,
  required_pull_request_reviews: {
    dismiss_stale_reviews: false,
    require_code_owner_reviews: false,
    required_approving_review_count: 0,
    require_last_push_approval: false
  },
  restrictions: null,
  required_linear_history: true,
  allow_force_pushes: false,
  allow_deletions: false,
  block_creations: false,
  required_conversation_resolution: true,
  lock_branch: false,
  allow_fork_syncing: false
};

export const DESIRED_REPO_SETTINGS = {
  delete_branch_on_merge: true
};

function runGhJson(args) {
  return JSON.parse(
    execFileSync(resolveGhPath(), args, {
      stdio: "pipe"
    }).toString()
  );
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
  const candidates =
    process.platform === "win32"
      ? ["gh.exe", "gh.cmd", "gh.bat"]
      : ["gh"];

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

function getCurrentRepo() {
  const repo = runGhJson([
    "repo",
    "view",
    "--json",
    "nameWithOwner,defaultBranchRef"
  ]);
  return {
    nameWithOwner: repo.nameWithOwner,
    defaultBranch: repo.defaultBranchRef?.name ?? "main"
  };
}

function sortChecks(checks) {
  return checks
    .map((check) => ({
      context: check.context,
      app_id: check.app_id ?? null
    }))
    .sort((left, right) => left.context.localeCompare(right.context));
}

export function normalizeProtection(response) {
  const contexts = [...(response.required_status_checks?.contexts ?? [])].sort();
  const checks =
    response.required_status_checks?.checks?.length > 0
      ? sortChecks(response.required_status_checks.checks)
      : sortChecks(contexts.map((context) => ({ context, app_id: null })));
  return {
    required_status_checks: {
      strict: Boolean(response.required_status_checks?.strict),
      contexts,
      checks
    },
    enforce_admins: Boolean(response.enforce_admins?.enabled),
    required_pull_request_reviews: response.required_pull_request_reviews
      ? {
          dismiss_stale_reviews: Boolean(
            response.required_pull_request_reviews.dismiss_stale_reviews
          ),
          require_code_owner_reviews: Boolean(
            response.required_pull_request_reviews.require_code_owner_reviews
          ),
          required_approving_review_count:
            response.required_pull_request_reviews.required_approving_review_count ?? 0,
          require_last_push_approval: Boolean(
            response.required_pull_request_reviews.require_last_push_approval
          )
        }
      : null,
    restrictions: response.restrictions ?? null,
    required_linear_history: Boolean(response.required_linear_history?.enabled),
    allow_force_pushes: Boolean(response.allow_force_pushes?.enabled),
    allow_deletions: Boolean(response.allow_deletions?.enabled),
    block_creations: Boolean(response.block_creations?.enabled),
    required_conversation_resolution: Boolean(
      response.required_conversation_resolution?.enabled
    ),
    lock_branch: Boolean(response.lock_branch?.enabled),
    allow_fork_syncing: Boolean(response.allow_fork_syncing?.enabled)
  };
}

export function normalizeRepoSettings(response) {
  return {
    delete_branch_on_merge: Boolean(response.delete_branch_on_merge)
  };
}

export function compareStateSection(sectionName, current, desired) {
  const mismatches = [];
  for (const key of Object.keys(desired)) {
    const left = JSON.stringify(current[key] ?? null);
    const right = JSON.stringify(desired[key] ?? null);
    if (left !== right) {
      mismatches.push({
        field: `${sectionName}.${key}`,
        current: current[key] ?? null,
        desired: desired[key] ?? null
      });
    }
  }
  return mismatches;
}

function getProtection(repo, branch) {
  const raw = runGhJson([
    "api",
    `repos/${repo}/branches/${branch}/protection`
  ]);
  return normalizeProtection(raw);
}

function getRepoSettings(repo) {
  const raw = runGhJson([
    "api",
    `repos/${repo}`
  ]);
  return normalizeRepoSettings(raw);
}

function auditProtection(repo, branch) {
  try {
    const current = getProtection(repo, branch);
    const currentRepoSettings = getRepoSettings(repo);
    const mismatches = [
      ...compareStateSection(
        "branch_protection",
        current,
        DESIRED_MAIN_BRANCH_PROTECTION
      ),
      ...compareStateSection(
        "repo_settings",
        currentRepoSettings,
        DESIRED_REPO_SETTINGS
      )
    ];
    const currentState = {
      ...current,
      repo_settings: currentRepoSettings
    };
    const desiredState = {
      ...DESIRED_MAIN_BRANCH_PROTECTION,
      repo_settings: DESIRED_REPO_SETTINGS
    };
    return {
      repo,
      branch,
      protected: true,
      matches: mismatches.length === 0,
      mismatches,
      current: currentState,
      desired: desiredState
    };
  } catch (error) {
    const message = String(error.message ?? error);
    if (message.includes("Branch not protected")) {
      return {
        repo,
        branch,
        protected: false,
        matches: false,
        mismatches: [
          {
            field: "branch_protection",
            current: null,
            desired: DESIRED_MAIN_BRANCH_PROTECTION
          }
        ],
        current: null,
        desired: {
          ...DESIRED_MAIN_BRANCH_PROTECTION,
          repo_settings: DESIRED_REPO_SETTINGS
        }
      };
    }
    throw error;
  }
}

function putProtection(repo, branch) {
  const payload = JSON.stringify({
    ...DESIRED_MAIN_BRANCH_PROTECTION,
    required_status_checks: {
      strict: DESIRED_MAIN_BRANCH_PROTECTION.required_status_checks.strict,
      checks: DESIRED_MAIN_BRANCH_PROTECTION.required_status_checks.checks
    }
  });
  execFileSync(
    resolveGhPath(),
    [
      "api",
      "--method",
      "PUT",
      "-H",
      "Accept: application/vnd.github+json",
      `repos/${repo}/branches/${branch}/protection`,
      "--input",
      "-"
    ],
    {
      input: payload,
      stdio: "pipe"
    }
  );
}

function patchRepoSettings(repo) {
  const payload = JSON.stringify(DESIRED_REPO_SETTINGS);
  execFileSync(
    resolveGhPath(),
    [
      "api",
      "--method",
      "PATCH",
      "-H",
      "Accept: application/vnd.github+json",
      `repos/${repo}`,
      "--input",
      "-"
    ],
    {
      input: payload,
      stdio: "pipe"
    }
  );
}

function printUsage() {
  console.error(
    "Usage: node src/github-policy.js <audit|apply> [owner/repo] [branch]"
  );
}

function main() {
  const [, , command, repoArg, branchArg] = process.argv;
  if (!command || !["audit", "apply"].includes(command)) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const currentRepo = getCurrentRepo();
  const repo = repoArg ?? currentRepo.nameWithOwner;
  const branch = branchArg ?? currentRepo.defaultBranch;

  if (command === "audit") {
    console.log(JSON.stringify(auditProtection(repo, branch), null, 2));
    return;
  }

  patchRepoSettings(repo);
  putProtection(repo, branch);
  console.log(JSON.stringify(auditProtection(repo, branch), null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
