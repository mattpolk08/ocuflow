// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 6A: Appointment Reminders & Communications — Routes
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import {
  ensureCommsSeed, listTemplates, getTemplate, createTemplate, updateTemplate,
  listMessages, getMessage, sendMessage, sendAppointmentReminder, recordPatientResponse,
  listRules, updateRule,
  listNoShows, createNoShow, updateNoShow,
  listCampaigns, getCampaign, createCampaign, updateCampaignStatus,
  getCommsDashboard, fillTemplate,
} from '../lib/reminders'
import type { CommChannel, MessageType, CampaignStatus, NoShowStatus } from '../types/reminders'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  TWILIO_ACCOUNT_SID?: string
  TWILIO_AUTH_TOKEN?: string
  TWILIO_FROM_NUMBER?: string
  SENDGRID_API_KEY?: string
  SENDGRID_FROM_EMAIL?: string
  PRACTICE_NAME?: string
  DEMO_MODE?: string
}
type Resp     = { success: boolean; data?: unknown; message?: string; error?: string }

const remindersRoutes = new Hono<{ Bindings: Bindings }>()

// ── Notification config helpers ───────────────────────────────────────────────
function getSmsConfig(env: Bindings) {
  if (!env.TWILIO_ACCOUNT_SID) return undefined
  return {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken:  env.TWILIO_AUTH_TOKEN ?? '',
    fromNumber: env.TWILIO_FROM_NUMBER ?? '',
    demoMode:   env.DEMO_MODE === 'true',
  }
}
function getEmailConfig(env: Bindings) {
  if (!env.SENDGRID_API_KEY) return undefined
  return {
    apiKey:     env.SENDGRID_API_KEY,
    fromEmail:  env.SENDGRID_FROM_EMAIL ?? 'noreply@oculoflow.com',
    fromName:   env.PRACTICE_NAME ?? 'OculoFlow',
    demoMode:   env.DEMO_MODE === 'true',
  }
}

// ── Seed / ping ────────────────────────────────────────────────────────────────
remindersRoutes.get('/ping', async (c) => {
  await ensureCommsSeed(c.env.OCULOFLOW_KV)
  const smsReady   = !!c.env.TWILIO_ACCOUNT_SID && !c.env.TWILIO_ACCOUNT_SID.startsWith('ACxx')
  const emailReady = !!c.env.SENDGRID_API_KEY   && !c.env.SENDGRID_API_KEY.startsWith('SG.xx')
  return c.json<Resp>({ success: true, data: {
    status: 'ok', module: 'reminders',
    integrations: {
      sms:   smsReady   ? 'twilio-live'   : c.env.DEMO_MODE === 'true' ? 'demo' : 'not-configured',
      email: emailReady ? 'sendgrid-live' : c.env.DEMO_MODE === 'true' ? 'demo' : 'not-configured',
    },
  }})
})

// ── Test SMS (ADMIN) ──────────────────────────────────────────────────────────
remindersRoutes.post('/test-sms', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as { to?: string }
    if (!body.to) return c.json<Resp>({ success: false, error: 'to (phone number) required' }, 400)
    const cfg = getSmsConfig(c.env)
    if (!cfg) return c.json<Resp>({ success: false, error: 'Twilio not configured' }, 503)
    const { sendSms } = await import('../lib/sms')
    const practiceName = c.env.PRACTICE_NAME ?? 'OculoFlow'
    const result = await sendSms(`[${practiceName}] Test SMS from OculoFlow — your integration is working! 🎉`, cfg.demoMode ? 'demo' : body.to, cfg as any)
    return c.json<Resp>({ success: result.success, data: { messageId: result.messageId, provider: result.provider }, error: result.error })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Test Email (ADMIN) ────────────────────────────────────────────────────────
remindersRoutes.post('/test-email', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as { to?: string; name?: string }
    if (!body.to) return c.json<Resp>({ success: false, error: 'to (email address) required' }, 400)
    const cfg = getEmailConfig(c.env)
    if (!cfg) return c.json<Resp>({ success: false, error: 'SendGrid not configured' }, 503)
    const { sendEmail } = await import('../lib/sms')
    const practiceName = c.env.PRACTICE_NAME ?? 'OculoFlow'
    const result = await sendEmail({
      to: body.to, toName: body.name,
      subject: `[${practiceName}] Test Email — Integration Working`,
      html: `<div style="font-family:sans-serif;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:12px"><h2 style="color:#0d9488">✅ SendGrid Integration Working</h2><p>Your OculoFlow email integration is configured correctly.</p><p style="color:#94a3b8;font-size:13px">This is a test message from OculoFlow.</p></div>`,
      text: `${practiceName} — Test email. Your SendGrid integration is working!`,
    }, cfg)
    return c.json<Resp>({ success: result.success, data: { messageId: result.messageId, provider: result.provider }, error: result.error })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Dashboard ─────────────────────────────────────────────────────────────────
remindersRoutes.get('/dashboard', async (c) => {
  try {
    const data = await getCommsDashboard(c.env.OCULOFLOW_KV)
    return c.json<Resp>({ success: true, data })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Templates ─────────────────────────────────────────────────────────────────
remindersRoutes.get('/templates', async (c) => {
  try {
    const templates = await listTemplates(c.env.OCULOFLOW_KV)
    return c.json<Resp>({ success: true, data: templates })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

remindersRoutes.get('/templates/:id', async (c) => {
  try {
    const tpl = await getTemplate(c.env.OCULOFLOW_KV, c.req.param('id'))
    if (!tpl) return c.json<Resp>({ success: false, error: 'Template not found' }, 404)
    return c.json<Resp>({ success: true, data: tpl })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

remindersRoutes.post('/templates', async (c) => {
  try {
    const body = await c.req.json()
    const missing = ['name', 'type', 'channel', 'body'].filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)
    const tpl = await createTemplate(c.env.OCULOFLOW_KV, { ...body, isActive: body.isActive ?? true })
    return c.json<Resp>({ success: true, data: tpl, message: 'Template created' }, 201)
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

remindersRoutes.patch('/templates/:id', async (c) => {
  try {
    const body = await c.req.json()
    const tpl = await updateTemplate(c.env.OCULOFLOW_KV, c.req.param('id'), body)
    if (!tpl) return c.json<Resp>({ success: false, error: 'Template not found' }, 404)
    return c.json<Resp>({ success: true, data: tpl, message: 'Template updated' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// Preview a template with sample variables
remindersRoutes.post('/templates/:id/preview', async (c) => {
  try {
    const tpl = await getTemplate(c.env.OCULOFLOW_KV, c.req.param('id'))
    if (!tpl) return c.json<Resp>({ success: false, error: 'Template not found' }, 404)
    const vars = await c.req.json()
    const sampleVars = {
      patient_name: 'Jane Doe', date: 'March 10, 2026', time: '10:00 AM',
      provider: 'Dr. Sarah Chen', location: 'OculoFlow Eye Care, 100 Brickell Ave, Miami FL',
      reason: 'Annual Eye Exam', ...vars,
    }
    return c.json<Resp>({ success: true, data: { subject: tpl.subject ? fillTemplate(tpl.subject, sampleVars) : null, body: fillTemplate(tpl.body, sampleVars) } })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Messages (outbound log) ───────────────────────────────────────────────────
remindersRoutes.get('/messages', async (c) => {
  try {
    const { patientId, status, messageType, limit } = c.req.query()
    const msgs = await listMessages(c.env.OCULOFLOW_KV, {
      patientId, status, messageType, limit: limit ? parseInt(limit) : undefined,
    })
    return c.json<Resp>({ success: true, data: msgs })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

remindersRoutes.get('/messages/:id', async (c) => {
  try {
    const msg = await getMessage(c.env.OCULOFLOW_KV, c.req.param('id'))
    if (!msg) return c.json<Resp>({ success: false, error: 'Message not found' }, 404)
    return c.json<Resp>({ success: true, data: msg })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// Send a custom message
remindersRoutes.post('/messages/send', async (c) => {
  try {
    const body = await c.req.json()
    const missing = ['patientId', 'patientName', 'channel', 'messageType', 'body'].filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)
    const msg = await sendMessage(c.env.OCULOFLOW_KV, {
      ...body,
      smsConfig:   getSmsConfig(c.env),
      emailConfig: getEmailConfig(c.env),
    })
    return c.json<Resp>({ success: true, data: msg, message: `Message ${msg.status === 'DELIVERED' ? 'sent successfully' : 'failed to send'}` }, 201)
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// Send appointment reminder
remindersRoutes.post('/messages/reminder', async (c) => {
  try {
    const body = await c.req.json()
    const missing = ['patientId', 'patientName', 'channel', 'messageType', 'templateId', 'date', 'time', 'provider'].filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)
    const msg = await sendAppointmentReminder(c.env.OCULOFLOW_KV, { ...body, appointmentId: body.appointmentId ?? uid() })
    return c.json<Resp>({ success: true, data: msg, message: `Reminder ${msg.status === 'DELIVERED' ? 'sent' : 'failed'}` }, 201)
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// Record inbound reply (two-way)
remindersRoutes.post('/messages/:id/response', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.response) return c.json<Resp>({ success: false, error: 'response required' }, 400)
    const msg = await recordPatientResponse(c.env.OCULOFLOW_KV, c.req.param('id'), body.response, body.text)
    if (!msg) return c.json<Resp>({ success: false, error: 'Message not found' }, 404)
    return c.json<Resp>({ success: true, data: msg, message: 'Response recorded' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Reminder Rules ────────────────────────────────────────────────────────────
remindersRoutes.get('/rules', async (c) => {
  try {
    const rules = await listRules(c.env.OCULOFLOW_KV)
    return c.json<Resp>({ success: true, data: rules })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

remindersRoutes.patch('/rules/:id', async (c) => {
  try {
    const body = await c.req.json()
    const rule = await updateRule(c.env.OCULOFLOW_KV, c.req.param('id'), body)
    if (!rule) return c.json<Resp>({ success: false, error: 'Rule not found' }, 404)
    return c.json<Resp>({ success: true, data: rule, message: 'Rule updated' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── No-Shows ──────────────────────────────────────────────────────────────────
remindersRoutes.get('/no-shows', async (c) => {
  try {
    const { status } = c.req.query()
    const records = await listNoShows(c.env.OCULOFLOW_KV, { status })
    return c.json<Resp>({ success: true, data: records })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

remindersRoutes.post('/no-shows', async (c) => {
  try {
    const body = await c.req.json()
    const missing = ['appointmentId', 'patientId', 'patientName', 'missedDate', 'appointmentType', 'providerId', 'providerName'].filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)
    const record = await createNoShow(c.env.OCULOFLOW_KV, { ...body, status: body.status ?? 'UNCONTACTED' })
    return c.json<Resp>({ success: true, data: record, message: 'No-show recorded' }, 201)
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

remindersRoutes.patch('/no-shows/:id', async (c) => {
  try {
    const body = await c.req.json()
    const record = await updateNoShow(c.env.OCULOFLOW_KV, c.req.param('id'), body)
    if (!record) return c.json<Resp>({ success: false, error: 'No-show record not found' }, 404)
    return c.json<Resp>({ success: true, data: record, message: 'No-show updated' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// Quick: send no-show follow-up and mark FOLLOWUP_SENT
remindersRoutes.post('/no-shows/:id/followup', async (c) => {
  try {
    const record = await updateNoShow(c.env.OCULOFLOW_KV, c.req.param('id'), {})
    if (!record) return c.json<Resp>({ success: false, error: 'No-show record not found' }, 404)
    const msg = await sendAppointmentReminder(c.env.OCULOFLOW_KV, {
      appointmentId: record.appointmentId, patientId: record.patientId,
      patientName: record.patientName, patientPhone: record.patientPhone,
      channel: 'SMS', messageType: 'NO_SHOW_FOLLOWUP', templateId: 'tpl-005',
      date: record.missedDate, time: 'your scheduled time', provider: record.providerName,
    })
    await updateNoShow(c.env.OCULOFLOW_KV, c.req.param('id'), { status: 'FOLLOWUP_SENT', followupMessageId: msg.id })
    return c.json<Resp>({ success: true, data: { message: msg, noShow: record }, message: 'Follow-up sent' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Campaigns ─────────────────────────────────────────────────────────────────
remindersRoutes.get('/campaigns', async (c) => {
  try {
    const campaigns = await listCampaigns(c.env.OCULOFLOW_KV)
    return c.json<Resp>({ success: true, data: campaigns })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

remindersRoutes.get('/campaigns/:id', async (c) => {
  try {
    const campaign = await getCampaign(c.env.OCULOFLOW_KV, c.req.param('id'))
    if (!campaign) return c.json<Resp>({ success: false, error: 'Campaign not found' }, 404)
    return c.json<Resp>({ success: true, data: campaign })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

remindersRoutes.post('/campaigns', async (c) => {
  try {
    const body = await c.req.json()
    const missing = ['name', 'channel', 'messageType', 'templateId', 'createdById', 'createdByName'].filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)
    const campaign = await createCampaign(c.env.OCULOFLOW_KV, {
      ...body,
      status: 'DRAFT', recipients: body.recipients ?? [],
      recipientCount: (body.recipients ?? []).length,
    })
    return c.json<Resp>({ success: true, data: campaign, message: 'Campaign created' }, 201)
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

remindersRoutes.patch('/campaigns/:id/status', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.status) return c.json<Resp>({ success: false, error: 'status required' }, 400)
    const campaign = await updateCampaignStatus(c.env.OCULOFLOW_KV, c.req.param('id'), body.status as CampaignStatus)
    if (!campaign) return c.json<Resp>({ success: false, error: 'Campaign not found' }, 404)
    return c.json<Resp>({ success: true, data: campaign, message: `Campaign ${body.status.toLowerCase()}` })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// Simulate sending a campaign (DRAFT → RUNNING → COMPLETED)
remindersRoutes.post('/campaigns/:id/launch', async (c) => {
  try {
    const campaign = await getCampaign(c.env.OCULOFLOW_KV, c.req.param('id'))
    if (!campaign) return c.json<Resp>({ success: false, error: 'Campaign not found' }, 404)
    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      return c.json<Resp>({ success: false, error: `Cannot launch campaign in ${campaign.status} status` }, 400)
    }
    // Mark running
    await updateCampaignStatus(c.env.OCULOFLOW_KV, c.req.param('id'), 'RUNNING')
    // Simulate sends for each recipient
    const tpl = await getTemplate(c.env.OCULOFLOW_KV, campaign.templateId)
    let sent = 0, delivered = 0
    for (const r of campaign.recipients) {
      const msg = await sendMessage(c.env.OCULOFLOW_KV, {
        patientId: r.patientId, patientName: r.patientName,
        patientPhone: r.patientPhone, channel: campaign.channel as CommChannel,
        messageType: campaign.messageType as MessageType, templateId: campaign.templateId,
        body: tpl ? fillTemplate(tpl.body, { patient_name: r.patientName, date: '', time: '', provider: '', location: '', reason: '' }) : `Campaign: ${campaign.name}`,
      })
      r.status   = msg.status as any
      r.messageId = msg.id
      sent++; if (msg.status === 'DELIVERED') delivered++
    }
    // Complete
    const { updateCampaignStatus: upd } = await import('../lib/reminders')
    const raw = await c.env.OCULOFLOW_KV.get(`comms:campaign:${c.req.param('id')}`)
    if (raw) {
      const cam = JSON.parse(raw)
      cam.status = 'COMPLETED'; cam.sentCount = sent; cam.deliveredCount = delivered
      cam.completedAt = new Date().toISOString(); cam.updatedAt = new Date().toISOString()
      await c.env.OCULOFLOW_KV.put(`comms:campaign:${c.req.param('id')}`, JSON.stringify(cam))
    }
    return c.json<Resp>({ success: true, data: { sent, delivered }, message: `Campaign launched: ${sent} sent, ${delivered} delivered` })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

function uid() { return `appt-${Date.now().toString(36)}` }

export default remindersRoutes
