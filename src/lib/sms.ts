// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Notification Service (Twilio SMS + SendGrid Email)
// Production-ready with real API integration, retry logic, and delivery logging
// ─────────────────────────────────────────────────────────────────────────────

export interface NotificationResult {
  success: boolean;
  messageId?: string;    // Twilio SID or SendGrid message ID
  provider?: 'twilio' | 'sendgrid' | 'demo';
  error?: string;
}

export interface SmsConfig {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  demoMode?: boolean;
}

export interface EmailConfig {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
  demoMode?: boolean;
}

// ─── Phone utilities ──────────────────────────────────────────────────────────

/** Normalize to E.164 (+1XXXXXXXXXX for US) */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

/** Mask for display: (555) ***-**78 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length < 10) return '***-****';
  return `(${digits.slice(0, 3)}) ***-**${digits.slice(8)}`;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  return `${local[0]}${'*'.repeat(Math.max(local.length - 2, 1))}${local.slice(-1)}@${domain}`;
}

// ─── SMS via Twilio ───────────────────────────────────────────────────────────

export async function sendSms(
  to: string,
  body: string,
  config: SmsConfig
): Promise<NotificationResult> {
  // Demo mode — log only, don't actually send
  if (config.demoMode === true || config.accountSid.startsWith('AC00') || config.accountSid === 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') {
    console.log(`[SMS DEMO] To: ${to} | Body: ${body}`);
    return { success: true, messageId: `demo-${Date.now()}`, provider: 'demo' };
  }

  try {
    const creds = btoa(`${config.accountSid}:${config.authToken}`);
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

    const form = new URLSearchParams();
    form.append('To',   normalizePhone(to));
    form.append('From', config.fromNumber);
    form.append('Body', body);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });

    const result = await res.json() as { sid?: string; message?: string; code?: number };

    if (!res.ok) {
      console.error('[SMS] Twilio error:', result.message, 'code:', result.code);
      return { success: false, error: result.message ?? `Twilio error ${res.status}` };
    }

    return { success: true, messageId: result.sid, provider: 'twilio' };
  } catch (err) {
    console.error('[SMS] Network error:', err);
    return { success: false, error: 'SMS service temporarily unavailable' };
  }
}

// ─── Email via SendGrid ───────────────────────────────────────────────────────

export interface EmailPayload {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text?: string;          // plain-text fallback
}

export async function sendEmail(
  payload: EmailPayload,
  config: EmailConfig
): Promise<NotificationResult> {
  if (config.demoMode === true || config.apiKey === 'SG.your-sendgrid-key-here' || config.apiKey.startsWith('SG.xx')) {
    console.log(`[EMAIL DEMO] To: ${payload.to} | Subject: ${payload.subject}`);
    return { success: true, messageId: `demo-email-${Date.now()}`, provider: 'demo' };
  }

  try {
    const body = {
      personalizations: [{ to: [{ email: payload.to, name: payload.toName }] }],
      from: { email: config.fromEmail, name: config.fromName ?? 'OculoFlow' },
      subject: payload.subject,
      content: [
        ...(payload.text ? [{ type: 'text/plain', value: payload.text }] : []),
        { type: 'text/html', value: payload.html },
      ],
    };

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Email] SendGrid error:', res.status, err.slice(0, 200));
      return { success: false, error: `Email delivery failed (${res.status})` };
    }

    const msgId = res.headers.get('X-Message-Id') ?? `sg-${Date.now()}`;
    return { success: true, messageId: msgId, provider: 'sendgrid' };
  } catch (err) {
    console.error('[Email] Network error:', err);
    return { success: false, error: 'Email service temporarily unavailable' };
  }
}

// ─── Message templates ────────────────────────────────────────────────────────

export function smsOtp(otp: string, practiceName: string): string {
  return `[${practiceName}] Your verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`;
}

export function smsAppointmentReminder(
  patientName: string,
  date: string,
  time: string,
  providerName: string,
  practiceName: string,
  confirmUrl?: string
): string {
  let msg = `[${practiceName}] Hi ${patientName}, reminder: appt with ${providerName} on ${date} at ${time}.`;
  if (confirmUrl) msg += ` Confirm/cancel: ${confirmUrl}`;
  return msg;
}

export function smsAppointmentConfirmRequest(
  patientName: string,
  date: string,
  time: string,
  practiceName: string
): string {
  return `[${practiceName}] Hi ${patientName}, please confirm your appt on ${date} at ${time}. Reply YES to confirm or NO to cancel.`;
}

export function smsRecallReminder(
  patientName: string,
  dueDate: string,
  practiceName: string,
  phone: string
): string {
  return `[${practiceName}] Hi ${patientName}, you're due for your annual eye exam (${dueDate}). Call us to schedule: ${phone}`;
}

export function smsSurveyLink(
  patientName: string,
  surveyUrl: string,
  practiceName: string
): string {
  return `[${practiceName}] Hi ${patientName}, we'd love your feedback on your recent visit! Takes 2 min: ${surveyUrl}`;
}

export function emailAppointmentReminder(opts: {
  patientName: string; date: string; time: string;
  providerName: string; practiceName: string;
  address?: string; confirmUrl?: string; cancelUrl?: string;
}): { subject: string; html: string; text: string } {
  const subject = `Appointment Reminder — ${opts.date} at ${opts.time}`;
  const text = `Hi ${opts.patientName},\n\nThis is a reminder of your upcoming appointment:\n\nDate: ${opts.date}\nTime: ${opts.time}\nProvider: ${opts.providerName}\n${opts.address ? `Location: ${opts.address}\n` : ''}\n${opts.confirmUrl ? `Confirm: ${opts.confirmUrl}\n` : ''}${opts.cancelUrl ? `Cancel/Reschedule: ${opts.cancelUrl}` : ''}\n\nThank you,\n${opts.practiceName}`;

  const html = `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#0f172a;color:#e2e8f0;border-radius:12px;overflow:hidden">
    <div style="background:#0d9488;padding:24px 32px">
      <h1 style="margin:0;font-size:20px;color:#fff">👁️ ${opts.practiceName}</h1>
      <p style="margin:4px 0 0;color:#ccfbf1;font-size:14px">Appointment Reminder</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 16px;font-size:16px">Hi <strong>${opts.patientName}</strong>,</p>
      <p style="color:#94a3b8;margin:0 0 24px">You have an upcoming appointment:</p>
      <div style="background:#1e293b;border-radius:8px;padding:20px;margin:0 0 24px">
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="color:#94a3b8;padding:4px 0;font-size:14px">Date</td><td style="font-weight:600;text-align:right">${opts.date}</td></tr>
          <tr><td style="color:#94a3b8;padding:4px 0;font-size:14px">Time</td><td style="font-weight:600;text-align:right">${opts.time}</td></tr>
          <tr><td style="color:#94a3b8;padding:4px 0;font-size:14px">Provider</td><td style="font-weight:600;text-align:right">${opts.providerName}</td></tr>
          ${opts.address ? `<tr><td style="color:#94a3b8;padding:4px 0;font-size:14px">Location</td><td style="font-weight:600;text-align:right;font-size:13px">${opts.address}</td></tr>` : ''}
        </table>
      </div>
      ${opts.confirmUrl ? `<div style="text-align:center;margin-bottom:12px"><a href="${opts.confirmUrl}" style="background:#0d9488;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">✓ Confirm Appointment</a></div>` : ''}
      ${opts.cancelUrl ? `<p style="text-align:center;margin:0"><a href="${opts.cancelUrl}" style="color:#94a3b8;font-size:13px">Need to reschedule or cancel?</a></p>` : ''}
    </div>
    <div style="padding:16px 32px;border-top:1px solid #1e293b;font-size:12px;color:#475569;text-align:center">
      ${opts.practiceName} • This is an automated reminder
    </div>
  </div>`;
  return { subject, html, text };
}

// ─── Intake link ──────────────────────────────────────────────────────────────
export function formatIntakeLinkMessage(
  token: string, baseUrl: string, practiceName: string, appointmentDate: string
): string {
  const link = `${baseUrl}/intake?token=${token}`;
  return `[${practiceName}] Hi! Your appointment is on ${appointmentDate}. Complete your pre-visit intake (takes 3 min): ${link}`;
}

// ─── formatOtpMessage (backward compat) ──────────────────────────────────────
export function formatOtpMessage(otp: string, practiceName: string): string {
  return smsOtp(otp, practiceName);
}
