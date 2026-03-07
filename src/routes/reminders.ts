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

type Bindings = { OCULOFLOW_KV: KVNamespace }
type Resp     = { success: boolean; data?: unknown; message?: string; error?: string }

const remindersRoutes = new Hono<{ Bindings: Bindings }>()

// ── Seed / ping ────────────────────────────────────────────────────────────────
remindersRoutes.get('/ping', async (c) => {
  await ensureCommsSeed(c.env.OCULOFLOW_KV)
  return c.json<Resp>({ success: true, data: { status: 'ok', module: 'reminders' } })
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
    const msg = await sendMessage(c.env.OCULOFLOW_KV, body)
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
