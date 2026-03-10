-- 0008_seed_fixes.sql  
-- Add compat columns to waitlist so lib seed/queries work

ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS created_at TEXT;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS updated_at TEXT;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS urgency TEXT;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS preferred_provider_id TEXT;
ALTER TABLE waitlist ADD COLUMN IF NOT EXISTS preferred_provider_name TEXT;

UPDATE waitlist SET created_at = added_at WHERE created_at IS NULL;
UPDATE waitlist SET updated_at = added_at WHERE updated_at IS NULL;
