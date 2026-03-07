// Phase B1 — Unified Notifications Service
// Wraps Twilio SMS + SendGrid Email with:
//   • auto-detection of real vs demo credentials
//   • retry logic (up to 2 retries with 500ms backoff)
//   • delivery logging to KV
//   • template rendering for all notification types

import { sendSms, sendEmail, type SmsConfig, type EmailConfig, type NotificationResult } from './sms'

// ─── KV helpers ───────────────────────────────────────────────────────────────
async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key, 'text'); return v ? JSON.parse(v) as T : null
}
async function kvPut(kv: KVNamespace, key: string, val: unknown, ttlSec?: number): Promise<void> {
  const opts: KVNamespacePutOptions = ttlSec ? { expirationTtl: Math.max(ttlSec, 60) } : {}
  await kv.put(key, JSON.stringify(val), opts)
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type NotifChannel = 'SMS' | 'EMAIL'
export type NotifType =
  | 'APPOINTMENT_REMINDER'
  | 'APPOINTMENT_CONFIRMATION_REQUEST'
  | 'APPOINTMENT_CONFIRMATION'
  | 'MFA_OTP'
  | 'MAGIC_LINK'
  | 'PASSWORD_RESET'
  | 'RECALL_OUTREACH'
  | 'SURVEY_INVITE'
  | 'INTAKE_LINK'
  | 'GENERAL'

export interface NotifLog {
  id: string
  channel: NotifChannel
  type: NotifType
  to: string          // phone or email (masked in logs)
  subject?: string
  body: string
  provider: 'twilio' | 'sendgrid' | 'demo' | 'error'
  externalId?: string
  success: boolean
  error?: string
  retries: number
  sentAt: string
  patientId?: string
  patientName?: string
}

// ─── Key scheme ───────────────────────────────────────────────────────────────
const K = {
  log:    (id: string) => `notif:log:${id}`,
  logIdx: ()           => 'notif:log:idx',
}
const NOTIF_TTL = 60 * 60 * 24 * 90  // 90-day log retention

function uid() { return `nl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}` }
const now = () => new Date().toISOString()

// ─── Credential detection ─────────────────────────────────────────────────────
export function isRealTwilio(sid: string | undefined, token: string | undefined): boolean {
  if (!sid || !token) return false
  if (sid.startsWith('AC00') || sid === 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') return false
  if (token === 'your_auth_token' || token.length < 16) return false
  return sid.startsWith('AC') && sid.length === 34
}

export function isRealSendGrid(key: string | undefined): boolean {
  if (!key) return false
  if (key.startsWith('SG.xx') || key === 'SG.your-sendgrid-key-here') return false
  return key.startsWith('SG.') && key.length > 20
}

export function isRealEligibility(key: string | undefined): boolean {
  if (!key || key.length < 10) return false
  if (key.includes('your-') || key.includes('xxxx') || key === 'your-eligibility-api-key' || key === 'your-eligibility-api-key-here') return false
  return true
}

// ─── Core send with retry ────────────────────────────────────────────────────
async function sendWithRetry(
  fn: () => Promise<NotificationResult>,
  maxRetries = 2
): Promise<NotificationResult & { retries: number }> {
  let lastResult: NotificationResult = { success: false, error: 'Not attempted' }
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 500 * attempt))
    lastResult = await fn()
    if (lastResult.success) return { ...lastResult, retries: attempt }
  }
  return { ...lastResult, retries: maxRetries }
}

// ─── Log delivery ─────────────────────────────────────────────────────────────
async function logDelivery(kv: KVNamespace, entry: Omit<NotifLog, 'id' | 'sentAt'>): Promise<NotifLog> {
  const log: NotifLog = { ...entry, id: uid(), sentAt: now() }
  await kvPut(kv, K.log(log.id), log, NOTIF_TTL)
  const idx = (await kvGet<string[]>(kv, K.logIdx())) ?? []
  idx.unshift(log.id)
  if (idx.length > 2000) idx.splice(2000)
  await kvPut(kv, K.logIdx(), idx)
  return log
}

// ─── Bindings interface ───────────────────────────────────────────────────────
export interface NotifBindings {
  OCULOFLOW_KV: KVNamespace
  TWILIO_ACCOUNT_SID?: string
  TWILIO_AUTH_TOKEN?: string
  TWILIO_FROM_NUMBER?: string
  SENDGRID_API_KEY?: string
  SENDGRID_FROM_EMAIL?: string
  PRACTICE_NAME?: string
  DEMO_MODE?: string
}

// ─── Main send function ───────────────────────────────────────────────────────
export async function sendNotification(env: NotifBindings, opts: {
  channel: NotifChannel
  type: NotifType
  to: string
  subject?: string
  body: string
  html?: string
  patientId?: string
  patientName?: string
}): Promise<NotifLog> {
  const kv = env.OCULOFLOW_KV
  const realSms   = isRealTwilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
  const realEmail = isRealSendGrid(env.SENDGRID_API_KEY)

  if (opts.channel === 'SMS') {
    const smsConfig: SmsConfig = {
      accountSid:  env.TWILIO_ACCOUNT_SID  ?? '',
      authToken:   env.TWILIO_AUTH_TOKEN   ?? '',
      fromNumber:  env.TWILIO_FROM_NUMBER  ?? '+15005550006',
      demoMode:    !realSms,
    }
    const result = await sendWithRetry(() => sendSms(opts.to, opts.body, smsConfig))
    return logDelivery(kv, {
      channel: 'SMS', type: opts.type, to: opts.to,
      body: opts.body, provider: result.provider ?? (realSms ? 'twilio' : 'demo'),
      externalId: result.messageId, success: result.success,
      error: result.error, retries: result.retries,
      patientId: opts.patientId, patientName: opts.patientName,
    })
  }

  // EMAIL
  const emailConfig: EmailConfig = {
    apiKey:     env.SENDGRID_API_KEY     ?? '',
    fromEmail:  env.SENDGRID_FROM_EMAIL  ?? 'noreply@oculoflow.com',
    fromName:   env.PRACTICE_NAME        ?? 'OculoFlow',
    demoMode:   !realEmail,
  }
  const result = await sendWithRetry(() => sendEmail({
    to: opts.to, toName: opts.patientName,
    subject: opts.subject ?? 'Message from your eye care provider',
    html:    opts.html  ?? `<p>${opts.body.replace(/\n/g, '<br>')}</p>`,
    text:    opts.body,
  }, emailConfig))
  return logDelivery(kv, {
    channel: 'EMAIL', type: opts.type, to: opts.to,
    subject: opts.subject, body: opts.body,
    provider: result.provider ?? (realEmail ? 'sendgrid' : 'demo'),
    externalId: result.messageId, success: result.success,
    error: result.error, retries: result.retries,
    patientId: opts.patientId, patientName: opts.patientName,
  })
}

// ─── Delivery log query ───────────────────────────────────────────────────────
export async function listNotifLogs(kv: KVNamespace, opts: {
  limit?: number; type?: NotifType; channel?: NotifChannel; patientId?: string
} = {}): Promise<NotifLog[]> {
  const idx = (await kvGet<string[]>(kv, K.logIdx())) ?? []
  const slice = idx.slice(0, Math.min(opts.limit ?? 200, 500))
  const logs = (await Promise.all(slice.map(id => kvGet<NotifLog>(kv, K.log(id))))).filter(Boolean) as NotifLog[]
  return logs.filter(l =>
    (!opts.type      || l.type      === opts.type)      &&
    (!opts.channel   || l.channel   === opts.channel)   &&
    (!opts.patientId || l.patientId === opts.patientId)
  )
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export async function sendMfaOtp(env: NotifBindings, phone: string, otp: string, patientName?: string): Promise<NotifLog> {
  const practice = env.PRACTICE_NAME ?? 'OculoFlow'
  return sendNotification(env, {
    channel: 'SMS', type: 'MFA_OTP', to: phone,
    body: `[${practice}] Your login code is: ${otp}. Valid for 10 minutes. Do not share.`,
    patientName,
  })
}

export async function sendAppointmentReminderSms(env: NotifBindings, opts: {
  phone: string; patientName: string; patientId?: string
  date: string; time: string; providerName: string
}): Promise<NotifLog> {
  const practice = env.PRACTICE_NAME ?? 'OculoFlow'
  return sendNotification(env, {
    channel: 'SMS', type: 'APPOINTMENT_REMINDER', to: opts.phone,
    body: `[${practice}] Hi ${opts.patientName}, reminder: appt with ${opts.providerName} on ${opts.date} at ${opts.time}. Reply YES to confirm or STOP to opt out.`,
    patientId: opts.patientId, patientName: opts.patientName,
  })
}

export async function sendAppointmentReminderEmail(env: NotifBindings, opts: {
  email: string; patientName: string; patientId?: string
  date: string; time: string; providerName: string
  confirmUrl?: string; cancelUrl?: string
}): Promise<NotifLog> {
  const { emailAppointmentReminder } = await import('./sms')
  const practice = env.PRACTICE_NAME ?? 'OculoFlow'
  const { subject, html, text } = emailAppointmentReminder({
    patientName: opts.patientName, date: opts.date, time: opts.time,
    providerName: opts.providerName, practiceName: practice,
    confirmUrl: opts.confirmUrl, cancelUrl: opts.cancelUrl,
  })
  return sendNotification(env, {
    channel: 'EMAIL', type: 'APPOINTMENT_REMINDER', to: opts.email,
    subject, body: text, html, patientId: opts.patientId, patientName: opts.patientName,
  })
}

export async function sendMagicLink(env: NotifBindings, opts: {
  email: string; patientName: string; patientId?: string
  magicLink: string; expiresInMin?: number
}): Promise<NotifLog> {
  const practice = env.PRACTICE_NAME ?? 'OculoFlow'
  const mins = opts.expiresInMin ?? 30
  const html = `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden">
    <div style="background:#1d4ed8;padding:24px 32px">
      <h1 style="margin:0;font-size:20px;color:#fff">👁️ ${practice}</h1>
      <p style="margin:4px 0 0;color:#bfdbfe;font-size:14px">Patient Portal — Sign In</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px">Hi <strong>${opts.patientName}</strong>,</p>
      <p style="color:#94a3b8;margin:0 0 24px">Click the button below to sign in to your patient portal. This link expires in ${mins} minutes.</p>
      <div style="text-align:center;margin:0 0 24px">
        <a href="${opts.magicLink}" style="background:#1d4ed8;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;font-size:16px">
          Sign In to Portal →
        </a>
      </div>
      <p style="color:#475569;font-size:12px;text-align:center">If you didn't request this link, you can safely ignore this email.</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #1e293b;font-size:12px;color:#475569;text-align:center">
      ${practice} · Secure patient portal access
    </div>
  </div>`
  return sendNotification(env, {
    channel: 'EMAIL', type: 'MAGIC_LINK', to: opts.email,
    subject: `Your ${practice} portal sign-in link`,
    body: `Hi ${opts.patientName},\n\nClick here to sign in to your patient portal (expires in ${mins} min):\n${opts.magicLink}\n\nIf you didn't request this, ignore this email.\n\n${practice}`,
    html, patientId: opts.patientId, patientName: opts.patientName,
  })
}

export async function sendPasswordReset(env: NotifBindings, opts: {
  email: string; patientName: string; patientId?: string
  resetLink: string; expiresInMin?: number
}): Promise<NotifLog> {
  const practice = env.PRACTICE_NAME ?? 'OculoFlow'
  const mins = opts.expiresInMin ?? 60
  const html = `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden">
    <div style="background:#dc2626;padding:24px 32px">
      <h1 style="margin:0;font-size:20px;color:#fff">👁️ ${practice}</h1>
      <p style="margin:4px 0 0;color:#fecaca;font-size:14px">Password Reset Request</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px">Hi <strong>${opts.patientName}</strong>,</p>
      <p style="color:#94a3b8;margin:0 0 24px">We received a request to reset your patient portal password. Click below to create a new password. This link expires in ${mins} minutes.</p>
      <div style="text-align:center;margin:0 0 24px">
        <a href="${opts.resetLink}" style="background:#dc2626;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;font-size:16px">
          Reset Password →
        </a>
      </div>
      <p style="color:#475569;font-size:12px;text-align:center">If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #1e293b;font-size:12px;color:#475569;text-align:center">
      ${practice} · This link expires in ${mins} minutes
    </div>
  </div>`
  return sendNotification(env, {
    channel: 'EMAIL', type: 'PASSWORD_RESET', to: opts.email,
    subject: `Reset your ${practice} portal password`,
    body: `Hi ${opts.patientName},\n\nReset your password here (expires in ${mins} min):\n${opts.resetLink}\n\nIf you didn't request this, ignore this email.\n\n${practice}`,
    html, patientId: opts.patientId, patientName: opts.patientName,
  })
}

export async function sendRecallSms(env: NotifBindings, opts: {
  phone: string; patientName: string; patientId?: string
  dueType: string; practicePhone?: string
}): Promise<NotifLog> {
  const practice = env.PRACTICE_NAME ?? 'OculoFlow'
  const phone = opts.practicePhone ?? '(305) 555-0100'
  return sendNotification(env, {
    channel: 'SMS', type: 'RECALL_OUTREACH', to: opts.phone,
    body: `[${practice}] Hi ${opts.patientName}, you're due for a ${opts.dueType}. Call ${phone} to schedule. Reply STOP to opt out.`,
    patientId: opts.patientId, patientName: opts.patientName,
  })
}

export async function sendSurveyInvite(env: NotifBindings, opts: {
  phone?: string; email?: string; patientName: string; patientId?: string
  surveyUrl: string; channel: NotifChannel
}): Promise<NotifLog> {
  const practice = env.PRACTICE_NAME ?? 'OculoFlow'
  if (opts.channel === 'SMS' && opts.phone) {
    return sendNotification(env, {
      channel: 'SMS', type: 'SURVEY_INVITE', to: opts.phone,
      body: `[${practice}] Hi ${opts.patientName}, we'd love your feedback! Quick 2-min survey: ${opts.surveyUrl} Reply STOP to opt out.`,
      patientId: opts.patientId, patientName: opts.patientName,
    })
  }
  const html = `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px;background:#0f172a;color:#e2e8f0;border-radius:12px">
    <h2 style="color:#f59e0b">⭐ How was your visit?</h2>
    <p>Hi <strong>${opts.patientName}</strong>, we'd love your feedback on your recent visit at ${practice}.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${opts.surveyUrl}" style="background:#f59e0b;color:#000;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600">Take the Survey →</a>
    </div>
    <p style="color:#475569;font-size:12px;text-align:center">Takes about 2 minutes. Thank you!</p>
  </div>`
  return sendNotification(env, {
    channel: 'EMAIL', type: 'SURVEY_INVITE', to: opts.email!,
    subject: `How was your visit at ${practice}?`,
    body: `Hi ${opts.patientName}, please take our 2-min survey: ${opts.surveyUrl}`,
    html, patientId: opts.patientId, patientName: opts.patientName,
  })
}
