-- OculoFlow Billing Schema Migration 0004
-- Superbills, payments

CREATE TABLE IF NOT EXISTS superbills (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  patient_name TEXT,
  exam_id TEXT,
  appointment_id TEXT,
  service_date TEXT,
  provider_id TEXT,
  provider_name TEXT,
  provider_npi TEXT,
  primary_insurance TEXT,
  total_charge REAL DEFAULT 0,
  copay_amount REAL DEFAULT 0,
  copay_collected REAL DEFAULT 0,
  insurance_billed REAL DEFAULT 0,
  insurance_paid REAL DEFAULT 0,
  patient_balance REAL DEFAULT 0,
  adjustments REAL DEFAULT 0,
  status TEXT CHECK (status IN ('DRAFT','PENDING_REVIEW','REVIEWED','SUBMITTED','PAID','DENIED','VOID')) DEFAULT 'DRAFT',
  notes TEXT,
  claim_number TEXT,
  submitted_at TEXT,
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS superbill_diagnoses (
  id TEXT PRIMARY KEY,
  superbill_id TEXT NOT NULL,
  icd10_code TEXT NOT NULL,
  description TEXT,
  is_primary INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (superbill_id) REFERENCES superbills(id)
);

CREATE TABLE IF NOT EXISTS superbill_line_items (
  id TEXT PRIMARY KEY,
  superbill_id TEXT NOT NULL,
  cpt_code TEXT NOT NULL,
  description TEXT,
  icd10_pointers TEXT,
  units INTEGER DEFAULT 1,
  fee REAL DEFAULT 0,
  total REAL DEFAULT 0,
  modifier TEXT,
  eye TEXT,
  approved INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (superbill_id) REFERENCES superbills(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  superbill_id TEXT,
  amount REAL NOT NULL,
  payment_method TEXT,
  reference_number TEXT,
  notes TEXT,
  posted_at TEXT DEFAULT (datetime('now')),
  created_by TEXT,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE INDEX IF NOT EXISTS idx_superbills_org ON superbills(organization_id);
CREATE INDEX IF NOT EXISTS idx_superbills_patient ON superbills(patient_id);
CREATE INDEX IF NOT EXISTS idx_superbills_status ON superbills(status);
CREATE INDEX IF NOT EXISTS idx_superbill_diagnoses_sb ON superbill_diagnoses(superbill_id);
CREATE INDEX IF NOT EXISTS idx_superbill_line_items_sb ON superbill_line_items(superbill_id);
CREATE INDEX IF NOT EXISTS idx_payments_patient ON payments(patient_id);
