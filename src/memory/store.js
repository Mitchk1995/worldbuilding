import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { SCHEMA_SQL } from "./schema.js";

const DEFAULT_OPERATOR_DB_PATH = resolve("data", "operator-memory.sqlite");
const DEFAULT_WORLD_DB_PATH = resolve("data", "world-runtime.sqlite");
const LEGACY_OPERATOR_DB_PATH = resolve("data", "world-memory.sqlite");

function nowIso() {
  return new Date().toISOString();
}

function daysOld(isoString) {
  const timestamp = Date.parse(isoString);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return Math.floor((Date.now() - timestamp) / (1000 * 60 * 60 * 24));
}

function toJson(value) {
  return JSON.stringify(value ?? {});
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function ensureDirFor(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function normalizeForComparison(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return new Set(
    normalizeForComparison(value)
      .split(" ")
      .filter((token) => token.length >= 3 || /^\d+$/.test(token))
  );
}

function numericTokens(value) {
  return new Set(
    normalizeForComparison(value)
      .split(" ")
      .filter((token) => /^\d+$/.test(token))
  );
}

function jaccardSimilarity(left, right) {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / (leftTokens.size + rightTokens.size - overlap);
}

const OPERATOR_RECORD_STATUSES = new Set(["open", "resolved"]);
const REVIEWER_IDENTITY_STATUSES = new Set(["active", "legacy", "revoked"]);
const PROJECT_WORK_STATUSES = new Set([
  "proposed",
  "in_progress",
  "changes_requested",
  "done",
  "cancelled"
]);
const SUBAGENT_AGENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertOperatorRecordStatus(status) {
  if (!OPERATOR_RECORD_STATUSES.has(status)) {
    throw new Error(
      `Unsupported operator record status: ${status}. Allowed statuses: open, resolved.`
    );
  }
}

function assertReviewerIdentityStatus(status) {
  if (!REVIEWER_IDENTITY_STATUSES.has(status)) {
    throw new Error(
      `Unsupported reviewer identity status: ${status}. Allowed statuses: active, legacy, revoked.`
    );
  }
}

function assertProjectWorkStatus(status) {
  if (!PROJECT_WORK_STATUSES.has(status)) {
    throw new Error(
      `Unsupported project work status: ${status}. Allowed statuses: proposed, in_progress, changes_requested, done, cancelled.`
    );
  }
}

function shouldStartFreshReviewRound(previousStatus, nextStatus) {
  if (nextStatus !== "in_progress") {
    return false;
  }

  return (
    previousStatus === "changes_requested" ||
    previousStatus === "done" ||
    previousStatus === "cancelled"
  );
}

function reviewerKeyFromAgentId(agentId) {
  return `subagent:${agentId}`;
}

function bootstrapOperatorDbFromLegacy() {
  if (existsSync(DEFAULT_OPERATOR_DB_PATH) || !existsSync(LEGACY_OPERATOR_DB_PATH)) {
    return;
  }

  ensureDirFor(DEFAULT_OPERATOR_DB_PATH);
  const source = new DatabaseSync(LEGACY_OPERATOR_DB_PATH);
  const target = new DatabaseSync(DEFAULT_OPERATOR_DB_PATH);
  target.exec(SCHEMA_SQL);

  const copies = [
    {
      table: "operator_steerings",
      columns: ["id", "kind", "note", "source", "status", "priority", "created_at", "updated_at"]
    },
    {
      table: "operator_failures",
      columns: ["id", "title", "details", "cause", "impact", "status", "created_at", "updated_at"]
    },
    {
      table: "project_work_items",
      columns: [
        "id",
        "title",
        "lane",
        "spec",
        "status",
        "risk_level",
        "required_review_types_json",
        "acceptance_json",
        "created_at",
        "updated_at"
      ]
    },
    {
      table: "project_reviews",
      columns: [
        "id",
        "work_item_id",
        "review_type",
        "reviewer",
        "verdict",
        "notes",
        "findings_json",
        "created_at"
      ]
    }
  ];

  for (const copy of copies) {
    const exists = source.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`
    ).get(copy.table);
    if (!exists) {
      continue;
    }

    const rows = source.prepare(
      `SELECT ${copy.columns.join(", ")} FROM ${copy.table}`
    ).all();
    if (rows.length === 0) {
      continue;
    }

    const placeholders = copy.columns.map(() => "?").join(", ");
    const insert = target.prepare(
      `INSERT OR IGNORE INTO ${copy.table} (${copy.columns.join(", ")}) VALUES (${placeholders})`
    );

    for (const row of rows) {
      insert.run(...copy.columns.map((column) => row[column]));
    }
  }

  source.close();
  target.close();
}

export class MemoryStore {
  constructor(dbPath = DEFAULT_OPERATOR_DB_PATH) {
    this.dbPath = resolveDefaultDbPath(dbPath);
    ensureDirFor(this.dbPath);
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA busy_timeout = 5000;");
    const journalMode = this.db.prepare("PRAGMA journal_mode").get();
    if (String(journalMode?.journal_mode ?? "").toLowerCase() !== "wal") {
      this.db.prepare("PRAGMA journal_mode = WAL").get();
    }
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec(SCHEMA_SQL);
    this.#runMigrations();
  }

  close() {
    this.db.close();
  }

  recordOperatorSteering({
    kind,
    note,
    source = "user",
    status = "open",
    priority = 2
  }) {
    assertOperatorRecordStatus(status);
    const comparisonKey = normalizeForComparison(`${kind} ${note}`);
    const existing = this.listOperatorSteerings().find(
      (item) => normalizeForComparison(`${item.kind} ${item.note}`) === comparisonKey
    );
    if (existing) {
      if (
        existing.status !== status ||
        existing.kind !== kind ||
        existing.note !== note ||
        existing.source !== source ||
        existing.priority !== priority
      ) {
        const timestamp = nowIso();
        this.db.prepare(
          `UPDATE operator_steerings
           SET kind = ?, note = ?, status = ?, source = ?, priority = ?, updated_at = ?
           WHERE id = ?`
        ).run(kind, note, status, source, priority, timestamp, existing.id);
        this.#indexRecord({
          sourceTable: "operator_steerings",
          sourceId: existing.id,
          lane: "operator",
          title: kind,
          content: note,
          tags: [source, status]
        });
        return this.getOperatorSteering(existing.id);
      }
      return existing;
    }

    const id = randomUUID();
    const timestamp = nowIso();
    this.db.prepare(
      `INSERT INTO operator_steerings
        (id, kind, note, source, status, priority, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, kind, note, source, status, priority, timestamp, timestamp);
    this.#indexRecord({
      sourceTable: "operator_steerings",
      sourceId: id,
      lane: "operator",
      title: kind,
      content: note,
      tags: [source, status]
    });
    return this.getOperatorSteering(id);
  }

  updateOperatorSteeringStatus(idOrKind, status) {
    assertOperatorRecordStatus(status);
    const affected = this.db.prepare(
      `SELECT * FROM operator_steerings
       WHERE id = ? OR kind = ?`
    ).all(idOrKind, idOrKind);
    const timestamp = nowIso();
    const result = this.db.prepare(
      `UPDATE operator_steerings
       SET status = ?, updated_at = ?
       WHERE id = ? OR kind = ?`
    ).run(status, timestamp, idOrKind, idOrKind);
    if (result.changes === 0) {
      throw new Error(`Unknown steering: ${idOrKind}`);
    }
    for (const steering of affected) {
      this.#indexRecord({
        sourceTable: "operator_steerings",
        sourceId: steering.id,
        lane: "operator",
        title: steering.kind,
        content: steering.note,
        tags: [steering.source, status]
      });
    }
    return this.db.prepare(
      `SELECT * FROM operator_steerings WHERE id = ? OR kind = ? ORDER BY updated_at DESC LIMIT 1`
    ).get(idOrKind, idOrKind);
  }

  recordOperatorFailure({
    title,
    details,
    cause = null,
    impact = null,
    status = "open"
  }) {
    assertOperatorRecordStatus(status);
    const comparisonKey = normalizeForComparison(`${title} ${details}`);
    const existing = this.listOperatorFailures().find(
      (item) => normalizeForComparison(`${item.title} ${item.details}`) === comparisonKey
    );
    if (existing) {
      if (
        existing.status !== status ||
        existing.title !== title ||
        existing.details !== details ||
        existing.cause !== cause ||
        existing.impact !== impact
      ) {
        const timestamp = nowIso();
        this.db.prepare(
          `UPDATE operator_failures
           SET title = ?, details = ?, status = ?, cause = ?, impact = ?, updated_at = ?
           WHERE id = ?`
        ).run(title, details, status, cause, impact, timestamp, existing.id);
        this.#indexRecord({
          sourceTable: "operator_failures",
          sourceId: existing.id,
          lane: "operator",
          title,
          content: `${details}\nCause: ${cause ?? "unknown"}\nImpact: ${impact ?? "unknown"}`,
          tags: [status]
        });
        return this.getOperatorFailure(existing.id);
      }
      return existing;
    }

    const id = randomUUID();
    const timestamp = nowIso();
    this.db.prepare(
      `INSERT INTO operator_failures
        (id, title, details, cause, impact, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, title, details, cause, impact, status, timestamp, timestamp);
    this.#indexRecord({
      sourceTable: "operator_failures",
      sourceId: id,
      lane: "operator",
      title,
      content: `${details}\nCause: ${cause ?? "unknown"}\nImpact: ${impact ?? "unknown"}`,
      tags: [status]
    });
    return this.getOperatorFailure(id);
  }

  updateOperatorFailureStatus(idOrTitle, status) {
    assertOperatorRecordStatus(status);
    const affected = this.db.prepare(
      `SELECT * FROM operator_failures
       WHERE id = ? OR title = ?`
    ).all(idOrTitle, idOrTitle);
    const timestamp = nowIso();
    const result = this.db.prepare(
      `UPDATE operator_failures
       SET status = ?, updated_at = ?
       WHERE id = ? OR title = ?`
    ).run(status, timestamp, idOrTitle, idOrTitle);
    if (result.changes === 0) {
      throw new Error(`Unknown failure: ${idOrTitle}`);
    }
    for (const failure of affected) {
      this.#indexRecord({
        sourceTable: "operator_failures",
        sourceId: failure.id,
        lane: "operator",
        title: failure.title,
        content: `${failure.details}\nCause: ${failure.cause ?? "unknown"}\nImpact: ${failure.impact ?? "unknown"}`,
        tags: [status]
      });
    }
    return this.db.prepare(
      `SELECT * FROM operator_failures WHERE id = ? OR title = ? ORDER BY updated_at DESC LIMIT 1`
    ).get(idOrTitle, idOrTitle);
  }

  upsertProjectWorkItem({
    id,
    title,
    lane = "operator",
    owner = "main-agent",
    spec = "",
    status = "proposed",
    riskLevel = "normal",
    requiredReviewTypes = ["research", "code", "qa", "independent"],
    acceptance = []
  }, { allowDoneTransition = false } = {}) {
    assertProjectWorkStatus(status);
    const existing = this.getProjectWorkItem(id);
    if (status === "done" && (!existing || existing.status !== "done") && !allowDoneTransition) {
      throw new Error(
        `Work item ${id} cannot be created or updated to done through the generic upsert path; use the guarded completion flow instead`
      );
    }
    const effectiveStatus =
      existing && status === "proposed" ? existing.status : status;
    const reviewRound =
      existing && shouldStartFreshReviewRound(existing.status, effectiveStatus)
        ? existing.reviewRound + 1
        : existing?.reviewRound ?? 1;
    const timestamp = nowIso();
    this.db.prepare(
      `INSERT INTO project_work_items
        (id, title, lane, owner, spec, status, risk_level, review_round, required_review_types_json, acceptance_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         lane = excluded.lane,
         owner = excluded.owner,
         spec = excluded.spec,
         status = excluded.status,
         risk_level = excluded.risk_level,
         review_round = excluded.review_round,
         required_review_types_json = excluded.required_review_types_json,
         acceptance_json = excluded.acceptance_json,
         updated_at = excluded.updated_at`
    ).run(
      id,
      title,
      lane,
      owner,
      spec,
      effectiveStatus,
      riskLevel,
      reviewRound,
      toJson(requiredReviewTypes),
      toJson(acceptance),
      timestamp,
      timestamp
    );

    this.#indexProjectWorkItem(id);
    return this.getProjectWorkItem(id);
  }

  updateProjectWorkStatus(id, status, { allowDoneTransition = false } = {}) {
    assertProjectWorkStatus(status);
    const current = this.getProjectWorkItem(id);
    if (!current) {
      throw new Error(`Unknown work item: ${id}`);
    }
    if (status === "proposed" && current.status !== "proposed") {
      throw new Error(
        `Work item ${id} cannot move back to proposed after work has started`
      );
    }
    if (status === "done" && !allowDoneTransition) {
      throw new Error(
        `Work item ${id} cannot be marked done through the generic status path; use the guarded completion flow instead`
      );
    }
    if (status === "in_progress") {
      const blocking = this.db.prepare(
        `SELECT id FROM project_work_items
         WHERE status = 'changes_requested' AND id != ?
         LIMIT 1`
      ).get(id);
      if (blocking) {
        throw new Error(
          `Cannot start ${id} while ${blocking.id} is still marked changes_requested`
        );
      }
    }

    const timestamp = nowIso();
    const nextRound =
      shouldStartFreshReviewRound(current.status, status)
        ? current.reviewRound + 1
        : current.reviewRound;
    const result = this.db.prepare(
      `UPDATE project_work_items
       SET status = ?, review_round = ?, updated_at = ?
       WHERE id = ?`
    ).run(status, nextRound, timestamp, id);
    if (result.changes === 0) {
      throw new Error(`Unknown work item: ${id}`);
    }
    this.#indexProjectWorkItem(id);
    return this.getProjectWorkItem(id);
  }

  registerReviewerIdentity({
    agentId,
    displayName,
    reviewerKind = "subagent",
    status = "active"
  }) {
    assertReviewerIdentityStatus(status);
    if (reviewerKind !== "subagent") {
      throw new Error(`Unsupported reviewer identity kind: ${reviewerKind}`);
    }
    if (!SUBAGENT_AGENT_ID_PATTERN.test(String(agentId ?? ""))) {
      throw new Error(
        `Reviewer agent id must be a UUID-like subagent id. Received: ${agentId}`
      );
    }
    if (!String(displayName ?? "").trim()) {
      throw new Error("Reviewer display name is required.");
    }

    const reviewerKey = reviewerKeyFromAgentId(agentId);
    const timestamp = nowIso();
    this.db.prepare(
      `INSERT INTO reviewer_identities
        (reviewer_key, reviewer_kind, agent_id, display_name, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(reviewer_key) DO UPDATE SET
         reviewer_kind = excluded.reviewer_kind,
         agent_id = excluded.agent_id,
         display_name = excluded.display_name,
         status = excluded.status,
         updated_at = excluded.updated_at`
    ).run(reviewerKey, reviewerKind, agentId, displayName.trim(), status, timestamp, timestamp);

    return this.getReviewerIdentity(reviewerKey);
  }

  updateReviewerIdentityStatus(reviewerKeyOrAgentId, status) {
    assertReviewerIdentityStatus(status);
    const timestamp = nowIso();
    const reviewerKey = this.#coerceReviewerKey(reviewerKeyOrAgentId);
    const result = this.db.prepare(
      `UPDATE reviewer_identities
       SET status = ?, updated_at = ?
       WHERE reviewer_key = ? OR agent_id = ?`
    ).run(status, timestamp, reviewerKey, reviewerKeyOrAgentId);
    if (result.changes === 0) {
      throw new Error(`Unknown reviewer identity: ${reviewerKeyOrAgentId}`);
    }
    return this.getReviewerIdentity(reviewerKeyOrAgentId);
  }

  recordProjectReview({
    workItemId,
    reviewType,
    reviewer = "agent",
    verdict,
    notes,
    findings = []
  }) {
    const workItem = this.getProjectWorkItem(workItemId);
    let reviewerIdentity = null;
    if (!workItem) {
      throw new Error(`Unknown work item: ${workItemId}`);
    }
    if (workItem.status === "proposed") {
      throw new Error(
        `Cannot record review for ${workItemId} while it is proposed; move it to in_progress first`
      );
    }
    if (workItem.status === "done" || workItem.status === "cancelled") {
      throw new Error(
        `Cannot record review for ${workItemId} while it is ${workItem.status}`
      );
    }
    if (reviewType === "independent" && reviewer === workItem.owner) {
      throw new Error(
        `Independent review for ${workItemId} must come from someone other than ${workItem.owner}`
      );
    }
    if (reviewType === "independent" && !reviewer.startsWith("subagent:")) {
      throw new Error(
        `Independent review for ${workItemId} must name a subagent reviewer`
      );
    }
    if (reviewType === "independent") {
      reviewerIdentity = this.getReviewerIdentity(reviewer);
      if (!reviewerIdentity) {
        throw new Error(
          `Independent review for ${workItemId} must use a registered reviewer identity`
        );
      }
      if (reviewerIdentity.status !== "active") {
        throw new Error(
          `Independent review for ${workItemId} must use an active reviewer identity`
        );
      }
    }
    if (workItem.status === "changes_requested" && verdict === "pass") {
      throw new Error(
        `Cannot record passing review for ${workItemId} while it is changes_requested; resume the work first to start a fresh review round`
      );
    }

    const id = randomUUID();
    const createdAt = nowIso();
    this.db.prepare(
      `INSERT INTO project_reviews
        (
          id,
          work_item_id,
          review_type,
          reviewer,
          reviewer_display_name,
          reviewer_identity_status,
          reviewer_registered,
          verdict,
          notes,
          findings_json,
          review_round,
          created_at
        )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      workItemId,
      reviewType,
      reviewer,
      reviewerIdentity?.display_name ?? null,
      reviewerIdentity?.status ?? null,
      reviewerIdentity ? 1 : 0,
      verdict,
      notes,
      toJson(findings),
      workItem.reviewRound,
      createdAt
    );

    if (verdict === "fail") {
      this.updateProjectWorkStatus(workItemId, "changes_requested");
    }

    this.#indexRecord({
      sourceTable: "project_reviews",
      sourceId: id,
      lane: "operator",
      title: `${workItemId}:${reviewType}:${verdict}`,
      content: notes,
      tags: [reviewType, verdict, reviewer]
    });

    return this.getProjectReview(id);
  }

  completeProjectWorkItem(id) {
    const workItem = this.getProjectWorkItem(id);
    if (!workItem) {
      throw new Error(`Unknown work item: ${id}`);
    }
    if (workItem.status === "proposed") {
      throw new Error(
        `Work item ${id} cannot be completed while it is still proposed; move it to in_progress first`
      );
    }
    if (workItem.status !== "in_progress" && workItem.status !== "changes_requested") {
      throw new Error(
        `Work item ${id} cannot be completed from status ${workItem.status}`
      );
    }
    if (workItem.status === "changes_requested") {
      throw new Error(
        `Work item ${id} cannot be completed while it is still marked changes_requested`
      );
    }

    const reviews = this.listProjectReviews(id).filter(
      (review) => review.reviewRound === workItem.reviewRound
    );
    const latestByType = new Map();
    for (const review of reviews) {
      latestByType.set(review.reviewType, review);
    }

    const missing = [];
    const failing = [];
    for (const reviewType of workItem.requiredReviewTypes) {
      const latest = latestByType.get(reviewType);
      if (!latest) {
        missing.push(reviewType);
        continue;
      }
      if (latest.verdict !== "pass") {
        failing.push(reviewType);
      }
    }

    if (missing.length > 0 || failing.length > 0) {
      const parts = [];
      if (missing.length > 0) {
        parts.push(`missing reviews: ${missing.join(", ")}`);
      }
      if (failing.length > 0) {
        parts.push(`non-passing reviews: ${failing.join(", ")}`);
      }
      throw new Error(`Work item ${id} cannot be completed; ${parts.join("; ")}`);
    }

    return this.updateProjectWorkStatus(id, "done", { allowDoneTransition: true });
  }

  upsertWorldEntity({
    id,
    kind,
    name,
    status = "active",
    profile = {}
  }) {
    const timestamp = nowIso();
    this.db.prepare(
      `INSERT INTO world_entities (id, kind, name, status, profile_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind,
         name = excluded.name,
         status = excluded.status,
         profile_json = excluded.profile_json,
         updated_at = excluded.updated_at`
    ).run(id, kind, name, status, toJson(profile), timestamp, timestamp);

    return this.getWorldEntity(id);
  }

  appendWorldEvent({
    eventType,
    summary,
    payload = {},
    occurredAt = nowIso(),
    reviewStatus = "pending",
    importance = 0.5,
    entityLinks = []
  }) {
    const id = randomUUID();
    const recordedAt = nowIso();
    const insertEvent = this.db.prepare(
      `INSERT INTO world_events
        (id, event_type, summary, payload_json, occurred_at, recorded_at, review_status, importance)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertLink = this.db.prepare(
      `INSERT INTO world_event_entities (event_id, entity_id, role)
       VALUES (?, ?, ?)`
    );
    const insertReview = this.db.prepare(
      `INSERT INTO review_queue
        (id, source_table, source_id, severity, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    this.db.exec("BEGIN");
    try {
      insertEvent.run(
        id,
        eventType,
        summary,
        toJson(payload),
        occurredAt,
        recordedAt,
        reviewStatus,
        importance
      );

      for (const link of entityLinks) {
        insertLink.run(id, link.entityId, link.role ?? "mentioned");
      }

      if (reviewStatus !== "approved") {
        const reviewId = randomUUID();
        insertReview.run(
          reviewId,
          "world_events",
          id,
          importance >= 0.8 ? "high" : "normal",
          "Canon event awaits review before it should alter live projections.",
          "open",
          recordedAt,
          recordedAt
        );
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }

    this.#indexRecord({
      sourceTable: "world_events",
      sourceId: id,
      lane: "world",
      title: eventType,
      content: summary,
      tags: [reviewStatus]
    });
    return this.getWorldEvent(id);
  }

  recordWorldMemory({
    entityId = null,
    memoryScope,
    memoryType,
    truthStatus = "belief",
    content,
    tags = [],
    sourceEventId = null,
    importance = 0.5,
    confidence = 1
  }) {
    const id = randomUUID();
    const timestamp = nowIso();
    this.db.prepare(
      `INSERT INTO world_memories
        (id, entity_id, memory_scope, memory_type, truth_status, content, tags_json, source_event_id, importance, confidence, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      entityId,
      memoryScope,
      memoryType,
      truthStatus,
      content,
      toJson(tags),
      sourceEventId,
      importance,
      confidence,
      timestamp,
      timestamp
    );

    this.#indexRecord({
      sourceTable: "world_memories",
      sourceId: id,
      lane: "world",
      title: memoryType,
      content,
      tags: [memoryScope, truthStatus, ...tags]
    });
    return this.getWorldMemory(id);
  }

  search(query, { lane = "all", limit = 10 } = {}) {
    const safeQuery = query.trim();
    if (!safeQuery) {
      return [];
    }

    const statement =
      lane === "all"
        ? this.db.prepare(
            `SELECT source_table, source_id, lane, title, content, tags
             FROM memory_search
             WHERE memory_search MATCH ?
             ORDER BY rank
             LIMIT ?`
          )
        : this.db.prepare(
            `SELECT source_table, source_id, lane, title, content, tags
             FROM memory_search
             WHERE lane = ? AND memory_search MATCH ?
             ORDER BY rank
             LIMIT ?`
          );

    const rows =
      lane === "all"
        ? statement.all(safeQuery, limit)
        : statement.all(lane, safeQuery, limit);

    return rows.map((row) => ({
      ...row,
      tags: row.tags ? row.tags.split(",").filter(Boolean) : []
    }));
  }

  buildOperatorBrief(limit = 8) {
    const steerings = this.db.prepare(
      `SELECT kind, note, priority, created_at
       FROM operator_steerings
       WHERE status = 'open'
       ORDER BY priority DESC, updated_at DESC, created_at DESC
       LIMIT ?`
    ).all(limit);
    const failures = this.db.prepare(
      `SELECT title, details, created_at, updated_at
       FROM operator_failures
       WHERE status = 'open'
       ORDER BY
         updated_at DESC,
         CASE WHEN updated_at != created_at THEN 1 ELSE 0 END DESC,
         created_at DESC
       LIMIT ?`
    ).all(limit);
    const workItems = this.db.prepare(
      `SELECT id, title, status, risk_level, review_round
       FROM project_work_items
       WHERE status NOT IN ('done', 'cancelled')
       ORDER BY updated_at DESC
       LIMIT ?`
    ).all(limit);
    const memoryAudit = this.auditOperatorMemory();

    const lines = [
      "Operator Memory Brief",
      ""
    ];

    lines.push(
      "Open steerings:"
    );

    if (steerings.length === 0) {
      lines.push("- none");
    } else {
      for (const steering of steerings) {
        lines.push(`- [P${steering.priority}] ${steering.kind}: ${steering.note}`);
      }
    }

    lines.push("", "Open failures:");
    if (failures.length === 0) {
      lines.push("- none");
    } else {
      for (const failure of failures) {
        lines.push(`- ${failure.title}: ${failure.details}`);
      }
    }

    lines.push("", "Open work:");
    if (workItems.length === 0) {
      lines.push("- none");
    } else {
      for (const item of workItems) {
        lines.push(
          `- [${item.status}] ${item.id} (${item.risk_level}, review round ${item.review_round}): ${item.title}`
        );
      }
    }

    lines.push("", "Memory hygiene:");
    lines.push(`- exact duplicates: ${memoryAudit.summary.exactDuplicates}`);
    lines.push(`- likely duplicates: ${memoryAudit.summary.likelyDuplicates}`);
    lines.push(
      `- stale open records (> ${memoryAudit.summary.staleDays} days): ${memoryAudit.summary.staleOpenRecords}`
    );
    for (const item of memoryAudit.staleOpenRecords.slice(0, 3)) {
      lines.push(`- stale ${item.lane}: ${item.label} (${item.ageDays} days old)`);
    }

    return this.#storeContextPack({
      packKind: "operator_brief",
      content: lines.join("\n"),
      inputs: { limit }
    });
  }

  buildEntityBrief(entityId, limit = 10) {
    const entity = this.getWorldEntity(entityId);
    if (!entity) {
      throw new Error(`Unknown entity: ${entityId}`);
    }

    const memories = this.db.prepare(
      `SELECT memory_type, truth_status, content, importance, confidence
       FROM world_memories
       WHERE entity_id = ?
       ORDER BY importance DESC, updated_at DESC
       LIMIT ?`
    ).all(entityId, limit);
    const events = this.db.prepare(
      `SELECT we.event_type, we.summary, we.occurred_at
       FROM world_events we
       JOIN world_event_entities wee ON wee.event_id = we.id
       WHERE wee.entity_id = ?
       ORDER BY we.occurred_at DESC
       LIMIT ?`
    ).all(entityId, limit);

    const lines = [
      `Entity Brief: ${entity.name} (${entity.kind})`,
      "",
      "Profile:",
      `- status: ${entity.status}`,
      `- traits: ${Object.keys(entity.profile).length === 0 ? "none recorded" : JSON.stringify(entity.profile)}`,
      "",
      "Top memories:"
    ];

    if (memories.length === 0) {
      lines.push("- none");
    } else {
      for (const memory of memories) {
        lines.push(
          `- [${memory.truth_status}] ${memory.memory_type}: ${memory.content} (importance ${memory.importance}, confidence ${memory.confidence})`
        );
      }
    }

    lines.push("", "Recent events:");
    if (events.length === 0) {
      lines.push("- none");
    } else {
      for (const event of events) {
        lines.push(`- ${event.occurred_at}: ${event.event_type} - ${event.summary}`);
      }
    }

    return this.#storeContextPack({
      packKind: "entity_brief",
      targetId: entityId,
      content: lines.join("\n"),
      inputs: { limit }
    });
  }

  listReviewQueue() {
    return this.db.prepare(
      `SELECT id, source_table, source_id, severity, reason, status, created_at
       FROM review_queue
       ORDER BY created_at DESC`
    ).all();
  }

  listProjectWorkItems() {
    return this.db.prepare(
      `SELECT * FROM project_work_items
       ORDER BY updated_at DESC, created_at DESC`
    ).all().map((row) => ({
      ...row,
      reviewRound: row.review_round ?? 1,
      requiredReviewTypes: parseJson(row.required_review_types_json, []),
      acceptance: parseJson(row.acceptance_json, [])
    }));
  }

  listProjectReviews(workItemId = null) {
    const rows = workItemId
      ? this.db.prepare(
          `SELECT * FROM project_reviews
           WHERE work_item_id = ?
           ORDER BY created_at ASC`
        ).all(workItemId)
      : this.db.prepare(
          `SELECT * FROM project_reviews
           ORDER BY created_at ASC`
        ).all();

    return rows.map((row) => ({
      ...row,
      reviewType: row.review_type,
      workItemId: row.work_item_id,
      reviewRound: row.review_round ?? 1,
      reviewerDisplayName: row.reviewer_display_name ?? null,
      reviewerIdentityStatus: row.reviewer_identity_status ?? null,
      reviewerRegistered: Boolean(row.reviewer_registered),
      findings: parseJson(row.findings_json, [])
    }));
  }

  listReviewerIdentities(status = null) {
    const rows = status
      ? this.db.prepare(
          `SELECT * FROM reviewer_identities
           WHERE status = ?
           ORDER BY updated_at DESC, created_at DESC`
        ).all(status)
      : this.db.prepare(
          `SELECT * FROM reviewer_identities
           ORDER BY updated_at DESC, created_at DESC`
        ).all();
    return rows;
  }

  listOperatorSteerings(status = null) {
    const rows = status
      ? this.db.prepare(
          `SELECT * FROM operator_steerings WHERE status = ? ORDER BY priority DESC, created_at DESC`
        ).all(status)
      : this.db.prepare(
          `SELECT * FROM operator_steerings ORDER BY priority DESC, created_at DESC`
        ).all();
    return rows;
  }

  listOperatorFailures(status = null) {
    const rows = status
      ? this.db.prepare(
          `SELECT * FROM operator_failures WHERE status = ? ORDER BY created_at DESC`
        ).all(status)
      : this.db.prepare(
          `SELECT * FROM operator_failures ORDER BY created_at DESC`
        ).all();
    return rows;
  }

  auditOperatorMemory({ staleDays = 14 } = {}) {
    const steerings = this.listOperatorSteerings("open").map((item) => ({
      lane: "steering",
      id: item.id,
      label: item.kind,
      text: `${item.kind} ${item.note}`,
      updatedAt: item.updated_at ?? item.created_at
    }));
    const failures = this.listOperatorFailures("open").map((item) => ({
      lane: "failure",
      id: item.id,
      label: item.title,
      text: `${item.title} ${item.details}`,
      updatedAt: item.updated_at ?? item.created_at
    }));
    const rows = [...steerings, ...failures];
    const exactDuplicates = [];
    const likelyDuplicates = [];
    const staleOpenRecords = [];
    const exactSeen = new Set();
    const likelySeen = new Set();
    const staleCutoffDays = Math.max(1, staleDays);

    for (let index = 0; index < rows.length; index += 1) {
      const left = rows[index];
      const ageDays = daysOld(left.updatedAt);
      if (ageDays !== null && ageDays > staleCutoffDays) {
        staleOpenRecords.push({
          lane: left.lane,
          id: left.id,
          label: left.label,
          ageDays,
          updatedAt: left.updatedAt
        });
      }
      const leftKey = normalizeForComparison(left.text);
      for (let otherIndex = index + 1; otherIndex < rows.length; otherIndex += 1) {
        const right = rows[otherIndex];
        const rightKey = normalizeForComparison(right.text);
        if (!leftKey || !rightKey) {
          continue;
        }

        const pairKey = [left.id, right.id].sort().join(":");
        if (leftKey === rightKey && !exactSeen.has(pairKey)) {
          exactSeen.add(pairKey);
          exactDuplicates.push({
            similarity: 1,
            items: [left, right]
          });
          continue;
        }

        const similarity = jaccardSimilarity(left.text, right.text);
        const sameLabel = normalizeForComparison(left.label) === normalizeForComparison(right.label);
        const leftNumbers = numericTokens(left.text);
        const rightNumbers = numericTokens(right.text);
        const hasConflictingNumbers =
          leftNumbers.size > 0 &&
          rightNumbers.size > 0 &&
          [...leftNumbers].every((token) => !rightNumbers.has(token));

        if (hasConflictingNumbers && similarity < 0.9) {
          continue;
        }

        if ((similarity >= 0.72 || (sameLabel && similarity >= 0.55)) && !likelySeen.has(pairKey)) {
          likelySeen.add(pairKey);
          likelyDuplicates.push({
            similarity: Number(similarity.toFixed(2)),
            items: [left, right]
          });
        }
      }
    }

    return {
      summary: {
        exactDuplicates: exactDuplicates.length,
        likelyDuplicates: likelyDuplicates.length,
        staleOpenRecords: staleOpenRecords.length,
        staleDays: staleCutoffDays
      },
      exactDuplicates,
      likelyDuplicates,
      staleOpenRecords: staleOpenRecords.sort((left, right) => right.ageDays - left.ageDays)
    };
  }

  getOperatorSteering(id) {
    return this.db.prepare(
      `SELECT * FROM operator_steerings WHERE id = ?`
    ).get(id);
  }

  getOperatorFailure(id) {
    return this.db.prepare(
      `SELECT * FROM operator_failures WHERE id = ?`
    ).get(id);
  }

  getProjectWorkItem(id) {
    const row = this.db.prepare(
      `SELECT * FROM project_work_items WHERE id = ?`
    ).get(id);
    if (!row) {
      return null;
    }
    return {
      ...row,
      reviewRound: row.review_round ?? 1,
      requiredReviewTypes: parseJson(row.required_review_types_json, []),
      acceptance: parseJson(row.acceptance_json, [])
    };
  }

  getProjectReview(id) {
    const row = this.db.prepare(
      `SELECT * FROM project_reviews WHERE id = ?`
    ).get(id);
    if (!row) {
      return null;
    }
    return {
      ...row,
      reviewType: row.review_type,
      workItemId: row.work_item_id,
      reviewRound: row.review_round ?? 1,
      reviewerDisplayName: row.reviewer_display_name ?? null,
      reviewerIdentityStatus: row.reviewer_identity_status ?? null,
      reviewerRegistered: Boolean(row.reviewer_registered),
      findings: parseJson(row.findings_json, [])
    };
  }

  getReviewerIdentity(reviewerKeyOrAgentId) {
    const reviewerKey = this.#coerceReviewerKey(reviewerKeyOrAgentId);
    return this.db.prepare(
      `SELECT * FROM reviewer_identities
       WHERE reviewer_key = ? OR agent_id = ?
       ORDER BY updated_at DESC
       LIMIT 1`
    ).get(reviewerKey, reviewerKeyOrAgentId);
  }

  exportReviewLedger() {
    const workItems = this.listProjectWorkItems();
    return {
      generatedAt: nowIso(),
      workItems: workItems.map((item) => ({
        id: item.id,
        title: item.title,
        lane: item.lane,
        owner: item.owner,
        status: item.status,
        riskLevel: item.risk_level,
        reviewRound: item.reviewRound,
        requiredReviewTypes: item.requiredReviewTypes,
        acceptance: item.acceptance,
        reviews: this.listProjectReviews(item.id).map((review) => {
          return {
            reviewType: review.reviewType,
            reviewer: review.reviewer,
            reviewerDisplayName: review.reviewerDisplayName ?? null,
            reviewerIdentityStatus: review.reviewerIdentityStatus ?? null,
            reviewerRegistered: Boolean(review.reviewerRegistered),
            verdict: review.verdict,
            notes: review.notes,
            reviewRound: review.reviewRound,
            createdAt: review.created_at
          };
        })
      }))
    };
  }

  getWorldEntity(id) {
    const row = this.db.prepare(
      `SELECT * FROM world_entities WHERE id = ?`
    ).get(id);
    if (!row) {
      return null;
    }
    return {
      ...row,
      profile: parseJson(row.profile_json, {})
    };
  }

  getWorldEvent(id) {
    const row = this.db.prepare(
      `SELECT * FROM world_events WHERE id = ?`
    ).get(id);
    if (!row) {
      return null;
    }
    return {
      ...row,
      payload: parseJson(row.payload_json, {})
    };
  }

  getWorldMemory(id) {
    const row = this.db.prepare(
      `SELECT * FROM world_memories WHERE id = ?`
    ).get(id);
    if (!row) {
      return null;
    }
    return {
      ...row,
      tags: parseJson(row.tags_json, [])
    };
  }

  #indexRecord({ sourceTable, sourceId, lane, title, content, tags }) {
    this.db.prepare(
      `DELETE FROM memory_search WHERE source_table = ? AND source_id = ?`
    ).run(sourceTable, sourceId);
    this.db.prepare(
      `INSERT INTO memory_search (source_table, source_id, lane, title, content, tags)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(sourceTable, sourceId, lane, title, content, tags.join(","));
  }

  #indexProjectWorkItem(id) {
    const item = this.getProjectWorkItem(id);
    if (!item) {
      return;
    }
    this.#indexRecord({
      sourceTable: "project_work_items",
      sourceId: item.id,
      lane: "operator",
      title: item.title,
      content: `${item.spec}\nAcceptance: ${item.acceptance.join("; ")}\nReview round: ${item.reviewRound}`,
      tags: [item.lane, item.status, item.risk_level, `round:${item.reviewRound}`, ...item.requiredReviewTypes]
    });
  }

  #coerceReviewerKey(reviewerKeyOrAgentId) {
    const value = String(reviewerKeyOrAgentId ?? "").trim();
    if (value.startsWith("subagent:")) {
      return value;
    }
    if (SUBAGENT_AGENT_ID_PATTERN.test(value)) {
      return reviewerKeyFromAgentId(value);
    }
    return value;
  }

  #storeContextPack({ packKind, targetId = null, content, inputs }) {
    const id = randomUUID();
    const createdAt = nowIso();
    this.db.prepare(
      `INSERT INTO context_packs (id, pack_kind, target_id, content, inputs_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, packKind, targetId, content, toJson(inputs), createdAt);
    return { id, packKind, targetId, content, createdAt };
  }

  #runMigrations() {
    this.#ensureColumn(
      "project_work_items",
      "owner",
      "TEXT NOT NULL DEFAULT 'main-agent'"
    );
    this.#ensureColumn(
      "project_work_items",
      "review_round",
      "INTEGER NOT NULL DEFAULT 1"
    );
    this.#ensureColumn(
      "project_reviews",
      "review_round",
      "INTEGER NOT NULL DEFAULT 1"
    );
    this.#ensureColumn(
      "project_reviews",
      "reviewer_display_name",
      "TEXT"
    );
    this.#ensureColumn(
      "project_reviews",
      "reviewer_identity_status",
      "TEXT"
    );
    this.#ensureColumn(
      "project_reviews",
      "reviewer_registered",
      "INTEGER NOT NULL DEFAULT 0"
    );

    this.db.prepare(
      `UPDATE project_work_items
       SET review_round = 1
       WHERE review_round IS NULL OR review_round < 1`
    ).run();
    this.db.prepare(
      `UPDATE project_reviews
       SET review_round = 1
       WHERE review_round IS NULL OR review_round < 1`
    ).run();

    const itemsNeedingIndependent = this.db.prepare(
      `SELECT id, required_review_types_json
       FROM project_work_items
       WHERE status != 'done'`
    ).all();

    const update = this.db.prepare(
      `UPDATE project_work_items
       SET required_review_types_json = ?, updated_at = ?
       WHERE id = ?`
    );

    for (const item of itemsNeedingIndependent) {
      const reviewTypes = parseJson(item.required_review_types_json, []);
      if (reviewTypes.includes("independent")) {
        continue;
      }
      reviewTypes.push("independent");
      update.run(JSON.stringify(reviewTypes), nowIso(), item.id);
    }

    this.#seedLegacyReviewerIdentities();
    this.#backfillReviewerSnapshots();
  }

  #ensureColumn(tableName, columnName, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = columns.some((column) => column.name === columnName);
    if (!exists) {
      try {
        this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
      } catch (error) {
        if (!String(error.message).includes("duplicate column name")) {
          throw error;
        }
      }
    }
  }

  #seedLegacyReviewerIdentities() {
    const reviews = this.db.prepare(
      `SELECT DISTINCT reviewer
      FROM project_reviews
      WHERE review_type = 'independent'
         AND reviewer LIKE 'subagent:%'`
    ).all();
    const insert = this.db.prepare(
      `INSERT OR IGNORE INTO reviewer_identities
        (reviewer_key, reviewer_kind, agent_id, display_name, status, created_at, updated_at)
       VALUES (?, 'subagent', ?, ?, 'legacy', ?, ?)`
    );

    for (const review of reviews) {
      const reviewerKey = String(review.reviewer);
      const agentId = reviewerKey.replace(/^subagent:/, "");
      if (!agentId) {
        continue;
      }
      const timestamp = nowIso();
      insert.run(reviewerKey, agentId, agentId, timestamp, timestamp);
    }
  }

  #backfillReviewerSnapshots() {
    const reviews = this.db.prepare(
      `SELECT id, reviewer
       FROM project_reviews
       WHERE review_type = 'independent'
         AND (
           reviewer_registered IS NULL OR reviewer_registered = 0 OR
           reviewer_identity_status IS NULL OR reviewer_display_name IS NULL
         )`
    ).all();
    const update = this.db.prepare(
      `UPDATE project_reviews
       SET reviewer_display_name = ?, reviewer_identity_status = ?, reviewer_registered = ?
       WHERE id = ?`
    );

    for (const review of reviews) {
      const identity = this.getReviewerIdentity(review.reviewer);
      if (!identity) {
        continue;
      }
      update.run(identity.display_name, identity.status, 1, review.id);
    }
  }
}

export function createMemoryStore(dbPath) {
  return new MemoryStore(dbPath);
}

function resolveDefaultDbPath(dbPath) {
  const resolved = resolve(dbPath);
  if (resolved === DEFAULT_OPERATOR_DB_PATH) {
    bootstrapOperatorDbFromLegacy();
  }
  return resolved;
}

export { DEFAULT_OPERATOR_DB_PATH, DEFAULT_WORLD_DB_PATH, LEGACY_OPERATOR_DB_PATH };
