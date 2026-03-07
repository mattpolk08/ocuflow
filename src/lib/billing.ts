// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Billing & Claims Library  (Phase 2A)
// src/lib/billing.ts
// KV-backed superbill store with CPT/ICD-10 mapping, payments, and AR management
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

// ── KV key helpers ────────────────────────────────────────────────────────────
const KEY_INDEX    = 'billing:index'
const KEY_SB       = (id: string) => `billing:superbill:${id}`
const KEY_PATIENT  = (pid: string) => `billing:patient:${pid}`
const KEY_PAYMENTS = 'billing:payments:index'
const KEY_PAYMENT  = (id: string) => `billing:payment:${id}`
const KEY_SEEDED   = 'billing:seeded'

// ── Short UUID helper ─────────────────────────────────────────────────────────
function uid8(): string {
  return Math.random().toString(36).slice(2, 10)
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function today(): string {
  return new Date().toISOString().slice(0, 10)
}
function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

// ── Default suggested CPT codes for an exam type ─────────────────────────────
export function suggestCptCodes(examType: string): string[] {
  const key = examType.toUpperCase().replace(/[^A-Z_]/g, '')
  for (const [k, codes] of Object.entries(EXAM_TYPE_CPT_MAP)) {
    if (key.includes(k) || k.includes(key)) return codes
  }
  return ['92014']
}

// ── Build line items from CPT codes + diagnoses ───────────────────────────────
export function buildLineItems(
  cptCodes: string[],
  icd10Codes: string[],
): BillLineItem[] {
  return cptCodes
    .map((code) => {
      const cpt = CPT_MAP[code]
      if (!cpt) return null
      const item: BillLineItem = {
        id:            `li-${uid8()}`,
        cptCode:       cpt.code,
        description:   cpt.description,
        icd10Pointers: cpt.requiresDx ? icd10Codes.slice(0, 4) : [],
        units:         cpt.units ?? 1,
        fee:           cpt.fee,
        total:         cpt.fee * (cpt.units ?? 1),
        approved:      true,
      }
      return item
    })
    .filter(Boolean) as BillLineItem[]
}

// ── Compute financial totals ──────────────────────────────────────────────────
function computeTotals(
  lineItems: BillLineItem[],
  copayAmount: number,
  copayCollected: number,
): Pick<Superbill, 'totalCharge' | 'insuranceBilled' | 'patientBalance' | 'adjustments'> {
  const totalCharge = lineItems.reduce((s, li) => s + li.total, 0)
  const contractualRate = 0.72  // 72 % of charges (typical managed care rate)
  const insuranceBilled = parseFloat((totalCharge * contractualRate).toFixed(2))
  const adjustments     = parseFloat(((totalCharge - insuranceBilled)).toFixed(2))
  const patientBalance  = parseFloat((copayAmount - copayCollected).toFixed(2))
  return { totalCharge, insuranceBilled, patientBalance, adjustments }
}

// ── Seed data ─────────────────────────────────────────────────────────────────
const SEED_SUPERBILLS: Omit<Superbill, 'totalCharge' | 'insuranceBilled' | 'patientBalance' | 'adjustments'>[] = [
  {
    id: 'sb-001',
    organizationId: 'org-001',
    patientId: 'pt-001',
    patientName: 'Margaret Sullivan',
    examId: 'exam-001',
    appointmentId: 'appt-001',
    serviceDate: daysAgo(3),
    providerId: 'dr-chen',
    providerName: 'Dr. Sarah Chen, OD',
    providerNpi: '1234567890',
    primaryInsurance: {
      payerName: 'Blue Cross Blue Shield',
      payerId: 'BCBS',
      memberId: 'BCB-001-5892',
      groupId: 'GRP-4421',
      copay: 25,
    },
    diagnoses: [
      { icd10Code: 'H40.1130', description: 'Primary open-angle glaucoma, bilateral, mild stage', primary: true },
      { icd10Code: 'H52.10',   description: 'Myopia, unspecified', primary: false },
    ],
    lineItems: buildLineItems(['92014', '92083', '92133'], ['H40.1130', 'H52.10']),
    copayAmount: 25,
    copayCollected: 25,
    status: 'SUBMITTED',
    claimNumber: 'CLM-2026-001',
    submittedAt: daysAgo(2) + 'T09:00:00Z',
    createdAt: daysAgo(3) + 'T14:00:00Z',
    updatedAt: daysAgo(2) + 'T09:00:00Z',
  },
  {
    id: 'sb-002',
    organizationId: 'org-001',
    patientId: 'pt-002',
    patientName: 'Derek Holloway',
    examId: 'exam-002',
    appointmentId: 'appt-002',
    serviceDate: daysAgo(1),
    providerId: 'dr-patel',
    providerName: 'Dr. Raj Patel, MD',
    providerNpi: '0987654321',
    primaryInsurance: {
      payerName: 'Aetna',
      payerId: 'AETNA',
      memberId: 'AET-002-7731',
      groupId: 'GRP-8810',
      copay: 40,
    },
    diagnoses: [
      { icd10Code: 'H33.001', description: 'Unspecified retinal detachment, right eye', primary: true },
      { icd10Code: 'Z98.41',  description: 'Cataract extraction status, right eye', primary: false },
    ],
    lineItems: buildLineItems(['99214', '92134', '92250'], ['H33.001', 'Z98.41']),
    copayAmount: 40,
    copayCollected: 40,
    status: 'PENDING_REVIEW',
    createdAt: daysAgo(1) + 'T11:30:00Z',
    updatedAt: daysAgo(1) + 'T11:30:00Z',
  },
  {
    id: 'sb-003',
    organizationId: 'org-001',
    patientId: 'pt-003',
    patientName: 'Priya Nair',
    examId: 'exam-003',
    appointmentId: 'appt-003',
    serviceDate: today(),
    providerId: 'dr-chen',
    providerName: 'Dr. Sarah Chen, OD',
    providerNpi: '1234567890',
    primaryInsurance: {
      payerName: 'UnitedHealthcare',
      payerId: 'UHC',
      memberId: 'UHC-003-2291',
      copay: 20,
    },
    diagnoses: [
      { icd10Code: 'H52.13',  description: 'Myopia, bilateral', primary: true },
      { icd10Code: 'Z80.2',   description: 'Family history of glaucoma', primary: false },
    ],
    lineItems: buildLineItems(['92004', '92310', '99070'], ['H52.13', 'Z80.2']),
    copayAmount: 20,
    copayCollected: 0,
    status: 'DRAFT',
    createdAt: today() + 'T08:00:00Z',
    updatedAt: today() + 'T08:00:00Z',
  },
  {
    id: 'sb-004',
    organizationId: 'org-001',
    patientId: 'pt-004',
    patientName: 'Raymond Osei',
    serviceDate: daysAgo(7),
    providerId: 'dr-patel',
    providerName: 'Dr. Raj Patel, MD',
    providerNpi: '0987654321',
    primaryInsurance: {
      payerName: 'Medicare Part B',
      payerId: 'MEDICARE',
      memberId: 'MED-004-9981',
      copay: 0,
    },
    diagnoses: [
      { icd10Code: 'E11.3511', description: 'Type 2 diabetes with moderate nonproliferative retinopathy, right eye', primary: true },
      { icd10Code: 'H35.81',   description: 'Retinal edema', primary: false },
    ],
    lineItems: buildLineItems(['92014', '92134', '92250', '67028'], ['E11.3511', 'H35.81']),
    copayAmount: 0,
    copayCollected: 0,
    status: 'PAID',
    claimNumber: 'CLM-2026-004',
    submittedAt: daysAgo(6) + 'T10:00:00Z',
    paidAt: daysAgo(2) + 'T14:00:00Z',
    createdAt: daysAgo(7) + 'T15:00:00Z',
    updatedAt: daysAgo(2) + 'T14:00:00Z',
  },
  {
    id: 'sb-005',
    organizationId: 'org-001',
    patientId: 'pt-005',
    patientName: 'Linda Tran',
    serviceDate: daysAgo(5),
    providerId: 'dr-chen',
    providerName: 'Dr. Sarah Chen, OD',
    providerNpi: '1234567890',
    diagnoses: [
      { icd10Code: 'H10.11', description: 'Acute atopic conjunctivitis, right eye', primary: true },
    ],
    lineItems: buildLineItems(['99213'], ['H10.11']),
    copayAmount: 30,
    copayCollected: 30,
    status: 'DENIED',
    claimNumber: 'CLM-2026-005',
    notes: 'Denied: service not covered under vision plan. Resubmit to medical plan.',
    submittedAt: daysAgo(4) + 'T08:30:00Z',
    createdAt: daysAgo(5) + 'T09:00:00Z',
    updatedAt: daysAgo(3) + 'T11:00:00Z',
  },
]

// ── Ensure seed data ──────────────────────────────────────────────────────────
export async function ensureBillingSeed(kv: KVNamespace): Promise<void> {
  const seeded = await kv.get(KEY_SEEDED)
  if (seeded) return

  const ids: string[] = []

  for (const partial of SEED_SUPERBILLS) {
    const totals = computeTotals(partial.lineItems, partial.copayAmount, partial.copayCollected)
    const sb: Superbill = { ...partial, ...totals }
    await kv.put(KEY_SB(sb.id), JSON.stringify(sb))

    // Patient index
    const patList: string[] = JSON.parse((await kv.get(KEY_PATIENT(sb.patientId))) ?? '[]')
    patList.push(sb.id)
    await kv.put(KEY_PATIENT(sb.patientId), JSON.stringify(patList))

    ids.push(sb.id)
  }

  await kv.put(KEY_INDEX, JSON.stringify(ids))
  await kv.put(KEY_SEEDED, '1')
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────

export async function listSuperbills(kv: KVNamespace): Promise<SuperbillSummary[]> {
  await ensureBillingSeed(kv)
  const ids: string[] = JSON.parse((await kv.get(KEY_INDEX)) ?? '[]')
  const results: SuperbillSummary[] = []
  for (const id of ids) {
    const raw = await kv.get(KEY_SB(id))
    if (!raw) continue
    const sb: Superbill = JSON.parse(raw)
    results.push({
      id:             sb.id,
      patientId:      sb.patientId,
      patientName:    sb.patientName,
      serviceDate:    sb.serviceDate,
      providerName:   sb.providerName,
      status:         sb.status,
      totalCharge:    sb.totalCharge,
      patientBalance: sb.patientBalance,
      copayCollected: sb.copayCollected,
      diagnosisCodes: sb.diagnoses.map(d => d.icd10Code),
      cptCodes:       sb.lineItems.map(li => li.cptCode),
      claimNumber:    sb.claimNumber,
    })
  }
  // Newest first
  return results.sort((a, b) => b.serviceDate.localeCompare(a.serviceDate))
}

export async function getSuperbill(kv: KVNamespace, id: string): Promise<Superbill | null> {
  await ensureBillingSeed(kv)
  const raw = await kv.get(KEY_SB(id))
  return raw ? JSON.parse(raw) : null
}

export async function getPatientSuperbills(kv: KVNamespace, patientId: string): Promise<SuperbillSummary[]> {
  await ensureBillingSeed(kv)
  const all = await listSuperbills(kv)
  return all.filter(sb => sb.patientId === patientId)
}

export async function createSuperbill(kv: KVNamespace, input: SuperbillCreateInput): Promise<Superbill> {
  await ensureBillingSeed(kv)

  const id      = `sb-${uid8()}`
  const now     = new Date().toISOString()
  const copay   = input.copayAmount ?? 0
  const lineItems = buildLineItems(
    suggestCptCodes('COMPREHENSIVE'),
    (input.diagnoses ?? []).map(d => d.icd10Code),
  )
  const totals = computeTotals(lineItems, copay, 0)

  const sb: Superbill = {
    id,
    organizationId: 'org-001',
    patientId:      input.patientId,
    patientName:    input.patientName,
    examId:         input.examId,
    appointmentId:  input.appointmentId,
    serviceDate:    input.serviceDate,
    providerId:     input.providerId,
    providerName:   input.providerName,
    primaryInsurance: input.primaryInsurance,
    diagnoses:      input.diagnoses ?? [],
    lineItems,
    copayAmount:    copay,
    copayCollected: 0,
    status:         'DRAFT',
    ...totals,
    createdAt: now,
    updatedAt: now,
  }

  await kv.put(KEY_SB(id), JSON.stringify(sb))

  // Update indices
  const ids: string[] = JSON.parse((await kv.get(KEY_INDEX)) ?? '[]')
  ids.unshift(id)
  await kv.put(KEY_INDEX, JSON.stringify(ids))

  const patList: string[] = JSON.parse((await kv.get(KEY_PATIENT(input.patientId))) ?? '[]')
  patList.unshift(id)
  await kv.put(KEY_PATIENT(input.patientId), JSON.stringify(patList))

  return sb
}

// ── Update line items / diagnoses ─────────────────────────────────────────────
export async function updateSuperbillItems(
  kv: KVNamespace,
  id: string,
  lineItems: BillLineItem[],
  diagnoses: Superbill['diagnoses'],
): Promise<Superbill | null> {
  const sb = await getSuperbill(kv, id)
  if (!sb) return null
  if (sb.status === 'SUBMITTED' || sb.status === 'PAID') return null

  const totals = computeTotals(lineItems, sb.copayAmount, sb.copayCollected)
  const updated: Superbill = {
    ...sb,
    lineItems,
    diagnoses,
    ...totals,
    updatedAt: new Date().toISOString(),
  }
  await kv.put(KEY_SB(id), JSON.stringify(updated))
  return updated
}

// ── Advance status ────────────────────────────────────────────────────────────
const STATUS_FLOW: Partial<Record<SuperbillStatus, SuperbillStatus>> = {
  DRAFT:           'PENDING_REVIEW',
  PENDING_REVIEW:  'REVIEWED',
  REVIEWED:        'SUBMITTED',
  SUBMITTED:       'PAID',
  DENIED:          'PENDING_REVIEW',  // re-submit flow
}

export async function advanceSuperbillStatus(
  kv: KVNamespace,
  id: string,
  toStatus?: SuperbillStatus,
): Promise<Superbill | null> {
  const sb = await getSuperbill(kv, id)
  if (!sb) return null

  const next = toStatus ?? STATUS_FLOW[sb.status]
  if (!next) return null

  const now = new Date().toISOString()
  const updated: Superbill = {
    ...sb,
    status: next,
    updatedAt: now,
    ...(next === 'SUBMITTED' ? { submittedAt: now, claimNumber: `CLM-${new Date().getFullYear()}-${uid8().slice(0,6).toUpperCase()}` } : {}),
    ...(next === 'PAID'      ? { paidAt: now } : {}),
  }
  await kv.put(KEY_SB(id), JSON.stringify(updated))
  return updated
}

// ── Record a payment ──────────────────────────────────────────────────────────
export async function recordPayment(
  kv: KVNamespace,
  superbillId: string,
  amount: number,
  method: PaymentMethod,
  paidBy: 'PATIENT' | 'INSURANCE',
  reference?: string,
  notes?: string,
): Promise<Payment | null> {
  const sb = await getSuperbill(kv, superbillId)
  if (!sb) return null

  const id  = `pay-${uid8()}`
  const now = new Date().toISOString()
  const pmt: Payment = {
    id,
    superbillId,
    patientId:   sb.patientId,
    patientName: sb.patientName,
    amount,
    method,
    status: 'COMPLETED',
    reference,
    paidBy,
    notes,
    postedAt:  now,
    createdAt: now,
  }

  await kv.put(KEY_PAYMENT(id), JSON.stringify(pmt))

  const pmtIds: string[] = JSON.parse((await kv.get(KEY_PAYMENTS)) ?? '[]')
  pmtIds.unshift(id)
  await kv.put(KEY_PAYMENTS, JSON.stringify(pmtIds))

  // Update superbill financials
  const updatedSb: Superbill = {
    ...sb,
    copayCollected: paidBy === 'PATIENT'
      ? sb.copayCollected + amount
      : sb.copayCollected,
    insurancePaid: paidBy === 'INSURANCE'
      ? (sb.insurancePaid ?? 0) + amount
      : sb.insurancePaid,
    patientBalance: Math.max(0, sb.patientBalance - (paidBy === 'PATIENT' ? amount : 0)),
    updatedAt: now,
  }
  // Auto-mark as PAID if balance is zero and insurance paid
  if (updatedSb.patientBalance <= 0 && updatedSb.status === 'SUBMITTED') {
    updatedSb.status  = 'PAID'
    updatedSb.paidAt  = now
  }
  await kv.put(KEY_SB(superbillId), JSON.stringify(updatedSb))

  return pmt
}

// ── AR summary ────────────────────────────────────────────────────────────────
export interface ArSummary {
  totalOutstanding: number
  totalCharged:     number
  totalCollected:   number
  totalAdjustments: number
  byStatus: Record<SuperbillStatus, { count: number; amount: number }>
  recentActivity: SuperbillSummary[]
}

export async function getArSummary(kv: KVNamespace): Promise<ArSummary> {
  const summaries = await listSuperbills(kv)
  const all        = await Promise.all(summaries.map(s => getSuperbill(kv, s.id)))
  const sbs        = all.filter(Boolean) as Superbill[]

  const byStatus = {} as ArSummary['byStatus']
  let totalCharged = 0, totalCollected = 0, totalAdjustments = 0, totalOutstanding = 0

  for (const sb of sbs) {
    if (!byStatus[sb.status]) byStatus[sb.status] = { count: 0, amount: 0 }
    byStatus[sb.status].count++
    byStatus[sb.status].amount += sb.totalCharge

    totalCharged     += sb.totalCharge
    totalCollected   += sb.copayCollected + (sb.insurancePaid ?? 0)
    totalAdjustments += sb.adjustments
    if (!['PAID', 'VOIDED'].includes(sb.status)) totalOutstanding += sb.patientBalance
  }

  return {
    totalOutstanding: parseFloat(totalOutstanding.toFixed(2)),
    totalCharged:     parseFloat(totalCharged.toFixed(2)),
    totalCollected:   parseFloat(totalCollected.toFixed(2)),
    totalAdjustments: parseFloat(totalAdjustments.toFixed(2)),
    byStatus,
    recentActivity: summaries.slice(0, 5),
  }
}

// ── CPT search ────────────────────────────────────────────────────────────────
export function searchCptCodes(query: string) {
  const q = query.toLowerCase()
  return CPT_CODES.filter(c =>
    c.code.includes(q) || c.description.toLowerCase().includes(q)
  ).slice(0, 20)
}
