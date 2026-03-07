// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — KV Session Store (Cloudflare KV)
// ─────────────────────────────────────────────────────────────────────────────

import type { IntakeSession, IntakeStep } from '../types/intake'

const SESSION_TTL_SECONDS = 60 * 60 * 2 // 2 hours

/**
 * Creates a new intake session in KV
 */
export async function createSession(
  kv: KVNamespace,
  sessionToken: string,
  appointmentId: string,
  phone: string
): Promise<IntakeSession> {
  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000)

  const session: IntakeSession = {
    sessionToken,
    appointmentId,
    phone,
    step: 'VERIFY_IDENTITY',
    otpVerified: false,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  }

  await kv.put(
    `session:${sessionToken}`,
    JSON.stringify(session),
    { expirationTtl: SESSION_TTL_SECONDS }
  )

  return session
}

/**
 * Reads a session from KV
 */
export async function getSession(
  kv: KVNamespace,
  sessionToken: string
): Promise<IntakeSession | null> {
  const raw = await kv.get(`session:${sessionToken}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as IntakeSession
  } catch {
    return null
  }
}

/**
 * Updates a session in KV
 */
export async function updateSession(
  kv: KVNamespace,
  sessionToken: string,
  updates: Partial<IntakeSession>
): Promise<IntakeSession | null> {
  const session = await getSession(kv, sessionToken)
  if (!session) return null

  const updated: IntakeSession = { ...session, ...updates }
  const remaining = Math.floor(
    (new Date(session.expiresAt).getTime() - Date.now()) / 1000
  )

  if (remaining <= 0) return null

  await kv.put(
    `session:${sessionToken}`,
    JSON.stringify(updated),
    { expirationTtl: remaining }
  )
  return updated
}

/**
 * Advances a session to the next step
 */
export async function advanceStep(
  kv: KVNamespace,
  sessionToken: string,
  nextStep: IntakeStep
): Promise<IntakeSession | null> {
  return updateSession(kv, sessionToken, { step: nextStep })
}

/**
 * Deletes a session from KV
 */
export async function deleteSession(
  kv: KVNamespace,
  sessionToken: string
): Promise<void> {
  await kv.delete(`session:${sessionToken}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP Helpers
// ─────────────────────────────────────────────────────────────────────────────

const OTP_TTL_SECONDS = 60 * 10 // 10 minutes

/**
 * Generates a 6-digit OTP and stores it in KV
 */
export async function generateOtp(
  kv: KVNamespace,
  phone: string
): Promise<string> {
  const otp = Math.floor(100000 + Math.random() * 900000).toString()
  await kv.put(
    `otp:${phone}`,
    JSON.stringify({ otp, attempts: 0 }),
    { expirationTtl: OTP_TTL_SECONDS }
  )
  return otp
}

/**
 * Verifies an OTP and enforces max 3 attempts
 */
export async function verifyOtp(
  kv: KVNamespace,
  phone: string,
  inputOtp: string
): Promise<{ valid: boolean; reason?: string }> {
  const raw = await kv.get(`otp:${phone}`)
  if (!raw) return { valid: false, reason: 'Code expired. Please request a new one.' }

  const { otp, attempts } = JSON.parse(raw) as { otp: string; attempts: number }

  if (attempts >= 3) {
    await kv.delete(`otp:${phone}`)
    return { valid: false, reason: 'Too many attempts. Please request a new code.' }
  }

  if (inputOtp !== otp) {
    await kv.put(
      `otp:${phone}`,
      JSON.stringify({ otp, attempts: attempts + 1 }),
      { expirationTtl: OTP_TTL_SECONDS }
    )
    return { valid: false, reason: `Incorrect code. ${2 - attempts} attempt(s) remaining.` }
  }

  await kv.delete(`otp:${phone}`)
  return { valid: true }
}
