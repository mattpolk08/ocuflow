-- ─────────────────────────────────────────────────────────────────────────────
-- 0007_schema_alignment.sql
-- Adds missing column aliases so the KV→D1 lib code (e541874) works against
-- the pre-existing remote schema. Only adds columns that do NOT already exist.
-- Safe to re-run: D1 migration tracker prevents double-execution.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── patients ──────────────────────────────────────────────────────────────────
-- Remote already has: cell_phone ✓
-- Missing: address_street, address_city, address_state, address_zip,
--          address_country, home_phone, allergies_json,
--          current_medications_json, insurance_plans_json,
--          emergency_contact_name, emergency_contact_relationship,
--          emergency_contact_phone, notes

ALTER TABLE patients ADD COLUMN address_street               TEXT;
ALTER TABLE patients ADD COLUMN address_city                 TEXT;
ALTER TABLE patients ADD COLUMN address_state                TEXT;
ALTER TABLE patients ADD COLUMN address_zip                  TEXT;
ALTER TABLE patients ADD COLUMN address_country              TEXT DEFAULT 'US';
ALTER TABLE patients ADD COLUMN home_phone                   TEXT;
ALTER TABLE patients ADD COLUMN allergies_json               TEXT DEFAULT '[]';
ALTER TABLE patients ADD COLUMN current_medications_json     TEXT DEFAULT '[]';
ALTER TABLE patients ADD COLUMN insurance_plans_json         TEXT DEFAULT '[]';
ALTER TABLE patients ADD COLUMN emergency_contact_name       TEXT;
ALTER TABLE patients ADD COLUMN emergency_contact_relationship TEXT;
ALTER TABLE patients ADD COLUMN emergency_contact_phone      TEXT;
ALTER TABLE patients ADD COLUMN notes                        TEXT;

-- Backfill from old column names
UPDATE patients SET
  address_street = addr_street,
  address_city   = addr_city,
  address_state  = addr_state,
  address_zip    = addr_zip,
  home_phone     = cell_phone,
  allergies_json = CASE WHEN allergies IS NOT NULL AND allergies != ''
                        THEN json_array(allergies) ELSE '[]' END,
  current_medications_json = CASE WHEN current_medications IS NOT NULL AND current_medications != ''
                                  THEN json_array(current_medications) ELSE '[]' END
WHERE address_street IS NULL;

-- ── appointments ─────────────────────────────────────────────────────────────
-- Remote already has: checked_in_at ✓
-- Missing: appointment_date, room_id, reason, checked_out_at

ALTER TABLE appointments ADD COLUMN appointment_date  TEXT;
ALTER TABLE appointments ADD COLUMN room_id           TEXT;
ALTER TABLE appointments ADD COLUMN reason            TEXT;
ALTER TABLE appointments ADD COLUMN checked_out_at    TEXT;

-- Backfill
UPDATE appointments SET
  appointment_date = appt_date,
  room_id          = room,
  reason           = chief_complaint,
  checked_out_at   = completed_at
WHERE appointment_date IS NULL;

-- ── lenses ───────────────────────────────────────────────────────────────────
-- Remote has index_val, sphere_range, cyl_range
-- Missing: index_value, sphere_min, sphere_max, cylinder_max

ALTER TABLE lenses ADD COLUMN index_value   REAL;
ALTER TABLE lenses ADD COLUMN sphere_min    REAL;
ALTER TABLE lenses ADD COLUMN sphere_max    REAL;
ALTER TABLE lenses ADD COLUMN cylinder_max  REAL;

-- Backfill index_value from index_val
UPDATE lenses SET index_value = index_val WHERE index_value IS NULL;

-- Parse sphere_range text (e.g. "-12.00 to +12.00") into sphere_min / sphere_max
-- and cyl_range into cylinder_max; guard against NULL or missing ' to ' separator
UPDATE lenses SET
  sphere_min = CASE
    WHEN sphere_range IS NOT NULL AND INSTR(sphere_range, ' to ') > 0
    THEN CAST(TRIM(SUBSTR(sphere_range, 1, INSTR(sphere_range, ' to ') - 1)) AS REAL)
    ELSE -20.0
  END,
  sphere_max = CASE
    WHEN sphere_range IS NOT NULL AND INSTR(sphere_range, ' to ') > 0
    THEN CAST(TRIM(SUBSTR(sphere_range, INSTR(sphere_range, ' to ') + 4)) AS REAL)
    ELSE 20.0
  END,
  cylinder_max = CASE
    WHEN cyl_range IS NOT NULL AND INSTR(cyl_range, ' to ') > 0
    THEN CAST(TRIM(SUBSTR(cyl_range, INSTR(cyl_range, ' to ') + 4)) AS REAL)
    ELSE 6.0
  END
WHERE sphere_min IS NULL;

-- ── optical_orders ───────────────────────────────────────────────────────────
-- Remote already has: order_type ✓
-- Missing: frame_id, frame_sku, frame_brand, frame_model, frame_color,
--          lens_id, lens_sku, lens_name, lens_type,
--          od_sphere, od_cylinder, od_axis, od_add, od_pd,
--          os_sphere, os_cylinder, os_axis, os_add, os_pd,
--          binocular_pd, coating, tint

ALTER TABLE optical_orders ADD COLUMN frame_id      TEXT;
ALTER TABLE optical_orders ADD COLUMN frame_sku     TEXT;
ALTER TABLE optical_orders ADD COLUMN frame_brand   TEXT;
ALTER TABLE optical_orders ADD COLUMN frame_model   TEXT;
ALTER TABLE optical_orders ADD COLUMN frame_color   TEXT;
ALTER TABLE optical_orders ADD COLUMN lens_id       TEXT;
ALTER TABLE optical_orders ADD COLUMN lens_sku      TEXT;
ALTER TABLE optical_orders ADD COLUMN lens_name     TEXT;
ALTER TABLE optical_orders ADD COLUMN lens_type     TEXT;
ALTER TABLE optical_orders ADD COLUMN od_sphere     REAL;
ALTER TABLE optical_orders ADD COLUMN od_cylinder   REAL;
ALTER TABLE optical_orders ADD COLUMN od_axis       INTEGER;
ALTER TABLE optical_orders ADD COLUMN od_add        REAL;
ALTER TABLE optical_orders ADD COLUMN od_pd         REAL;
ALTER TABLE optical_orders ADD COLUMN os_sphere     REAL;
ALTER TABLE optical_orders ADD COLUMN os_cylinder   REAL;
ALTER TABLE optical_orders ADD COLUMN os_axis       INTEGER;
ALTER TABLE optical_orders ADD COLUMN os_add        REAL;
ALTER TABLE optical_orders ADD COLUMN os_pd         REAL;
ALTER TABLE optical_orders ADD COLUMN binocular_pd  REAL;
ALTER TABLE optical_orders ADD COLUMN coating       TEXT;
ALTER TABLE optical_orders ADD COLUMN tint          TEXT;

-- ── optical_rx ───────────────────────────────────────────────────────────────
-- Missing: updated_at (SELECT * in lib code will error without it)
ALTER TABLE optical_rx ADD COLUMN updated_at TEXT;
UPDATE optical_rx SET updated_at = created_at WHERE updated_at IS NULL;
