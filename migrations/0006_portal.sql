-- OculoFlow Portal Schema Migration 0006
-- Portal accounts, sessions, appointment requests, messages

CREATE TABLE IF NOT EXISTS portal_accounts (
  id TEXT PRIMARY KEY,
  patient_id TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  login_method TEXT DEFAULT 'magic_link',
  email_verified INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS portal_sessions (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  patient_name TEXT,
  patient_email TEXT,
  patient_dob TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  last_activity TEXT,
  revoked_at TEXT,
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS portal_appointment_requests (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  patient_name TEXT,
  patient_phone TEXT,
  patient_email TEXT,
  request_type TEXT,
  preferred_dates TEXT,
  preferred_times TEXT,
  preferred_provider TEXT,
  reason TEXT,
  urgency TEXT,
  status TEXT DEFAULT 'PENDING',
  confirmed_date TEXT,
  confirmed_time TEXT,
  confirmed_provider TEXT,
  confirmed_provider_id TEXT,
  appointment_id TEXT,
  staff_notes TEXT,
  patient_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS portal_message_threads (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  patient_name TEXT,
  subject TEXT,
  category TEXT,
  status TEXT DEFAULT 'OPEN',
  last_message_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS portal_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender_type TEXT,
  sender_id TEXT,
  sender_name TEXT,
  body TEXT,
  is_read INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (thread_id) REFERENCES portal_message_threads(id)
);

CREATE TABLE IF NOT EXISTS portal_notification_prefs (
  id TEXT PRIMARY KEY,
  patient_id TEXT UNIQUE NOT NULL,
  appointment_reminders INTEGER DEFAULT 1,
  appointment_reminder_hours INTEGER DEFAULT 24,
  lab_ready INTEGER DEFAULT 1,
  billing_updates INTEGER DEFAULT 1,
  message_replies INTEGER DEFAULT 1,
  marketing INTEGER DEFAULT 0,
  preferred_channel TEXT DEFAULT 'email',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE INDEX IF NOT EXISTS idx_portal_sessions_patient ON portal_sessions(patient_id);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_expires ON portal_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_portal_appt_requests_patient ON portal_appointment_requests(patient_id);
CREATE INDEX IF NOT EXISTS idx_portal_threads_patient ON portal_message_threads(patient_id);
CREATE INDEX IF NOT EXISTS idx_portal_messages_thread ON portal_messages(thread_id);
