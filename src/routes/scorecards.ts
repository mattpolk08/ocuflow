// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 7A: Provider Scorecards & Benchmarking — Routes
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import {
  ensureScorecardseed, listProviders,
  getProviderScorecard, getPracticeSummary,
  listGoals, createGoal, updateGoal, deleteGoal,
} from '../lib/scorecards'
import type { DateRange, GoalStatus } from '../types/scorecards'
import { requireRole } from '../middleware/auth'

type Bindings = { OCULOFLOW_KV: KVNamespace
  DB: D1Database }
type Variables = { auth: import('../types/auth').AuthContext }
type Resp     = { success: boolean; data?: unknown; message?: string; error?: string }

const scorecardsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ── Ping / seed ────────────────────────────────────────────────────────────────
scorecardsRoutes.get('/ping', async (c) => {
  await ensureScorecardseed(c.env.OCULOFLOW_KV, c.env.DB)
  return c.json<Resp>({ success: true, data: { status: 'ok', module: 'scorecards' } })
})

// ── Providers list ─────────────────────────────────────────────────────────────
scorecardsRoutes.get('/providers', async (c) => {
  try {
    return c.json<Resp>({ success: true, data: listProviders() })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Practice summary / leaderboard ────────────────────────────────────────────
scorecardsRoutes.get('/summary', async (c) => {
  try {
    const range = (c.req.query('range') || '30d') as DateRange
    const summary = await getPracticeSummary(c.env.OCULOFLOW_KV, range, c.env.DB)
    return c.json<Resp>({ success: true, data: summary })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Individual provider scorecard ─────────────────────────────────────────────
scorecardsRoutes.get('/providers/:id', async (c) => {
  try {
    const range = (c.req.query('range') || '30d') as DateRange
    const card  = await getProviderScorecard(c.env.OCULOFLOW_KV, c.req.param('id'), range, c.env.DB)
    if (!card) return c.json<Resp>({ success: false, error: 'Provider not found' }, 404)
    return c.json<Resp>({ success: true, data: card })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Volume KPIs for a provider ────────────────────────────────────────────────
scorecardsRoutes.get('/providers/:id/volume', async (c) => {
  try {
    const range = (c.req.query('range') || '30d') as DateRange
    const card  = await getProviderScorecard(c.env.OCULOFLOW_KV, c.req.param('id'), range, c.env.DB)
    if (!card) return c.json<Resp>({ success: false, error: 'Provider not found' }, 404)
    return c.json<Resp>({ success: true, data: card.volume })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Efficiency KPIs ───────────────────────────────────────────────────────────
scorecardsRoutes.get('/providers/:id/efficiency', async (c) => {
  try {
    const range = (c.req.query('range') || '30d') as DateRange
    const card  = await getProviderScorecard(c.env.OCULOFLOW_KV, c.req.param('id'), range, c.env.DB)
    if (!card) return c.json<Resp>({ success: false, error: 'Provider not found' }, 404)
    return c.json<Resp>({ success: true, data: card.efficiency })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Revenue KPIs ──────────────────────────────────────────────────────────────
scorecardsRoutes.get('/providers/:id/revenue', async (c) => {
  try {
    const range = (c.req.query('range') || '30d') as DateRange
    const card  = await getProviderScorecard(c.env.OCULOFLOW_KV, c.req.param('id'), range, c.env.DB)
    if (!card) return c.json<Resp>({ success: false, error: 'Provider not found' }, 404)
    return c.json<Resp>({ success: true, data: card.revenue })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Quality KPIs ──────────────────────────────────────────────────────────────
scorecardsRoutes.get('/providers/:id/quality', async (c) => {
  try {
    const range = (c.req.query('range') || '30d') as DateRange
    const card  = await getProviderScorecard(c.env.OCULOFLOW_KV, c.req.param('id'), range, c.env.DB)
    if (!card) return c.json<Resp>({ success: false, error: 'Provider not found' }, 404)
    return c.json<Resp>({ success: true, data: card.quality })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Benchmarks ────────────────────────────────────────────────────────────────
scorecardsRoutes.get('/providers/:id/benchmarks', async (c) => {
  try {
    const range = (c.req.query('range') || '30d') as DateRange
    const card  = await getProviderScorecard(c.env.OCULOFLOW_KV, c.req.param('id'), range, c.env.DB)
    if (!card) return c.json<Resp>({ success: false, error: 'Provider not found' }, 404)
    return c.json<Resp>({ success: true, data: card.benchmarks })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Period snapshots ──────────────────────────────────────────────────────────
scorecardsRoutes.get('/providers/:id/snapshots', async (c) => {
  try {
    const range = (c.req.query('range') || '30d') as DateRange
    const card  = await getProviderScorecard(c.env.OCULOFLOW_KV, c.req.param('id'), range, c.env.DB)
    if (!card) return c.json<Resp>({ success: false, error: 'Provider not found' }, 404)
    return c.json<Resp>({ success: true, data: card.periodSnapshots })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Goals ─────────────────────────────────────────────────────────────────────
scorecardsRoutes.get('/goals', async (c) => {
  try {
    const { providerId } = c.req.query()
    const goals = await listGoals(c.env.OCULOFLOW_KV, providerId, c.env.DB)
    return c.json<Resp>({ success: true, data: goals })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

scorecardsRoutes.get('/goals/:id', async (c) => {
  try {
    const goals = await listGoals(c.env.OCULOFLOW_KV, c.env.DB)
    const goal  = goals.find(g => g.id === c.req.param('id'))
    if (!goal) return c.json<Resp>({ success: false, error: 'Goal not found' }, 404)
    return c.json<Resp>({ success: true, data: goal })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

scorecardsRoutes.post('/goals', requireRole('ADMIN', 'PROVIDER', 'BILLING'), async (c) => {
  try {
    const body = await c.req.json()
    const missing = ['providerId', 'metric', 'description', 'targetValue', 'currentValue', 'unit', 'period', 'dueDate'].filter(k => body[k] === undefined || body[k] === '')
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)
    const goal = await createGoal(c.env.OCULOFLOW_KV, {
      ...body,
      status: body.status ?? 'ON_TRACK' as GoalStatus,
    }, c.env.DB)
    return c.json<Resp>({ success: true, data: goal, message: 'Goal created' }, 201)
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

scorecardsRoutes.patch('/goals/:id', requireRole('ADMIN', 'PROVIDER', 'BILLING'), async (c) => {
  try {
    const body = await c.req.json()
    const goal = await updateGoal(c.env.OCULOFLOW_KV, c.req.param('id'), body, c.env.DB)
    if (!goal) return c.json<Resp>({ success: false, error: 'Goal not found' }, 404)
    return c.json<Resp>({ success: true, data: goal, message: 'Goal updated' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

scorecardsRoutes.delete('/goals/:id', requireRole('ADMIN', 'BILLING'), async (c) => {
  try {
    const ok = await deleteGoal(c.env.OCULOFLOW_KV, c.req.param('id'), c.env.DB)
    if (!ok) return c.json<Resp>({ success: false, error: 'Goal not found' }, 404)
    return c.json<Resp>({ success: true, message: 'Goal deleted' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

export default scorecardsRoutes
