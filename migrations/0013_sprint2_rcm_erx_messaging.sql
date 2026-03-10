-- ─────────────────────────────────────────────────────────────────────────────
-- OculoFlow — Migration 0013: Sprint 2 — RCM, eRx, Messaging
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Revenue Cycle Management ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rcm_claims (
  id               TEXT    PRIMARY KEY,
  claim_number     TEXT    NOT NULL,
  patient_id       TEXT    NOT NULL,
  patient_name     TEXT    NOT NULL,
  date_of_birth    TEXT,
  exam_id          TEXT,
  payer_id         TEXT    NOT NULL,
  payer_name       TEXT    NOT NULL,
  payer_type       TEXT    NOT NULL DEFAULT 'COMMERCIAL',
  insurance_plan   TEXT    NOT NULL DEFAULT '',
  member_id        TEXT    NOT NULL DEFAULT '',
  group_number     TEXT,
  provider_id      TEXT    NOT NULL,
  provider_name    TEXT    NOT NULL,
  npi              TEXT,
  service_date     TEXT    NOT NULL,
  submission_date  TEXT,
  status           TEXT    NOT NULL DEFAULT 'DRAFT',
  total_charged    REAL    NOT NULL DEFAULT 0,
  total_allowed    REAL    NOT NULL DEFAULT 0,
  total_paid       REAL    NOT NULL DEFAULT 0,
  patient_responsibility REAL NOT NULL DEFAULT 0,
  adjustment       REAL    NOT NULL DEFAULT 0,
  aging_bucket     TEXT    NOT NULL DEFAULT 'CURRENT',
  -- JSON blob arrays
  lines            TEXT    NOT NULL DEFAULT '[]',  -- ClaimLine[]
  payments         TEXT    NOT NULL DEFAULT '[]',  -- ClaimPayment[]
  denials          TEXT    NOT NULL DEFAULT '[]',  -- ClaimDenial[]
  notes            TEXT    NOT NULL DEFAULT '[]',  -- ClaimNote[]
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rcm_patient    ON rcm_claims(patient_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_rcm_status     ON rcm_claims(status, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_rcm_payer      ON rcm_claims(payer_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_rcm_provider   ON rcm_claims(provider_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_rcm_date       ON rcm_claims(service_date DESC);

CREATE TABLE IF NOT EXISTS rcm_eras (
  id               TEXT    PRIMARY KEY,
  payer_id         TEXT    NOT NULL,
  payer_name       TEXT    NOT NULL,
  check_number     TEXT,
  eft_trace        TEXT,
  payment_date     TEXT    NOT NULL,
  total_payment    REAL    NOT NULL DEFAULT 0,
  claims_count     INTEGER NOT NULL DEFAULT 0,
  claim_ids        TEXT    NOT NULL DEFAULT '[]', -- string[] JSON
  status           TEXT    NOT NULL DEFAULT 'RECEIVED',
  posted_by        TEXT,
  posted_at        TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rcm_statements (
  id               TEXT    PRIMARY KEY,
  patient_id       TEXT    NOT NULL,
  patient_name     TEXT    NOT NULL,
  statement_date   TEXT    NOT NULL,
  due_date         TEXT,
  balance_due      REAL    NOT NULL DEFAULT 0,
  previous_balance REAL    NOT NULL DEFAULT 0,
  payments_received REAL   NOT NULL DEFAULT 0,
  adjustments      REAL    NOT NULL DEFAULT 0,
  new_charges      REAL    NOT NULL DEFAULT 0,
  claim_ids        TEXT    NOT NULL DEFAULT '[]',
  status           TEXT    NOT NULL DEFAULT 'PENDING',
  sent_date        TEXT,
  viewed_date      TEXT,
  paid_date        TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rcm_stmt_patient ON rcm_statements(patient_id, statement_date DESC);

CREATE TABLE IF NOT EXISTS rcm_payment_plans (
  id               TEXT    PRIMARY KEY,
  patient_id       TEXT    NOT NULL,
  patient_name     TEXT    NOT NULL,
  total_amount     REAL    NOT NULL,
  amount_paid      REAL    NOT NULL DEFAULT 0,
  remaining        REAL    NOT NULL,
  installment_amt  REAL    NOT NULL,
  frequency        TEXT    NOT NULL DEFAULT 'MONTHLY',
  start_date       TEXT    NOT NULL,
  next_due_date    TEXT,
  claim_ids        TEXT    NOT NULL DEFAULT '[]',
  status           TEXT    NOT NULL DEFAULT 'ACTIVE',
  payment_method   TEXT,
  notes            TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rcm_pp_patient ON rcm_payment_plans(patient_id);

-- ── eRx — Electronic Prescriptions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS erx_prescriptions (
  id               TEXT    PRIMARY KEY,
  patient_id       TEXT    NOT NULL,
  patient_name     TEXT    NOT NULL,
  provider_id      TEXT    NOT NULL,
  provider_name    TEXT    NOT NULL,
  drug_id          TEXT    NOT NULL,
  drug_name        TEXT    NOT NULL,
  drug_ndc         TEXT,
  sig              TEXT    NOT NULL,
  quantity         REAL    NOT NULL DEFAULT 0,
  days_supply      INTEGER NOT NULL DEFAULT 30,
  refills          INTEGER NOT NULL DEFAULT 0,
  refills_remaining INTEGER NOT NULL DEFAULT 0,
  daw              INTEGER NOT NULL DEFAULT 0, -- dispense as written
  status           TEXT    NOT NULL DEFAULT 'PENDING',
  pharmacy_id      TEXT,
  pharmacy_name    TEXT,
  pharmacy_ncpdp   TEXT,
  prescribed_date  TEXT    NOT NULL,
  sent_date        TEXT,
  filled_date      TEXT,
  controlled_schedule TEXT,
  diagnosis_codes  TEXT    NOT NULL DEFAULT '[]', -- string[] JSON
  refill_history   TEXT    NOT NULL DEFAULT '[]', -- RefillEvent[] JSON
  is_controlled    INTEGER NOT NULL DEFAULT 0,
  requires_prior_auth INTEGER NOT NULL DEFAULT 0,
  notes            TEXT,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_erx_patient    ON erx_prescriptions(patient_id, prescribed_date DESC);
CREATE INDEX IF NOT EXISTS idx_erx_provider   ON erx_prescriptions(provider_id, prescribed_date DESC);
CREATE INDEX IF NOT EXISTS idx_erx_status     ON erx_prescriptions(status, prescribed_date DESC);
CREATE INDEX IF NOT EXISTS idx_erx_drug       ON erx_prescriptions(drug_id);

CREATE TABLE IF NOT EXISTS erx_pdmp_reports (
  id               TEXT    PRIMARY KEY,
  patient_id       TEXT    NOT NULL,
  patient_name     TEXT    NOT NULL,
  requested_by     TEXT    NOT NULL,
  requested_at     TEXT    NOT NULL,
  report_data      TEXT    NOT NULL DEFAULT '{}', -- PdmpReport JSON blob
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_pdmp_patient ON erx_pdmp_reports(patient_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS erx_allergies (
  id               TEXT    PRIMARY KEY,
  patient_id       TEXT    NOT NULL,
  allergen         TEXT    NOT NULL,
  reaction         TEXT,
  severity         TEXT    NOT NULL DEFAULT 'MODERATE',
  onset_date       TEXT,
  verified_by      TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_erx_allergy_patient ON erx_allergies(patient_id);

-- ── Staff Messaging & Clinical Tasks ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS msg_threads (
  id               TEXT    PRIMARY KEY,
  subject          TEXT    NOT NULL,
  category         TEXT    NOT NULL DEFAULT 'GENERAL',
  priority         TEXT    NOT NULL DEFAULT 'NORMAL',
  patient_id       TEXT,
  patient_name     TEXT,
  creator_id       TEXT    NOT NULL,
  creator_name     TEXT    NOT NULL,
  participant_ids  TEXT    NOT NULL DEFAULT '[]', -- string[] JSON
  status           TEXT    NOT NULL DEFAULT 'OPEN',
  is_archived      INTEGER NOT NULL DEFAULT 0,
  is_pinned        INTEGER NOT NULL DEFAULT 0,
  message_count    INTEGER NOT NULL DEFAULT 0,
  last_message_at  TEXT,
  read_by          TEXT    NOT NULL DEFAULT '[]', -- string[] JSON: staff IDs who read
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_msg_thread_creator  ON msg_threads(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_thread_patient  ON msg_threads(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_thread_status   ON msg_threads(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_thread_archived ON msg_threads(is_archived, updated_at DESC);

CREATE TABLE IF NOT EXISTS msg_messages (
  id               TEXT    PRIMARY KEY,
  thread_id        TEXT    NOT NULL,
  sender_id        TEXT    NOT NULL,
  sender_name      TEXT    NOT NULL,
  sender_role      TEXT,
  content          TEXT    NOT NULL,
  is_system        INTEGER NOT NULL DEFAULT 0,
  attachments      TEXT    NOT NULL DEFAULT '[]', -- JSON array
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(thread_id) REFERENCES msg_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_msg_messages_thread ON msg_messages(thread_id, created_at ASC);

CREATE TABLE IF NOT EXISTS msg_tasks (
  id               TEXT    PRIMARY KEY,
  title            TEXT    NOT NULL,
  description      TEXT,
  category         TEXT    NOT NULL DEFAULT 'GENERAL',
  priority         TEXT    NOT NULL DEFAULT 'MEDIUM',
  status           TEXT    NOT NULL DEFAULT 'OPEN',
  patient_id       TEXT,
  patient_name     TEXT,
  assigned_to      TEXT    NOT NULL,
  assigned_name    TEXT    NOT NULL,
  created_by       TEXT    NOT NULL,
  created_by_name  TEXT    NOT NULL,
  due_date         TEXT,
  completed_at     TEXT,
  thread_id        TEXT,
  comments         TEXT    NOT NULL DEFAULT '[]', -- TaskComment[] JSON
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_msg_tasks_assignee ON msg_tasks(assigned_to, status, due_date);
CREATE INDEX IF NOT EXISTS idx_msg_tasks_patient  ON msg_tasks(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_tasks_status   ON msg_tasks(status, due_date);

CREATE TABLE IF NOT EXISTS msg_recalls (
  id               TEXT    PRIMARY KEY,
  patient_id       TEXT    NOT NULL,
  patient_name     TEXT    NOT NULL,
  recall_type      TEXT    NOT NULL DEFAULT 'ANNUAL_EXAM',
  due_date         TEXT    NOT NULL,
  priority         TEXT    NOT NULL DEFAULT 'NORMAL',
  status           TEXT    NOT NULL DEFAULT 'PENDING',
  notes            TEXT,
  assigned_to      TEXT,
  last_contact_date TEXT,
  contact_attempts INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_msg_recalls_patient ON msg_recalls(patient_id);
CREATE INDEX IF NOT EXISTS idx_msg_recalls_status  ON msg_recalls(status, due_date);

-- ── Seed: RCM claims ──────────────────────────────────────────────────────────
INSERT OR IGNORE INTO rcm_claims (
  id, claim_number, patient_id, patient_name, date_of_birth,
  payer_id, payer_name, payer_type, insurance_plan, member_id,
  provider_id, provider_name, npi, service_date, submission_date,
  status, total_charged, total_paid, patient_responsibility, aging_bucket,
  lines, payments, denials, notes, created_at, updated_at
) VALUES
('rcm-001','CLM-2026-0001','pt-001','Margaret Sullivan','1948-06-14',
 'pay-aetna','Aetna PPO','COMMERCIAL','Aetna Vision Plus','AET12345678',
 'dr-chen','Dr. Emily Chen, OD','1234567890','2026-03-07','2026-03-08',
 'PARTIAL_PAYMENT',350,132,25,'CURRENT',
 '[{"id":"ln-001","cptCode":"92004","description":"Comprehensive Eye Exam, new patient","units":1,"chargedAmount":250,"allowedAmount":200,"paidAmount":160,"adjustmentAmount":40,"patientResponsibility":25,"diagnosisCodes":["H40.1130","Z96.1"],"serviceDate":"2026-03-07"},{"id":"ln-002","cptCode":"92083","description":"Visual Field Test, both eyes","units":1,"chargedAmount":100,"allowedAmount":80,"paidAmount":-28,"adjustmentAmount":0,"patientResponsibility":0,"diagnosisCodes":["H40.1130"],"serviceDate":"2026-03-07"}]',
 '[{"id":"pay-001","paymentDate":"2026-03-10","amount":132,"method":"EFT","referenceNumber":"EFT20260310","postedBy":"billing@oculoflow.com","notes":"ERA 835 — Aetna batch"}]',
 '[]','[]',
 datetime('now'), datetime('now')),
('rcm-002','CLM-2026-0002','pt-002','Derek Holloway','1972-03-28',
 'pay-bcbs','Blue Cross Blue Shield','COMMERCIAL','BCBS Platinum','BCB98765432',
 'dr-patel','Dr. Raj Patel, MD','0987654321','2026-03-07','2026-03-09',
 'DENIED',425,0,0,'CURRENT',
 '[{"id":"ln-003","cptCode":"92014","description":"Comprehensive Eye Exam, established","units":1,"chargedAmount":200,"allowedAmount":0,"paidAmount":0,"patientResponsibility":0,"diagnosisCodes":["E11.3592","E11.3591"],"serviceDate":"2026-03-07"},{"id":"ln-004","cptCode":"92250","description":"Fundus Photography","units":1,"chargedAmount":125,"allowedAmount":0,"paidAmount":0,"patientResponsibility":0,"diagnosisCodes":["E11.3592"],"serviceDate":"2026-03-07"},{"id":"ln-005","cptCode":"92134","description":"OCT Macula","units":1,"chargedAmount":100,"allowedAmount":0,"paidAmount":0,"patientResponsibility":0,"diagnosisCodes":["E11.3592"],"serviceDate":"2026-03-07"}]',
 '[]',
 '[{"id":"den-001","deniedDate":"2026-03-12","reason":"AUTHORIZATION_REQUIRED","reasonDescription":"Prior authorization required for OCT macula with diabetes","claimLineIds":["ln-005"],"appealDeadline":"2026-04-12"}]',
 '[{"id":"note-001","authorId":"usr-billing-001","authorName":"Billing Staff","content":"Appealing denial — OCT medically necessary per attending provider documentation","createdAt":"2026-03-13T10:00:00Z","isInternal":true}]',
 datetime('now'), datetime('now'));

-- ── Seed: eRx prescriptions ───────────────────────────────────────────────────
INSERT OR IGNORE INTO erx_prescriptions (
  id, patient_id, patient_name, provider_id, provider_name,
  drug_id, drug_name, sig, quantity, days_supply, refills, refills_remaining,
  status, pharmacy_id, pharmacy_name, prescribed_date, filled_date,
  is_controlled, diagnosis_codes, created_at, updated_at
) VALUES
('rx-erx-001','pt-001','Margaret Sullivan','dr-chen','Dr. Emily Chen, OD',
 'drug-timolol','Timolol 0.5% Ophthalmic Solution',
 'Instill 1 drop in each eye twice daily',5,90,3,3,
 'ACTIVE','pharm-001','CVS Pharmacy #1234','2026-02-10','2026-02-12',
 0,'["H40.1130"]',datetime('now'),datetime('now')),
('rx-erx-002','pt-001','Margaret Sullivan','dr-chen','Dr. Emily Chen, OD',
 'drug-latanoprost','Latanoprost 0.005% Ophthalmic Solution',
 'Instill 1 drop in left eye at bedtime',2.5,90,3,3,
 'ACTIVE','pharm-001','CVS Pharmacy #1234','2026-02-10','2026-02-12',
 0,'["H40.1130"]',datetime('now'),datetime('now')),
('rx-erx-003','pt-002','Derek Holloway','dr-patel','Dr. Raj Patel, MD',
 'drug-prednisolone','Prednisolone Acetate 1% Ophthalmic Suspension',
 'Instill 1 drop in left eye 4 times daily — taper over 2 weeks',5,14,0,0,
 'FILLED','pharm-002','Walgreens #5678','2026-03-07','2026-03-08',
 0,'["E11.3592"]',datetime('now'),datetime('now'));

-- ── Seed: messaging thread ────────────────────────────────────────────────────
INSERT OR IGNORE INTO msg_threads (
  id, subject, category, priority, patient_id, patient_name,
  creator_id, creator_name, participant_ids, status,
  message_count, last_message_at, read_by, created_at, updated_at
) VALUES
('thread-001','Referral needed: Holloway OS CSME','CLINICAL','URGENT','pt-002','Derek Holloway',
 'dr-patel','Dr. Raj Patel, MD','["dr-chen","usr-billing-001"]','OPEN',
 2,'2026-03-07T11:30:00Z','["dr-patel"]',
 '2026-03-07T10:45:00Z','2026-03-07T11:30:00Z');

INSERT OR IGNORE INTO msg_messages (
  id, thread_id, sender_id, sender_name, sender_role, content, created_at
) VALUES
('msg-001','thread-001','dr-patel','Dr. Raj Patel, MD','PROVIDER',
 'Patient Holloway (pt-002) needs urgent retina referral. OCT shows CSME in OS. Please expedite prior auth and coordinate with Retina Associates. Appeal filed for denied OCT claim.',
 '2026-03-07T10:45:00Z'),
('msg-002','thread-001','usr-billing-001','Billing Staff','BILLING',
 'On it. Prior auth request submitted for OCT (CPT 92134). I''ll also start the appeal for rcm-002 denial. Retina Associates has availability next week.',
 '2026-03-07T11:30:00Z');

-- ── Seed: clinical task ───────────────────────────────────────────────────────
INSERT OR IGNORE INTO msg_tasks (
  id, title, description, category, priority, status,
  patient_id, patient_name, assigned_to, assigned_name,
  created_by, created_by_name, due_date, thread_id, comments,
  created_at, updated_at
) VALUES
('task-001','Submit prior auth for Holloway OCT',
 'Prior authorization required for OCT macula OS (CPT 92134) for pt-002 — diabetic macular edema suspected',
 'BILLING','HIGH','IN_PROGRESS',
 'pt-002','Derek Holloway','usr-billing-001','Billing Staff',
 'dr-patel','Dr. Raj Patel, MD','2026-03-14',
 'thread-001','[]',
 '2026-03-07T10:46:00Z','2026-03-07T11:30:00Z');
