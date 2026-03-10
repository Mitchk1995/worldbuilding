import { execFileSync } from "node:child_process";
import { getWorkspaceAudit } from "./workspace.js";

const MISSION_CONTROL_DATABASES = [
  {
    title: "Active Work",
    url: "https://www.notion.so/9067e9ef16964ecca98de768bdc807ff",
    viewUrl: "https://www.notion.so/e991c80118a54cacbabd131c1cbd7b11",
    dataSourceUrl: "collection://4de60dd4-d195-4d7b-b857-0e844404fd63"
  },
  {
    title: "Reviews",
    url: "https://www.notion.so/3389c0f8db404521a135619c1e7eaa82",
    viewUrl: "https://www.notion.so/7ee1f22de76d4274995d2c40f232920a",
    dataSourceUrl: "collection://58d27e5a-1038-4fd2-a9db-73ff5cadc4b3"
  },
  {
    title: "Steerings",
    url: "https://www.notion.so/aed04d06d2a1470cb84c0be92f653f7b",
    viewUrl: "https://www.notion.so/10e354a4f14740d68d03dfbf49d40003",
    dataSourceUrl: "collection://fcdaa9a7-646e-46c0-93e6-39c3c35ebc2f"
  },
  {
    title: "Open Problems",
    url: "https://www.notion.so/9d856c8c10d54342b2144b0ef60ccc54",
    viewUrl: "https://www.notion.so/26f0f3de889040a6816e11de7ded5ca7",
    dataSourceUrl: "collection://37a86324-08b5-45be-b7e9-941b3d3153e7"
  }
];

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

function findOpenSteering(store, kind) {
  return store.listOperatorSteerings("open").find((item) => item.kind === kind);
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
  const reviewerScopeDeprioritized = Boolean(
    findOpenSteering(store, "solo-review-scope")
  );
  const reviewerSpoofingRisk =
    Boolean(findOpenFailure(store, "Independent review identity can be spoofed")) &&
    !reviewerScopeDeprioritized;
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
    "- Preserve the existing live board views and source anchors during page refreshes.",
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

function summarizeWorkCard(openWorkCount) {
  if (openWorkCount === 0) {
    return "No open build job.";
  }
  if (openWorkCount === 1) {
    return "1 open build job needs attention.";
  }
  return `${openWorkCount} open build jobs need attention.`;
}

function summarizeBranchCard(branchState) {
  if (branchState.status === "in_sync") {
    return "Main is synced with origin/main.";
  }
  if (branchState.status === "unknown") {
    return "Main sync could not be verified safely.";
  }
  if (branchState.ahead > 0 && branchState.behind === 0) {
    return "Main is ahead of origin/main and not fully landed yet.";
  }
  if (branchState.behind > 0 && branchState.ahead === 0) {
    return "Main is behind origin/main and needs refresh.";
  }
  return `Main has diverged from origin/main (${branchState.ahead} ahead, ${branchState.behind} behind).`;
}

function buildCalloutBlock({ icon, color, title, lines }) {
  return [
    `::: callout {icon="${icon}" color="${color}"}`,
    `**${title}**`,
    ...lines,
    ":::"
  ].join("\n");
}

function indentBlock(block, level) {
  const prefix = "\t".repeat(level);
  return block
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function buildInlineDatabaseBlock({ title, viewUrl, dataSourceUrl }) {
  if (viewUrl) {
    return `<database url="${viewUrl}" inline="true" data-source-url="${dataSourceUrl}">View of ${title}</database>`;
  }
  return `<database data-source-url="${dataSourceUrl}" inline="true">${title}</database>`;
}

function buildSourceDatabaseBlock({ title, url, dataSourceUrl }) {
  return `<database url="${url}" inline="false" data-source-url="${dataSourceUrl}">${title}</database>`;
}

export function buildMissionControlPageContent(store, { cwd = process.cwd() } = {}) {
  const openWork = store
    .listProjectWorkItems()
    .filter((item) => !["done", "cancelled"].includes(item.status));
  const memoryAudit = store.auditOperatorMemory();
  const workspaceAudit = getWorkspaceAudit(cwd);
  const branchState = gitRemoteMainState(cwd);
  const brief = buildMissionControlBrief(store, { cwd });

  const statusCard = buildCalloutBlock({
    icon: openWork.length === 0 ? "✅" : "🛠️",
    color: openWork.length === 0 ? "green_bg" : "yellow_bg",
    title: "Build State",
    lines: [
      summarizeWorkCard(openWork.length),
      workspaceAudit.clean
        ? "Workspace is clean."
        : `${workspaceAudit.meaningfulChanges.length} meaningful change(s) are still local.`,
      summarizeBranchCard(branchState)
    ]
  });

  const memoryCard = buildCalloutBlock({
    icon: "🧠",
    color: "blue_bg",
    title: "Memory Hygiene",
    lines: [
      `${memoryAudit.summary.exactDuplicates} exact duplicate groups.`,
      `${memoryAudit.summary.likelyDuplicates} likely duplicate groups.`,
      `${memoryAudit.summary.staleOpenRecords} stale open records over ${memoryAudit.summary.staleDays} days.`
    ]
  });

  const riskCard = buildCalloutBlock({
    icon: "⚠️",
    color: brief.problemLines.length > 1 ? "orange_bg" : "gray_bg",
    title: "Open Risks",
    lines: brief.problemLines.map((line) => line.replace(/^- /, ""))
  });

  const refreshCard = buildCalloutBlock({
    icon: "🔄",
    color: "purple_bg",
    title: "Refresh Rule",
    lines: brief.refreshLines.map((line) => line.replace(/^- /, ""))
  });

  const liveBoardColumns = [
    "<columns>",
    "\t<column>",
    "\t\t## Active Work",
    `\t\t${buildInlineDatabaseBlock(MISSION_CONTROL_DATABASES[0])}`,
    "\t</column>",
    "\t<column>",
    "\t\t## Reviews",
    `\t\t${buildInlineDatabaseBlock(MISSION_CONTROL_DATABASES[1])}`,
    "\t</column>",
    "</columns>",
    "<columns>",
    "\t<column>",
    "\t\t## Steerings",
    `\t\t${buildInlineDatabaseBlock(MISSION_CONTROL_DATABASES[2])}`,
    "\t</column>",
    "\t<column>",
    "\t\t## Open Problems",
    `\t\t${buildInlineDatabaseBlock(MISSION_CONTROL_DATABASES[3])}`,
    "\t</column>",
    "</columns>"
  ].join("\n");

  const sourceDatabaseBlocks = MISSION_CONTROL_DATABASES.map((database) =>
    buildSourceDatabaseBlock(database)
  ).join("\n");

  return [
    '::: callout {icon="🧭" color="blue_bg"}',
    "Build-side only. This page should explain what is going on without making you inspect local files.",
    "- Keep build memory separate from future world memory.",
    "- If any review fails, the next full review round must come back clean before work is done.",
    "- Worldbuilding work stays paused until build governance is solid.",
    ":::",
    "## Control Center",
    "<columns>",
    "\t<column>",
    indentBlock(statusCard, 2),
    "\t</column>",
    "\t<column>",
    indentBlock(memoryCard, 2),
    "\t</column>",
    "</columns>",
    "<columns>",
    "\t<column>",
    indentBlock(riskCard, 2),
    "\t</column>",
    "\t<column>",
    indentBlock(refreshCard, 2),
    "\t</column>",
    "</columns>",
    "## Live Boards",
    liveBoardColumns,
    "## What matters now",
    ...brief.matterLines,
    "",
    "## Source Anchors",
    '::: callout {icon="🧱" color="gray_bg"}',
    "Keep these database blocks on the page so the live board views above stay attached during refreshes.",
    "This is a maintenance strip, not the main reading surface.",
    ":::",
    sourceDatabaseBlocks,
    ""
  ].join("\n");
}
