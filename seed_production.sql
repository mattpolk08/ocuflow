-- ============================================================
-- OculoFlow Production Seed Data (schema-corrected v2)
-- All statements use INSERT OR IGNORE to be idempotent
-- ============================================================

-- ── RCM Claims ────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO rcm_claims (
  id, claim_number, patient_id, patient_name, date_of_birth,
  payer_id, payer_name, payer_type, insurance_plan, member_id,
  provider_id, provider_name, provider_npi, service_date, submitted_date,
  status, total_charged, total_paid, total_patient_responsibility, aging_bucket,
  diagnosis_codes, created_at, updated_at
) VALUES
('rcm-001','CLM-2026-0001','pt-001','Margaret Sullivan','1948-06-14',
 'pay-aetna','Aetna PPO','COMMERCIAL','Aetna Vision Plus','AET12345678',
 'dr-chen','Dr. Emily Chen, OD','1234567890','2026-03-07','2026-03-08',
 'PARTIAL_PAYMENT',350,132,25,'CURRENT',
 '["H40.1130","Z96.1"]',
 datetime('now'), datetime('now')),
('rcm-002','CLM-2026-0002','pt-002','Derek Holloway','1972-03-28',
 'pay-bcbs','Blue Cross Blue Shield','COMMERCIAL','BCBS Platinum','BCB98765432',
 'dr-patel','Dr. Raj Patel, MD','0987654321','2026-03-07','2026-03-09',
 'DENIED',425,0,0,'CURRENT',
 '["E11.3592","E11.3591"]',
 datetime('now'), datetime('now'));

-- ── eRx Prescriptions ────────────────────────────────────────────────────────
INSERT OR IGNORE INTO erx_prescriptions (
  id, patient_id, patient_name, provider_id, provider_name,
  drug_id, drug_name, sig, quantity, days_supply, refills, refills_remaining,
  status, pharmacy_id, pharmacy_name, prescribed_date, filled_date,
  is_controlled, diagnosis_codes, created_at, updated_at
) VALUES
('rx-erx-001','pt-001','Margaret Sullivan','dr-chen','Dr. Emily Chen, OD',
 'drug-003','Timoptic (timolol 0.5%)',
 'Instill 1 drop in each eye twice daily',5,90,3,3,
 'ACTIVE','pharm-001','CVS Pharmacy #7891','2026-02-10','2026-02-12',
 0,'["H40.1130"]',datetime('now'),datetime('now')),
('rx-erx-002','pt-001','Margaret Sullivan','dr-chen','Dr. Emily Chen, OD',
 'drug-002','Xalatan (latanoprost 0.005%)',
 'Instill 1 drop in left eye at bedtime',2.5,90,3,3,
 'ACTIVE','pharm-001','CVS Pharmacy #7891','2026-02-10','2026-02-12',
 0,'["H40.1130"]',datetime('now'),datetime('now')),
('rx-erx-003','pt-002','Derek Holloway','dr-patel','Dr. Raj Patel, MD',
 'drug-010','Pred Forte (prednisolone 1%)',
 'Instill 1 drop in left eye 4 times daily — taper over 2 weeks',5,14,0,0,
 'FILLED','pharm-002','Walgreens #5423','2026-03-07','2026-03-08',
 0,'["E11.3592"]',datetime('now'),datetime('now'));

-- ── Messaging Threads ────────────────────────────────────────────────────────
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

-- ── Clinical Task ─────────────────────────────────────────────────────────────
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

-- ── Reminder Templates ────────────────────────────────────────────────────────
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

-- ── Reminder Rules ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO reminder_rules (id, name, trigger_type, hours_before, template_id, channel, is_active, created_at) VALUES
('rule-001','24h Before Appointment','APPOINTMENT_REMINDER',24,'tmpl-001','BOTH',1,datetime('now')),
('rule-002','1h Before Appointment','APPOINTMENT_REMINDER',1,'tmpl-002','SMS',1,datetime('now')),
('rule-003','Annual Recall','ANNUAL_RECALL',null,'tmpl-003','EMAIL',1,datetime('now')),
('rule-004','No-Show Follow-Up','NO_SHOW_FOLLOWUP',null,'tmpl-004','BOTH',1,datetime('now'));

-- ── Prior Auth Requests ───────────────────────────────────────────────────────
INSERT OR IGNORE INTO prior_auth_requests (
  id, request_number, patient_id, patient_name, patient_dob,
  patient_member_id, provider_id, provider_name,
  payer_id, payer_name, service_type, service_code, service_description,
  diagnosis_codes, urgency, status, submitted_date,
  decision_date, auth_number, notes, status_history, criteria_met,
  created_at, updated_at
) VALUES
('pa-001','PA-2026-0001','pt-002','Derek Holloway','1972-03-28',
 'BCB98765432','dr-patel','Dr. Raj Patel, MD',
 'pay-bcbs','Blue Cross Blue Shield',
 'DIAGNOSTIC_IMAGING','92134','OCT Macula bilateral',
 '["E11.3592","E11.3591"]','URGENT','SUBMITTED','2026-03-08',
 null,null,
 '[{"id":"pan-001","authorId":"usr-billing-001","authorName":"Billing Staff","content":"Urgent OCT for suspected CSME OS.","isInternal":true,"createdAt":"2026-03-08T10:00:00Z","isPANote":true}]',
 '[]','[]',
 datetime('now'), datetime('now')),
('pa-002','PA-2026-0002','pt-001','Margaret Sullivan','1948-06-14',
 'AET12345678','dr-chen','Dr. Emily Chen, OD',
 'pay-aetna','Aetna PPO',
 'SPECIALTY_MEDICATION','L8613','Implantable scleral buckle',
 '["H33.3210"]','EXPEDITED','APPROVED','2026-02-20',
 '2026-02-22','AUTH-AET-20260222',
 '[]','[]','[]',
 datetime('now'), datetime('now'));

-- ── Care Gaps ─────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO care_gaps (id, patient_id, patient_name, gap_type, status, priority, due_date, description, created_at, updated_at) VALUES
('gap-001','pt-001','Margaret Sullivan','ANNUAL_EXAM','CLOSED','HIGH','2026-03-07','Annual comprehensive eye exam due — completed 2026-03-07','2026-02-01T00:00:00Z','2026-03-07T09:45:00Z'),
('gap-002','pt-002','Derek Holloway','DIABETIC_EYE_EXAM','OPEN','HIGH','2026-03-07','Annual diabetic retinopathy exam overdue — last exam 2025-03-07','2026-01-01T00:00:00Z','2026-03-07T10:30:00Z'),
('gap-003','pt-001','Margaret Sullivan','GLAUCOMA_FOLLOWUP','OPEN','HIGH','2026-09-07','6-month IOP check follow-up due after March 2026 exam','2026-03-07T09:45:00Z','2026-03-07T09:45:00Z'),
('gap-004','pt-003','Priya Nair','CONTACT_LENS_FOLLOWUP','OPEN','MEDIUM','2026-04-07','1-month contact lens follow-up after fitting','2026-03-07T00:00:00Z','2026-03-07T00:00:00Z');

-- ── Provider Goals ────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO provider_goals (id, provider_id, provider_name, metric, target, current_value, unit, period, status, created_at, updated_at) VALUES
('goal-001','dr-chen','Dr. Emily Chen, OD','exams_per_day',18,16,'exams','MONTHLY','ON_TRACK',datetime('now'),datetime('now')),
('goal-002','dr-chen','Dr. Emily Chen, OD','sign_rate',95,92,'%','MONTHLY','ON_TRACK',datetime('now'),datetime('now')),
('goal-003','dr-chen','Dr. Emily Chen, OD','patient_satisfaction',4.7,4.6,'score','MONTHLY','ON_TRACK',datetime('now'),datetime('now')),
('goal-004','dr-patel','Dr. Raj Patel, MD','exams_per_day',16,14,'exams','MONTHLY','BEHIND',datetime('now'),datetime('now')),
('goal-005','dr-patel','Dr. Raj Patel, MD','sign_rate',95,89,'%','MONTHLY','AT_RISK',datetime('now'),datetime('now'));
