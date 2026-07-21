PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS conversations (
  conversation_id TEXT PRIMARY KEY, transport TEXT NOT NULL, room_id TEXT NOT NULL,
  thread_root_event_id TEXT NOT NULL, agent_id TEXT NOT NULL, pi_session_id TEXT,
  status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  UNIQUE(transport, room_id, thread_root_event_id)
);
CREATE TABLE IF NOT EXISTS requests (
  request_id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
  source_event_id TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL,
  started_at INTEGER, completed_at INTEGER, error_code TEXT
);
CREATE INDEX IF NOT EXISTS requests_queue ON requests(status, created_at);
CREATE TABLE IF NOT EXISTS inbound_events (
  transport TEXT NOT NULL, event_id TEXT NOT NULL, processed_at INTEGER NOT NULL,
  request_id TEXT REFERENCES requests(request_id), PRIMARY KEY(transport, event_id)
);
CREATE TABLE IF NOT EXISTS outbound_deliveries (
  delivery_id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES requests(request_id),
  transport TEXT NOT NULL, destination TEXT NOT NULL, thread_id TEXT, transaction_id TEXT NOT NULL,
  status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL,
  encrypted_payload TEXT NOT NULL, UNIQUE(transport, transaction_id)
);
CREATE INDEX IF NOT EXISTS deliveries_due ON outbound_deliveries(status, next_attempt_at);
CREATE TABLE IF NOT EXISTS session_bindings (
  pi_session_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, conversation_id TEXT NOT NULL REFERENCES conversations(conversation_id),
  connection_status TEXT NOT NULL, last_seen_at INTEGER NOT NULL
);
