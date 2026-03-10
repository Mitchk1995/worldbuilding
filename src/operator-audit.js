import { execFileSync } from "node:child_process";
import { getWorkspaceAudit } from "./workspace.js";

export const OPERATOR_AUDIT_BUDGETS = {
  maxOpenSteerings: 12,
  maxOpenFailures: 8,
  maxOpenWorkItems: 2
};

function toSeverity(status) {
  if (status === "fail") {
    return 2;
  }
  if (status === "warn") {
    return 1;
  }
  return 0;
}

function summarizeStatus(issues) {
  const highest = issues.reduce((max, issue) => Math.max(max, toSeverity(issue.status)), 0);
  if (highest >= 2) {
    return "fail";
  }
  if (highest === 1) {
    return "warn";
  }
  return "pass";
}

function parseWorkBranchId(ref) {
  const value = String(ref ?? "").trim();
  const normalized = value.replace(/^origin\//, "");
  const match = normalized.match(/^codex\/(.+)-r\d+$/);
  if (!match) {
    return null;
  }
  return match[1];
}

function listWorkBranchRefs(cwd = process.cwd()) {
  try {
    const raw = execFileSync(
      "git",
      [
        "for-each-ref",
        "--format=%(refname:short)",
        "refs/heads/codex",
        "refs/heads/codex/*",
        "refs/remotes/origin/codex",
        "refs/remotes/origin/codex/*"
      ],
      {
        cwd,
        stdio: "pipe"
      }
    )
      .toString()
      .trim();

    return [...new Set(raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

export function buildOperatorSystemsAudit(
  store,
  {
    cwd = process.cwd(),
    workspaceAudit = getWorkspaceAudit(cwd),
    branchRefs = listWorkBranchRefs(cwd)
  } = {}
) {
  const openSteerings = store.listOperatorSteerings("open");
  const openFailures = store.listOperatorFailures("open");
  const openWork = store
    .listProjectWorkItems()
    .filter((item) => !["done", "cancelled"].includes(item.status));
  const memoryAudit = store.auditOperatorMemory();

  const openWorkIds = new Set(openWork.map((item) => item.id));
  const uniqueBranchRefs = [...new Set(branchRefs)];
  const parsedWorkBranches = uniqueBranchRefs
    .map((ref) => ({ ref, workItemId: parseWorkBranchId(ref) }))
    .filter((entry) => entry.workItemId);
  const orphanWorkBranches = parsedWorkBranches.filter((entry) => !openWorkIds.has(entry.workItemId));
  const openWorkWithoutBranch = openWork.filter((item) => {
    return !parsedWorkBranches.some((entry) => entry.workItemId === item.id);
  });

  const overengineeringIssues = [];
  if (openSteerings.length > OPERATOR_AUDIT_BUDGETS.maxOpenSteerings) {
    overengineeringIssues.push({
      status: openSteerings.length > OPERATOR_AUDIT_BUDGETS.maxOpenSteerings + 3 ? "fail" : "warn",
      message: `${openSteerings.length} open steerings exceed the budget of ${OPERATOR_AUDIT_BUDGETS.maxOpenSteerings}.`
    });
  } else {
    overengineeringIssues.push({
      status: "pass",
      message: `${openSteerings.length} open steerings stay within the budget of ${OPERATOR_AUDIT_BUDGETS.maxOpenSteerings}.`
    });
  }

  if (openFailures.length > OPERATOR_AUDIT_BUDGETS.maxOpenFailures) {
    overengineeringIssues.push({
      status: openFailures.length > OPERATOR_AUDIT_BUDGETS.maxOpenFailures + 2 ? "fail" : "warn",
      message: `${openFailures.length} open failures exceed the budget of ${OPERATOR_AUDIT_BUDGETS.maxOpenFailures}.`
    });
  } else {
    overengineeringIssues.push({
      status: "pass",
      message: `${openFailures.length} open failures stay within the budget of ${OPERATOR_AUDIT_BUDGETS.maxOpenFailures}.`
    });
  }

  if (openWork.length > OPERATOR_AUDIT_BUDGETS.maxOpenWorkItems) {
    overengineeringIssues.push({
      status: "warn",
      message: `${openWork.length} open work item(s) exceed the focus budget of ${OPERATOR_AUDIT_BUDGETS.maxOpenWorkItems}.`
    });
  } else {
    overengineeringIssues.push({
      status: "pass",
      message: `${openWork.length} open work item(s) stay within the focus budget of ${OPERATOR_AUDIT_BUDGETS.maxOpenWorkItems}.`
    });
  }

  const efficiencyIssues = [];
  efficiencyIssues.push({
    status: workspaceAudit.available && workspaceAudit.clean ? "pass" : "fail",
    message:
      workspaceAudit.available && workspaceAudit.clean
        ? "Workspace is clean."
        : "Workspace is not clean enough for efficient autonomous operation."
  });
  efficiencyIssues.push({
    status:
      memoryAudit.summary.exactDuplicates === 0 &&
      memoryAudit.summary.likelyDuplicates === 0 &&
      memoryAudit.summary.staleOpenRecords === 0
        ? "pass"
        : "warn",
    message:
      memoryAudit.summary.exactDuplicates === 0 &&
      memoryAudit.summary.likelyDuplicates === 0 &&
      memoryAudit.summary.staleOpenRecords === 0
        ? "Memory hygiene is clean."
        : `Memory hygiene still shows ${memoryAudit.summary.exactDuplicates} exact duplicate groups, ${memoryAudit.summary.likelyDuplicates} likely duplicate groups, and ${memoryAudit.summary.staleOpenRecords} stale open records.`
  });
  efficiencyIssues.push({
    status: orphanWorkBranches.length === 0 ? "pass" : "fail",
    message:
      orphanWorkBranches.length === 0
        ? "No orphan work branches are hanging around."
        : `${orphanWorkBranches.length} work branch(es) do not match any open work item: ${orphanWorkBranches
            .map((entry) => entry.ref)
            .join(", ")}.`
  });
  efficiencyIssues.push({
    status: openWorkWithoutBranch.length === 0 ? "pass" : "warn",
    message:
      openWorkWithoutBranch.length === 0
        ? "Every open work item has a matching work branch."
        : `${openWorkWithoutBranch.length} open work item(s) do not have a matching work branch: ${openWorkWithoutBranch
            .map((item) => item.id)
            .join(", ")}.`
  });

  return {
    budgets: { ...OPERATOR_AUDIT_BUDGETS },
    metrics: {
      openSteerings: openSteerings.length,
      openFailures: openFailures.length,
      openWorkItems: openWork.length,
      orphanWorkBranches: orphanWorkBranches.length,
      openWorkWithoutBranch: openWorkWithoutBranch.length,
      exactDuplicates: memoryAudit.summary.exactDuplicates,
      likelyDuplicates: memoryAudit.summary.likelyDuplicates,
      staleOpenRecords: memoryAudit.summary.staleOpenRecords
    },
    overengineering: {
      status: summarizeStatus(overengineeringIssues),
      issues: overengineeringIssues
    },
    efficiency: {
      status: summarizeStatus(efficiencyIssues),
      issues: efficiencyIssues
    }
  };
}
