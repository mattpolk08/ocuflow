// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Reporting & Analytics Types  (Phase 2B)
// src/types/reports.ts
// ─────────────────────────────────────────────────────────────────────────────

// ── Date range ────────────────────────────────────────────────────────────────
export type DateRange = '7d' | '30d' | '90d' | 'ytd' | 'all'

// ── Revenue ───────────────────────────────────────────────────────────────────
export interface RevenueSummary {
  totalCharged:       number
  totalCollected:     number
  totalAdjustments:   number
  totalOutstanding:   number
  collectionRate:     number   // 0–1
  avgChargePerVisit:  number
  visitCount:         number
  // Daily series for sparkline / bar chart
  dailySeries: { date: string; charged: number; collected: number }[]
}

// ── Provider productivity ─────────────────────────────────────────────────────
export interface ProviderStat {
  providerId:   string
  providerName: string
  examsCount:   number
  signedExams:  number
  totalCharged: number
  totalCollected: number
  avgChargePerVisit: number
  appointmentCount: number
  noShowCount:      number
  noShowRate:       number   // 0–1
  completionRate:   number   // 0–1
}

// ── Payer mix ─────────────────────────────────────────────────────────────────
export interface PayerSlice {
  payerName:    string
  payerId:      string
  claimCount:   number
  totalCharged: number
  totalPaid:    number
  avgPayment:   number
  denialRate:   number   // 0–1
  percentage:   number   // % of total charges
}

// ── AR aging ──────────────────────────────────────────────────────────────────
export interface AgingBucket {
  label:        string   // e.g. "0-30 days"
  minDays:      number
  maxDays:      number | null
  count:        number
  totalBalance: number
  percentage:   number   // % of total outstanding
}

export interface ArAging {
  asOfDate:    string
  totalBalance: number
  buckets:     AgingBucket[]
}

// ── Appointment analytics ─────────────────────────────────────────────────────
export interface AppointmentStats {
  totalScheduled:   number
  totalCompleted:   number
  totalNoShow:      number
  totalCancelled:   number
  completionRate:   number   // 0–1
  noShowRate:       number   // 0–1
  cancellationRate: number   // 0–1
  avgDailyVisits:   number
  // Breakdown by appointment type
  byType: { type: string; label: string; count: number; percentage: number }[]
  // Daily utilization series
  dailySeries: { date: string; scheduled: number; completed: number; noShow: number }[]
}

// ── Exam statistics ───────────────────────────────────────────────────────────
export interface ExamStats {
  totalExams:      number
  signedExams:     number
  draftExams:      number
  inProgressExams: number
  avgCompletionPct: number
  // Top diagnoses
  topDiagnoses: { code: string; description: string; count: number }[]
  // Top CPT codes from linked superbills
  topCptCodes:  { code: string; description: string; count: number; totalFee: number }[]
}

// ── Patient analytics ─────────────────────────────────────────────────────────
export interface PatientStats {
  totalPatients:   number
  newPatients30d:  number
  activePatients:  number    // visited in last 90 days
  avgAge:          number
  // Insurance distribution
  insuranceBreakdown: { payer: string; count: number; percentage: number }[]
}

// ── Full dashboard payload ────────────────────────────────────────────────────
export interface ReportsDashboard {
  generatedAt:      string
  dateRange:        DateRange
  revenue:          RevenueSummary
  providers:        ProviderStat[]
  payerMix:         PayerSlice[]
  arAging:          ArAging
  appointments:     AppointmentStats
  exams:            ExamStats
  patients:         PatientStats
}
