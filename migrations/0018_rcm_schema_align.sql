-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 0018: Align rcm_claims table with lib expectations
-- Adds missing columns that the D1-backed lib reads/writes
-- ─────────────────────────────────────────────────────────────────────────────

-- Add columns that rcm.ts lib expects (npi, submission_date, adjustment, 
-- patient_responsibility, lines, payments, denials, notes)
ALTER TABLE rcm_claims ADD COLUMN npi TEXT;
ALTER TABLE rcm_claims ADD COLUMN submission_date TEXT;
ALTER TABLE rcm_claims ADD COLUMN adjustment REAL NOT NULL DEFAULT 0;
ALTER TABLE rcm_claims ADD COLUMN patient_responsibility REAL NOT NULL DEFAULT 0;
ALTER TABLE rcm_claims ADD COLUMN lines TEXT NOT NULL DEFAULT '[]';
ALTER TABLE rcm_claims ADD COLUMN payments TEXT NOT NULL DEFAULT '[]';
ALTER TABLE rcm_claims ADD COLUMN denials TEXT NOT NULL DEFAULT '[]';
ALTER TABLE rcm_claims ADD COLUMN notes TEXT NOT NULL DEFAULT '[]';

-- Copy existing data from renamed columns to the lib-expected columns
UPDATE rcm_claims SET 
  npi = provider_npi,
  submission_date = submitted_date,
  adjustment = COALESCE(total_adjustment, 0),
  patient_responsibility = COALESCE(total_patient_responsibility, 0)
WHERE npi IS NULL;
