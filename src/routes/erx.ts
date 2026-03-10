// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 7C: E-Prescribing & PDMP — Routes
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import {
  ensureErxSeed,
  listPrescriptions, getPrescription, createPrescription, updateRxStatus, updatePrescription,
  searchFormulary, getDrugInteractionCheck,
  listPdmpReports, requestPdmpCheck,
  getPatientAllergies, addPatientAllergy,
  requestRefill, getErxDashboard,
  DRUG_FORMULARY, PHARMACIES, DRUG_MAP,
} from '../lib/erx'
import type { RxStatus } from '../types/erx'

type Bindings = { OCULOFLOW_KV: KVNamespace
  DB: D1Database }
type Resp     = { success: boolean; data?: unknown; message?: string; error?: string }

const erxRoutes = new Hono<{ Bindings: Bindings }>()

// ── Ping / seed ────────────────────────────────────────────────────────────────
erxRoutes.get('/ping', async (c) => {
  await ensureErxSeed(c.env.OCULOFLOW_KV, c.env.DB)
  return c.json<Resp>({ success: true, data: { status: 'ok', module: 'erx' } })
})

// ── Dashboard ─────────────────────────────────────────────────────────────────
erxRoutes.get('/dashboard', async (c) => {
  try {
    const data = await getErxDashboard(c.env.OCULOFLOW_KV, c.env.DB)
    return c.json<Resp>({ success: true, data })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Prescriptions ─────────────────────────────────────────────────────────────
erxRoutes.get('/prescriptions', async (c) => {
  try {
    const { patientId, status, providerId } = c.req.query()
    const data = await listPrescriptions(c.env.OCULOFLOW_KV, patientId, status, providerId, c.env.DB)
    return c.json<Resp>({ success: true, data })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

erxRoutes.get('/prescriptions/:id', async (c) => {
  try {
    const rx = await getPrescription(c.env.OCULOFLOW_KV, c.req.param('id'), c.env.DB)
    if (!rx) return c.json<Resp>({ success: false, error: 'Prescription not found' }, 404)
    return c.json<Resp>({ success: true, data: rx })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

erxRoutes.post('/prescriptions', async (c) => {
  try {
    const body = await c.req.json()
    const missing = ['patientId', 'drugId', 'providerId'].filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)
    if (!DRUG_MAP[body.drugId]) return c.json<Resp>({ success: false, error: `Unknown drugId: ${body.drugId}` }, 400)
    const rx = await createPrescription(c.env.OCULOFLOW_KV, body, c.env.DB)
    return c.json<Resp>({ success: true, data: rx, message: 'Prescription created' }, 201)
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

erxRoutes.patch('/prescriptions/:id', async (c) => {
  try {
    const body = await c.req.json()
    const rx = await updatePrescription(c.env.OCULOFLOW_KV, c.req.param('id'), body, c.env.DB)
    if (!rx) return c.json<Resp>({ success: false, error: 'Prescription not found' }, 404)
    return c.json<Resp>({ success: true, data: rx, message: 'Prescription updated' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Rx Status Transitions ──────────────────────────────────────────────────────
erxRoutes.patch('/prescriptions/:id/status', async (c) => {
  try {
    const { status, note } = await c.req.json()
    const valid: RxStatus[] = ['DRAFT','PENDING_REVIEW','SIGNED','SENT','FILLED','CANCELLED','EXPIRED','DENIED']
    if (!valid.includes(status)) return c.json<Resp>({ success: false, error: `Invalid status: ${status}` }, 400)
    const rx = await updateRxStatus(c.env.OCULOFLOW_KV, c.req.param('id'), status, note, c.env.DB)
    if (!rx) return c.json<Resp>({ success: false, error: 'Prescription not found' }, 404)
    return c.json<Resp>({ success: true, data: rx, message: `Status updated to ${status}` })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Sign & Send ────────────────────────────────────────────────────────────────
erxRoutes.post('/prescriptions/:id/sign', async (c) => {
  try {
    const { pharmacyId } = await c.req.json().catch(() => ({}))
    let rx = await updateRxStatus(c.env.OCULOFLOW_KV, c.req.param('id'), 'SIGNED', c.env.DB)
    if (!rx) return c.json<Resp>({ success: false, error: 'Prescription not found' }, 404)
    if (pharmacyId) {
      rx = await updateRxStatus(c.env.OCULOFLOW_KV, c.req.param('id'), 'SENT', c.env.DB) || rx
    }
    return c.json<Resp>({ success: true, data: rx, message: pharmacyId ? 'Signed and sent to pharmacy' : 'Prescription signed' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Refill Request ─────────────────────────────────────────────────────────────
erxRoutes.post('/prescriptions/:id/refill', async (c) => {
  try {
    const { pharmacyId, pharmacyName } = await c.req.json()
    if (!pharmacyId) return c.json<Resp>({ success: false, error: 'pharmacyId is required' }, 400)
    const result = await requestRefill(c.env.OCULOFLOW_KV, c.req.param('id'), pharmacyId, pharmacyName, c.env.DB)
    if (!result) return c.json<Resp>({ success: false, error: 'Prescription not found' }, 404)
    return c.json<Resp>({ success: true, data: result, message: 'Refill request created' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Drug Formulary ────────────────────────────────────────────────────────────
erxRoutes.get('/formulary', (c) => {
  const { q, category } = c.req.query()
  const results = searchFormulary(q || '', category)
  return c.json<Resp>({ success: true, data: results })
})

erxRoutes.get('/formulary/:id', (c) => {
  const drug = DRUG_MAP[c.req.param('id')]
  if (!drug) return c.json<Resp>({ success: false, error: 'Drug not found' }, 404)
  return c.json<Resp>({ success: true, data: drug })
})

erxRoutes.get('/formulary/categories/list', (c) => {
  const cats = [...new Set(DRUG_FORMULARY.map(d => d.category))].sort()
  return c.json<Resp>({ success: true, data: cats })
})

// ── Drug Interaction Check ─────────────────────────────────────────────────────
erxRoutes.post('/interactions/check', (c) => {
  try {
    const body = c.req.raw.body
    // Parse synchronously from the raw request
    return c.req.json().then(data => {
      const { drugId, currentDrugIds } = data
      if (!drugId) return c.json<Resp>({ success: false, error: 'drugId is required' }, 400)
      const interactions = getDrugInteractionCheck(drugId, currentDrugIds || [])
      return c.json<Resp>({ success: true, data: { drugId, interactions, count: interactions.length } })
    })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Pharmacies ────────────────────────────────────────────────────────────────
erxRoutes.get('/pharmacies', (c) => {
  const { type, controlled } = c.req.query()
  let list = PHARMACIES
  if (type)       list = list.filter(p => p.type === type.toUpperCase())
  if (controlled === 'true') list = list.filter(p => p.acceptsControlled)
  return c.json<Resp>({ success: true, data: list })
})

erxRoutes.get('/pharmacies/:id', (c) => {
  const p = PHARMACIES.find(x => x.id === c.req.param('id'))
  if (!p) return c.json<Resp>({ success: false, error: 'Pharmacy not found' }, 404)
  return c.json<Resp>({ success: true, data: p })
})

// ── PDMP ──────────────────────────────────────────────────────────────────────
erxRoutes.get('/pdmp', async (c) => {
  try {
    const { patientId } = c.req.query()
    const data = await listPdmpReports(c.env.OCULOFLOW_KV, patientId, c.env.DB)
    return c.json<Resp>({ success: true, data })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

erxRoutes.post('/pdmp/check', async (c) => {
  try {
    const { patientId, patientName, requestedBy } = await c.req.json()
    if (!patientId || !patientName || !requestedBy) {
      return c.json<Resp>({ success: false, error: 'patientId, patientName, requestedBy are required' }, 400)
    }
    const report = await requestPdmpCheck(c.env.OCULOFLOW_KV, patientId, patientName, requestedBy, c.env.DB)
    return c.json<Resp>({ success: true, data: report, message: 'PDMP check complete' })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

// ── Allergies ─────────────────────────────────────────────────────────────────
erxRoutes.get('/allergies/:patientId', async (c) => {
  try {
    const data = await getPatientAllergies(c.env.OCULOFLOW_KV, c.req.param('patientId'), c.env.DB)
    return c.json<Resp>({ success: true, data })
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

erxRoutes.post('/allergies/:patientId', async (c) => {
  try {
    const body = await c.req.json()
    const missing = ['allergen', 'allergenType', 'reaction', 'severity', 'recordedBy'].filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)
    const allergy = await addPatientAllergy(c.env.OCULOFLOW_KV, c.req.param('patientId'), { ...body, isActive: true }, c.env.DB)
    return c.json<Resp>({ success: true, data: allergy, message: 'Allergy added' }, 201)
  } catch (err) { return c.json<Resp>({ success: false, error: String(err) }, 500) }
})

export default erxRoutes
