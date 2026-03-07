// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Staff Auth Routes  (Phase A1)
// POST /api/auth/login
// POST /api/auth/logout
// POST /api/auth/refresh
// GET  /api/auth/me
// GET  /api/auth/users          (ADMIN only)
// POST /api/auth/users          (ADMIN only — create staff user)
// PATCH /api/auth/users/:id/password
// PATCH /api/auth/users/:id/active
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import {
  login, refreshAccessToken, getUserById, listUsers,
  createUser, updateUserPassword, setUserActive,
  invalidateSession, getJwtSecret, toPublic, seedStaffUsers,
  DEMO_CREDENTIALS, verifyJWT, isRevoked, extractAuthContext,
} from '../lib/auth'
import { requireAuth, requireRole } from '../middleware/auth'
import type { StaffRole } from '../types/auth'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  JWT_SECRET?: string
  DEMO_MODE?: string
}

const authRoutes = new Hono<{ Bindings: Bindings }>()

// ── POST /api/auth/login ───────────────────────────────────────────────────────
authRoutes.post('/login', async (c) => {
  let body: { email?: string; password?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { email, password } = body
  if (!email || !password) {
    return c.json({ success: false, error: 'Email and password are required' }, 400)
  }

  const secret = getJwtSecret(c.env)
  const userAgent = c.req.header('User-Agent')
  const ipAddress = c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown'

  const result = await login(c.env.OCULOFLOW_KV, email, password, secret, { userAgent, ipAddress })
  if (!result) {
    return c.json({ success: false, error: 'Invalid email or password' }, 401)
  }

  return c.json({ success: true, data: result }, 200)
})

// ── POST /api/auth/logout ──────────────────────────────────────────────────────
authRoutes.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) {
    return c.json({ success: true, data: { message: 'Logged out' } }, 200)
  }

  const secret = getJwtSecret(c.env)
  const payload = await verifyJWT(token, secret)
  if (payload) {
    await invalidateSession(c.env.OCULOFLOW_KV, payload.sub)
  }

  return c.json({ success: true, data: { message: 'Logged out successfully' } }, 200)
})

// ── POST /api/auth/refresh ─────────────────────────────────────────────────────
authRoutes.post('/refresh', async (c) => {
  let body: { refreshToken?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { refreshToken } = body
  if (!refreshToken) {
    return c.json({ success: false, error: 'refreshToken is required' }, 400)
  }

  const secret = getJwtSecret(c.env)
  const result = await refreshAccessToken(c.env.OCULOFLOW_KV, refreshToken, secret)
  if (!result) {
    return c.json({ success: false, error: 'Invalid or expired refresh token' }, 401)
  }

  return c.json({ success: true, data: result }, 200)
})

// ── GET /api/auth/me ───────────────────────────────────────────────────────────
authRoutes.get('/me', requireAuth, async (c) => {
  const auth = c.var.auth
  const user = await getUserById(c.env.OCULOFLOW_KV, auth.userId)
  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404)
  }
  return c.json({ success: true, data: toPublic(user) }, 200)
})

// ── GET /api/auth/users  (ADMIN only) ─────────────────────────────────────────
authRoutes.get('/users', requireAuth, requireRole('ADMIN'), async (c) => {
  const users = await listUsers(c.env.OCULOFLOW_KV)
  return c.json({ success: true, data: users }, 200)
})

// ── POST /api/auth/users  (ADMIN only — create staff user) ────────────────────
authRoutes.post('/users', requireAuth, requireRole('ADMIN'), async (c) => {
  let body: { email?: string; password?: string; firstName?: string; lastName?: string; role?: string; providerId?: string }
  try {
    body = await c.req.json()
  } catch {
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
    })
    return c.json({ success: true, data: toPublic(user) }, 201)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to create user'
    return c.json({ success: false, error: msg }, 409)
  }
})

// ── PATCH /api/auth/users/:id/password ────────────────────────────────────────
// ADMIN can reset any user; any user can reset their own
authRoutes.patch('/users/:id/password', requireAuth, async (c) => {
  const { id } = c.req.param()
  const auth = c.var.auth

  // Must be admin or own account
  if (auth.role !== 'ADMIN' && auth.userId !== id) {
    return c.json({ success: false, error: 'Insufficient permissions' }, 403)
  }

  let body: { password?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  const { password } = body
  if (!password || password.length < 8) {
    return c.json({ success: false, error: 'Password must be at least 8 characters' }, 400)
  }

  const ok = await updateUserPassword(c.env.OCULOFLOW_KV, id, password)
  if (!ok) return c.json({ success: false, error: 'User not found' }, 404)
  return c.json({ success: true, data: { updated: true } }, 200)
})

// ── PATCH /api/auth/users/:id/active  (ADMIN only) ────────────────────────────
authRoutes.patch('/users/:id/active', requireAuth, requireRole('ADMIN'), async (c) => {
  const { id } = c.req.param()
  let body: { isActive?: boolean }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400)
  }

  if (typeof body.isActive !== 'boolean') {
    return c.json({ success: false, error: 'isActive (boolean) is required' }, 400)
  }

  const ok = await setUserActive(c.env.OCULOFLOW_KV, id, body.isActive)
  if (!ok) return c.json({ success: false, error: 'User not found' }, 404)
  return c.json({ success: true, data: { isActive: body.isActive } }, 200)
})

// ── GET /api/auth/demo-credentials  (demo mode only) ──────────────────────────
// Returns seed credentials for the login page — only exposed when DEMO_MODE=true
authRoutes.get('/demo-credentials', async (c) => {
  if (c.env.DEMO_MODE !== 'true') {
    return c.json({ success: false, error: 'Not available' }, 404)
  }
  // Ensure users are seeded so login works immediately
  await seedStaffUsers(c.env.OCULOFLOW_KV)
  return c.json({ success: true, data: DEMO_CREDENTIALS }, 200)
})

// ── GET /api/auth/seed  (ensure seed is applied — dev helper) ─────────────────
authRoutes.get('/seed', async (c) => {
  await seedStaffUsers(c.env.OCULOFLOW_KV)
  return c.json({ success: true, data: { seeded: true } }, 200)
})

export default authRoutes
