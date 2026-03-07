// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — SMS / Twilio Helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sends an SMS via Twilio REST API
 */
export async function sendSms(
  to: string,
  body: string,
  twilioAccountSid: string,
  twilioAuthToken: string,
  twilioFromNumber: string
): Promise<{ success: boolean; sid?: string; error?: string }> {
  try {
    const credentials = btoa(`${twilioAccountSid}:${twilioAuthToken}`)
    const url = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`

    const formData = new URLSearchParams()
    formData.append('To', to)
    formData.append('From', twilioFromNumber)
    formData.append('Body', body)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    const result = await response.json() as { sid?: string; message?: string }

    if (!response.ok) {
      return { success: false, error: result.message ?? 'SMS send failed' }
    }

    return { success: true, sid: result.sid }
  } catch (err) {
    console.error('SMS error:', err)
    return { success: false, error: 'SMS service unavailable' }
  }
}

/**
 * Formats an OTP SMS message
 */
export function formatOtpMessage(otp: string, practiceName: string): string {
  return `[${practiceName}] Your verification code is: ${otp}. Valid for 10 minutes. Do not share this code.`
}

/**
 * Formats a patient intake link SMS
 */
export function formatIntakeLinkMessage(
  token: string,
  baseUrl: string,
  practiceName: string,
  appointmentDate: string
): string {
  const link = `${baseUrl}/intake?token=${token}`
  return `[${practiceName}] Hi! Your appointment is on ${appointmentDate}. Complete your pre-visit intake (takes 3 min): ${link}`
}

/**
 * Normalizes a US phone number to E.164 format (+1XXXXXXXXXX)
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

/**
 * Masks a phone number for display: (555) ***-**78
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10)
  if (digits.length < 10) return '***-****'
  return `(${digits.slice(0, 3)}) ***-**${digits.slice(8)}`
}
