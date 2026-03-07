// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 7A: Provider Scorecards & Benchmarking — Types
// ─────────────────────────────────────────────────────────────────────────────

// ── Time ranges ───────────────────────────────────────────────────────────────
export type DateRange = '7d' | '30d' | '90d' | 'ytd' | 'all'

// ── Trend direction ───────────────────────────────────────────────────────────
export type TrendDir = 'up' | 'down' | 'flat'
export interface Trend {
  value: number          // absolute delta
  pct: number            // percentage change
  dir: TrendDir
}

// ── Per-day data point (for sparklines / charts) ──────────────────────────────
export interface DayPoint {
  date: string           // YYYY-MM-DD
  value: number
}

// ── Volume KPIs ───────────────────────────────────────────────────────────────
export interface VolumeKpis {
  totalVisits: number
  newPatients: number
  returnPatients: number
  cancelledAppts: number
  noShows: number
  avgDailyVisits: number
  visitsByType: Record<string, number>   // appt-type → count
  visitsByDay: DayPoint[]
}

// ── Efficiency KPIs ───────────────────────────────────────────────────────────
export interface EfficiencyKpis {
  avgExamMinutes: number
  avgDocMinutes: number           // time to sign exam
  examCompletionRate: number      // % signed exams
  onTimeStartRate: number         // % started within 5 min of scheduled
  utilizationRate: number         // booked slots / available slots %
  examsByDay: DayPoint[]
}

// ── Revenue KPIs ──────────────────────────────────────────────────────────────
export interface RevenueKpis {
  totalCharged: number
  totalCollected: number
  collectionRate: number          // collected/charged %
  avgRevenuePerVisit: number
  avgRevenuePerNewPt: number
  outstandingAr: number
  revenueByDay: DayPoint[]
  revenueByPayer: Record<string, number>
}

// ── Quality KPIs ──────────────────────────────────────────────────────────────
export interface QualityKpis {
  patientSatisfactionScore: number   // 1-5 simulated
  returnVisitRate: number            // % patients who rebooked
  referralRate: number               // % visits resulting in referral
  preventiveCareRate: number         // % with dilated exam documented
  codingAccuracy: number             // % clean claims first-pass
  qualityScore: number               // 0-100 composite
}

// ── Benchmark comparison ──────────────────────────────────────────────────────
export interface BenchmarkEntry {
  metric: string
  providerValue: number
  practiceAvg: number
  nationalAvg: number
  unit: string
  higherIsBetter: boolean
}

// ── Weekly/Monthly trend snapshot ────────────────────────────────────────────
export interface PeriodSnapshot {
  period: string          // e.g. "2026-W10", "2026-03"
  visits: number
  revenue: number
  newPatients: number
  avgExamMin: number
  satisfaction: number
}

// ── Full provider scorecard ───────────────────────────────────────────────────
export interface ProviderScorecard {
  providerId: string
  providerName: string
  specialty: string
  role: 'PHYSICIAN' | 'OPTOMETRIST' | 'TECHNICIAN' | 'STAFF'
  avatarInitials: string
  range: DateRange

  // Composite score 0-100
  overallScore: number
  overallTrend: Trend

  // KPI buckets
  volume: VolumeKpis
  efficiency: EfficiencyKpis
  revenue: RevenueKpis
  quality: QualityKpis

  // Benchmark comparisons
  benchmarks: BenchmarkEntry[]

  // Period snapshots (last 8 weeks / months)
  periodSnapshots: PeriodSnapshot[]

  // Goals
  goals: ProviderGoal[]

  generatedAt: string
}

// ── Provider goal ─────────────────────────────────────────────────────────────
export type GoalStatus = 'ON_TRACK' | 'AT_RISK' | 'ACHIEVED' | 'MISSED'
export interface ProviderGoal {
  id: string
  providerId: string
  metric: string
  description: string
  targetValue: number
  currentValue: number
  unit: string
  period: string
  status: GoalStatus
  dueDate: string
  createdAt: string
  updatedAt: string
}

// ── Practice-wide leaderboard entry ──────────────────────────────────────────
export interface LeaderboardEntry {
  rank: number
  providerId: string
  providerName: string
  specialty: string
  overallScore: number
  visits: number
  revenue: number
  satisfaction: number
  collectionRate: number
  examCompletionRate: number
  trend: TrendDir
}

// ── Practice summary (all providers) ─────────────────────────────────────────
export interface PracticeSummary {
  range: DateRange
  totalVisits: number
  totalRevenue: number
  totalNewPatients: number
  avgSatisfaction: number
  avgCollectionRate: number
  avgExamMinutes: number
  providerCount: number
  leaderboard: LeaderboardEntry[]
  practiceByDay: DayPoint[]
  visitsByType: Record<string, number>
  revenueByPayer: Record<string, number>
  generatedAt: string
}
