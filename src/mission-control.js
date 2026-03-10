import { execFileSync } from "node:child_process";
import { getWorkspaceAudit } from "./workspace.js";

function gitRemoteMainState(cwd = process.cwd()) {
  try {
    const localMain = execFileSync("git", ["rev-parse", "main"], {
      cwd,
      stdio: "pipe"
    })
      .toString()
      .trim();
    const remoteMain = execFileSync("git", ["rev-parse", "origin/main"], {
      cwd,
      stdio: "pipe"
    })
      .toString()
      .trim();

    if (localMain === remoteMain) {
      return {
        status: "in_sync",
        ahead: 0,
        behind: 0
      };
    }

    const [ahead, behind] = execFileSync(
      "git",
      ["rev-list", "--left-right", "--count", "main...origin/main"],
      {
        cwd,
        stdio: "pipe"
      }
    )
      .toString()
      .trim()
      .split(/\s+/)
      .map((value) => Number(value));

    return {
      status: "diverged",
      ahead,
      behind
    };
  } catch {
    return {
      status: "unknown",
      ahead: 0,
      behind: 0
    };
  }
}

function workIsDone(store, id) {
  return store.getProjectWorkItem(id)?.status === "done";
}

function findOpenFailure(store, title) {
  return store.listOperatorFailures("open").find((item) => item.title === title);
}

export function buildMissionControlBrief(store, { cwd = process.cwd() } = {}) {
  const openWork = store
    .listProjectWorkItems()
    .filter((item) => !["done", "cancelled"].includes(item.status));
  const memoryAudit = store.auditOperatorMemory();
  const workspaceAudit = getWorkspaceAudit(cwd);
  const branchState = gitRemoteMainState(cwd);
  const githubAutomationDone = workIsDone(store, "github-flow-automation");
  const reviewerTraceabilityDone = workIsDone(store, "reviewer-identity-hardening");
  const notionLayoutLimit = Boolean(
    findOpenFailure(store, "Notion inline board rendering is limited")
  );
  const reviewerSpoofingRisk = Boolean(
    findOpenFailure(store, "Independent review identity can be spoofed")
  );
  const dashboardSyncGap = Boolean(
    findOpenFailure(store, "Reported work as settled before remote landing")
  );

  const matterLines = [];
  if (openWork.length === 0) {
    matterLines.push("- There is no open build job right now.");
  } else {
    matterLines.push(
      `- There ${openWork.length === 1 ? "is 1 open build job" : `are ${openWork.length} open build jobs`} right now.`
    );
  }

  if (githubAutomationDone && reviewerTraceabilityDone) {
    matterLines.push(
      "- GitHub automation, reviewer traceability, and review-time snapshots are landed in the main line."
    );
  }

  if (workspaceAudit.clean) {
    matterLines.push("- The local workspace is clean.");
  } else {
    matterLines.push(
      `- The local workspace is not clean yet (${workspaceAudit.meaningfulChanges.length} meaningful change(s)).`
    );
  }

  if (branchState.status === "in_sync") {
    matterLines.push("- The local main branch is in sync with the remote main branch.");
  } else if (branchState.status === "unknown") {
    matterLines.push("- Remote main status could not be verified from the current repo state.");
  } else if (branchState.ahead > 0 && branchState.behind === 0) {
    matterLines.push(
      "- The local main branch is still ahead of the remote and should not be treated as fully landed yet."
    );
  } else if (branchState.behind > 0 && branchState.ahead === 0) {
    matterLines.push(
      "- The local main branch is behind the remote main branch and needs a refresh before the dashboard should trust it."
    );
  } else {
    matterLines.push(
      `- The local main branch and remote main branch have diverged (${branchState.ahead} ahead, ${branchState.behind} behind).`
    );
  }

  matterLines.push(
    `- Operator memory is currently clean: ${memoryAudit.summary.exactDuplicates} exact duplicates, ${memoryAudit.summary.likelyDuplicates} likely duplicates, and ${memoryAudit.summary.staleOpenRecords} stale open records over ${memoryAudit.summary.staleDays} days.`
  );

  if (notionLayoutLimit) {
    matterLines.push(
      "- This Notion surface still works best as a compact hub with the live detail tables underneath."
    );
  }

  const problemLines = [];
  if (notionLayoutLimit) {
    problemLines.push(
      "- Notion inline board rendering is still limited, so this page still uses a safer hub layout."
    );
  }
  if (reviewerSpoofingRisk) {
    problemLines.push(
      "- Independent review identity can still be spoofed by a dishonest actor."
    );
  }
  if (dashboardSyncGap) {
    problemLines.push(
      "- Dashboard sync is still too manual. A finished change can look settled locally before the protected pull-request path and dashboard are actually caught up."
    );
  }
  if (problemLines.length === 0) {
    problemLines.push("- No major open dashboard problem is currently recorded.");
  }

  const refreshLines = [
    "- Refresh this summary from live repo state before calling work settled.",
    "- Prioritize truthfulness and sync coverage before visual polish.",
    "- Add new open steerings and open problems to the detail tables when they appear."
  ];

  const content = [
    "## What matters now",
    ...matterLines,
    "",
    "## Biggest open problems",
    ...problemLines,
    "",
    "## Refresh rule",
    ...refreshLines
  ].join("\n");

  return {
    content,
    matterLines,
    problemLines,
    refreshLines
  };
}
