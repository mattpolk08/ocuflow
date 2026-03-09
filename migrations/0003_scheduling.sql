-- OculoFlow Scheduling Schema Migration 0003
-- Appointments, waitlist

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  patient_name TEXT,
  provider_id TEXT NOT NULL,
  provider_name TEXT,
  appointment_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  appointment_type TEXT,
  status TEXT CHECK (status IN ('SCHEDULED','CHECKED_IN','IN_EXAM','CHECKED_OUT','COMPLETED','CANCELLED','NO_SHOW')) DEFAULT 'SCHEDULED',
  room_id TEXT,
  reason TEXT,
  notes TEXT,
  confirmation_code TEXT,
  checked_in_at TEXT,
  checked_out_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  patient_name TEXT,
  preferred_dates TEXT,
  preferred_times TEXT,
  preferred_provider_id TEXT,
  preferred_provider_name TEXT,
  urgency TEXT,
  status TEXT DEFAULT 'PENDING',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE INDEX IF NOT EXISTS idx_appointments_org ON appointments(organization_id);
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_appointments_provider ON appointments(provider_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_org ON waitlist(organization_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_patient ON waitlist(patient_id);
