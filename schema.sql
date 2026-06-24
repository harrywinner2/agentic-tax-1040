-- D1 schema. Sessions hold the full conversation state + transcript; trace
-- events are normalized so the observability endpoint can query them directly.

CREATE TABLE IF NOT EXISTS sessions (
  session_id    TEXT PRIMARY KEY,
  state_json    TEXT NOT NULL,
  messages_json TEXT NOT NULL,
  turn          INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS trace_events (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id        TEXT NOT NULL,
  turn              INTEGER NOT NULL,
  seq               INTEGER NOT NULL,
  type              TEXT NOT NULL,
  label             TEXT NOT NULL,
  status            TEXT,
  latency_ms        REAL,
  cost_usd          REAL,
  prompt_tokens     INTEGER,
  completion_tokens INTEGER,
  provider          TEXT,
  model             TEXT,
  detail            TEXT,
  ts                INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trace_session ON trace_events (session_id, turn, seq);
