-- ─────────────────────────────────────────────────────────────────────────────
-- OculoFlow — Migration 0014: Sprint 3 — Reminders, Telehealth, Prior Auth
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Appointment Reminders & Communications ────────────────────────────────────
CREATE TABLE IF NOT EXISTS reminder_templates (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  type         TEXT NOT NULL,
  channel      TEXT NOT NULL DEFAULT 'BOTH',
  subject      TEXT,
  body         TEXT NOT NULL,
  variables    TEXT NOT NULL DEFAULT '[]', -- string[] JSON
  is_active    INTEGER NOT NULL DEFAULT 1,
  use_count    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reminder_messages (
  id             TEXT PRIMARY KEY,
  patient_id     TEXT NOT NULL,
  patient_name   TEXT NOT NULL,
  patient_phone  TEXT,
  patient_email  TEXT,
  appointment_id TEXT,
  template_id    TEXT,
  type           TEXT NOT NULL,
  channel        TEXT NOT NULL DEFAULT 'BOTH',
  status         TEXT NOT NULL DEFAULT 'PENDING',
  subject        TEXT,
  body           TEXT NOT NULL,
  sent_at        TEXT,
  delivered_at   TEXT,
  response       TEXT,
  response_at    TEXT,
  error_message  TEXT,
  scheduled_for  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reminder_patient     ON reminder_messages(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reminder_appt        ON reminder_messages(appointment_id);
CREATE INDEX IF NOT EXISTS idx_reminder_status      ON reminder_messages(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_reminder_type        ON reminder_messages(type, created_at DESC);

CREATE TABLE IF NOT EXISTS reminder_rules (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  trigger_type  TEXT NOT NULL DEFAULT 'APPOINTMENT',
  hours_before  INTEGER,
  template_id   TEXT,
  channel       TEXT NOT NULL DEFAULT 'BOTH',
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL DEFAULT 'RECALL',
  status        TEXT NOT NULL DEFAULT 'DRAFT',
  target_count  INTEGER NOT NULL DEFAULT 0,
  sent_count    INTEGER NOT NULL DEFAULT 0,
  response_count INTEGER NOT NULL DEFAULT 0,
  scheduled_for TEXT,
  sent_at       TEXT,
  template_id   TEXT,
  filters       TEXT NOT NULL DEFAULT '{}',
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Telehealth Visits ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telehealth_visits (
  id              TEXT PRIMARY KEY,
  patient_id      TEXT NOT NULL,
  patient_name    TEXT NOT NULL,
  patient_email   TEXT,
  patient_phone   TEXT,
  provider_id     TEXT,
  provider_name   TEXT,
  visit_type      TEXT NOT NULL DEFAULT 'ASYNC_REVIEW',
  status          TEXT NOT NULL DEFAULT 'INTAKE_PENDING',
  urgency         TEXT NOT NULL DEFAULT 'ROUTINE',
  chief_complaint TEXT NOT NULL DEFAULT '',
  scheduled_for   TEXT,
  started_at      TEXT,
  completed_at    TEXT,
  cancelled_at    TEXT,
  cancel_reason   TEXT,
  -- JSON blobs
  questionnaire   TEXT,  -- PreVisitQuestionnaire JSON
  provider_review TEXT,  -- ProviderReview JSON
  messages        TEXT NOT NULL DEFAULT '[]', -- VisitMessage[] JSON
  info_requests   TEXT NOT NULL DEFAULT '[]', -- InfoRequest[] JSON
  prescriptions   TEXT NOT NULL DEFAULT '[]', -- ReviewPrescription[] JSON
  -- meeting fields (live video)
  meeting_url     TEXT,
  meeting_id      TEXT,
  duration_minutes INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tele_patient    ON telehealth_visits(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tele_provider   ON telehealth_visits(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tele_status     ON telehealth_visits(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tele_scheduled  ON telehealth_visits(scheduled_for);

-- ── Prior Authorization Requests ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prior_auth_requests (
  id                 TEXT PRIMARY KEY,
  request_number     TEXT NOT NULL,
  patient_id         TEXT NOT NULL,
  patient_name       TEXT NOT NULL,
  patient_dob        TEXT,
  patient_member_id  TEXT,
  provider_id        TEXT NOT NULL,
  provider_name      TEXT NOT NULL,
  payer_id           TEXT NOT NULL,
  payer_name         TEXT NOT NULL,
  service_type       TEXT NOT NULL,
  service_code       TEXT,
  service_description TEXT,
  diagnosis_codes    TEXT NOT NULL DEFAULT '[]',
  urgency            TEXT NOT NULL DEFAULT 'ROUTINE',
  status             TEXT NOT NULL DEFAULT 'DRAFT',
  submitted_date     TEXT,
  decision_date      TEXT,
  expiration_date    TEXT,
  decision_reason    TEXT,
  auth_number        TEXT,
  units_approved     INTEGER,
  -- JSON blobs
  documents          TEXT NOT NULL DEFAULT '[]', -- PADocument[]
  notes              TEXT NOT NULL DEFAULT '[]', -- PANote[]
  status_history     TEXT NOT NULL DEFAULT '[]', -- PAStatusHistory[]
  peer_to_peer       TEXT,                        -- PeerToPeerRequest
  appeal             TEXT,                        -- AppealRecord
  criteria_met       TEXT NOT NULL DEFAULT '[]', -- string[]
  created_by         TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pa_patient    ON prior_auth_requests(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pa_provider   ON prior_auth_requests(provider_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pa_payer      ON prior_auth_requests(payer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pa_status     ON prior_auth_requests(status, submitted_date DESC);
CREATE INDEX IF NOT EXISTS idx_pa_urgency    ON prior_auth_requests(urgency, submitted_date DESC);

-- ── Seed: reminder templates ──────────────────────────────────────────────────
INSERT OR IGNORE INTO reminder_templates (id, name, type, channel, subject, body, variables, created_at, updated_at) VALUES
('tmpl-001','24-Hour Appointment Reminder','REMINDER_24H','BOTH',
 'Your appointment tomorrow at {{time}}',
 'Hi {{first_name}}, this is a reminder that you have an appointment with {{provider}} tomorrow at {{time}} at {{clinic_name}}. Reply CONFIRM to confirm or CANCEL to cancel. Call {{clinic_phone}} with questions.',
 '["first_name","provider","time","clinic_name","clinic_phone"]',
 datetime('now'), datetime('now')),
('tmpl-002','1-Hour Appointment Reminder','REMINDER_1H','SMS',
 'Your appointment is in 1 hour',
 'Hi {{first_name}}, your appointment with {{provider}} is in 1 hour at {{clinic_name}}. See you soon!',
 '["first_name","provider","clinic_name"]',
 datetime('now'), datetime('now')),
('tmpl-003','Annual Recall Outreach','RECALL_OUTREACH','EMAIL',
 'Time for your annual eye exam — {{first_name}}',
 'Dear {{first_name}}, it''s been a year since your last visit with us at {{clinic_name}}. Regular eye exams are important for your health. Please call {{clinic_phone}} or visit our website to schedule your appointment. We look forward to seeing you!',
 '["first_name","clinic_name","clinic_phone"]',
 datetime('now'), datetime('now')),
('tmpl-004','No-Show Follow-Up','NO_SHOW_FOLLOWUP','BOTH',
 'We missed you today',
 'Hi {{first_name}}, we noticed you were unable to make your appointment today. We''d love to reschedule you. Please call {{clinic_phone}} at your earliest convenience.',
 '["first_name","clinic_phone"]',
 datetime('now'), datetime('now'));

-- ── Seed: telehealth visits ───────────────────────────────────────────────────
INSERT OR IGNORE INTO telehealth_visits (
  id, patient_id, patient_name, patient_email,
  provider_id, provider_name, visit_type, status, urgency,
  chief_complaint, scheduled_for, questionnaire, created_at, updated_at
) VALUES
('tele-001','pt-001','Margaret Sullivan','margaret.s@email.com',
 'dr-chen','Dr. Emily Chen, OD','ASYNC_REVIEW','COMPLETED','ROUTINE',
 'Follow-up on glaucoma medication side effects','2026-03-05',
 '{"symptoms":"Mild eye redness and dryness since starting new drops","duration":"2 weeks","severity":4,"photos":["photo_1.jpg"],"currentMeds":"Timolol BID OU, Latanoprost QHS OS","questions":"Can we switch to a preservative-free formula?"}',
 '2026-03-05T09:00:00Z','2026-03-05T14:30:00Z'),
('tele-002','pt-002','Derek Holloway','derek.h@email.com',
 null,null,'ASYNC_REVIEW','INTAKE_PENDING','URGENT',
 'New floaters in left eye — appearing since yesterday','2026-03-10',
 null, datetime('now'), datetime('now'));

-- ── Seed: prior auth requests ─────────────────────────────────────────────────
INSERT OR IGNORE INTO prior_auth_requests (
  id, request_number, patient_id, patient_name, patient_dob,
  patient_member_id, provider_id, provider_name,
  payer_id, payer_name, service_type, service_code, service_description,
  diagnosis_codes, urgency, status, submitted_date,
  decision_date, auth_number, notes, created_at, updated_at
) VALUES
('pa-001','PA-2026-0001','pt-002','Derek Holloway','1972-03-28',
 'BCB98765432','dr-patel','Dr. Raj Patel, MD',
 'pay-bcbs','Blue Cross Blue Shield',
 'DIAGNOSTIC_IMAGING','92134','OCT Macula bilateral',
 '["E11.3592","E11.3591"]','URGENT','SUBMITTED','2026-03-08',
 null,null,
 '[{"id":"pan-001","authorId":"usr-billing-001","authorName":"Billing Staff","content":"Urgent OCT for suspected CSME OS. Clinical documentation attached including fundus photos and provider narrative.","isInternal":true,"createdAt":"2026-03-08T10:00:00Z","isPANote":true}]',
 datetime('now'), datetime('now')),
('pa-002','PA-2026-0002','pt-001','Margaret Sullivan','1948-06-14',
 'AET12345678','dr-chen','Dr. Emily Chen, OD',
 'pay-aetna','Aetna PPO',
 'SPECIALTY_MEDICATION','L8613','Implantable scleral buckle for retinal detachment repair',
 '["H33.3210"]','EXPEDITED','APPROVED','2026-02-20',
 '2026-02-22','AUTH-AET-20260222',
 '[]', datetime('now'), datetime('now'));
