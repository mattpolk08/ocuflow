// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Intake Routes
// POST /api/intake/start          — init session from appointment token
// POST /api/intake/demographics   — save step 2
// POST /api/intake/insurance      — save step 3
// POST /api/intake/ocr            — process insurance card image
// POST /api/intake/medical-history — save step 4
// POST /api/intake/consents       — save step 5 (final submit)
// GET  /api/intake/session        — read current session state
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import {
  createSession,
  getSession,
  updateSession,
  advanceStep,
} from '../lib/session'
import { extractInsuranceOcr, validateImageSize } from '../lib/ocr'
import type {
  ApiResponse,
  PatientDemographics,
  InsuranceData,
  MedicalHistoryData,
  ConsentData,
  IntakeSession,
} from '../types/intake'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  OPENAI_API_KEY: string
  DEMO_MODE: string
}

const intakeRoutes = new Hono<{ Bindings: Bindings }>()

// ── Middleware: require valid session ─────────────────────────────────────
async function requireSession(kv: KVNamespace, token: string | null) {
  if (!token) return null
  return getSession(kv, token)
}

// ── POST /api/intake/start ────────────────────────────────────────────────
// Called when patient taps the link from their SMS
intakeRoutes.post('/start', async (c) => {
  const body = await c.req.json<{ appointmentToken: string; phone: string }>()
  const { appointmentToken, phone } = body

  if (!appointmentToken || !phone) {
    return c.json<ApiResponse>({ success: false, error: 'Missing appointment token or phone' }, 400)
  }

  // In a real system: validate appointmentToken against DB
  // For now: treat appointmentToken as appointmentId
  const sessionToken = crypto.randomUUID()

  const session = await createSession(
    c.env.OCULOFLOW_KV,
    sessionToken,
    appointmentToken,
    phone
  )

  return c.json<ApiResponse<{ sessionToken: string; step: string }>>({
    success: true,
    data: { sessionToken: session.sessionToken, step: session.step },
  })
})

// ── GET /api/intake/session ───────────────────────────────────────────────
intakeRoutes.get('/session', async (c) => {
  const token = c.req.query('token')
  const session = await requireSession(c.env.OCULOFLOW_KV, token ?? null)

  if (!session) {
    return c.json<ApiResponse>({ success: false, error: 'Invalid or expired session' }, 401)
  }

  // Don't expose the full session — only what the frontend needs
  return c.json<ApiResponse<Partial<IntakeSession>>>({
    success: true,
    data: {
      step: session.step,
      otpVerified: session.otpVerified,
      demographics: session.demographics,
      insurance: session.insurance
        ? { ...session.insurance, cardFrontDataUrl: undefined, cardBackDataUrl: undefined }
        : undefined,
      medicalHistory: session.medicalHistory,
    },
  })
})

// ── POST /api/intake/demographics ─────────────────────────────────────────
intakeRoutes.post('/demographics', async (c) => {
  const body = await c.req.json<{ sessionToken: string; data: PatientDemographics }>()
  const { sessionToken, data } = body

  const session = await requireSession(c.env.OCULOFLOW_KV, sessionToken)
  if (!session || !session.otpVerified) {
    return c.json<ApiResponse>({ success: false, error: 'Unauthorized' }, 401)
  }

  // Basic validation
  if (!data.firstName || !data.lastName || !data.dateOfBirth) {
    return c.json<ApiResponse>({ success: false, error: 'Required fields missing' }, 400)
  }

  await updateSession(c.env.OCULOFLOW_KV, sessionToken, {
    demographics: data,
    step: 'INSURANCE',
  })

  return c.json<ApiResponse>({ success: true, message: 'Demographics saved' })
})

// ── POST /api/intake/ocr ──────────────────────────────────────────────────
// Receives a base64 image, returns extracted insurance fields
intakeRoutes.post('/ocr', async (c) => {
  const body = await c.req.json<{ sessionToken: string; imageDataUrl: string }>()
  const { sessionToken, imageDataUrl } = body

  const session = await requireSession(c.env.OCULOFLOW_KV, sessionToken)
  if (!session || !session.otpVerified) {
    return c.json<ApiResponse>({ success: false, error: 'Unauthorized' }, 401)
  }

  // Size check
  const sizeCheck = validateImageSize(imageDataUrl)
  if (!sizeCheck.valid) {
    return c.json<ApiResponse>({ success: false, error: sizeCheck.error }, 400)
  }

  // Demo mode: return fake OCR data
  if (c.env.DEMO_MODE === 'true') {
    return c.json<ApiResponse>({
      success: true,
      data: {
        memberId: 'W123456789',
        groupNumber: '8675309',
        payerName: 'Aetna',
        subscriberName: 'JOHN A DOE',
        planName: 'Aetna Choice POS II',
        confidence: 94,
        success: true,
      },
    })
  }

  if (!c.env.OPENAI_API_KEY) {
    return c.json<ApiResponse>({ success: false, error: 'OCR service not configured' }, 500)
  }

  const ocrResult = await extractInsuranceOcr(imageDataUrl, c.env.OPENAI_API_KEY)
  return c.json<ApiResponse>({ success: true, data: ocrResult })
})

// ── POST /api/intake/insurance ────────────────────────────────────────────
intakeRoutes.post('/insurance', async (c) => {
  const body = await c.req.json<{ sessionToken: string; data: InsuranceData }>()
  const { sessionToken, data } = body

  const session = await requireSession(c.env.OCULOFLOW_KV, sessionToken)
  if (!session || !session.otpVerified) {
    return c.json<ApiResponse>({ success: false, error: 'Unauthorized' }, 401)
  }

  if (!data.memberId || !data.payerName) {
    return c.json<ApiResponse>({ success: false, error: 'Member ID and payer name required' }, 400)
  }

  await updateSession(c.env.OCULOFLOW_KV, sessionToken, {
    insurance: data,
    step: 'MEDICAL_HISTORY',
  })

  return c.json<ApiResponse>({ success: true, message: 'Insurance saved' })
})

// ── POST /api/intake/medical-history ──────────────────────────────────────
intakeRoutes.post('/medical-history', async (c) => {
  const body = await c.req.json<{ sessionToken: string; data: MedicalHistoryData }>()
  const { sessionToken, data } = body

  const session = await requireSession(c.env.OCULOFLOW_KV, sessionToken)
  if (!session || !session.otpVerified) {
    return c.json<ApiResponse>({ success: false, error: 'Unauthorized' }, 401)
  }

  await updateSession(c.env.OCULOFLOW_KV, sessionToken, {
    medicalHistory: data,
    step: 'CONSENTS',
  })

  return c.json<ApiResponse>({ success: true, message: 'Medical history saved' })
})

// ── POST /api/intake/consents ─────────────────────────────────────────────
// Final step — saves signed consents and marks intake complete
intakeRoutes.post('/consents', async (c) => {
  const body = await c.req.json<{ sessionToken: string; data: ConsentData }>()
  const { sessionToken, data } = body

  const session = await requireSession(c.env.OCULOFLOW_KV, sessionToken)
  if (!session || !session.otpVerified) {
    return c.json<ApiResponse>({ success: false, error: 'Unauthorized' }, 401)
  }

  if (!data.hipaaAcknowledged || !data.treatmentConsent || !data.financialResponsibility) {
    return c.json<ApiResponse>({
      success: false,
      error: 'Required consents must be acknowledged',
    }, 400)
  }

  if (!data.signatureDataUrl) {
    return c.json<ApiResponse>({ success: false, error: 'Signature is required' }, 400)
  }

  await updateSession(c.env.OCULOFLOW_KV, sessionToken, {
    consents: { ...data, signedAt: new Date().toISOString() },
    step: 'COMPLETE',
  })

  // In production: persist full intake to DB, notify front desk, etc.

  return c.json<ApiResponse>({
    success: true,
    message: 'Intake complete! See you at your appointment.',
  })
})

export default intakeRoutes
