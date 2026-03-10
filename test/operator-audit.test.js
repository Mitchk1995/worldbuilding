import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAgentOrgBrief } from "../src/agent-org.js";
import { buildMissionControlBrief } from "../src/mission-control.js";
import { createMemoryStore } from "../src/memory/store.js";
import { buildOperatorSystemsAudit } from "../src/operator-audit.js";

function createTempStore() {
  const dir = mkdtempSync(join(tmpdir(), "operator-audit-store-"));
  return createMemoryStore(join(dir, "memory.sqlite"));
}

function initTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), "operator-audit-repo-"));
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

test("operator systems audit catches orphan branches and open work without a branch", () => {
  const store = createTempStore();
  store.upsertProjectWorkItem({
    id: "system-scrutiny-2026",
    title: "Run critical scrutiny",
    status: "in_progress"
  });
  store.upsertProjectWorkItem({
    id: "dashboard-sync",
    title: "Tighten dashboard sync",
    status: "in_progress"
  });

  const audit = buildOperatorSystemsAudit(store, {
    workspaceAudit: {
      available: true,
      clean: true,
      meaningfulChanges: [],
      entries: []
    },
    branchRefs: ["codex/system-scrutiny-2026-r1", "origin/codex/ghost-lane-r1"]
  });

  assert.equal(audit.overengineering.status, "pass");
  assert.equal(audit.efficiency.status, "fail");
  assert.equal(audit.metrics.orphanWorkBranches, 1);
  assert.equal(audit.metrics.openWorkWithoutBranch, 1);

  store.close();
});

test("agent org brief exposes the specialist seats", () => {
  const brief = buildAgentOrgBrief().content;

  assert.match(brief, /Executive Orchestrator/);
  assert.match(brief, /Chief Risk Auditor/);
  assert.match(brief, /Process Economist/);
  assert.match(brief, /Research Librarian/);
  assert.match(brief, /Independent Verifier/);
});

test("mission control brief surfaces real open failures instead of only hand-picked titles", () => {
  const store = createTempStore();
  const cwd = initTempRepo();
  store.recordOperatorFailure({
    title: "Fresh generic failure",
    details: "A new open issue should appear in the control-center risk summary."
  });

  const brief = buildMissionControlBrief(store, { cwd });

  assert.match(brief.content, /Fresh generic failure/);
  assert.match(brief.content, /Operator audits are/);

  store.close();
});
