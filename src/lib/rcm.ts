// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Revenue Cycle Management (Phase D1-6) — D1-backed
// rcm_claims, rcm_eras, rcm_statements, rcm_payment_plans → D1
// KV param kept for backward-compat but NOT used for data.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  RCMClaim, ClaimStatus, ClaimLine, ClaimPayment, ClaimDenial, ClaimNote,
  RemittanceAdvice, PatientStatement, PaymentPlan,
  RCMDashboardStats, AgingBucket,
} from '../types/rcm';
import { dbGet, dbAll, dbRun, now as dbNow } from './db';

const ts = () => dbNow();

// ── Row mappers ───────────────────────────────────────────────────────────────
function rowToClaim(r: Record<string, unknown>): RCMClaim {
  const parse = (v: unknown) => v ? JSON.parse(v as string) : [];
  return {
    id:             r.id as string,
    claimNumber:    r.claim_number as string,
    patientId:      r.patient_id as string,
    patientName:    r.patient_name as string,
    dateOfBirth:    r.date_of_birth as string | undefined,
    examId:         r.exam_id as string | undefined,
    payerId:        r.payer_id as string,
    payerName:      r.payer_name as string,
    payerType:      r.payer_type as RCMClaim['payerType'],
    insurancePlan:  r.insurance_plan as string,
    memberId:       r.member_id as string,
    groupNumber:    r.group_number as string | undefined,
    providerId:     r.provider_id as string,
    providerName:   r.provider_name as string,
    providerNpi:    r.npi as string | undefined,
    serviceDate:    r.service_date as string,
    submittedDate:  r.submission_date as string | undefined,
    status:         r.status as ClaimStatus,
    totalCharged:   r.total_charged as number,
    totalAllowed:   r.total_allowed as number,
    totalPaid:      r.total_paid as number,
    totalPatientResponsibility: r.patient_responsibility as number,
    totalAdjustment: r.adjustment as number,
    outstandingBalance: (r.total_charged as number) - (r.total_paid as number) - (r.adjustment as number),
    agingBucket:    r.aging_bucket as AgingBucket,
    claimLines:     parse(r.lines),
    payments:       parse(r.payments),
    denials:        parse(r.denials),
    notes:          parse(r.notes),
    diagnosisCodes: [],
    placeOfService: '11',
    createdAt:      r.created_at as string,
    updatedAt:      r.updated_at as string,
  };
}

function rowToEra(r: Record<string, unknown>): RemittanceAdvice {
  return {
    id:             r.id as string,
    payerId:        r.payer_id as string,
    payerName:      r.payer_name as string,
    checkDate:      r.payment_date as string,
    checkNumber:    r.check_number as string | undefined,
    eftTraceNumber: r.eft_trace as string | undefined,
    totalPayment:   r.total_payment as number,
    claimsCount:    r.claims_count as number,
    claimIds:       JSON.parse((r.claim_ids as string) || '[]'),
    status:         r.status as RemittanceAdvice['status'],
    receivedDate:   r.created_at as string,
    postedBy:       r.posted_by as string | undefined,
    postedDate:     r.posted_at as string | undefined,
  };
}

function rowToStatement(r: Record<string, unknown>): PatientStatement {
  return {
    id:              r.id as string,
    patientId:       r.patient_id as string,
    patientName:     r.patient_name as string,
    statementDate:   r.statement_date as string,
    dueDate:         r.due_date as string | undefined,
    totalDue:        r.balance_due as number,
    claimIds:        JSON.parse((r.claim_ids as string) || '[]'),
    status:          r.status as PatientStatement['status'],
    sentDate:        r.sent_date as string | undefined,
    viewedDate:      r.viewed_date as string | undefined,
    paidDate:        r.paid_date as string | undefined,
    createdAt:       r.created_at as string,
  };
}

function rowToPlan(r: Record<string, unknown>): PaymentPlan {
  return {
    id:              r.id as string,
    patientId:       r.patient_id as string,
    patientName:     r.patient_name as string,
    totalBalance:    r.total_amount as number,
    monthlyPayment:  r.installment_amt as number,
    startDate:       r.start_date as string,
    endDate:         r.next_due_date as string | undefined,
    claimIds:        JSON.parse((r.claim_ids as string) || '[]'),
    status:          r.status as PaymentPlan['status'],
    payments:        [],
    createdAt:       r.created_at as string,
  };
}

// ── seedRCM ───────────────────────────────────────────────────────────────────
// Seeding handled via migration 0013; no-op kept for backward-compat.
export async function seedRCM(kv: KVNamespace, db?: D1Database): Promise<void> { /* migration */ }

// ── listClaims ────────────────────────────────────────────────────────────────
export async function listClaims(
  kv: KVNamespace,
  filters?: { status?: string; patientId?: string; payerId?: string },
  db?: D1Database
): Promise<RCMClaim[]> {
  if (!db) return [];
  const conditions: string[] = [];
  const params: unknown[]    = [];
  if (filters?.status)    { conditions.push('status=?');     params.push(filters.status); }
  if (filters?.patientId) { conditions.push('patient_id=?'); params.push(filters.patientId); }
  if (filters?.payerId)   { conditions.push('payer_id=?');   params.push(filters.payerId); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM rcm_claims ${where} ORDER BY service_date DESC`, params
  );
  return rows.map(rowToClaim);
}

// ── getClaim ──────────────────────────────────────────────────────────────────
export async function getClaim(kv: KVNamespace, id: string, db?: D1Database): Promise<RCMClaim | null> {
  if (!db) return null;
  const row = await dbGet<Record<string, unknown>>(db, `SELECT * FROM rcm_claims WHERE id=?`, [id]);
  return row ? rowToClaim(row) : null;
}

// ── createClaim ───────────────────────────────────────────────────────────────
export async function createClaim(kv: KVNamespace, data: Partial<RCMClaim>, db?: D1Database): Promise<RCMClaim> {
  if (!db) throw new Error('D1 required');
  const now = ts();
  const id  = data.id ?? `rcm-${Date.now().toString(36)}`;
  await dbRun(db,
    `INSERT INTO rcm_claims
       (id, claim_number, patient_id, patient_name, date_of_birth, exam_id,
        payer_id, payer_name, payer_type, insurance_plan, member_id, group_number,
        provider_id, provider_name, npi, service_date, submission_date,
        status, total_charged, total_allowed, total_paid, patient_responsibility,
        adjustment, aging_bucket, lines, payments, denials, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, data.claimNumber ?? `CLM-${Date.now().toString(36)}`,
      data.patientId ?? '', data.patientName ?? '', data.dateOfBirth ?? null,
      data.examId ?? null,
      data.payerId ?? '', data.payerName ?? '', data.payerType ?? 'COMMERCIAL',
      data.insurancePlan ?? '', data.memberId ?? '', data.groupNumber ?? null,
      data.providerId ?? '', data.providerName ?? '', data.providerNpi ?? null,
      data.serviceDate ?? now.slice(0, 10), data.submittedDate ?? null,
      data.status ?? 'DRAFT',
      data.totalCharged ?? 0, data.totalAllowed ?? 0, data.totalPaid ?? 0,
      data.totalPatientResponsibility ?? 0, data.totalAdjustment ?? 0,
      data.agingBucket ?? 'CURRENT',
      JSON.stringify(data.claimLines ?? []),
      JSON.stringify(data.payments ?? []),
      JSON.stringify(data.denials ?? []),
      JSON.stringify(data.notes ?? []),
      now, now,
    ]
  );
  return (await getClaim(kv, id, db))!;
}

// ── updateClaimStatus ─────────────────────────────────────────────────────────
export async function updateClaimStatus(
  kv: KVNamespace, id: string, status: ClaimStatus, userId: string, db?: D1Database
): Promise<RCMClaim | null> {
  if (!db) return null;
  await dbRun(db, `UPDATE rcm_claims SET status=?, updated_at=? WHERE id=?`, [status, ts(), id]);
  return getClaim(kv, id, db);
}

// ── postPayment ───────────────────────────────────────────────────────────────
export async function postPayment(
  kv: KVNamespace, claimId: string, payment: Omit<ClaimPayment, 'id'>, db?: D1Database
): Promise<RCMClaim | null> {
  if (!db) return null;
  const claim = await getClaim(kv, claimId, db);
  if (!claim) return null;
  const pmt: ClaimPayment = { ...payment, id: `pay-${Date.now().toString(36)}` };
  const payments = [...claim.payments, pmt];
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const newStatus: ClaimStatus = totalPaid >= claim.totalCharged ? 'PAID'
    : totalPaid > 0 ? 'PARTIAL_PAYMENT' : claim.status;
  await dbRun(db,
    `UPDATE rcm_claims SET payments=?, total_paid=?, status=?, updated_at=? WHERE id=?`,
    [JSON.stringify(payments), totalPaid, newStatus, ts(), claimId]
  );
  return getClaim(kv, claimId, db);
}

// ── addDenial ─────────────────────────────────────────────────────────────────
export async function addDenial(
  kv: KVNamespace, claimId: string, denial: Omit<ClaimDenial, 'id'>, db?: D1Database
): Promise<RCMClaim | null> {
  if (!db) return null;
  const claim = await getClaim(kv, claimId, db);
  if (!claim) return null;
  const d: ClaimDenial = { ...denial, id: `den-${Date.now().toString(36)}` };
  const denials = [...claim.denials, d];
  await dbRun(db,
    `UPDATE rcm_claims SET denials=?, status='DENIED', updated_at=? WHERE id=?`,
    [JSON.stringify(denials), ts(), claimId]
  );
  return getClaim(kv, claimId, db);
}

// ── addClaimNote ──────────────────────────────────────────────────────────────
export async function addClaimNote(
  kv: KVNamespace, claimId: string, note: Omit<ClaimNote, 'id' | 'createdAt'>, db?: D1Database
): Promise<RCMClaim | null> {
  if (!db) return null;
  const claim = await getClaim(kv, claimId, db);
  if (!claim) return null;
  const n: ClaimNote = { ...note, id: `note-${Date.now().toString(36)}`, createdAt: ts() };
  await dbRun(db,
    `UPDATE rcm_claims SET notes=?, updated_at=? WHERE id=?`,
    [JSON.stringify([...claim.notes, n]), ts(), claimId]
  );
  return getClaim(kv, claimId, db);
}

// ── deleteClaim ───────────────────────────────────────────────────────────────
export async function deleteClaim(kv: KVNamespace, id: string, db?: D1Database): Promise<boolean> {
  if (!db) return false;
  const claim = await getClaim(kv, id, db);
  if (!claim || claim.status === 'PAID') return false;
  await dbRun(db, `DELETE FROM rcm_claims WHERE id=?`, [id]);
  return true;
}

// ── ERAs ──────────────────────────────────────────────────────────────────────
export async function listERAs(kv: KVNamespace, db?: D1Database): Promise<RemittanceAdvice[]> {
  if (!db) return [];
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM rcm_eras ORDER BY payment_date DESC`
  );
  return rows.map(rowToEra);
}

export async function getERA(kv: KVNamespace, id: string, db?: D1Database): Promise<RemittanceAdvice | null> {
  if (!db) return null;
  const row = await dbGet<Record<string, unknown>>(db, `SELECT * FROM rcm_eras WHERE id=?`, [id]);
  return row ? rowToEra(row) : null;
}

export async function createERA(kv: KVNamespace, data: Partial<RemittanceAdvice>, db?: D1Database): Promise<RemittanceAdvice> {
  if (!db) throw new Error('D1 required');
  const now = ts();
  const id  = data.id ?? `era-${Date.now().toString(36)}`;
  await dbRun(db,
    `INSERT INTO rcm_eras (id, payer_id, payer_name, check_number, eft_trace, payment_date,
       total_payment, claims_count, claim_ids, status, posted_by, posted_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, data.payerId ?? '', data.payerName ?? '',
      data.checkNumber ?? null, data.eftTraceNumber ?? null,
      data.checkDate ?? now.slice(0, 10),
      data.totalPayment ?? 0, data.claimsCount ?? 0,
      JSON.stringify(data.claimIds ?? []),
      data.status ?? 'RECEIVED',
      data.postedBy ?? null, data.postedDate ?? null, now,
    ]
  );
  return (await getERA(kv, id, db))!;
}

// ── Statements ────────────────────────────────────────────────────────────────
export async function listStatements(kv: KVNamespace, patientId?: string, db?: D1Database): Promise<PatientStatement[]> {
  if (!db) return [];
  const rows = patientId
    ? await dbAll<Record<string, unknown>>(db, `SELECT * FROM rcm_statements WHERE patient_id=? ORDER BY statement_date DESC`, [patientId])
    : await dbAll<Record<string, unknown>>(db, `SELECT * FROM rcm_statements ORDER BY statement_date DESC`);
  return rows.map(rowToStatement);
}

export async function getStatement(kv: KVNamespace, id: string, db?: D1Database): Promise<PatientStatement | null> {
  if (!db) return null;
  const row = await dbGet<Record<string, unknown>>(db, `SELECT * FROM rcm_statements WHERE id=?`, [id]);
  return row ? rowToStatement(row) : null;
}

export async function createStatement(kv: KVNamespace, data: Partial<PatientStatement>, db?: D1Database): Promise<PatientStatement> {
  if (!db) throw new Error('D1 required');
  const now = ts();
  const id  = data.id ?? `stmt-${Date.now().toString(36)}`;
  await dbRun(db,
    `INSERT INTO rcm_statements
       (id, patient_id, patient_name, statement_date, due_date, balance_due,
        claim_ids, status, sent_date, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, data.patientId ?? '', data.patientName ?? '',
      data.statementDate ?? now.slice(0, 10),
      data.dueDate ?? null, data.totalDue ?? 0,
      JSON.stringify(data.claimIds ?? []),
      data.status ?? 'DRAFT', data.sentDate ?? null, now, now,
    ]
  );
  return (await getStatement(kv, id, db))!;
}

// ── Payment Plans ─────────────────────────────────────────────────────────────
export async function listPaymentPlans(kv: KVNamespace, patientId?: string, db?: D1Database): Promise<PaymentPlan[]> {
  if (!db) return [];
  const rows = patientId
    ? await dbAll<Record<string, unknown>>(db, `SELECT * FROM rcm_payment_plans WHERE patient_id=?`, [patientId])
    : await dbAll<Record<string, unknown>>(db, `SELECT * FROM rcm_payment_plans ORDER BY created_at DESC`);
  return rows.map(rowToPlan);
}

export async function getPaymentPlan(kv: KVNamespace, id: string, db?: D1Database): Promise<PaymentPlan | null> {
  if (!db) return null;
  const row = await dbGet<Record<string, unknown>>(db, `SELECT * FROM rcm_payment_plans WHERE id=?`, [id]);
  return row ? rowToPlan(row) : null;
}

export async function createPaymentPlan(kv: KVNamespace, data: Partial<PaymentPlan>, db?: D1Database): Promise<PaymentPlan> {
  if (!db) throw new Error('D1 required');
  const now = ts();
  const id  = data.id ?? `pp-${Date.now().toString(36)}`;
  const total = data.totalBalance ?? 0;
  await dbRun(db,
    `INSERT INTO rcm_payment_plans
       (id, patient_id, patient_name, total_amount, amount_paid, remaining,
        installment_amt, start_date, next_due_date, claim_ids, status,
        notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, data.patientId ?? '', data.patientName ?? '',
      total, 0, total,
      data.monthlyPayment ?? 0,
      data.startDate ?? now.slice(0, 10), data.endDate ?? null,
      JSON.stringify(data.claimIds ?? []),
      data.status ?? 'ACTIVE', null, now, now,
    ]
  );
  return (await getPaymentPlan(kv, id, db))!;
}

// ── RCM Dashboard ─────────────────────────────────────────────────────────────
export async function getRCMDashboard(kv: KVNamespace, db?: D1Database): Promise<RCMDashboardStats> {
  if (!db) return {
    totalCharged: 0, totalAllowed: 0, totalPaid: 0, totalOutstanding: 0,
    collectionRate: 0, firstPassRate: 0, avgDaysToPayment: 0,
    claimsInFlight: 0, claimsDenied: 0, claimsAppeal: 0,
    aging: { CURRENT: 0, '1_30': 0, '31_60': 0, '61_90': 0, '91_120': 0, OVER_120: 0 },
    denialsByReason: [], recentActivity: [],
  };

  const rows = await dbAll<Record<string, unknown>>(db, `SELECT * FROM rcm_claims`);
  const claims = rows.map(rowToClaim);

  const paid   = claims.filter(c => c.status === 'PAID');
  const denied = claims.filter(c => c.status === 'DENIED');
  const appeal = claims.filter(c => c.status === 'APPEALED');
  const inflight = claims.filter(c =>
    ['SUBMITTED','ACKNOWLEDGED','PENDING','UNDER_REVIEW','PARTIAL_PAYMENT','APPEALED'].includes(c.status)
  );

  const totalCharged     = claims.reduce((s, c) => s + c.totalCharged, 0);
  const totalPaid        = claims.reduce((s, c) => s + c.totalPaid, 0);
  const totalOutstanding = claims.filter(c => !['PAID','VOIDED','WRITTEN_OFF'].includes(c.status))
    .reduce((s, c) => s + c.totalCharged - c.totalPaid, 0);

  const aging = { CURRENT: 0, '1_30': 0, '31_60': 0, '61_90': 0, '91_120': 0, OVER_120: 0 } as Record<AgingBucket, number>;
  claims.forEach(c => { if (c.agingBucket in aging) aging[c.agingBucket] += c.totalCharged - c.totalPaid; });

  const denialMap: Record<string, number> = {};
  claims.flatMap(c => c.denials).forEach(d => { denialMap[d.reason] = (denialMap[d.reason] ?? 0) + 1; });

  return {
    totalCharged, totalAllowed: claims.reduce((s, c) => s + c.totalAllowed, 0),
    totalPaid, totalOutstanding,
    collectionRate: totalCharged ? Math.round((totalPaid / totalCharged) * 100) : 0,
    firstPassRate: claims.length ? Math.round(((claims.length - denied.length) / claims.length) * 100) : 0,
    avgDaysToPayment: paid.length ? 15 : 0,
    claimsInFlight: inflight.length, claimsDenied: denied.length, claimsAppeal: appeal.length,
    aging,
    denialsByReason: Object.entries(denialMap).map(([reason, count]) => ({ reason, count })),
    recentActivity: claims.slice(0, 5).map(c => ({
      claimId: c.id, claimNumber: c.claimNumber,
      patientName: c.patientName, action: c.status, date: c.updatedAt, amount: c.totalCharged,
    })),
  };
}

// ── Exported validation constants (used by routes) ────────────────────────────
export const VALID_CLAIM_STATUSES: string[] = [
  'DRAFT','READY_TO_SUBMIT','SUBMITTED','ACKNOWLEDGED','PENDING',
  'UNDER_REVIEW','PARTIAL_PAYMENT','PAID','DENIED','APPEALED',
  'APPEAL_APPROVED','APPEAL_DENIED','VOIDED','WRITTEN_OFF',
];
export const DENIAL_REASONS: string[] = [
  'NOT_COVERED','AUTHORIZATION_REQUIRED','MEDICAL_NECESSITY','DUPLICATE_CLAIM',
  'TIMELY_FILING','ELIGIBILITY','COORDINATION_OF_BENEFITS','CODING_ERROR',
  'MISSING_INFORMATION','BUNDLING','FREQUENCY_LIMITATION','OTHER',
];
export const PAYER_TYPES: string[] = [
  'COMMERCIAL','MEDICARE','MEDICAID','TRICARE','WORKERS_COMP','SELF_PAY','OTHER',
];
export const PAYMENT_METHODS: string[] = [
  'CHECK','EFT','CREDIT_CARD','CASH','PATIENT_PORTAL','ADJUSTMENT','WRITE_OFF',
];
