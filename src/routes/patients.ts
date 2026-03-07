// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Patients API Routes (Phase 1B)
// GET  /api/patients            — list / search
// GET  /api/patients/:id        — get single patient
// POST /api/patients            — create patient
// PUT  /api/patients/:id        — update patient
// POST /api/patients/:id/insurance        — add insurance plan
// POST /api/patients/:id/verify-eligibility — run eligibility check
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import {
  searchPatients,
  listPatients,
  getPatient,
  createPatient,
  updatePatient,
  upsertInsurancePlan,
  ensureSeedData,
} from '../lib/patients'
import { checkEligibility } from '../lib/eligibility'
import type { ApiResponse } from '../types/intake'
import type { PatientCreateInput } from '../types/patient'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  DEMO_MODE: string
  ELIGIBILITY_API_KEY: string
}

const patientRoutes = new Hono<{ Bindings: Bindings }>()

// ── GET /api/patients ─────────────────────────────────────────────────────────
patientRoutes.get('/', async (c) => {
  const q       = c.req.query('q')
  const page    = parseInt(c.req.query('page') || '1', 10)
  const limit   = parseInt(c.req.query('limit') || '25', 10)

  try {
    await ensureSeedData(c.env.OCULOFLOW_KV)

    if (q && q.trim().length >= 2) {
      const results = await searchPatients(c.env.OCULOFLOW_KV, q, limit)
      return c.json<ApiResponse>({ success: true, data: { patients: results, total: results.length, query: q } })
    }

    const data = await listPatients(c.env.OCULOFLOW_KV, page, limit)
    return c.json<ApiResponse>({ success: true, data: { ...data, page, limit } })
  } catch (err) {
    console.error('List patients error:', err)
    return c.json<ApiResponse>({ success: false, error: 'Could not load patients' }, 500)
  }
})

// ── GET /api/patients/:id ─────────────────────────────────────────────────────
patientRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  try {
    await ensureSeedData(c.env.OCULOFLOW_KV)
    const patient = await getPatient(c.env.OCULOFLOW_KV, id)
    if (!patient) return c.json<ApiResponse>({ success: false, error: 'Patient not found' }, 404)
    return c.json<ApiResponse>({ success: true, data: patient })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not load patient' }, 500)
  }
})

// ── POST /api/patients ────────────────────────────────────────────────────────
patientRoutes.post('/', async (c) => {
  const body = await c.req.json<PatientCreateInput>()

  if (!body.firstName || !body.lastName || !body.dateOfBirth) {
    return c.json<ApiResponse>({
      success: false,
      error: 'First name, last name, and date of birth are required',
    }, 400)
  }

  try {
    const patient = await createPatient(c.env.OCULOFLOW_KV, body)
    return c.json<ApiResponse>({ success: true, data: patient, message: `Patient ${patient.mrn} created` }, 201)
  } catch (err) {
    console.error('Create patient error:', err)
    return c.json<ApiResponse>({ success: false, error: 'Could not create patient' }, 500)
  }
})

// ── PUT /api/patients/:id ─────────────────────────────────────────────────────
patientRoutes.put('/:id', async (c) => {
  const id      = c.req.param('id')
  const updates = await c.req.json()

  // Guard: disallow overwriting certain fields
  delete updates.id
  delete updates.mrn
  delete updates.organizationId
  delete updates.createdAt

  try {
    const updated = await updatePatient(c.env.OCULOFLOW_KV, id, updates)
    if (!updated) return c.json<ApiResponse>({ success: false, error: 'Patient not found' }, 404)
    return c.json<ApiResponse>({ success: true, data: updated, message: 'Patient updated' })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not update patient' }, 500)
  }
})

// ── POST /api/patients/:id/insurance ─────────────────────────────────────────
patientRoutes.post('/:id/insurance', async (c) => {
  const patientId = c.req.param('id')
  const plan      = await c.req.json()

  if (!plan.memberId || !plan.payerName) {
    return c.json<ApiResponse>({ success: false, error: 'Member ID and payer name required' }, 400)
  }

  try {
    const updated = await upsertInsurancePlan(c.env.OCULOFLOW_KV, patientId, plan)
    if (!updated) return c.json<ApiResponse>({ success: false, error: 'Patient not found' }, 404)
    return c.json<ApiResponse>({ success: true, data: updated, message: 'Insurance plan saved' })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not save insurance' }, 500)
  }
})

// ── POST /api/patients/:id/verify-eligibility ──────────────────────────────
patientRoutes.post('/:id/verify-eligibility', async (c) => {
  const patientId = c.req.param('id')
  const body      = await c.req.json<{ insurancePlanId: string; providerNpi?: string }>()

  try {
    const patient = await getPatient(c.env.OCULOFLOW_KV, patientId)
    if (!patient) return c.json<ApiResponse>({ success: false, error: 'Patient not found' }, 404)

    const plan = patient.insurancePlans.find(p => p.id === body.insurancePlanId)
    if (!plan) return c.json<ApiResponse>({ success: false, error: 'Insurance plan not found' }, 404)

    const isDemoMode = c.env.DEMO_MODE === 'true'
    const result = await checkEligibility(
      {
        payerId:        plan.payerId,
        payerName:      plan.payerName,
        memberId:       plan.memberId,
        subscriberName: plan.subscriberName || patient.firstName + ' ' + patient.lastName,
        subscriberDob:  plan.subscriberDob || patient.dateOfBirth,
        providerNpi:    body.providerNpi || '1234567890',
        serviceDate:    new Date().toISOString().split('T')[0],
        serviceTypeCode: '98',
      },
      c.env.ELIGIBILITY_API_KEY,
      isDemoMode
    )

    // Persist updated eligibility status
    const updatedPlans = patient.insurancePlans.map(p =>
      p.id === plan.id
        ? {
            ...p,
            eligibilityStatus:    result.status,
            eligibilityCheckedAt: result.checkedAt,
            eligibilityDetails:   result.details,
          }
        : p
    )

    await updatePatient(c.env.OCULOFLOW_KV, patientId, { insurancePlans: updatedPlans })

    return c.json<ApiResponse>({
      success: true,
      data: {
        status:     result.status,
        details:    result.details,
        checkedAt:  result.checkedAt,
        planId:     plan.id,
        payerName:  plan.payerName,
      },
    })
  } catch (err) {
    console.error('Eligibility check error:', err)
    return c.json<ApiResponse>({ success: false, error: 'Eligibility check failed' }, 500)
  }
})

export default patientRoutes
