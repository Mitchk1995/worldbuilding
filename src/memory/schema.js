export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS operator_steerings (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  note TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'open',
  priority INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operator_failures (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  details TEXT NOT NULL,
  cause TEXT,
  impact TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_work_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  lane TEXT NOT NULL DEFAULT 'operator',
  owner TEXT NOT NULL DEFAULT 'main-agent',
  spec TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'proposed',
  risk_level TEXT NOT NULL DEFAULT 'normal',
  review_round INTEGER NOT NULL DEFAULT 1,
  required_review_types_json TEXT NOT NULL DEFAULT '["research","code","qa","independent"]',
  acceptance_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_reviews (
  id TEXT PRIMARY KEY,
  work_item_id TEXT NOT NULL REFERENCES project_work_items(id) ON DELETE CASCADE,
  review_type TEXT NOT NULL,
  reviewer TEXT NOT NULL DEFAULT 'agent',
  reviewer_display_name TEXT,
  reviewer_identity_status TEXT,
  reviewer_registered INTEGER NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL,
  notes TEXT NOT NULL,
  findings_json TEXT NOT NULL DEFAULT '[]',
  review_round INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviewer_identities (
  reviewer_key TEXT PRIMARY KEY,
  reviewer_kind TEXT NOT NULL DEFAULT 'subagent',
  agent_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_entities (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  profile_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS world_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'pending',
  importance REAL NOT NULL DEFAULT 0.5
);

CREATE TABLE IF NOT EXISTS world_event_entities (
  event_id TEXT NOT NULL REFERENCES world_events(id) ON DELETE CASCADE,
  entity_id TEXT NOT NULL REFERENCES world_entities(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'mentioned',
  PRIMARY KEY (event_id, entity_id, role)
);

CREATE TABLE IF NOT EXISTS world_memories (
  id TEXT PRIMARY KEY,
  entity_id TEXT REFERENCES world_entities(id) ON DELETE CASCADE,
  memory_scope TEXT NOT NULL,
  memory_type TEXT NOT NULL,
  truth_status TEXT NOT NULL DEFAULT 'belief',
  content TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_event_id TEXT REFERENCES world_events(id) ON DELETE SET NULL,
  importance REAL NOT NULL DEFAULT 0.5,
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_queue (
  id TEXT PRIMARY KEY,
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'normal',
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS context_packs (
  id TEXT PRIMARY KEY,
  pack_kind TEXT NOT NULL,
  target_id TEXT,
  content TEXT NOT NULL,
  inputs_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_search USING fts5(
  source_table UNINDEXED,
  source_id UNINDEXED,
  lane UNINDEXED,
  title,
  content,
  tags
);
`;
