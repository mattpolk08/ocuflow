-- Migration 0016: Migrate portal persistent data + notification logs to D1
-- Priority 1: Add missing columns for portal_accounts, portal_messages, portal_message_threads
-- Priority 3: Add notification_logs table

-- ── portal_accounts: add salt column for PBKDF2 password hashing ───────────
ALTER TABLE portal_accounts ADD COLUMN salt TEXT;

-- ── portal_message_threads: add updated_at and message_count ─────────────────
ALTER TABLE portal_message_threads ADD COLUMN updated_at TEXT;
ALTER TABLE portal_message_threads ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0;

-- ── portal_messages: add columns for full PortalMessage support ───────────────
ALTER TABLE portal_messages ADD COLUMN from_patient INTEGER NOT NULL DEFAULT 0;
ALTER TABLE portal_messages ADD COLUMN status TEXT NOT NULL DEFAULT 'UNREAD';
ALTER TABLE portal_messages ADD COLUMN read_at TEXT;
ALTER TABLE portal_messages ADD COLUMN attachment_note TEXT;

-- ── notification_logs (Priority 3) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_logs (
  id           TEXT PRIMARY KEY,
  channel      TEXT NOT NULL,           -- 'SMS' | 'EMAIL'
  type         TEXT NOT NULL,           -- NotifType
  recipient    TEXT NOT NULL,           -- phone or email (may be masked)
  subject      TEXT,
  body         TEXT NOT NULL DEFAULT '',
  provider     TEXT NOT NULL DEFAULT 'demo', -- 'twilio'|'sendgrid'|'demo'|'error'
  external_id  TEXT,
  success      INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  retries      INTEGER NOT NULL DEFAULT 0,
  sent_at      TEXT NOT NULL DEFAULT (datetime('now')),
  patient_id   TEXT,
  patient_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_notif_logs_sent     ON notification_logs(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_logs_patient  ON notification_logs(patient_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_logs_type     ON notification_logs(type, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_logs_success  ON notification_logs(success);
