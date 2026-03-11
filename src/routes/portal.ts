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
  DB:                   D1Database
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
    const result = await portalLogin(c.env.OCULOFLOW_KV, body, c.env.DB)
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
    await ensureSeedData(c.env.OCULOFLOW_KV, c.env.DB)
    const session = await createDemoSession(c.env.OCULOFLOW_KV, c.env.DB)
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
    await ensureSeedData(c.env.OCULOFLOW_KV, c.env.DB)

    const dashboard = await getPortalDashboard(c.env.OCULOFLOW_KV, session.patientId, c.env.DB)
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
    const requests = await listAppointmentRequests(c.env.OCULOFLOW_KV, session.patientId, undefined, c.env.DB)
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
      },
      c.env.DB
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
    const req     = await updateAppointmentRequest(c.env.OCULOFLOW_KV, id, updates, c.env.DB)
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
    await ensureMessageSeed(c.env.OCULOFLOW_KV, c.env.DB)
    const threads = await listMessageThreads(c.env.OCULOFLOW_KV, session.patientId, c.env.DB)
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
    await markThreadRead(c.env.OCULOFLOW_KV, threadId, c.env.DB)
    const messages = await getThreadMessages(c.env.OCULOFLOW_KV, threadId, c.env.DB)
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
    }, c.env.DB)
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
    const threads = await lt(c.env.OCULOFLOW_KV, undefined, c.env.DB)
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
    }, c.env.DB)
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
    const rxList = await listRxForPatient(c.env.OCULOFLOW_KV, session.patientId, c.env.DB)
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
    const orders = (await listOrders(c.env.OCULOFLOW_KV, c.env.DB))
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
    // Fetch superbills for this patient via D1
    const { getPatientSuperbills } = await import('../lib/billing')
    const sbs = await getPatientSuperbills(c.env.OCULOFLOW_KV, session.patientId, c.env.DB)
    const items = []
    let total = 0
    for (const sb of sbs) {
      if (['VOIDED', 'PAID'].includes(sb.status)) continue
      const bal = (sb as any).patientBalance ?? 0
      total += bal
      items.push({
        superbillId: sb.id, serviceDate: (sb as any).serviceDate ?? '',
        description: `Visit — ${sb.status}`, totalCharge: (sb as any).totalCharge ?? 0,
        insurancePaid: (sb as any).insurancePaid ?? 0, patientBalance: bal, status: sb.status,
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

    // Ensure patients are seeded so email lookup works in demo mode
    const { ensureSeedData } = await import('../lib/patients')
    await ensureSeedData(c.env.OCULOFLOW_KV, c.env.DB)

    const emailCfg = c.env.SENDGRID_API_KEY && !c.env.SENDGRID_API_KEY.startsWith('SG.XXXXXXXX')
      ? { apiKey: c.env.SENDGRID_API_KEY, fromEmail: c.env.SENDGRID_FROM_EMAIL ?? 'noreply@oculoflow.com', fromName: 'OculoFlow Portal' }
      : null

    const baseUrl = `https://${c.req.header('host') ?? 'oculoflow.pages.dev'}`
    const result  = await initiatePortalMagicLink(c.env.OCULOFLOW_KV, body.email, emailCfg, baseUrl, c.env.DB)
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

    const session = await createPortalSession(c.env.OCULOFLOW_KV, verify.patientId!, c.env.DB)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Patient not found' }, 404)
    return c.json<ApiResp>({ success: true, data: session, message: `Welcome back, ${session.patientName}` })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

portalRoutes.post('/auth/register', async (c) => {
  try {
    const body = await c.req.json() as {
      patientId?: string
      email: string
      password?: string
      lastName?: string
      dob?: string
      firstName?: string
      phone?: string
    }
    if (!body.email) {
      return c.json<ApiResp>({ success: false, error: 'email is required' }, 400)
    }

    // Ensure seed data exists so patient lookup works
    const { ensureSeedData } = await import('../lib/patients')
    await ensureSeedData(c.env.OCULOFLOW_KV, c.env.DB)

    let patientId = body.patientId

    // Self-service: look up patient by lastName+dob if no patientId provided
    if (!patientId && body.lastName && body.dob) {
      const loginResult = await portalLogin(c.env.OCULOFLOW_KV, { lastName: body.lastName, dob: body.dob }, c.env.DB)
      if (loginResult.success && loginResult.session) {
        patientId = loginResult.session.patientId
        await portalLogout(c.env.OCULOFLOW_KV, loginResult.session.sessionId)
      }
    }

    // Fallback for demo/dev: use demo patient pat-001 if still no patientId
    if (!patientId) {
      patientId = 'pat-001'
    }

    // Verify explicit patientId against lastName+dob when both are provided
    if (body.patientId && body.lastName && body.dob) {
      const loginResult = await portalLogin(c.env.OCULOFLOW_KV, { lastName: body.lastName, dob: body.dob }, c.env.DB)
      if (!loginResult.success || loginResult.session?.patientId !== body.patientId) {
        return c.json<ApiResp>({ success: false, error: 'Patient identity verification failed' }, 401)
      }
      if (loginResult.session) await portalLogout(c.env.OCULOFLOW_KV, loginResult.session.sessionId)
    }

    const result = await createPortalAccount(c.env.OCULOFLOW_KV, {
      patientId,
      email: body.email,
      password: body.password,
    }, c.env.DB)
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
    const result = await portalPasswordLogin(c.env.OCULOFLOW_KV, body.email, body.password, c.env.DB)
    if (!result.success) return c.json<ApiResp>({ success: false, error: result.error }, 401)

    // Ensure patient seed data exists before creating session
    const { ensureSeedData } = await import('../lib/patients')
    await ensureSeedData(c.env.OCULOFLOW_KV, c.env.DB)

    const session = await createPortalSession(c.env.OCULOFLOW_KV, result.patientId!, c.env.DB)
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
    const result  = await initiatePasswordReset(c.env.OCULOFLOW_KV, body.email, emailCfg, baseUrl, c.env.DB)
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

    const result = await completePasswordReset(c.env.OCULOFLOW_KV, body, c.env.DB)
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
    const account = await getPortalAccount(c.env.OCULOFLOW_KV, session.patientId, c.env.DB)
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

// ── PATCH /api/portal/auth/account  — update email / password ────────────────
portalRoutes.patch('/auth/account', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Session required' }, 401)
    const body = await c.req.json() as { email?: string; newPassword?: string; currentPassword?: string }

    const accountRaw = await c.env.OCULOFLOW_KV.get(`portal:account:${session.patientId}`)
    if (!accountRaw) return c.json<ApiResp>({ success: false, error: 'No portal account found' }, 404)
    const account = JSON.parse(accountRaw)

    if (body.newPassword) {
      if (!body.currentPassword) return c.json<ApiResp>({ success: false, error: 'currentPassword required to set new password' }, 400)
      if (body.newPassword.length < 8) return c.json<ApiResp>({ success: false, error: 'Password must be at least 8 characters' }, 400)
      // Verify current password
      const { verifyPassword, hashPassword } = await import('../lib/portal')
      if (account.passwordHash && account.salt) {
        const ok = await verifyPassword(body.currentPassword, account.passwordHash, account.salt)
        if (!ok) return c.json<ApiResp>({ success: false, error: 'Current password incorrect' }, 401)
      }
      const { hash, salt } = await hashPassword(body.newPassword)
      account.passwordHash = hash
      account.salt = salt
      account.loginMethod = 'password'
    }

    if (body.email) {
      const emailKey = body.email.toLowerCase().trim()
      account.email = emailKey
      await c.env.OCULOFLOW_KV.put(`portal:email:${emailKey}`, session.patientId)
    }

    account.updatedAt = new Date().toISOString()
    await c.env.OCULOFLOW_KV.put(`portal:account:${session.patientId}`, JSON.stringify(account))
    return c.json<ApiResp>({ success: true, message: 'Account updated successfully' })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── GET /api/portal/exams  — patient exam / visit history ────────────────────
portalRoutes.get('/exams', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)

    const { ensureExamSeed, listExamsForPatient } = await import('../lib/exams')
    await ensureExamSeed(c.env.OCULOFLOW_KV)
    const exams = await listExamsForPatient(c.env.OCULOFLOW_KV, session.patientId)

    // Return a patient-safe summary (no internal staff notes)
    const summaries = exams.map(e => ({
      id: e.id,
      examDate: e.examDate,
      examType: e.examType,
      providerName: e.providerName ?? 'Your Care Team',
      chiefComplaint: e.chiefComplaint,
      diagnoses: ((e as any).diagnoses ?? []).map((d: any) => ({ code: d.code, description: d.description })),
      isSigned: (e as any).isSigned,
      hasRx: !!((e as any).sections?.refraction || (e as any).sections?.contactLens),
    }))

    return c.json<ApiResp>({ success: true, data: summaries })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── GET /api/portal/exams/:id  — single exam summary ────────────────────────
portalRoutes.get('/exams/:id', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)

    const { getExam } = await import('../lib/exams')
    const exam = await getExam(c.env.OCULOFLOW_KV, c.req.param('id'))
    if (!exam) return c.json<ApiResp>({ success: false, error: 'Exam not found' }, 404)
    if (exam.patientId !== session.patientId) return c.json<ApiResp>({ success: false, error: 'Access denied' }, 403)

    // Return patient-safe view
    return c.json<ApiResp>({
      success: true,
      data: {
        id: exam.id,
        examDate: exam.examDate,
        examType: exam.examType,
        providerName: exam.providerName ?? 'Your Care Team',
        chiefComplaint: exam.chiefComplaint,
        diagnoses: (exam as any).diagnoses ?? [],
        isSigned: (exam as any).isSigned,
        refraction: (exam as any).sections?.refraction,
        contactLens: (exam as any).sections?.contactLens,
        planInstructions: (exam as any).sections?.plan?.patientInstructions,
        followUpWeeks: (exam as any).sections?.plan?.followUp,
      }
    })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── POST /api/portal/appointments/:id/cancel  — patient cancels request ──────
portalRoutes.post('/appointments/:id/cancel', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)

    const id = c.req.param('id')
    const raw = await c.env.OCULOFLOW_KV.get(`portal:appt-req:${id}`)
    if (!raw) return c.json<ApiResp>({ success: false, error: 'Request not found' }, 404)
    const req = JSON.parse(raw)
    if (req.patientId !== session.patientId) return c.json<ApiResp>({ success: false, error: 'Access denied' }, 403)
    if (req.status !== 'PENDING') return c.json<ApiResp>({ success: false, error: 'Only pending requests can be cancelled' }, 400)

    req.status = 'CANCELLED'
    req.updatedAt = new Date().toISOString()
    await c.env.OCULOFLOW_KV.put(`portal:appt-req:${id}`, JSON.stringify(req))
    return c.json<ApiResp>({ success: true, message: 'Appointment request cancelled' })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── GET /api/portal/notifications/prefs  — get notification preferences ──────
portalRoutes.get('/notifications/prefs', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)

    const raw = await c.env.OCULOFLOW_KV.get(`portal:notif-prefs:${session.patientId}`)
    const prefs = raw ? JSON.parse(raw) : {
      appointmentReminders: true,
      recallNotices: true,
      billingAlerts: true,
      messageNotifications: true,
      preferredChannel: 'email',
      reminderLeadDays: 2,
    }
    return c.json<ApiResp>({ success: true, data: prefs })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── PATCH /api/portal/notifications/prefs  — update notification preferences ─
portalRoutes.patch('/notifications/prefs', async (c) => {
  try {
    const session = await resolveSession(c)
    if (!session) return c.json<ApiResp>({ success: false, error: 'Unauthorized' }, 401)

    const body = await c.req.json()
    const raw = await c.env.OCULOFLOW_KV.get(`portal:notif-prefs:${session.patientId}`)
    const existing = raw ? JSON.parse(raw) : {
      appointmentReminders: true, recallNotices: true,
      billingAlerts: true, messageNotifications: true,
      preferredChannel: 'email', reminderLeadDays: 2,
    }
    const updated = { ...existing, ...body, updatedAt: new Date().toISOString() }
    await c.env.OCULOFLOW_KV.put(`portal:notif-prefs:${session.patientId}`, JSON.stringify(updated))
    return c.json<ApiResp>({ success: true, data: updated, message: 'Notification preferences saved' })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── GET /api/portal/status  — portal module health / feature flags ────────────
portalRoutes.get('/status', async (c) => {
  return c.json<ApiResp>({
    success: true,
    data: {
      module: 'patient-portal',
      phase: 'B3',
      version: '3.1.0',
      features: [
        'dob-login', 'demo-session', 'magic-link', 'password-login',
        'account-registration', 'password-reset', 'appointment-requests',
        'appointment-cancel', 'secure-messages', 'rx-access',
        'optical-orders', 'billing-balance', 'exam-summaries',
        'notification-preferences', 'profile-management',
      ],
      authMethods: ['dob', 'magic_link', 'password'],
    }
  })
})

// ── DELETE /api/portal/auth/account/dev-reset  — dev/test only cleanup ───────
// Only available when DEMO_MODE is set (local dev). Cleans portal account by email.
portalRoutes.delete('/auth/account/dev-reset', async (c) => {
  const isDev = c.env.DEMO_MODE === 'true' || (c.env as any).NODE_ENV === 'development' || !(c.env as any).CLOUDFLARE_ACCOUNT_ID
  if (!isDev) return c.json<ApiResp>({ success: false, error: 'Not available in production' }, 403)

  try {
    const { email, patientId } = await c.req.json() as { email?: string; patientId?: string }
    const kv = c.env.OCULOFLOW_KV

    if (email) {
      const emailKey = email.toLowerCase().trim()
      const storedPatientId = await kv.get(`portal:email:${emailKey}`)
      if (storedPatientId) {
        await kv.delete(`portal:account:${storedPatientId}`)
        await kv.delete(`portal:email:${emailKey}`)
        return c.json<ApiResp>({ success: true, message: `Deleted portal account for ${emailKey}` })
      }
      return c.json<ApiResp>({ success: false, error: 'Account not found' }, 404)
    }

    if (patientId) {
      const raw = await kv.get(`portal:account:${patientId}`)
      if (raw) {
        const acc = JSON.parse(raw)
        await kv.delete(`portal:account:${patientId}`)
        if (acc.email) await kv.delete(`portal:email:${acc.email}`)
        return c.json<ApiResp>({ success: true, message: `Deleted portal account for patient ${patientId}` })
      }
      return c.json<ApiResp>({ success: false, error: 'Account not found' }, 404)
    }

    return c.json<ApiResp>({ success: false, error: 'email or patientId required' }, 400)
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

export default portalRoutes
