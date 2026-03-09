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
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
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
    const existing = this.db.prepare(
      `SELECT id FROM operator_steerings WHERE kind = ? AND note = ?`
    ).get(kind, note);
    if (existing) {
      return this.getOperatorSteering(existing.id);
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

  recordOperatorFailure({
    title,
    details,
    cause = null,
    impact = null,
    status = "open"
  }) {
    const existing = this.db.prepare(
      `SELECT id FROM operator_failures WHERE title = ? AND details = ?`
    ).get(title, details);
    if (existing) {
      return this.getOperatorFailure(existing.id);
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
  }) {
    const timestamp = nowIso();
    this.db.prepare(
      `INSERT INTO project_work_items
        (id, title, lane, owner, spec, status, risk_level, required_review_types_json, acceptance_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         lane = excluded.lane,
         owner = excluded.owner,
         spec = excluded.spec,
         status = excluded.status,
         risk_level = excluded.risk_level,
         required_review_types_json = excluded.required_review_types_json,
         acceptance_json = excluded.acceptance_json,
         updated_at = excluded.updated_at`
    ).run(
      id,
      title,
      lane,
      owner,
      spec,
      status,
      riskLevel,
      toJson(requiredReviewTypes),
      toJson(acceptance),
      timestamp,
      timestamp
    );

    this.#indexProjectWorkItem(id);
    return this.getProjectWorkItem(id);
  }

  updateProjectWorkStatus(id, status) {
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
    const result = this.db.prepare(
      `UPDATE project_work_items
       SET status = ?, updated_at = ?
       WHERE id = ?`
    ).run(status, timestamp, id);
    if (result.changes === 0) {
      throw new Error(`Unknown work item: ${id}`);
    }
    this.#indexProjectWorkItem(id);
    return this.getProjectWorkItem(id);
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
    if (!workItem) {
      throw new Error(`Unknown work item: ${workItemId}`);
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

    const id = randomUUID();
    const createdAt = nowIso();
    this.db.prepare(
      `INSERT INTO project_reviews
        (id, work_item_id, review_type, reviewer, verdict, notes, findings_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      workItemId,
      reviewType,
      reviewer,
      verdict,
      notes,
      toJson(findings),
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

    const reviews = this.listProjectReviews(id);
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

    return this.updateProjectWorkStatus(id, "done");
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
       ORDER BY priority DESC, created_at DESC
       LIMIT ?`
    ).all(limit);
    const failures = this.db.prepare(
      `SELECT title, details, created_at
       FROM operator_failures
       WHERE status = 'open'
       ORDER BY created_at DESC
       LIMIT ?`
    ).all(limit);
    const workItems = this.db.prepare(
      `SELECT id, title, status, risk_level
       FROM project_work_items
       WHERE status != 'done'
       ORDER BY updated_at DESC
       LIMIT ?`
    ).all(limit);

    const lines = [
      "Operator Memory Brief",
      "",
      "Open steerings:"
    ];

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
        lines.push(`- [${item.status}] ${item.id} (${item.risk_level}): ${item.title}`);
      }
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
      findings: parseJson(row.findings_json, [])
    }));
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
      findings: parseJson(row.findings_json, [])
    };
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
        requiredReviewTypes: item.requiredReviewTypes,
        acceptance: item.acceptance,
        reviews: this.listProjectReviews(item.id).map((review) => ({
          reviewType: review.reviewType,
          reviewer: review.reviewer,
          verdict: review.verdict,
          notes: review.notes,
          createdAt: review.created_at
        }))
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
      content: `${item.spec}\nAcceptance: ${item.acceptance.join("; ")}`,
      tags: [item.lane, item.status, item.risk_level, ...item.requiredReviewTypes]
    });
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
  }

  #ensureColumn(tableName, columnName, definition) {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all();
    const exists = columns.some((column) => column.name === columnName);
    if (!exists) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
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
