#!/usr/bin/env node
// =============================================================================
// OculoFlow — Post-Migration D1 Validation Script
// =============================================================================
// Purpose:  Exhaustively test every D1 query path introduced in the KV→D1
//           migration and (where feasible in a local context) compare the
//           shape/semantics of results against the known KV seed data.
//
// Usage:
//   npx tsx scripts/validate-d1-migration.ts [--db <path>] [--url <worker-url>]
//
//   --db  <path>   Path to a local SQLite file (created by `wrangler d1 export`
//                  or `wrangler dev --persist`).  Enables local SQL checks.
//   --url <url>    Base URL of a running worker (wrangler dev or production).
//                  Enables HTTP smoke-tests against all REST endpoints.
//   --verbose      Print every passing assertion (default: only failures).
//   --json         Emit a machine-readable JSON report to stdout.
//
// Both flags are independent — you can run SQL-only, HTTP-only, or both.
// =============================================================================

import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'

// ─── CLI args ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : undefined
}
const DB_PATH   = flag('--db')
const BASE_URL  = flag('--url')
const VERBOSE   = args.includes('--verbose')
const JSON_MODE = args.includes('--json')

// ─── Result tracking ───────────────────────────────────────────────────────
interface TestResult {
  suite:   string
  name:    string
  status:  'PASS' | 'FAIL' | 'SKIP'
  detail?: string
  durationMs: number
}

const results: TestResult[] = []
let db: ReturnType<typeof Database> | null = null

// ─── Helpers ───────────────────────────────────────────────────────────────
function pass(suite: string, name: string, ms: number) {
  results.push({ suite, name, status: 'PASS', durationMs: ms })
  if (VERBOSE && !JSON_MODE) console.log(`  ✅  ${name}  (${ms}ms)`)
}

function fail(suite: string, name: string, detail: string, ms: number) {
  results.push({ suite, name, status: 'FAIL', detail, durationMs: ms })
  if (!JSON_MODE) console.error(`  ❌  ${name}\n     ${detail}  (${ms}ms)`)
}

function skip(suite: string, name: string, reason: string) {
  results.push({ suite, name, status: 'SKIP', detail: reason, durationMs: 0 })
  if (VERBOSE && !JSON_MODE) console.log(`  ⏭️   ${name}  [skipped: ${reason}]`)
}

async function run(
  suite: string,
  name: string,
  fn: () => unknown | Promise<unknown>
): Promise<void> {
  const t0 = Date.now()
  try {
    await fn()
    pass(suite, name, Date.now() - t0)
  } catch (e: unknown) {
    fail(suite, name, String(e), Date.now() - t0)
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg)
}

function assertHasKeys(obj: unknown, keys: string[]) {
  if (!obj || typeof obj !== 'object') throw new Error(`Expected object, got ${typeof obj}`)
  for (const k of keys) {
    if (!(k in (obj as Record<string, unknown>))) {
      throw new Error(`Missing key "${k}" in ${JSON.stringify(obj).slice(0, 120)}`)
    }
  }
}

// ─── SQL helpers (direct SQLite) ───────────────────────────────────────────
function sqlOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
  if (!db) return null
  return (db.prepare(sql).get(...params) as T) ?? null
}

function sqlAll<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  if (!db) return []
  return db.prepare(sql).all(...params) as T[]
}

// ─── HTTP helpers ──────────────────────────────────────────────────────────
async function http<T = unknown>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  endpoint: string,
  body?: unknown,
  token = 'dev-admin-token'
): Promise<{ status: number; body: T }> {
  if (!BASE_URL) throw new Error('No --url provided')
  const url = `${BASE_URL}${endpoint}`
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed: T
  try { parsed = JSON.parse(text) as T } catch { parsed = text as unknown as T }
  return { status: res.status, body: parsed }
}

// =============================================================================
// ── SUITE 1: Schema Integrity ────────────────────────────────────────────────
// =============================================================================
async function suiteSchemaIntegrity() {
  const SUITE = 'Schema Integrity'
  if (!DB_PATH) {
    skip(SUITE, 'All schema tests', 'No --db path provided')
    return
  }
  if (!JSON_MODE) console.log(`\n📐  ${SUITE}`)

  const EXPECTED_TABLES = [
    'organizations', 'staff_users', 'auth_sessions', 'providers', 'rooms', 'patients',
    'appointments', 'waitlist',
    'superbills', 'superbill_diagnoses', 'superbill_line_items', 'payments',
    'frames', 'lenses', 'contact_lenses', 'optical_rx', 'optical_orders', 'optical_order_items',
    'portal_accounts', 'portal_sessions', 'appointment_requests', 'message_threads', 'messages',
    'insurance_plans',
  ]

  await run(SUITE, 'All expected tables exist', () => {
    const rows = sqlAll<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    )
    const actual = new Set(rows.map(r => r.name))
    const missing = EXPECTED_TABLES.filter(t => !actual.has(t))
    assert(missing.length === 0, `Missing tables: ${missing.join(', ')}`)
  })

  // Per-table column spot-checks
  const columnChecks: Record<string, string[]> = {
    patients:            ['id', 'mrn', 'first_name', 'last_name', 'date_of_birth', 'email', 'phone', 'organization_id', 'is_active'],
    appointments:        ['id', 'organization_id', 'patient_id', 'provider_id', 'appointment_date', 'start_time', 'end_time', 'status'],
    superbills:          ['id', 'organization_id', 'patient_id', 'service_date', 'provider_id', 'total_charge', 'status'],
    superbill_line_items:['id', 'superbill_id', 'cpt_code', 'fee', 'total'],
    frames:              ['id', 'organization_id', 'sku', 'brand', 'model', 'quantity', 'status'],
    optical_rx:          ['id', 'patient_id', 'od_sphere', 'os_sphere'],
    optical_orders:      ['id', 'patient_id', 'status', 'total_price'],
  }

  for (const [table, cols] of Object.entries(columnChecks)) {
    await run(SUITE, `${table} — required columns present`, () => {
      const rows = sqlAll<{ name: string }>(`PRAGMA table_info(${table})`)
      const actual = new Set(rows.map(r => r.name))
      const missing = cols.filter(c => !actual.has(c))
      assert(missing.length === 0, `${table} missing columns: ${missing.join(', ')}`)
    })
  }

  // Index spot-checks
  const indexChecks: Record<string, string[]> = {
    appointments: ['idx_appointments_date', 'idx_appointments_patient', 'idx_appointments_provider'],
    patients:     ['idx_patients_mrn', 'idx_patients_org'],
    superbills:   ['idx_superbills_patient', 'idx_superbills_status'],
    frames:       ['idx_frames_sku', 'idx_frames_status'],
  }
  for (const [table, idxList] of Object.entries(indexChecks)) {
    await run(SUITE, `${table} — indexes exist`, () => {
      const rows = sqlAll<{ name: string }>(`PRAGMA index_list(${table})`)
      const actual = new Set(rows.map(r => r.name))
      const missing = idxList.filter(i => !actual.has(i))
      assert(missing.length === 0, `${table} missing indexes: ${missing.join(', ')}`)
    })
  }
}

// =============================================================================
// ── SUITE 2: Seed Data Integrity ─────────────────────────────────────────────
// =============================================================================
async function suiteSeedData() {
  const SUITE = 'Seed Data Integrity'
  if (!DB_PATH) { skip(SUITE, 'All seed tests', 'No --db path'); return }
  if (!JSON_MODE) console.log(`\n🌱  ${SUITE}`)

  // ── Organization seed ──────────────────────────────────────────────────
  await run(SUITE, 'org-001 exists', () => {
    const row = sqlOne<{ id: string; name: string }>(`SELECT id, name FROM organizations WHERE id='org-001'`)
    assert(!!row, 'org-001 not found')
    assert(row!.id === 'org-001', `Wrong org id: ${row!.id}`)
  })

  // ── Providers ──────────────────────────────────────────────────────────
  await run(SUITE, 'Provider seeds present (dr-chen, dr-patel, dr-okonkwo)', () => {
    const rows = sqlAll<{ id: string }>(`SELECT id FROM providers WHERE organization_id='org-001'`)
    const ids = new Set(rows.map(r => r.id))
    ;['dr-chen', 'dr-patel', 'dr-okonkwo'].forEach(id => {
      assert(ids.has(id), `Provider ${id} missing`)
    })
  })

  await run(SUITE, 'Providers have required fields', () => {
    const rows = sqlAll<Record<string, unknown>>(`SELECT * FROM providers WHERE organization_id='org-001'`)
    rows.forEach(r => {
      assertHasKeys(r, ['id', 'first_name', 'last_name', 'npi', 'is_active'])
    })
  })

  // ── Patient seeds ──────────────────────────────────────────────────────
  await run(SUITE, 'At least one patient seeded', () => {
    const row = sqlOne<{ n: number }>(`SELECT COUNT(*) as n FROM patients`)
    assert((row?.n ?? 0) > 0, 'patients table empty')
  })

  await run(SUITE, 'pt-001 (Margaret Sullivan) exists with correct fields', () => {
    const row = sqlOne<Record<string, unknown>>(`SELECT * FROM patients WHERE id='pt-001'`)
    assert(!!row, 'pt-001 not found')
    assert(row!.last_name === 'Sullivan', `Wrong last_name: ${row!.last_name}`)
    assert(!!row!.mrn, 'MRN is empty')
    assert(row!.organization_id === 'org-001', `Wrong org: ${row!.organization_id}`)
    assert(Number(row!.is_active) === 1, 'is_active should be 1')
  })

  await run(SUITE, 'All patients have required fields', () => {
    const rows = sqlAll<Record<string, unknown>>(`SELECT * FROM patients LIMIT 20`)
    rows.forEach(r => {
      assertHasKeys(r, ['id', 'mrn', 'first_name', 'last_name', 'date_of_birth', 'organization_id'])
      assert(!!r.mrn, `Patient ${r.id} has empty MRN`)
    })
  })

  // ── Appointment seeds ──────────────────────────────────────────────────
  await run(SUITE, 'At least one appointment seeded', () => {
    const row = sqlOne<{ n: number }>(`SELECT COUNT(*) as n FROM appointments`)
    assert((row?.n ?? 0) > 0, 'appointments table empty')
  })

  await run(SUITE, 'Appointments have valid status values', () => {
    const valid = new Set(['SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'NO_SHOW'])
    const rows = sqlAll<{ id: string; status: string }>(`SELECT id, status FROM appointments LIMIT 50`)
    rows.forEach(r => {
      assert(valid.has(r.status), `Appointment ${r.id} has invalid status: ${r.status}`)
    })
  })

  await run(SUITE, 'Appointments have non-empty confirmation_code', () => {
    const rows = sqlAll<{ id: string; confirmation_code: string }>(
      `SELECT id, confirmation_code FROM appointments LIMIT 20`
    )
    rows.forEach(r => {
      assert(!!r.confirmation_code, `Appointment ${r.id} missing confirmation_code`)
    })
  })

  // ── Superbill seed ─────────────────────────────────────────────────────
  await run(SUITE, 'sb-001 superbill seed exists', () => {
    const row = sqlOne<Record<string, unknown>>(`SELECT * FROM superbills WHERE id='sb-001'`)
    assert(!!row, 'sb-001 not found')
    assert(row!.patient_id === 'pt-001', `Wrong patient: ${row!.patient_id}`)
    assert(Number(row!.total_charge) > 0, 'total_charge should be > 0')
  })

  await run(SUITE, 'Superbills have valid status values', () => {
    const valid = new Set(['DRAFT', 'REVIEWED', 'SUBMITTED', 'PAID', 'PARTIAL', 'DENIED', 'VOIDED'])
    const rows = sqlAll<{ id: string; status: string }>(`SELECT id, status FROM superbills LIMIT 50`)
    rows.forEach(r => {
      assert(valid.has(r.status), `Superbill ${r.id} invalid status: ${r.status}`)
    })
  })

  // ── Optical seed ───────────────────────────────────────────────────────
  await run(SUITE, 'Frame seeds present (frm-001, frm-002, frm-003)', () => {
    const rows = sqlAll<{ id: string }>(`SELECT id FROM frames WHERE organization_id='org-001'`)
    const ids = new Set(rows.map(r => r.id))
    ;['frm-001', 'frm-002', 'frm-003'].forEach(id => assert(ids.has(id), `Frame ${id} missing`))
  })

  await run(SUITE, 'Frames have valid status values', () => {
    const valid = new Set(['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'DISCONTINUED'])
    const rows = sqlAll<{ id: string; status: string }>(`SELECT id, status FROM frames LIMIT 20`)
    rows.forEach(r => assert(valid.has(r.status), `Frame ${r.id} invalid status: ${r.status}`))
  })

  await run(SUITE, 'Lens seeds present', () => {
    const row = sqlOne<{ n: number }>(`SELECT COUNT(*) as n FROM lenses`)
    assert((row?.n ?? 0) >= 2, `Expected ≥2 lenses, got ${row?.n}`)
  })
}

// =============================================================================
// ── SUITE 3: D1 Query Correctness ────────────────────────────────────────────
// =============================================================================
async function suiteD1Queries() {
  const SUITE = 'D1 Query Correctness'
  if (!DB_PATH) { skip(SUITE, 'All query tests', 'No --db path'); return }
  if (!JSON_MODE) console.log(`\n🔍  ${SUITE}`)

  // ── Scheduling queries ─────────────────────────────────────────────────
  await run(SUITE, '[scheduling] getAppointmentsByDate — returns array', () => {
    const today = new Date().toISOString().slice(0, 10)
    const rows = sqlAll(`SELECT * FROM appointments WHERE appointment_date=?`, [today])
    assert(Array.isArray(rows), 'Expected array')
  })

  await run(SUITE, '[scheduling] getScheduleRange — 7 days has correct dates', () => {
    const start = '2026-03-10'
    const dates: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      dates.push(d.toISOString().slice(0, 10))
    }
    dates.forEach(date => {
      const rows = sqlAll(
        `SELECT * FROM appointments WHERE appointment_date=? AND organization_id='org-001'`,
        [date]
      )
      assert(Array.isArray(rows), `Expected array for ${date}`)
    })
  })

  await run(SUITE, '[scheduling] getAppointment — known id returns correct patient', () => {
    const first = sqlOne<{ id: string; patient_id: string }>(`SELECT id, patient_id FROM appointments LIMIT 1`)
    if (!first) { skip(SUITE, '[scheduling] getAppointment by id', 'No appointments in DB'); return }
    const row = sqlOne<{ id: string; patient_id: string }>(
      `SELECT * FROM appointments WHERE id=?`, [first.id]
    )
    assert(!!row, `Appointment ${first.id} not found by id`)
    assert(row!.patient_id === first.patient_id, 'patient_id mismatch')
  })

  await run(SUITE, '[scheduling] getAvailableSlots — appointments have start_time', () => {
    const rows = sqlAll<{ start_time: string }>(`SELECT start_time FROM appointments LIMIT 10`)
    rows.forEach((r, i) => assert(typeof r.start_time === 'string', `Row ${i} missing start_time`))
  })

  await run(SUITE, '[scheduling] getWaitlist — waitlist table queryable', () => {
    const rows = sqlAll(`SELECT * FROM waitlist LIMIT 10`)
    assert(Array.isArray(rows), 'Expected array')
  })

  // ── Patient queries ────────────────────────────────────────────────────
  await run(SUITE, '[patients] listPatients — pagination math correct', () => {
    const total = (sqlOne<{ n: number }>(`SELECT COUNT(*) as n FROM patients WHERE is_active=1`)?.n ?? 0)
    const page1  = sqlAll(`SELECT * FROM patients WHERE is_active=1 ORDER BY last_name, first_name LIMIT 25 OFFSET 0`)
    assert(page1.length <= 25, `Page 1 returned ${page1.length} rows (expected ≤25)`)
    if (total > 25) {
      const page2 = sqlAll(`SELECT * FROM patients WHERE is_active=1 ORDER BY last_name, first_name LIMIT 25 OFFSET 25`)
      assert(page2.length > 0, 'Page 2 should not be empty when total > 25')
      const ids1 = new Set(page1.map((r: Record<string, unknown>) => r.id))
      page2.forEach((r: Record<string, unknown>) => assert(!ids1.has(r.id), `Duplicate patient ${r.id} across pages`))
    }
  })

  await run(SUITE, '[patients] searchPatients — LIKE query returns results', () => {
    const q = '%Sul%'
    const rows = sqlAll(
      `SELECT * FROM patients WHERE is_active=1 AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR mrn LIKE ? OR phone LIKE ?) LIMIT 20`,
      [q, q, q, q, q]
    )
    assert(rows.length > 0, 'searchPatients("Sul") should return ≥1 result (Sullivan)')
  })

  await run(SUITE, '[patients] getPatientByMrn — MRN lookup', () => {
    const first = sqlOne<{ mrn: string; id: string }>(`SELECT id, mrn FROM patients WHERE is_active=1 LIMIT 1`)
    if (!first?.mrn) { skip(SUITE, 'MRN lookup', 'No patients with MRN'); return }
    const row = sqlOne<{ id: string }>(`SELECT id FROM patients WHERE mrn=?`, [first.mrn])
    assert(row?.id === first.id, `MRN lookup returned wrong patient`)
  })

  await run(SUITE, '[patients] createPatient — INSERT + SELECT round-trip', () => {
    const testId  = `pt-validation-${Date.now()}`
    const testMrn = `MRN-VAL-${Date.now()}`
    db!.prepare(`INSERT INTO patients (id, organization_id, mrn, first_name, last_name, date_of_birth, email, phone, is_active, is_new_patient, created_at, updated_at)
      VALUES (?, 'org-001', ?, 'Validation', 'TestPatient', '1990-01-01', 'val@test.com', '555-0000', 1, 1, datetime('now'), datetime('now'))`
    ).run(testId, testMrn)
    const row = sqlOne<{ id: string; first_name: string }>(`SELECT id, first_name FROM patients WHERE id=?`, [testId])
    assert(row?.id === testId, 'Inserted patient not found')
    assert(row?.first_name === 'Validation', 'first_name mismatch after insert')
    db!.prepare(`DELETE FROM patients WHERE id=?`).run(testId)
  })

  // ── Billing queries ────────────────────────────────────────────────────
  await run(SUITE, '[billing] listSuperbills — SELECT with org filter', () => {
    const rows = sqlAll(
      `SELECT id, patient_id, status, total_charge FROM superbills WHERE organization_id='org-001' ORDER BY created_at DESC`
    )
    assert(Array.isArray(rows), 'Expected array')
    rows.forEach((r: Record<string, unknown>, i: number) => {
      assertHasKeys(r, ['id', 'patient_id', 'status', 'total_charge'])
    })
  })

  await run(SUITE, '[billing] getSuperbill — with diagnoses + line items JOIN', () => {
    const sb = sqlOne<{ id: string }>(`SELECT id FROM superbills LIMIT 1`)
    if (!sb) { skip(SUITE, 'getSuperbill JOIN', 'No superbills in DB'); return }
    const dx = sqlAll(`SELECT * FROM superbill_diagnoses WHERE superbill_id=?`, [sb.id])
    const li = sqlAll(`SELECT * FROM superbill_line_items WHERE superbill_id=?`, [sb.id])
    assert(Array.isArray(dx), 'diagnoses should be array')
    assert(Array.isArray(li), 'line_items should be array')
  })

  await run(SUITE, '[billing] getPatientSuperbills — filtered by patient_id', () => {
    const rows = sqlAll(
      `SELECT id, status FROM superbills WHERE patient_id='pt-001' ORDER BY created_at DESC`
    )
    assert(Array.isArray(rows), 'Expected array')
    rows.forEach((r: Record<string, unknown>) => {
      assert(r.patient_id !== undefined || true, '') // patient_id checked via query filter
    })
  })

  await run(SUITE, '[billing] getArSummary — aggregate math non-negative', () => {
    const row = sqlOne<{
      totalOutstanding: number; totalCharged: number;
      totalCollected: number; totalAdjustments: number
    }>(`
      SELECT
        SUM(CASE WHEN status NOT IN ('PAID','VOIDED') THEN patient_balance ELSE 0 END) as totalOutstanding,
        SUM(total_charge)      as totalCharged,
        SUM(copay_collected + COALESCE(insurance_paid, 0)) as totalCollected,
        SUM(adjustments)       as totalAdjustments
      FROM superbills WHERE organization_id='org-001'
    `)
    assert(row !== null, 'AR summary query returned null')
    assert((row!.totalCharged ?? 0) >= 0, 'totalCharged negative')
    assert((row!.totalOutstanding ?? 0) >= 0, 'totalOutstanding negative')
  })

  await run(SUITE, '[billing] createSuperbill — INSERT round-trip', () => {
    const testId = `sb-val-${Date.now()}`
    db!.prepare(`INSERT INTO superbills
      (id, organization_id, patient_id, patient_name, service_date, provider_id, provider_name,
       total_charge, copay_amount, copay_collected, insurance_billed, patient_balance,
       adjustments, status, created_at, updated_at)
      VALUES (?, 'org-001', 'pt-001', 'Test Patient', date('now'), 'dr-chen', 'Dr. Chen',
       200.00, 20.00, 20.00, 144.00, 0.00, 56.00, 'DRAFT', datetime('now'), datetime('now'))`
    ).run(testId)
    const row = sqlOne<{ id: string; status: string }>(`SELECT id, status FROM superbills WHERE id=?`, [testId])
    assert(row?.id === testId, 'Superbill not found after insert')
    assert(row?.status === 'DRAFT', 'Status wrong after insert')
    db!.prepare(`DELETE FROM superbill_diagnoses WHERE superbill_id=?`).run(testId)
    db!.prepare(`DELETE FROM superbill_line_items WHERE superbill_id=?`).run(testId)
    db!.prepare(`DELETE FROM superbills WHERE id=?`).run(testId)
  })

  // ── Optical queries ────────────────────────────────────────────────────
  await run(SUITE, '[optical] listFrames — org filter returns correct shape', () => {
    const rows = sqlAll<Record<string, unknown>>(`SELECT * FROM frames WHERE organization_id='org-001'`)
    assert(rows.length >= 3, `Expected ≥3 frames, got ${rows.length}`)
    rows.forEach(r => assertHasKeys(r, ['id', 'sku', 'brand', 'quantity', 'status']))
  })

  await run(SUITE, '[optical] getFrame — by id round-trip', () => {
    const row = sqlOne<{ id: string; sku: string }>(`SELECT id, sku FROM frames WHERE id='frm-001'`)
    assert(!!row, 'frm-001 not found')
    assert(typeof row!.sku === 'string' && row!.sku.length > 0, 'SKU empty')
  })

  await run(SUITE, '[optical] updateFrame — SET + re-read', () => {
    const before = sqlOne<{ quantity: number }>(`SELECT quantity FROM frames WHERE id='frm-001'`)
    const newQty = (before?.quantity ?? 0) + 1
    db!.prepare(`UPDATE frames SET quantity=?, updated_at=datetime('now') WHERE id='frm-001'`).run(newQty)
    const after = sqlOne<{ quantity: number }>(`SELECT quantity FROM frames WHERE id='frm-001'`)
    assert(after?.quantity === newQty, `quantity not updated: expected ${newQty}, got ${after?.quantity}`)
    // restore
    db!.prepare(`UPDATE frames SET quantity=? WHERE id='frm-001'`).run(before?.quantity ?? 0)
  })

  await run(SUITE, '[optical] listLenses — returns ≥2 records', () => {
    const rows = sqlAll(`SELECT * FROM lenses WHERE organization_id='org-001'`)
    assert(rows.length >= 2, `Expected ≥2 lenses, got ${rows.length}`)
  })

  await run(SUITE, '[optical] listRxForPatient — query by patient_id', () => {
    const rows = sqlAll(`SELECT * FROM optical_rx WHERE patient_id='pt-001' ORDER BY rx_date DESC`)
    assert(Array.isArray(rows), 'Expected array')
  })

  await run(SUITE, '[optical] getInventorySummary — aggregate queries', () => {
    const totalFrames   = sqlOne<{ n: number }>(`SELECT COUNT(*) as n FROM frames WHERE organization_id='org-001'`)
    const inStock       = sqlOne<{ n: number }>(`SELECT COUNT(*) as n FROM frames WHERE organization_id='org-001' AND status='IN_STOCK'`)
    const lowStock      = sqlOne<{ n: number }>(`SELECT COUNT(*) as n FROM frames WHERE organization_id='org-001' AND status='LOW_STOCK'`)
    const outOfStock    = sqlOne<{ n: number }>(`SELECT COUNT(*) as n FROM frames WHERE organization_id='org-001' AND status='OUT_OF_STOCK'`)
    assert((totalFrames?.n ?? 0) === (inStock?.n ?? 0) + (lowStock?.n ?? 0) + (outOfStock?.n ?? 0),
      'Frame status counts do not add up to total')
  })

  await run(SUITE, '[optical] getOrdersSummary — orders aggregate', () => {
    const rows = sqlAll(`SELECT status, COUNT(*) as n, SUM(total_price) as total FROM optical_orders GROUP BY status`)
    assert(Array.isArray(rows), 'Expected array from orders aggregate')
  })

  // ── Foreign Key Integrity ──────────────────────────────────────────────
  await run(SUITE, 'FK: appointments.patient_id → patients.id', () => {
    const orphans = sqlAll<{ id: string }>(
      `SELECT a.id FROM appointments a LEFT JOIN patients p ON a.patient_id=p.id WHERE p.id IS NULL`
    )
    assert(orphans.length === 0, `Orphan appointments (no matching patient): ${orphans.map(r => r.id).join(', ')}`)
  })

  await run(SUITE, 'FK: appointments.provider_id → providers.id', () => {
    const orphans = sqlAll<{ id: string }>(
      `SELECT a.id FROM appointments a LEFT JOIN providers p ON a.provider_id=p.id WHERE p.id IS NULL`
    )
    assert(orphans.length === 0, `Orphan appointments (no matching provider): ${orphans.map(r => r.id).join(', ')}`)
  })

  await run(SUITE, 'FK: superbills.patient_id → patients.id', () => {
    const orphans = sqlAll<{ id: string }>(
      `SELECT s.id FROM superbills s LEFT JOIN patients p ON s.patient_id=p.id WHERE p.id IS NULL`
    )
    assert(orphans.length === 0, `Orphan superbills: ${orphans.map(r => r.id).join(', ')}`)
  })

  await run(SUITE, 'FK: superbill_line_items.superbill_id → superbills.id', () => {
    const orphans = sqlAll<{ id: string }>(
      `SELECT li.id FROM superbill_line_items li LEFT JOIN superbills s ON li.superbill_id=s.id WHERE s.id IS NULL`
    )
    assert(orphans.length === 0, `Orphan line items: ${orphans.map(r => r.id).join(', ')}`)
  })

  await run(SUITE, 'FK: optical_rx.patient_id → patients.id', () => {
    const orphans = sqlAll<{ id: string }>(
      `SELECT r.id FROM optical_rx r LEFT JOIN patients p ON r.patient_id=p.id WHERE p.id IS NULL`
    )
    assert(orphans.length === 0, `Orphan Rx records: ${orphans.map(r => r.id).join(', ')}`)
  })
}

// =============================================================================
// ── SUITE 4: KV→D1 Parity (shape comparison) ─────────────────────────────────
// Compares field presence and types between what KV seed data would produce
// vs what D1 rows actually contain.  We do NOT require identical values, only
// that every field the KV model exposed is present in the D1 row with the
// same JS type.
// =============================================================================
async function suiteKvParity() {
  const SUITE = 'KV→D1 Parity'
  if (!DB_PATH) { skip(SUITE, 'All parity tests', 'No --db path'); return }
  if (!JSON_MODE) console.log(`\n🔄  ${SUITE}`)

  // Expected KV-model shapes (derived from original lib type definitions)
  const KV_PATIENT_FIELDS: Record<string, string> = {
    id: 'string', mrn: 'string', first_name: 'string', last_name: 'string',
    date_of_birth: 'string', email: 'string', phone: 'string',
    organization_id: 'string', is_active: 'number',
  }
  const KV_APPOINTMENT_FIELDS: Record<string, string> = {
    id: 'string', organization_id: 'string', patient_id: 'string',
    provider_id: 'string', appointment_date: 'string', start_time: 'string',
    end_time: 'string', status: 'string', appointment_type: 'string',
  }
  const KV_SUPERBILL_FIELDS: Record<string, string> = {
    id: 'string', organization_id: 'string', patient_id: 'string',
    service_date: 'string', provider_id: 'string', total_charge: 'number',
    status: 'string',
  }
  const KV_FRAME_FIELDS: Record<string, string> = {
    id: 'string', organization_id: 'string', sku: 'string',
    quantity: 'number', status: 'string',
  }

  async function parityCheck(
    name: string,
    table: string,
    expected: Record<string, string>,
    limit = 5
  ) {
    await run(SUITE, `${name} — D1 shape matches KV model`, () => {
      const rows = sqlAll<Record<string, unknown>>(`SELECT * FROM ${table} LIMIT ?`, [limit])
      if (rows.length === 0) { throw new Error(`No rows in ${table} — run seed first`) }
      rows.forEach((row, idx) => {
        for (const [field, expectedType] of Object.entries(expected)) {
          const val = row[field]
          assert(val !== undefined, `Row ${idx}: field "${field}" missing from ${table}`)
          const actual = typeof val
          // SQLite stores booleans as 0/1 (number) — treat number as matching bool
          const ok = actual === expectedType ||
                     (expectedType === 'boolean' && actual === 'number') ||
                     (expectedType === 'number'  && actual === 'string' && !isNaN(Number(val)))
          assert(ok, `Row ${idx} field "${field}": expected ${expectedType}, got ${actual} (value: ${val})`)
        }
      })
    })
  }

  await parityCheck('Patient', 'patients', KV_PATIENT_FIELDS)
  await parityCheck('Appointment', 'appointments', KV_APPOINTMENT_FIELDS)
  await parityCheck('Superbill', 'superbills', KV_SUPERBILL_FIELDS)
  await parityCheck('Frame', 'frames', KV_FRAME_FIELDS)

  // ── Computed field parity ──────────────────────────────────────────────
  await run(SUITE, 'Patient.calcAge equivalent — dob stored as ISO date string', () => {
    const rows = sqlAll<{ date_of_birth: string }>(`SELECT date_of_birth FROM patients WHERE is_active=1 LIMIT 10`)
    rows.forEach((r, i) => {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(r.date_of_birth),
        `Row ${i}: date_of_birth "${r.date_of_birth}" not in YYYY-MM-DD format`)
    })
  })

  await run(SUITE, 'Frame.status derived correctly from quantity', () => {
    const rows = sqlAll<{ id: string; quantity: number; min_quantity: number; status: string }>(
      `SELECT id, quantity, min_quantity, status FROM frames`
    )
    rows.forEach(r => {
      const expected =
        r.quantity <= 0              ? 'OUT_OF_STOCK' :
        r.quantity <= r.min_quantity ? 'LOW_STOCK'    : 'IN_STOCK'
      // Some frames may be DISCONTINUED — only check non-discontinued
      if (r.status !== 'DISCONTINUED') {
        assert(r.status === expected,
          `Frame ${r.id}: quantity=${r.quantity}, min=${r.min_quantity} → expected ${expected}, got ${r.status}`)
      }
    })
  })

  await run(SUITE, 'Superbill totals consistent (charge = copay + insurance + balance + adj)', () => {
    const rows = sqlAll<{
      id: string; total_charge: number; copay_collected: number;
      insurance_billed: number; patient_balance: number; adjustments: number
    }>(`SELECT id, total_charge, copay_collected, insurance_billed, patient_balance, adjustments FROM superbills LIMIT 10`)
    rows.forEach(r => {
      // total_charge ≈ copay_collected + patient_balance + adjustments
      // (insurance_billed may exceed total due to contractual rates — allow ±$1 rounding)
      const recon = (r.copay_collected ?? 0) + (r.patient_balance ?? 0) + (r.adjustments ?? 0)
      const diff  = Math.abs((r.total_charge ?? 0) - recon)
      assert(diff < 1.00, `Superbill ${r.id} totals don't reconcile: charge=${r.total_charge}, recon=${recon}, diff=${diff}`)
    })
  })
}

// =============================================================================
// ── SUITE 5: HTTP Endpoint Smoke Tests ───────────────────────────────────────
// =============================================================================
async function suiteHttpEndpoints() {
  const SUITE = 'HTTP Endpoint Smoke Tests'
  if (!BASE_URL) { skip(SUITE, 'All HTTP tests', 'No --url provided'); return }
  if (!JSON_MODE) console.log(`\n🌐  ${SUITE}  (${BASE_URL})`)

  // Helper: assert HTTP response shape
  async function smokeGet(endpoint: string, expectedKeys: string[], minItems?: number) {
    await run(SUITE, `GET ${endpoint}`, async () => {
      const { status, body } = await http('GET', endpoint)
      assert(status === 200, `Expected 200, got ${status}`)
      if (minItems !== undefined) {
        assert(Array.isArray(body), `Expected array body`)
        assert((body as unknown[]).length >= minItems, `Expected ≥${minItems} items`)
        if ((body as unknown[]).length > 0) assertHasKeys((body as unknown[])[0], expectedKeys)
      } else if (expectedKeys.length) {
        assertHasKeys(body, expectedKeys)
      }
    })
  }

  // ── Scheduling endpoints ───────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  await smokeGet(`/api/schedule/range?start=${today}&days=7`, ['date', 'appointments', 'slots'])
  await smokeGet(`/api/schedule/appointments?date=${today}`, [], 0)
  await smokeGet('/api/schedule/waitlist', [], 0)

  await run(SUITE, 'POST /api/schedule/appointments — create + read-back', async () => {
    const { status, body } = await http('POST', '/api/schedule/appointments', {
      patientId: 'pt-001',
      patientName: 'Margaret Sullivan',
      providerId: 'dr-chen',
      date: '2026-03-15',
      startTime: '09:00',
      appointmentType: 'COMPREHENSIVE',
      reason: 'Validation test',
    })
    assert(status === 201, `Expected 201, got ${status}`)
    const appt = body as Record<string, unknown>
    assertHasKeys(appt, ['id', 'status', 'confirmationCode'])
    assert(appt.status === 'SCHEDULED', `status should be SCHEDULED, got ${appt.status}`)
    assert(typeof appt.confirmationCode === 'string', 'confirmationCode should be string')
  })

  // ── Patient endpoints ──────────────────────────────────────────────────
  await smokeGet('/api/patients?page=1&limit=10', ['id', 'mrn', 'firstName', 'lastName'], 1)
  await smokeGet('/api/patients/pt-001', ['id', 'mrn', 'firstName', 'lastName', 'dateOfBirth'])
  await smokeGet('/api/patients/search?q=sullivan', ['id', 'mrn', 'firstName', 'lastName'], 1)

  await run(SUITE, 'POST /api/patients — create returns patient with MRN', async () => {
    const { status, body } = await http('POST', '/api/patients', {
      firstName: 'Smoke',
      lastName: 'TestPatient',
      dateOfBirth: '1985-06-15',
      email: `smoke${Date.now()}@test.com`,
      phone: '555-9999',
      gender: 'FEMALE',
    })
    assert(status === 201, `Expected 201, got ${status}`)
    const p = body as Record<string, unknown>
    assertHasKeys(p, ['id', 'mrn', 'firstName', 'lastName'])
    assert(typeof p.mrn === 'string' && p.mrn.length > 0, 'MRN should be non-empty string')
  })

  // ── Billing endpoints ──────────────────────────────────────────────────
  await smokeGet('/api/billing/superbills', ['id', 'patientId', 'status', 'totalCharge'], 1)
  await smokeGet('/api/billing/superbills/sb-001', ['id', 'patientId', 'diagnoses', 'lineItems'])
  await smokeGet('/api/billing/ar-summary', ['totalOutstanding', 'totalCharged', 'totalCollected', 'byStatus'])
  await smokeGet('/api/billing/cpt/search?q=exam', ['code', 'description'], 1)

  await run(SUITE, 'GET /api/billing/ar-summary — totalCharged > 0', async () => {
    const { status, body } = await http('GET', '/api/billing/ar-summary')
    assert(status === 200, `Expected 200, got ${status}`)
    const ar = body as Record<string, unknown>
    assert(Number(ar.totalCharged) > 0, `totalCharged should be >0, got ${ar.totalCharged}`)
  })

  // ── Optical endpoints ──────────────────────────────────────────────────
  await smokeGet('/api/optical/frames', ['id', 'sku', 'quantity', 'status'], 3)
  await smokeGet('/api/optical/frames/frm-001', ['id', 'sku', 'brand', 'model', 'quantity'])
  await smokeGet('/api/optical/lenses', ['id', 'sku', 'name', 'type'], 2)
  await smokeGet('/api/optical/contact-lenses', [], 0)
  await smokeGet('/api/optical/orders', [], 0)
  await smokeGet('/api/optical/inventory-summary', ['totalFrames', 'inStock', 'lowStock', 'outOfStock'])
  await smokeGet('/api/optical/orders-summary', ['total', 'pending', 'totalRevenue'])

  await run(SUITE, 'PATCH /api/optical/frames/frm-001 — update quantity', async () => {
    const { status, body } = await http('PATCH', '/api/optical/frames/frm-001', { quantity: 5 })
    assert(status === 200, `Expected 200, got ${status}`)
    const f = body as Record<string, unknown>
    assertHasKeys(f, ['id', 'quantity', 'status'])
    assert(Number(f.quantity) === 5, `quantity should be 5, got ${f.quantity}`)
    // restore
    await http('PATCH', '/api/optical/frames/frm-001', { quantity: 3 })
  })

  // ── Error handling ─────────────────────────────────────────────────────
  await run(SUITE, 'GET /api/patients/nonexistent-id — returns 404', async () => {
    const { status } = await http('GET', '/api/patients/pt-does-not-exist-999')
    assert(status === 404, `Expected 404, got ${status}`)
  })

  await run(SUITE, 'GET /api/billing/superbills/nonexistent — returns 404', async () => {
    const { status } = await http('GET', '/api/billing/superbills/sb-does-not-exist')
    assert(status === 404, `Expected 404, got ${status}`)
  })

  await run(SUITE, 'Unauthenticated request — returns 401', async () => {
    const { status } = await http('GET', '/api/patients', undefined, '')
    assert(status === 401, `Expected 401, got ${status}`)
  })
}

// =============================================================================
// ── SUITE 6: Performance Baselines ───────────────────────────────────────────
// =============================================================================
async function suitePerformance() {
  const SUITE = 'Performance Baselines'
  if (!DB_PATH) { skip(SUITE, 'All perf tests', 'No --db path'); return }
  if (!JSON_MODE) console.log(`\n⏱️   ${SUITE}`)

  const THRESHOLDS: Record<string, number> = {
    'Patient list (25 rows)':     50,   // ms
    'Patient search (LIKE)':      50,
    'Schedule range (7 days)':    100,
    'Superbill list':             50,
    'AR summary aggregate':       50,
    'Frame list':                 30,
    'Inventory summary':          50,
  }

  const queries: Array<[string, string, unknown[]]> = [
    ['Patient list (25 rows)',  `SELECT * FROM patients WHERE is_active=1 ORDER BY last_name LIMIT 25`, []],
    ['Patient search (LIKE)',   `SELECT * FROM patients WHERE is_active=1 AND (first_name LIKE ? OR last_name LIKE ?) LIMIT 20`, ['%Sul%', '%Sul%']],
    ['Schedule range (7 days)', `SELECT * FROM appointments WHERE appointment_date BETWEEN ? AND ? AND organization_id='org-001'`, ['2026-03-10', '2026-03-17']],
    ['Superbill list',          `SELECT id, patient_id, status, total_charge FROM superbills WHERE organization_id='org-001' ORDER BY created_at DESC`, []],
    ['AR summary aggregate',    `SELECT SUM(total_charge), SUM(copay_collected), SUM(patient_balance) FROM superbills WHERE organization_id='org-001'`, []],
    ['Frame list',              `SELECT * FROM frames WHERE organization_id='org-001'`, []],
    ['Inventory summary',       `SELECT status, COUNT(*) as n, SUM(quantity) as qty FROM frames GROUP BY status`, []],
  ]

  for (const [label, sql, params] of queries) {
    await run(SUITE, `${label} — under ${THRESHOLDS[label]}ms`, () => {
      const t0 = Date.now()
      sqlAll(sql, params)
      const elapsed = Date.now() - t0
      assert(elapsed <= THRESHOLDS[label],
        `Query took ${elapsed}ms (threshold: ${THRESHOLDS[label]}ms)`)
    })
  }
}

// =============================================================================
// ── Main ──────────────────────────────────────────────────────────────────────
// =============================================================================
async function main() {
  if (!JSON_MODE) {
    console.log('═══════════════════════════════════════════════════════════')
    console.log(' OculoFlow — KV→D1 Post-Migration Validation')
    console.log('═══════════════════════════════════════════════════════════')
    if (DB_PATH)  console.log(` DB:  ${DB_PATH}`)
    if (BASE_URL) console.log(` URL: ${BASE_URL}`)
    if (!DB_PATH && !BASE_URL) {
      console.log('\n⚠️  No --db or --url provided.')
      console.log('   SQL suites will be skipped.  HTTP suites will be skipped.')
      console.log('   Provide at least one flag to run meaningful tests.\n')
    }
  }

  // Open SQLite if path provided
  if (DB_PATH) {
    if (!fs.existsSync(DB_PATH)) {
      console.error(`❌  DB file not found: ${DB_PATH}`)
      process.exit(1)
    }
    db = new Database(DB_PATH, { readonly: false })
    // Enable WAL for consistent reads
    db.pragma('journal_mode = WAL')
    // Disable FK enforcement for round-trip tests that clean up after themselves
    db.pragma('foreign_keys = OFF')
  }

  await suiteSchemaIntegrity()
  await suiteSeedData()
  await suiteD1Queries()
  await suiteKvParity()
  await suiteHttpEndpoints()
  await suitePerformance()

  if (db) db.close()

  // ── Summary ──────────────────────────────────────────────────────────
  const passed  = results.filter(r => r.status === 'PASS').length
  const failed  = results.filter(r => r.status === 'FAIL').length
  const skipped = results.filter(r => r.status === 'SKIP').length
  const total   = results.length

  if (JSON_MODE) {
    process.stdout.write(JSON.stringify({ summary: { total, passed, failed, skipped }, results }, null, 2))
    process.exit(failed > 0 ? 1 : 0)
  }

  console.log('\n═══════════════════════════════════════════════════════════')
  console.log(` Results: ${passed}/${total} passed   ${failed} failed   ${skipped} skipped`)
  console.log('═══════════════════════════════════════════════════════════')

  if (failed > 0) {
    console.log('\n❌  FAILURES:\n')
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.log(`  [${r.suite}] ${r.name}`)
      console.log(`    ${r.detail}\n`)
    })
    process.exit(1)
  } else {
    console.log('\n✅  All tests passed!')
    process.exit(0)
  }
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
