// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 7B: Telehealth / Async Video Visit — Routes
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import {
  ensureTelehealthSeed,
  listVisits, getVisit, createVisit,
  updateVisitStatus, assignVisit,
  submitQuestionnaire, submitReview,
  addInfoRequest, respondToInfoRequest,
  addMessage, getTelehealthDashboard,
} from '../lib/telehealth'
import type { VisitStatus, VisitType, Urgency } from '../types/telehealth'

type Bindings = { OCULOFLOW_KV: KVNamespace }
type Resp     = { success: boolean; data?: unknown; message?: string; error?: string }

const telehealthRoutes = new Hono<{ Bindings: Bindings }>()

// ── Ping / seed ────────────────────────────────────────────────────────────────
telehealthRoutes.get('/ping', async (c) => {
  await ensureTelehealthSeed(c.env.OCULOFLOW_KV)
  return c.json<Resp>({ success: true, data: { status: 'ok', module: 'telehealth' } })
})

// ── Dashboard ─────────────────────────────────────────────────────────────────
telehealthRoutes.get('/dashboard', async (c) => {
  try {
    const data = await getTelehealthDashboard(c.env.OCULOFLOW_KV)
    return c.json<Resp>({ success: true, data })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Visit queue (list all, with optional filter) ───────────────────────────────
telehealthRoutes.get('/visits', async (c) => {
  try {
    const { filter, providerId } = c.req.query()
    const visits = await listVisits(c.env.OCULOFLOW_KV, filter, providerId)
    return c.json<Resp>({ success: true, data: visits })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Get single visit ──────────────────────────────────────────────────────────
telehealthRoutes.get('/visits/:id', async (c) => {
  try {
    const visit = await getVisit(c.env.OCULOFLOW_KV, c.req.param('id'))
    if (!visit) return c.json<Resp>({ success: false, error: 'Visit not found' }, 404)
    return c.json<Resp>({ success: true, data: visit })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Create new visit ──────────────────────────────────────────────────────────
telehealthRoutes.post('/visits', async (c) => {
  try {
    const body = await c.req.json()
    const missing = ['patientId', 'patientName', 'visitType', 'urgency', 'chiefComplaint'].filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)
    const visit = await createVisit(c.env.OCULOFLOW_KV, {
      ...body,
      status: 'INTAKE_PENDING' as VisitStatus,
    })
    return c.json<Resp>({ success: true, data: visit, message: 'Visit created' }, 201)
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Update visit status ────────────────────────────────────────────────────────
telehealthRoutes.patch('/visits/:id/status', async (c) => {
  try {
    const { status } = await c.req.json()
    const validStatuses: VisitStatus[] = ['INTAKE_PENDING','INTAKE_COMPLETE','UNDER_REVIEW','AWAITING_INFO','COMPLETED','CANCELLED']
    if (!validStatuses.includes(status)) return c.json<Resp>({ success: false, error: 'Invalid status' }, 400)
    const visit = await updateVisitStatus(c.env.OCULOFLOW_KV, c.req.param('id'), status)
    if (!visit) return c.json<Resp>({ success: false, error: 'Visit not found' }, 404)
    return c.json<Resp>({ success: true, data: visit, message: `Status updated to ${status}` })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Assign visit to provider ───────────────────────────────────────────────────
telehealthRoutes.patch('/visits/:id/assign', async (c) => {
  try {
    const { providerId, providerName } = await c.req.json()
    if (!providerId || !providerName) return c.json<Resp>({ success: false, error: 'Missing providerId or providerName' }, 400)
    const visit = await assignVisit(c.env.OCULOFLOW_KV, c.req.param('id'), providerId, providerName)
    if (!visit) return c.json<Resp>({ success: false, error: 'Visit not found' }, 404)
    return c.json<Resp>({ success: true, data: visit, message: `Assigned to ${providerName}` })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Submit pre-visit questionnaire ────────────────────────────────────────────
telehealthRoutes.post('/visits/:id/questionnaire', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.chiefComplaint) return c.json<Resp>({ success: false, error: 'chiefComplaint is required' }, 400)
    const visit = await submitQuestionnaire(c.env.OCULOFLOW_KV, c.req.param('id'), {
      chiefComplaint: body.chiefComplaint,
      symptomsOnset: body.symptomsOnset || '',
      symptomsSeverity: Number(body.symptomsSeverity) || 0,
      symptomsDescription: body.symptomsDescription || '',
      affectedEye: body.affectedEye || 'UNKNOWN',
      currentMedications: body.currentMedications || 'None',
      allergies: body.allergies || 'NKDA',
      recentEyeInjury: !!body.recentEyeInjury,
      visionChanges: !!body.visionChanges,
      lightSensitivity: !!body.lightSensitivity,
      floatersOrFlashes: !!body.floatersOrFlashes,
      painLevel: Number(body.painLevel) || 0,
      additionalNotes: body.additionalNotes || '',
      photoUrls: body.photoUrls || [],
      submittedAt: new Date().toISOString(),
      answers: body.answers || [],
    })
    if (!visit) return c.json<Resp>({ success: false, error: 'Visit not found' }, 404)
    return c.json<Resp>({ success: true, data: visit, message: 'Questionnaire submitted' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Submit provider review ────────────────────────────────────────────────────
telehealthRoutes.post('/visits/:id/review', async (c) => {
  try {
    const body = await c.req.json()
    const missing = ['providerId', 'providerName', 'clinicalFindings', 'assessment', 'plan', 'patientInstructions'].filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)
    const visit = await submitReview(c.env.OCULOFLOW_KV, c.req.param('id'), {
      providerId: body.providerId,
      providerName: body.providerName,
      reviewedAt: new Date().toISOString(),
      clinicalFindings: body.clinicalFindings,
      assessment: body.assessment,
      plan: body.plan,
      prescriptions: body.prescriptions || [],
      followUpRequired: !!body.followUpRequired,
      followUpInDays: body.followUpInDays,
      referralRequired: !!body.referralRequired,
      referralTo: body.referralTo,
      patientInstructions: body.patientInstructions,
      internalNotes: body.internalNotes || '',
    }, body.sign === true)
    if (!visit) return c.json<Resp>({ success: false, error: 'Visit not found' }, 404)
    return c.json<Resp>({ success: true, data: visit, message: body.sign ? 'Review signed & completed' : 'Review saved' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Add info request (provider → patient) ────────────────────────────────────
telehealthRoutes.post('/visits/:id/info-request', async (c) => {
  try {
    const { question, requestedBy } = await c.req.json()
    if (!question || !requestedBy) return c.json<Resp>({ success: false, error: 'question and requestedBy are required' }, 400)
    const visit = await addInfoRequest(c.env.OCULOFLOW_KV, c.req.param('id'), question, requestedBy)
    if (!visit) return c.json<Resp>({ success: false, error: 'Visit not found' }, 404)
    return c.json<Resp>({ success: true, data: visit, message: 'Info request sent to patient' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Respond to info request (patient → provider) ──────────────────────────────
telehealthRoutes.patch('/visits/:id/info-request/:irId', async (c) => {
  try {
    const { response } = await c.req.json()
    if (!response) return c.json<Resp>({ success: false, error: 'response is required' }, 400)
    const visit = await respondToInfoRequest(c.env.OCULOFLOW_KV, c.req.param('id'), c.req.param('irId'), response)
    if (!visit) return c.json<Resp>({ success: false, error: 'Visit or info request not found' }, 404)
    return c.json<Resp>({ success: true, data: visit, message: 'Response submitted' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Visit messages ────────────────────────────────────────────────────────────
telehealthRoutes.get('/visits/:id/messages', async (c) => {
  try {
    const visit = await getVisit(c.env.OCULOFLOW_KV, c.req.param('id'))
    if (!visit) return c.json<Resp>({ success: false, error: 'Visit not found' }, 404)
    return c.json<Resp>({ success: true, data: visit.messages })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

telehealthRoutes.post('/visits/:id/messages', async (c) => {
  try {
    const { senderId, senderName, senderRole, body: msgBody } = await c.req.json()
    if (!senderId || !senderName || !senderRole || !msgBody) {
      return c.json<Resp>({ success: false, error: 'senderId, senderName, senderRole, body are required' }, 400)
    }
    const visit = await addMessage(c.env.OCULOFLOW_KV, c.req.param('id'), senderId, senderName, senderRole, msgBody)
    if (!visit) return c.json<Resp>({ success: false, error: 'Visit not found' }, 404)
    return c.json<Resp>({ success: true, data: visit.messages[visit.messages.length - 1], message: 'Message sent' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

export default telehealthRoutes
