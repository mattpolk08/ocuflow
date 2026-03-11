-- Migration 0010: Add missing columns to optical_rx
-- These columns are required by the createRx INSERT added in fix 976d25d
-- Production D1 was created from 0005_optical.sql which predates these fields.

ALTER TABLE optical_rx ADD COLUMN patient_name    TEXT;
ALTER TABLE optical_rx ADD COLUMN provider_name   TEXT;
ALTER TABLE optical_rx ADD COLUMN expires_date    TEXT;
ALTER TABLE optical_rx ADD COLUMN is_signed       INTEGER DEFAULT 0;
