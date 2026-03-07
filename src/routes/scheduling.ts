// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Scheduling API Routes (Phase 1C)
//
// GET  /api/schedule/week          — week view (7 days from ?start=YYYY-MM-DD)
// GET  /api/schedule/day           — single day (?date=YYYY-MM-DD)
// GET  /api/schedule/slots         — available slots (?date=&providerId=)
// GET  /api/schedule/providers     — list providers
// GET  /api/schedule/appointment/:id
// POST /api/schedule/appointment   — create appointment
// PUT  /api/schedule/appointment/:id
// POST /api/schedule/appointment/:id/status — update status
// DELETE /api/schedule/appointment/:id      — cancel
// GET  /api/schedule/waitlist
// POST /api/schedule/waitlist
// DELETE /api/schedule/waitlist/:id
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import type { ApiResponse } from '../types/intake'
import type { AppointmentCreateInput, AppointmentStatus } from '../types/scheduling'
import {
  ensureScheduleSeed,
  getScheduleRange,
  getAppointmentsByDate,
  getAppointment,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  cancelAppointment,
  getAvailableSlots,
  getWaitlist,
  addToWaitlist,
  removeFromWaitlist,
  PROVIDERS,
  ROOMS,
} from '../lib/scheduling'
import { APPOINTMENT_TYPES } from '../types/scheduling'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  DEMO_MODE: string
}

const scheduleRoutes = new Hono<{ Bindings: Bindings }>()

// ── GET /api/schedule/providers ──────────────────────────────────────────
scheduleRoutes.get('/providers', (c) => {
  return c.json<ApiResponse>({ success: true, data: { providers: PROVIDERS, rooms: ROOMS } })
})

// ── GET /api/schedule/appointment-types ─────────────────────────────────
scheduleRoutes.get('/appointment-types', (c) => {
  return c.json<ApiResponse>({ success: true, data: APPOINTMENT_TYPES })
})

// ── GET /api/schedule/week ───────────────────────────────────────────────
scheduleRoutes.get('/week', async (c) => {
  const startParam = c.req.query('start')
  const days       = parseInt(c.req.query('days') || '7', 10)

  // Default to start of this week (Monday)
  let startDate: string
  if (startParam) {
    startDate = startParam
  } else {
    const today = new Date()
    const dow   = today.getDay()                         // 0=Sun
    const mon   = new Date(today)
    mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
    startDate = mon.toISOString().split('T')[0]
  }

  try {
    await ensureScheduleSeed(c.env.OCULOFLOW_KV)
    const schedule = await getScheduleRange(c.env.OCULOFLOW_KV, startDate, Math.min(days, 14))
    return c.json<ApiResponse>({ success: true, data: { schedule, startDate } })
  } catch (err) {
    console.error('Week schedule error:', err)
    return c.json<ApiResponse>({ success: false, error: 'Could not load schedule' }, 500)
  }
})

// ── GET /api/schedule/day ────────────────────────────────────────────────
scheduleRoutes.get('/day', async (c) => {
  const date = c.req.query('date') || new Date().toISOString().split('T')[0]

  try {
    await ensureScheduleSeed(c.env.OCULOFLOW_KV)
    const appts = await getAppointmentsByDate(c.env.OCULOFLOW_KV, date)

    // Compute KPIs for the day
    const total     = appts.filter(a => a.status !== 'CANCELLED').length
    const completed = appts.filter(a => a.status === 'COMPLETED').length
    const inOffice  = appts.filter(a =>
      ['CHECKED_IN','IN_PRETESTING','READY_FOR_DOCTOR','WITH_DOCTOR','CHECKOUT'].includes(a.status)
    ).length
    const cancelled = appts.filter(a => a.status === 'CANCELLED').length
    const noShows   = appts.filter(a => a.status === 'NO_SHOW').length
    const revenue   = appts
      .filter(a => a.status === 'COMPLETED')
      .reduce((s, a) => s + (a.copay || 0), 0)

    return c.json<ApiResponse>({
      success: true,
      data: {
        date,
        appointments: appts,
        kpis: { total, completed, inOffice, cancelled, noShows, revenue },
      },
    })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not load day' }, 500)
  }
})

// ── GET /api/schedule/slots ──────────────────────────────────────────────
scheduleRoutes.get('/slots', async (c) => {
  const date       = c.req.query('date') || new Date().toISOString().split('T')[0]
  const providerId = c.req.query('providerId')

  try {
    await ensureScheduleSeed(c.env.OCULOFLOW_KV)
    const slots = await getAvailableSlots(c.env.OCULOFLOW_KV, date, providerId)
    return c.json<ApiResponse>({
      success: true,
      data: {
        date,
        slots,
        available: slots.filter(s => s.isAvailable).length,
        booked:    slots.filter(s => !s.isAvailable).length,
      },
    })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not load slots' }, 500)
  }
})

// ── GET /api/schedule/appointment/:id ────────────────────────────────────
scheduleRoutes.get('/appointment/:id', async (c) => {
  const id = c.req.param('id')
  try {
    await ensureScheduleSeed(c.env.OCULOFLOW_KV)
    const appt = await getAppointment(c.env.OCULOFLOW_KV, id)
    if (!appt) return c.json<ApiResponse>({ success: false, error: 'Appointment not found' }, 404)
    return c.json<ApiResponse>({ success: true, data: appt })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not load appointment' }, 500)
  }
})

// ── POST /api/schedule/appointment ───────────────────────────────────────
scheduleRoutes.post('/appointment', async (c) => {
  const raw  = await c.req.json<AppointmentCreateInput & { time?: string }>()
  // Accept 'time' as alias for 'startTime' for frontend convenience
  const body: AppointmentCreateInput = { ...raw, startTime: raw.startTime ?? raw.time ?? '' }

  if (!body.patientName || !body.providerId || !body.date || !body.startTime || !body.appointmentType) {
    return c.json<ApiResponse>({
      success: false,
      error: 'patientName, providerId, date, startTime, appointmentType are required',
    }, 400)
  }

  // Verify slot is still available
  try {
    const slots = await getAvailableSlots(c.env.OCULOFLOW_KV, body.date, body.providerId)
    const slot  = slots.find(s => s.startTime === body.startTime)
    if (slot && !slot.isAvailable) {
      return c.json<ApiResponse>({ success: false, error: 'This slot is no longer available' }, 409)
    }

    const appt = await createAppointment(c.env.OCULOFLOW_KV, body)
    return c.json<ApiResponse>({
      success: true,
      data: appt,
      message: `Appointment booked — ${appt.confirmationCode}`,
    }, 201)
  } catch (err) {
    console.error('Create appt error:', err)
    return c.json<ApiResponse>({ success: false, error: 'Could not create appointment' }, 500)
  }
})

// ── PUT /api/schedule/appointment/:id ────────────────────────────────────
scheduleRoutes.put('/appointment/:id', async (c) => {
  const id      = c.req.param('id')
  const updates = await c.req.json()

  // Guard immutable fields
  delete updates.id
  delete updates.organizationId
  delete updates.createdAt
  delete updates.confirmationCode

  try {
    const updated = await updateAppointment(c.env.OCULOFLOW_KV, id, updates)
    if (!updated) return c.json<ApiResponse>({ success: false, error: 'Appointment not found' }, 404)
    return c.json<ApiResponse>({ success: true, data: updated, message: 'Appointment updated' })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not update appointment' }, 500)
  }
})

// ── POST /api/schedule/appointment/:id/status ────────────────────────────
scheduleRoutes.post('/appointment/:id/status', async (c) => {
  const id   = c.req.param('id')
  const body = await c.req.json<{ status: AppointmentStatus; room?: string; notes?: string }>()

  const VALID_STATUSES: AppointmentStatus[] = [
    'SCHEDULED','CONFIRMED','CHECKED_IN','IN_PRETESTING',
    'READY_FOR_DOCTOR','WITH_DOCTOR','CHECKOUT','COMPLETED','NO_SHOW','CANCELLED',
  ]
  if (!VALID_STATUSES.includes(body.status)) {
    return c.json<ApiResponse>({ success: false, error: 'Invalid status' }, 400)
  }

  try {
    const extras: any = {}
    if (body.room)  extras.room  = body.room
    if (body.notes) extras.notes = body.notes
    const updated = await updateAppointmentStatus(c.env.OCULOFLOW_KV, id, body.status, extras)
    if (!updated) return c.json<ApiResponse>({ success: false, error: 'Appointment not found' }, 404)
    return c.json<ApiResponse>({
      success: true,
      data: updated,
      message: `Status → ${body.status}`,
    })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not update status' }, 500)
  }
})

// ── DELETE /api/schedule/appointment/:id ─────────────────────────────────
scheduleRoutes.delete('/appointment/:id', async (c) => {
  const id     = c.req.param('id')
  const reason = c.req.query('reason')

  try {
    const cancelled = await cancelAppointment(c.env.OCULOFLOW_KV, id, reason)
    if (!cancelled) return c.json<ApiResponse>({ success: false, error: 'Appointment not found' }, 404)
    return c.json<ApiResponse>({ success: true, data: cancelled, message: 'Appointment cancelled' })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not cancel appointment' }, 500)
  }
})

// ── GET /api/schedule/waitlist ────────────────────────────────────────────
scheduleRoutes.get('/waitlist', async (c) => {
  try {
    await ensureScheduleSeed(c.env.OCULOFLOW_KV)
    const entries = await getWaitlist(c.env.OCULOFLOW_KV)
    return c.json<ApiResponse>({ success: true, data: { waitlist: entries, total: entries.length } })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not load waitlist' }, 500)
  }
})

// ── POST /api/schedule/waitlist ───────────────────────────────────────────
scheduleRoutes.post('/waitlist', async (c) => {
  const body = await c.req.json()
  if (!body.patientName || !body.appointmentType) {
    return c.json<ApiResponse>({ success: false, error: 'patientName and appointmentType required' }, 400)
  }
  const typeConf = APPOINTMENT_TYPES.find(t => t.type === body.appointmentType)
  if (!typeConf) return c.json<ApiResponse>({ success: false, error: 'Invalid appointment type' }, 400)

  try {
    const entry = await addToWaitlist(c.env.OCULOFLOW_KV, {
      ...body,
      typeLabel: typeConf.label,
      priority:  body.priority || 'NORMAL',
    })
    return c.json<ApiResponse>({ success: true, data: entry, message: 'Added to waitlist' }, 201)
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not add to waitlist' }, 500)
  }
})

// ── DELETE /api/schedule/waitlist/:id ─────────────────────────────────────
scheduleRoutes.delete('/waitlist/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const ok = await removeFromWaitlist(c.env.OCULOFLOW_KV, id)
    if (!ok) return c.json<ApiResponse>({ success: false, error: 'Entry not found' }, 404)
    return c.json<ApiResponse>({ success: true, message: 'Removed from waitlist' })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not remove from waitlist' }, 500)
  }
})

export default scheduleRoutes
