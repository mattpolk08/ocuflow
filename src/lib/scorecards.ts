// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 7A: Provider Scorecards & Benchmarking — KV Library
// ─────────────────────────────────────────────────────────────────────────────

import type {
  DateRange, Trend, TrendDir, DayPoint,
  VolumeKpis, EfficiencyKpis, RevenueKpis, QualityKpis,
  BenchmarkEntry, PeriodSnapshot, ProviderScorecard,
  ProviderGoal, GoalStatus, LeaderboardEntry, PracticeSummary,
} from '../types/scorecards'

// ── KV key helpers ─────────────────────────────────────────────────────────────
const K = {
  seeded:    () => 'sc:seeded',
  goalIndex: () => 'sc:goal:index',
  goal:   (id: string) => `sc:goal:${id}`,
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
function now(): string { return new Date().toISOString() }
function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86_400_000).toISOString()
}
function dateStrAgo(d: number): string {
  const dt = new Date(Date.now() - d * 86_400_000)
  return dt.toISOString().slice(0, 10)
}

// ── Provider registry (static for this phase) ─────────────────────────────────
export const PROVIDERS = [
  { id: 'dr-chen',   name: 'Dr. Sarah Chen',  specialty: 'Comprehensive Ophthalmology', role: 'PHYSICIAN'    as const, initials: 'SC' },
  { id: 'dr-patel',  name: 'Dr. Raj Patel',   specialty: 'Glaucoma & Anterior Segment', role: 'PHYSICIAN'    as const, initials: 'RP' },
  { id: 'dr-torres', name: 'Dr. Amy Torres',  specialty: 'Retina & Vitreous',           role: 'PHYSICIAN'    as const, initials: 'AT' },
]

// ── Deterministic pseudo-random (seeded) ──────────────────────────────────────
function prng(seed: number): () => number {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }
}

// ── Generate day-by-day time series ──────────────────────────────────────────
function makeDaySeries(days: number, base: number, variance: number, seed: number): DayPoint[] {
  const rng = prng(seed)
  const result: DayPoint[] = []
  let val = base
  for (let i = days; i >= 0; i--) {
    val = Math.max(0, val + (rng() - 0.48) * variance)
    result.push({ date: dateStrAgo(i), value: Math.round(val * 10) / 10 })
  }
  return result
}

// ── Generate weekly period snapshots ─────────────────────────────────────────
function makeWeeklySnapshots(seed: number, baseVisits: number, baseRev: number): PeriodSnapshot[] {
  const rng = prng(seed)
  const snaps: PeriodSnapshot[] = []
  for (let w = 7; w >= 0; w--) {
    const dt = new Date(Date.now() - w * 7 * 86_400_000)
    const yr = dt.getFullYear()
    const wk = Math.ceil((dt.getDate() + new Date(yr, dt.getMonth(), 1).getDay()) / 7)
    snaps.push({
      period:      `${yr}-W${String(wk).padStart(2, '0')}`,
      visits:      Math.round(baseVisits * (0.85 + rng() * 0.3)),
      revenue:     Math.round(baseRev   * (0.85 + rng() * 0.3)),
      newPatients: Math.round(baseVisits * 0.2 * (0.8 + rng() * 0.4)),
      avgExamMin:  Math.round(22 + rng() * 10),
      satisfaction:Math.round((4.0 + rng() * 0.9) * 10) / 10,
    })
  }
  return snaps
}

// ── Build a full scorecard for one provider ───────────────────────────────────
function buildScorecard(
  prov: typeof PROVIDERS[0],
  range: DateRange,
  seed: number,
): ProviderScorecard {
  const rng = prng(seed)
  const days = range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : range === 'ytd' ? 90 : 180

  // --- Volume ---
  const totalVisits    = Math.round(days * (5 + rng() * 4))
  const newPt          = Math.round(totalVisits * (0.15 + rng() * 0.1))
  const cancelled      = Math.round(totalVisits * (0.05 + rng() * 0.05))
  const noShows        = Math.round(totalVisits * (0.03 + rng() * 0.03))
  const apptTypes: Record<string, number> = {
    COMPREHENSIVE_EYE_EXAM: Math.round(totalVisits * 0.45),
    GLAUCOMA_FOLLOWUP:      Math.round(totalVisits * 0.20),
    CONTACT_LENS_FITTING:   Math.round(totalVisits * 0.12),
    DIABETIC_EYE_EXAM:      Math.round(totalVisits * 0.10),
    POST_OP_VISIT:          Math.round(totalVisits * 0.08),
    OTHER:                  Math.round(totalVisits * 0.05),
  }
  const volume: VolumeKpis = {
    totalVisits, newPatients: newPt, returnPatients: totalVisits - newPt,
    cancelledAppts: cancelled, noShows,
    avgDailyVisits: Math.round((totalVisits / days) * 10) / 10,
    visitsByType: apptTypes,
    visitsByDay: makeDaySeries(Math.min(days, 30), totalVisits / days, 2, seed + 1),
  }

  // --- Efficiency ---
  const avgExam = Math.round(22 + rng() * 14)   // 22–36 min
  const avgDoc  = Math.round(8  + rng() * 10)    // 8–18 min to sign
  const efficiency: EfficiencyKpis = {
    avgExamMinutes:     avgExam,
    avgDocMinutes:      avgDoc,
    examCompletionRate: Math.round((0.82 + rng() * 0.16) * 100),
    onTimeStartRate:    Math.round((0.70 + rng() * 0.25) * 100),
    utilizationRate:    Math.round((0.75 + rng() * 0.20) * 100),
    examsByDay: makeDaySeries(Math.min(days, 30), totalVisits / days * 0.9, 1.5, seed + 2),
  }

  // --- Revenue ---
  const avgRev   = Math.round(180 + rng() * 80)
  const charged  = totalVisits * avgRev
  const collRate = 0.82 + rng() * 0.12
  const collected= Math.round(charged * collRate)
  const revByPayer: Record<string, number> = {
    'Medicare':          Math.round(charged * 0.35),
    'Commercial':        Math.round(charged * 0.30),
    'Medicaid':          Math.round(charged * 0.15),
    'Self-Pay':          Math.round(charged * 0.10),
    'VSP / Vision Plan': Math.round(charged * 0.10),
  }
  const revenue: RevenueKpis = {
    totalCharged: charged, totalCollected: collected,
    collectionRate:        Math.round(collRate * 100),
    avgRevenuePerVisit:    avgRev,
    avgRevenuePerNewPt:    Math.round(avgRev * 1.4),
    outstandingAr:         Math.round(charged * (1 - collRate) * 0.6),
    revenueByDay: makeDaySeries(Math.min(days, 30), avgRev * totalVisits / days, avgRev * 0.5, seed + 3),
    revenueByPayer: revByPayer,
  }

  // --- Quality ---
  const satisf  = Math.round((4.0 + rng() * 0.9) * 10) / 10
  const quality: QualityKpis = {
    patientSatisfactionScore: satisf,
    returnVisitRate:    Math.round((0.60 + rng() * 0.30) * 100),
    referralRate:       Math.round((0.08 + rng() * 0.12) * 100),
    preventiveCareRate: Math.round((0.70 + rng() * 0.25) * 100),
    codingAccuracy:     Math.round((0.85 + rng() * 0.13) * 100),
    qualityScore:       Math.round(
      (satisf / 5) * 30 +
      efficiency.examCompletionRate * 0.20 +
      efficiency.onTimeStartRate   * 0.15 +
      (revenue.collectionRate / 100) * 20 +
      quality2(rng) * 15
    ),
  }

  // --- Benchmarks ---
  const benchmarks: BenchmarkEntry[] = [
    { metric: 'Avg Visits/Day',       providerValue: volume.avgDailyVisits,           practiceAvg: 7.2,  nationalAvg: 6.8,  unit: 'visits',  higherIsBetter: true  },
    { metric: 'Exam Duration (min)',   providerValue: efficiency.avgExamMinutes,        practiceAvg: 28,   nationalAvg: 30,   unit: 'min',     higherIsBetter: false },
    { metric: 'Collection Rate',       providerValue: revenue.collectionRate,           practiceAvg: 88,   nationalAvg: 85,   unit: '%',       higherIsBetter: true  },
    { metric: 'Patient Satisfaction',  providerValue: quality.patientSatisfactionScore, practiceAvg: 4.3,  nationalAvg: 4.1,  unit: '/ 5',     higherIsBetter: true  },
    { metric: 'No-Show Rate',          providerValue: Math.round(noShows / totalVisits * 100), practiceAvg: 4, nationalAvg: 5, unit: '%', higherIsBetter: false },
    { metric: 'Coding Accuracy',       providerValue: quality.codingAccuracy,           practiceAvg: 91,   nationalAvg: 89,   unit: '%',       higherIsBetter: true  },
    { metric: 'Utilization Rate',      providerValue: efficiency.utilizationRate,       practiceAvg: 85,   nationalAvg: 82,   unit: '%',       higherIsBetter: true  },
    { metric: 'Return Visit Rate',     providerValue: quality.returnVisitRate,          practiceAvg: 72,   nationalAvg: 68,   unit: '%',       higherIsBetter: true  },
  ]

  // --- Overall score ---
  const overallScore = Math.min(100, Math.round(
    quality.qualityScore * 0.35 +
    efficiency.utilizationRate * 0.25 +
    revenue.collectionRate * 0.25 +
    (satisf / 5 * 100) * 0.15
  ))

  return {
    providerId: prov.id,
    providerName: prov.name,
    specialty: prov.specialty,
    role: prov.role,
    avatarInitials: prov.initials,
    range,
    overallScore,
    overallTrend: { value: Math.round((rng() - 0.4) * 8), pct: Math.round((rng() - 0.4) * 12), dir: rng() > 0.45 ? 'up' : rng() > 0.3 ? 'flat' : 'down' },
    volume, efficiency, revenue, quality,
    benchmarks,
    periodSnapshots: makeWeeklySnapshots(seed + 10, totalVisits / (days / 7), revenue.totalCharged / (days / 7)),
    goals: [],
    generatedAt: now(),
  }
}

// helper to avoid TSC "used before assigned" error
function quality2(rng: () => number): number {
  return rng() * 100
}

// ── Seed goals ────────────────────────────────────────────────────────────────
const SEED_GOALS: ProviderGoal[] = [
  { id: 'goal-001', providerId: 'dr-chen',   metric: 'visits',           description: 'Reach 180 patient visits in March',    targetValue: 180, currentValue: 142, unit: 'visits', period: '2026-03', status: 'ON_TRACK',  dueDate: '2026-03-31', createdAt: daysAgo(14), updatedAt: daysAgo(1) },
  { id: 'goal-002', providerId: 'dr-chen',   metric: 'satisfaction',     description: 'Maintain satisfaction score ≥ 4.5',    targetValue: 4.5, currentValue: 4.7, unit: '/ 5',   period: '2026-03', status: 'ACHIEVED',  dueDate: '2026-03-31', createdAt: daysAgo(14), updatedAt: daysAgo(2) },
  { id: 'goal-003', providerId: 'dr-chen',   metric: 'collection_rate',  description: 'Improve collection rate to 92%',        targetValue: 92,  currentValue: 88,  unit: '%',     period: '2026-03', status: 'AT_RISK',   dueDate: '2026-03-31', createdAt: daysAgo(14), updatedAt: daysAgo(3) },
  { id: 'goal-004', providerId: 'dr-patel',  metric: 'visits',           description: 'See 160 patients in Q1',               targetValue: 160, currentValue: 151, unit: 'visits', period: '2026-Q1', status: 'ON_TRACK',  dueDate: '2026-03-31', createdAt: daysAgo(30), updatedAt: daysAgo(1) },
  { id: 'goal-005', providerId: 'dr-patel',  metric: 'exam_completion',  description: 'Sign 95% of exams same day',            targetValue: 95,  currentValue: 91,  unit: '%',     period: '2026-03', status: 'AT_RISK',   dueDate: '2026-03-31', createdAt: daysAgo(14), updatedAt: daysAgo(2) },
  { id: 'goal-006', providerId: 'dr-torres', metric: 'revenue',          description: 'Generate $45,000 revenue in March',    targetValue: 45000, currentValue: 38200, unit: '$', period: '2026-03', status: 'ON_TRACK',  dueDate: '2026-03-31', createdAt: daysAgo(14), updatedAt: daysAgo(1) },
  { id: 'goal-007', providerId: 'dr-torres', metric: 'new_patients',     description: 'Onboard 20 new retina referrals',       targetValue: 20,  currentValue: 17,  unit: 'pts',   period: '2026-03', status: 'ON_TRACK',  dueDate: '2026-03-31', createdAt: daysAgo(14), updatedAt: daysAgo(4) },
  { id: 'goal-008', providerId: 'dr-patel',  metric: 'no_show_rate',     description: 'Reduce no-show rate below 3%',          targetValue: 3,   currentValue: 4.2, unit: '%',     period: '2026-03', status: 'AT_RISK',   dueDate: '2026-03-31', createdAt: daysAgo(10), updatedAt: daysAgo(2) },
]

// ── Seed guard ─────────────────────────────────────────────────────────────────
export async function ensureScorecardseed(kv: KVNamespace, db?: D1Database): Promise<void> {
  // Seeding done via migration 0015; no-op kept for backward-compat
}

// ── Provider scorecard (computed on-the-fly, goals loaded from D1) ─────────────
export async function getProviderScorecard(
  kv: KVNamespace,
  providerId: string,
  range: DateRange = '30d',
  db?: D1Database,
): Promise<ProviderScorecard | null> {
  const prov = PROVIDERS.find(p => p.id === providerId)
  if (!prov) return null

  const seedNum = providerId.split('').reduce((a, c) => a + c.charCodeAt(0), 0) +
                  ['7d','30d','90d','ytd','all'].indexOf(range) * 1000
  const card = buildScorecard(prov, range, seedNum)

  // Attach live goals from D1
  if (db) {
    card.goals = await listGoals(kv, providerId, db)
  }
  return card
}

export function listProviders() { return PROVIDERS }

export async function getPracticeSummary(
  kv: KVNamespace,
  range: DateRange = '30d',
  db?: D1Database,
): Promise<PracticeSummary> {
  const cards = await Promise.all(
    PROVIDERS.map(p => getProviderScorecard(kv, p.id, range, db))
  ) as ProviderScorecard[]

  const leaderboard: LeaderboardEntry[] = cards
    .map((c) => ({
      rank: 0,
      providerId: c.providerId,
      providerName: c.providerName,
      specialty: c.specialty,
      overallScore: c.overallScore,
      visits: c.volume.totalVisits,
      revenue: c.revenue.totalCharged,
      satisfaction: c.quality.patientSatisfactionScore,
      collectionRate: c.revenue.collectionRate,
      examCompletionRate: c.efficiency.examCompletionRate,
      trend: c.overallTrend.dir,
    }))
    .sort((a, b) => b.overallScore - a.overallScore)
    .map((e, i) => ({ ...e, rank: i + 1 }))

  const totalVisits  = cards.reduce((s, c) => s + c.volume.totalVisits, 0)
  const totalRevenue = cards.reduce((s, c) => s + c.revenue.totalCharged, 0)
  const totalNewPt   = cards.reduce((s, c) => s + c.volume.newPatients, 0)
  const avgSatisf    = Math.round(cards.reduce((s, c) => s + c.quality.patientSatisfactionScore, 0) / cards.length * 10) / 10
  const avgColl      = Math.round(cards.reduce((s, c) => s + c.revenue.collectionRate, 0) / cards.length)
  const avgExamMin   = Math.round(cards.reduce((s, c) => s + c.efficiency.avgExamMinutes, 0) / cards.length)

  const visitsByType: Record<string, number> = {}
  cards.forEach(c => Object.entries(c.volume.visitsByType).forEach(([k, v]) => { visitsByType[k] = (visitsByType[k] || 0) + v }))
  const revenueByPayer: Record<string, number> = {}
  cards.forEach(c => Object.entries(c.revenue.revenueByPayer).forEach(([k, v]) => { revenueByPayer[k] = (revenueByPayer[k] || 0) + v }))
  const practiceByDay: DayPoint[] = cards[0].volume.visitsByDay.map((pt, i) => ({
    date: pt.date,
    value: cards.reduce((s, c) => s + (c.volume.visitsByDay[i]?.value || 0), 0),
  }))

  return {
    range, totalVisits, totalRevenue, totalNewPatients: totalNewPt,
    avgSatisfaction: avgSatisf, avgCollectionRate: avgColl,
    avgExamMinutes: avgExamMin, providerCount: cards.length,
    leaderboard, practiceByDay, visitsByType, revenueByPayer,
    generatedAt: now(),
  }
}

// ── Goals CRUD (D1) ────────────────────────────────────────────────────────────
export async function listGoals(kv: KVNamespace, providerId?: string, db?: D1Database): Promise<ProviderGoal[]> {
  if (!db) return []
  const { dbAll } = await import('./db')
  const rows = providerId
    ? await dbAll<Record<string, unknown>>(db, `SELECT * FROM provider_goals WHERE provider_id=? ORDER BY created_at DESC`, [providerId])
    : await dbAll<Record<string, unknown>>(db, `SELECT * FROM provider_goals ORDER BY created_at DESC`)
  return rows.map(r => ({
    id:            r.id as string,
    providerId:    r.provider_id as string,
    providerName:  r.provider_name as string,
    metric:        r.metric as string,
    target:        r.target as number,
    currentValue:  r.current_value as number,
    unit:          r.unit as string | undefined,
    period:        r.period as string,
    status:        r.status as ProviderGoal['status'],
    notes:         r.notes as string | undefined,
    createdAt:     r.created_at as string,
    updatedAt:     r.updated_at as string,
  }))
}

export async function createGoal(
  kv: KVNamespace,
  data: Omit<ProviderGoal, 'id' | 'createdAt' | 'updatedAt'>,
  db?: D1Database,
): Promise<ProviderGoal> {
  if (!db) throw new Error('D1 required')
  const { dbRun, now: dbNow } = await import('./db')
  const n = dbNow(); const id = uid('goal')
  await dbRun(db,
    `INSERT INTO provider_goals (id, provider_id, provider_name, metric, target, current_value, unit, period, status, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, data.providerId, data.providerName, data.metric, data.target, data.currentValue ?? 0, data.unit ?? null, data.period, data.status ?? 'ON_TRACK', data.notes ?? null, n, n]
  )
  const goals = await listGoals(kv, data.providerId, db)
  return goals.find(g => g.id === id)!
}

export async function updateGoal(
  kv: KVNamespace,
  id: string,
  patch: Partial<ProviderGoal>,
  db?: D1Database,
): Promise<ProviderGoal | null> {
  if (!db) return null
  const { dbRun, now: dbNow } = await import('./db')
  const sets: string[] = ['updated_at=?']; const vals: unknown[] = [dbNow()]
  if (patch.target       !== undefined) { sets.push('target=?');        vals.push(patch.target) }
  if (patch.currentValue !== undefined) { sets.push('current_value=?'); vals.push(patch.currentValue) }
  if (patch.status       !== undefined) { sets.push('status=?');        vals.push(patch.status) }
  if (patch.notes        !== undefined) { sets.push('notes=?');         vals.push(patch.notes) }
  vals.push(id)
  await dbRun(db, `UPDATE provider_goals SET ${sets.join(', ')} WHERE id=?`, vals)
  const goals = await listGoals(kv, undefined, db)
  return goals.find(g => g.id === id) ?? null
}

export async function deleteGoal(kv: KVNamespace, id: string, db?: D1Database): Promise<boolean> {
  if (!db) return false
  const { dbRun } = await import('./db')
  await dbRun(db, `DELETE FROM provider_goals WHERE id=?`, [id])
  return true
}
