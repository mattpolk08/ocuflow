-- Migration 0011: Add provider_id column to optical_orders
-- The production D1 table was created before this field was added to the schema.
-- Using IF NOT EXISTS guard so re-running is safe.

ALTER TABLE optical_orders ADD COLUMN provider_id TEXT;
ALTER TABLE optical_orders ADD COLUMN provider_name TEXT;
