// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Scheduling Library (Phase 1C)
// KV-backed appointment store, slot generator, seed data
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Appointment, AppointmentCreateInput, AppointmentStatus,
  Provider, Room, TimeSlot, WaitlistEntry, ScheduleDay,
} from '../types/scheduling'
import { APPOINTMENT_TYPES } from '../types/scheduling'

// ── KV key schema ──────────────────────────────────────────────────────────
// appts:index            → string[]  (all appointment IDs)
// appt:{id}              → Appointment JSON
// appts:date:{YYYY-MM-DD}→ string[]  (IDs for that day)
// waitlist:index         → string[]  (all waitlist IDs)
// waitlist:{id}          → WaitlistEntry JSON
// schedule:seeded        → '1'       (sentinel)

const KV_APPT_INDEX    = 'appts:index'
const KV_APPT          = (id: string)   => `appt:${id}`
const KV_APPT_DATE     = (d: string)    => `appts:date:${d}`
const KV_WL_INDEX      = 'waitlist:index'
const KV_WL            = (id: string)   => `waitlist:${id}`
const KV_SEEDED        = 'schedule:seeded'

// ── Static providers (matches dashboard seed) ─────────────────────────────
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
]

export const ROOMS: Room[] = [
  { id: 'exam-1',    name: 'Exam Room 1', type: 'EXAM',     isActive: true },
  { id: 'exam-2',    name: 'Exam Room 2', type: 'EXAM',     isActive: true },
  { id: 'exam-3',    name: 'Exam Room 3', type: 'EXAM',     isActive: true },
  { id: 'pretest-a', name: 'Pre-Test A',  type: 'PRE_TEST', isActive: true },
  { id: 'pretest-b', name: 'Pre-Test B',  type: 'PRE_TEST', isActive: true },
  { id: 'optical',   name: 'Optical',     type: 'OPTICAL',  isActive: true },
]

// ── Date helpers ──────────────────────────────────────────────────────────
function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function addMinutes(timeStr: string, mins: number): string {
  const [h, m] = timeStr.split(':').map(Number)
  const total  = h * 60 + m + mins
  return `${String(Math.floor(total / 60)).padStart(2,'0')}:${String(total % 60).padStart(2,'0')}`
}

function timeToMins(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function confirmationCode(): string {
  return Math.random().toString(36).slice(2,8).toUpperCase()
}

// ── Slot generator ─────────────────────────────────────────────────────────
export function generateSlots(provider: Provider, date: string, bookedTimes: string[] = []): TimeSlot[] {
  const d    = new Date(date + 'T12:00:00') // noon avoids TZ edge cases
  const dow  = d.getDay()
  if (!provider.workDays.includes(dow)) return []

  const slots: TimeSlot[] = []
  let   cursor  = provider.startTime
  const end     = provider.endTime
  const lunchS  = provider.lunchStart
  const lunchE  = provider.lunchEnd

  while (timeToMins(cursor) + provider.slotDuration <= timeToMins(end)) {
    const slotEnd = addMinutes(cursor, provider.slotDuration)

    // Skip lunch
    const inLunch = lunchS && lunchE &&
      timeToMins(cursor) >= timeToMins(lunchS) &&
      timeToMins(cursor) < timeToMins(lunchE)

    if (!inLunch) {
      const isBooked = bookedTimes.includes(cursor)
      slots.push({
        providerId:   provider.id,
        providerName: provider.name,
        date,
        startTime:    cursor,
        endTime:      slotEnd,
        isAvailable:  !isBooked,
        appointmentId: isBooked ? 'booked' : undefined,
      })
    }
    cursor = addMinutes(cursor, provider.slotDuration)
  }
  return slots
}

// ── Build ScheduleDay ─────────────────────────────────────────────────────
export function buildScheduleDay(date: string, appointments: Appointment[]): ScheduleDay {
  const d      = new Date(date + 'T12:00:00')
  const today  = toDateStr(new Date())
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  // Build slots for each provider
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
  const booked   = appointments.filter(a => a.status !== 'CANCELLED' && a.status !== 'NO_SHOW').length

  return {
    date,
    dayLabel:   days[d.getDay()],
    dateLabel:  `${months[d.getMonth()]} ${d.getDate()}`,
    isToday:    date === today,
    isWeekend:  d.getDay() === 0 || d.getDay() === 6,
    appointments,
    slots:      allSlots,
    totalBooked: booked,
    totalCapacity: capacity,
  }
}

// ── KV helpers ─────────────────────────────────────────────────────────────
async function getAllApptIds(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(KV_APPT_INDEX)
  return raw ? JSON.parse(raw) : []
}

async function getDateApptIds(kv: KVNamespace, date: string): Promise<string[]> {
  const raw = await kv.get(KV_APPT_DATE(date))
  return raw ? JSON.parse(raw) : []
}

async function addToDateIndex(kv: KVNamespace, date: string, id: string): Promise<void> {
  const ids = await getDateApptIds(kv, date)
  if (!ids.includes(id)) {
    ids.push(id)
    await kv.put(KV_APPT_DATE(date), JSON.stringify(ids))
  }
}

async function removeFromDateIndex(kv: KVNamespace, date: string, id: string): Promise<void> {
  const ids = await getDateApptIds(kv, date)
  await kv.put(KV_APPT_DATE(date), JSON.stringify(ids.filter(i => i !== id)))
}

// ── Seed Data — 14 days of appointments ──────────────────────────────────
function buildSeedAppointments(): Appointment[] {
  const today  = new Date()
  const now    = new Date().toISOString()
  const appts: Appointment[] = []

  // Helper: push appointment
  const add = (
    daysOffset: number,
    id: string, patientId: string, patientName: string, patientDob: string,
    providerId: string, startTime: string,
    type: import('../types/scheduling').AppointmentType,
    status: AppointmentStatus,
    chiefComplaint: string,
    copay: number,
    insuranceVerified: boolean,
    intakeComplete: boolean,
    urgent = false,
    patientPhone?: string,
  ) => {
    const apptDate   = toDateStr(addDays(today, daysOffset))
    const typeConfig = APPOINTMENT_TYPES.find(t => t.type === type)!
    const duration   = typeConfig.duration
    const endTime    = addMinutes(startTime, duration)
    const prov       = PROVIDERS.find(p => p.id === providerId)!

    appts.push({
      id, organizationId: 'org-001',
      patientId, patientName, patientDob, patientPhone,
      providerId, providerName: prov.name,
      date: apptDate, startTime, endTime, duration,
      appointmentType: type, typeLabel: typeConfig.label,
      chiefComplaint, status,
      confirmationCode: confirmationCode(),
      intakeComplete, insuranceVerified, copay, urgent,
      color: prov.color,
      createdAt: now, updatedAt: now,
      waitMinutes: status === 'WITH_DOCTOR' || status === 'IN_PRETESTING' ? Math.floor(Math.random()*15)+3 : 0,
    })
  }

  // ── Today ──────────────────────────────────────────────────────────────
  add(0,'appt-001','pt-001','Margaret Sullivan','1948-03-12','dr-chen', '08:00','COMPREHENSIVE_EYE_EXAM','COMPLETED',  'Annual exam, blurry distance vision',30,true,true)
  add(0,'appt-002','pt-002','Derek Holloway',   '1976-09-22','dr-patel','08:20','GLAUCOMA_FOLLOWUP',    'WITH_DOCTOR', 'Glaucoma monitoring, IOP check',       45,true,true)
  add(0,'appt-003','pt-003','Priya Nair',        '1990-07-04','dr-chen', '08:40','CONTACT_LENS_FITTING','IN_PRETESTING','First-time contact lens fit',         20,true,true)
  add(0,'appt-004','pt-004','Charles Beaumont',  '1955-12-30','dr-patel','09:00','DIABETIC_EYE_EXAM',   'CHECKED_IN',  'Annual diabetic retinal screening',    30,true,true)
  add(0,'appt-005','pt-005','Amelia Torres',     '2001-05-17','dr-chen', '09:20','COMPREHENSIVE_EYE_EXAM','CHECKED_IN','Headaches, possible need for glasses', 30,false,false)
  add(0,'appt-006','pt-006','Robert Kim',        '1968-02-14','dr-patel','09:40','POST_OP',              'SCHEDULED',  '1-week post cataract surgery OD',       0,true,false)
  add(0,'appt-007','pt-007','Vivian Okonkwo',    '1972-11-08','dr-chen', '10:00','COMPREHENSIVE_EYE_EXAM','SCHEDULED', 'New patient, referred by Dr. Lopez',  50,true,true)
  add(0,'appt-008','pt-008','James Whitfield',   '1943-06-25','dr-patel','10:20','FOLLOWUP',             'SCHEDULED',  'Macular degeneration monitoring',     45,true,true)
  add(0,'appt-009','pt-001','Margaret Sullivan', '1948-03-12','dr-chen', '11:00','REFRACTION_ONLY',      'SCHEDULED',  'New glasses prescription update',     20,false,false)
  add(0,'appt-010','pt-004','Charles Beaumont',  '1955-12-30','dr-patel','11:20','URGENT_CARE',          'SCHEDULED',  'Sudden floaters + flashes',           75,false,false,true)

  // ── Tomorrow ────────────────────────────────────────────────────────────
  add(1,'appt-011','pt-002','Derek Holloway',  '1976-09-22','dr-patel','08:00','GLAUCOMA_FOLLOWUP',   'CONFIRMED','IOP recheck after medication change',   45,true,true)
  add(1,'appt-012','pt-006','Robert Kim',      '1968-02-14','dr-chen', '08:40','COMPREHENSIVE_EYE_EXAM','SCHEDULED','Annual comprehensive exam',            20,true,true)
  add(1,'appt-013','pt-003','Priya Nair',      '1990-07-04','dr-chen', '09:00','CONTACT_LENS_FITTING','SCHEDULED', 'CL follow-up, 1-week check',           20,true,true)
  add(1,'appt-014','pt-007','Vivian Okonkwo',  '1972-11-08','dr-patel','09:20','RETINA_CONSULT',      'SCHEDULED', 'Referral from Dr. Lopez - floaters',   50,true,true)
  add(1,'appt-015','pt-005','Amelia Torres',   '2001-05-17','dr-chen', '10:00','REFRACTION_ONLY',     'SCHEDULED', 'Glasses prescription update',          30,false,false)
  add(1,'appt-016','pt-008','James Whitfield', '1943-06-25','dr-patel','10:40','POST_OP',             'SCHEDULED', '2-week Eylea injection follow-up',      0,true,true)

  // ── Day +2 ──────────────────────────────────────────────────────────────
  add(2,'appt-017','pt-001','Margaret Sullivan','1948-03-12','dr-patel','08:20','GLAUCOMA_FOLLOWUP',    'SCHEDULED','Visual field test + IOP',              30,true,true)
  add(2,'appt-018','pt-004','Charles Beaumont', '1955-12-30','dr-chen', '09:00','DIABETIC_EYE_EXAM',   'SCHEDULED','6-month diabetic retina check',         30,true,true)
  add(2,'appt-019','pt-006','Robert Kim',       '1968-02-14','dr-patel','09:40','DRY_EYE_CONSULT',     'SCHEDULED','Chronic dry eye, new treatment plan',   0,true,true)
  add(2,'appt-020','pt-003','Priya Nair',       '1990-07-04','dr-chen', '10:20','COMPREHENSIVE_EYE_EXAM','SCHEDULED','Annual comprehensive + CL eval',      20,true,true)

  // ── Day +3 ──────────────────────────────────────────────────────────────
  add(3,'appt-021','pt-007','Vivian Okonkwo',  '1972-11-08','dr-chen', '08:00','COMPREHENSIVE_EYE_EXAM','SCHEDULED','Annual exam',                          50,true,true)
  add(3,'appt-022','pt-008','James Whitfield', '1943-06-25','dr-patel','08:40','RETINA_CONSULT',      'SCHEDULED', 'AMD monitoring, OCT + FA review',      45,true,true)
  add(3,'appt-023','pt-002','Derek Holloway',  '1976-09-22','dr-patel','09:20','POST_OP',             'SCHEDULED', '1-month post trabeculectomy check',    45,true,true)
  add(3,'appt-024','pt-005','Amelia Torres',   '2001-05-17','dr-chen', '10:00','PEDIATRIC_EXAM',      'SCHEDULED', 'Myopia progression check',             30,false,false)

  // ── Day +4 ──────────────────────────────────────────────────────────────
  add(4,'appt-025','pt-001','Margaret Sullivan','1948-03-12','dr-chen', '08:40','CONTACT_LENS_FITTING','SCHEDULED','Multifocal CL trial fit',               30,true,true)
  add(4,'appt-026','pt-004','Charles Beaumont', '1955-12-30','dr-patel','09:00','GLAUCOMA_FOLLOWUP',   'SCHEDULED','Quarterly IOP + VF check',              30,true,true)
  add(4,'appt-027','pt-006','Robert Kim',       '1968-02-14','dr-patel','09:40','PRE_OP',              'SCHEDULED', 'Cataract pre-op evaluation OS',        0,true,true)

  // ── Day +7 (one week out) ───────────────────────────────────────────────
  add(7,'appt-028','pt-002','Derek Holloway',  '1976-09-22','dr-patel','08:00','GLAUCOMA_FOLLOWUP',   'SCHEDULED', 'Monthly IOP monitoring',               45,true,true)
  add(7,'appt-029','pt-003','Priya Nair',      '1990-07-04','dr-chen', '09:00','REFRACTION_ONLY',     'SCHEDULED', 'New glasses Rx after CL eval',         20,true,true)
  add(7,'appt-030','pt-007','Vivian Okonkwo',  '1972-11-08','dr-chen', '10:00','DRY_EYE_CONSULT',     'SCHEDULED', 'IPL treatment consult',                50,false,false)

  return appts
}

// ── Seed Data — Waitlist ──────────────────────────────────────────────────
function buildSeedWaitlist(): WaitlistEntry[] {
  const now = new Date().toISOString()
  return [
    {
      id: 'wl-001', patientId: 'pt-005', patientName: 'Amelia Torres',
      patientPhone: '(786) 555-0509',
      providerId: 'dr-chen', appointmentType: 'COMPREHENSIVE_EYE_EXAM',
      typeLabel: 'Comprehensive Exam', preferredTimes: ['AM'],
      notes: 'Needs appointment ASAP — recurring headaches',
      priority: 'URGENT', addedAt: now, status: 'WAITING',
    },
    {
      id: 'wl-002', patientId: 'pt-007', patientName: 'Vivian Okonkwo',
      patientPhone: '(954) 555-0712',
      appointmentType: 'GLAUCOMA_FOLLOWUP', typeLabel: 'Glaucoma Follow-up',
      preferredTimes: ['AM', 'PM'], priority: 'NORMAL', addedAt: now, status: 'WAITING',
    },
    {
      id: 'wl-003', patientId: 'pt-008', patientName: 'James Whitfield',
      patientPhone: '(305) 555-0813',
      providerId: 'dr-patel', appointmentType: 'POST_OP', typeLabel: 'Post-Op Check',
      preferredTimes: ['AM'],
      notes: 'Monthly Eylea injection - next available slot with Dr. Patel',
      priority: 'URGENT', addedAt: now, status: 'WAITING',
    },
    {
      id: 'wl-004', patientId: 'pt-003', patientName: 'Priya Nair',
      patientPhone: '(954) 555-0305',
      appointmentType: 'CONTACT_LENS_FITTING', typeLabel: 'Contact Lens Fitting',
      preferredTimes: ['ANY'], priority: 'FLEXIBLE', addedAt: now, status: 'WAITING',
    },
  ]
}

// ── Public: Ensure seed data ──────────────────────────────────────────────
export async function ensureScheduleSeed(kv: KVNamespace): Promise<void> {
  const seeded = await kv.get(KV_SEEDED)
  if (seeded) return

  const appts = buildSeedAppointments()
  const ids: string[] = []

  await Promise.all(appts.map(async (a) => {
    await kv.put(KV_APPT(a.id), JSON.stringify(a))
    await addToDateIndex(kv, a.date, a.id)
    ids.push(a.id)
  }))
  await kv.put(KV_APPT_INDEX, JSON.stringify(ids))

  // Seed waitlist
  const wlEntries = buildSeedWaitlist()
  const wlIds: string[] = []
  await Promise.all(wlEntries.map(async (w) => {
    await kv.put(KV_WL(w.id), JSON.stringify(w))
    wlIds.push(w.id)
  }))
  await kv.put(KV_WL_INDEX, JSON.stringify(wlIds))

  await kv.put(KV_SEEDED, '1')
}

// ── Get appointments for a date range ─────────────────────────────────────
export async function getAppointmentsByDate(
  kv: KVNamespace,
  date: string,
): Promise<Appointment[]> {
  const ids  = await getDateApptIds(kv, date)
  const appts: Appointment[] = []
  for (const id of ids) {
    const raw = await kv.get(KV_APPT(id))
    if (raw) appts.push(JSON.parse(raw) as Appointment)
  }
  return appts.sort((a, b) => a.startTime.localeCompare(b.startTime))
}

// ── Get schedule for a date range (week view) ────────────────────────────
export async function getScheduleRange(
  kv: KVNamespace,
  startDate: string,
  days = 7,
): Promise<ScheduleDay[]> {
  await ensureScheduleSeed(kv)
  const result: ScheduleDay[] = []
  const start = new Date(startDate + 'T12:00:00')

  for (let i = 0; i < days; i++) {
    const date  = toDateStr(addDays(start, i))
    const appts = await getAppointmentsByDate(kv, date)
    result.push(buildScheduleDay(date, appts))
  }
  return result
}

// ── Get single appointment ────────────────────────────────────────────────
export async function getAppointment(kv: KVNamespace, id: string): Promise<Appointment | null> {
  const raw = await kv.get(KV_APPT(id))
  return raw ? JSON.parse(raw) as Appointment : null
}

// ── Create appointment ────────────────────────────────────────────────────
export async function createAppointment(
  kv: KVNamespace,
  input: AppointmentCreateInput,
): Promise<Appointment> {
  const now      = new Date().toISOString()
  const id       = `appt-${crypto.randomUUID().slice(0,8)}`
  const prov     = PROVIDERS.find(p => p.id === input.providerId)
  if (!prov) throw new Error(`Unknown provider: ${input.providerId}`)
  const typeConf = APPOINTMENT_TYPES.find(t => t.type === input.appointmentType)
  if (!typeConf) throw new Error(`Unknown appointment type: ${input.appointmentType}. Valid: ${APPOINTMENT_TYPES.map(t=>t.type).join(', ')}`)
  const endTime  = addMinutes(input.startTime, typeConf.duration)

  const appt: Appointment = {
    id, organizationId: 'org-001',
    patientId:    input.patientId,
    patientName:  input.patientName,
    patientDob:   input.patientDob,
    patientPhone: input.patientPhone,
    providerId:   input.providerId,
    providerName: prov.name,
    date:         input.date,
    startTime:    input.startTime,
    endTime,
    duration:     typeConf.duration,
    appointmentType: input.appointmentType,
    typeLabel:    typeConf.label,
    chiefComplaint: input.chiefComplaint,
    notes:        input.notes,
    status:       'SCHEDULED',
    confirmationCode: confirmationCode(),
    intakeComplete:    false,
    insuranceVerified: input.insuranceVerified ?? false,
    copay:        input.copay,
    urgent:       input.urgent ?? false,
    color:        prov.color,
    waitMinutes:  0,
    createdAt:    now,
    updatedAt:    now,
  }

  await kv.put(KV_APPT(id), JSON.stringify(appt))
  await addToDateIndex(kv, input.date, id)

  const ids = await getAllApptIds(kv)
  ids.unshift(id)
  await kv.put(KV_APPT_INDEX, JSON.stringify(ids))

  return appt
}

// ── Update appointment ────────────────────────────────────────────────────
export async function updateAppointment(
  kv: KVNamespace,
  id: string,
  updates: Partial<Appointment>,
): Promise<Appointment | null> {
  const existing = await getAppointment(kv, id)
  if (!existing) return null

  // If date changes, update date indexes
  if (updates.date && updates.date !== existing.date) {
    await removeFromDateIndex(kv, existing.date, id)
    await addToDateIndex(kv, updates.date, id)
  }

  const updated: Appointment = {
    ...existing,
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  }
  await kv.put(KV_APPT(id), JSON.stringify(updated))
  return updated
}

// ── Update appointment status ─────────────────────────────────────────────
export async function updateAppointmentStatus(
  kv: KVNamespace,
  id: string,
  status: AppointmentStatus,
  extras: Partial<Appointment> = {},
): Promise<Appointment | null> {
  const now = new Date().toISOString()
  const ts: Partial<Appointment> = {}
  if (status === 'CONFIRMED')   ts.confirmedAt  = now
  if (status === 'CHECKED_IN')  ts.checkedInAt  = now
  if (status === 'COMPLETED')   ts.completedAt  = now
  if (status === 'CANCELLED')   ts.cancelledAt  = now
  return updateAppointment(kv, id, { status, ...ts, ...extras })
}

// ── Cancel appointment ────────────────────────────────────────────────────
export async function cancelAppointment(
  kv: KVNamespace,
  id: string,
  reason?: string,
): Promise<Appointment | null> {
  return updateAppointmentStatus(kv, id, 'CANCELLED', { cancellationReason: reason })
}

// ── Get available slots for a date + provider ─────────────────────────────
export async function getAvailableSlots(
  kv: KVNamespace,
  date: string,
  providerId?: string,
): Promise<TimeSlot[]> {
  await ensureScheduleSeed(kv)
  const appts     = await getAppointmentsByDate(kv, date)
  const providers = providerId ? PROVIDERS.filter(p => p.id === providerId) : PROVIDERS
  const slots: TimeSlot[] = []

  for (const prov of providers) {
    const bookedTimes = appts
      .filter(a => a.providerId === prov.id && a.status !== 'CANCELLED' && a.status !== 'NO_SHOW')
      .map(a => a.startTime)
    slots.push(...generateSlots(prov, date, bookedTimes))
  }
  return slots
}

// ── Waitlist CRUD ─────────────────────────────────────────────────────────
export async function getWaitlist(kv: KVNamespace): Promise<WaitlistEntry[]> {
  await ensureScheduleSeed(kv)
  const ids = await kv.get(KV_WL_INDEX).then(r => r ? JSON.parse(r) as string[] : [])
  const entries: WaitlistEntry[] = []
  for (const id of ids) {
    const raw = await kv.get(KV_WL(id))
    if (raw) entries.push(JSON.parse(raw) as WaitlistEntry)
  }
  return entries.filter(e => e.status === 'WAITING' || e.status === 'OFFERED')
}

export async function addToWaitlist(
  kv: KVNamespace,
  entry: Omit<WaitlistEntry, 'id' | 'addedAt' | 'status'>,
): Promise<WaitlistEntry> {
  const id  = `wl-${crypto.randomUUID().slice(0,8)}`
  const now = new Date().toISOString()
  const wl: WaitlistEntry = { ...entry, id, addedAt: now, status: 'WAITING' }
  await kv.put(KV_WL(id), JSON.stringify(wl))
  const ids = await kv.get(KV_WL_INDEX).then(r => r ? JSON.parse(r) as string[] : [])
  ids.push(id)
  await kv.put(KV_WL_INDEX, JSON.stringify(ids))
  return wl
}

export async function removeFromWaitlist(kv: KVNamespace, id: string): Promise<boolean> {
  const raw = await kv.get(KV_WL(id))
  if (!raw) return false
  const entry: WaitlistEntry = JSON.parse(raw)
  entry.status = 'REMOVED'
  await kv.put(KV_WL(id), JSON.stringify(entry))
  return true
}
