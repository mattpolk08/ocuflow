// Phase 10A — Analytics & BI Routes
// GET  /api/analytics/dashboard        — full BI dashboard (ADMIN, BILLING)
// GET  /api/analytics/kpi/:period      — single KPI snapshot
// GET  /api/analytics/kpi              — list all KPI periods
// GET  /api/analytics/payers           — payer contract list
// PATCH /api/analytics/payers/:id      — update payer contract notes/status
// GET  /api/analytics/providers        — provider productivity (current period)
// GET  /api/analytics/population       — population health trends
// GET  /api/analytics/recall           — recall compliance metrics
// GET  /api/analytics/forecast         — revenue forecast

import { Hono } from 'hono'
import {
  ensureAnalyticsSeed, getAnalyticsDashboard, getKpiSnapshot,
  listKpiPeriods, listPayerContracts, updatePayerContract,
  listProviderProductivity, listPopulationTrends,
  listRecallMetrics, getLatestForecast, kpiDelta,
} from '../lib/analytics'
import { requireAuth, requireRole } from '../middleware/auth'
import { writeAudit } from '../lib/audit'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  JWT_SECRET?: string
  DEMO_MODE?: string
}
type Variables = { auth: import('../types/auth').AuthContext }
type Resp = { success: boolean; data?: unknown; error?: string; message?: string }

const analyticsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ── Ping / seed ───────────────────────────────────────────────────────────────
analyticsRoutes.get('/ping', async (c) => {
  await ensureAnalyticsSeed(c.env.OCULOFLOW_KV)
  return c.json<Resp>({ success: true, data: { status: 'ok', module: 'analytics-10a' } })
})

// ── GET /dashboard ─────────────────────────────────────────────────────────────
analyticsRoutes.get('/dashboard', requireAuth, requireRole('BILLING', 'ADMIN'), async (c) => {
  try {
    const dashboard = await getAnalyticsDashboard(c.env.OCULOFLOW_KV)
    const auth = c.var.auth
    await writeAudit(c.env.OCULOFLOW_KV, {
      event: 'PHI_READ',
      userId: auth.userId, userEmail: auth.email, userRole: auth.role,
      resource: 'analytics-dashboard', action: 'READ',
      outcome: 'SUCCESS',
      ip: c.req.header('CF-Connecting-IP') ?? 'unknown',
      userAgent: c.req.header('User-Agent') ?? '',
    })
    return c.json<Resp>({ success: true, data: dashboard })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── GET /kpi ────────────────────────────────────────────────────────────────────
analyticsRoutes.get('/kpi', requireAuth, requireRole('BILLING', 'ADMIN'), async (c) => {
  try {
    await ensureAnalyticsSeed(c.env.OCULOFLOW_KV)
    const periods = await listKpiPeriods(c.env.OCULOFLOW_KV)
    return c.json<Resp>({ success: true, data: periods })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── GET /kpi/:period ────────────────────────────────────────────────────────────
analyticsRoutes.get('/kpi/:period', requireAuth, requireRole('BILLING', 'ADMIN'), async (c) => {
  try {
    await ensureAnalyticsSeed(c.env.OCULOFLOW_KV)
    const period = c.req.param('period')
    const kpi = await getKpiSnapshot(c.env.OCULOFLOW_KV, period)
    if (!kpi) return c.json<Resp>({ success: false, error: 'Period not found' }, 404)
    return c.json<Resp>({ success: true, data: kpi })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── GET /kpi-compare ───────────────────────────────────────────────────────────
analyticsRoutes.get('/kpi-compare', requireAuth, requireRole('BILLING', 'ADMIN'), async (c) => {
  try {
    await ensureAnalyticsSeed(c.env.OCULOFLOW_KV)
    const current = c.req.query('current') ?? '2026-03'
    const prior   = c.req.query('prior')   ?? '2026-02'
    const [curKpi, priKpi] = await Promise.all([
      getKpiSnapshot(c.env.OCULOFLOW_KV, current),
      getKpiSnapshot(c.env.OCULOFLOW_KV, prior),
    ])
    if (!curKpi || !priKpi) return c.json<Resp>({ success: false, error: 'One or both periods not found' }, 404)

    const deltas = {
      totalRevenue:      kpiDelta(curKpi.totalRevenue,      priKpi.totalRevenue),
      collectedRevenue:  kpiDelta(curKpi.collectedRevenue,  priKpi.collectedRevenue),
      totalVisits:       kpiDelta(curKpi.totalVisits,        priKpi.totalVisits),
      newPatients:       kpiDelta(curKpi.newPatients,        priKpi.newPatients),
      collectionRate:    kpiDelta(curKpi.collectionRate,     priKpi.collectionRate),
      denialRate:        kpiDelta(curKpi.denialRate,         priKpi.denialRate),
      noShowRate:        kpiDelta(curKpi.noShowRate,         priKpi.noShowRate),
      npsScore:          kpiDelta(curKpi.npsScore,           priKpi.npsScore),
      recallCompliance:  kpiDelta(curKpi.recallComplianceRate, priKpi.recallComplianceRate),
    }
    return c.json<Resp>({ success: true, data: { current: curKpi, prior: priKpi, deltas } })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── GET /payers ─────────────────────────────────────────────────────────────────
analyticsRoutes.get('/payers', requireAuth, requireRole('BILLING', 'ADMIN'), async (c) => {
  try {
    await ensureAnalyticsSeed(c.env.OCULOFLOW_KV)
    const payers = await listPayerContracts(c.env.OCULOFLOW_KV)
    return c.json<Resp>({ success: true, data: payers })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── PATCH /payers/:id ──────────────────────────────────────────────────────────
analyticsRoutes.patch('/payers/:id', requireAuth, requireRole('ADMIN'), async (c) => {
  try {
    const id = c.req.param('id')
    const patch = await c.req.json()
    const updated = await updatePayerContract(c.env.OCULOFLOW_KV, id, patch)
    if (!updated) return c.json<Resp>({ success: false, error: 'Payer not found' }, 404)
    return c.json<Resp>({ success: true, data: updated })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── GET /providers ──────────────────────────────────────────────────────────────
analyticsRoutes.get('/providers', requireAuth, requireRole('BILLING', 'ADMIN'), async (c) => {
  try {
    await ensureAnalyticsSeed(c.env.OCULOFLOW_KV)
    const period = c.req.query('period')
    const providers = await listProviderProductivity(c.env.OCULOFLOW_KV, period)
    return c.json<Resp>({ success: true, data: providers })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── GET /population ─────────────────────────────────────────────────────────────
analyticsRoutes.get('/population', requireAuth, requireRole('BILLING', 'ADMIN', 'PROVIDER'), async (c) => {
  try {
    await ensureAnalyticsSeed(c.env.OCULOFLOW_KV)
    const trends = await listPopulationTrends(c.env.OCULOFLOW_KV)
    return c.json<Resp>({ success: true, data: trends })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── GET /recall ─────────────────────────────────────────────────────────────────
analyticsRoutes.get('/recall', requireAuth, requireRole('BILLING', 'ADMIN'), async (c) => {
  try {
    await ensureAnalyticsSeed(c.env.OCULOFLOW_KV)
    const metrics = await listRecallMetrics(c.env.OCULOFLOW_KV)
    return c.json<Resp>({ success: true, data: metrics })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── GET /forecast ───────────────────────────────────────────────────────────────
analyticsRoutes.get('/forecast', requireAuth, requireRole('BILLING', 'ADMIN'), async (c) => {
  try {
    await ensureAnalyticsSeed(c.env.OCULOFLOW_KV)
    const forecast = await getLatestForecast(c.env.OCULOFLOW_KV)
    return c.json<Resp>({ success: true, data: forecast })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

export default analyticsRoutes
