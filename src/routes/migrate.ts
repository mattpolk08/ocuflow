// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — One-Shot Migration Runner (temporary — remove after use)
// POST /api/migrate/run  — executes a named migration against D1
// Protected by MIGRATE_SECRET header.
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  DB: D1Database
  MIGRATE_SECRET?: string
}

const migrateRoutes = new Hono<{ Bindings: Bindings }>()

// ── Migration SQL payloads ────────────────────────────────────────────────────

const MIGRATION_0009 = `
INSERT OR IGNORE INTO optical_rx
  (id, patient_id, exam_id, provider_id,
   rx_date, expires_date,
   od_sphere, od_cylinder, od_axis, od_add, od_pd, od_va,
   os_sphere, os_cylinder, os_axis, os_add, os_pd, os_va,
   binocular_pd, lens_type, provider_name, is_signed, notes,
   created_at, updated_at)
VALUES
  ('rx-001', 'pt-001', NULL, 'dr-chen',
   '2026-02-10', '2028-02-10',
   -2.25, -0.50, 180, 2.00, 31.5, '20/20',
   -1.75, -0.75, 175, 2.00, 32.0, '20/20',
   63.5, 'PROGRESSIVE', 'Dr. Emily Chen', 1,
   'Patient adapted well to progressive design',
   datetime('now'), datetime('now'));
`

const MIGRATION_0009_ORDER = `
INSERT OR IGNORE INTO optical_orders
  (id, organization_id, patient_id, patient_name, rx_id,
   order_number, order_type, status, lab,
   frame_id, frame_sku, frame_brand, frame_model, frame_color,
   lens_id, lens_sku, lens_name, lens_type,
   od_sphere, od_cylinder, od_axis, od_add, od_pd,
   os_sphere, os_cylinder, os_axis, os_add, os_pd,
   binocular_pd, coating, tint,
   subtotal, discount, insurance_benefit, tax_amount,
   total_charge, deposit_paid, balance_due,
   special_instructions, internal_notes,
   estimated_ready, received_at,
   created_at, updated_at)
VALUES
  ('ord-001', 'org-001', 'pt-001', 'Margaret Sullivan', 'rx-001',
   'OPT-260310-0001', 'EYEGLASSES', 'READY_FOR_PICKUP', 'Vision One Labs',
   'frm-001', 'MJ-WESTSIDE-MB', 'Maui Jim', 'Westside', 'Matte Black 52-18',
   'len-001', 'HI-IDX-167-AR', 'Progressive Hi-Index 1.67 AR Premium', 'PROGRESSIVE',
   -2.25, -0.50, 180, 2.00, 31.5,
   -1.75, -0.75, 175, 2.00, 32.0,
   63.5, 'AR Premium', null,
   247.00, 0.00, 0.00, 0.00,
   315.00, 150.00, 165.00,
   'Rush order', null,
   '2026-02-16', '2026-02-15T14:00:00Z',
   datetime('now'), datetime('now'));
`

const MIGRATION_0009_SB = `
INSERT OR IGNORE INTO superbills
  (id, organization_id, patient_id, patient_name, service_date,
   provider_id, provider_name,
   total_charge, copay_amount, copay_collected,
   insurance_billed, insurance_paid, patient_balance, adjustments,
   status, created_at, updated_at)
VALUES
  ('sb-001', 'org-001', 'pt-001', 'Margaret Sullivan', '2026-02-10',
   'dr-chen', 'Dr. Emily Chen',
   350.00, 30.00, 30.00,
   252.00, 0.00, 68.00, 98.00,
   'SUBMITTED', datetime('now'), datetime('now'));
`

const OPTICAL_FRAMES = `
INSERT OR IGNORE INTO frames
  (id, organization_id, sku, brand, model, color, size, category, gender,
   material, wholesale, retail, quantity, min_quantity, status, created_at, updated_at)
VALUES
  ('frm-001','org-001','RB3025-001','Ray-Ban','Aviator','Gold/Green','58-14','SUNGLASSES','UNISEX','Metal',75,185,3,2,'IN_STOCK',datetime('now'),datetime('now')),
  ('frm-002','org-001','VO5051-001','Vogue','VO5051S','Black','54-16','EYEGLASSES','FEMALE','Acetate',45,120,5,2,'IN_STOCK',datetime('now'),datetime('now')),
  ('frm-003','org-001','OO9013-001','Oakley','Holbrook','Matte Black','55-18','SUNGLASSES','MALE','O-Matter',85,200,0,2,'OUT_OF_STOCK',datetime('now'),datetime('now'));
`

const OPTICAL_LENSES = `
INSERT OR IGNORE INTO lenses
  (id, organization_id, sku, name, type, material, coating, index_value,
   wholesale, retail, quantity, min_quantity, status, created_at, updated_at)
VALUES
  ('len-001','org-001','CR39-SV-001','CR-39 Single Vision','SINGLE_VISION','CR-39','AR',1.50,25,80,20,5,'IN_STOCK',datetime('now'),datetime('now')),
  ('len-002','org-001','POLY-SV-001','Polycarbonate Single Vision','SINGLE_VISION','Polycarbonate','AR+UV',1.59,35,110,15,5,'IN_STOCK',datetime('now'),datetime('now'));
`

// ── Run migration endpoint ────────────────────────────────────────────────────

migrateRoutes.post('/run', async (c) => {
  // Secret guard — must pass X-Migrate-Secret header
  const secret = c.req.header('X-Migrate-Secret')
  const expected = c.env.MIGRATE_SECRET ?? 'oculoflow-migrate-2026'
  if (secret !== expected) {
    return c.json({ success: false, error: 'Forbidden' }, 403)
  }

  const db = c.env.DB
  if (!db) return c.json({ success: false, error: 'DB binding not available' }, 500)

  const results: Record<string, string> = {}

  const runStmt = async (name: string, sql: string) => {
    try {
      await db.prepare(sql.trim()).run()
      results[name] = 'OK'
    } catch (err: any) {
      results[name] = `ERROR: ${err.message}`
    }
  }

  // Seed frames + lenses first (needed for FK constraints in some schemas)
  await runStmt('frames', OPTICAL_FRAMES.trim())
  await runStmt('lenses', OPTICAL_LENSES.trim())
  await runStmt('rx-001', MIGRATION_0009.trim())
  await runStmt('ord-001', MIGRATION_0009_ORDER.trim())
  await runStmt('sb-001', MIGRATION_0009_SB.trim())

  // Verify counts
  const rxCount   = await db.prepare("SELECT COUNT(*) as n FROM optical_rx    WHERE id='rx-001'").first<{n:number}>()
  const ordCount  = await db.prepare("SELECT COUNT(*) as n FROM optical_orders WHERE id='ord-001'").first<{n:number}>()
  const sbCount   = await db.prepare("SELECT COUNT(*) as n FROM superbills     WHERE id='sb-001'").first<{n:number}>()
  const frmCount  = await db.prepare("SELECT COUNT(*) as n FROM frames").first<{n:number}>()
  const lenCount  = await db.prepare("SELECT COUNT(*) as n FROM lenses").first<{n:number}>()

  return c.json({
    success: true,
    message: 'Migration 0009 applied',
    results,
    verification: {
      rx_001_present:  (rxCount?.n  ?? 0) > 0,
      ord_001_present: (ordCount?.n ?? 0) > 0,
      sb_001_present:  (sbCount?.n  ?? 0) > 0,
      frames_total:    frmCount?.n  ?? 0,
      lenses_total:    lenCount?.n  ?? 0,
    },
  })
})

export default migrateRoutes
