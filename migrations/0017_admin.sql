-- ─────────────────────────────────────────────────────────────────────────────
-- OculoFlow — Migration 0017: Admin Module
-- Practice Settings, Locations, Module Toggles
-- ─────────────────────────────────────────────────────────────────────────────

-- Practice settings (flexible key-value store)
CREATE TABLE IF NOT EXISTS practice_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

-- Seed default practice settings
INSERT OR IGNORE INTO practice_settings (key, value) VALUES
  ('practice_name',      'Advanced Eye Care of Miami'),
  ('practice_npi',       '1234567890'),
  ('practice_address',   '123 Main Street'),
  ('practice_city',      'Miami'),
  ('practice_state',     'FL'),
  ('practice_zip',       '33101'),
  ('practice_phone',     '(305) 555-0100'),
  ('practice_fax',       '(305) 555-0101'),
  ('practice_email',     'info@advancedeyecaremiami.com'),
  ('practice_timezone',  'America/New_York'),
  ('practice_website',   'https://advancedeyecaremiami.com'),
  ('ehr_default_exam',   'COMPREHENSIVE'),
  ('ehr_rx_format',      'standard'),
  ('billing_tax_id',     '12-3456789'),
  ('billing_place_of_service', '11');

-- Office locations
CREATE TABLE IF NOT EXISTS locations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  address    TEXT,
  city       TEXT,
  state      TEXT,
  zip        TEXT,
  phone      TEXT,
  fax        TEXT,
  timezone   TEXT DEFAULT 'America/New_York',
  is_active  INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default location
INSERT OR IGNORE INTO locations (id, name, address, city, state, zip, phone, fax, timezone) VALUES
  ('loc-001', 'Advanced Eye Care of Miami — Main', '123 Main Street', 'Miami', 'FL', '33101', '(305) 555-0100', '(305) 555-0101', 'America/New_York');

-- Module on/off toggles
CREATE TABLE IF NOT EXISTS module_settings (
  module_id  TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  is_enabled INTEGER DEFAULT 1,
  category   TEXT DEFAULT 'clinical',
  sort_order INTEGER DEFAULT 99,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_by TEXT
);

-- Seed all modules with defaults
INSERT OR IGNORE INTO module_settings (module_id, label, is_enabled, category, sort_order) VALUES
  ('dashboard',    'Dashboard',               1, 'core',          1),
  ('patients',     'Patients',                1, 'core',          2),
  ('scheduling',   'Scheduling',              1, 'core',          3),
  ('exam',         'Clinical Exams',          1, 'clinical',      4),
  ('billing',      'Billing & Claims',        1, 'billing',       5),
  ('optical',      'Optical Dispensary',      1, 'clinical',      6),
  ('reports',      'Reports & Analytics',     1, 'reporting',     7),
  ('portal',       'Patient Portal',          1, 'patient',       8),
  ('messaging',    'Clinical Messaging',      1, 'clinical',      9),
  ('reminders',    'Reminders',               1, 'clinical',      10),
  ('scorecards',   'Provider Scorecards',     1, 'reporting',     11),
  ('telehealth',   'Telehealth',              1, 'clinical',      12),
  ('erx',          'E-Prescribing',           1, 'clinical',      13),
  ('ai',           'AI Clinical Decision',    1, 'clinical',      14),
  ('priorauth',    'Prior Authorization',     1, 'billing',       15),
  ('rcm',          'Revenue Cycle (RCM)',     1, 'billing',       16),
  ('engagement',   'Patient Engagement',      1, 'patient',       17),
  ('analytics',    'Advanced Analytics',      1, 'reporting',     18),
  ('audit',        'HIPAA Audit Log',         1, 'admin',         19),
  ('documents',    'Documents',               1, 'clinical',      20),
  ('mfa',          'Multi-Factor Auth',       1, 'admin',         21);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_module_settings_enabled ON module_settings(is_enabled);
CREATE INDEX IF NOT EXISTS idx_locations_active ON locations(is_active);
