-- Migration 0010: Add missing columns to optical_rx
-- These columns are required by the createRx INSERT added in fix 976d25d
-- Production D1 was created from 0005_optical.sql which predates these fields.

ALTER TABLE optical_rx ADD COLUMN patient_name    TEXT;
ALTER TABLE optical_rx ADD COLUMN provider_name   TEXT;
ALTER TABLE optical_rx ADD COLUMN expires_date    TEXT;
ALTER TABLE optical_rx ADD COLUMN is_signed       INTEGER DEFAULT 0;

-- Backfill the rx-001 seed row (inserted by 0009 before these columns existed)
UPDATE optical_rx
SET provider_name = 'Dr. Emily Chen',
    is_signed     = 1,
    expires_date  = '2028-02-10'
WHERE id = 'rx-001'
  AND provider_name IS NULL;
