// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Reporting & Analytics Routes  (Phase 2B)
// src/routes/reports.ts
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import type { ApiResponse } from '../types/patient'
import { DateRange, ReportsDashboard } from '../types/reports'
import {
  getReportsDashboard,
  getRevenueSummary,
  getProviderStats,
  getPayerMix,
  getArAging,
  getAppointmentStats,
  getExamStats,
  getPatientStats,
} from '../lib/reports'

type Bindings = { OCULOFLOW_KV: KVNamespace
  DB: D1Database }

const reports = new Hono<{ Bindings: Bindings }>()

// ── Parse & validate range ────────────────────────────────────────────────────
function parseRange(raw?: string): DateRange {
  const valid: DateRange[] = ['7d', '30d', '90d', 'ytd', 'all']
  return valid.includes(raw as DateRange) ? (raw as DateRange) : '30d'
}

// ── Convert DateRange string to {start, end} ISO date pair ────────────────────
function rangeToDates(range: DateRange): { start: string; end: string } {
  const today = new Date().toISOString().slice(0, 10)
  const [year, month] = today.split('-')
  switch (range) {
    case '7d':  { const d = new Date(); d.setDate(d.getDate() - 7);  return { start: d.toISOString().slice(0, 10), end: today } }
    case '30d': { const d = new Date(); d.setDate(d.getDate() - 30); return { start: d.toISOString().slice(0, 10), end: today } }
    case '90d': { const d = new Date(); d.setDate(d.getDate() - 90); return { start: d.toISOString().slice(0, 10), end: today } }
    case 'ytd': return { start: `${year}-01-01`, end: today }
    case 'all': return { start: '2000-01-01', end: today }
    default:    return { start: `${year}-${month}-01`, end: today }
  }
}

// ── GET /api/reports/dashboard?range=30d ─────────────────────────────────────
// Full dashboard payload — all sections in one call
reports.get('/dashboard', async (c) => {
  try {
    const range = parseRange(c.req.query('range'))
    const data  = await getReportsDashboard(c.env.OCULOFLOW_KV, range, c.env.DB)
    return c.json<ApiResponse<ReportsDashboard>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/overview?range=30d ──────────────────────────────────────
// Alias for /dashboard — full dashboard payload in one call
reports.get('/overview', async (c) => {
  try {
    const range = parseRange(c.req.query('range'))
    const data  = await getReportsDashboard(c.env.OCULOFLOW_KV, range, c.env.DB)
    return c.json<ApiResponse<ReportsDashboard>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/revenue?range=30d ───────────────────────────────────────
reports.get('/revenue', async (c) => {
  try {
    const range = parseRange(c.req.query('range'))
    const data  = await getRevenueSummary(c.env.OCULOFLOW_KV, rangeToDates(range), c.env.DB)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/providers?range=30d ─────────────────────────────────────
reports.get('/providers', async (c) => {
  try {
    const range = parseRange(c.req.query('range'))
    const data  = await getProviderStats(c.env.OCULOFLOW_KV, rangeToDates(range), c.env.DB)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/payer-mix?range=30d ─────────────────────────────────────
reports.get('/payer-mix', async (c) => {
  try {
    const range = parseRange(c.req.query('range'))
    const data  = await getPayerMix(c.env.OCULOFLOW_KV, rangeToDates(range), c.env.DB)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/ar-aging ─────────────────────────────────────────────────
reports.get('/ar-aging', async (c) => {
  try {
    const data = await getArAging(c.env.OCULOFLOW_KV, c.env.DB)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/appointments?range=30d ───────────────────────────────────
reports.get('/appointments', async (c) => {
  try {
    const range = parseRange(c.req.query('range'))
    const data  = await getAppointmentStats(c.env.OCULOFLOW_KV, rangeToDates(range), c.env.DB)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/exams?range=30d ──────────────────────────────────────────
reports.get('/exams', async (c) => {
  try {
    const range = parseRange(c.req.query('range'))
    const data  = await getExamStats(c.env.OCULOFLOW_KV, rangeToDates(range), c.env.DB)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/patients ─────────────────────────────────────────────────
reports.get('/patients', async (c) => {
  try {
    const data = await getPatientStats(c.env.OCULOFLOW_KV, c.env.DB)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

export default reports
