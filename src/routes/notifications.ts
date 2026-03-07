// Phase B1 — Notifications API Routes
// POST /api/notifications/send          — send SMS or email (ADMIN/PROVIDER)
// POST /api/notifications/test          — test credentials (ADMIN only)
// GET  /api/notifications/logs          — delivery log query (ADMIN)
// GET  /api/notifications/status        — provider status (real vs demo)
// POST /api/notifications/reminder/sms  — appointment reminder SMS
// POST /api/notifications/reminder/email— appointment reminder email
// POST /api/notifications/recall/sms    — recall outreach SMS
// POST /api/notifications/survey        — survey invite (SMS or email)

import { Hono } from 'hono'
import {
  sendNotification, sendAppointmentReminderSms, sendAppointmentReminderEmail,
  sendRecallSms, sendSurveyInvite, listNotifLogs,
  isRealTwilio, isRealSendGrid, isRealEligibility,
  type NotifChannel, type NotifType,
} from '../lib/notifications'
import { requireAuth, requireRole } from '../middleware/auth'
import { writeAudit } from '../lib/audit'
import { checkEligibility, type EligibilityRequest } from '../lib/eligibility'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  JWT_SECRET?: string
  TWILIO_ACCOUNT_SID?: string
  TWILIO_AUTH_TOKEN?: string
  TWILIO_FROM_NUMBER?: string
  SENDGRID_API_KEY?: string
  SENDGRID_FROM_EMAIL?: string
  ELIGIBILITY_API_KEY?: string
  PRACTICE_NAME?: string
  DEMO_MODE?: string
}
type Variables = { auth: import('../types/auth').AuthContext }
type Resp = { success: boolean; data?: unknown; error?: string; message?: string }

const notifRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ── GET /status — show which providers are live vs demo ───────────────────────
notifRoutes.get('/status', requireAuth, async (c) => {
  const e = c.env
  return c.json<Resp>({
    success: true,
    data: {
      sms: {
        provider: 'twilio',
        live: isRealTwilio(e.TWILIO_ACCOUNT_SID, e.TWILIO_AUTH_TOKEN),
        accountSid: e.TWILIO_ACCOUNT_SID ? `${e.TWILIO_ACCOUNT_SID.slice(0,6)}…` : 'not set',
        fromNumber: e.TWILIO_FROM_NUMBER ?? 'not set',
      },
      email: {
        provider: 'sendgrid',
        live: isRealSendGrid(e.SENDGRID_API_KEY),
        fromEmail: e.SENDGRID_FROM_EMAIL ?? 'noreply@oculoflow.com',
      },
      eligibility: {
        provider: 'availity',
        live: isRealEligibility(e.ELIGIBILITY_API_KEY),
      },
      demoMode: e.DEMO_MODE === 'true',
    },
  })
})

// ── POST /test — test real send (ADMIN only) ──────────────────────────────────
notifRoutes.post('/test', requireAuth, requireRole('ADMIN'), async (c) => {
  const { channel, to, message } = await c.req.json() as {
    channel: NotifChannel; to: string; message?: string
  }
  if (!channel || !to) return c.json<Resp>({ success: false, error: 'channel and to are required' }, 400)

  const auth = c.var.auth
  const log = await sendNotification(c.env, {
    channel, type: 'GENERAL', to,
    subject: `Test message from OculoFlow`,
    body: message ?? `Test notification from OculoFlow. Provider: ${channel === 'SMS' ? 'Twilio' : 'SendGrid'}. Sent at ${new Date().toISOString()}.`,
  })

  await writeAudit(c.env.OCULOFLOW_KV, {
    event: 'PHI_CREATE',
    userId: auth.userId, userEmail: auth.email, userRole: auth.role,
    resource: 'notification', action: 'TEST_SEND',
    outcome: log.success ? 'SUCCESS' : 'FAILURE',
    ip: c.req.header('CF-Connecting-IP') ?? 'unknown',
    userAgent: c.req.header('User-Agent') ?? '',
    detail: `${channel} test to ${to} — provider: ${log.provider}`,
  })

  return c.json<Resp>({
    success: log.success,
    data: {
      provider: log.provider,
      live: log.provider !== 'demo',
      externalId: log.externalId,
      retries: log.retries,
      error: log.error,
    },
    message: log.success
      ? `${channel} sent via ${log.provider}${log.provider !== 'demo' ? ' (LIVE)' : ' (demo mode)'}`
      : `Send failed: ${log.error}`,
  })
})

// ── POST /send — generic send ─────────────────────────────────────────────────
notifRoutes.post('/send', requireAuth, requireRole('ADMIN', 'PROVIDER', 'NURSE'), async (c) => {
  const body = await c.req.json() as {
    channel: NotifChannel; type?: NotifType; to: string
    subject?: string; message: string; html?: string
    patientId?: string; patientName?: string
  }
  if (!body.channel || !body.to || !body.message)
    return c.json<Resp>({ success: false, error: 'channel, to, and message are required' }, 400)

  const log = await sendNotification(c.env, {
    channel: body.channel, type: body.type ?? 'GENERAL',
    to: body.to, subject: body.subject, body: body.message,
    html: body.html, patientId: body.patientId, patientName: body.patientName,
  })
  return c.json<Resp>({ success: log.success, data: log, error: log.error })
})

// ── POST /reminder/sms ────────────────────────────────────────────────────────
notifRoutes.post('/reminder/sms', requireAuth, requireRole('ADMIN', 'FRONT_DESK', 'NURSE'), async (c) => {
  const b = await c.req.json() as {
    phone: string; patientName: string; patientId?: string
    date: string; time: string; providerName: string
  }
  if (!b.phone || !b.patientName || !b.date || !b.time || !b.providerName)
    return c.json<Resp>({ success: false, error: 'phone, patientName, date, time, providerName required' }, 400)

  const log = await sendAppointmentReminderSms(c.env, b)
  return c.json<Resp>({ success: log.success, data: log, error: log.error })
})

// ── POST /reminder/email ──────────────────────────────────────────────────────
notifRoutes.post('/reminder/email', requireAuth, requireRole('ADMIN', 'FRONT_DESK', 'NURSE'), async (c) => {
  const b = await c.req.json() as {
    email: string; patientName: string; patientId?: string
    date: string; time: string; providerName: string
    confirmUrl?: string; cancelUrl?: string
  }
  if (!b.email || !b.patientName || !b.date || !b.time || !b.providerName)
    return c.json<Resp>({ success: false, error: 'email, patientName, date, time, providerName required' }, 400)

  const log = await sendAppointmentReminderEmail(c.env, b)
  return c.json<Resp>({ success: log.success, data: log, error: log.error })
})

// ── POST /recall/sms ──────────────────────────────────────────────────────────
notifRoutes.post('/recall/sms', requireAuth, requireRole('ADMIN', 'FRONT_DESK', 'NURSE'), async (c) => {
  const b = await c.req.json() as {
    phone: string; patientName: string; patientId?: string
    dueType: string; practicePhone?: string
  }
  if (!b.phone || !b.patientName || !b.dueType)
    return c.json<Resp>({ success: false, error: 'phone, patientName, dueType required' }, 400)

  const log = await sendRecallSms(c.env, b)
  return c.json<Resp>({ success: log.success, data: log, error: log.error })
})

// ── POST /survey ──────────────────────────────────────────────────────────────
notifRoutes.post('/survey', requireAuth, requireRole('ADMIN', 'FRONT_DESK'), async (c) => {
  const b = await c.req.json() as {
    channel: NotifChannel; phone?: string; email?: string
    patientName: string; patientId?: string; surveyUrl: string
  }
  if (!b.channel || !b.patientName || !b.surveyUrl)
    return c.json<Resp>({ success: false, error: 'channel, patientName, surveyUrl required' }, 400)

  const log = await sendSurveyInvite(c.env, { ...b, channel: b.channel })
  return c.json<Resp>({ success: log.success, data: log, error: log.error })
})

// ── GET /logs ─────────────────────────────────────────────────────────────────
notifRoutes.get('/logs', requireAuth, requireRole('ADMIN'), async (c) => {
  const limit     = Number(c.req.query('limit') ?? '100')
  const type      = c.req.query('type') as NotifType | undefined
  const channel   = c.req.query('channel') as NotifChannel | undefined
  const patientId = c.req.query('patientId')
  const logs = await listNotifLogs(c.env.OCULOFLOW_KV, { limit, type, channel, patientId })
  return c.json<Resp>({ success: true, data: logs })
})

// ── POST /eligibility — real insurance check ──────────────────────────────────
notifRoutes.post('/eligibility', requireAuth, requireRole('ADMIN', 'FRONT_DESK', 'BILLING'), async (c) => {
  const body = await c.req.json() as EligibilityRequest & { firstName?: string; lastName?: string; dob?: string }
  if (!body.payerId || !body.memberId || !body.providerNpi)
    return c.json<Resp>({ success: false, error: 'payerId, memberId, providerNpi required' }, 400)

  // Build subscriberName from firstName/lastName if not provided directly
  const req: EligibilityRequest = {
    ...body,
    subscriberName: body.subscriberName ?? `${body.firstName ?? ''} ${body.lastName ?? ''}`.trim(),
    subscriberDob:  body.subscriberDob ?? body.dob,
    payerName:      body.payerName ?? body.payerId,
    serviceDate:    body.serviceDate ?? new Date().toISOString().slice(0, 10),
  }

  const isLive = isRealEligibility(c.env.ELIGIBILITY_API_KEY)
  const result = await checkEligibility(req, c.env.ELIGIBILITY_API_KEY, !isLive)

  await writeAudit(c.env.OCULOFLOW_KV, {
    event: 'PHI_READ',
    userId: c.get('auth').userId, userEmail: c.get('auth').email, userRole: c.get('auth').role,
    resource: 'eligibility', action: 'CHECK',
    outcome: result.success ? 'success' : 'failure',
    ip: c.req.header('CF-Connecting-IP') ?? 'unknown',
    userAgent: c.req.header('User-Agent') ?? '',
    detail: `Payer: ${req.payerName} | MemberId: ${req.memberId.slice(0,4)}*** | Live: ${isLive}`,
  })

  return c.json<Resp>({ success: result.success, data: { ...result, live: isLive } })
})

export default notifRoutes
