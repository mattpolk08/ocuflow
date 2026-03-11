-- ─────────────────────────────────────────────────────────────────────────────
-- OculoFlow — Migration 0015: Sprint 4 — AI, Scorecards, Engagement, Documents
-- ─────────────────────────────────────────────────────────────────────────────

-- ── AI Clinical Decision Support ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ai_insights (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT NOT NULL,
  patient_name    TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'CLINICAL',
  title           TEXT NOT NULL,
  description     TEXT NOT NULL,
  severity        TEXT NOT NULL DEFAULT 'INFO',
  confidence      INTEGER NOT NULL DEFAULT 85,
  source          TEXT NOT NULL DEFAULT 'AI_ENGINE',
  action_required INTEGER NOT NULL DEFAULT 0,
  dismissed       INTEGER NOT NULL DEFAULT 0,
  dismissed_by    TEXT,
  dismissed_at    TEXT,
  metadata        TEXT NOT NULL DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_patient   ON ai_insights(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_severity  ON ai_insights(severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_dismissed ON ai_insights(dismissed, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_risk_scores (
  id            TEXT PRIMARY KEY,
  patient_id    TEXT NOT NULL,
  patient_name  TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'OVERALL',
  score         INTEGER NOT NULL DEFAULT 0,
  level         TEXT NOT NULL DEFAULT 'LOW',
  factors       TEXT NOT NULL DEFAULT '[]',
  recommendations TEXT NOT NULL DEFAULT '[]',
  computed_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_risk_patient ON ai_risk_scores(patient_id, computed_at DESC);

CREATE TABLE IF NOT EXISTS ai_generated_notes (
  id            TEXT PRIMARY KEY,
  exam_id       TEXT,
  patient_id    TEXT NOT NULL,
  provider_id   TEXT,
  note_type     TEXT NOT NULL DEFAULT 'SOAP',
  content       TEXT NOT NULL,
  sections      TEXT NOT NULL DEFAULT '{}',
  word_count    INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_notes_exam    ON ai_generated_notes(exam_id);
CREATE INDEX IF NOT EXISTS idx_ai_notes_patient ON ai_generated_notes(patient_id, created_at DESC);

-- ── Provider Scorecards & Goals ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_goals (
  id              TEXT PRIMARY KEY,
  provider_id     TEXT NOT NULL,
  provider_name   TEXT NOT NULL,
  metric          TEXT NOT NULL,
  target          REAL NOT NULL,
  current_value   REAL NOT NULL DEFAULT 0,
  unit            TEXT,
  period          TEXT NOT NULL DEFAULT 'MONTHLY',
  status          TEXT NOT NULL DEFAULT 'ON_TRACK',
  notes           TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_goals_provider ON provider_goals(provider_id, period);

-- ── Patient Engagement & Care Gaps ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS care_gaps (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT NOT NULL,
  patient_name    TEXT NOT NULL,
  gap_type        TEXT NOT NULL DEFAULT 'ANNUAL_EXAM',
  status          TEXT NOT NULL DEFAULT 'OPEN',
  priority        TEXT NOT NULL DEFAULT 'MEDIUM',
  due_date        TEXT,
  last_visit_date TEXT,
  description     TEXT,
  assigned_to     TEXT,
  outreach_count  INTEGER NOT NULL DEFAULT 0,
  last_outreach   TEXT,
  closed_at       TEXT,
  closed_reason   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_gaps_patient ON care_gaps(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gaps_status  ON care_gaps(status, due_date);
CREATE INDEX IF NOT EXISTS idx_gaps_type    ON care_gaps(gap_type, status);

CREATE TABLE IF NOT EXISTS engagement_surveys (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT NOT NULL,
  patient_name    TEXT NOT NULL,
  survey_type     TEXT NOT NULL DEFAULT 'SATISFACTION',
  status          TEXT NOT NULL DEFAULT 'PENDING',
  score           INTEGER,
  responses       TEXT NOT NULL DEFAULT '{}',
  sent_at         TEXT,
  completed_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_surveys_patient ON engagement_surveys(patient_id, created_at DESC);

-- ── Document Management ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT,
  patient_name    TEXT,
  exam_id         TEXT,
  category        TEXT NOT NULL DEFAULT 'GENERAL',
  name            TEXT NOT NULL,
  original_name   TEXT NOT NULL,
  mime_type       TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes      INTEGER NOT NULL DEFAULT 0,
  storage_backend TEXT NOT NULL DEFAULT 'KV',
  storage_key     TEXT,
  url             TEXT,
  tags            TEXT NOT NULL DEFAULT '[]',
  uploaded_by     TEXT,
  uploaded_by_name TEXT,
  is_signed       INTEGER NOT NULL DEFAULT 0,
  signed_at       TEXT,
  signed_by       TEXT,
  expires_at      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_docs_patient  ON documents(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_docs_exam     ON documents(exam_id);
CREATE INDEX IF NOT EXISTS idx_docs_category ON documents(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_docs_signed   ON documents(is_signed);

-- ── Seed: care gaps ───────────────────────────────────────────────────────────
INSERT OR IGNORE INTO care_gaps (id, patient_id, patient_name, gap_type, status, priority, due_date, description, created_at, updated_at) VALUES
('gap-001','pt-001','Margaret Sullivan','ANNUAL_EXAM','CLOSED','HIGH','2026-03-07','Annual comprehensive eye exam due — completed 2026-03-07','2026-02-01T00:00:00Z','2026-03-07T09:45:00Z'),
('gap-002','pt-002','Derek Holloway','DIABETIC_EYE_EXAM','OPEN','HIGH','2026-03-07','Annual diabetic retinopathy exam overdue — last exam 2025-03-07','2026-01-01T00:00:00Z','2026-03-07T10:30:00Z'),
('gap-003','pt-001','Margaret Sullivan','GLAUCOMA_FOLLOWUP','OPEN','HIGH','2026-09-07','6-month IOP check follow-up due after March 2026 exam','2026-03-07T09:45:00Z','2026-03-07T09:45:00Z'),
('gap-004','pt-003','Priya Nair','CONTACT_LENS_FOLLOWUP','OPEN','MEDIUM','2026-04-07','1-month contact lens follow-up after fitting','2026-03-07T00:00:00Z','2026-03-07T00:00:00Z');

-- ── Seed: provider goals ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO provider_goals (id, provider_id, provider_name, metric, target, current_value, unit, period, status, created_at, updated_at) VALUES
('goal-001','dr-chen','Dr. Emily Chen, OD','exams_per_day',18,16,'exams','MONTHLY','ON_TRACK',datetime('now'),datetime('now')),
('goal-002','dr-chen','Dr. Emily Chen, OD','sign_rate',95,92,'%','MONTHLY','ON_TRACK',datetime('now'),datetime('now')),
('goal-003','dr-chen','Dr. Emily Chen, OD','patient_satisfaction',4.7,4.6,'score','MONTHLY','ON_TRACK',datetime('now'),datetime('now')),
('goal-004','dr-patel','Dr. Raj Patel, MD','exams_per_day',16,14,'exams','MONTHLY','BEHIND',datetime('now'),datetime('now')),
('goal-005','dr-patel','Dr. Raj Patel, MD','sign_rate',95,89,'%','MONTHLY','AT_RISK',datetime('now'),datetime('now'));
