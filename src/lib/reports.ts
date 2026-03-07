// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Reporting & Analytics Library  (Phase 2B)
// src/lib/reports.ts
// Aggregates data from billing, scheduling, exam, and patient KV stores
// ─────────────────────────────────────────────────────────────────────────────

import { ensureBillingSeed, listSuperbills, getSuperbill } from './billing'
import { ensureScheduleSeed } from './scheduling'
import { ensureSeedData as ensurePatientSeed } from './patients'
import { ensureExamSeed } from './exams'
import {
  DateRange, RevenueSummary, ProviderStat, PayerSlice,
  ArAging, AgingBucket, AppointmentStats, ExamStats,
  PatientStats, ReportsDashboard,
} from '../types/reports'
import { Superbill } from '../types/billing'
import { CPT_MAP } from '../types/billing'

// ── Date helpers ──────────────────────────────────────────────────────────────
function today(): string { return new Date().toISOString().slice(0, 10) }

function rangeStart(range: DateRange): string {
  const d = new Date()
  if (range === '7d')  { d.setDate(d.getDate() - 7) }
  else if (range === '30d') { d.setDate(d.getDate() - 30) }
  else if (range === '90d') { d.setDate(d.getDate() - 90) }
  else if (range === 'ytd') { d.setMonth(0, 1) }
  else { d.setFullYear(2020, 0, 1) }   // 'all' — go back to 2020
  return d.toISOString().slice(0, 10)
}

function daysBetween(dateStr: string, refStr: string = today()): number {
  const a = new Date(dateStr + 'T12:00:00Z')
  const b = new Date(refStr  + 'T12:00:00Z')
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000)
}

/** Generate array of date strings from start to today (inclusive) */
function dateRange(startStr: string): string[] {
  const dates: string[] = []
  const cur = new Date(startStr + 'T12:00:00Z')
  const end = new Date(today()  + 'T12:00:00Z')
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

// ── Seed all stores ───────────────────────────────────────────────────────────
async function seedAll(kv: KVNamespace) {
  await Promise.all([
    ensureBillingSeed(kv),
    ensureScheduleSeed(kv),
    ensurePatientSeed(kv),
    ensureExamSeed(kv),
  ])
}

// ── Revenue summary ───────────────────────────────────────────────────────────
export async function getRevenueSummary(
  kv: KVNamespace,
  range: DateRange,
): Promise<RevenueSummary> {
  await ensureBillingSeed(kv)
  const start = rangeStart(range)
  const summaries = await listSuperbills(kv)
  const inRange = summaries.filter(s => s.serviceDate >= start)

  const sbs: Superbill[] = (
    await Promise.all(inRange.map(s => getSuperbill(kv, s.id)))
  ).filter(Boolean) as Superbill[]

  const totalCharged     = sbs.reduce((n, s) => n + s.totalCharge, 0)
  const totalCollected   = sbs.reduce((n, s) => n + s.copayCollected + (s.insurancePaid ?? 0), 0)
  const totalAdjustments = sbs.reduce((n, s) => n + s.adjustments, 0)
  const totalOutstanding = sbs
    .filter(s => !['PAID','VOIDED'].includes(s.status))
    .reduce((n, s) => n + s.patientBalance, 0)

  // Daily series — group by serviceDate
  const byDate: Record<string, { charged: number; collected: number }> = {}
  for (const sb of sbs) {
    if (!byDate[sb.serviceDate]) byDate[sb.serviceDate] = { charged: 0, collected: 0 }
    byDate[sb.serviceDate].charged   += sb.totalCharge
    byDate[sb.serviceDate].collected += sb.copayCollected + (sb.insurancePaid ?? 0)
  }
  const allDates = dateRange(start)
  const dailySeries = allDates.map(date => ({
    date,
    charged:   parseFloat((byDate[date]?.charged   ?? 0).toFixed(2)),
    collected: parseFloat((byDate[date]?.collected ?? 0).toFixed(2)),
  }))

  return {
    totalCharged:      parseFloat(totalCharged.toFixed(2)),
    totalCollected:    parseFloat(totalCollected.toFixed(2)),
    totalAdjustments:  parseFloat(totalAdjustments.toFixed(2)),
    totalOutstanding:  parseFloat(totalOutstanding.toFixed(2)),
    collectionRate:    totalCharged > 0 ? parseFloat((totalCollected / totalCharged).toFixed(4)) : 0,
    avgChargePerVisit: sbs.length > 0   ? parseFloat((totalCharged  / sbs.length).toFixed(2)) : 0,
    visitCount:        sbs.length,
    dailySeries,
  }
}

// ── Provider stats ────────────────────────────────────────────────────────────
export async function getProviderStats(
  kv: KVNamespace,
  range: DateRange,
): Promise<ProviderStat[]> {
  await seedAll(kv)
  const start     = rangeStart(range)
  const summaries = await listSuperbills(kv)
  const inRange   = summaries.filter(s => s.serviceDate >= start)
  const sbs       = (await Promise.all(inRange.map(s => getSuperbill(kv, s.id)))).filter(Boolean) as Superbill[]

  // Group by provider
  const provMap: Record<string, { name: string; sbs: Superbill[] }> = {}
  for (const sb of sbs) {
    if (!provMap[sb.providerId]) provMap[sb.providerId] = { name: sb.providerName, sbs: [] }
    provMap[sb.providerId].sbs.push(sb)
  }

  // Pull exam data from KV
  const examIndex: string[] = JSON.parse((await kv.get('exams:index')) ?? '[]')
  const examsByProvider: Record<string, { total: number; signed: number }> = {}
  for (const id of examIndex) {
    const raw = await kv.get(`exam:${id}`)
    if (!raw) continue
    const exam = JSON.parse(raw)
    if (exam.serviceDate < start) continue
    const pid = exam.providerId ?? 'unknown'
    if (!examsByProvider[pid]) examsByProvider[pid] = { total: 0, signed: 0 }
    examsByProvider[pid].total++
    if (exam.status === 'SIGNED') examsByProvider[pid].signed++
  }

  // Pull appointment data for no-show tracking — use correct KV keys
  const apptIdx2: string[] = JSON.parse((await kv.get('appts:index')) ?? '[]')
  let allAppts: any[] = (await Promise.all(
    apptIdx2.map(id => kv.get(`appt:${id}`))
  )).filter(Boolean).map(r => JSON.parse(r!))
  const apptByProvider: Record<string, { total: number; noShow: number; completed: number }> = {}
  for (const a of allAppts) {
    if ((a.date ?? '') < start) continue
    const pid = a.providerId ?? 'unknown'
    if (!apptByProvider[pid]) apptByProvider[pid] = { total: 0, noShow: 0, completed: 0 }
    apptByProvider[pid].total++
    if (a.status === 'NO_SHOW')  apptByProvider[pid].noShow++
    if (a.status === 'COMPLETED') apptByProvider[pid].completed++
  }

  // Always include both known providers even if no bills yet
  const knownProviders: Record<string, string> = {
    'dr-chen':  'Dr. Sarah Chen, OD',
    'dr-patel': 'Dr. Raj Patel, MD',
  }
  for (const [id, name] of Object.entries(knownProviders)) {
    if (!provMap[id]) provMap[id] = { name, sbs: [] }
  }

  return Object.entries(provMap).map(([providerId, { name, sbs: provSbs }]) => {
    const charged   = provSbs.reduce((n, s) => n + s.totalCharge, 0)
    const collected = provSbs.reduce((n, s) => n + s.copayCollected + (s.insurancePaid ?? 0), 0)
    const exams     = examsByProvider[providerId] ?? { total: 0, signed: 0 }
    const appts     = apptByProvider[providerId]  ?? { total: 0, noShow: 0, completed: 0 }
    return {
      providerId,
      providerName:       name,
      examsCount:         exams.total,
      signedExams:        exams.signed,
      totalCharged:       parseFloat(charged.toFixed(2)),
      totalCollected:     parseFloat(collected.toFixed(2)),
      avgChargePerVisit:  provSbs.length > 0 ? parseFloat((charged / provSbs.length).toFixed(2)) : 0,
      appointmentCount:   appts.total,
      noShowCount:        appts.noShow,
      noShowRate:         appts.total > 0 ? parseFloat((appts.noShow / appts.total).toFixed(4)) : 0,
      completionRate:     appts.total > 0 ? parseFloat((appts.completed / appts.total).toFixed(4)) : 0,
    }
  })
}

// ── Payer mix ─────────────────────────────────────────────────────────────────
export async function getPayerMix(
  kv: KVNamespace,
  range: DateRange,
): Promise<PayerSlice[]> {
  await ensureBillingSeed(kv)
  const start     = rangeStart(range)
  const summaries = await listSuperbills(kv)
  const inRange   = summaries.filter(s => s.serviceDate >= start)
  const sbs       = (await Promise.all(inRange.map(s => getSuperbill(kv, s.id)))).filter(Boolean) as Superbill[]

  const payerMap: Record<string, {
    name: string; id: string; sbs: Superbill[]
  }> = {}

  for (const sb of sbs) {
    const name = sb.primaryInsurance?.payerName ?? 'Self-Pay'
    const pid  = sb.primaryInsurance?.payerId   ?? 'SELF'
    if (!payerMap[pid]) payerMap[pid] = { name, id: pid, sbs: [] }
    payerMap[pid].sbs.push(sb)
  }

  const totalCharged = sbs.reduce((n, s) => n + s.totalCharge, 0)

  return Object.values(payerMap).map(({ name, id, sbs: ps }) => {
    const charged    = ps.reduce((n, s) => n + s.totalCharge, 0)
    const paid       = ps.reduce((n, s) => n + s.copayCollected + (s.insurancePaid ?? 0), 0)
    const deniedCnt  = ps.filter(s => s.status === 'DENIED').length
    return {
      payerName:    name,
      payerId:      id,
      claimCount:   ps.length,
      totalCharged: parseFloat(charged.toFixed(2)),
      totalPaid:    parseFloat(paid.toFixed(2)),
      avgPayment:   ps.length > 0 ? parseFloat((paid / ps.length).toFixed(2)) : 0,
      denialRate:   ps.length > 0 ? parseFloat((deniedCnt / ps.length).toFixed(4)) : 0,
      percentage:   totalCharged > 0 ? parseFloat((charged / totalCharged * 100).toFixed(1)) : 0,
    }
  }).sort((a, b) => b.totalCharged - a.totalCharged)
}

// ── AR Aging ──────────────────────────────────────────────────────────────────
export async function getArAging(kv: KVNamespace): Promise<ArAging> {
  await ensureBillingSeed(kv)
  const summaries = await listSuperbills(kv)
  const open      = summaries.filter(s => !['PAID','VOIDED'].includes(s.status))
  const sbs       = (await Promise.all(open.map(s => getSuperbill(kv, s.id)))).filter(Boolean) as Superbill[]

  const BUCKETS: { label: string; min: number; max: number | null }[] = [
    { label: '0–30 days',   min: 0,   max: 30  },
    { label: '31–60 days',  min: 31,  max: 60  },
    { label: '61–90 days',  min: 61,  max: 90  },
    { label: '91–120 days', min: 91,  max: 120 },
    { label: '120+ days',   min: 121, max: null },
  ]

  const buckets: AgingBucket[] = BUCKETS.map(b => ({ ...b, minDays: b.min, maxDays: b.max, count: 0, totalBalance: 0, percentage: 0 }))
  let totalBalance = 0

  for (const sb of sbs) {
    const age  = daysBetween(sb.serviceDate)
    const bal  = sb.patientBalance
    totalBalance += bal
    const bucket = buckets.find(b => age >= b.minDays && (b.maxDays === null || age <= b.maxDays))
    if (bucket) { bucket.count++; bucket.totalBalance += bal }
  }

  buckets.forEach(b => {
    b.totalBalance = parseFloat(b.totalBalance.toFixed(2))
    b.percentage   = totalBalance > 0 ? parseFloat((b.totalBalance / totalBalance * 100).toFixed(1)) : 0
  })

  return {
    asOfDate:     today(),
    totalBalance: parseFloat(totalBalance.toFixed(2)),
    buckets,
  }
}

// ── Appointment analytics ─────────────────────────────────────────────────────
export async function getAppointmentStats(
  kv: KVNamespace,
  range: DateRange,
): Promise<AppointmentStats> {
  await ensureScheduleSeed(kv)
  const start = rangeStart(range)

  // Load all appointments via the correct KV key pattern
  const apptIdx: string[] = JSON.parse((await kv.get('appts:index')) ?? '[]')
  const allAppts: any[] = (await Promise.all(
    apptIdx.map(id => kv.get(`appt:${id}`))
  )).filter(Boolean).map(r => JSON.parse(r!))

  const inRange = allAppts.filter((a: any) => (a.date ?? '') >= start)

  const total     = inRange.length
  const completed = inRange.filter((a: any) => a.status === 'COMPLETED').length
  const noShow    = inRange.filter((a: any) => a.status === 'NO_SHOW').length
  const cancelled = inRange.filter((a: any) => a.status === 'CANCELLED').length

  // By type
  const typeCount: Record<string, { label: string; count: number }> = {}
  for (const a of inRange) {
    const t = a.appointmentType ?? 'UNKNOWN'
    if (!typeCount[t]) typeCount[t] = { label: t.replace(/_/g, ' '), count: 0 }
    typeCount[t].count++
  }
  const byType = Object.entries(typeCount).map(([type, { label, count }]) => ({
    type, label, count,
    percentage: total > 0 ? parseFloat((count / total * 100).toFixed(1)) : 0,
  })).sort((a, b) => b.count - a.count)

  // Daily series
  const byDate: Record<string, { scheduled: number; completed: number; noShow: number }> = {}
  for (const a of inRange) {
    const d = a.date ?? ''
    if (!byDate[d]) byDate[d] = { scheduled: 0, completed: 0, noShow: 0 }
    byDate[d].scheduled++
    if (a.status === 'COMPLETED') byDate[d].completed++
    if (a.status === 'NO_SHOW')   byDate[d].noShow++
  }
  const allDates = dateRange(start)
  const dailySeries = allDates.map(date => ({
    date,
    scheduled:  byDate[date]?.scheduled  ?? 0,
    completed:  byDate[date]?.completed  ?? 0,
    noShow:     byDate[date]?.noShow     ?? 0,
  }))

  const days = Math.max(allDates.length, 1)

  return {
    totalScheduled:   total,
    totalCompleted:   completed,
    totalNoShow:      noShow,
    totalCancelled:   cancelled,
    completionRate:   total > 0 ? parseFloat((completed / total).toFixed(4)) : 0,
    noShowRate:       total > 0 ? parseFloat((noShow    / total).toFixed(4)) : 0,
    cancellationRate: total > 0 ? parseFloat((cancelled / total).toFixed(4)) : 0,
    avgDailyVisits:   parseFloat((total / days).toFixed(2)),
    byType,
    dailySeries,
  }
}

// ── Exam stats ────────────────────────────────────────────────────────────────
export async function getExamStats(
  kv: KVNamespace,
  range: DateRange,
): Promise<ExamStats> {
  await ensureExamSeed(kv)
  const start = rangeStart(range)

  const examIndex: string[] = JSON.parse((await kv.get('exams:index')) ?? '[]')
  const allExams: any[] = (
    await Promise.all(examIndex.map(id => kv.get(`exam:${id}`)))
  ).filter(Boolean).map(r => JSON.parse(r!))

  const inRange = allExams.filter(e => (e.examDate ?? e.serviceDate ?? '') >= start)

  const total       = inRange.length
  const signed      = inRange.filter(e => e.status === 'SIGNED').length
  const draft       = inRange.filter(e => e.status === 'DRAFT').length
  const inProgress  = inRange.filter(e => e.status === 'IN_PROGRESS').length
  const avgComplete = total > 0
    ? parseFloat((inRange.reduce((n, e) => n + (e.completionPct ?? 0), 0) / total).toFixed(1))
    : 0

  // Top diagnoses across all exams
  const dxCount: Record<string, { description: string; count: number }> = {}
  for (const e of inRange) {
    for (const dx of (e.assessment?.diagnoses ?? [])) {
      const code = dx.icd10Code ?? ''
      if (!dxCount[code]) dxCount[code] = { description: dx.description ?? '', count: 0 }
      dxCount[code].count++
    }
  }
  const topDiagnoses = Object.entries(dxCount)
    .map(([code, { description, count }]) => ({ code, description, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Top CPT from linked superbills
  await ensureBillingSeed(kv)
  const billSummaries = await listSuperbills(kv)
  const cptCount: Record<string, { count: number; totalFee: number }> = {}
  for (const s of billSummaries.filter(s => s.serviceDate >= start)) {
    for (const code of s.cptCodes) {
      if (!cptCount[code]) cptCount[code] = { count: 0, totalFee: 0 }
      cptCount[code].count++
      cptCount[code].totalFee += CPT_MAP[code]?.fee ?? 0
    }
  }
  const topCptCodes = Object.entries(cptCount)
    .map(([code, { count, totalFee }]) => ({
      code,
      description: CPT_MAP[code]?.description ?? code,
      count,
      totalFee: parseFloat(totalFee.toFixed(2)),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    totalExams:       total,
    signedExams:      signed,
    draftExams:       draft,
    inProgressExams:  inProgress,
    avgCompletionPct: avgComplete,
    topDiagnoses,
    topCptCodes,
  }
}

// ── Patient stats ─────────────────────────────────────────────────────────────
export async function getPatientStats(kv: KVNamespace): Promise<PatientStats> {
  await ensurePatientSeed(kv)
  const idx: string[] = JSON.parse((await kv.get('patients:index')) ?? '[]')
  const allPatients: any[] = (
    await Promise.all(idx.map(id => kv.get(`patient:${id}`)))
  ).filter(Boolean).map(r => JSON.parse(r!))

  const total    = allPatients.length
  const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30)
  const cutoff90 = new Date(); cutoff90.setDate(cutoff90.getDate() - 90)
  const newIn30  = allPatients.filter(p => {
    if (!p.createdAt) return false
    return new Date(p.createdAt) >= cutoff30
  }).length
  const activeIn90 = allPatients.filter(p => {
    if (!p.lastVisitDate) return false
    return new Date(p.lastVisitDate + 'T12:00:00Z') >= cutoff90
  }).length

  // Avg age
  const ages = allPatients
    .map(p => p.dateOfBirth ? new Date().getFullYear() - new Date(p.dateOfBirth + 'T12:00:00Z').getFullYear() : null)
    .filter((n): n is number => n !== null)
  const avgAge = ages.length > 0
    ? parseFloat((ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1))
    : 0

  // Insurance breakdown
  const insurCount: Record<string, number> = {}
  for (const p of allPatients) {
    const payer = p.insurance?.primaryPayer ?? p.primaryInsurance?.payerName ?? 'Self-Pay'
    insurCount[payer] = (insurCount[payer] ?? 0) + 1
  }
  const insuranceBreakdown = Object.entries(insurCount)
    .map(([payer, count]) => ({
      payer,
      count,
      percentage: total > 0 ? parseFloat((count / total * 100).toFixed(1)) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  return {
    totalPatients:       total,
    newPatients30d:      newIn30,
    activePatients:      activeIn90,
    avgAge,
    insuranceBreakdown,
  }
}

// ── Full dashboard ────────────────────────────────────────────────────────────
export async function getReportsDashboard(
  kv: KVNamespace,
  range: DateRange = '30d',
): Promise<ReportsDashboard> {
  const [revenue, providers, payerMix, arAging, appointments, exams, patients] =
    await Promise.all([
      getRevenueSummary(kv, range),
      getProviderStats(kv, range),
      getPayerMix(kv, range),
      getArAging(kv),
      getAppointmentStats(kv, range),
      getExamStats(kv, range),
      getPatientStats(kv),
    ])

  return {
    generatedAt: new Date().toISOString(),
    dateRange:   range,
    revenue,
    providers,
    payerMix,
    arAging,
    appointments,
    exams,
    patients,
  }
}
