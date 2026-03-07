// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 4A + B3: Patient Portal Library
// Phase B3 adds: real email-based magic-link auth, patient account creation,
// password reset, email/DOB-based login, OTP verification
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PortalSession, PortalLoginRequest,
  AppointmentRequest, AppointmentRequestStatus, AppointmentRequestType,
  PortalMessage, MessageThread, MessageStatus, MessageCategory,
  PortalDashboard, PortalBalanceSummary, PortalExamSummary,
  PortalRxSummary, PortalOrderStatus,
} from '../types/portal'

// KV key constants
const KV_PORTAL_SESSION_PFX  = 'portal:session:'
const KV_APPT_REQ_INDEX      = 'portal:appt-requests:index'
const KV_APPT_REQ_PFX        = 'portal:appt-req:'
const KV_MSG_THREAD_INDEX    = 'portal:msg-threads:index'
const KV_MSG_THREAD_PFX      = 'portal:msg-thread:'
const KV_MSG_PFX             = 'portal:msg:'

// ── Utilities ─────────────────────────────────────────────────────────────────

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`
}

async function getIndex(kv: KVNamespace, key: string): Promise<string[]> {
  const raw = await kv.get(key)
  return raw ? JSON.parse(raw) : []
}

async function addToIndex(kv: KVNamespace, key: string, id: string): Promise<void> {
  const ids = await getIndex(kv, key)
  if (!ids.includes(id)) { ids.unshift(id); await kv.put(key, JSON.stringify(ids)) }
}

// ── Portal Authentication ─────────────────────────────────────────────────────

export async function portalLogin(
  kv: KVNamespace,
  req: PortalLoginRequest
): Promise<{ success: boolean; session?: PortalSession; error?: string }> {
  // Fetch patient by last name match from patient KV index
  const patientIndexRaw = await kv.get('patients:index')
  if (!patientIndexRaw) return { success: false, error: 'No patient records found' }

  const patientIds: string[] = JSON.parse(patientIndexRaw)
  let matchedPatient: any = null

  for (const pid of patientIds) {
    const raw = await kv.get(`patient:${pid}`)
    if (!raw) continue
    const p = JSON.parse(raw)
    const lastNameMatch = p.lastName?.toLowerCase() === req.lastName.toLowerCase() ||
      p.name?.toLowerCase().includes(req.lastName.toLowerCase())
    const dobMatch = p.dob === req.dob || p.dateOfBirth === req.dob
    const mrnMatch = req.mrn ? p.mrn === req.mrn || p.id === req.mrn : true
    const emailMatch = req.email ? p.email?.toLowerCase() === req.email.toLowerCase() : true
    if (lastNameMatch && dobMatch && (req.mrn ? mrnMatch : true) && (req.email ? emailMatch : true)) {
      matchedPatient = p
      break
    }
  }

  if (!matchedPatient) return { success: false, error: 'No matching patient record found' }

  const now = new Date()
  const expires = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour
  const session: PortalSession = {
    sessionId: uid('psess'),
    patientId: matchedPatient.id,
    patientName: matchedPatient.name ?? `${matchedPatient.firstName} ${matchedPatient.lastName}`,
    patientEmail: matchedPatient.email ?? '',
    patientDob: matchedPatient.dob ?? matchedPatient.dateOfBirth ?? '',
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    lastActivity: now.toISOString(),
  }

  await kv.put(`${KV_PORTAL_SESSION_PFX}${session.sessionId}`, JSON.stringify(session), {
    expirationTtl: 3600,
  })
  return { success: true, session }
}

export async function getPortalSession(kv: KVNamespace, sessionId: string): Promise<PortalSession | null> {
  const raw = await kv.get(`${KV_PORTAL_SESSION_PFX}${sessionId}`)
  if (!raw) return null
  const session: PortalSession = JSON.parse(raw)
  if (new Date(session.expiresAt) < new Date()) return null
  // Refresh activity timestamp
  session.lastActivity = new Date().toISOString()
  await kv.put(`${KV_PORTAL_SESSION_PFX}${sessionId}`, JSON.stringify(session), { expirationTtl: 3600 })
  return session
}

export async function portalLogout(kv: KVNamespace, sessionId: string): Promise<void> {
  await kv.delete(`${KV_PORTAL_SESSION_PFX}${sessionId}`)
}

// ── Demo Session (no auth) ────────────────────────────────────────────────────
// For demo mode: create a pre-authenticated session for pat-001

export async function createDemoSession(kv: KVNamespace): Promise<PortalSession> {
  const patRaw = await kv.get('patient:pat-001')
  const patient = patRaw ? JSON.parse(patRaw) : null
  const now = new Date()
  const session: PortalSession = {
    sessionId: uid('psess'),
    patientId: 'pat-001',
    patientName: patient?.name ?? 'Margaret Sullivan',
    patientEmail: patient?.email ?? 'margaret.sullivan@email.com',
    patientDob: patient?.dob ?? '1955-04-12',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 3600_000).toISOString(),
    lastActivity: now.toISOString(),
  }
  await kv.put(`${KV_PORTAL_SESSION_PFX}${session.sessionId}`, JSON.stringify(session), { expirationTtl: 3600 })
  return session
}

// ── Appointment Requests ──────────────────────────────────────────────────────

export async function createAppointmentRequest(
  kv: KVNamespace,
  patientId: string,
  patientName: string,
  input: {
    requestType: AppointmentRequestType
    preferredDates: string[]
    preferredTimes: string[]
    preferredProvider?: string
    reason: string
    urgency: 'routine' | 'soon' | 'urgent'
    patientNotes?: string
    patientPhone?: string
    patientEmail?: string
  }
): Promise<AppointmentRequest> {
  const now = new Date().toISOString()
  const req: AppointmentRequest = {
    id: uid('areq'),
    patientId, patientName,
    patientPhone: input.patientPhone,
    patientEmail: input.patientEmail,
    requestType: input.requestType,
    preferredDates: input.preferredDates,
    preferredTimes: input.preferredTimes,
    preferredProvider: input.preferredProvider,
    reason: input.reason,
    urgency: input.urgency,
    patientNotes: input.patientNotes,
    status: 'PENDING',
    createdAt: now, updatedAt: now,
  }
  await kv.put(`${KV_APPT_REQ_PFX}${req.id}`, JSON.stringify(req))
  await addToIndex(kv, KV_APPT_REQ_INDEX, req.id)
  return req
}

export async function listAppointmentRequests(
  kv: KVNamespace, patientId?: string, status?: AppointmentRequestStatus
): Promise<AppointmentRequest[]> {
  const ids = await getIndex(kv, KV_APPT_REQ_INDEX)
  const items = await Promise.all(ids.map(async id => {
    const raw = await kv.get(`${KV_APPT_REQ_PFX}${id}`)
    return raw ? JSON.parse(raw) as AppointmentRequest : null
  }))
  let results = items.filter(Boolean) as AppointmentRequest[]
  if (patientId) results = results.filter(r => r.patientId === patientId)
  if (status)    results = results.filter(r => r.status === status)
  return results
}

export async function updateAppointmentRequest(
  kv: KVNamespace, id: string,
  updates: Partial<Pick<AppointmentRequest, 'status' | 'confirmedDate' | 'confirmedTime' | 'confirmedProvider' | 'confirmedProviderId' | 'appointmentId' | 'staffNotes'>>
): Promise<AppointmentRequest | null> {
  const raw = await kv.get(`${KV_APPT_REQ_PFX}${id}`)
  if (!raw) return null
  const req: AppointmentRequest = { ...JSON.parse(raw), ...updates, updatedAt: new Date().toISOString() }
  await kv.put(`${KV_APPT_REQ_PFX}${id}`, JSON.stringify(req))
  return req
}

// ── Secure Messaging ──────────────────────────────────────────────────────────

export async function sendMessage(
  kv: KVNamespace,
  input: {
    patientId: string
    patientName: string
    subject: string
    category: MessageCategory
    body: string
    fromPatient: boolean
    senderName: string
    threadId?: string        // if replying to existing thread
    attachmentNote?: string
  }
): Promise<{ message: PortalMessage; thread: MessageThread }> {
  const now = new Date().toISOString()
  const threadId = input.threadId ?? uid('thread')

  const msg: PortalMessage = {
    id: uid('msg'),
    threadId,
    patientId: input.patientId,
    patientName: input.patientName,
    subject: input.subject,
    category: input.category,
    body: input.body,
    fromPatient: input.fromPatient,
    senderName: input.senderName,
    status: 'UNREAD',
    attachmentNote: input.attachmentNote,
    createdAt: now,
  }
  await kv.put(`${KV_MSG_PFX}${msg.id}`, JSON.stringify(msg))

  // Update or create thread
  let thread: MessageThread
  const existingRaw = await kv.get(`${KV_MSG_THREAD_PFX}${threadId}`)
  if (existingRaw) {
    const existing: MessageThread = JSON.parse(existingRaw)
    thread = {
      ...existing,
      lastMessage: msg,
      messageCount: existing.messageCount + 1,
      status: input.fromPatient ? 'UNREAD' : 'REPLIED',
      updatedAt: now,
    }
  } else {
    thread = {
      threadId,
      subject: input.subject,
      category: input.category,
      patientId: input.patientId,
      patientName: input.patientName,
      lastMessage: msg,
      messageCount: 1,
      status: 'UNREAD',
      createdAt: now,
      updatedAt: now,
    }
    await addToIndex(kv, KV_MSG_THREAD_INDEX, threadId)
  }
  await kv.put(`${KV_MSG_THREAD_PFX}${threadId}`, JSON.stringify(thread))
  return { message: msg, thread }
}

export async function listMessageThreads(
  kv: KVNamespace, patientId?: string
): Promise<MessageThread[]> {
  const ids = await getIndex(kv, KV_MSG_THREAD_INDEX)
  const items = await Promise.all(ids.map(async id => {
    const raw = await kv.get(`${KV_MSG_THREAD_PFX}${id}`)
    return raw ? JSON.parse(raw) as MessageThread : null
  }))
  let results = items.filter(Boolean) as MessageThread[]
  if (patientId) results = results.filter(t => t.patientId === patientId)
  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getThreadMessages(
  kv: KVNamespace, threadId: string
): Promise<PortalMessage[]> {
  const thread = await kv.get(`${KV_MSG_THREAD_PFX}${threadId}`)
  if (!thread) return []
  // Scan messages belonging to this thread (small dataset, linear scan is OK)
  // In production you'd maintain a thread:msgs index; for demo we embed in the thread
  const t: MessageThread & { messageIds?: string[] } = JSON.parse(thread)
  if (!t.messageIds?.length) {
    // Return the last message at minimum
    return [t.lastMessage]
  }
  const msgs = await Promise.all(t.messageIds.map(async id => {
    const raw = await kv.get(`${KV_MSG_PFX}${id}`)
    return raw ? JSON.parse(raw) as PortalMessage : null
  }))
  return (msgs.filter(Boolean) as PortalMessage[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function markThreadRead(kv: KVNamespace, threadId: string): Promise<void> {
  const raw = await kv.get(`${KV_MSG_THREAD_PFX}${threadId}`)
  if (!raw) return
  const thread: MessageThread = JSON.parse(raw)
  if (thread.status === 'UNREAD') {
    thread.status = 'READ'
    thread.lastMessage.status = 'READ'
    thread.lastMessage.readAt = new Date().toISOString()
    await kv.put(`${KV_MSG_THREAD_PFX}${threadId}`, JSON.stringify(thread))
  }
}

// ── Seed Messages ──────────────────────────────────────────────────────────────

let _msgSeeded = false

export async function ensureMessageSeed(kv: KVNamespace): Promise<void> {
  if (_msgSeeded) return
  const existing = await kv.get(KV_MSG_THREAD_INDEX)
  if (existing) { _msgSeeded = true; return }

  // Seed a welcome message and a glasses status message for pat-001
  await sendMessage(kv, {
    patientId: 'pat-001', patientName: 'Margaret Sullivan',
    subject: 'Welcome to the OculoFlow Patient Portal',
    category: 'GENERAL',
    body: 'Welcome to your patient portal! Here you can request appointments, view your prescriptions and exam records, check on your glasses order, review your balance, and send secure messages to our team.\n\nIf you have any questions, don\'t hesitate to reach out.',
    fromPatient: false,
    senderName: 'OculoFlow Team',
  })

  await sendMessage(kv, {
    patientId: 'pat-001', patientName: 'Margaret Sullivan',
    subject: 'Your glasses are ready for pickup!',
    category: 'OPTICAL_ORDER_STATUS',
    body: 'Great news! Your glasses (Order OPT-260307-1001 — Maui Jim Westside with Progressive lenses) have been received from the lab and are ready for pickup at our office.\n\nPlease bring your insurance card and a valid ID. Your remaining balance is $165.00.',
    fromPatient: false,
    senderName: 'Optical Department',
  })

  _msgSeeded = true
}

// ── Portal Dashboard Aggregation ──────────────────────────────────────────────

export async function getPortalDashboard(
  kv: KVNamespace, patientId: string
): Promise<PortalDashboard> {
  // Load patient record
  const patRaw = await kv.get(`patient:${patientId}`)
  const patient = patRaw ? JSON.parse(patRaw) : { id: patientId, name: 'Unknown', dob: '', email: '' }

  // Load upcoming appointments
  const apptIndexRaw = await kv.get('appts:index')
  const apptIds: string[] = apptIndexRaw ? JSON.parse(apptIndexRaw) : []
  const today = new Date().toISOString().slice(0, 10)
  const upcomingAppts: PortalDashboard['upcomingAppointments'] = []

  for (const aid of apptIds.slice(0, 30)) {
    const raw = await kv.get(`appt:${aid}`)
    if (!raw) continue
    const a = JSON.parse(raw)
    if (a.patientId === patientId && a.date >= today && a.status !== 'CANCELLED') {
      upcomingAppts.push({
        date: a.date, time: a.startTime ?? a.time,
        provider: a.providerName ?? a.providerId,
        type: (a.appointmentType ?? '').replace(/_/g, ' '),
        status: a.status,
      })
    }
  }
  upcomingAppts.sort((a, b) => a.date.localeCompare(b.date))

  // Load appointment requests
  const pendingRequests = await listAppointmentRequests(kv, patientId, 'PENDING')

  // Load recent exams (last 3)
  const examIndexRaw = await kv.get('exams:index')
  const examIds: string[] = examIndexRaw ? JSON.parse(examIndexRaw) : []
  const recentExams: PortalExamSummary[] = []

  for (const eid of examIds.slice(0, 10)) {
    const raw = await kv.get(`exam:${eid}`)
    if (!raw) continue
    const e = JSON.parse(raw)
    if (e.patientId !== patientId) continue
    recentExams.push({
      examId: e.id,
      examDate: e.examDate ?? e.date ?? '',
      providerName: e.providerName ?? e.providerId ?? '',
      examType: (e.examType ?? '').replace(/_/g, ' '),
      diagnoses: (e.assessment?.diagnoses ?? []).slice(0, 3).map((d: any) => ({
        code: d.code ?? d.icd10 ?? '',
        description: d.description ?? d.desc ?? '',
      })),
      visionOD: e.visualAcuity?.od?.bcva ?? e.visualAcuity?.od?.ucva ?? undefined,
      visionOS: e.visualAcuity?.os?.bcva ?? e.visualAcuity?.os?.ucva ?? undefined,
      iopOD: e.iop?.od ?? undefined,
      iopOS: e.iop?.os ?? undefined,
      recommendations: e.assessment?.plan ?? e.plan ?? undefined,
      followUpIn: e.assessment?.followUp ?? undefined,
      signed: e.status === 'SIGNED' || e.signed === true,
    })
    if (recentExams.length >= 3) break
  }

  // Load active Rx (from optical)
  const rxIndexRaw = await kv.get('optical:rx:index')
  const rxIds: string[] = rxIndexRaw ? JSON.parse(rxIndexRaw) : []
  let activeRx: PortalRxSummary | undefined

  for (const rid of rxIds) {
    const raw = await kv.get(`optical:rx:${rid}`)
    if (!raw) continue
    const rx = JSON.parse(raw)
    if (rx.patientId !== patientId) continue
    if (!rx.signed) continue
    // Use most recent
    if (!activeRx || rx.rxDate > (activeRx as any).rxDate) {
      activeRx = {
        rxId: rx.id, rxDate: rx.rxDate, expiresDate: rx.expiresDate,
        providerName: rx.providerName ?? rx.providerId,
        lensType: (rx.lensType ?? '').replace(/_/g, ' '),
        signed: rx.signed,
        od: rx.od ?? {}, os: rx.os ?? {},
        binocularPd: rx.binocularPd,
      }
    }
  }

  // Load optical orders
  const ordIndexRaw = await kv.get('optical:orders:index')
  const ordIds: string[] = ordIndexRaw ? JSON.parse(ordIndexRaw) : []
  const opticalOrders: PortalOrderStatus[] = []

  for (const oid of ordIds) {
    const raw = await kv.get(`optical:order:${oid}`)
    if (!raw) continue
    const o = JSON.parse(raw)
    if (o.patientId !== patientId) continue
    if (o.status === 'CANCELLED') continue
    const liSummary = o.lineItems?.slice(0, 2).map((li: any) => li.description).join(' + ') ?? ''
    opticalOrders.push({
      orderId: o.id, orderNumber: o.orderNumber,
      orderType: (o.orderType ?? '').replace(/_/g, ' '),
      status: o.status, lab: o.lab,
      estimatedReady: o.estimatedReady, receivedAt: o.receivedAt, dispensedAt: o.dispensedAt,
      totalCharge: o.totalCharge, balanceDue: o.balanceDue,
      lineItemsSummary: liSummary,
      lastUpdated: o.updatedAt,
    })
  }

  // Load billing balance
  const sbIndexRaw = await kv.get('superbills:index')
  const sbIds: string[] = sbIndexRaw ? JSON.parse(sbIndexRaw) : []
  const balanceItems: PortalBalanceSummary['items'] = []
  let totalBalance = 0

  for (const sid of sbIds) {
    const raw = await kv.get(`superbill:${sid}`)
    if (!raw) continue
    const sb = JSON.parse(raw)
    if (sb.patientId !== patientId) continue
    if (['VOIDED', 'PAID'].includes(sb.status)) continue
    const bal = sb.patientBalance ?? sb.totalCharge ?? 0
    totalBalance += bal
    balanceItems.push({
      superbillId: sb.id,
      serviceDate: sb.serviceDate ?? '',
      description: `${sb.examType ?? 'Visit'} — ${sb.status}`,
      totalCharge: sb.totalCharge ?? 0,
      insurancePaid: sb.insurancePaid ?? 0,
      patientBalance: bal,
      status: sb.status,
    })
  }

  // Load messages
  await ensureMessageSeed(kv)
  const threads = await listMessageThreads(kv, patientId)
  const unreadMessages = threads.filter(t => t.status === 'UNREAD').length

  // Load patient insurance name
  const insurance = patient.insurancePlans?.[0]?.insuranceName ??
    patient.insurance?.primary?.planName ?? undefined

  return {
    patient: {
      id: patient.id, name: patient.name ?? `${patient.firstName} ${patient.lastName}`,
      dob: patient.dob ?? patient.dateOfBirth ?? '',
      email: patient.email ?? '',
      phone: patient.phone ?? patient.cellPhone ?? '',
      insuranceName: insurance,
    },
    upcomingAppointments: upcomingAppts.slice(0, 5),
    pendingRequests,
    recentExams,
    activeRx,
    opticalOrders,
    balanceSummary: { totalBalance, superbillCount: balanceItems.length, items: balanceItems },
    unreadMessages,
    recentMessages: threads.slice(0, 5),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase B3 — Patient Portal Real Auth
// Magic-link login (email + 6-digit OTP), patient account creation,
// password change, and email/DOB direct login
// ─────────────────────────────────────────────────────────────────────────────

import { sendEmail, type EmailConfig } from './sms'

const KV_PORTAL_ACCOUNT_PFX  = 'portal:account:'       // by patientId
const KV_PORTAL_EMAIL_IDX    = 'portal:email:'         // email → patientId
const KV_PORTAL_MAGIC_PFX    = 'portal:magic:'         // magic-link tokens
const KV_PORTAL_OTP_PFX      = 'portal:otp:'           // OTP codes
const MAGIC_LINK_TTL         = 60 * 15                 // 15 minutes
const OTP_TTL                = 60 * 10                 // 10 minutes
const SESSION_TTL            = 60 * 60 * 8             // 8 hours (extended)

export interface PortalAccount {
  patientId:     string
  email:         string
  passwordHash?: string  // PBKDF2 hex (optional — can use magic-link only)
  createdAt:     string
  updatedAt:     string
  lastLogin?:    string
  loginMethod:   'magic_link' | 'password' | 'dob'
  emailVerified: boolean
}

// ── Crypto helpers ─────────────────────────────────────────────────────────────
async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const s = salt ?? Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => b.toString(16).padStart(2, '0')).join('')
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(s), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial, 256
  )
  const hash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('')
  return { hash, salt: s }
}

async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
  const { hash } = await hashPassword(password, salt)
  return hash === storedHash
}

function generateOtp(): string {
  // 6-digit numeric OTP
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return String(arr[0] % 1_000_000).padStart(6, '0')
}

function generateToken(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Account CRUD ───────────────────────────────────────────────────────────────

export async function getPortalAccount(kv: KVNamespace, patientId: string): Promise<PortalAccount | null> {
  const raw = await kv.get(`${KV_PORTAL_ACCOUNT_PFX}${patientId}`)
  return raw ? JSON.parse(raw) : null
}

export async function getPortalAccountByEmail(kv: KVNamespace, email: string): Promise<PortalAccount | null> {
  const emailKey = email.toLowerCase().trim()
  const patientId = await kv.get(`${KV_PORTAL_EMAIL_IDX}${emailKey}`)
  if (!patientId) return null
  return getPortalAccount(kv, patientId)
}

export async function createPortalAccount(
  kv: KVNamespace,
  opts: { patientId: string; email: string; password?: string }
): Promise<{ success: boolean; account?: PortalAccount; error?: string }> {
  const emailKey = opts.email.toLowerCase().trim()

  // Check if account already exists
  const existing = await getPortalAccount(kv, opts.patientId)
  if (existing) return { success: false, error: 'Portal account already exists for this patient' }

  // Check email uniqueness
  const existingEmail = await kv.get(`${KV_PORTAL_EMAIL_IDX}${emailKey}`)
  if (existingEmail) return { success: false, error: 'An account with this email already exists' }

  const now = new Date().toISOString()
  const account: PortalAccount & { passwordHash?: string; salt?: string } = {
    patientId: opts.patientId,
    email: emailKey,
    createdAt: now,
    updatedAt: now,
    loginMethod: opts.password ? 'password' : 'magic_link',
    emailVerified: false,
  }

  if (opts.password) {
    const { hash, salt } = await hashPassword(opts.password)
    account.passwordHash = hash
    ;(account as any).salt = salt
  }

  await kv.put(`${KV_PORTAL_ACCOUNT_PFX}${opts.patientId}`, JSON.stringify(account))
  await kv.put(`${KV_PORTAL_EMAIL_IDX}${emailKey}`, opts.patientId)

  // Return without sensitive fields
  const { passwordHash: _, ...safeAccount } = account as any
  return { success: true, account: safeAccount }
}

// ── Magic-Link Flow ────────────────────────────────────────────────────────────

export async function initiatePortalMagicLink(
  kv: KVNamespace,
  email: string,
  emailConfig: EmailConfig | null,
  baseUrl: string
): Promise<{ success: boolean; token?: string; otp?: string; demo?: boolean; error?: string }> {
  const emailKey = email.toLowerCase().trim()

  // Find patient by email (check portal accounts first, then patient records)
  let patientId: string | null = null
  const account = await getPortalAccountByEmail(kv, emailKey)
  if (account) {
    patientId = account.patientId
  } else {
    // Search patient records by email
    const idxRaw = await kv.get('patients:index')
    const ids: string[] = idxRaw ? JSON.parse(idxRaw) : []
    for (const pid of ids) {
      const raw = await kv.get(`patient:${pid}`)
      if (!raw) continue
      const p = JSON.parse(raw)
      if (p.email?.toLowerCase() === emailKey) { patientId = pid; break }
    }
  }

  if (!patientId) {
    // Don't reveal whether email exists (security)
    return { success: true, demo: true }
  }

  const token = generateToken()
  const otp   = generateOtp()
  const magic = { patientId, email: emailKey, otp, createdAt: new Date().toISOString() }

  await kv.put(`${KV_PORTAL_MAGIC_PFX}${token}`, JSON.stringify(magic), { expirationTtl: MAGIC_LINK_TTL })
  await kv.put(`${KV_PORTAL_OTP_PFX}${emailKey}`, JSON.stringify({ token, otp, patientId, createdAt: magic.createdAt }), { expirationTtl: OTP_TTL })

  const magicUrl = `${baseUrl}/portal?magic=${token}`

  // Send email (real SendGrid if configured, otherwise demo mode)
  const isRealSendGrid = emailConfig && emailConfig.apiKey &&
    !emailConfig.apiKey.startsWith('SG.XXXXXXXX') &&
    !emailConfig.apiKey.includes('your-sendgrid-key') &&
    emailConfig.apiKey.startsWith('SG.') &&
    emailConfig.apiKey.length > 30

  if (isRealSendGrid) {
    await sendEmail(
      {
        to: emailKey,
        subject: 'Your OculoFlow Patient Portal Login',
        html: `<p>Click the link below to log in to your patient portal (valid for 15 minutes):</p>
<p><a href="${magicUrl}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;">Log In to Portal</a></p>
<p>Or enter this 6-digit code: <strong>${otp}</strong></p>
<p>If you did not request this, please ignore this email.</p>`,
        text: `Log in to OculoFlow Portal: ${magicUrl}\nOr enter code: ${otp}\nExpires in 15 minutes.`,
      },
      emailConfig!
    )
    return { success: true }
  }

  // Demo mode — return token + OTP directly
  return { success: true, token, otp, demo: true }
}

export async function verifyPortalMagicLink(
  kv: KVNamespace,
  opts: { token?: string; email?: string; otp?: string }
): Promise<{ success: boolean; patientId?: string; error?: string }> {
  // Token-based verification
  if (opts.token) {
    const raw = await kv.get(`${KV_PORTAL_MAGIC_PFX}${opts.token}`)
    if (!raw) return { success: false, error: 'Invalid or expired magic link' }
    const magic = JSON.parse(raw)
    await kv.delete(`${KV_PORTAL_MAGIC_PFX}${opts.token}`)  // single use
    return { success: true, patientId: magic.patientId }
  }

  // OTP-based verification
  if (opts.email && opts.otp) {
    const emailKey = opts.email.toLowerCase().trim()
    const raw = await kv.get(`${KV_PORTAL_OTP_PFX}${emailKey}`)
    if (!raw) return { success: false, error: 'No pending OTP for this email' }
    const stored = JSON.parse(raw)
    if (stored.otp !== opts.otp) return { success: false, error: 'Invalid OTP code' }
    await kv.delete(`${KV_PORTAL_OTP_PFX}${emailKey}`)
    return { success: true, patientId: stored.patientId }
  }

  return { success: false, error: 'token or (email + otp) required' }
}

// ── Password-based Login ───────────────────────────────────────────────────────

export async function portalPasswordLogin(
  kv: KVNamespace,
  email: string,
  password: string
): Promise<{ success: boolean; patientId?: string; error?: string }> {
  const account = await getPortalAccountByEmail(kv, email)
  if (!account) return { success: false, error: 'Invalid email or password' }

  const raw = await kv.get(`${KV_PORTAL_ACCOUNT_PFX}${account.patientId}`)
  if (!raw) return { success: false, error: 'Invalid email or password' }
  const full = JSON.parse(raw)

  if (!full.passwordHash || !full.salt) return { success: false, error: 'No password set — please use magic link login' }

  const ok = await verifyPassword(password, full.passwordHash, full.salt)
  if (!ok) return { success: false, error: 'Invalid email or password' }

  return { success: true, patientId: account.patientId }
}

// ── Password Reset ─────────────────────────────────────────────────────────────

export async function initiatePasswordReset(
  kv: KVNamespace,
  email: string,
  emailConfig: EmailConfig | null,
  baseUrl: string
): Promise<{ success: boolean; token?: string; demo?: boolean }> {
  // Reuse magic-link flow for reset — same security, different UI prompt
  return initiatePortalMagicLink(kv, email, emailConfig, `${baseUrl}/portal?reset=1`)
}

export async function completePasswordReset(
  kv: KVNamespace,
  opts: { token?: string; email?: string; otp?: string; newPassword: string }
): Promise<{ success: boolean; error?: string }> {
  const verify = await verifyPortalMagicLink(kv, { token: opts.token, email: opts.email, otp: opts.otp })
  if (!verify.success || !verify.patientId) return { success: false, error: verify.error }

  const raw = await kv.get(`${KV_PORTAL_ACCOUNT_PFX}${verify.patientId}`)
  if (!raw) {
    // Auto-create account on password reset if it doesn't exist
    const emailKey = opts.email?.toLowerCase().trim() ?? ''
    await createPortalAccount(kv, { patientId: verify.patientId, email: emailKey, password: opts.newPassword })
    return { success: true }
  }

  const account = JSON.parse(raw)
  const { hash, salt } = await hashPassword(opts.newPassword)
  account.passwordHash  = hash
  account.salt          = salt
  account.loginMethod   = 'password'
  account.updatedAt     = new Date().toISOString()

  await kv.put(`${KV_PORTAL_ACCOUNT_PFX}${verify.patientId}`, JSON.stringify(account))
  return { success: true }
}

// ── Unified portal session creator (for B3) ────────────────────────────────────

export async function createPortalSession(
  kv: KVNamespace,
  patientId: string
): Promise<PortalSession | null> {
  // Load patient data
  const idxRaw = await kv.get('patients:index')
  const ids: string[] = idxRaw ? JSON.parse(idxRaw) : []
  // Try direct key first
  let patientRaw = await kv.get(`patient:${patientId}`)
  if (!patientRaw) {
    for (const pid of ids) {
      const raw = await kv.get(`patient:${pid}`)
      if (!raw) continue
      const p = JSON.parse(raw)
      if (p.id === patientId) { patientRaw = raw; break }
    }
  }
  if (!patientRaw) return null
  const patient = JSON.parse(patientRaw)

  const now = new Date()
  const expires = new Date(now.getTime() + SESSION_TTL * 1000)
  const session: PortalSession = {
    sessionId:    uid('psess'),
    patientId:    patient.id,
    patientName:  patient.name ?? `${patient.firstName} ${patient.lastName}`,
    patientEmail: patient.email ?? '',
    patientDob:   patient.dob ?? patient.dateOfBirth ?? '',
    createdAt:    now.toISOString(),
    expiresAt:    expires.toISOString(),
    lastActivity: now.toISOString(),
  }

  await kv.put(`${KV_PORTAL_SESSION_PFX}${session.sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  })

  // Update last login on account
  const accountRaw = await kv.get(`${KV_PORTAL_ACCOUNT_PFX}${patientId}`)
  if (accountRaw) {
    const acc = JSON.parse(accountRaw)
    acc.lastLogin = now.toISOString()
    await kv.put(`${KV_PORTAL_ACCOUNT_PFX}${patientId}`, JSON.stringify(acc))
  }

  return session
}

// Auto-create portal account for any patient if they don't have one yet
export async function ensurePortalAccount(
  kv: KVNamespace,
  patientId: string,
  email: string
): Promise<PortalAccount> {
  const existing = await getPortalAccount(kv, patientId)
  if (existing) return existing
  const result = await createPortalAccount(kv, { patientId, email })
  return result.account!
}
