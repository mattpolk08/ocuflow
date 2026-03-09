// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Billing & Claims Routes  (Phase 2A)
// src/routes/billing.ts
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import type { ApiResponse } from '../types/patient'
import {
  ensureBillingSeed,
  listSuperbills,
  getSuperbill,
  getPatientSuperbills,
  createSuperbill,
  updateSuperbillItems,
  advanceSuperbillStatus,
  recordPayment,
  getArSummary,
  searchCptCodes,
  buildLineItems,
} from '../lib/billing'
import { CPT_CODES, SuperbillStatus } from '../types/billing'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  DB: D1Database
  DEMO_MODE: string
}

const billing = new Hono<{ Bindings: Bindings }>()

// ── GET /api/billing/superbills ───────────────────────────────────────────────
// List all superbills (summary view)
billing.get('/superbills', async (c) => {
  try {
    const summaries = await listSuperbills(c.env.OCULOFLOW_KV, c.env.DB)
    const status    = c.req.query('status')
    const filtered  = status
      ? summaries.filter(s => s.status === status.toUpperCase())
      : summaries
    return c.json<ApiResponse<typeof filtered>>({ success: true, data: filtered })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/billing/superbills/:id ──────────────────────────────────────────
billing.get('/superbills/:id', async (c) => {
  try {
    await ensureBillingSeed(c.env.OCULOFLOW_KV, c.env.DB)
    const sb = await getSuperbill(c.env.OCULOFLOW_KV, c.env.DB, c.req.param('id'))
    if (!sb) return c.json<ApiResponse<null>>({ success: false, error: 'Superbill not found' }, 404)
    return c.json<ApiResponse<typeof sb>>({ success: true, data: sb })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/billing/patient/:patientId ──────────────────────────────────────
billing.get('/patient/:patientId', async (c) => {
  try {
    const sbs = await getPatientSuperbills(c.env.OCULOFLOW_KV, c.env.DB, c.req.param('patientId'))
    return c.json<ApiResponse<typeof sbs>>({ success: true, data: sbs })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── POST /api/billing/superbills ─────────────────────────────────────────────
// Create a new superbill (usually triggered from exam or appointment)
billing.post('/superbills', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.patientId || !body.serviceDate || !body.providerId) {
      return c.json<ApiResponse<null>>(
        { success: false, error: 'patientId, serviceDate, and providerId are required' }, 400
      )
    }
    const sb = await createSuperbill(c.env.OCULOFLOW_KV, c.env.DB, body)
    return c.json<ApiResponse<typeof sb>>({ success: true, data: sb }, 201)
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── PUT /api/billing/superbills/:id/items ────────────────────────────────────
// Update line items + diagnoses on a draft/pending superbill
billing.put('/superbills/:id/items', async (c) => {
  try {
    const body = await c.req.json()
    const { lineItems, diagnoses } = body
    if (!lineItems || !diagnoses) {
      return c.json<ApiResponse<null>>({ success: false, error: 'lineItems and diagnoses required' }, 400)
    }
    const sb = await updateSuperbillItems(c.env.OCULOFLOW_KV, c.env.DB, c.req.param('id'), lineItems, diagnoses)
    if (!sb) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Superbill not found or locked' }, 404)
    }
    return c.json<ApiResponse<typeof sb>>({ success: true, data: sb })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── POST /api/billing/superbills/:id/status ──────────────────────────────────
// Advance superbill through workflow
billing.post('/superbills/:id/status', async (c) => {
  try {
    const body   = await c.req.json().catch(() => ({}))
    const status = body.status as SuperbillStatus | undefined
    const sb     = await advanceSuperbillStatus(c.env.OCULOFLOW_KV, c.env.DB, c.req.param('id'), status)
    if (!sb) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Cannot advance status' }, 400)
    }
    return c.json<ApiResponse<typeof sb>>({ success: true, data: sb })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── POST /api/billing/superbills/:id/payment ─────────────────────────────────
// Record a payment against a superbill
billing.post('/superbills/:id/payment', async (c) => {
  try {
    const body = await c.req.json()
    const { amount, method, paidBy, reference, notes } = body
    if (!amount || !method || !paidBy) {
      return c.json<ApiResponse<null>>({ success: false, error: 'amount, method, and paidBy required' }, 400)
    }
    const pmt = await recordPayment(
      c.env.OCULOFLOW_KV,
      c.req.param('id'),
      parseFloat(amount),
      method,
      paidBy,
      reference,
      notes,
    )
    if (!pmt) {
      return c.json<ApiResponse<null>>({ success: false, error: 'Superbill not found' }, 404)
    }
    return c.json<ApiResponse<typeof pmt>>({ success: true, data: pmt }, 201)
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/billing/ar ───────────────────────────────────────────────────────
// Accounts-receivable summary dashboard data
billing.get('/ar', async (c) => {
  try {
    const summary = await getArSummary(c.env.OCULOFLOW_KV, c.env.DB)
    return c.json<ApiResponse<typeof summary>>({ success: true, data: summary })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

// ── GET /api/billing/cpt ─────────────────────────────────────────────────────
// Full CPT code catalog
billing.get('/cpt', async (c) => {
  return c.json<ApiResponse<typeof CPT_CODES>>({ success: true, data: CPT_CODES })
})

// ── GET /api/billing/cpt/search?q= ───────────────────────────────────────────
// Search CPT codes by code or description
billing.get('/cpt/search', async (c) => {
  const q = c.req.query('q') ?? ''
  if (q.length < 2) {
    return c.json<ApiResponse<null>>({ success: false, error: 'Query must be at least 2 characters' }, 400)
  }
  const results = searchCptCodes(q)
  return c.json<ApiResponse<typeof results>>({ success: true, data: results })
})

// ── POST /api/billing/cpt/suggest ────────────────────────────────────────────
// Suggest CPT codes + pre-built line items for given exam type + diagnoses
billing.post('/cpt/suggest', async (c) => {
  try {
    const { examType = 'COMPREHENSIVE', icd10Codes = [] } = await c.req.json()
    const { suggestCptCodes } = await import('../lib/billing')
    const codes     = suggestCptCodes(examType)
    const lineItems = buildLineItems(codes, icd10Codes)
    return c.json<ApiResponse<{ suggestedCptCodes: string[]; lineItems: typeof lineItems }>>({
      success: true,
      data: { suggestedCptCodes: codes, lineItems },
    })
  } catch (e: any) {
    return c.json<ApiResponse<null>>({ success: false, error: e.message }, 500)
  }
})

export default billing
