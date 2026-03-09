import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMemoryStore } from "../src/memory/store.js";
import { seedInitialMemory } from "../src/memory/seed.js";
import {
  classifyWorkspaceEntries,
  parseGitStatusPorcelain
} from "../src/workspace.js";

function createTempStore() {
  const dir = mkdtempSync(join(tmpdir(), "world-memory-"));
  return createMemoryStore(join(dir, "memory.sqlite"));
}

function initTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "world-repo-"));
  execFileSync("git", ["init"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Codex"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "codex@example.com"], {
    cwd: dir,
    stdio: "pipe"
  });
  writeFileSync(join(dir, "tracked.txt"), "base\n");
  execFileSync("git", ["add", "tracked.txt"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });
  return dir;
}

test("operator memory stores steerings and failures", () => {
  const store = createTempStore();
  seedInitialMemory(store);
  const brief = store.buildOperatorBrief().content;

  assert.match(brief, /Operator Memory Brief/);
  assert.match(brief, /agents-first/);
  assert.match(brief, /Opened unrelated memory skills/);

  store.close();
});

test("world runtime memory creates review items for pending canon events", () => {
  const store = createTempStore();
  store.upsertWorldEntity({
    id: "npc-1",
    kind: "npc",
    name: "Tarin"
  });

  const event = store.appendWorldEvent({
    eventType: "encounter",
    summary: "Tarin met a masked broker in the flooded market.",
    entityLinks: [{ entityId: "npc-1", role: "participant" }]
  });

  const queue = store.listReviewQueue();

  assert.equal(event.review_status, "pending");
  assert.equal(queue.length, 1);
  assert.equal(queue[0].source_table, "world_events");

  store.close();
});

test("search spans operator and world lanes without making vector memory canonical", () => {
  const store = createTempStore();
  seedInitialMemory(store);
  store.upsertWorldEntity({
    id: "npc-lyra",
    kind: "npc",
    name: "Lyra"
  });
  store.recordWorldMemory({
    entityId: "npc-lyra",
    memoryScope: "private",
    memoryType: "goal",
    truthStatus: "belief",
    content: "Lyra wants to decode the moving harbor map before the next storm.",
    tags: ["harbor", "storm"]
  });

  const operatorHits = store.search("skills", { lane: "operator" });
  const worldHits = store.search("harbor", { lane: "world" });

  assert.equal(operatorHits.length > 0, true);
  assert.equal(worldHits.length > 0, true);
  assert.equal(worldHits[0].lane, "world");

  store.close();
});

test("project work cannot complete until required audits pass", () => {
  const store = createTempStore();
  store.upsertProjectWorkItem({
    id: "governance-bootstrap",
    title: "Bootstrap governance",
    owner: "main-agent",
    requiredReviewTypes: ["research", "code", "qa", "independent"]
  });

  store.recordProjectReview({
    workItemId: "governance-bootstrap",
    reviewType: "research",
    reviewer: "main-agent",
    verdict: "pass",
    notes: "Current-system research reviewed."
  });
  store.recordProjectReview({
    workItemId: "governance-bootstrap",
    reviewType: "code",
    reviewer: "main-agent",
    verdict: "pass",
    notes: "Implementation reviewed."
  });

  assert.throws(
    () => store.completeProjectWorkItem("governance-bootstrap"),
    /missing reviews: qa, independent/
  );

  store.recordProjectReview({
    workItemId: "governance-bootstrap",
    reviewType: "qa",
    reviewer: "main-agent",
    verdict: "pass",
    notes: "CLI and tests passed."
  });

  assert.throws(
    () =>
      store.recordProjectReview({
        workItemId: "governance-bootstrap",
        reviewType: "independent",
        reviewer: "main-agent",
        verdict: "pass",
        notes: "I reviewed myself."
      }),
    /must come from someone other than/
  );

  assert.throws(
    () =>
      store.recordProjectReview({
        workItemId: "governance-bootstrap",
        reviewType: "independent",
        reviewer: "different-human-name",
        verdict: "pass",
        notes: "Still not a subagent."
      }),
    /must name a subagent reviewer/
  );

  store.recordProjectReview({
    workItemId: "governance-bootstrap",
    reviewType: "independent",
    reviewer: "subagent:dalton",
    verdict: "pass",
    notes: "Independent review found no blocking issues."
  });

  const completed = store.completeProjectWorkItem("governance-bootstrap");
  assert.equal(completed.status, "done");

  store.close();
});

test("changes requested work blocks other work from starting", () => {
  const store = createTempStore();
  store.upsertProjectWorkItem({
    id: "older-work",
    title: "Older work",
    status: "changes_requested"
  });
  store.upsertProjectWorkItem({
    id: "new-work",
    title: "New work"
  });

  assert.throws(
    () => store.updateProjectWorkStatus("new-work", "in_progress"),
    /older-work is still marked changes_requested/
  );

  store.close();
});

test("failed review forces a fresh full review round before work can complete", () => {
  const store = createTempStore();
  store.upsertProjectWorkItem({
    id: "review-loop",
    title: "Recursive review work",
    owner: "main-agent",
    requiredReviewTypes: ["research", "code", "qa", "independent"]
  });

  store.recordProjectReview({
    workItemId: "review-loop",
    reviewType: "research",
    reviewer: "main-agent",
    verdict: "pass",
    notes: "Research okay in round one."
  });
  store.recordProjectReview({
    workItemId: "review-loop",
    reviewType: "code",
    reviewer: "main-agent",
    verdict: "fail",
    notes: "Code review found problems."
  });
  store.recordProjectReview({
    workItemId: "review-loop",
    reviewType: "qa",
    reviewer: "main-agent",
    verdict: "fail",
    notes: "QA also found problems in the same round."
  });

  assert.equal(store.getProjectWorkItem("review-loop").reviewRound, 1);
  assert.equal(store.getProjectWorkItem("review-loop").status, "changes_requested");

  assert.throws(
    () =>
      store.recordProjectReview({
        workItemId: "review-loop",
        reviewType: "code",
        reviewer: "main-agent",
        verdict: "pass",
        notes: "Tried to re-pass without reopening work."
      }),
    /resume the work first/
  );

  store.updateProjectWorkStatus("review-loop", "in_progress");
  assert.equal(store.getProjectWorkItem("review-loop").reviewRound, 2);

  store.recordProjectReview({
    workItemId: "review-loop",
    reviewType: "code",
    reviewer: "main-agent",
    verdict: "pass",
    notes: "Code review clean in round two."
  });

  assert.throws(
    () => store.completeProjectWorkItem("review-loop"),
    /missing reviews: research, qa, independent/
  );

  store.recordProjectReview({
    workItemId: "review-loop",
    reviewType: "research",
    reviewer: "main-agent",
    verdict: "pass",
    notes: "Research rechecked in round two."
  });
  store.recordProjectReview({
    workItemId: "review-loop",
    reviewType: "qa",
    reviewer: "main-agent",
    verdict: "pass",
    notes: "QA passed in round two."
  });
  store.recordProjectReview({
    workItemId: "review-loop",
    reviewType: "independent",
    reviewer: "subagent:reviewer",
    verdict: "pass",
    notes: "Independent review passed in round two."
  });

  const completed = store.completeProjectWorkItem("review-loop");
  assert.equal(completed.status, "done");

  store.close();
});

test("operator memory audit flags likely duplicates and resolved items disappear from open brief", () => {
  const store = createTempStore();
  store.recordOperatorSteering({
    kind: "capture-feedback",
    note: "Record new feedback immediately so project memory stays aligned.",
    priority: 3
  });
  store.recordOperatorSteering({
    kind: "capture-feedback-duplicate",
    note: "Record new user feedback immediately so the project memory stays aligned.",
    priority: 3
  });
  store.recordOperatorFailure({
    title: "Old issue",
    details: "This used to be true but is fixed now."
  });

  const audit = store.auditOperatorMemory();
  assert.equal(audit.summary.likelyDuplicates > 0, true);

  const original = store.recordOperatorSteering({
    kind: "capture-feedback",
    note: "Record new feedback immediately so project memory stays aligned."
  });
  const normalizedDuplicate = store.recordOperatorSteering({
    kind: "capture feedback",
    note: "Record new feedback immediately so project memory stays aligned!!!"
  });
  assert.equal(normalizedDuplicate.id, original.id);

  store.updateOperatorFailureStatus("Old issue", "resolved");
  const brief = store.buildOperatorBrief().content;
  assert.doesNotMatch(brief, /Old issue/);

  store.close();
});

test("re-recording a resolved failure reopens it instead of leaving it buried", () => {
  const store = createTempStore();
  const created = store.recordOperatorFailure({
    title: "Repeat issue",
    details: "This problem came back."
  });

  store.updateOperatorFailureStatus(created.id, "resolved");
  const reopened = store.recordOperatorFailure({
    title: "Repeat issue",
    details: "This problem came back."
  });

  assert.equal(reopened.status, "open");
  assert.equal(store.listOperatorFailures("open").some((item) => item.id === created.id), true);

  store.close();
});

test("resolving multiple failures by shared title refreshes search state for all of them", () => {
  const store = createTempStore();
  store.recordOperatorFailure({
    title: "Shared title",
    details: "First variant of the problem."
  });
  store.recordOperatorFailure({
    title: "Shared title",
    details: "Second variant of the problem."
  });

  store.updateOperatorFailureStatus("Shared title", "resolved");
  const hits = store.search("Shared", { lane: "operator", limit: 10 })
    .filter((hit) => hit.source_table === "operator_failures");

  assert.equal(hits.length, 2);
  assert.equal(hits.every((hit) => hit.tags.includes("resolved")), true);

  store.close();
});

test("cancelled work does not appear in the open work brief", () => {
  const store = createTempStore();
  store.upsertProjectWorkItem({
    id: "cancelled-work",
    title: "Cancelled work item",
    status: "cancelled"
  });

  const brief = store.buildOperatorBrief().content;
  assert.doesNotMatch(brief, /cancelled-work/);

  store.close();
});

test("reopened older failures rise back into the operator brief", () => {
  const store = createTempStore();
  const older = store.recordOperatorFailure({
    title: "Recurring issue",
    details: "This came back after newer work."
  });
  store.updateOperatorFailureStatus(older.id, "resolved");

  for (let index = 0; index < 10; index += 1) {
    store.recordOperatorFailure({
      title: `New issue ${index}`,
      details: `Fresh issue ${index}`
    });
  }

  store.recordOperatorFailure({
    title: "Recurring issue",
    details: "This came back after newer work."
  });

  const brief = store.buildOperatorBrief(8).content;
  assert.match(brief, /Recurring issue/);

  store.close();
});

test("duplicate audit does not flag simple numbered batches as likely duplicates", () => {
  const store = createTempStore();
  for (let index = 0; index < 6; index += 1) {
    store.recordOperatorFailure({
      title: `Batch issue ${index}`,
      details: `Batch issue ${index} has its own distinct record.`
    });
  }

  const audit = store.auditOperatorMemory();
  assert.equal(audit.summary.likelyDuplicates, 0);

  store.close();
});

test("multiple store handles can open the same database without startup lock failures", () => {
  const dir = mkdtempSync(join(tmpdir(), "world-memory-shared-"));
  const dbPath = join(dir, "memory.sqlite");
  const first = createMemoryStore(dbPath);
  const second = createMemoryStore(dbPath);

  first.recordOperatorSteering({
    kind: "shared-open",
    note: "Two store handles should be able to open the same operator memory."
  });
  const brief = second.buildOperatorBrief().content;
  assert.match(brief, /shared-open/);

  first.close();
  second.close();
});

test("ledger check accepts older exports that do not include explicit review rounds", () => {
  const dir = mkdtempSync(join(tmpdir(), "world-ledger-"));
  const ledgerPath = join(dir, "review-ledger.json");
  const legacyLedger = {
    generatedAt: new Date().toISOString(),
    workItems: [
      {
        id: "legacy-item",
        title: "Legacy item",
        lane: "operator",
        owner: "main-agent",
        status: "done",
        riskLevel: "normal",
        requiredReviewTypes: ["research", "code", "qa", "independent"],
        acceptance: [],
        reviews: [
          { reviewType: "research", reviewer: "main-agent", verdict: "pass", notes: "ok" },
          { reviewType: "code", reviewer: "main-agent", verdict: "pass", notes: "ok" },
          { reviewType: "qa", reviewer: "main-agent", verdict: "pass", notes: "ok" },
          {
            reviewType: "independent",
            reviewer: "subagent:legacy",
            verdict: "pass",
            notes: "ok"
          }
        ]
      }
    ]
  };

  writeFileSync(ledgerPath, `${JSON.stringify(legacyLedger, null, 2)}\n`);

  execFileSync("node", ["src/review-ledger.js", "check", ledgerPath], {
    cwd: process.cwd(),
    stdio: "pipe"
  });
});

test("upserting an in-progress work item after changes requested starts a fresh review round", () => {
  const store = createTempStore();
  store.upsertProjectWorkItem({
    id: "upsert-reopen",
    title: "Upsert reopen",
    owner: "main-agent",
    requiredReviewTypes: ["research", "code", "qa", "independent"]
  });
  store.recordProjectReview({
    workItemId: "upsert-reopen",
    reviewType: "code",
    reviewer: "main-agent",
    verdict: "fail",
    notes: "Needs changes."
  });

  const reopened = store.upsertProjectWorkItem({
    id: "upsert-reopen",
    title: "Upsert reopen",
    status: "in_progress"
  });

  assert.equal(reopened.reviewRound, 2);
  store.close();
});

test("upserting an existing failed item with default status does not clear changes requested", () => {
  const store = createTempStore();
  store.upsertProjectWorkItem({
    id: "upsert-preserve-fail",
    title: "Upsert preserve fail",
    owner: "main-agent",
    requiredReviewTypes: ["research", "code", "qa", "independent"]
  });
  store.recordProjectReview({
    workItemId: "upsert-preserve-fail",
    reviewType: "code",
    reviewer: "main-agent",
    verdict: "fail",
    notes: "Needs changes."
  });

  const unchanged = store.upsertProjectWorkItem({
    id: "upsert-preserve-fail",
    title: "Upsert preserve fail"
  });

  assert.equal(unchanged.status, "changes_requested");
  assert.equal(unchanged.reviewRound, 1);
  store.close();
});

test("re-recording a resolved steering refreshes its stored text and reopens it", () => {
  const store = createTempStore();
  const original = store.recordOperatorSteering({
    kind: "mission-control",
    note: "Use Notion mission control."
  });
  store.updateOperatorSteeringStatus(original.id, "resolved");

  const reopened = store.recordOperatorSteering({
    kind: "mission control",
    note: "Use Notion mission control!",
    priority: 3
  });

  assert.equal(reopened.id, original.id);
  assert.equal(reopened.status, "open");
  assert.equal(reopened.note, "Use Notion mission control!");
  assert.equal(reopened.priority, 3);
  store.close();
});

test("operator record status updates reject unsupported values", () => {
  const store = createTempStore();
  const steering = store.recordOperatorSteering({
    kind: "status-check",
    note: "Status validation should reject typos."
  });

  assert.throws(
    () => store.updateOperatorSteeringStatus(steering.id, "resovled"),
    /Unsupported operator record status/
  );
  assert.throws(
    () =>
      store.recordOperatorFailure({
        title: "bad-status",
        details: "Should reject unsupported statuses.",
        status: "closed"
      }),
    /Unsupported operator record status/
  );

  store.close();
});

test("list commands accept custom database file extensions", () => {
  const dir = mkdtempSync(join(tmpdir(), "world-memory-cli-"));
  const dbPath = join(dir, "operator.sqlite3");
  const store = createMemoryStore(dbPath);
  store.recordOperatorSteering({
    kind: "custom-db",
    note: "Custom db path should be treated as a path, not a status token."
  });
  store.close();

  const output = execFileSync("node", ["src/cli.js", "steering", "list", dbPath], {
    cwd: process.cwd(),
    stdio: "pipe"
  }).toString();

  assert.match(output, /custom-db/);
});

test("list commands accept bare relative database filenames", () => {
  const dir = mkdtempSync(join(tmpdir(), "world-memory-cli-relative-"));
  const dbPath = join(dir, "alt-memory");
  const store = createMemoryStore(dbPath);
  store.recordOperatorSteering({
    kind: "relative-db",
    note: "Bare relative db names should be treated as paths."
  });
  store.close();

  const cliPath = join(process.cwd(), "src", "cli.js");
  const output = execFileSync("node", [cliPath, "steering", "list", "alt-memory"], {
    cwd: dir,
    stdio: "pipe"
  }).toString();

  assert.match(output, /relative-db/);
});

test("list commands reject unknown status tokens instead of creating stray databases", () => {
  const cliPath = join(process.cwd(), "src", "cli.js");

  assert.throws(
    () =>
      execFileSync("node", [cliPath, "steering", "list", "resovled"], {
        cwd: process.cwd(),
        stdio: "pipe"
      }),
    /Unknown status: resovled/
  );
});

test("workspace helpers classify generated review artifacts separately", () => {
  const entries = parseGitStatusPorcelain(
    " M src/cli.js\n?? governance/subagent-review-test.txt\n?? governance/operator-memory-hardening-review.diff\n"
  );
  const audit = classifyWorkspaceEntries(entries);

  assert.equal(audit.entryCount, 3);
  assert.equal(audit.meaningfulChanges.length, 1);
  assert.equal(audit.generatedReviewArtifacts.length, 2);
  assert.equal(audit.clean, false);
});

test("workspace audit reports dirty files in a temp git repo", () => {
  const repoDir = initTempRepo();
  writeFileSync(join(repoDir, "tracked.txt"), "changed\n");
  mkdirSync(join(repoDir, "governance"), { recursive: true });
  writeFileSync(join(repoDir, "governance", "subagent-review-test.txt"), "artifact\n");

  const cliPath = join(process.cwd(), "src", "cli.js");
  const output = execFileSync("node", [cliPath, "workspace", "audit"], {
    cwd: repoDir,
    stdio: "pipe"
  }).toString();
  const audit = JSON.parse(output);

  assert.equal(audit.clean, false);
  assert.equal(audit.meaningfulChanges.some((entry) => entry.path === "tracked.txt"), true);
  assert.equal(
    audit.generatedReviewArtifacts.some(
      (entry) => entry.path === "governance/subagent-review-test.txt"
    ),
    true
  );
});

test("work complete via cli refuses a dirty workspace", () => {
  const repoDir = initTempRepo();
  writeFileSync(join(repoDir, "untracked.txt"), "dirty\n");

  const dbDir = mkdtempSync(join(tmpdir(), "world-memory-complete-"));
  const dbPath = join(dbDir, "memory.sqlite");
  const store = createMemoryStore(dbPath);
  store.upsertProjectWorkItem({
    id: "cli-complete",
    title: "CLI complete",
    owner: "main-agent",
    requiredReviewTypes: ["research", "code", "qa", "independent"]
  });
  store.recordProjectReview({
    workItemId: "cli-complete",
    reviewType: "research",
    reviewer: "main-agent",
    verdict: "pass",
    notes: "ok"
  });
  store.recordProjectReview({
    workItemId: "cli-complete",
    reviewType: "code",
    reviewer: "main-agent",
    verdict: "pass",
    notes: "ok"
  });
  store.recordProjectReview({
    workItemId: "cli-complete",
    reviewType: "qa",
    reviewer: "main-agent",
    verdict: "pass",
    notes: "ok"
  });
  store.recordProjectReview({
    workItemId: "cli-complete",
    reviewType: "independent",
    reviewer: "subagent:cleaner",
    verdict: "pass",
    notes: "ok"
  });
  store.close();

  const cliPath = join(process.cwd(), "src", "cli.js");

  assert.throws(
    () =>
      execFileSync("node", [cliPath, "work", "complete", "cli-complete", dbPath], {
        cwd: repoDir,
        stdio: "pipe"
      }),
    /Workspace is dirty/
  );
});
