-- ─────────────────────────────────────────────────────────────────────────────
-- OculoFlow — Migration 0012: audit_log + exams tables
-- ─────────────────────────────────────────────────────────────────────────────

-- ── HIPAA Audit Log (§164.312(b)) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id               TEXT    PRIMARY KEY,
  timestamp        TEXT    NOT NULL,
  event            TEXT    NOT NULL,
  user_id          TEXT,
  user_email       TEXT,
  user_role        TEXT,
  patient_id       TEXT,
  resource         TEXT    NOT NULL DEFAULT 'unknown',
  resource_id      TEXT,
  action           TEXT    NOT NULL,
  outcome          TEXT    NOT NULL CHECK(outcome IN ('SUCCESS','FAILURE','DENIED')),
  risk_level       TEXT    NOT NULL CHECK(risk_level IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  ip_address       TEXT    NOT NULL DEFAULT 'unknown',
  user_agent       TEXT    NOT NULL DEFAULT 'unknown',
  session_id       TEXT,
  details          TEXT,
  record_count     INTEGER,
  duration_ms      INTEGER,
  phi_accessed     INTEGER NOT NULL DEFAULT 0,
  data_exported    INTEGER NOT NULL DEFAULT 0,
  emergency_access INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp    ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user         ON audit_log(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_event        ON audit_log(event, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_risk         ON audit_log(risk_level, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_patient      ON audit_log(patient_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_outcome      ON audit_log(outcome, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_phi          ON audit_log(phi_accessed, timestamp DESC);

-- ── Clinical Exam Records ─────────────────────────────────────────────────────
-- Complex nested structures stored as JSON blobs in D1.
-- Flat scalar fields are indexed for list/filter queries.
CREATE TABLE IF NOT EXISTS exams (
  id                TEXT    PRIMARY KEY,
  organization_id   TEXT    NOT NULL DEFAULT 'org-001',
  patient_id        TEXT    NOT NULL,
  patient_name      TEXT    NOT NULL,
  patient_dob       TEXT,
  appointment_id    TEXT,
  exam_date         TEXT    NOT NULL,
  exam_time         TEXT,
  exam_type         TEXT    NOT NULL DEFAULT 'COMPREHENSIVE',
  provider_id       TEXT,
  provider_name     TEXT,
  status            TEXT    NOT NULL DEFAULT 'DRAFT'
                              CHECK(status IN ('DRAFT','IN_PROGRESS','COMPLETE','SIGNED','AMENDED')),
  completion_pct    INTEGER NOT NULL DEFAULT 0,

  -- JSON blobs for complex nested clinical data
  chief_complaint   TEXT,   -- JSON: ChiefComplaint
  medical_history   TEXT,   -- JSON: MedicalHistory
  visual_acuity     TEXT,   -- JSON: VisualAcuity
  pupils            TEXT,   -- JSON: PupilExam
  eom               TEXT,   -- JSON: EOM
  confrontation_fields TEXT,-- JSON: ConfrontationFields
  iop               TEXT,   -- JSON: IopReading
  slit_lamp         TEXT,   -- JSON: SlitLamp
  fundus            TEXT,   -- JSON: FundusExam
  refraction        TEXT,   -- JSON: Refraction
  assessment        TEXT,   -- JSON: Assessment

  signed_by         TEXT,
  signed_at         TEXT,
  amended_at        TEXT,
  amendment_note    TEXT,

  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY(patient_id)    REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY(provider_id)   REFERENCES providers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_exams_patient    ON exams(patient_id, exam_date DESC);
CREATE INDEX IF NOT EXISTS idx_exams_date       ON exams(exam_date DESC);
CREATE INDEX IF NOT EXISTS idx_exams_provider   ON exams(provider_id, exam_date DESC);
CREATE INDEX IF NOT EXISTS idx_exams_status     ON exams(status);
CREATE INDEX IF NOT EXISTS idx_exams_org        ON exams(organization_id, exam_date DESC);

-- ── Seed exam records ─────────────────────────────────────────────────────────
INSERT OR IGNORE INTO exams (
  id, organization_id, patient_id, patient_name, patient_dob,
  appointment_id, exam_date, exam_time, exam_type,
  provider_id, provider_name, status, completion_pct,
  chief_complaint, medical_history, visual_acuity, pupils, eom,
  confrontation_fields, iop, slit_lamp, fundus, refraction, assessment,
  signed_by, signed_at, created_at, updated_at
) VALUES (
  'exam-001', 'org-001', 'pt-001', 'Margaret Sullivan', '1948-06-14',
  'appt-001', '2026-03-07', '08:00', 'COMPREHENSIVE',
  'dr-chen', 'Dr. Sarah Chen, OD', 'SIGNED', 100,
  '{"chief":"Annual comprehensive eye exam","hpi":"Patient presents for routine annual exam. Reports mild blur at distance with current glasses. No new symptoms. Glaucoma follow-up included.","onset":"Gradual over 6 months","severity":"3"}',
  '{"ocular":"Glaucoma (diagnosed 2019), Pseudophakia OU (cataract surgery 2021)","systemic":"Hypertension, Hyperlipidemia","surgical":"Cataract extraction with IOL implantation OU (2021)","medications":"Timolol 0.5% BID OU, Latanoprost 0.005% QHS OS, Lisinopril 10mg QD, Atorvastatin 40mg QD","allergies":"Penicillin, Sulfa drugs"}',
  '{"od":{"sc":"20/100","cc":"20/30","ph":"20/25"},"os":{"sc":"20/200","cc":"20/40","ph":"20/30"},"method":"Snellen"}',
  '{"od":{"size":"3mm","reaction":"Brisk"},"os":{"size":"3mm","reaction":"Brisk"},"apd":"none"}',
  '{"od":"Full","os":"Full","versions":"Full, smooth, comitant","cover":"Orthophoria"}',
  '{"od":"Full","os":"Full"}',
  '{"od":16,"os":14,"method":"Goldmann","time":"08:15"}',
  '{"od":{"lids":"WNL","conjunctiva":"Clear, white, quiet","cornea":"Clear, trace guttata","anteriorChamber":"Deep and quiet","acCell":"WNL","acFlare":"WNL","iris":"Flat, round, intact","lens":"IOL in place, posterior capsule clear"},"os":{"lids":"WNL","conjunctiva":"Clear, white, quiet","cornea":"Clear","anteriorChamber":"Deep and quiet","acCell":"WNL","acFlare":"WNL","iris":"Flat, round, intact","lens":"IOL in place, posterior capsule clear"},"dilation":{"performed":true,"agent":"1% Tropicamide + 2.5% Phenylephrine","time":"08:20","readyTime":"08:45"}}',
  '{"od":{"disc":"Pink, sharp margins, distinct","cdRatio":"0.5","cdRatioV":"0.5","rim":"Intact rim tissue, no notching","vessels":"A/V ratio 2/3, mild AV nicking","macula":"Flat, even reflex, no drusen","periphery":"Flat, no tears, breaks or lattice"},"os":{"disc":"Pink, sharp margins","cdRatio":"0.6","cdRatioV":"0.6","rim":"Inferior rim slightly thinned","vessels":"A/V ratio 2/3","macula":"Flat, even reflex","periphery":"Flat, no pathology"},"method":"BIO","dilated":true}',
  '{"od":{"sphere":"-1.25","cylinder":"-0.50","axis":95,"vaWithRx":"20/25"},"os":{"sphere":"-1.75","cylinder":"-0.75","axis":82,"vaWithRx":"20/30"},"finalRxOd":{"sphere":"-1.25","cylinder":"-0.50","axis":95,"add":"+2.50"},"finalRxOs":{"sphere":"-1.75","cylinder":"-0.75","axis":82,"add":"+2.50"},"type":"Manifest","pupillaryDistance":{"od":32,"os":32}}',
  '{"diagnoses":[{"icd10Code":"H40.1130","description":"POAG, bilateral, mild stage","eye":"OU","chronic":true,"primary":true},{"icd10Code":"Z96.1","description":"Presence of intraocular lens","eye":"OU","chronic":true},{"icd10Code":"H52.10","description":"Myopia, unspecified","eye":"OU","chronic":false}],"plan":[{"category":"Medication","description":"Continue Timolol 0.5% BID OU","eye":"OU"},{"category":"Medication","description":"Continue Latanoprost 0.005% QHS OS","eye":"OS"},{"category":"Testing","description":"Visual field test (HVF 24-2) — both eyes"},{"category":"Optical","description":"Update distance Rx, progressive lenses"},{"category":"Follow-up","description":"Return in 6 months for glaucoma IOP check"}],"followUp":"6 months","providerNotes":"IOP well controlled on current regimen. OS disc slightly larger cup — continue monitoring. New Rx issued."}',
  'Dr. Sarah Chen, OD', '2026-03-07T09:45:00Z',
  '2026-03-07T08:00:00Z', '2026-03-07T09:45:00Z'
);

INSERT OR IGNORE INTO exams (
  id, organization_id, patient_id, patient_name, patient_dob,
  appointment_id, exam_date, exam_time, exam_type,
  provider_id, provider_name, status, completion_pct,
  chief_complaint, medical_history, visual_acuity, iop, slit_lamp, fundus, assessment,
  created_at, updated_at
) VALUES (
  'exam-002', 'org-001', 'pt-002', 'Derek Holloway', '1972-03-28',
  'appt-002', '2026-03-07', '09:00', 'DIABETIC',
  'dr-patel', 'Dr. Raj Patel, MD', 'IN_PROGRESS', 75,
  '{"chief":"Diabetic eye exam — annual","hpi":"Type 2 DM for 12 years. Last HbA1c 7.8%. No new visual complaints. Mild blur distance.","severity":"2"}',
  '{"ocular":"Background diabetic retinopathy OS (2024)","systemic":"Type 2 Diabetes Mellitus (x12yr), Hypertension, Obesity","medications":"Metformin 1000mg BID, Lisinopril 20mg QD, Aspirin 81mg QD","allergies":"NKDA"}',
  '{"od":{"sc":"20/30","cc":"20/20"},"os":{"sc":"20/50","cc":"20/30","ph":"20/25"},"method":"Snellen"}',
  '{"od":15,"os":17,"method":"Non-contact","time":"09:10"}',
  '{"od":{"conjunctiva":"Clear","cornea":"Clear","anteriorChamber":"Deep and quiet","acCell":"WNL","acFlare":"WNL","lens":"Trace nuclear sclerosis"},"os":{"conjunctiva":"Clear","cornea":"Clear","anteriorChamber":"Deep and quiet","acCell":"WNL","acFlare":"WNL","lens":"Trace nuclear sclerosis"},"dilation":{"performed":true,"agent":"1% Tropicamide","time":"09:15","readyTime":"09:40"}}',
  '{"od":{"disc":"Pink, sharp, 0.3 C/D","cdRatio":"0.3","vessels":"Mild AV nicking, no NVD","macula":"Flat, no exudate","periphery":"Dot hemorrhages peripheral, no NVE"},"os":{"disc":"Pink, sharp, 0.4 C/D","cdRatio":"0.4","vessels":"Scattered dot-blot hemorrhages, microaneurysms","macula":"Hard exudate approaching fovea — concern for CSME","periphery":"Dot-blot hemorrhages, microaneurysms x 3 quadrants"},"method":"BIO","dilated":true}',
  '{"diagnoses":[{"icd10Code":"E11.3591","description":"T2DM with proliferative DR without DME, right eye","eye":"OD","primary":true},{"icd10Code":"E11.3592","description":"T2DM with non-proliferative DR moderate, left eye","eye":"OS","primary":false}],"plan":[{"category":"Referral","description":"Retina consult for OS CSME evaluation","eye":"OS","details":"Urgent — within 2 weeks"},{"category":"Testing","description":"OCT macula OS — today"},{"category":"Education","description":"Diabetic eye disease counseling provided"},{"category":"Follow-up","description":"Return 3 months or sooner if vision change"}],"followUp":"3 months"}',
  '2026-03-07T09:00:00Z', '2026-03-07T10:30:00Z'
);

INSERT OR IGNORE INTO exams (
  id, organization_id, patient_id, patient_name, patient_dob,
  exam_date, exam_time, exam_type,
  provider_id, provider_name, status, completion_pct,
  chief_complaint, medical_history, visual_acuity, iop,
  created_at, updated_at
) VALUES (
  'exam-003', 'org-001', 'pt-003', 'Priya Nair', '1988-11-22',
  '2026-03-07', '10:00', 'CONTACT_LENS',
  'dr-chen', 'Dr. Sarah Chen, OD', 'DRAFT', 25,
  '{"chief":"Contact lens fitting — first time","hpi":"Established patient requesting contact lenses. Currently wearing glasses -3.25 OD, -3.75 OS. Works on computer 8+ hours/day."}',
  '{"systemic":"No systemic conditions","medications":"None","allergies":"NKDA"}',
  '{"od":{"sc":"20/400","cc":"20/20"},"os":{"sc":"20/400","cc":"20/20"}}',
  '{"od":12,"os":13,"method":"Non-contact"}',
  '2026-03-07T10:00:00Z', '2026-03-07T10:05:00Z'
);
