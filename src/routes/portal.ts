// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 4A + B3: Patient Portal Routes
// B3 adds: magic-link login, password login, account creation, password reset
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import {
  portalLogin, getPortalSession, portalLogout, createDemoSession,
  createAppointmentRequest, listAppointmentRequests, updateAppointmentRequest,
  sendMessage, listMessageThreads, getThreadMessages, markThreadRead,
  getPortalDashboard, ensureMessageSeed,
  // B3 real auth
  initiatePortalMagicLink, verifyPortalMagicLink,
  createPortalAccount, getPortalAccount, portalPasswordLogin,
  initiatePasswordReset, completePasswordReset, createPortalSession,
} from '../lib/portal'
import type { AppointmentRequestType, MessageCategory } from '../types/portal'

type Bindings = {
  OCULOFLOW_KV:         KVNamespace
  DEMO_MODE?:           string
  SENDGRID_API_KEY?:    string
  SENDGRID_FROM_EMAIL?: string
}
type ApiResp  = { success: boolean; data?: unknown; message?: string; error?: string }

const portalRoutes = new Hono<{ Bindings: Bindings }>()

// ── Helper: resolve session from cookie or header ──────────────────────────────
async function resolveSession(c: any) {
  const sessionId =
    c.req.header('X-Portal-Session') ??
    c.req.query('session') ?? ''
  if (!sessionId) return null
  return getPortalSession(c.env.OCULOFLOW_KV, sessionId)
}

// ── Auth ──────────────────────────────────────────────────────────────────────

portalRoutes.post('/auth/login', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.lastName || !body.dob) {
      return c.json<ApiResp>({ success: false, error: 'lastName and dob are required' }, 400)
    }
    const result = await portalLogin(c.env.OCULOFLOW_KV, body)
    if (!result.success) return c.json<ApiResp>({ success: false, error: result.error }, 401)
    return c.json<ApiResp>({ success: true, data: result.session, message: `Welcome back, ${result.session!.patientName}` })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.post('/auth/demo', async (c) => {
  try {
    // Ensure patients are seeded first
    const { ensureSeedData } = await import('../lib/patients')
    await ensureSeedData(c.env.OCULOFLOW_KV)
    const session = await createDemoSession(c.env.OCULOFLOW_KV)
    return c.json<ApiResp>({ success: true, data: session, message: `Demo session — ${session.patientName}` })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.post('/auth/logout', async (c) => {
  try {
    const body = await c.req.json()
    if (body.sessionId) await portalLogout(c.env.OCULOFLOW_KV, body.sessionId)
    return c.json<ApiResp>({ success: true, message: 'Logged out' })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.get('/auth/session', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Session expired or not found' }, 401)
    return c.json<ApiResp>({ success: true, data: session })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── Dashboard ─────────────────────────────────────────────────────────────────

portalRoutes.get('/dashboard', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)

    // Seed patient data on first access
    const { ensureSeedData } = await import('../lib/patients')
    await ensureSeedData(c.env.OCULOFLOW_KV)

    const dashboard = await getPortalDashboard(c.env.OCULOFLOW_KV, session.patientId)
    return c.json<ApiResp>({ success: true, data: dashboard })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── Appointment Requests ──────────────────────────────────────────────────────

portalRoutes.get('/appointments', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)
    const requests = await listAppointmentRequests(c.env.OCULOFLOW_KV, session.patientId)
    return c.json<ApiResp>({ success: true, data: requests })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.post('/appointments', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)

    const body = await c.req.json()
    if (!body.requestType || !body.reason) {
      return c.json<ApiResp>({ success: false, error: 'requestType and reason are required' }, 400)
    }

    const req = await createAppointmentRequest(
      c.env.OCULOFLOW_KV,
      session.patientId,
      session.patientName,
      {
        requestType: body.requestType as AppointmentRequestType,
        preferredDates: body.preferredDates ?? [],
        preferredTimes: body.preferredTimes ?? ['any'],
        preferredProvider: body.preferredProvider,
        reason: body.reason,
        urgency: body.urgency ?? 'routine',
        patientNotes: body.patientNotes,
        patientPhone: body.patientPhone,
        patientEmail: session.patientEmail,
      }
    )
    return c.json<ApiResp>({ success: true, data: req, message: 'Appointment request submitted' }, 201)
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// Staff-facing: update request status
portalRoutes.patch('/appointments/:id', async (c) => {
  try {
    const id      = c.req.param('id')
    const updates = await c.req.json()
    const req     = await updateAppointmentRequest(c.env.OCULOFLOW_KV, id, updates)
    if (!req) return c.json<ApiResp>({ success: false, error: 'Request not found' }, 404)
    return c.json<ApiResp>({ success: true, data: req, message: `Request ${updates.status ?? 'updated'}` })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── Messages ──────────────────────────────────────────────────────────────────

portalRoutes.get('/messages', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)
    await ensureMessageSeed(c.env.OCULOFLOW_KV)
    const threads = await listMessageThreads(c.env.OCULOFLOW_KV, session.patientId)
    return c.json<ApiResp>({ success: true, data: threads })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.get('/messages/:threadId', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)
    const threadId = c.req.param('threadId')
    await markThreadRead(c.env.OCULOFLOW_KV, threadId)
    const messages = await getThreadMessages(c.env.OCULOFLOW_KV, threadId)
    return c.json<ApiResp>({ success: true, data: messages })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.post('/messages', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)

    const body = await c.req.json()
    if (!body.subject || !body.body || !body.category) {
      return c.json<ApiResp>({ success: false, error: 'subject, body, category are required' }, 400)
    }

    const result = await sendMessage(c.env.OCULOFLOW_KV, {
      patientId: session.patientId,
      patientName: session.patientName,
      subject: body.subject,
      category: body.category as MessageCategory,
      body: body.body,
      fromPatient: true,
      senderName: session.patientName,
      threadId: body.threadId,
      attachmentNote: body.attachmentNote,
    })
    return c.json<ApiResp>({ success: true, data: result, message: 'Message sent' }, 201)
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// Staff reply to patient
portalRoutes.post('/messages/:threadId/reply', async (c) => {
  try {
    const threadId = c.req.param('threadId')
    const body     = await c.req.json()
    if (!body.body || !body.senderName) {
      return c.json<ApiResp>({ success: false, error: 'body and senderName are required' }, 400)
    }
    // Get thread to copy patient info
    const { listMessageThreads: lt } = await import('../lib/portal')
    const threads = await lt(c.env.OCULOFLOW_KV)
    const thread  = threads.find(t => t.threadId === threadId)
    if (!thread) return c.json<ApiResp>({ success: false, error: 'Thread not found' }, 404)

    const result = await sendMessage(c.env.OCULOFLOW_KV, {
      patientId: thread.patientId,
      patientName: thread.patientName,
      subject: `Re: ${thread.subject}`,
      category: thread.category,
      body: body.body,
      fromPatient: false,
      senderName: body.senderName,
      threadId,
    })
    return c.json<ApiResp>({ success: true, data: result, message: 'Reply sent' }, 201)
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── Rx & Exam Summaries ───────────────────────────────────────────────────────

portalRoutes.get('/rx', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)
    const { listRxForPatient } = await import('../lib/optical')
    const rxList = await listRxForPatient(c.env.OCULOFLOW_KV, session.patientId)
    return c.json<ApiResp>({ success: true, data: rxList })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.get('/optical-orders', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)
    const { listOrders } = await import('../lib/optical')
    const orders = (await listOrders(c.env.OCULOFLOW_KV))
      .filter(o => o.patientId === session.patientId && o.status !== 'CANCELLED')
    return c.json<ApiResp>({ success: true, data: orders })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.get('/balance', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)
    // Fetch superbills for this patient
    const sbIndexRaw = await c.env.OCULOFLOW_KV.get('superbills:index')
    const sbIds: string[] = sbIndexRaw ? JSON.parse(sbIndexRaw) : []
    const items = []
    let total = 0
    for (const sid of sbIds) {
      const raw = await c.env.OCULOFLOW_KV.get(`superbill:${sid}`)
      if (!raw) continue
      const sb = JSON.parse(raw)
      if (sb.patientId !== session.patientId) continue
      if (['VOIDED', 'PAID'].includes(sb.status)) continue
      const bal = sb.patientBalance ?? 0
      total += bal
      items.push({
        superbillId: sb.id, serviceDate: sb.serviceDate ?? '',
        description: `Visit — ${sb.status}`, totalCharge: sb.totalCharge ?? 0,
        insurancePaid: sb.insurancePaid ?? 0, patientBalance: bal, status: sb.status,
      })
    }
    return c.json<ApiResp>({ success: true, data: { totalBalance: total, items } })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase B3 — Real Auth Routes
// POST /api/portal/auth/magic-link        — initiate magic-link / OTP
// POST /api/portal/auth/magic-verify      — verify token or OTP → session
// POST /api/portal/auth/register          — create portal account
// POST /api/portal/auth/password-login    — email + password login
// POST /api/portal/auth/password-reset    — initiate password reset
// POST /api/portal/auth/password-set      — complete reset (token/OTP + new pw)
// GET  /api/portal/auth/account           — get account info (session required)
// ─────────────────────────────────────────────────────────────────────────────

portalRoutes.post('/auth/magic-link', async (c) => {
  try {
    const body = await c.req.json() as { email: string }
    if (!body.email) return c.json<ApiResp>({ success: false, error: 'email required' }, 400)

    const emailCfg = c.env.SENDGRID_API_KEY && !c.env.SENDGRID_API_KEY.startsWith('SG.XXXXXXXX')
      ? { apiKey: c.env.SENDGRID_API_KEY, fromEmail: c.env.SENDGRID_FROM_EMAIL ?? 'noreply@oculoflow.com', fromName: 'OculoFlow Portal' }
      : null

    const baseUrl = `https://${c.req.header('host') ?? 'oculoflow.pages.dev'}`
    const result  = await initiatePortalMagicLink(c.env.OCULOFLOW_KV, body.email, emailCfg, baseUrl)
    return c.json<ApiResp>({
      success: result.success,
      data: result.demo ? { demo: true, token: result.token, otp: result.otp, note: 'Demo mode — credentials returned directly' } : { sent: true },
      message: result.demo ? 'Demo: use the returned token or OTP to log in' : 'Check your email for a login link and 6-digit code',
    })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.post('/auth/magic-verify', async (c) => {
  try {
    const body = await c.req.json() as { token?: string; email?: string; otp?: string }
    const verify = await verifyPortalMagicLink(c.env.OCULOFLOW_KV, body)
    if (!verify.success) return c.json<ApiResp>({ success: false, error: verify.error }, 401)

    const session = await createPortalSession(c.env.OCULOFLOW_KV, verify.patientId!)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Patient not found' }, 404)
    return c.json<ApiResp>({ success: true, data: session, message: `Welcome back, ${session.patientName}` })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.post('/auth/register', async (c) => {
  try {
    const body = await c.req.json() as { patientId: string; email: string; password?: string; lastName?: string; dob?: string }
    if (!body.patientId || !body.email) {
      return c.json<ApiResp>({ success: false, error: 'patientId and email required' }, 400)
    }

    // Verify patient identity before creating account
    if (body.lastName && body.dob) {
      const loginResult = await portalLogin(c.env.OCULOFLOW_KV, { lastName: body.lastName, dob: body.dob })
      if (!loginResult.success || loginResult.session?.patientId !== body.patientId) {
        return c.json<ApiResp>({ success: false, error: 'Patient identity verification failed' }, 401)
      }
      // Clean up the verification session
      if (loginResult.session) await portalLogout(c.env.OCULOFLOW_KV, loginResult.session.sessionId)
    }

    const result = await createPortalAccount(c.env.OCULOFLOW_KV, {
      patientId: body.patientId,
      email: body.email,
      password: body.password,
    })
    if (!result.success) return c.json<ApiResp>({ success: false, error: result.error }, 409)
    return c.json<ApiResp>({ success: true, data: result.account, message: 'Portal account created' }, 201)
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.post('/auth/password-login', async (c) => {
  try {
    const body = await c.req.json() as { email: string; password: string }
    if (!body.email || !body.password) {
      return c.json<ApiResp>({ success: false, error: 'email and password required' }, 400)
    }
    const result = await portalPasswordLogin(c.env.OCULOFLOW_KV, body.email, body.password)
    if (!result.success) return c.json<ApiResp>({ success: false, error: result.error }, 401)

    const session = await createPortalSession(c.env.OCULOFLOW_KV, result.patientId!)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Patient not found' }, 404)
    return c.json<ApiResp>({ success: true, data: session, message: `Welcome back, ${session.patientName}` })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.post('/auth/password-reset', async (c) => {
  try {
    const body = await c.req.json() as { email: string }
    if (!body.email) return c.json<ApiResp>({ success: false, error: 'email required' }, 400)

    const emailCfg = c.env.SENDGRID_API_KEY && !c.env.SENDGRID_API_KEY.startsWith('SG.XXXXXXXX')
      ? { apiKey: c.env.SENDGRID_API_KEY, fromEmail: c.env.SENDGRID_FROM_EMAIL ?? 'noreply@oculoflow.com', fromName: 'OculoFlow Portal' }
      : null

    const baseUrl = `https://${c.req.header('host') ?? 'oculoflow.pages.dev'}`
    const result  = await initiatePasswordReset(c.env.OCULOFLOW_KV, body.email, emailCfg, baseUrl)
    return c.json<ApiResp>({
      success: result.success,
      data: result.demo ? { demo: true, token: result.token, note: 'Demo mode — use token + new password to complete reset' } : { sent: true },
      message: result.demo ? 'Demo: use the returned token to set a new password' : 'Check your email for reset instructions',
    })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.post('/auth/password-set', async (c) => {
  try {
    const body = await c.req.json() as { token?: string; email?: string; otp?: string; newPassword: string }
    if (!body.newPassword) return c.json<ApiResp>({ success: false, error: 'newPassword required' }, 400)
    if (body.newPassword.length < 8) return c.json<ApiResp>({ success: false, error: 'Password must be at least 8 characters' }, 400)

    const result = await completePasswordReset(c.env.OCULOFLOW_KV, body)
    if (!result.success) return c.json<ApiResp>({ success: false, error: result.error }, 401)
    return c.json<ApiResp>({ success: true, message: 'Password updated — you can now log in with your email and new password' })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.get('/auth/account', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Session required' }, 401)
    const account = await getPortalAccount(c.env.OCULOFLOW_KV, session.patientId)
    return c.json<ApiResp>({
      success: true,
      data: account ? {
        email: account.email, loginMethod: account.loginMethod,
        emailVerified: account.emailVerified, lastLogin: account.lastLogin,
        hasPassword: !!account.passwordHash,
      } : { email: session.patientEmail, loginMethod: 'dob', emailVerified: false, hasPassword: false },
    })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

export default portalRoutes
