// Phase 10A — Analytics & Business Intelligence
// Executive KPI dashboard, payer contract analysis, provider productivity,
// population-health trends, recall compliance, and financial forecasting.

// ─── KV helpers ───────────────────────────────────────────────────────────────
async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key, 'text'); return v ? JSON.parse(v) as T : null
}
async function kvPut(kv: KVNamespace, key: string, val: unknown, ttlSec?: number): Promise<void> {
  const opts: KVNamespacePutOptions = ttlSec ? { expirationTtl: Math.max(ttlSec, 60) } : {}
  await kv.put(key, JSON.stringify(val), opts)
}

const uid  = (pfx = 'anl') => `${pfx}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`
const now  = () => new Date().toISOString()

// ─── Key scheme ───────────────────────────────────────────────────────────────
const K = {
  seeded:          () => 'anl:seeded',
  kpiSnapshot:     (period: string)   => `anl:kpi:${period}`,
  kpiIdx:          ()                 => 'anl:kpi:idx',
  payerContract:   (id: string)       => `anl:payer:${id}`,
  payerIdx:        () => 'anl:payer:idx',
  providerProd:    (id: string)       => `anl:provprod:${id}`,
  providerProdIdx: () => 'anl:provprod:idx',
  populationTrend: (id: string)       => `anl:poptrend:${id}`,
  popTrendIdx:     ()                 => 'anl:poptrend:idx',
  recallMetric:    (period: string)   => `anl:recall:${period}`,
  recallMetricIdx: ()                 => 'anl:recall:idx',
  forecast:        (id: string)       => `anl:forecast:${id}`,
  forecastIdx:     ()                 => 'anl:forecast:idx',
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KpiSnapshot {
  id: string
  period: string          // e.g. "2026-03", "2026-Q1"
  periodType: 'monthly' | 'quarterly' | 'yearly'
  generatedAt: string

  // Revenue
  totalRevenue: number
  collectedRevenue: number
  adjustments: number
  netRevenue: number
  collectionRate: number  // %

  // Volume
  totalVisits: number
  newPatients: number
  establishedPatients: number
  averageDailyVisits: number

  // Billing
  totalClaims: number
  denialRate: number      // %
  firstPassRate: number   // %
  avgDaysToPayment: number
  outstandingAR: number
  arOver90: number

  // Ops
  noShowRate: number      // %
  cancellationRate: number // %
  avgWaitTimeDays: number

  // Satisfaction
  avgSatisfactionScore: number  // 1-5
  npsScore: number              // -100 to 100

  // Care quality
  careGapsOpen: number
  careGapsClosedThisPeriod: number
  recallComplianceRate: number  // %
}

export interface PayerContract {
  id: string
  payerName: string
  payerId: string
  planType: string       // 'HMO' | 'PPO' | 'Medicare' | 'Medicaid' | 'Commercial'
  contractedRate: number  // % of Medicare fee schedule
  allowableAmount: number // avg per encounter $
  actualCollected: number // avg per encounter $
  variantPct: number      // (actual - allowable) / allowable %
  volume: number          // encounters this period
  denialRate: number
  avgDaysToPayment: number
  contractExpiry: string
  autoRenew: boolean
  status: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'RENEGOTIATING'
  notes: string
  updatedAt: string
}

export interface ProviderProductivity {
  id: string
  providerId: string
  providerName: string
  period: string
  periodType: 'monthly' | 'quarterly'

  totalVisits: number
  rvuProduced: number     // Relative Value Units
  targetRvu: number
  rvuVariancePct: number

  newPatients: number
  avgEncounterMinutes: number
  slotsUsed: number
  totalSlots: number
  utilizationPct: number

  revenue: number
  collections: number
  avgRevenuePerVisit: number

  chargesSubmitted: number
  denialRate: number
  avgDocumentationTime: number  // minutes

  satisfactionScore: number
  updatedAt: string
}

export interface PopulationTrend {
  id: string
  condition: string    // e.g. 'Glaucoma' | 'Diabetic Retinopathy' | 'Dry Eye' | 'Myopia'
  period: string
  activePatients: number
  newDiagnoses: number
  controlledPct: number   // % of patients with condition well-controlled
  treatmentAdherence: number  // %
  avgVisitsPerYear: number
  hospitalizations: number    // preventable
  revenuePotential: number    // estimated
  careGapCount: number
  updatedAt: string
}

export interface RecallMetric {
  id: string
  period: string
  totalPatientsDue: number
  contactedCount: number
  scheduledCount: number
  completedCount: number
  noResponseCount: number
  declinedCount: number
  complianceRate: number   // scheduled/due %
  completionRate: number   // completed/due %
  avgDaysToSchedule: number
  smsResponseRate: number
  emailResponseRate: number
  revenueRecovered: number
  updatedAt: string
}

export interface RevenueForecast {
  id: string
  generatedAt: string
  forecastPeriod: string   // e.g. "2026-04" through "2026-09"
  model: 'LINEAR' | 'SEASONAL' | 'AI_ASSISTED'
  confidence: number        // 0-100

  months: Array<{
    period: string
    projectedRevenue: number
    projectedVisits: number
    lowerBound: number
    upperBound: number
    seasonalFactor: number
    notes: string
  }>

  assumptions: string[]
  risks: string[]
  opportunities: string[]
  updatedAt: string
}

export interface AnalyticsDashboard {
  currentKpi: KpiSnapshot
  priorKpi: KpiSnapshot
  topPayers: PayerContract[]
  providerLeaderboard: ProviderProductivity[]
  populationTrends: PopulationTrend[]
  recallMetrics: RecallMetric[]
  forecast: RevenueForecast | null
  generatedAt: string
}

// ─── Seed data ────────────────────────────────────────────────────────────────

function buildKpi(period: string, periodType: 'monthly' | 'quarterly', base: Partial<KpiSnapshot> = {}): KpiSnapshot {
  return {
    id: uid('kpi'),
    period,
    periodType,
    generatedAt: now(),
    totalRevenue: 284_500,
    collectedRevenue: 247_650,
    adjustments: 18_200,
    netRevenue: 229_450,
    collectionRate: 87.1,
    totalVisits: 892,
    newPatients: 134,
    establishedPatients: 758,
    averageDailyVisits: 40.5,
    totalClaims: 912,
    denialRate: 7.4,
    firstPassRate: 88.2,
    avgDaysToPayment: 22.4,
    outstandingAR: 148_200,
    arOver90: 21_400,
    noShowRate: 8.2,
    cancellationRate: 5.1,
    avgWaitTimeDays: 3.4,
    avgSatisfactionScore: 4.6,
    npsScore: 72,
    careGapsOpen: 89,
    careGapsClosedThisPeriod: 43,
    recallComplianceRate: 68.4,
    ...base,
  }
}

async function seedAnalytics(kv: KVNamespace): Promise<void> {
  // KPI snapshots — current + prior months + prior quarter
  const kpiCur  = buildKpi('2026-03', 'monthly')
  const kpiFeb  = buildKpi('2026-02', 'monthly', { totalRevenue: 271_800, collectedRevenue: 234_200, totalVisits: 851, newPatients: 118, collectionRate: 86.2, denialRate: 8.1, npsScore: 69 })
  const kpiJan  = buildKpi('2026-01', 'monthly', { totalRevenue: 265_300, collectedRevenue: 228_100, totalVisits: 823, newPatients: 109, collectionRate: 85.9, denialRate: 8.7, npsScore: 67 })
  const kpiQ1   = buildKpi('2026-Q1', 'quarterly', { totalRevenue: 821_600, collectedRevenue: 709_950, totalVisits: 2566, newPatients: 361, collectionRate: 86.4, denialRate: 7.9 })

  const kpis = [kpiCur, kpiFeb, kpiJan, kpiQ1]
  for (const k of kpis) {
    await kvPut(kv, K.kpiSnapshot(k.period), k)
  }
  await kvPut(kv, K.kpiIdx(), kpis.map(k => k.period))

  // Payer contracts
  const payers: PayerContract[] = [
    { id: uid('pay'), payerName: 'BlueCross BlueShield FL', payerId: 'BCBSFL', planType: 'PPO', contractedRate: 118, allowableAmount: 245, actualCollected: 219, variantPct: -10.6, volume: 312, denialRate: 5.2, avgDaysToPayment: 18, contractExpiry: '2027-01-01', autoRenew: true, status: 'ACTIVE', notes: '', updatedAt: now() },
    { id: uid('pay'), payerName: 'Aetna Commercial', payerId: 'AETNA', planType: 'HMO', contractedRate: 112, allowableAmount: 228, actualCollected: 204, variantPct: -10.5, volume: 189, denialRate: 6.8, avgDaysToPayment: 21, contractExpiry: '2026-07-01', autoRenew: false, status: 'EXPIRING_SOON', notes: 'Renegotiation underway', updatedAt: now() },
    { id: uid('pay'), payerName: 'UnitedHealthcare', payerId: 'UHC', planType: 'PPO', contractedRate: 115, allowableAmount: 238, actualCollected: 218, variantPct: -8.4, volume: 224, denialRate: 7.1, avgDaysToPayment: 24, contractExpiry: '2027-06-01', autoRenew: true, status: 'ACTIVE', notes: '', updatedAt: now() },
    { id: uid('pay'), payerName: 'Medicare Part B', payerId: 'MCR', planType: 'Medicare', contractedRate: 100, allowableAmount: 198, actualCollected: 188, variantPct: -5.1, volume: 156, denialRate: 3.9, avgDaysToPayment: 14, contractExpiry: '2099-12-31', autoRenew: true, status: 'ACTIVE', notes: 'Standard fee schedule', updatedAt: now() },
    { id: uid('pay'), payerName: 'Humana Gold Plus', payerId: 'HUM', planType: 'Medicare', contractedRate: 105, allowableAmount: 208, actualCollected: 192, variantPct: -7.7, volume: 98, denialRate: 4.2, avgDaysToPayment: 16, contractExpiry: '2026-12-31', autoRenew: true, status: 'ACTIVE', notes: '', updatedAt: now() },
    { id: uid('pay'), payerName: 'Florida Medicaid', payerId: 'MCaid', planType: 'Medicaid', contractedRate: 72, allowableAmount: 142, actualCollected: 119, variantPct: -16.2, volume: 87, denialRate: 14.3, avgDaysToPayment: 38, contractExpiry: '2099-12-31', autoRenew: true, status: 'ACTIVE', notes: 'High denial rate – needs auth team focus', updatedAt: now() },
  ]
  for (const p of payers) await kvPut(kv, K.payerContract(p.id), p)
  await kvPut(kv, K.payerIdx(), payers.map(p => p.id))

  // Provider productivity
  const prods: ProviderProductivity[] = [
    { id: uid('pp'), providerId: 'prov-001', providerName: 'Dr. Sarah Chen', period: '2026-03', periodType: 'monthly', totalVisits: 248, rvuProduced: 892, targetRvu: 860, rvuVariancePct: 3.7, newPatients: 42, avgEncounterMinutes: 22, slotsUsed: 248, totalSlots: 264, utilizationPct: 93.9, revenue: 78_400, collections: 68_200, avgRevenuePerVisit: 316, chargesSubmitted: 253, denialRate: 5.9, avgDocumentationTime: 8, satisfactionScore: 4.8, updatedAt: now() },
    { id: uid('pp'), providerId: 'prov-002', providerName: 'Dr. James Park', period: '2026-03', periodType: 'monthly', totalVisits: 221, rvuProduced: 798, targetRvu: 860, rvuVariancePct: -7.2, newPatients: 38, avgEncounterMinutes: 26, slotsUsed: 221, totalSlots: 264, utilizationPct: 83.7, revenue: 69_800, collections: 60_400, avgRevenuePerVisit: 316, chargesSubmitted: 226, denialRate: 8.4, avgDocumentationTime: 14, satisfactionScore: 4.4, updatedAt: now() },
    { id: uid('pp'), providerId: 'prov-003', providerName: 'Dr. Maria Rodriguez', period: '2026-03', periodType: 'monthly', totalVisits: 204, rvuProduced: 736, targetRvu: 720, rvuVariancePct: 2.2, newPatients: 31, avgEncounterMinutes: 24, slotsUsed: 204, totalSlots: 220, utilizationPct: 92.7, revenue: 64_400, collections: 56_900, avgRevenuePerVisit: 316, chargesSubmitted: 209, denialRate: 6.7, avgDocumentationTime: 10, satisfactionScore: 4.7, updatedAt: now() },
    { id: uid('pp'), providerId: 'prov-004', providerName: 'Dr. Robert Kim', period: '2026-03', periodType: 'monthly', totalVisits: 219, rvuProduced: 810, targetRvu: 860, rvuVariancePct: -5.8, newPatients: 23, avgEncounterMinutes: 23, slotsUsed: 219, totalSlots: 264, utilizationPct: 83.0, revenue: 71_900, collections: 62_150, avgRevenuePerVisit: 328, chargesSubmitted: 224, denialRate: 7.2, avgDocumentationTime: 11, satisfactionScore: 4.5, updatedAt: now() },
  ]
  for (const p of prods) await kvPut(kv, K.providerProd(p.id), p)
  await kvPut(kv, K.providerProdIdx(), prods.map(p => p.id))

  // Population health trends
  const trends: PopulationTrend[] = [
    { id: uid('pt'), condition: 'Glaucoma', period: '2026-Q1', activePatients: 342, newDiagnoses: 18, controlledPct: 74.3, treatmentAdherence: 81.2, avgVisitsPerYear: 3.2, hospitalizations: 2, revenuePotential: 142_800, careGapCount: 28, updatedAt: now() },
    { id: uid('pt'), condition: 'Diabetic Retinopathy', period: '2026-Q1', activePatients: 218, newDiagnoses: 24, controlledPct: 61.5, treatmentAdherence: 68.4, avgVisitsPerYear: 4.1, hospitalizations: 7, revenuePotential: 186_400, careGapCount: 41, updatedAt: now() },
    { id: uid('pt'), condition: 'Dry Eye Disease', period: '2026-Q1', activePatients: 487, newDiagnoses: 52, controlledPct: 58.2, treatmentAdherence: 62.1, avgVisitsPerYear: 2.8, hospitalizations: 0, revenuePotential: 98_600, careGapCount: 62, updatedAt: now() },
    { id: uid('pt'), condition: 'Macular Degeneration', period: '2026-Q1', activePatients: 124, newDiagnoses: 9, controlledPct: 69.4, treatmentAdherence: 88.7, avgVisitsPerYear: 5.6, hospitalizations: 1, revenuePotential: 312_400, careGapCount: 12, updatedAt: now() },
    { id: uid('pt'), condition: 'Myopia / Refractive Error', period: '2026-Q1', activePatients: 1243, newDiagnoses: 187, controlledPct: 91.2, treatmentAdherence: 94.3, avgVisitsPerYear: 1.1, hospitalizations: 0, revenuePotential: 62_400, careGapCount: 38, updatedAt: now() },
  ]
  for (const t of trends) await kvPut(kv, K.populationTrend(t.id), t)
  await kvPut(kv, K.popTrendIdx(), trends.map(t => t.id))

  // Recall metrics
  const recalls: RecallMetric[] = [
    { id: uid('rm'), period: '2026-03', totalPatientsDue: 284, contactedCount: 241, scheduledCount: 194, completedCount: 162, noResponseCount: 43, declinedCount: 28, complianceRate: 68.3, completionRate: 57.0, avgDaysToSchedule: 4.2, smsResponseRate: 61.4, emailResponseRate: 34.2, revenueRecovered: 48_400, updatedAt: now() },
    { id: uid('rm'), period: '2026-02', totalPatientsDue: 261, contactedCount: 218, scheduledCount: 172, completedCount: 141, noResponseCount: 46, declinedCount: 21, complianceRate: 65.9, completionRate: 54.0, avgDaysToSchedule: 4.8, smsResponseRate: 59.2, emailResponseRate: 31.8, revenueRecovered: 42_100, updatedAt: now() },
    { id: uid('rm'), period: '2026-01', totalPatientsDue: 248, contactedCount: 204, scheduledCount: 158, completedCount: 128, noResponseCount: 46, declinedCount: 24, complianceRate: 63.7, completionRate: 51.6, avgDaysToSchedule: 5.1, smsResponseRate: 57.4, emailResponseRate: 29.6, revenueRecovered: 38_200, updatedAt: now() },
  ]
  for (const r of recalls) await kvPut(kv, K.recallMetric(r.period), r)
  await kvPut(kv, K.recallMetricIdx(), recalls.map(r => r.period))

  // Revenue forecast
  const forecast: RevenueForecast = {
    id: uid('fc'),
    generatedAt: now(),
    forecastPeriod: '2026-04 to 2026-09',
    model: 'SEASONAL',
    confidence: 82,
    months: [
      { period: '2026-04', projectedRevenue: 291_200, projectedVisits: 912, lowerBound: 274_000, upperBound: 308_400, seasonalFactor: 1.02, notes: 'Spring allergy season boost' },
      { period: '2026-05', projectedRevenue: 298_400, projectedVisits: 934, lowerBound: 281_000, upperBound: 315_800, seasonalFactor: 1.05, notes: 'Back-to-school vision exams' },
      { period: '2026-06', projectedRevenue: 286_100, projectedVisits: 896, lowerBound: 268_000, upperBound: 304_200, seasonalFactor: 0.98, notes: 'Summer slowdown' },
      { period: '2026-07', projectedRevenue: 274_800, projectedVisits: 861, lowerBound: 256_000, upperBound: 293_600, seasonalFactor: 0.95, notes: 'Peak vacation period' },
      { period: '2026-08', projectedRevenue: 289_300, projectedVisits: 906, lowerBound: 271_000, upperBound: 307_600, seasonalFactor: 1.01, notes: 'Back-to-school peak' },
      { period: '2026-09', projectedRevenue: 301_700, projectedVisits: 944, lowerBound: 282_000, upperBound: 321_400, seasonalFactor: 1.06, notes: 'Q4 deductible season begins' },
    ],
    assumptions: [
      'Existing payer contracts remain unchanged',
      'Provider headcount stable at 4 FTEs',
      'No major EHR system changes',
      'Normal seasonal patterns based on 3-year history',
    ],
    risks: [
      'Aetna contract expiry July 2026 — revenue at risk if not renewed',
      'Medicaid denial rate trending upward',
      'Dr. Park utilization below target — capacity risk',
    ],
    opportunities: [
      'Diabetic retinopathy care gap closure could add $44K/quarter',
      'Macular degeneration new patients — high-value service line',
      'Myopia management (orthoK/atropine) — emerging growth area',
    ],
    updatedAt: now(),
  }
  await kvPut(kv, K.forecast(forecast.id), forecast)
  await kvPut(kv, K.forecastIdx(), [forecast.id])
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function ensureAnalyticsSeed(kv: KVNamespace): Promise<void> {
  const seeded = await kvGet<boolean>(kv, K.seeded())
  if (seeded) return
  await seedAnalytics(kv)
  await kvPut(kv, K.seeded(), true)
}

export async function getKpiSnapshot(kv: KVNamespace, period: string): Promise<KpiSnapshot | null> {
  return kvGet<KpiSnapshot>(kv, K.kpiSnapshot(period))
}

export async function listKpiPeriods(kv: KVNamespace): Promise<string[]> {
  return (await kvGet<string[]>(kv, K.kpiIdx())) ?? []
}

export async function listPayerContracts(kv: KVNamespace): Promise<PayerContract[]> {
  const ids = (await kvGet<string[]>(kv, K.payerIdx())) ?? []
  const results = await Promise.all(ids.map(id => kvGet<PayerContract>(kv, K.payerContract(id))))
  return results.filter(Boolean) as PayerContract[]
}

export async function updatePayerContract(kv: KVNamespace, id: string, patch: Partial<PayerContract>): Promise<PayerContract | null> {
  const existing = await kvGet<PayerContract>(kv, K.payerContract(id))
  if (!existing) return null
  const updated = { ...existing, ...patch, id, updatedAt: now() }
  await kvPut(kv, K.payerContract(id), updated)
  return updated
}

export async function listProviderProductivity(kv: KVNamespace, period?: string): Promise<ProviderProductivity[]> {
  const ids = (await kvGet<string[]>(kv, K.providerProdIdx())) ?? []
  const all = (await Promise.all(ids.map(id => kvGet<ProviderProductivity>(kv, K.providerProd(id))))).filter(Boolean) as ProviderProductivity[]
  return period ? all.filter(p => p.period === period) : all
}

export async function listPopulationTrends(kv: KVNamespace): Promise<PopulationTrend[]> {
  const ids = (await kvGet<string[]>(kv, K.popTrendIdx())) ?? []
  return (await Promise.all(ids.map(id => kvGet<PopulationTrend>(kv, K.populationTrend(id))))).filter(Boolean) as PopulationTrend[]
}

export async function listRecallMetrics(kv: KVNamespace): Promise<RecallMetric[]> {
  const periods = (await kvGet<string[]>(kv, K.recallMetricIdx())) ?? []
  return (await Promise.all(periods.map(p => kvGet<RecallMetric>(kv, K.recallMetric(p))))).filter(Boolean) as RecallMetric[]
}

export async function getLatestForecast(kv: KVNamespace): Promise<RevenueForecast | null> {
  const ids = (await kvGet<string[]>(kv, K.forecastIdx())) ?? []
  if (!ids.length) return null
  return kvGet<RevenueForecast>(kv, K.forecast(ids[ids.length - 1]))
}

export async function getAnalyticsDashboard(kv: KVNamespace): Promise<AnalyticsDashboard> {
  await ensureAnalyticsSeed(kv)

  const periods = await listKpiPeriods(kv)
  const monthlyPeriods = periods.filter(p => !p.includes('Q')).sort().reverse()
  const currentPeriod = monthlyPeriods[0] ?? '2026-03'
  const priorPeriod   = monthlyPeriods[1] ?? '2026-02'

  const [currentKpi, priorKpi, payers, providers, trends, recallList, forecast] = await Promise.all([
    getKpiSnapshot(kv, currentPeriod),
    getKpiSnapshot(kv, priorPeriod),
    listPayerContracts(kv),
    listProviderProductivity(kv, currentPeriod),
    listPopulationTrends(kv),
    listRecallMetrics(kv),
    getLatestForecast(kv),
  ])

  const fallbackKpi = buildKpi(currentPeriod, 'monthly')

  return {
    currentKpi:          currentKpi  ?? fallbackKpi,
    priorKpi:            priorKpi    ?? fallbackKpi,
    topPayers:           payers.sort((a, b) => b.volume - a.volume),
    providerLeaderboard: providers.sort((a, b) => b.rvuProduced - a.rvuProduced),
    populationTrends:    trends,
    recallMetrics:       recallList.sort((a, b) => b.period.localeCompare(a.period)),
    forecast,
    generatedAt:         now(),
  }
}

// KpiSnapshot delta helper
export function kpiDelta(current: number, prior: number): { value: number; pct: number; direction: 'up' | 'down' | 'flat' } {
  const diff = current - prior
  const pct  = prior !== 0 ? (diff / prior) * 100 : 0
  return { value: diff, pct: Math.round(pct * 10) / 10, direction: diff > 0.01 ? 'up' : diff < -0.01 ? 'down' : 'flat' }
}
