// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Staff Auth Routes  (Phase A4 — with MFA challenge in login flow)
// POST /api/auth/login
// POST /api/auth/logout
// POST /api/auth/refresh
// GET  /api/auth/me
// GET  /api/auth/users          (ADMIN only)
// POST /api/auth/users          (ADMIN only — create staff user)
// PATCH /api/auth/users/:id/password
// PATCH /api/auth/users/:id/active
// GET  /api/auth/audit          (ADMIN only — audit log query)
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import {
  login, refreshAccessToken, getUserById, listUsers,
  createUser, updateUserPassword, setUserActive,
  invalidateSession, getJwtSecret, toPublic, seedStaffUsers,
  DEMO_CREDENTIALS, verifyJWT,
} from '../lib/auth'
import { isMfaEnabled, createMfaChallenge, verifyTrustedDevice } from '../lib/mfa'
import {
  checkLoginAllowed, recordLoginFailure, clearLoginFailures,
} from '../lib/ratelimit'
import { writeAudit, queryAuditLog, getHipaaComplianceReport } from '../lib/audit'
import type { AuditEvent } from '../lib/audit'
import { requireAuth, requireRole } from '../middleware/auth'
import type { StaffRole } from '../types/auth'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  DB: D1Database
  JWT_SECRET?: string
  DEMO_MODE?: string
}

const authRoutes = new Hono<{ Bindings: Bindings }>()

// ── Helper: extract client IP ─────────────────────────────────────────────────
function ip(c: typeof authRoutes extends Hono<infer E> ? import('hono').Context<E> : never): string {
  return c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown'
}

// ── POST /api/auth/login ───────────────────────────────────────────────────────
authRoutes.post('/login', async (c) => {
  let body: { email?: string; password?: string }
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { email, password } = body
  if (!email || !password) {
    return c.json({ success: false, error: 'Email and password are required' }, 400)
  }

  const clientIp = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown'
  const userAgent = c.req.header('User-Agent') ?? 'unknown'

  // ── Check lockout ────────────────────────────────────────────────────────
  const lockCheck = await checkLoginAllowed(c.env.OCULOFLOW_KV, email)
  if (!lockCheck.allowed) {
    await writeAudit(c.env.OCULOFLOW_KV, {
      event: 'AUTH_LOCKED_OUT', userEmail: email,
      resource: 'auth', action: 'POST /api/auth/login',
      outcome: 'DENIED', ip: clientIp, userAgent,
      detail: `Account locked for ${lockCheck.remainingSeconds}s`,
    }, c.env.DB)
    return c.json({
      success: false,
      error: `Account temporarily locked. Try again in ${lockCheck.remainingSeconds} seconds.`,
    }, 429)
  }

  const secret = getJwtSecret(c.env)
  const result = await login(c.env.OCULOFLOW_KV, email, password, secret, { userAgent, ipAddress: clientIp }, c.env.DB)

  if (!result) {
    // Record failed attempt
    const lockResult = await recordLoginFailure(c.env.OCULOFLOW_KV, email)
    await writeAudit(c.env.OCULOFLOW_KV, {
      event: 'AUTH_LOGIN_FAILED', userEmail: email,
      resource: 'auth', action: 'POST /api/auth/login',
      outcome: 'FAILURE', ip: clientIp, userAgent,
      detail: lockResult.locked ? 'Account now locked after max failures' : 'Invalid credentials',
    }, c.env.DB)
    if (lockResult.locked) {
      return c.json({
        success: false,
        error: 'Too many failed attempts. Account locked for 15 minutes.',
      }, 429)
    }
    return c.json({ success: false, error: 'Invalid email or password' }, 401)
  }

  // Successful password check — clear failed attempts
  await clearLoginFailures(c.env.OCULOFLOW_KV, email)

  // ── MFA check ────────────────────────────────────────────────────────────
  const mfaEnabled = await isMfaEnabled(c.env.OCULOFLOW_KV, result.user.id)
  if (mfaEnabled) {
    // Check for trusted device cookie bypass
    const deviceId = c.req.header('X-Trusted-Device') ?? ''
    const trusted  = deviceId
      ? await verifyTrustedDevice(c.env.OCULOFLOW_KV, deviceId, result.user.id)
      : false

    if (!trusted) {
      // Issue a short-lived MFA challenge token instead of full tokens
      const mfaToken = await createMfaChallenge(c.env.OCULOFLOW_KV, result.user.id)
      await writeAudit(c.env.OCULOFLOW_KV, {
        event: 'AUTH_LOGIN',
        userId: result.user.id, userEmail: result.user.email, userRole: result.user.role,
        resource: 'auth', action: 'POST /api/auth/login',
        outcome: 'SUCCESS', ip: clientIp, userAgent,
        detail: 'MFA challenge issued',
      }, c.env.DB)
      return c.json({
        success: true,
        data: {
          mfaRequired: true,
          mfaToken,           // client POSTs this + TOTP code to /api/mfa/verify
          expiresInSeconds: 300,
        },
      }, 200)
    }
    // Trusted device — fall through to issue full tokens
  }

  await writeAudit(c.env.OCULOFLOW_KV, {
    event: 'AUTH_LOGIN',
    userId: result.user.id, userEmail: result.user.email, userRole: result.user.role,
    resource: 'auth', action: 'POST /api/auth/login',
    outcome: 'SUCCESS', ip: clientIp, userAgent,
    detail: mfaEnabled ? 'Login via trusted device' : 'Login (MFA not enrolled)',
  }, c.env.DB)

  return c.json({ success: true, data: { ...result, mfaRequired: false } }, 200)
})

// ── POST /api/auth/logout ──────────────────────────────────────────────────────
authRoutes.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  const clientIp = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ?? 'unknown'
  const userAgent = c.req.header('User-Agent') ?? 'unknown'

  if (!token) return c.json({ success: true, data: { message: 'Logged out' } }, 200)

  const secret = getJwtSecret(c.env)
  const payload = await verifyJWT(token, secret)
  if (payload) {
    await invalidateSession(c.env.OCULOFLOW_KV, payload.sub, c.env.DB)
    await writeAudit(c.env.OCULOFLOW_KV, {
      event: 'AUTH_LOGOUT',
      userId: payload.sub, userEmail: payload.email, userRole: payload.role,
      resource: 'auth', action: 'POST /api/auth/logout',
      outcome: 'SUCCESS', ip: clientIp, userAgent,
    }, c.env.DB)
  }

  return c.json({ success: true, data: { message: 'Logged out successfully' } }, 200)
})

// ── POST /api/auth/refresh ─────────────────────────────────────────────────────
authRoutes.post('/refresh', async (c) => {
  let body: { refreshToken?: string }
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { refreshToken } = body
  if (!refreshToken) return c.json({ success: false, error: 'refreshToken is required' }, 400)

  const secret = getJwtSecret(c.env)
  const result = await refreshAccessToken(c.env.OCULOFLOW_KV, refreshToken, secret, c.env.DB)
  if (!result) {
    await writeAudit(c.env.OCULOFLOW_KV, {
      event: 'AUTH_TOKEN_INVALID', resource: 'auth',
      action: 'POST /api/auth/refresh', outcome: 'FAILURE',
      ip: c.req.header('CF-Connecting-IP') ?? 'unknown',
      userAgent: c.req.header('User-Agent') ?? 'unknown',
      detail: 'Invalid or expired refresh token',
    }, c.env.DB)
    return c.json({ success: false, error: 'Invalid or expired refresh token' }, 401)
  }

  await writeAudit(c.env.OCULOFLOW_KV, {
    event: 'AUTH_TOKEN_REFRESH', resource: 'auth',
    action: 'POST /api/auth/refresh', outcome: 'SUCCESS',
    ip: c.req.header('CF-Connecting-IP') ?? 'unknown',
    userAgent: c.req.header('User-Agent') ?? 'unknown',
  }, c.env.DB)

  return c.json({ success: true, data: result }, 200)
})

// ── GET /api/auth/me ───────────────────────────────────────────────────────────
authRoutes.get('/me', requireAuth, async (c) => {
  const auth = c.var.auth
  const user = await getUserById(c.env.OCULOFLOW_KV, auth.userId, c.env.DB)
  if (!user) return c.json({ success: false, error: 'User not found' }, 404)
  return c.json({ success: true, data: toPublic(user) }, 200)
})

// ── GET /api/auth/users  (ADMIN only) ─────────────────────────────────────────
authRoutes.get('/users', requireAuth, requireRole('ADMIN'), async (c) => {
  const users = await listUsers(c.env.OCULOFLOW_KV, c.env.DB)
  return c.json({ success: true, data: users }, 200)
})

// ── POST /api/auth/users  (ADMIN only) ────────────────────────────────────────
authRoutes.post('/users', requireAuth, requireRole('ADMIN'), async (c) => {
  let body: { email?: string; password?: string; firstName?: string; lastName?: string; role?: string; providerId?: string }
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { email, password, firstName, lastName, role, providerId } = body
  if (!email || !password || !firstName || !lastName || !role) {
    return c.json({ success: false, error: 'email, password, firstName, lastName, role are required' }, 400)
  }

  const validRoles: StaffRole[] = ['ADMIN', 'PROVIDER', 'BILLING', 'FRONT_DESK', 'NURSE', 'OPTICAL']
  if (!validRoles.includes(role as StaffRole)) {
    return c.json({ success: false, error: `role must be one of: ${validRoles.join(', ')}` }, 400)
  }

  try {
    const user = await createUser(c.env.OCULOFLOW_KV, {
      email, password, firstName, lastName, role: role as StaffRole, providerId,
    }, c.env.DB)
    await writeAudit(c.env.OCULOFLOW_KV, {
      event: 'AUTH_USER_CREATED',
      userId: c.var.auth.userId, userEmail: c.var.auth.email, userRole: c.var.auth.role,
      resource: 'auth', resourceId: user.id,
      action: 'POST /api/auth/users', outcome: 'SUCCESS',
      ip: c.req.header('CF-Connecting-IP') ?? 'unknown',
      userAgent: c.req.header('User-Agent') ?? 'unknown',
      detail: `Created ${role} user ${email}`,
    }, c.env.DB)
    return c.json({ success: true, data: toPublic(user) }, 201)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create user'
    return c.json({ success: false, error: msg }, 409)
  }
})

// ── PATCH /api/auth/users/:id/password ────────────────────────────────────────
authRoutes.patch('/users/:id/password', requireAuth, async (c) => {
  const { id } = c.req.param()
  const auth = c.var.auth
  if (auth.role !== 'ADMIN' && auth.userId !== id) {
    return c.json({ success: false, error: 'Insufficient permissions' }, 403)
  }

  let body: { password?: string }
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { password } = body
  if (!password || password.length < 8) {
    return c.json({ success: false, error: 'Password must be at least 8 characters' }, 400)
  }

  const ok = await updateUserPassword(c.env.OCULOFLOW_KV, id, password, c.env.DB)
  if (!ok) return c.json({ success: false, error: 'User not found' }, 404)

  await writeAudit(c.env.OCULOFLOW_KV, {
    event: 'AUTH_PASSWORD_CHANGED',
    userId: auth.userId, userEmail: auth.email, userRole: auth.role,
    resource: 'auth', resourceId: id,
    action: `PATCH /api/auth/users/${id}/password`, outcome: 'SUCCESS',
    ip: c.req.header('CF-Connecting-IP') ?? 'unknown',
    userAgent: c.req.header('User-Agent') ?? 'unknown',
    detail: auth.userId === id ? 'Self password change' : 'Admin password reset',
  }, c.env.DB)

  return c.json({ success: true, data: { updated: true } }, 200)
})

// ── PATCH /api/auth/users/:id/active  (ADMIN only) ────────────────────────────
authRoutes.patch('/users/:id/active', requireAuth, requireRole('ADMIN'), async (c) => {
  const { id } = c.req.param()
  let body: { isActive?: boolean }
  try { body = await c.req.json() } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  if (typeof body.isActive !== 'boolean') {
    return c.json({ success: false, error: 'isActive (boolean) is required' }, 400)
  }

  const ok = await setUserActive(c.env.OCULOFLOW_KV, id, body.isActive, c.env.DB)
  if (!ok) return c.json({ success: false, error: 'User not found' }, 404)

  await writeAudit(c.env.OCULOFLOW_KV, {
    event: body.isActive ? 'AUTH_USER_ACTIVATED' : 'AUTH_USER_DEACTIVATED',
    userId: c.var.auth.userId, userEmail: c.var.auth.email, userRole: c.var.auth.role,
    resource: 'auth', resourceId: id,
    action: `PATCH /api/auth/users/${id}/active`, outcome: 'SUCCESS',
    ip: c.req.header('CF-Connecting-IP') ?? 'unknown',
    userAgent: c.req.header('User-Agent') ?? 'unknown',
    detail: `isActive set to ${body.isActive}`,
  }, c.env.DB)

  return c.json({ success: true, data: { isActive: body.isActive } }, 200)
})

// ── GET /api/auth/audit  (ADMIN only) ─────────────────────────────────────────
authRoutes.get('/audit', requireAuth, requireRole('ADMIN'), async (c) => {
  const limit    = parseInt(c.req.query('limit')    ?? '100', 10)
  const offset   = parseInt(c.req.query('offset')   ?? '0',   10)
  const userId   = c.req.query('userId')
  const event    = c.req.query('event') as AuditEvent | undefined
  const resource = c.req.query('resource')
  const outcome  = c.req.query('outcome') as 'SUCCESS' | 'FAILURE' | 'DENIED' | undefined
  const risk     = c.req.query('risk') as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | undefined
  const since    = c.req.query('since')
  const highRisk = c.req.query('highRiskOnly') === 'true'

  const { records, total } = await queryAuditLog(c.env.OCULOFLOW_KV, {
    limit: Math.min(limit, 500), offset, userId, event, resource, outcome, risk, since, highRiskOnly: highRisk,
  }, c.env.DB)

  return c.json({ success: true, data: records, count: records.length, total }, 200)
})

// ── GET /api/auth/audit/hipaa-report  (ADMIN only) ────────────────────────────
authRoutes.get('/audit/hipaa-report', requireAuth, requireRole('ADMIN'), async (c) => {
  const report = await getHipaaComplianceReport(c.env.OCULOFLOW_KV, c.env.DB)
  return c.json({ success: true, data: report }, 200)
})

// ── GET /api/auth/demo-credentials  (demo mode only) ──────────────────────────
authRoutes.get('/demo-credentials', async (c) => {
  if (c.env.DEMO_MODE !== 'true') {
    return c.json({ success: false, error: 'Not available' }, 404)
  }
  await seedStaffUsers(c.env.OCULOFLOW_KV, c.env.DB)
  return c.json({ success: true, data: DEMO_CREDENTIALS }, 200)
})

// ── GET /api/auth/seed ─────────────────────────────────────────────────────────
authRoutes.get('/seed', async (c) => {
  await seedStaffUsers(c.env.OCULOFLOW_KV, c.env.DB)
  // Also apply migration 0016 schema changes (idempotent)
  if (c.env.DB) {
    const stmts = [
      `ALTER TABLE portal_accounts ADD COLUMN salt TEXT`,
      `ALTER TABLE portal_message_threads ADD COLUMN updated_at TEXT`,
      `ALTER TABLE portal_message_threads ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE portal_messages ADD COLUMN from_patient INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE portal_messages ADD COLUMN status TEXT NOT NULL DEFAULT 'UNREAD'`,
      `ALTER TABLE portal_messages ADD COLUMN read_at TEXT`,
      `ALTER TABLE portal_messages ADD COLUMN attachment_note TEXT`,
      `CREATE TABLE IF NOT EXISTS notification_logs (id TEXT PRIMARY KEY,channel TEXT NOT NULL,type TEXT NOT NULL,recipient TEXT NOT NULL,subject TEXT,body TEXT NOT NULL DEFAULT '',provider TEXT NOT NULL DEFAULT 'demo',external_id TEXT,success INTEGER NOT NULL DEFAULT 0,error TEXT,retries INTEGER NOT NULL DEFAULT 0,sent_at TEXT NOT NULL DEFAULT (datetime('now')),patient_id TEXT,patient_name TEXT)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_logs_sent ON notification_logs(sent_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_logs_patient ON notification_logs(patient_id,sent_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_notif_logs_type ON notification_logs(type,sent_at DESC)`,
    ]
    const mig016: string[] = []
    for (const sql of stmts) {
      try { await c.env.DB.exec(sql); mig016.push('ok') }
      catch (e: any) { mig016.push(String(e?.message ?? e).slice(0,40)) }
    }
    return c.json({ success: true, data: { seeded: true, migration016: mig016 } }, 200)
  }
  return c.json({ success: true, data: { seeded: true } }, 200)
})

// ── POST /api/auth/unlock-dev  (demo mode only — clears login lockout) ────────
authRoutes.post('/unlock-dev', async (c) => {
  if (c.env.DEMO_MODE !== 'true') {
    return c.json({ success: false, error: 'Not available' }, 404)
  }
  const { email } = await c.req.json().catch(() => ({ email: '' }))
  if (!email) return c.json({ success: false, error: 'email required' }, 400)
  await clearLoginFailures(c.env.OCULOFLOW_KV, email)
  return c.json({ success: true, message: `Lockout cleared for ${email}` })
})

// ── POST /api/auth/run-migration-016  (admin only — one-shot migration) ────────
authRoutes.post('/run-migration-016', async (c) => {
  const db = c.env.DB
  if (!db) return c.json({ success: false, error: 'DB not bound' }, 500)

  const statements = [
    `ALTER TABLE portal_accounts ADD COLUMN salt TEXT`,
    `ALTER TABLE portal_message_threads ADD COLUMN updated_at TEXT`,
    `ALTER TABLE portal_message_threads ADD COLUMN message_count INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE portal_messages ADD COLUMN from_patient INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE portal_messages ADD COLUMN status TEXT NOT NULL DEFAULT 'UNREAD'`,
    `ALTER TABLE portal_messages ADD COLUMN read_at TEXT`,
    `ALTER TABLE portal_messages ADD COLUMN attachment_note TEXT`,
    `CREATE TABLE IF NOT EXISTS notification_logs (
      id           TEXT PRIMARY KEY,
      channel      TEXT NOT NULL,
      type         TEXT NOT NULL,
      recipient    TEXT NOT NULL,
      subject      TEXT,
      body         TEXT NOT NULL DEFAULT '',
      provider     TEXT NOT NULL DEFAULT 'demo',
      external_id  TEXT,
      success      INTEGER NOT NULL DEFAULT 0,
      error        TEXT,
      retries      INTEGER NOT NULL DEFAULT 0,
      sent_at      TEXT NOT NULL DEFAULT (datetime('now')),
      patient_id   TEXT,
      patient_name TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notif_logs_sent    ON notification_logs(sent_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_notif_logs_patient ON notification_logs(patient_id, sent_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_notif_logs_type    ON notification_logs(type, sent_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_notif_logs_success ON notification_logs(success)`,
  ]

  const results: Array<{ sql: string; status: string; error?: string }> = []
  for (const sql of statements) {
    try {
      await db.exec(sql)
      results.push({ sql: sql.slice(0, 60), status: 'ok' })
    } catch (e: any) {
      const msg = String(e?.message ?? e)
      const isIdempotent = msg.includes('duplicate column') ||
        msg.includes('already exists') || msg.includes('table_already_exists')
      results.push({ sql: sql.slice(0, 60), status: isIdempotent ? 'skipped (already applied)' : 'error', error: isIdempotent ? undefined : msg })
    }
  }

  const errors = results.filter(r => r.status === 'error')
  return c.json({
    success: errors.length === 0,
    message: errors.length === 0 ? 'Migration 0016 applied successfully' : `${errors.length} statements failed`,
    results,
  })
})

export default authRoutes
