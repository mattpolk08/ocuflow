// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Auth Routes (OTP Send / Verify)
// POST /api/auth/send-otp
// POST /api/auth/verify-otp
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import { generateOtp, verifyOtp, getSession, updateSession } from '../lib/session'
import { sendSms, formatOtpMessage, normalizePhone } from '../lib/sms'
import type { ApiResponse } from '../types/intake'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  TWILIO_ACCOUNT_SID: string
  TWILIO_AUTH_TOKEN: string
  TWILIO_FROM_NUMBER: string
  PRACTICE_NAME: string
  DEMO_MODE: string
}

const authRoutes = new Hono<{ Bindings: Bindings }>()

// ── POST /api/auth/send-otp ────────────────────────────────────────────────
authRoutes.post('/send-otp', async (c) => {
  const body = await c.req.json<{ phone: string; sessionToken: string }>()
  const { phone, sessionToken } = body

  if (!phone || !sessionToken) {
    return c.json<ApiResponse>({ success: false, error: 'Missing phone or session token' }, 400)
  }

  // Validate session exists
  const session = await getSession(c.env.OCULOFLOW_KV, sessionToken)
  if (!session) {
    return c.json<ApiResponse>({ success: false, error: 'Invalid or expired session' }, 401)
  }

  const normalized = normalizePhone(phone)
  const otp = await generateOtp(c.env.OCULOFLOW_KV, normalized)

  // In demo mode, skip SMS and return OTP in response (dev only)
  if (c.env.DEMO_MODE === 'true') {
    return c.json<ApiResponse<{ maskedPhone: string; demoOtp?: string }>>({
      success: true,
      message: 'OTP sent (demo mode)',
      data: {
        maskedPhone: normalized.slice(-4),
        demoOtp: otp,  // Only exposed in demo
      },
    })
  }

  const practiceName = c.env.PRACTICE_NAME ?? 'OculoFlow Eye Care'
  const smsResult = await sendSms(
    normalized,
    formatOtpMessage(otp, practiceName),
    c.env.TWILIO_ACCOUNT_SID,
    c.env.TWILIO_AUTH_TOKEN,
    c.env.TWILIO_FROM_NUMBER
  )

  if (!smsResult.success) {
    return c.json<ApiResponse>({ success: false, error: 'Could not send SMS. Please try again.' }, 500)
  }

  return c.json<ApiResponse<{ maskedPhone: string }>>({
    success: true,
    message: 'Verification code sent',
    data: { maskedPhone: normalized.slice(-4) },
  })
})

// ── POST /api/auth/verify-otp ──────────────────────────────────────────────
authRoutes.post('/verify-otp', async (c) => {
  const body = await c.req.json<{ phone: string; otp: string; sessionToken: string }>()
  const { phone, otp, sessionToken } = body

  if (!phone || !otp || !sessionToken) {
    return c.json<ApiResponse>({ success: false, error: 'Missing required fields' }, 400)
  }

  const session = await getSession(c.env.OCULOFLOW_KV, sessionToken)
  if (!session) {
    return c.json<ApiResponse>({ success: false, error: 'Invalid or expired session' }, 401)
  }

  const normalized = normalizePhone(phone)
  const result = await verifyOtp(c.env.OCULOFLOW_KV, normalized, otp)

  if (!result.valid) {
    return c.json<ApiResponse>({ success: false, error: result.reason }, 401)
  }

  // Mark session as OTP-verified and advance to demographics
  await updateSession(c.env.OCULOFLOW_KV, sessionToken, {
    otpVerified: true,
    phone: normalized,
    step: 'DEMOGRAPHICS',
  })

  return c.json<ApiResponse>({
    success: true,
    message: 'Identity verified',
  })
})

export default authRoutes
