import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createMemoryStore } from "../src/memory/store.js";
import { seedInitialMemory } from "../src/memory/seed.js";

function createTempStore() {
  const dir = mkdtempSync(join(tmpdir(), "world-memory-"));
  return createMemoryStore(join(dir, "memory.sqlite"));
}

test("operator memory stores steerings and failures", () => {
  const store = createTempStore();
  seedInitialMemory(store);
  const brief = store.buildOperatorBrief().content;

  assert.match(brief, /Operator Memory Brief/);
  assert.match(brief, /research-discipline/);
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
