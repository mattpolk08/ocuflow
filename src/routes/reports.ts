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

type Bindings = { OCULOFLOW_KV: KVNamespace }

const reports = new Hono<{ Bindings: Bindings }>()

// ── Parse & validate range ────────────────────────────────────────────────────
function parseRange(raw?: string): DateRange {
  const valid: DateRange[] = ['7d', '30d', '90d', 'ytd', 'all']
  return valid.includes(raw as DateRange) ? (raw as DateRange) : '30d'
}

// ── GET /api/reports/dashboard?range=30d ─────────────────────────────────────
// Full dashboard payload — all sections in one call
reports.get('/dashboard', async (c) => {
  try {
    const range = parseRange(c.req.query('range'))
    const data  = await getReportsDashboard(c.env.OCULOFLOW_KV, range)
    return c.json<ApiResponse<ReportsDashboard>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/revenue?range=30d ───────────────────────────────────────
reports.get('/revenue', async (c) => {
  try {
    const range = parseRange(c.req.query('range'))
    const data  = await getRevenueSummary(c.env.OCULOFLOW_KV, range)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/providers?range=30d ─────────────────────────────────────
reports.get('/providers', async (c) => {
  try {
    const range = parseRange(c.req.query('range'))
    const data  = await getProviderStats(c.env.OCULOFLOW_KV, range)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/payer-mix?range=30d ─────────────────────────────────────
reports.get('/payer-mix', async (c) => {
  try {
    const range = parseRange(c.req.query('range'))
    const data  = await getPayerMix(c.env.OCULOFLOW_KV, range)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/ar-aging ─────────────────────────────────────────────────
reports.get('/ar-aging', async (c) => {
  try {
    const data = await getArAging(c.env.OCULOFLOW_KV)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/appointments?range=30d ───────────────────────────────────
reports.get('/appointments', async (c) => {
  try {
    const range = parseRange(c.req.query('range'))
    const data  = await getAppointmentStats(c.env.OCULOFLOW_KV, range)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/exams?range=30d ──────────────────────────────────────────
reports.get('/exams', async (c) => {
  try {
    const range = parseRange(c.req.query('range'))
    const data  = await getExamStats(c.env.OCULOFLOW_KV, range)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/reports/patients ─────────────────────────────────────────────────
reports.get('/patients', async (c) => {
  try {
    const data = await getPatientStats(c.env.OCULOFLOW_KV)
    return c.json<ApiResponse<typeof data>>({ success: true, data })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

export default reports
