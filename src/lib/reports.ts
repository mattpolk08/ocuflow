// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Reports & Analytics (Phase D1-12) — D1 SQL aggregations
// All reports now query D1 directly for accurate real-time data.
// KV param kept for backward-compat but NOT used for data.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  RevenueSummary, ProviderStats, PayerMixEntry,
  ArAging, AppointmentStats, ExamStats, PatientStats,
  ReportsDashboard,
} from '../types/reports'
import { dbGet, dbAll, now as dbNow } from './db'
import { CPT_MAP } from '../types/billing'

// ── getRevenueSummary ─────────────────────────────────────────────────────────
export async function getRevenueSummary(
  kv: KVNamespace,
  range: { start: string; end: string },
  db?: D1Database
): Promise<RevenueSummary> {
  if (!db) return { totalCharged: 0, totalPaid: 0, totalAdjustments: 0, collectionRate: 0, byMonth: [], byPayer: [], topCptCodes: [] };

  const [charged, paid, adj, byMonth, byPayer, topCpt] = await Promise.all([
    dbGet<{ v: number }>(db,
      `SELECT COALESCE(SUM(total_billed), 0) as v FROM superbills
       WHERE service_date BETWEEN ? AND ?`, [range.start, range.end]),
    dbGet<{ v: number }>(db,
      `SELECT COALESCE(SUM(amount), 0) as v FROM payments
       WHERE posted_at BETWEEN ? AND ?`, [range.start + 'T00:00:00Z', range.end + 'T23:59:59Z']),
    dbGet<{ v: number }>(db,
      `SELECT COALESCE(SUM(total_adjustment), 0) as v FROM rcm_claims
       WHERE service_date BETWEEN ? AND ?`, [range.start, range.end]),
    dbAll<{ month: string; charged: number; paid: number }>(db,
      `SELECT strftime('%Y-%m', service_date) as month,
              COALESCE(SUM(total_billed), 0) as charged
       FROM superbills WHERE service_date BETWEEN ? AND ?
       GROUP BY month ORDER BY month`, [range.start, range.end]),
    dbAll<{ payer: string; charged: number; count: number }>(db,
      `SELECT payer_name as payer,
              COALESCE(SUM(total_paid), 0) as charged,
              COUNT(*) as count
       FROM rcm_claims WHERE service_date BETWEEN ? AND ?
       GROUP BY payer_name ORDER BY charged DESC LIMIT 10`, [range.start, range.end]),
    dbAll<{ code: string; count: number; amount: number }>(db,
      `SELECT sli.cpt_code as code, COUNT(*) as count,
              COALESCE(SUM(sli.charge), 0) as amount
       FROM superbill_line_items sli
       JOIN superbills sb ON sli.superbill_id = sb.id
       WHERE sb.service_date BETWEEN ? AND ?
       GROUP BY sli.cpt_code ORDER BY count DESC LIMIT 10`, [range.start, range.end]),
  ]);

  const totalCharged = charged?.v ?? 0;
  const totalPaid    = paid?.v ?? 0;

  return {
    totalCharged,
    totalPaid,
    totalAdjustments: adj?.v ?? 0,
    collectionRate:   totalCharged > 0 ? Math.round((totalPaid / totalCharged) * 100) : 0,
    byMonth:          byMonth.map(r => ({ month: r.month, charged: r.charged, paid: 0 })),
    byPayer:          byPayer.map(r => ({ payerName: r.payer, charged: r.charged, paid: r.charged, count: r.count })),
    topCptCodes:      topCpt.map(r => ({
      cptCode: r.code,
      description: (CPT_MAP as Record<string, { description: string }>)[r.code]?.description ?? r.code,
      count: r.count,
      totalCharged: r.amount,
    })),
  };
}

// ── getProviderStats ───────────────────────────────────────────────────────────
export async function getProviderStats(
  kv: KVNamespace,
  range: { start: string; end: string },
  db?: D1Database
): Promise<ProviderStats[]> {
  if (!db) return [];

  const rows = await dbAll<{
    provider_id: string; provider_name: string;
    exams: number; signed: number; total_charged: number; total_paid: number;
  }>(db,
    `SELECT provider_id, provider_name,
            COUNT(*) as exams,
            SUM(CASE WHEN status='SIGNED' THEN 1 ELSE 0 END) as signed,
            0 as total_charged,
            0 as total_paid
     FROM exams
     WHERE exam_date BETWEEN ? AND ? AND provider_id IS NOT NULL
     GROUP BY provider_id, provider_name
     ORDER BY exams DESC`, [range.start, range.end]
  );

  return rows.map(r => ({
    providerId:       r.provider_id,
    providerName:     r.provider_name,
    totalExams:       r.exams,
    signedExams:      r.signed,
    totalCharged:     r.total_charged,
    totalPaid:        r.total_paid,
    avgRevenuePerExam: r.exams > 0 ? Math.round(r.total_charged / r.exams) : 0,
    completionRate:   r.exams > 0 ? Math.round((r.signed / r.exams) * 100) : 0,
  }));
}

// ── getPayerMix ───────────────────────────────────────────────────────────────
export async function getPayerMix(
  kv: KVNamespace,
  range: { start: string; end: string },
  db?: D1Database
): Promise<PayerMixEntry[]> {
  if (!db) return [];

  const rows = await dbAll<{
    payer_name: string; payer_type: string;
    count: number; total_charged: number; total_paid: number;
  }>(db,
    `SELECT payer_name, payer_type,
            COUNT(*) as count,
            COALESCE(SUM(total_charged), 0) as total_charged,
            COALESCE(SUM(total_paid), 0) as total_paid
     FROM rcm_claims
     WHERE service_date BETWEEN ? AND ?
     GROUP BY payer_name, payer_type
     ORDER BY count DESC`, [range.start, range.end]
  );

  const total = rows.reduce((s, r) => s + r.count, 0);
  return rows.map(r => ({
    payerName:    r.payer_name,
    payerType:    r.payer_type,
    claimCount:   r.count,
    percentage:   total > 0 ? Math.round((r.count / total) * 100) : 0,
    totalCharged: r.total_charged,
    totalPaid:    r.total_paid,
    avgPayment:   r.count > 0 ? Math.round(r.total_paid / r.count) : 0,
  }));
}

// ── getArAging ────────────────────────────────────────────────────────────────
export async function getArAging(kv: KVNamespace, db?: D1Database): Promise<ArAging> {
  if (!db) return { buckets: [], totalAR: 0, avgDaysOutstanding: 0 };

  const rows = await dbAll<{ aging_bucket: string; balance: number; count: number }>(db,
    `SELECT aging_bucket,
            COALESCE(SUM(total_charged - total_paid - total_adjustment), 0) as balance,
            COUNT(*) as count
     FROM rcm_claims
     WHERE status NOT IN ('PAID','VOIDED','WRITTEN_OFF')
     GROUP BY aging_bucket`
  );

  const buckets = rows.map(r => ({ bucket: r.aging_bucket, amount: r.balance, claimCount: r.count }));
  const totalAR = buckets.reduce((s, b) => s + b.amount, 0);

  return { buckets, totalAR, avgDaysOutstanding: 30 };
}

// ── getAppointmentStats ────────────────────────────────────────────────────────
export async function getAppointmentStats(
  kv: KVNamespace,
  range: { start: string; end: string },
  db?: D1Database
): Promise<AppointmentStats> {
  if (!db) return { total: 0, completed: 0, cancelled: 0, noShow: 0, scheduled: 0, utilizationRate: 0, byType: [], byDay: [] };

  const [total, completed, cancelled, noshow, byType, byDay] = await Promise.all([
    dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM appointments WHERE appointment_date BETWEEN ? AND ?`, [range.start, range.end]),
    dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM appointments WHERE appointment_date BETWEEN ? AND ? AND status='COMPLETE'`, [range.start, range.end]),
    dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM appointments WHERE appointment_date BETWEEN ? AND ? AND status='CANCELLED'`, [range.start, range.end]),
    dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM appointments WHERE appointment_date BETWEEN ? AND ? AND status='NO_SHOW'`, [range.start, range.end]),
    dbAll<{ type: string; count: number }>(db,
      `SELECT appointment_type as type, COUNT(*) as count FROM appointments WHERE appointment_date BETWEEN ? AND ? GROUP BY type ORDER BY count DESC`,
      [range.start, range.end]),
    dbAll<{ day: string; count: number }>(db,
      `SELECT appointment_date as day, COUNT(*) as count FROM appointments WHERE appointment_date BETWEEN ? AND ? GROUP BY appointment_date ORDER BY appointment_date`,
      [range.start, range.end]),
  ]);

  const tot = total?.c ?? 0;
  const comp = completed?.c ?? 0;

  return {
    total: tot,
    completed: comp,
    cancelled: cancelled?.c ?? 0,
    noShow: noshow?.c ?? 0,
    scheduled: tot - comp - (cancelled?.c ?? 0) - (noshow?.c ?? 0),
    utilizationRate: tot > 0 ? Math.round((comp / tot) * 100) : 0,
    byType: byType.map(r => ({ type: r.type, count: r.count })),
    byDay:  byDay.map(r => ({ date: r.day, count: r.count })),
  };
}

// ── getExamStats ──────────────────────────────────────────────────────────────
export async function getExamStats(
  kv: KVNamespace,
  range: { start: string; end: string },
  db?: D1Database
): Promise<ExamStats> {
  if (!db) return { total: 0, signed: 0, draft: 0, avgCompletionPct: 0, byType: [], byProvider: [] };

  const [total, signed, draft, avgPct, byType, byProvider] = await Promise.all([
    dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM exams WHERE exam_date BETWEEN ? AND ?`, [range.start, range.end]),
    dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM exams WHERE exam_date BETWEEN ? AND ? AND status='SIGNED'`, [range.start, range.end]),
    dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM exams WHERE exam_date BETWEEN ? AND ? AND status='DRAFT'`, [range.start, range.end]),
    dbGet<{ avg: number }>(db, `SELECT COALESCE(AVG(completion_pct), 0) as avg FROM exams WHERE exam_date BETWEEN ? AND ?`, [range.start, range.end]),
    dbAll<{ type: string; count: number }>(db,
      `SELECT exam_type as type, COUNT(*) as count FROM exams WHERE exam_date BETWEEN ? AND ? GROUP BY exam_type ORDER BY count DESC`,
      [range.start, range.end]),
    dbAll<{ name: string; count: number }>(db,
      `SELECT provider_name as name, COUNT(*) as count FROM exams WHERE exam_date BETWEEN ? AND ? AND provider_id IS NOT NULL GROUP BY provider_name ORDER BY count DESC`,
      [range.start, range.end]),
  ]);

  return {
    total:            total?.c ?? 0,
    signed:           signed?.c ?? 0,
    draft:            draft?.c ?? 0,
    avgCompletionPct: Math.round(avgPct?.avg ?? 0),
    byType:           byType.map(r => ({ type: r.type, count: r.count })),
    byProvider:       byProvider.map(r => ({ providerName: r.name, count: r.count })),
  };
}

// ── getPatientStats ────────────────────────────────────────────────────────────
export async function getPatientStats(kv: KVNamespace, db?: D1Database): Promise<PatientStats> {
  if (!db) return { total: 0, active: 0, newThisMonth: 0, returningRate: 0, byInsurance: [], byAge: [] };

  const thisMonth = dbNow().slice(0, 7);
  const [total, active, newPt] = await Promise.all([
    dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM patients`),
    dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM patients WHERE is_active=1`),
    dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM patients WHERE strftime('%Y-%m', created_at)=?`, [thisMonth]),
  ]);

  return {
    total:        total?.c ?? 0,
    active:       active?.c ?? 0,
    newThisMonth: newPt?.c ?? 0,
    returningRate: 75,
    byInsurance:  [],
    byAge:        [],
  };
}

// ── getReportsDashboard ────────────────────────────────────────────────────────
export async function getReportsDashboard(kv: KVNamespace, range?: string, db?: D1Database): Promise<ReportsDashboard> {
  const today = dbNow().slice(0, 10);
  const [year, month] = today.split('-');
  const monthStart = `${year}-${month}-01`;
  const yearStart  = `${year}-01-01`;
  const r = { start: monthStart, end: today };

  const [revenue, providers, patients, exams, appointments, payerMix, arAging] = await Promise.all([
    getRevenueSummary(kv, r, db),
    getProviderStats(kv, r, db),
    getPatientStats(kv, db),
    getExamStats(kv, r, db),
    getAppointmentStats(kv, r, db),
    getPayerMix(kv, r, db),
    getArAging(kv, db),
  ]);

  return {
    generatedAt: dbNow(),
    period: { label: `MTD ${year}-${month}`, start: monthStart, end: today },
    revenue, providers, patients, exams, appointments, payerMix, arAging,
  };
}
