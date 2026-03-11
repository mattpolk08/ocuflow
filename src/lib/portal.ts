// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 4A + B3: Patient Portal Library
// Priority-1 D1 Migration: appointment requests, messages, portal accounts all
// now write to D1 when db is provided; KV is kept only for ephemeral TTL data
// (sessions, magic-link tokens, OTPs).
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PortalSession, PortalLoginRequest,
  AppointmentRequest, AppointmentRequestStatus, AppointmentRequestType,
  PortalMessage, MessageThread, MessageStatus, MessageCategory,
  PortalDashboard, PortalBalanceSummary, PortalExamSummary,
  PortalRxSummary, PortalOrderStatus,
} from '../types/portal'

// KV key constants — only for ephemeral / TTL data
const KV_PORTAL_SESSION_PFX  = 'portal:session:'
const KV_PORTAL_MAGIC_PFX    = 'portal:magic:'
const KV_PORTAL_OTP_PFX      = 'portal:otp:'

// ── Utilities ─────────────────────────────────────────────────────────────────

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`
}

// ── KV helpers (legacy — only used by KV session/magic/otp paths) ─────────────
async function getIndex(kv: KVNamespace, key: string): Promise<string[]> {
  const raw = await kv.get(key)
  return raw ? JSON.parse(raw) : []
}

async function addToIndex(kv: KVNamespace, key: string, id: string): Promise<void> {
  const ids = await getIndex(kv, key)
  if (!ids.includes(id)) { ids.unshift(id); await kv.put(key, JSON.stringify(ids)) }
}

// ── Row → domain object helpers ───────────────────────────────────────────────

function rowToApptRequest(r: Record<string, unknown>): AppointmentRequest {
  return {
    id: r.id as string,
    patientId: r.patient_id as string,
    patientName: r.patient_name as string,
    patientPhone: r.patient_phone as string | undefined,
    patientEmail: r.patient_email as string | undefined,
    requestType: r.request_type as AppointmentRequestType,
    preferredDates: r.preferred_dates ? JSON.parse(r.preferred_dates as string) : [],
    preferredTimes: r.preferred_times ? JSON.parse(r.preferred_times as string) : [],
    preferredProvider: r.preferred_provider as string | undefined,
    reason: r.reason as string,
    urgency: r.urgency as 'routine' | 'soon' | 'urgent',
    patientNotes: r.patient_notes as string | undefined,
    staffNotes: r.staff_notes as string | undefined,
    status: r.status as AppointmentRequestStatus,
    confirmedDate: r.confirmed_date as string | undefined,
    confirmedTime: r.confirmed_time as string | undefined,
    confirmedProvider: r.confirmed_provider as string | undefined,
    confirmedProviderId: r.confirmed_provider_id as string | undefined,
    appointmentId: r.appointment_id as string | undefined,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

function rowToThread(r: Record<string, unknown>, lastMsg?: PortalMessage, count?: number): MessageThread {
  return {
    threadId: r.id as string,
    subject: r.subject as string,
    category: r.category as MessageCategory,
    patientId: r.patient_id as string,
    patientName: r.patient_name as string,
    lastMessage: lastMsg ?? ({} as PortalMessage),
    messageCount: (r.message_count as number) ?? count ?? 0,
    status: r.status as MessageStatus,
    createdAt: r.created_at as string,
    updatedAt: (r.updated_at as string) ?? (r.last_message_at as string) ?? (r.created_at as string),
  }
}

function rowToMessage(r: Record<string, unknown>, thread?: Record<string, unknown>): PortalMessage {
  return {
    id: r.id as string,
    threadId: r.thread_id as string,
    patientId: (r.patient_id as string) ?? (thread?.patient_id as string) ?? '',
    patientName: (r.patient_name as string) ?? (thread?.patient_name as string) ?? '',
    subject: (r.subject as string) ?? (thread?.subject as string) ?? '',
    category: ((r.category as string) ?? (thread?.category as string) ?? 'GENERAL') as MessageCategory,
    body: r.body as string,
    fromPatient: (r.from_patient as number) === 1,
    senderName: r.sender_name as string,
    status: ((r.status as string) ?? 'UNREAD') as MessageStatus,
    attachmentNote: r.attachment_note as string | undefined,
    createdAt: r.created_at as string,
    readAt: r.read_at as string | undefined,
  }
}

// ── Portal Authentication ─────────────────────────────────────────────────────

export async function portalLogin(
  kv: KVNamespace,
  req: PortalLoginRequest,
  db?: D1Database
): Promise<{ success: boolean; session?: PortalSession; error?: string }> {
  let matchedPatient: any = null

  if (db) {
    const { dbAll } = await import('./db')
    let sql = 'SELECT * FROM patients WHERE LOWER(last_name) = LOWER(?) AND date_of_birth = ? AND is_active = 1'
    const params: (string | number | boolean | null)[] = [req.lastName, req.dob]
    if (req.mrn)   { sql += ' AND mrn = ?';               params.push(req.mrn) }
    if (req.email) { sql += ' AND LOWER(email) = LOWER(?)'; params.push(req.email) }
    const rows = await dbAll<Record<string, unknown>>(db, sql, params)
    if (rows.length > 0) {
      const r = rows[0]
      matchedPatient = {
        id: r.id as string,
        name: `${r.first_name} ${r.last_name}`,
        email: r.email as string,
        dob: r.date_of_birth as string,
        dateOfBirth: r.date_of_birth as string,
      }
    }
  } else {
    const patientIndexRaw = await kv.get('patients:index')
    if (patientIndexRaw) {
      const patientIds: string[] = JSON.parse(patientIndexRaw)
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
          matchedPatient = p; break
        }
      }
    }
  }

  if (!matchedPatient) return { success: false, error: 'No matching patient record found' }

  const now = new Date()
  const expires = new Date(now.getTime() + 60 * 60 * 1000)
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
  session.lastActivity = new Date().toISOString()
  await kv.put(`${KV_PORTAL_SESSION_PFX}${session.sessionId}`, JSON.stringify(session), { expirationTtl: 3600 })
  return session
}

export async function portalLogout(kv: KVNamespace, sessionId: string): Promise<void> {
  await kv.delete(`${KV_PORTAL_SESSION_PFX}${sessionId}`)
}

// ── Demo Session (no auth) ────────────────────────────────────────────────────

export async function createDemoSession(kv: KVNamespace, db?: D1Database): Promise<PortalSession> {
  let patientName = 'Margaret Sullivan'
  let patientEmail = 'msullivan@email.com'
  let patientDob = '1948-03-12'
  let patientId = 'pt-001'

  if (db) {
    const { dbGet } = await import('./db')
    const row = await dbGet<Record<string, unknown>>(db, 'SELECT * FROM patients WHERE id = ?', ['pt-001'])
    if (row) {
      patientId    = row.id as string
      patientName  = `${row.first_name} ${row.last_name}`
      patientEmail = (row.email as string) || patientEmail
      patientDob   = (row.date_of_birth as string) || patientDob
    }
  } else {
    const raw = await kv.get('patient:pat-001') ?? await kv.get('patient:pt-001')
    if (raw) {
      const p = JSON.parse(raw)
      patientId    = p.id ?? patientId
      patientName  = (p.name ?? `${p.firstName ?? ''} ${p.lastName ?? ''}`).trim() || patientName
      patientEmail = p.email ?? patientEmail
      patientDob   = p.dob ?? p.dateOfBirth ?? patientDob
    }
  }

  const now = new Date()
  const session: PortalSession = {
    sessionId: uid('psess'),
    patientId,
    patientName,
    patientEmail,
    patientDob,
    createdAt:    now.toISOString(),
    expiresAt:    new Date(now.getTime() + 3600_000).toISOString(),
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
  },
  db?: D1Database
): Promise<AppointmentRequest> {
  const nowStr = new Date().toISOString()
  const id = uid('areq')

  if (db) {
    const { dbRun, dbGet } = await import('./db')
    await dbRun(db,
      `INSERT INTO portal_appointment_requests
         (id, patient_id, patient_name, patient_phone, patient_email,
          request_type, preferred_dates, preferred_times, preferred_provider,
          reason, urgency, patient_notes, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'PENDING',?,?)`,
      [
        id, patientId, patientName,
        input.patientPhone ?? null, input.patientEmail ?? null,
        input.requestType,
        JSON.stringify(input.preferredDates),
        JSON.stringify(input.preferredTimes),
        input.preferredProvider ?? null,
        input.reason, input.urgency,
        input.patientNotes ?? null,
        nowStr, nowStr,
      ]
    )
    const row = await dbGet<Record<string, unknown>>(db,
      'SELECT * FROM portal_appointment_requests WHERE id = ?', [id])
    return rowToApptRequest(row!)
  }

  // KV fallback
  const req: AppointmentRequest = {
    id, patientId, patientName,
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
    createdAt: nowStr, updatedAt: nowStr,
  }
  await kv.put(`portal:appt-req:${id}`, JSON.stringify(req))
  await addToIndex(kv, 'portal:appt-requests:index', id)
  return req
}

export async function listAppointmentRequests(
  kv: KVNamespace,
  patientId?: string,
  status?: AppointmentRequestStatus,
  db?: D1Database
): Promise<AppointmentRequest[]> {
  if (db) {
    const { dbAll } = await import('./db')
    let sql = 'SELECT * FROM portal_appointment_requests WHERE 1=1'
    const params: (string | null)[] = []
    if (patientId) { sql += ' AND patient_id = ?'; params.push(patientId) }
    if (status)    { sql += ' AND status = ?';     params.push(status) }
    sql += ' ORDER BY created_at DESC'
    const rows = await dbAll<Record<string, unknown>>(db, sql, params)
    return rows.map(rowToApptRequest)
  }

  // KV fallback
  const ids = await getIndex(kv, 'portal:appt-requests:index')
  const items = await Promise.all(ids.map(async id => {
    const raw = await kv.get(`portal:appt-req:${id}`)
    return raw ? JSON.parse(raw) as AppointmentRequest : null
  }))
  let results = items.filter(Boolean) as AppointmentRequest[]
  if (patientId) results = results.filter(r => r.patientId === patientId)
  if (status)    results = results.filter(r => r.status === status)
  return results
}

export async function updateAppointmentRequest(
  kv: KVNamespace,
  id: string,
  updates: Partial<Pick<AppointmentRequest,
    'status' | 'confirmedDate' | 'confirmedTime' | 'confirmedProvider' |
    'confirmedProviderId' | 'appointmentId' | 'staffNotes'>>,
  db?: D1Database
): Promise<AppointmentRequest | null> {
  if (db) {
    const { dbRun, dbGet } = await import('./db')
    const setClauses: string[] = ['updated_at = ?']
    const vals: (string | null)[] = [new Date().toISOString()]

    if (updates.status            !== undefined) { setClauses.push('status = ?');              vals.push(updates.status) }
    if (updates.confirmedDate     !== undefined) { setClauses.push('confirmed_date = ?');      vals.push(updates.confirmedDate ?? null) }
    if (updates.confirmedTime     !== undefined) { setClauses.push('confirmed_time = ?');      vals.push(updates.confirmedTime ?? null) }
    if (updates.confirmedProvider !== undefined) { setClauses.push('confirmed_provider = ?');  vals.push(updates.confirmedProvider ?? null) }
    if (updates.confirmedProviderId !== undefined) { setClauses.push('confirmed_provider_id = ?'); vals.push(updates.confirmedProviderId ?? null) }
    if (updates.appointmentId     !== undefined) { setClauses.push('appointment_id = ?');      vals.push(updates.appointmentId ?? null) }
    if (updates.staffNotes        !== undefined) { setClauses.push('staff_notes = ?');         vals.push(updates.staffNotes ?? null) }

    vals.push(id)
    await dbRun(db, `UPDATE portal_appointment_requests SET ${setClauses.join(', ')} WHERE id = ?`, vals)
    const row = await dbGet<Record<string, unknown>>(db,
      'SELECT * FROM portal_appointment_requests WHERE id = ?', [id])
    return row ? rowToApptRequest(row) : null
  }

  // KV fallback
  const raw = await kv.get(`portal:appt-req:${id}`)
  if (!raw) return null
  const req: AppointmentRequest = { ...JSON.parse(raw), ...updates, updatedAt: new Date().toISOString() }
  await kv.put(`portal:appt-req:${id}`, JSON.stringify(req))
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
    threadId?: string
    attachmentNote?: string
  },
  db?: D1Database
): Promise<{ message: PortalMessage; thread: MessageThread }> {
  const now = new Date().toISOString()
  const threadId = input.threadId ?? uid('thread')
  const msgId = uid('msg')

  if (db) {
    const { dbRun, dbGet, dbAll } = await import('./db')

    // Upsert thread
    const existingThread = await dbGet<Record<string, unknown>>(db,
      'SELECT * FROM portal_message_threads WHERE id = ?', [threadId])

    if (!existingThread) {
      await dbRun(db,
        `INSERT INTO portal_message_threads
           (id, patient_id, patient_name, subject, category, status,
            last_message_at, message_count, created_at, updated_at)
         VALUES (?,?,?,?,?,'UNREAD',?,1,?,?)`,
        [threadId, input.patientId, input.patientName,
         input.subject, input.category, now, now, now])
    } else {
      const newStatus = input.fromPatient ? 'UNREAD' : 'REPLIED'
      const newCount = ((existingThread.message_count as number) ?? 0) + 1
      await dbRun(db,
        `UPDATE portal_message_threads
         SET status = ?, last_message_at = ?, message_count = ?, updated_at = ?
         WHERE id = ?`,
        [newStatus, now, newCount, now, threadId])
    }

    // Insert message
    await dbRun(db,
      `INSERT INTO portal_messages
         (id, thread_id, sender_type, sender_id, sender_name, body,
          from_patient, status, attachment_note, is_read, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,0,?)`,
      [
        msgId, threadId,
        input.fromPatient ? 'PATIENT' : 'STAFF',
        input.fromPatient ? input.patientId : 'staff',
        input.senderName, input.body,
        input.fromPatient ? 1 : 0,
        'UNREAD',
        input.attachmentNote ?? null,
        now,
      ]
    )

    const threadRow = await dbGet<Record<string, unknown>>(db,
      'SELECT * FROM portal_message_threads WHERE id = ?', [threadId])
    const msgRow = await dbGet<Record<string, unknown>>(db,
      'SELECT * FROM portal_messages WHERE id = ?', [msgId])

    const message = rowToMessage(msgRow!, threadRow!)
    const thread  = rowToThread(threadRow!, message)
    return { message, thread }
  }

  // KV fallback
  const msg: PortalMessage = {
    id: msgId, threadId,
    patientId: input.patientId, patientName: input.patientName,
    subject: input.subject, category: input.category,
    body: input.body, fromPatient: input.fromPatient,
    senderName: input.senderName,
    status: 'UNREAD',
    attachmentNote: input.attachmentNote,
    createdAt: now,
  }
  await kv.put(`portal:msg:${msg.id}`, JSON.stringify(msg))

  let thread: MessageThread
  const existingRaw = await kv.get(`portal:msg-thread:${threadId}`)
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
      threadId, subject: input.subject, category: input.category,
      patientId: input.patientId, patientName: input.patientName,
      lastMessage: msg, messageCount: 1, status: 'UNREAD',
      createdAt: now, updatedAt: now,
    }
    await addToIndex(kv, 'portal:msg-threads:index', threadId)
  }
  await kv.put(`portal:msg-thread:${threadId}`, JSON.stringify(thread))
  return { message: msg, thread }
}

export async function listMessageThreads(
  kv: KVNamespace,
  patientId?: string,
  db?: D1Database
): Promise<MessageThread[]> {
  if (db) {
    const { dbAll } = await import('./db')
    let sql = `
      SELECT t.*,
             m.id as last_msg_id, m.body as last_msg_body,
             m.sender_name as last_msg_sender, m.from_patient as last_msg_from_patient,
             m.status as last_msg_status, m.created_at as last_msg_created_at
      FROM portal_message_threads t
      LEFT JOIN portal_messages m ON m.id = (
        SELECT id FROM portal_messages WHERE thread_id = t.id ORDER BY created_at DESC LIMIT 1
      )
      WHERE 1=1`
    const params: string[] = []
    if (patientId) { sql += ' AND t.patient_id = ?'; params.push(patientId) }
    sql += ' ORDER BY COALESCE(t.updated_at, t.last_message_at, t.created_at) DESC'
    const rows = await dbAll<Record<string, unknown>>(db, sql, params)
    return rows.map(r => {
      const lastMsg: PortalMessage = {
        id: r.last_msg_id as string ?? '',
        threadId: r.id as string,
        patientId: r.patient_id as string,
        patientName: r.patient_name as string,
        subject: r.subject as string,
        category: r.category as MessageCategory,
        body: r.last_msg_body as string ?? '',
        fromPatient: (r.last_msg_from_patient as number) === 1,
        senderName: r.last_msg_sender as string ?? '',
        status: (r.last_msg_status as string ?? 'UNREAD') as MessageStatus,
        createdAt: r.last_msg_created_at as string ?? r.created_at as string,
      }
      return rowToThread(r, lastMsg)
    })
  }

  // KV fallback
  const ids = await getIndex(kv, 'portal:msg-threads:index')
  const items = await Promise.all(ids.map(async id => {
    const raw = await kv.get(`portal:msg-thread:${id}`)
    return raw ? JSON.parse(raw) as MessageThread : null
  }))
  let results = items.filter(Boolean) as MessageThread[]
  if (patientId) results = results.filter(t => t.patientId === patientId)
  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getThreadMessages(
  kv: KVNamespace,
  threadId: string,
  db?: D1Database
): Promise<PortalMessage[]> {
  if (db) {
    const { dbAll, dbGet } = await import('./db')
    const threadRow = await dbGet<Record<string, unknown>>(db,
      'SELECT * FROM portal_message_threads WHERE id = ?', [threadId])
    if (!threadRow) return []
    const rows = await dbAll<Record<string, unknown>>(db,
      'SELECT * FROM portal_messages WHERE thread_id = ? ORDER BY created_at ASC', [threadId])
    return rows.map(r => rowToMessage(r, threadRow))
  }

  // KV fallback
  const thread = await kv.get(`portal:msg-thread:${threadId}`)
  if (!thread) return []
  const t: MessageThread & { messageIds?: string[] } = JSON.parse(thread)
  if (!t.messageIds?.length) return [t.lastMessage]
  const msgs = await Promise.all(t.messageIds.map(async id => {
    const raw = await kv.get(`portal:msg:${id}`)
    return raw ? JSON.parse(raw) as PortalMessage : null
  }))
  return (msgs.filter(Boolean) as PortalMessage[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function markThreadRead(kv: KVNamespace, threadId: string, db?: D1Database): Promise<void> {
  if (db) {
    const { dbRun } = await import('./db')
    const nowStr = new Date().toISOString()
    await dbRun(db,
      `UPDATE portal_message_threads SET status = 'READ', updated_at = ? WHERE id = ? AND status = 'UNREAD'`,
      [nowStr, threadId])
    await dbRun(db,
      `UPDATE portal_messages SET is_read = 1, status = 'READ', read_at = ?
       WHERE thread_id = ? AND is_read = 0`,
      [nowStr, threadId])
    return
  }

  // KV fallback
  const raw = await kv.get(`portal:msg-thread:${threadId}`)
  if (!raw) return
  const thread: MessageThread = JSON.parse(raw)
  if (thread.status === 'UNREAD') {
    thread.status = 'READ'
    thread.lastMessage.status = 'READ'
    thread.lastMessage.readAt = new Date().toISOString()
    await kv.put(`portal:msg-thread:${threadId}`, JSON.stringify(thread))
  }
}

// ── Seed Messages ──────────────────────────────────────────────────────────────

let _msgSeeded = false

export async function ensureMessageSeed(kv: KVNamespace, db?: D1Database): Promise<void> {
  if (_msgSeeded) return

  if (db) {
    const { dbGet } = await import('./db')
    const existing = await dbGet<{ cnt: number }>(db,
      `SELECT COUNT(*) as cnt FROM portal_message_threads WHERE patient_id = 'pt-001'`, [])
    if (existing && existing.cnt > 0) { _msgSeeded = true; return }
  } else {
    const existing = await kv.get('portal:msg-threads:index')
    if (existing) { _msgSeeded = true; return }
  }

  await sendMessage(kv, {
    patientId: 'pt-001', patientName: 'Margaret Sullivan',
    subject: 'Welcome to the OculoFlow Patient Portal',
    category: 'GENERAL',
    body: 'Welcome to your patient portal! Here you can request appointments, view your prescriptions and exam records, check on your glasses order, review your balance, and send secure messages to our team.\n\nIf you have any questions, don\'t hesitate to reach out.',
    fromPatient: false,
    senderName: 'OculoFlow Team',
  }, db)

  await sendMessage(kv, {
    patientId: 'pt-001', patientName: 'Margaret Sullivan',
    subject: 'Your glasses are ready for pickup!',
    category: 'OPTICAL_ORDER_STATUS',
    body: 'Great news! Your glasses (Order OPT-260307-1001 — Maui Jim Westside with Progressive lenses) have been received from the lab and are ready for pickup at our office.\n\nPlease bring your insurance card and a valid ID. Your remaining balance is $165.00.',
    fromPatient: false,
    senderName: 'Optical Department',
  }, db)

  _msgSeeded = true
}

// ── Portal Dashboard Aggregation ──────────────────────────────────────────────

export async function getPortalDashboard(
  kv: KVNamespace, patientId: string, db?: D1Database
): Promise<PortalDashboard> {
  let patient: any = { id: patientId, name: 'Unknown', dob: '', email: '', phone: '' }

  if (db) {
    const { dbGet, dbAll } = await import('./db')
    const row = await dbGet<Record<string, unknown>>(db, 'SELECT * FROM patients WHERE id = ?', [patientId])
    if (row) {
      patient = {
        id: row.id as string,
        name: `${row.first_name} ${row.last_name}`,
        firstName: row.first_name as string,
        lastName: row.last_name as string,
        dob: row.date_of_birth as string,
        dateOfBirth: row.date_of_birth as string,
        email: row.email as string,
        phone: row.phone as string,
        insurancePlans: row.insurance_plans_json ? JSON.parse(row.insurance_plans_json as string) : [],
      }
    }

    const today2 = new Date().toISOString().slice(0, 10)
    const apptRows = await dbAll<Record<string, unknown>>(db,
      `SELECT * FROM appointments WHERE patient_id = ? AND appt_date >= ? AND status != 'CANCELLED' ORDER BY appt_date, start_time LIMIT 5`,
      [patientId, today2])
    var upcomingAppts: PortalDashboard['upcomingAppointments'] = apptRows.map((a: any) => ({
      date: (a.appt_date ?? a.appointment_date ?? a.date) as string,
      time: a.start_time as string,
      provider: (a.provider_name ?? a.provider_id) as string,
      type: ((a.appointment_type as string) ?? '').replace(/_/g, ' '),
      status: a.status as string,
    }))
  } else {
    const patRaw = await kv.get(`patient:${patientId}`)
    if (patRaw) patient = JSON.parse(patRaw)
    const apptIndexRaw = await kv.get('appts:index')
    const apptIds: string[] = apptIndexRaw ? JSON.parse(apptIndexRaw) : []
    const today = new Date().toISOString().slice(0, 10)
    var upcomingAppts: PortalDashboard['upcomingAppointments'] = []
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
  }

  // Load appointment requests — D1 preferred
  const pendingRequests = await listAppointmentRequests(kv, patientId, 'PENDING', db)

  // Load recent exams (last 3) — D1 preferred
  const recentExams: PortalExamSummary[] = []
  if (db) {
    const { dbAll } = await import('./db')
    const examRows = await dbAll<Record<string, unknown>>(db,
      `SELECT * FROM exams WHERE patient_id = ? ORDER BY exam_date DESC LIMIT 3`, [patientId])
    for (const e of examRows) {
      recentExams.push({
        examId: e.id as string,
        examDate: e.exam_date as string,
        providerName: (e.provider_name ?? e.provider_id) as string ?? '',
        examType: ((e.exam_type as string) ?? '').replace(/_/g, ' '),
        diagnoses: [],
        signed: (e.status as string) === 'SIGNED',
      })
    }
  } else {
    const examIndexRaw = await kv.get('exams:index')
    const examIds: string[] = examIndexRaw ? JSON.parse(examIndexRaw) : []
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
  }

  // Load active Rx — D1 preferred
  let activeRx: PortalRxSummary | undefined
  if (db) {
    const { listRxForPatient } = await import('./optical')
    const rxList = await listRxForPatient(kv, patientId, db)
    const signedRx = rxList.filter((r: any) => r.signed)
    if (signedRx.length > 0) {
      const rx = signedRx[0]
      activeRx = {
        rxId: (rx as any).id ?? (rx as any).rxId,
        rxDate: (rx as any).rxDate,
        expiresDate: (rx as any).expiresDate,
        providerName: (rx as any).providerName ?? (rx as any).providerId ?? '',
        lensType: ((rx as any).lensType ?? '').replace(/_/g, ' '),
        signed: (rx as any).signed,
        od: (rx as any).od ?? {},
        os: (rx as any).os ?? {},
        binocularPd: (rx as any).binocularPd,
      }
    }
  } else {
    const rxIndexRaw = await kv.get('optical:rx:index')
    const rxIds: string[] = rxIndexRaw ? JSON.parse(rxIndexRaw) : []
    for (const rid of rxIds) {
      const raw = await kv.get(`optical:rx:${rid}`)
      if (!raw) continue
      const rx = JSON.parse(raw)
      if (rx.patientId !== patientId) continue
      if (!rx.signed) continue
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
  }

  // Load optical orders — D1 preferred
  let opticalOrders: PortalOrderStatus[] = []
  if (db) {
    const { listOrders } = await import('./optical')
    const allOrders = await listOrders(kv, db)
    opticalOrders = allOrders
      .filter((o: any) => o.patientId === patientId && o.status !== 'CANCELLED')
      .map((o: any) => ({
        orderId: (o as any).id ?? (o as any).orderId,
        orderNumber: o.orderNumber,
        orderType: (o.orderType ?? '').replace(/_/g, ' '),
        status: o.status, lab: o.lab,
        estimatedReady: o.estimatedReady, receivedAt: o.receivedAt, dispensedAt: o.dispensedAt,
        totalCharge: o.totalCharge, balanceDue: o.balanceDue,
        lineItemsSummary: o.lineItemsSummary ?? '',
        lastUpdated: o.updatedAt,
      }))
  } else {
    const ordIndexRaw = await kv.get('optical:orders:index')
    const ordIds: string[] = ordIndexRaw ? JSON.parse(ordIndexRaw) : []
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
  }

  // Load billing balance — D1 preferred
  const balanceItems: PortalBalanceSummary['items'] = []
  let totalBalance = 0
  if (db) {
    const { getPatientSuperbills } = await import('./billing')
    const sbs = await getPatientSuperbills(kv, patientId, db)
    for (const sb of sbs) {
      if (['VOIDED', 'PAID'].includes(sb.status)) continue
      const bal = (sb as any).patientBalance ?? 0
      totalBalance += bal
      balanceItems.push({
        superbillId: sb.id,
        serviceDate: (sb as any).serviceDate ?? '',
        description: `Visit — ${sb.status}`,
        totalCharge: (sb as any).totalCharge ?? 0,
        insurancePaid: (sb as any).insurancePaid ?? 0,
        patientBalance: bal,
        status: sb.status,
      })
    }
  } else {
    const sbIndexRaw = await kv.get('superbills:index')
    const sbIds: string[] = sbIndexRaw ? JSON.parse(sbIndexRaw) : []
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
  }

  // Load messages — D1 preferred
  await ensureMessageSeed(kv, db)
  const threads = await listMessageThreads(kv, patientId, db)
  const unreadMessages = threads.filter(t => t.status === 'UNREAD').length

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

const MAGIC_LINK_TTL = 60 * 15   // 15 minutes — stays in KV
const OTP_TTL        = 60 * 10   // 10 minutes — stays in KV
const SESSION_TTL    = 60 * 60 * 8 // 8 hours (extended)

export interface PortalAccount {
  patientId:     string
  email:         string
  passwordHash?: string
  createdAt:     string
  updatedAt:     string
  lastLogin?:    string
  loginMethod:   'magic_link' | 'password' | 'dob'
  emailVerified: boolean
}

// ── Crypto helpers ─────────────────────────────────────────────────────────────
export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
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

export async function verifyPassword(password: string, storedHash: string, salt: string): Promise<boolean> {
  const { hash } = await hashPassword(password, salt)
  return hash === storedHash
}

function generateOtp(): string {
  const arr = new Uint32Array(1)
  crypto.getRandomValues(arr)
  return String(arr[0] % 1_000_000).padStart(6, '0')
}

function generateToken(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Portal Account CRUD — D1 primary, KV fallback ─────────────────────────────

export async function getPortalAccount(
  kv: KVNamespace, patientId: string, db?: D1Database
): Promise<PortalAccount | null> {
  if (db) {
    const { dbGet } = await import('./db')
    const row = await dbGet<Record<string, unknown>>(db,
      'SELECT * FROM portal_accounts WHERE patient_id = ? AND is_active = 1', [patientId])
    if (!row) return null
    return {
      patientId:     row.patient_id as string,
      email:         row.email as string,
      passwordHash:  row.password_hash as string | undefined,
      createdAt:     row.created_at as string,
      updatedAt:     row.updated_at as string,
      lastLogin:     row.last_login_at as string | undefined,
      loginMethod:   (row.login_method as 'magic_link' | 'password' | 'dob') ?? 'magic_link',
      emailVerified: (row.email_verified as number) === 1,
    }
  }
  const raw = await kv.get(`portal:account:${patientId}`)
  return raw ? JSON.parse(raw) : null
}

export async function getPortalAccountByEmail(
  kv: KVNamespace, email: string, db?: D1Database
): Promise<PortalAccount | null> {
  const emailKey = email.toLowerCase().trim()
  if (db) {
    const { dbGet } = await import('./db')
    const row = await dbGet<Record<string, unknown>>(db,
      'SELECT * FROM portal_accounts WHERE LOWER(email) = ? AND is_active = 1', [emailKey])
    if (!row) return null
    return {
      patientId:     row.patient_id as string,
      email:         row.email as string,
      passwordHash:  row.password_hash as string | undefined,
      createdAt:     row.created_at as string,
      updatedAt:     row.updated_at as string,
      lastLogin:     row.last_login_at as string | undefined,
      loginMethod:   (row.login_method as 'magic_link' | 'password' | 'dob') ?? 'magic_link',
      emailVerified: (row.email_verified as number) === 1,
    }
  }
  const patientId = await kv.get(`portal:email:${emailKey}`)
  if (!patientId) return null
  return getPortalAccount(kv, patientId)
}

export async function createPortalAccount(
  kv: KVNamespace,
  opts: { patientId: string; email: string; password?: string },
  db?: D1Database
): Promise<{ success: boolean; account?: PortalAccount; error?: string }> {
  const emailKey = opts.email.toLowerCase().trim()
  const now = new Date().toISOString()

  if (db) {
    const { dbGet, dbRun } = await import('./db')

    // Check uniqueness
    const existingByPatient = await dbGet(db,
      'SELECT id FROM portal_accounts WHERE patient_id = ?', [opts.patientId])
    if (existingByPatient) return { success: false, error: 'Portal account already exists for this patient' }

    const existingByEmail = await dbGet(db,
      'SELECT id FROM portal_accounts WHERE LOWER(email) = ?', [emailKey])
    if (existingByEmail) return { success: false, error: 'An account with this email already exists' }

    let passwordHash: string | null = null
    let salt: string | null = null
    if (opts.password) {
      const result = await hashPassword(opts.password)
      passwordHash = result.hash
      salt = result.salt
    }

    const acctId = uid('pacct')
    await dbRun(db,
      `INSERT INTO portal_accounts
         (id, patient_id, email, password_hash, salt, login_method,
          email_verified, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,0,1,?,?)`,
      [acctId, opts.patientId, emailKey, passwordHash, salt,
       opts.password ? 'password' : 'magic_link', now, now])

    const account: PortalAccount = {
      patientId: opts.patientId, email: emailKey,
      createdAt: now, updatedAt: now,
      loginMethod: opts.password ? 'password' : 'magic_link',
      emailVerified: false,
    }
    return { success: true, account }
  }

  // KV fallback
  const existing = await getPortalAccount(kv, opts.patientId)
  if (existing) return { success: false, error: 'Portal account already exists for this patient' }
  const existingEmail = await kv.get(`portal:email:${emailKey}`)
  if (existingEmail) return { success: false, error: 'An account with this email already exists' }

  const account: PortalAccount & { passwordHash?: string; salt?: string } = {
    patientId: opts.patientId, email: emailKey,
    createdAt: now, updatedAt: now,
    loginMethod: opts.password ? 'password' : 'magic_link',
    emailVerified: false,
  }
  if (opts.password) {
    const { hash, salt } = await hashPassword(opts.password)
    account.passwordHash = hash
    ;(account as any).salt = salt
  }
  await kv.put(`portal:account:${opts.patientId}`, JSON.stringify(account))
  await kv.put(`portal:email:${emailKey}`, opts.patientId)
  const { passwordHash: _, ...safeAccount } = account as any
  return { success: true, account: safeAccount }
}

// ── Magic-Link Flow ────────────────────────────────────────────────────────────

export async function initiatePortalMagicLink(
  kv: KVNamespace,
  email: string,
  emailConfig: EmailConfig | null,
  baseUrl: string,
  db?: D1Database
): Promise<{ success: boolean; token?: string; otp?: string; demo?: boolean; error?: string }> {
  const emailKey = email.toLowerCase().trim()

  let patientId: string | null = null
  const account = await getPortalAccountByEmail(kv, emailKey, db)
  if (account) {
    patientId = account.patientId
  } else if (db) {
    const { dbGet } = await import('./db')
    const row = await dbGet<Record<string, unknown>>(db,
      'SELECT id FROM patients WHERE LOWER(email) = LOWER(?) AND is_active = 1', [emailKey])
    if (row) patientId = row.id as string
  } else {
    const idxRaw = await kv.get('patients:index')
    const ids: string[] = idxRaw ? JSON.parse(idxRaw) : []
    for (const pid of ids) {
      const raw = await kv.get(`patient:${pid}`)
      if (!raw) continue
      const p = JSON.parse(raw)
      if (p.email?.toLowerCase() === emailKey) { patientId = pid; break }
    }
  }

  if (!patientId) return { success: true, demo: true }

  const token = generateToken()
  const otp   = generateOtp()
  const magic = { patientId, email: emailKey, otp, createdAt: new Date().toISOString() }

  // Tokens/OTPs stay in KV (ephemeral by design)
  await kv.put(`${KV_PORTAL_MAGIC_PFX}${token}`,
    JSON.stringify(magic), { expirationTtl: MAGIC_LINK_TTL })
  await kv.put(`${KV_PORTAL_OTP_PFX}${emailKey}`,
    JSON.stringify({ token, otp, patientId, createdAt: magic.createdAt }), { expirationTtl: OTP_TTL })

  const magicUrl = `${baseUrl}/portal?magic=${token}`

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

  return { success: true, token, otp, demo: true }
}

export async function verifyPortalMagicLink(
  kv: KVNamespace,
  opts: { token?: string; email?: string; otp?: string }
): Promise<{ success: boolean; patientId?: string; error?: string }> {
  if (opts.token) {
    const raw = await kv.get(`${KV_PORTAL_MAGIC_PFX}${opts.token}`)
    if (!raw) return { success: false, error: 'Invalid or expired magic link' }
    const magic = JSON.parse(raw)
    await kv.delete(`${KV_PORTAL_MAGIC_PFX}${opts.token}`)
    return { success: true, patientId: magic.patientId }
  }

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
  kv: KVNamespace, email: string, password: string, db?: D1Database
): Promise<{ success: boolean; patientId?: string; error?: string }> {
  if (db) {
    const { dbGet } = await import('./db')
    const emailKey = email.toLowerCase().trim()
    const row = await dbGet<Record<string, unknown>>(db,
      `SELECT pa.*, pa.salt as acct_salt
       FROM portal_accounts pa
       WHERE LOWER(pa.email) = ? AND pa.is_active = 1`, [emailKey])
    if (!row) return { success: false, error: 'Invalid email or password' }
    if (!row.password_hash || !row.salt) {
      return { success: false, error: 'No password set — please use magic link login' }
    }
    const ok = await verifyPassword(password, row.password_hash as string, row.salt as string)
    if (!ok) return { success: false, error: 'Invalid email or password' }
    return { success: true, patientId: row.patient_id as string }
  }

  // KV fallback
  const account = await getPortalAccountByEmail(kv, email)
  if (!account) return { success: false, error: 'Invalid email or password' }
  const raw = await kv.get(`portal:account:${account.patientId}`)
  if (!raw) return { success: false, error: 'Invalid email or password' }
  const full = JSON.parse(raw)
  if (!full.passwordHash || !full.salt) {
    return { success: false, error: 'No password set — please use magic link login' }
  }
  const ok = await verifyPassword(password, full.passwordHash, full.salt)
  if (!ok) return { success: false, error: 'Invalid email or password' }
  return { success: true, patientId: account.patientId }
}

// ── Password Reset ─────────────────────────────────────────────────────────────

export async function initiatePasswordReset(
  kv: KVNamespace, email: string, emailConfig: EmailConfig | null, baseUrl: string, db?: D1Database
): Promise<{ success: boolean; token?: string; demo?: boolean }> {
  return initiatePortalMagicLink(kv, email, emailConfig, `${baseUrl}/portal?reset=1`, db)
}

export async function completePasswordReset(
  kv: KVNamespace,
  opts: { token?: string; email?: string; otp?: string; newPassword: string },
  db?: D1Database
): Promise<{ success: boolean; error?: string }> {
  const verify = await verifyPortalMagicLink(kv, { token: opts.token, email: opts.email, otp: opts.otp })
  if (!verify.success || !verify.patientId) return { success: false, error: verify.error }

  if (db) {
    const { dbGet, dbRun } = await import('./db')
    const emailKey = opts.email?.toLowerCase().trim() ?? ''
    const existing = await dbGet(db,
      'SELECT id FROM portal_accounts WHERE patient_id = ?', [verify.patientId])
    if (!existing) {
      return createPortalAccount(kv, { patientId: verify.patientId, email: emailKey, password: opts.newPassword }, db)
        .then(r => ({ success: r.success, error: r.error }))
    }
    const { hash, salt } = await hashPassword(opts.newPassword)
    await dbRun(db,
      `UPDATE portal_accounts SET password_hash = ?, salt = ?, login_method = 'password', updated_at = ? WHERE patient_id = ?`,
      [hash, salt, new Date().toISOString(), verify.patientId])
    return { success: true }
  }

  // KV fallback
  const raw = await kv.get(`portal:account:${verify.patientId}`)
  if (!raw) {
    const emailKey = opts.email?.toLowerCase().trim() ?? ''
    await createPortalAccount(kv, { patientId: verify.patientId, email: emailKey, password: opts.newPassword })
    return { success: true }
  }
  const account = JSON.parse(raw)
  const { hash, salt } = await hashPassword(opts.newPassword)
  account.passwordHash = hash
  account.salt = salt
  account.loginMethod = 'password'
  account.updatedAt = new Date().toISOString()
  await kv.put(`portal:account:${verify.patientId}`, JSON.stringify(account))
  return { success: true }
}

// ── Unified portal session creator ────────────────────────────────────────────

export async function createPortalSession(
  kv: KVNamespace, patientId: string, db?: D1Database
): Promise<PortalSession | null> {
  let patientName  = ''
  let patientEmail = ''
  let patientDob   = ''
  let resolvedId   = patientId

  if (db) {
    const { dbGet } = await import('./db')
    const row = await dbGet<Record<string, unknown>>(db,
      'SELECT * FROM patients WHERE id = ? AND is_active = 1', [patientId])
    if (!row) return null
    resolvedId   = row.id as string
    patientName  = `${row.first_name} ${row.last_name}`
    patientEmail = (row.email as string) || ''
    patientDob   = (row.date_of_birth as string) || ''

    // Update last_login_at in D1
    await dbGet(db,
      `UPDATE portal_accounts SET last_login_at = ? WHERE patient_id = ?`,
      [new Date().toISOString(), resolvedId])
  } else {
    let patientRaw = await kv.get(`patient:${patientId}`)
    if (!patientRaw) {
      const idxRaw = await kv.get('patients:index')
      const ids: string[] = idxRaw ? JSON.parse(idxRaw) : []
      for (const pid of ids) {
        const raw = await kv.get(`patient:${pid}`)
        if (!raw) continue
        const p = JSON.parse(raw)
        if (p.id === patientId) { patientRaw = raw; break }
      }
    }
    if (!patientRaw) return null
    const patient = JSON.parse(patientRaw)
    resolvedId   = patient.id
    patientName  = patient.name ?? `${patient.firstName} ${patient.lastName}`
    patientEmail = patient.email ?? ''
    patientDob   = patient.dob ?? patient.dateOfBirth ?? ''
  }

  const now     = new Date()
  const expires = new Date(now.getTime() + SESSION_TTL * 1000)
  const session: PortalSession = {
    sessionId:    uid('psess'),
    patientId:    resolvedId,
    patientName,
    patientEmail,
    patientDob,
    createdAt:    now.toISOString(),
    expiresAt:    expires.toISOString(),
    lastActivity: now.toISOString(),
  }

  // Sessions always in KV (TTL = 8 h)
  await kv.put(`${KV_PORTAL_SESSION_PFX}${session.sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  })

  // KV fallback: also update account lastLogin
  if (!db) {
    const accountRaw = await kv.get(`portal:account:${resolvedId}`)
    if (accountRaw) {
      const acc = JSON.parse(accountRaw)
      acc.lastLogin = now.toISOString()
      await kv.put(`portal:account:${resolvedId}`, JSON.stringify(acc))
    }
  }

  return session
}

// Auto-create portal account for any patient if they don't have one yet
export async function ensurePortalAccount(
  kv: KVNamespace, patientId: string, email: string, db?: D1Database
): Promise<PortalAccount> {
  const existing = await getPortalAccount(kv, patientId, db)
  if (existing) return existing
  const result = await createPortalAccount(kv, { patientId, email }, db)
  return result.account!
}
