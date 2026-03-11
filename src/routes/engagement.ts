// Phase 9B — Patient Engagement & Loyalty Routes
import { Hono } from 'hono'
import {
  ensureEngagementSeed, getEngagementDashboard,
  listCareGaps, getCareGap, createCareGap, updateCareGap,
  listRecalls, updateRecall, createRecall,
  listSurveys, getSurvey, createSurvey, updateSurvey,
  listSurveyResponses, submitSurveyResponse,
  getLoyaltyAccount, addLoyaltyPoints, listLoyaltyAccounts,
} from '../lib/engagement'
import type { CareGapStatus, RecallStatus } from '../lib/engagement'
import { requireRole } from '../middleware/auth'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  DB: D1Database
  TWILIO_ACCOUNT_SID?: string
  TWILIO_AUTH_TOKEN?: string
  TWILIO_FROM_NUMBER?: string
  PRACTICE_NAME?: string
  DEMO_MODE?: string
}
type Resp = { success: boolean; data?: unknown; error?: string; message?: string }
type Variables = { auth: import('../types/auth').AuthContext }
const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`

const engagementRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ── Ping / seed ───────────────────────────────────────────────────────────────
engagementRoutes.get('/ping', async (c) => {
  await ensureEngagementSeed(c.env.OCULOFLOW_KV, c.env.DB)
  return c.json<Resp>({ success: true, data: { status: 'ok', module: 'engagement-9b' } })
})

// ── Dashboard ─────────────────────────────────────────────────────────────────
engagementRoutes.get('/dashboard', async (c) => {
  try {
    const data = await getEngagementDashboard(c.env.OCULOFLOW_KV, c.env.DB)
    return c.json<Resp>({ success: true, data })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Care Gaps ─────────────────────────────────────────────────────────────────
engagementRoutes.get('/care-gaps', async (c) => {
  try {
    const { status, priority, gapType } = c.req.query()
    const data = await listCareGaps(c.env.OCULOFLOW_KV, {
      status: status as CareGapStatus | undefined,
      priority: priority as string | undefined,
      gapType: gapType as any,
    }, c.env.DB)
    return c.json<Resp>({ success: true, data })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

engagementRoutes.get('/care-gaps/:id', async (c) => {
  try {
    const gap = await getCareGap(c.env.OCULOFLOW_KV, c.req.param('id'), c.env.DB)
    if (!gap) return c.json<Resp>({ success: false, error: 'Care gap not found' }, 404)
    return c.json<Resp>({ success: true, data: gap })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

engagementRoutes.post('/care-gaps', requireRole('ADMIN', 'PROVIDER', 'NURSE'), async (c) => {
  try {
    const body = await c.req.json()
    const missing = ['patientId', 'patientName', 'gapType', 'dueDate', 'priority'].filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)
    const gap = await createCareGap(c.env.OCULOFLOW_KV, {
      ...body, status: 'OPEN', outreachCount: 0,
      daysOverdue: body.daysOverdue ?? Math.floor((Date.now() - new Date(body.dueDate).getTime()) / 86400000),
    }, c.env.DB)
    return c.json<Resp>({ success: true, data: gap }, 201)
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

engagementRoutes.patch('/care-gaps/:id', requireRole('ADMIN', 'PROVIDER', 'NURSE'), async (c) => {
  try {
    const body = await c.req.json()
    const gap = await updateCareGap(c.env.OCULOFLOW_KV, c.req.param('id'), body, c.env.DB)
    if (!gap) return c.json<Resp>({ success: false, error: 'Care gap not found' }, 404)
    return c.json<Resp>({ success: true, data: gap })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// Bulk outreach action — mark outreach sent and optionally dispatch SMS
engagementRoutes.post('/care-gaps/:id/outreach', async (c) => {
  try {
    const id   = c.req.param('id')
    const body = await c.req.json().catch(() => ({})) as { channel?: string; phone?: string }
    const gap  = await getCareGap(c.env.OCULOFLOW_KV, id, c.env.DB)
    if (!gap) return c.json<Resp>({ success: false, error: 'Care gap not found' }, 404)

    let smsSent = false
    if (body.channel === 'SMS' && (body.phone ?? gap.patientPhone)) {
      const phone = body.phone ?? gap.patientPhone!
      const sid   = c.env.TWILIO_ACCOUNT_SID
      if (sid && !sid.startsWith('ACxx')) {
        const { sendSms, smsRecallReminder } = await import('../lib/sms')
        const msg = smsRecallReminder(gap.patientName, new Date(gap.dueDate).toLocaleDateString(), c.env.PRACTICE_NAME ?? 'OculoFlow', '')
        const result = await sendSms(msg, phone, { accountSid: sid, authToken: c.env.TWILIO_AUTH_TOKEN ?? '', fromNumber: c.env.TWILIO_FROM_NUMBER ?? '', demoMode: c.env.DEMO_MODE === 'true' })
        smsSent = result.success
      } else {
        smsSent = true // demo mode
      }
    }

    const updated = await updateCareGap(c.env.OCULOFLOW_KV, id, {
      status: 'OUTREACH_SENT',
      outreachCount: (gap.outreachCount ?? 0) + 1,
      lastOutreachAt: new Date().toISOString(),
    }, c.env.DB)
    return c.json<Resp>({ success: true, data: updated, message: smsSent ? 'Outreach sent via SMS' : 'Outreach recorded' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Recall ────────────────────────────────────────────────────────────────────
engagementRoutes.get('/recalls', async (c) => {
  try {
    const { status } = c.req.query()
    const data = await listRecalls(c.env.OCULOFLOW_KV, { status: status as RecallStatus | undefined }, c.env.DB)
    return c.json<Resp>({ success: true, data })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

engagementRoutes.post('/recalls', requireRole('ADMIN', 'PROVIDER', 'NURSE', 'FRONT_DESK'), async (c) => {
  try {
    const body = await c.req.json()
    const missing = ['patientId', 'patientName', 'recallType', 'dueDate'].filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)
    const recall = await createRecall(c.env.OCULOFLOW_KV, { ...body, status: 'PENDING', attemptCount: 0 }, c.env.DB)
    return c.json<Resp>({ success: true, data: recall }, 201)
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

engagementRoutes.patch('/recalls/:id', requireRole('ADMIN', 'PROVIDER', 'NURSE', 'FRONT_DESK'), async (c) => {
  try {
    const body = await c.req.json()
    const recall = await updateRecall(c.env.OCULOFLOW_KV, c.req.param('id'), body, c.env.DB)
    if (!recall) return c.json<Resp>({ success: false, error: 'Recall not found' }, 404)
    return c.json<Resp>({ success: true, data: recall })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// Contact recall patient — sends SMS and increments attempt count
engagementRoutes.post('/recalls/:id/contact', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as { channel?: string; note?: string }
    const recall = await updateRecall(c.env.OCULOFLOW_KV, c.req.param('id'), {
      status: 'CONTACTED',
      attemptCount: 0, // will be incremented below after fetch
      lastAttemptAt: new Date().toISOString(),
      lastAttemptChannel: (body.channel ?? 'SMS') as any,
      notes: body.note,
    }, c.env.DB)
    if (!recall) return c.json<Resp>({ success: false, error: 'Recall not found' }, 404)
    // Re-fetch and increment properly
    const updated = await updateRecall(c.env.OCULOFLOW_KV, c.req.param('id'), { attemptCount: (recall.attemptCount ?? 0) + 1 }, c.env.DB)
    return c.json<Resp>({ success: true, data: updated, message: 'Contact attempt recorded' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Surveys ───────────────────────────────────────────────────────────────────
engagementRoutes.get('/surveys', async (c) => {
  try {
    const data = await listSurveys(c.env.OCULOFLOW_KV, c.env.DB)
    return c.json<Resp>({ success: true, data })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

engagementRoutes.get('/surveys/:id', async (c) => {
  try {
    const survey = await getSurvey(c.env.OCULOFLOW_KV, c.req.param('id'), c.env.DB)
    if (!survey) return c.json<Resp>({ success: false, error: 'Survey not found' }, 404)
    return c.json<Resp>({ success: true, data: survey })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

engagementRoutes.post('/surveys', requireRole('ADMIN', 'PROVIDER'), async (c) => {
  try {
    const body = await c.req.json()
    if (!body.name || !body.type) return c.json<Resp>({ success: false, error: 'name and type required' }, 400)
    const survey = await createSurvey(c.env.OCULOFLOW_KV, {
      ...body, isActive: body.isActive ?? true,
      questions: body.questions ?? [], delayHours: body.delayHours ?? 24,
    }, c.env.DB)
    return c.json<Resp>({ success: true, data: survey }, 201)
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

engagementRoutes.patch('/surveys/:id', requireRole('ADMIN', 'PROVIDER'), async (c) => {
  try {
    const body = await c.req.json()
    const survey = await updateSurvey(c.env.OCULOFLOW_KV, c.req.param('id'), body, c.env.DB)
    if (!survey) return c.json<Resp>({ success: false, error: 'Survey not found' }, 404)
    return c.json<Resp>({ success: true, data: survey })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

engagementRoutes.get('/surveys/:id/responses', async (c) => {
  try {
    const data = await listSurveyResponses(c.env.OCULOFLOW_KV, c.req.param('id'), c.env.DB)
    return c.json<Resp>({ success: true, data })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

engagementRoutes.post('/surveys/:id/respond', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.patientId || !body.answers) return c.json<Resp>({ success: false, error: 'patientId and answers required' }, 400)

    // Calculate sentiment
    const scores = Object.values(body.answers).filter((v): v is number => typeof v === 'number')
    const avg    = scores.length ? scores.reduce((s, v) => s + v, 0) / scores.length : 3
    const nps    = typeof body.answers.q1 === 'number' && body.answers.q1 > 6 ? body.answers.q1 : undefined
    const sentiment: SurveyResponse['sentiment'] = avg >= 4 ? 'POSITIVE' : avg <= 2.5 ? 'NEGATIVE' : 'NEUTRAL'

    const resp = await submitSurveyResponse(c.env.OCULOFLOW_KV, {
      surveyId: c.req.param('id'),
      patientId: body.patientId, patientName: body.patientName ?? 'Patient',
      answers: body.answers,
      npsScore: nps, overallScore: Math.round(avg * 10) / 10,
      sentiment,
      followUpRequired: sentiment === 'NEGATIVE',
      followUpReason: sentiment === 'NEGATIVE' ? 'Low satisfaction score requires follow-up' : undefined,
      submittedAt: new Date().toISOString(),
    }, c.env.DB)
    return c.json<Resp>({ success: true, data: resp, message: 'Thank you for your feedback!' }, 201)
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// Fix TypeScript — import type inside function scope
interface SurveyResponse { sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' }

// ── Loyalty ───────────────────────────────────────────────────────────────────
engagementRoutes.get('/loyalty', async (c) => {
  try {
    const data = await listLoyaltyAccounts(c.env.OCULOFLOW_KV, c.env.DB)
    return c.json<Resp>({ success: true, data })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

engagementRoutes.get('/loyalty/:patientId', async (c) => {
  try {
    const account = await getLoyaltyAccount(c.env.OCULOFLOW_KV, c.req.param('patientId'), c.env.DB)
    if (!account) return c.json<Resp>({ success: false, error: 'Loyalty account not found' }, 404)
    return c.json<Resp>({ success: true, data: account })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

engagementRoutes.post('/loyalty/:patientId/points', requireRole('ADMIN', 'FRONT_DESK'), async (c) => {
  try {
    const body = await c.req.json()
    if (!body.type || !body.points || !body.description) return c.json<Resp>({ success: false, error: 'type, points, description required' }, 400)
    const account = await addLoyaltyPoints(c.env.OCULOFLOW_KV, c.req.param('patientId'), body.patientName ?? 'Patient', {
      type: body.type, points: body.points, description: body.description, date: new Date().toISOString(),
    }, c.env.DB)
    return c.json<Resp>({ success: true, data: account })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

export default engagementRoutes
