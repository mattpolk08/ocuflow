-- OculoFlow Core Schema Migration 0001
-- Organizations, staff users, providers, rooms, patients

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  email TEXT,
  tax_id TEXT,
  npi TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS staff_users (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  display_name TEXT,
  role TEXT CHECK (role IN ('ADMIN','PROVIDER','BILLING','FRONT_DESK','NURSE','OPTICAL')) DEFAULT 'FRONT_DESK',
  provider_id TEXT,
  is_active INTEGER DEFAULT 1,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT,
  ip_address TEXT,
  FOREIGN KEY (user_id) REFERENCES staff_users(id)
);

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  credentials TEXT,
  specialty TEXT,
  color TEXT,
  npi TEXT,
  is_active INTEGER DEFAULT 1,
  work_days TEXT,
  start_time TEXT,
  end_time TEXT,
  lunch_start TEXT,
  lunch_end TEXT,
  slot_duration INTEGER DEFAULT 20,
  max_patients_per_day INTEGER DEFAULT 20,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'EXAM',
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS patients (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  mrn TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth TEXT,
  gender TEXT,
  email TEXT,
  phone TEXT,
  cell_phone TEXT,
  home_phone TEXT,
  address_street TEXT,
  address_city TEXT,
  address_state TEXT,
  address_zip TEXT,
  address_country TEXT DEFAULT 'US',
  emergency_contact_name TEXT,
  emergency_contact_relationship TEXT,
  emergency_contact_phone TEXT,
  preferred_language TEXT DEFAULT 'en',
  is_new_patient INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  portal_access INTEGER DEFAULT 0,
  last_visit_date TEXT,
  allergies_json TEXT,
  current_medications_json TEXT,
  insurance_plans_json TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS patient_insurance (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  payer_id TEXT,
  payer_name TEXT NOT NULL,
  member_id TEXT NOT NULL,
  group_number TEXT,
  plan_name TEXT,
  relationship TEXT DEFAULT 'SELF',
  subscriber_first_name TEXT,
  subscriber_last_name TEXT,
  subscriber_dob TEXT,
  is_primary INTEGER DEFAULT 1,
  copay REAL,
  deductible REAL,
  deductible_met REAL DEFAULT 0,
  out_of_pocket_max REAL,
  out_of_pocket_met REAL DEFAULT 0,
  eligibility_status TEXT DEFAULT 'UNKNOWN',
  last_verified_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE INDEX IF NOT EXISTS idx_staff_users_org ON staff_users(organization_id);
CREATE INDEX IF NOT EXISTS idx_staff_users_email ON staff_users(email);
CREATE INDEX IF NOT EXISTS idx_patients_org ON patients(organization_id);
CREATE INDEX IF NOT EXISTS idx_patients_mrn ON patients(mrn);
CREATE INDEX IF NOT EXISTS idx_patients_email ON patients(email);
CREATE INDEX IF NOT EXISTS idx_patients_name ON patients(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
