// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Billing & Claims Library (D1-backed)
// ─────────────────────────────────────────────────────────────────────────────

import {
  Superbill,
  SuperbillStatus,
  SuperbillSummary,
  SuperbillCreateInput,
  BillLineItem,
  Payment,
  PaymentMethod,
  CPT_CODES,
  CPT_MAP,
  EXAM_TYPE_CPT_MAP,
} from '../types/billing'
import { dbGet, dbAll, dbRun, uid as genUid, toJson, fromJson, now } from './db'

// ── Date helpers ──────────────────────────────────────────────────────────────
function today(): string { return new Date().toISOString().slice(0, 10) }
function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10)
}

// ── Suggest CPT codes ─────────────────────────────────────────────────────────
export function suggestCptCodes(examType: string): string[] {
  const key = examType.toUpperCase().replace(/[^A-Z_]/g, '')
  for (const [k, codes] of Object.entries(EXAM_TYPE_CPT_MAP)) {
    if (key.includes(k) || k.includes(key)) return codes
  }
  return ['92014']
}

// ── Build line items ──────────────────────────────────────────────────────────
export function buildLineItems(cptCodes: string[], icd10Codes: string[]): BillLineItem[] {
  return cptCodes.map((code) => {
    const cpt = CPT_MAP[code]
    if (!cpt) return null
    return {
      id: `li-${genUid('x')}`,
      cptCode: cpt.code,
      description: cpt.description,
      icd10Pointers: cpt.requiresDx ? icd10Codes.slice(0, 4) : [],
      units: cpt.units ?? 1,
      fee: cpt.fee,
      total: cpt.fee * (cpt.units ?? 1),
      approved: true,
    } as BillLineItem
  }).filter(Boolean) as BillLineItem[]
}

// ── Compute totals ────────────────────────────────────────────────────────────
export function computeTotals(
  lineItems: BillLineItem[], copayAmount: number, copayCollected: number
): Pick<Superbill, 'totalCharge' | 'insuranceBilled' | 'patientBalance' | 'adjustments'> {
  const totalCharge = lineItems.reduce((s, li) => s + li.total, 0)
  const contractualRate = 0.72
  const insuranceBilled = parseFloat((totalCharge * contractualRate).toFixed(2))
  const adjustments = parseFloat((totalCharge - insuranceBilled).toFixed(2))
  const patientBalance = parseFloat((copayAmount - copayCollected).toFixed(2))
  return { totalCharge, insuranceBilled, patientBalance, adjustments }
}

// ── Row to Superbill ──────────────────────────────────────────────────────────
function rowToSuperbill(r: Record<string, unknown>, diagnoses: unknown[], lineItems: unknown[]): Superbill {
  return {
    id: r.id as string,
    organizationId: r.organization_id as string,
    patientId: r.patient_id as string,
    patientName: r.patient_name as string,
    examId: r.exam_id as string,
    appointmentId: r.appointment_id as string,
    serviceDate: r.service_date as string,
    providerId: r.provider_id as string,
    providerName: r.provider_name as string,
    providerNpi: r.provider_npi as string,
    primaryInsurance: fromJson(r.primary_insurance as string) as Superbill['primaryInsurance'],
    lineItems: lineItems as BillLineItem[],
    diagnoses: diagnoses as Superbill['diagnoses'],
    totalCharge: (r.total_charge as number) || 0,
    copayAmount: (r.copay_amount as number) || 0,
    copayCollected: (r.copay_collected as number) || 0,
    insuranceBilled: (r.insurance_billed as number) || 0,
    insurancePaid: (r.insurance_paid as number) || 0,
    patientBalance: (r.patient_balance as number) || 0,
    adjustments: (r.adjustments as number) || 0,
    status: r.status as SuperbillStatus,
    notes: r.notes as string,
    claimNumber: r.claim_number as string,
    submittedAt: r.submitted_at as string,
    paidAt: r.paid_at as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    createdBy: r.created_by as string,
  }
}

// ── Seed ──────────────────────────────────────────────────────────────────────
export async function ensureBillingSeed(kv: KVNamespace, db?: D1Database): Promise<void> {
  if (!db) return
  const count = await dbGet<{ n: number }>(db, 'SELECT COUNT(*) as n FROM superbills')
  if (count && count.n > 0) return
  const ts = now()
  const sd = daysAgo(3)
  const sb1Id = 'sb-001'
  await dbRun(db, `INSERT OR IGNORE INTO superbills
    (id, organization_id, patient_id, patient_name, exam_id, appointment_id, service_date, provider_id, provider_name, total_charge, copay_amount, copay_collected, insurance_billed, patient_balance, adjustments, status, created_at, updated_at)
    VALUES (?, 'org-001', 'pt-001', 'Margaret Sullivan', NULL, NULL, ?, 'dr-chen', 'Dr. Sarah Chen, OD', 350.00, 30.00, 30.00, 252.00, 0.00, 98.00, 'REVIEWED', ?, ?)`,
    [sb1Id, sd, ts, ts])
}

// ── List superbills ───────────────────────────────────────────────────────────
export async function listSuperbills(kv: KVNamespace, db?: D1Database): Promise<SuperbillSummary[]> {
  if (db) {
    const rows = await dbAll<Record<string, unknown>>(db,
      `SELECT id, organization_id, patient_id, patient_name, service_date, provider_name, total_charge, copay_collected, insurance_paid, patient_balance, status, created_at, updated_at
       FROM superbills WHERE organization_id = 'org-001' ORDER BY created_at DESC`)
    return rows.map(r => ({
      id: r.id as string,
      patientId: r.patient_id as string,
      patientName: r.patient_name as string,
      serviceDate: r.service_date as string,
      providerName: r.provider_name as string,
      totalCharge: (r.total_charge as number) || 0,
      amountPaid: ((r.copay_collected as number) || 0) + ((r.insurance_paid as number) || 0),
      balance: (r.patient_balance as number) || 0,
      status: r.status as SuperbillStatus,
      createdAt: r.created_at as string,
      updatedAt: r.updated_at as string,
    }))
  }
  return []
}

// ── Get superbill ─────────────────────────────────────────────────────────────
export async function getSuperbill(kv: KVNamespace, id: string, db?: D1Database): Promise<Superbill | null> {
  if (db) {
    const row = await dbGet<Record<string, unknown>>(db, 'SELECT * FROM superbills WHERE id = ?', [id])
    if (!row) return null
    const dx = await dbAll<Superbill['diagnoses'][0]>(db, 'SELECT * FROM superbill_diagnoses WHERE superbill_id = ? ORDER BY sort_order', [id])
    const li = await dbAll<BillLineItem>(db, 'SELECT * FROM superbill_line_items WHERE superbill_id = ? ORDER BY sort_order', [id])
    return rowToSuperbill(row, dx, li)
  }
  return null
}

// ── Get patient superbills ────────────────────────────────────────────────────
export async function getPatientSuperbills(kv: KVNamespace, patientId: string, db?: D1Database): Promise<SuperbillSummary[]> {
  if (db) {
    const rows = await dbAll<Record<string, unknown>>(db,
      `SELECT id, patient_id, patient_name, service_date, provider_name, total_charge, copay_collected, insurance_paid, patient_balance, status, created_at, updated_at
       FROM superbills WHERE patient_id = ? ORDER BY created_at DESC`, [patientId])
    return rows.map(r => ({
      id: r.id as string, patientId: r.patient_id as string, patientName: r.patient_name as string,
      serviceDate: r.service_date as string, providerName: r.provider_name as string,
      totalCharge: (r.total_charge as number) || 0,
      amountPaid: ((r.copay_collected as number) || 0) + ((r.insurance_paid as number) || 0),
      balance: (r.patient_balance as number) || 0,
      status: r.status as SuperbillStatus, createdAt: r.created_at as string, updatedAt: r.updated_at as string,
    }))
  }
  return []
}

// ── Create superbill ──────────────────────────────────────────────────────────
export async function createSuperbill(kv: KVNamespace, input: SuperbillCreateInput, db?: D1Database): Promise<Superbill> {
  const id = genUid('sb')
  const ts = now()
  const totals = computeTotals(input.lineItems || [], input.copayAmount || 0, input.copayCollected || 0)
  const sb: Superbill = {
    id, organizationId: 'org-001',
    patientId: input.patientId, patientName: input.patientName || '',
    examId: input.examId, appointmentId: input.appointmentId,
    serviceDate: input.serviceDate || today(),
    providerId: input.providerId, providerName: input.providerName || '', providerNpi: input.providerNpi,
    primaryInsurance: input.primaryInsurance,
    lineItems: input.lineItems || [], diagnoses: input.diagnoses || [],
    copayAmount: input.copayAmount || 0, copayCollected: input.copayCollected || 0,
    insuranceBilled: 0, insurancePaid: 0,
    ...totals, adjustments: totals.adjustments,
    status: 'DRAFT', notes: input.notes, createdBy: input.createdBy,
    createdAt: ts, updatedAt: ts,
  }

  if (db) {
    await dbRun(db, `INSERT INTO superbills
      (id, organization_id, patient_id, patient_name, exam_id, appointment_id, service_date,
       provider_id, provider_name, provider_npi, primary_insurance, total_charge, copay_amount,
       copay_collected, insurance_billed, insurance_paid, patient_balance, adjustments, status, notes, created_by, created_at, updated_at)
      VALUES (?, 'org-001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'DRAFT', ?, ?, ?, ?)`,
      [id, sb.patientId, sb.patientName, sb.examId || null, sb.appointmentId || null,
       sb.serviceDate, sb.providerId || null, sb.providerName, sb.providerNpi || null,
       toJson(sb.primaryInsurance), sb.totalCharge, sb.copayAmount, sb.copayCollected,
       sb.insuranceBilled, sb.patientBalance, sb.adjustments,
       sb.notes || null, sb.createdBy || null, ts, ts])

    for (let i = 0; i < (sb.diagnoses || []).length; i++) {
      const dx = sb.diagnoses[i]
      await dbRun(db, `INSERT INTO superbill_diagnoses (id, superbill_id, icd10_code, description, is_primary, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
        [genUid('dx'), id, dx.icd10Code, dx.description || '', dx.isPrimary ? 1 : 0, i])
    }
    for (let i = 0; i < (sb.lineItems || []).length; i++) {
      const li = sb.lineItems[i]
      await dbRun(db, `INSERT INTO superbill_line_items (id, superbill_id, cpt_code, description, icd10_pointers, units, fee, total, modifier, eye, approved, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [genUid('li'), id, li.cptCode, li.description || '', toJson(li.icd10Pointers),
         li.units || 1, li.fee || 0, li.total || 0, li.modifier || null, li.eye || null, li.approved ? 1 : 0, i])
    }
  }
  return sb
}

// ── Update superbill items ────────────────────────────────────────────────────
export async function updateSuperbillItems(
  kv: KVNamespace, id: string, lineItems: BillLineItem[], diagnoses: Superbill['diagnoses'], db?: D1Database
): Promise<Superbill | null> {
  const sb = await getSuperbill(kv, id, db)
  if (!sb || sb.status === 'SUBMITTED' || sb.status === 'PAID') return null

  const totals = computeTotals(lineItems, sb.copayAmount, sb.copayCollected)
  if (db) {
    await dbRun(db, `UPDATE superbills SET total_charge=?, patient_balance=?, adjustments=?, updated_at=? WHERE id=?`,
      [totals.totalCharge, totals.patientBalance, totals.adjustments, now(), id])
    await dbRun(db, 'DELETE FROM superbill_line_items WHERE superbill_id = ?', [id])
    await dbRun(db, 'DELETE FROM superbill_diagnoses WHERE superbill_id = ?', [id])
    for (let i = 0; i < lineItems.length; i++) {
      const li = lineItems[i]
      await dbRun(db, `INSERT INTO superbill_line_items (id, superbill_id, cpt_code, description, icd10_pointers, units, fee, total, modifier, eye, approved, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [genUid('li'), id, li.cptCode, li.description || '', toJson(li.icd10Pointers),
         li.units || 1, li.fee || 0, li.total || 0, li.modifier || null, li.eye || null, li.approved ? 1 : 0, i])
    }
    for (let i = 0; i < diagnoses.length; i++) {
      const dx = diagnoses[i]
      await dbRun(db, `INSERT INTO superbill_diagnoses (id, superbill_id, icd10_code, description, is_primary, sort_order) VALUES (?, ?, ?, ?, ?, ?)`,
        [genUid('dx'), id, dx.icd10Code, dx.description || '', dx.isPrimary ? 1 : 0, i])
    }
  }
  return getSuperbill(kv, id, db)
}

// ── Advance status ────────────────────────────────────────────────────────────
const STATUS_FLOW: Partial<Record<SuperbillStatus, SuperbillStatus>> = {
  DRAFT: 'PENDING_REVIEW', PENDING_REVIEW: 'REVIEWED', REVIEWED: 'SUBMITTED',
  SUBMITTED: 'PAID', DENIED: 'PENDING_REVIEW',
}

export async function advanceSuperbillStatus(kv: KVNamespace, id: string, db?: D1Database): Promise<Superbill | null> {
  const sb = await getSuperbill(kv, id, db)
  if (!sb) return null
  const next = STATUS_FLOW[sb.status]
  if (!next) return null
  if (db) {
    const ts = now()
    await dbRun(db, 'UPDATE superbills SET status=?, updated_at=? WHERE id=?', [next, ts, id])
    if (next === 'SUBMITTED') await dbRun(db, 'UPDATE superbills SET submitted_at=? WHERE id=?', [ts, id])
    if (next === 'PAID') await dbRun(db, 'UPDATE superbills SET paid_at=? WHERE id=?', [ts, id])
  }
  return getSuperbill(kv, id, db)
}

// ── Record payment ────────────────────────────────────────────────────────────
export async function recordPayment(
  kv: KVNamespace, patientId: string, superbillId: string, amount: number, method: PaymentMethod, reference?: string, db?: D1Database
): Promise<Payment> {
  const id = genUid('pay')
  const ts = now()
  const payment: Payment = { id, patientId, superbillId, amount, paymentMethod: method, referenceNumber: reference, postedAt: ts }
  if (db) {
    await dbRun(db, `INSERT INTO payments (id, organization_id, patient_id, superbill_id, amount, payment_method, reference_number, posted_at)
      VALUES (?, 'org-001', ?, ?, ?, ?, ?, ?)`,
      [id, patientId, superbillId, amount, method, reference || null, ts])
    await dbRun(db, `UPDATE superbills SET copay_collected = copay_collected + ?, patient_balance = patient_balance - ?, updated_at = ? WHERE id = ?`,
      [amount, amount, ts, superbillId])
  }
  return payment
}

// ── AR Summary ────────────────────────────────────────────────────────────────
export interface ArSummary {
  totalOutstanding: number
  totalCharged: number
  totalCollected: number
  totalAdjustments: number
  byStatus: Record<SuperbillStatus, { count: number; amount: number }>
  recentActivity: SuperbillSummary[]
}

export async function getArSummary(kv: KVNamespace, db?: D1Database): Promise<ArSummary> {
  const summaries = await listSuperbills(kv, db)
  const all = await Promise.all(summaries.map(s => getSuperbill(kv, s.id, db)))
  const sbs = all.filter(Boolean) as Superbill[]

  const byStatus = {} as ArSummary['byStatus']
  let totalCharged = 0, totalCollected = 0, totalAdjustments = 0, totalOutstanding = 0

  for (const sb of sbs) {
    if (!byStatus[sb.status]) byStatus[sb.status] = { count: 0, amount: 0 }
    byStatus[sb.status].count++
    byStatus[sb.status].amount += sb.totalCharge
    totalCharged += sb.totalCharge
    totalCollected += sb.copayCollected + (sb.insurancePaid ?? 0)
    totalAdjustments += sb.adjustments
    if (!['PAID', 'VOID'].includes(sb.status)) totalOutstanding += sb.patientBalance
  }
  return {
    totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
    totalCharged: parseFloat(totalCharged.toFixed(2)),
    totalCollected: parseFloat(totalCollected.toFixed(2)),
    totalAdjustments: parseFloat(totalAdjustments.toFixed(2)),
    byStatus,
    recentActivity: summaries.slice(0, 5),
  }
}

// ── CPT search ────────────────────────────────────────────────────────────────
export function searchCptCodes(query: string) {
  const q = query.toUpperCase()
  return CPT_CODES.filter(c => c.code.includes(q) || c.description.toUpperCase().includes(q)).slice(0, 10)
}
