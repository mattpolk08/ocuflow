// Phase A4 — MFA Routes
// POST /api/mfa/enroll/begin       — generate TOTP secret + QR URI (auth required)
// POST /api/mfa/enroll/confirm     — confirm with first TOTP code → activate
// GET  /api/mfa/status             — current MFA status for caller
// POST /api/mfa/verify             — verify TOTP during login (mfaToken challenge)
// POST /api/mfa/trusted-device     — register trusted device after successful MFA
// DELETE /api/mfa/trusted-device   — revoke a trusted device
// DELETE /api/mfa/disable          — disable MFA (ADMIN or self)
// POST /api/mfa/recovery/regenerate — generate new recovery codes (TOTP required)

import { Hono } from 'hono'
import {
  beginMfaEnrollment, confirmMfaEnrollment, getMfaStatus,
  verifyMfaCode, disableMfa, isMfaEnabled, totpUri,
  createTrustedDevice, revokeTrustedDevice, verifyTrustedDevice,
  createMfaChallenge, resolveMfaChallenge, generateRecoveryCodes,
} from '../lib/mfa'
import { requireAuth, requireRole } from '../middleware/auth'
import { writeAudit } from '../lib/audit'
import { getUserById, issueTokenPair, toPublic } from '../lib/auth'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  DB: D1Database
  JWT_SECRET?: string
  DEMO_MODE?: string
}
type Variables = { auth: import('../types/auth').AuthContext }

const mfaRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown'
}

// ── GET /api/mfa/status ───────────────────────────────────────────────────────
mfaRoutes.get('/status', requireAuth, async (c) => {
  const auth = c.var.auth
  const status = await getMfaStatus(c.env.OCULOFLOW_KV, auth.userId)
  return c.json({ success: true, data: status })
})

// ── POST /api/mfa/enroll/begin ────────────────────────────────────────────────
mfaRoutes.post('/enroll/begin', requireAuth, async (c) => {
  const auth = c.var.auth
  const { secret, recoveryCodes } = await beginMfaEnrollment(c.env.OCULOFLOW_KV, auth.userId)
  const uri = totpUri(secret, auth.email, 'OculoFlow')

  await writeAudit(c.env.OCULOFLOW_KV, {
    event: 'AUTH_USER_CREATED', // reuse closest event
    userId: auth.userId, userEmail: auth.email, userRole: auth.role,
    resource: 'auth', action: 'POST /api/mfa/enroll/begin',
    outcome: 'SUCCESS', ip: clientIp(c), userAgent: c.req.header('User-Agent') ?? 'unknown',
    detail: 'MFA enrollment started',
  }, c.env.DB)

  return c.json({
    success: true,
    data: {
      secret,          // show once — user enters in authenticator app
      otpauthUri: uri, // for QR code generation on frontend
      recoveryCodes,   // show once — user must save these
      expiresInSeconds: 600,
    },
  })
})

// ── POST /api/mfa/enroll/confirm ──────────────────────────────────────────────
mfaRoutes.post('/enroll/confirm', requireAuth, async (c) => {
  const auth = c.var.auth
  let body: { code?: string } = {}
  try { body = await c.req.json() } catch { /**/ }

  if (!body.code) return c.json({ success: false, error: 'TOTP code required' }, 400)

  const result = await confirmMfaEnrollment(c.env.OCULOFLOW_KV, auth.userId, body.code)
  if (!result.success) return c.json({ success: false, error: result.error }, 400)

  await writeAudit(c.env.OCULOFLOW_KV, {
    event: 'AUTH_PASSWORD_CHANGED', // closest event for config change
    userId: auth.userId, userEmail: auth.email, userRole: auth.role,
    resource: 'auth', action: 'POST /api/mfa/enroll/confirm',
    outcome: 'SUCCESS', ip: clientIp(c), userAgent: c.req.header('User-Agent') ?? 'unknown',
    detail: 'MFA enrollment confirmed and activated',
  }, c.env.DB)

  return c.json({ success: true, data: { message: 'MFA enabled successfully' } })
})

// ── POST /api/mfa/verify ──────────────────────────────────────────────────────
// Called after password-check passes but MFA is required.
// Body: { mfaToken: string, code: string, trustDevice?: boolean, deviceLabel?: string }
mfaRoutes.post('/verify', async (c) => {
  let body: { mfaToken?: string; code?: string; trustDevice?: boolean; deviceLabel?: string } = {}
  try { body = await c.req.json() } catch { /**/ }

  if (!body.mfaToken || !body.code) {
    return c.json({ success: false, error: 'mfaToken and code are required' }, 400)
  }

  // Resolve the pending MFA challenge → get userId
  const userId = await resolveMfaChallenge(c.env.OCULOFLOW_KV, body.mfaToken)
  if (!userId) {
    return c.json({ success: false, error: 'MFA session expired or invalid. Please log in again.' }, 401)
  }

  const result = await verifyMfaCode(c.env.OCULOFLOW_KV, userId, body.code)
  if (!result.success) {
    await writeAudit(c.env.OCULOFLOW_KV, {
      event: 'AUTH_LOGIN_FAILED',
      userId, resource: 'auth', action: 'POST /api/mfa/verify',
      outcome: 'FAILURE', ip: clientIp(c), userAgent: c.req.header('User-Agent') ?? 'unknown',
      detail: `MFA verification failed: ${result.error}`,
    }, c.env.DB)
    return c.json({ success: false, error: result.error }, 401)
  }

  // MFA passed — issue full token pair
  const secret = c.env.JWT_SECRET ?? 'dev-secret-change-me'
  const ua = c.req.header('User-Agent') ?? 'unknown'
  const ip = clientIp(c)

  const { getUserById: _unused, ..._ } = { getUserById: null }
  const user = await getUserById(c.env.OCULOFLOW_KV, userId)
  if (!user || !user.isActive) {
    return c.json({ success: false, error: 'User not found or inactive' }, 401)
  }

  const tokens = await issueTokenPair(c.env.OCULOFLOW_KV, user, secret, { userAgent: ua, ipAddress: ip })

  await writeAudit(c.env.OCULOFLOW_KV, {
    event: 'AUTH_LOGIN',
    userId, userEmail: user.email, userRole: user.role,
    resource: 'auth', action: 'POST /api/mfa/verify',
    outcome: 'SUCCESS', ip, userAgent: ua,
    detail: 'Login completed after MFA',
  }, c.env.DB)

  // Optionally register trusted device
  let trustedDeviceId: string | undefined
  if (body.trustDevice) {
    const label = body.deviceLabel ?? ua.slice(0, 80)
    trustedDeviceId = await createTrustedDevice(c.env.OCULOFLOW_KV, userId, label, ip)
  }

  return c.json({
    success: true,
    data: {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: toPublic(user),
      trustedDeviceId,
    },
  })
})

// ── POST /api/mfa/trusted-device ─────────────────────────────────────────────
mfaRoutes.post('/trusted-device', requireAuth, async (c) => {
  const auth = c.var.auth
  let body: { label?: string } = {}
  try { body = await c.req.json() } catch { /**/ }
  const label = body.label ?? 'Trusted Device'
  const deviceId = await createTrustedDevice(c.env.OCULOFLOW_KV, auth.userId, label, clientIp(c))
  return c.json({ success: true, data: { deviceId, label, expiresIn: '30 days' } })
})

// ── DELETE /api/mfa/trusted-device/:id ───────────────────────────────────────
mfaRoutes.delete('/trusted-device/:id', requireAuth, async (c) => {
  const auth = c.var.auth
  const id = c.req.param('id')
  // Verify device belongs to this user before revoking
  const ok = await verifyTrustedDevice(c.env.OCULOFLOW_KV, id, auth.userId)
  if (!ok) return c.json({ success: false, error: 'Device not found or not yours' }, 404)
  await revokeTrustedDevice(c.env.OCULOFLOW_KV, id)
  return c.json({ success: true, data: { message: 'Trusted device revoked' } })
})

// ── DELETE /api/mfa/disable ───────────────────────────────────────────────────
mfaRoutes.delete('/disable', requireAuth, async (c) => {
  const auth = c.var.auth
  let body: { targetUserId?: string; code?: string } = {}
  try { body = await c.req.json() } catch { /**/ }

  const targetId = body.targetUserId ?? auth.userId

  // Only ADMIN can disable another user's MFA; anyone can disable their own with TOTP
  if (targetId !== auth.userId && auth.role !== 'ADMIN') {
    return c.json({ success: false, error: 'Only ADMIN can disable another user\'s MFA' }, 403)
  }

  // Self-disable requires TOTP confirmation
  if (targetId === auth.userId) {
    if (!body.code) return c.json({ success: false, error: 'TOTP code required to disable MFA' }, 400)
    const result = await verifyMfaCode(c.env.OCULOFLOW_KV, auth.userId, body.code)
    if (!result.success) return c.json({ success: false, error: result.error }, 401)
  }

  await disableMfa(c.env.OCULOFLOW_KV, targetId)

  await writeAudit(c.env.OCULOFLOW_KV, {
    event: 'AUTH_USER_DEACTIVATED',
    userId: auth.userId, userEmail: auth.email, userRole: auth.role,
    resource: 'auth', action: 'DELETE /api/mfa/disable',
    outcome: 'SUCCESS', ip: clientIp(c), userAgent: c.req.header('User-Agent') ?? 'unknown',
    detail: `MFA disabled for user ${targetId}`,
  }, c.env.DB)

  return c.json({ success: true, data: { message: 'MFA disabled' } })
})

// ── POST /api/mfa/recovery/regenerate ────────────────────────────────────────
mfaRoutes.post('/recovery/regenerate', requireAuth, async (c) => {
  const auth = c.var.auth
  let body: { code?: string } = {}
  try { body = await c.req.json() } catch { /**/ }
  if (!body.code) return c.json({ success: false, error: 'Current TOTP code required' }, 400)

  const verifyResult = await verifyMfaCode(c.env.OCULOFLOW_KV, auth.userId, body.code)
  if (!verifyResult.success) return c.json({ success: false, error: verifyResult.error }, 401)

  // Generate and store new codes
  const rawCodes = generateRecoveryCodes(8)
  // We need to store hashed versions — get current config and update
  const { base32Encode: _b32, ..._ } = { base32Encode: null }
  // Import hashCode indirectly via re-enrollment isn't clean; use a direct KV update
  const kv = c.env.OCULOFLOW_KV
  const existing = await kv.get(`mfa:config:${auth.userId}`, 'text')
  if (!existing) return c.json({ success: false, error: 'MFA not configured' }, 400)
  const cfg = JSON.parse(existing)
  // Hash new codes with PBKDF2
  async function hc(code: string): Promise<string> {
    const km = await crypto.subtle.importKey('raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits'])
    const salt = new TextEncoder().encode('oculoflow-rc')
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 10_000, hash: 'SHA-256' }, km, 128)
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
  }
  cfg.recoveryCodes = await Promise.all(rawCodes.map(hc))
  cfg.usedRecoveryCodes = []
  await kv.put(`mfa:config:${auth.userId}`, JSON.stringify(cfg))

  return c.json({ success: true, data: { recoveryCodes: rawCodes, message: 'Save these codes — they will not be shown again' } })
})

// ── POST /api/mfa/check-trusted ───────────────────────────────────────────────
// Called by login flow to check if device token bypasses MFA
mfaRoutes.post('/check-trusted', async (c) => {
  let body: { userId?: string; deviceId?: string } = {}
  try { body = await c.req.json() } catch { /**/ }
  if (!body.userId || !body.deviceId) return c.json({ success: true, data: { trusted: false } })
  const trusted = await verifyTrustedDevice(c.env.OCULOFLOW_KV, body.deviceId, body.userId)
  return c.json({ success: true, data: { trusted } })
})

export default mfaRoutes
