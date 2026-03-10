// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Scheduling Library (D1-backed)
// Migrated from KV to D1 (SQLite)
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Appointment, AppointmentCreateInput, AppointmentStatus,
  Provider, Room, TimeSlot, WaitlistEntry, ScheduleDay,
} from '../types/scheduling'
import { APPOINTMENT_TYPES } from '../types/scheduling'
import { dbGet, dbAll, dbRun, uid as genUid, toJson, fromJson, now } from './db'

export const PROVIDERS: Provider[] = [
  {
    id: 'dr-chen', name: 'Dr. Sarah Chen, OD',
    firstName: 'Sarah', lastName: 'Chen', credentials: 'OD',
    specialty: 'General Optometry & Contact Lenses',
    color: 'blue', npi: '1234567890', isActive: true,
    workDays: [1,2,3,4,5], startTime: '08:00', endTime: '17:00',
    lunchStart: '12:00', lunchEnd: '13:00',
    slotDuration: 20, maxPatientsPerDay: 20,
  },
  {
    id: 'dr-patel', name: 'Dr. Raj Patel, MD',
    firstName: 'Raj', lastName: 'Patel', credentials: 'MD',
    specialty: 'Ophthalmology & Glaucoma',
    color: 'violet', npi: '0987654321', isActive: true,
    workDays: [1,2,3,4,5], startTime: '08:00', endTime: '17:00',
    lunchStart: '12:30', lunchEnd: '13:30',
    slotDuration: 20, maxPatientsPerDay: 18,
  },
  {
    id: 'dr-okonkwo', name: 'Dr. Adaeze Okonkwo, OD',
    firstName: 'Adaeze', lastName: 'Okonkwo', credentials: 'OD',
    specialty: 'Pediatric Optometry & Vision Therapy',
    color: 'green', npi: '1122334455', isActive: true,
    workDays: [1,3,5], startTime: '09:00', endTime: '16:00',
    lunchStart: '12:00', lunchEnd: '13:00',
    slotDuration: 30, maxPatientsPerDay: 12,
  },
]

export const ROOMS: Room[] = [
  { id: 'exam-1', name: 'Exam Room 1', type: 'EXAM', isActive: true },
  { id: 'exam-2', name: 'Exam Room 2', type: 'EXAM', isActive: true },
  { id: 'exam-3', name: 'Exam Room 3', type: 'EXAM', isActive: true },
  { id: 'pretesting', name: 'Pre-Testing', type: 'PRETESTING', isActive: true },
  { id: 'contact-lens', name: 'Contact Lens Fitting', type: 'CONTACT_LENS', isActive: true },
]

// ── Date helpers ──────────────────────────────────────────────────────────
function toDateStr(d: Date): string { return d.toISOString().slice(0, 10) }
function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}
function addMinutes(time: string, mins: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
function timeToMins(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}
function confirmationCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

// ── Slot generator ────────────────────────────────────────────────────────
export function generateSlots(provider: Provider, date: string, bookedTimes: string[] = []): TimeSlot[] {
  const d = new Date(date + 'T12:00:00')
  const dow = d.getDay()
  if (!provider.workDays.includes(dow)) return []

  const slots: TimeSlot[] = []
  let cursor = provider.startTime
  const end = provider.endTime
  const lunchS = provider.lunchStart
  const lunchE = provider.lunchEnd

  while (timeToMins(cursor) + provider.slotDuration <= timeToMins(end)) {
    const slotEnd = addMinutes(cursor, provider.slotDuration)
    const inLunch = lunchS && lunchE &&
      timeToMins(cursor) >= timeToMins(lunchS) &&
      timeToMins(cursor) < timeToMins(lunchE)
    if (!inLunch) {
      const isBooked = bookedTimes.includes(cursor)
      slots.push({
        providerId: provider.id,
        providerName: provider.name,
        date,
        startTime: cursor,
        endTime: slotEnd,
        isAvailable: !isBooked,
        appointmentId: isBooked ? 'booked' : undefined,
      })
    }
    cursor = addMinutes(cursor, provider.slotDuration)
  }
  return slots
}

// ── Build ScheduleDay ─────────────────────────────────────────────────────
export function buildScheduleDay(date: string, appointments: Appointment[]): ScheduleDay {
  const d = new Date(date + 'T12:00:00')
  const today = toDateStr(new Date())
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const bookedByProvider: Record<string, string[]> = {}
  for (const appt of appointments) {
    if (!bookedByProvider[appt.providerId]) bookedByProvider[appt.providerId] = []
    if (appt.status !== 'CANCELLED' && appt.status !== 'NO_SHOW') {
      bookedByProvider[appt.providerId].push(appt.startTime)
    }
  }

  const allSlots: TimeSlot[] = []
  for (const prov of PROVIDERS) {
    const slots = generateSlots(prov, date, bookedByProvider[prov.id] || [])
    allSlots.push(...slots)
  }

  const capacity = allSlots.length
  const booked = appointments.filter(a => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW').length

  return {
    date,
    dayLabel: days[d.getDay()],
    dateLabel: `${months[d.getMonth()]} ${d.getDate()}`,
    isToday: date === today,
    isPast: date < today,
    appointments,
    slots: allSlots,
    capacity,
    booked,
    available: capacity - booked,
  }
}

// ── Row to Appointment ────────────────────────────────────────────────────
function rowToAppointment(r: Record<string, unknown>): Appointment {
  return {
    id: r.id as string,
    organizationId: r.organization_id as string,
    patientId: r.patient_id as string,
    patientName: r.patient_name as string,
    providerId: r.provider_id as string,
    providerName: r.provider_name as string,
    date: r.appointment_date as string,
    startTime: r.start_time as string,
    endTime: r.end_time as string,
    appointmentType: r.appointment_type as string,
    status: r.status as AppointmentStatus,
    roomId: r.room_id as string,
    reason: r.reason as string,
    notes: r.notes as string,
    confirmationCode: r.confirmation_code as string,
    checkedInAt: r.checked_in_at as string,
    checkedOutAt: r.checked_out_at as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

// ── Seed ──────────────────────────────────────────────────────────────────
export async function ensureScheduleSeed(kv: KVNamespace, db?: D1Database): Promise<void> {
  if (!db) return

  const count = await dbGet<{ n: number }>(db, 'SELECT COUNT(*) as n FROM appointments')
  if (count && count.n > 0) return

  // Seed org
  await dbRun(db, `INSERT OR IGNORE INTO organizations (id, name) VALUES ('org-001', 'Advanced Eye Care of Miami')`)

  // Seed providers
  for (const p of PROVIDERS) {
    await dbRun(db, `INSERT OR IGNORE INTO providers (id, organization_id, first_name, last_name, display_name, credentials, specialty, color, npi, is_active, work_days, start_time, end_time, lunch_start, lunch_end, slot_duration, max_patients_per_day)
      VALUES (?, 'org-001', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      [p.id, p.firstName, p.lastName, p.name, p.credentials, p.specialty, p.color, p.npi,
       JSON.stringify(p.workDays), p.startTime, p.endTime, p.lunchStart || null, p.lunchEnd || null,
       p.slotDuration, p.maxPatientsPerDay])
  }

  // Seed rooms
  for (const r of ROOMS) {
    await dbRun(db, `INSERT OR IGNORE INTO rooms (id, organization_id, name, type, is_active) VALUES (?, 'org-001', ?, ?, 1)`,
      [r.id, r.name, r.type])
  }

  const today = toDateStr(new Date())
  const appts = [
    { id: 'appt-001', patientId: 'pt-001', patientName: 'Margaret Sullivan', providerId: 'dr-chen', type: 'COMPREHENSIVE_EYE_EXAM', typeLabel: 'Comprehensive Eye Exam', time: '09:00', end: '09:20', room: 'exam-1' },
    { id: 'appt-002', patientId: 'pt-002', patientName: 'James Rivera', providerId: 'dr-patel', type: 'FOLLOWUP', typeLabel: 'Follow Up', time: '10:00', end: '10:20', room: 'exam-2' },
  ]

  for (const a of appts) {
    await dbRun(db, `INSERT OR IGNORE INTO appointments
      (id, organization_id, patient_id, patient_name, provider_id, provider_name, appointment_date, appt_date, start_time, end_time, appointment_type, type_label, status, room, confirmation_code, created_at, updated_at)
      VALUES (?, 'org-001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?, ?, ?, ?)`,
      [a.id, a.patientId, a.patientName, a.providerId,
       PROVIDERS.find(p => p.id === a.providerId)?.name || '',
       today, today, a.time, a.end, a.type, a.typeLabel, a.room, confirmationCode(), now(), now()])
  }
}

// ── Get schedule range ────────────────────────────────────────────────────
export async function getScheduleRange(kv: KVNamespace, startDate: string, days: number, db?: D1Database): Promise<ScheduleDay[]> {
  if (db) {
    const result: ScheduleDay[] = []
    for (let i = 0; i < days; i++) {
      const date = addDays(startDate, i)
      const appts = await dbAll<Record<string, unknown>>(db,
        `SELECT * FROM appointments WHERE appointment_date = ? AND organization_id = 'org-001' ORDER BY start_time`,
        [date])
      result.push(buildScheduleDay(date, appts.map(rowToAppointment)))
    }
    return result
  }
  // KV fallback - minimal implementation
  return []
}

// ── Get appointments by date ──────────────────────────────────────────────
export async function getAppointmentsByDate(kv: KVNamespace, date: string, db?: D1Database): Promise<Appointment[]> {
  if (db) {
    const rows = await dbAll<Record<string, unknown>>(db,
      `SELECT * FROM appointments WHERE appointment_date = ? AND organization_id = 'org-001' ORDER BY start_time`,
      [date])
    return rows.map(rowToAppointment)
  }
  return []
}

// ── Get single appointment ────────────────────────────────────────────────
export async function getAppointment(kv: KVNamespace, id: string, db?: D1Database): Promise<Appointment | null> {
  if (db) {
    const row = await dbGet<Record<string, unknown>>(db, `SELECT * FROM appointments WHERE id = ?`, [id])
    return row ? rowToAppointment(row) : null
  }
  return null
}

// ── Create appointment ────────────────────────────────────────────────────
export async function createAppointment(kv: KVNamespace, input: AppointmentCreateInput, db?: D1Database): Promise<Appointment> {
  const id = genUid('appt')
  const provider = PROVIDERS.find(p => p.id === input.providerId)
  const ts = now()
  const appt: Appointment = {
    id,
    organizationId: 'org-001',
    patientId: input.patientId,
    patientName: input.patientName || '',
    providerId: input.providerId,
    providerName: provider?.name || '',
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime || addMinutes(input.startTime, provider?.slotDuration || 20),
    appointmentType: input.appointmentType,
    status: 'SCHEDULED',
    roomId: input.roomId,
    reason: input.reason,
    notes: input.notes,
    confirmationCode: confirmationCode(),
    createdAt: ts,
    updatedAt: ts,
  }

  if (db) {
    await dbRun(db, `INSERT INTO appointments
      (id, organization_id, patient_id, patient_name, provider_id, provider_name, appointment_date, start_time, end_time, appointment_type, status, room_id, reason, notes, confirmation_code, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [appt.id, appt.organizationId, appt.patientId, appt.patientName,
       appt.providerId, appt.providerName, appt.date, appt.startTime, appt.endTime,
       appt.appointmentType || null, appt.status, appt.roomId || null,
       appt.reason || null, appt.notes || null, appt.confirmationCode, appt.createdAt, appt.updatedAt])
  }
  return appt
}

// ── Update appointment ────────────────────────────────────────────────────
export async function updateAppointment(kv: KVNamespace, id: string, updates: Partial<Appointment>, db?: D1Database): Promise<Appointment | null> {
  const existing = await getAppointment(kv, id, db)
  if (!existing) return null
  const updated = { ...existing, ...updates, id, updatedAt: now() }
  if (db) {
    await dbRun(db, `UPDATE appointments SET patient_name=?, provider_id=?, provider_name=?, appointment_date=?, start_time=?, end_time=?, appointment_type=?, status=?, room_id=?, reason=?, notes=?, updated_at=? WHERE id=?`,
      [updated.patientName, updated.providerId, updated.providerName, updated.date,
       updated.startTime, updated.endTime, updated.appointmentType || null, updated.status,
       updated.roomId || null, updated.reason || null, updated.notes || null, updated.updatedAt, id])
  }
  return updated
}

// ── Update appointment status ─────────────────────────────────────────────
export async function updateAppointmentStatus(kv: KVNamespace, id: string, status: AppointmentStatus, db?: D1Database): Promise<Appointment | null> {
  if (db) {
    const ts = now()
    const extra: Record<string, string | null> = {}
    if (status === 'CHECKED_IN') extra.checked_in_at = ts
    if (status === 'CHECKED_OUT' || status === 'COMPLETED') extra.checked_out_at = ts
    await dbRun(db, `UPDATE appointments SET status=?, updated_at=? WHERE id=?`, [status, ts, id])
    if (extra.checked_in_at) await dbRun(db, `UPDATE appointments SET checked_in_at=? WHERE id=?`, [extra.checked_in_at, id])
    if (extra.checked_out_at) await dbRun(db, `UPDATE appointments SET checked_out_at=? WHERE id=?`, [extra.checked_out_at, id])
    return getAppointment(kv, id, db)
  }
  return null
}

// ── Cancel appointment ────────────────────────────────────────────────────
export async function cancelAppointment(kv: KVNamespace, id: string, db?: D1Database): Promise<boolean> {
  if (db) {
    await dbRun(db, `UPDATE appointments SET status='CANCELLED', updated_at=? WHERE id=?`, [now(), id])
    return true
  }
  return false
}

// ── Get available slots ───────────────────────────────────────────────────
export async function getAvailableSlots(kv: KVNamespace, date: string, providerId?: string, db?: D1Database): Promise<TimeSlot[]> {
  const appts = await getAppointmentsByDate(kv, date, db)
  const providers = providerId ? PROVIDERS.filter(p => p.id === providerId) : PROVIDERS
  const all: TimeSlot[] = []
  for (const p of providers) {
    const booked = appts.filter(a => a.providerId === p.id && a.status !== 'CANCELLED' && a.status !== 'NO_SHOW').map(a => a.startTime)
    all.push(...generateSlots(p, date, booked))
  }
  return all
}

// ── Waitlist ──────────────────────────────────────────────────────────────
export async function getWaitlist(kv: KVNamespace, db?: D1Database): Promise<WaitlistEntry[]> {
  if (db) {
    const rows = await dbAll<WaitlistEntry>(db, `SELECT * FROM waitlist WHERE organization_id = 'org-001' ORDER BY COALESCE(created_at, added_at) DESC`)
    return rows
  }
  return []
}

export async function addToWaitlist(kv: KVNamespace, entry: Omit<WaitlistEntry, 'id' | 'createdAt' | 'updatedAt'>, db?: D1Database): Promise<WaitlistEntry> {
  const id = genUid('wl')
  const ts = now()
  const record: WaitlistEntry = { ...entry, id, createdAt: ts, updatedAt: ts }
  if (db) {
    const apptType = (entry as any).appointmentType || (entry as any).appointment_type || 'FOLLOWUP'
    const typeLabel = (entry as any).typeLabel || (entry as any).type_label || apptType
    await dbRun(db, `INSERT INTO waitlist (id, organization_id, patient_id, patient_name, appointment_type, type_label, preferred_dates, preferred_times, notes, priority, status, added_at)
      VALUES (?, 'org-001', ?, ?, ?, ?, ?, ?, ?, ?, 'WAITING', ?)`,
      [id, entry.patientId, entry.patientName || null,
       apptType, typeLabel,
       toJson(entry.preferredDates), toJson(entry.preferredTimes),
       entry.notes || null, (entry as any).priority || 'NORMAL', ts])
  }
  return record
}

export async function removeFromWaitlist(kv: KVNamespace, id: string, db?: D1Database): Promise<boolean> {
  if (db) {
    await dbRun(db, `DELETE FROM waitlist WHERE id = ?`, [id])
    return true
  }
  return false
}
