// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Dashboard Route
// GET /dashboard  — Command Center HTML
// GET /api/dashboard/today  — today's schedule + flow data
// POST /api/dashboard/flow  — update patient flow status
// GET /api/dashboard/kpis   — today's KPI summary
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import type { ApiResponse } from '../types/intake'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  DEMO_MODE: string
}

const dashboardRoutes = new Hono<{ Bindings: Bindings }>()

// ── Seed Data: realistic demo schedule ───────────────────────────────────────
function getTodaySchedule() {
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0]

  return [
    {
      id: 'appt-001',
      time: '08:00',
      endTime: '08:40',
      duration: 40,
      patientName: 'Margaret Sullivan',
      patientId: 'PT-10042',
      dob: '1948-03-12',
      age: 77,
      appointmentType: 'COMPREHENSIVE_EYE_EXAM',
      typeLabel: 'Comprehensive Exam',
      status: 'COMPLETED',
      providerId: 'dr-chen',
      providerName: 'Dr. Sarah Chen, OD',
      room: 'Exam 1',
      chiefComplaint: 'Annual exam, blurry distance vision',
      intakeComplete: true,
      insuranceVerified: true,
      copay: 30,
      waitMinutes: 0,
      color: 'blue',
    },
    {
      id: 'appt-002',
      time: '08:20',
      endTime: '08:50',
      duration: 30,
      patientName: 'Derek Holloway',
      patientId: 'PT-10089',
      dob: '1976-09-22',
      age: 48,
      appointmentType: 'GLAUCOMA_FOLLOWUP',
      typeLabel: 'Glaucoma Follow-up',
      status: 'WITH_DOCTOR',
      providerId: 'dr-patel',
      providerName: 'Dr. Raj Patel, MD',
      room: 'Exam 3',
      chiefComplaint: 'Glaucoma monitoring, IOP check',
      intakeComplete: true,
      insuranceVerified: true,
      copay: 45,
      waitMinutes: 12,
      color: 'violet',
    },
    {
      id: 'appt-003',
      time: '08:40',
      endTime: '09:20',
      duration: 40,
      patientName: 'Priya Nair',
      patientId: 'PT-10103',
      dob: '1990-07-04',
      age: 35,
      appointmentType: 'CONTACT_LENS_FITTING',
      typeLabel: 'Contact Lens Fitting',
      status: 'IN_PRETESTING',
      providerId: 'dr-chen',
      providerName: 'Dr. Sarah Chen, OD',
      room: 'Pre-Test A',
      chiefComplaint: 'First-time contact lens fit',
      intakeComplete: true,
      insuranceVerified: true,
      copay: 20,
      waitMinutes: 5,
      color: 'blue',
    },
    {
      id: 'appt-004',
      time: '09:00',
      endTime: '09:30',
      duration: 30,
      patientName: 'Charles Beaumont',
      patientId: 'PT-10067',
      dob: '1955-12-30',
      age: 69,
      appointmentType: 'DIABETIC_EYE_EXAM',
      typeLabel: 'Diabetic Eye Exam',
      status: 'CHECKED_IN',
      providerId: 'dr-patel',
      providerName: 'Dr. Raj Patel, MD',
      room: null,
      chiefComplaint: 'Annual diabetic retinal screening',
      intakeComplete: true,
      insuranceVerified: true,
      copay: 30,
      waitMinutes: 8,
      color: 'violet',
    },
    {
      id: 'appt-005',
      time: '09:20',
      endTime: '10:00',
      duration: 40,
      patientName: 'Amelia Torres',
      patientId: 'PT-10211',
      dob: '2001-05-17',
      age: 23,
      appointmentType: 'COMPREHENSIVE_EYE_EXAM',
      typeLabel: 'Comprehensive Exam',
      status: 'CHECKED_IN',
      providerId: 'dr-chen',
      providerName: 'Dr. Sarah Chen, OD',
      room: null,
      chiefComplaint: 'Headaches, possible need for glasses',
      intakeComplete: false,
      insuranceVerified: false,
      copay: 30,
      waitMinutes: 3,
      color: 'blue',
    },
    {
      id: 'appt-006',
      time: '09:40',
      endTime: '10:10',
      duration: 30,
      patientName: 'Robert Kim',
      patientId: 'PT-10055',
      dob: '1968-02-14',
      age: 57,
      appointmentType: 'POST_OP',
      typeLabel: 'Post-Op Check',
      status: 'SCHEDULED',
      providerId: 'dr-patel',
      providerName: 'Dr. Raj Patel, MD',
      room: null,
      chiefComplaint: '1-week post cataract surgery OD',
      intakeComplete: false,
      insuranceVerified: true,
      copay: 0,
      waitMinutes: 0,
      color: 'violet',
    },
    {
      id: 'appt-007',
      time: '10:00',
      endTime: '10:40',
      duration: 40,
      patientName: 'Vivian Okonkwo',
      patientId: 'PT-10298',
      dob: '1972-11-08',
      age: 52,
      appointmentType: 'COMPREHENSIVE_EYE_EXAM',
      typeLabel: 'Comprehensive Exam',
      status: 'SCHEDULED',
      providerId: 'dr-chen',
      providerName: 'Dr. Sarah Chen, OD',
      room: null,
      chiefComplaint: 'New patient, referred by Dr. Lopez',
      intakeComplete: true,
      insuranceVerified: true,
      copay: 50,
      waitMinutes: 0,
      color: 'blue',
    },
    {
      id: 'appt-008',
      time: '10:20',
      endTime: '10:50',
      duration: 30,
      patientName: 'James Whitfield',
      patientId: 'PT-10134',
      dob: '1943-06-25',
      age: 81,
      appointmentType: 'FOLLOWUP',
      typeLabel: 'Follow-up',
      status: 'SCHEDULED',
      providerId: 'dr-patel',
      providerName: 'Dr. Raj Patel, MD',
      room: null,
      chiefComplaint: 'Macular degeneration monitoring, Lucentis Rx review',
      intakeComplete: true,
      insuranceVerified: true,
      copay: 45,
      waitMinutes: 0,
      color: 'violet',
    },
    {
      id: 'appt-009',
      time: '11:00',
      endTime: '11:30',
      duration: 30,
      patientName: 'Natalie Brooks',
      patientId: 'PT-10445',
      dob: '1995-03-28',
      age: 30,
      appointmentType: 'REFRACTION_ONLY',
      typeLabel: 'Refraction Only',
      status: 'SCHEDULED',
      providerId: 'dr-chen',
      providerName: 'Dr. Sarah Chen, OD',
      room: null,
      chiefComplaint: 'New glasses prescription update',
      intakeComplete: false,
      insuranceVerified: false,
      copay: 20,
      waitMinutes: 0,
      color: 'blue',
    },
    {
      id: 'appt-010',
      time: '11:20',
      endTime: '12:00',
      duration: 40,
      patientName: 'Thomas Garrett',
      patientId: 'PT-10502',
      dob: '1960-08-19',
      age: 64,
      appointmentType: 'URGENT_CARE',
      typeLabel: '🔴 Urgent Care',
      status: 'SCHEDULED',
      providerId: 'dr-patel',
      providerName: 'Dr. Raj Patel, MD',
      room: null,
      chiefComplaint: 'Sudden floaters + flashes — rule out retinal tear',
      intakeComplete: false,
      insuranceVerified: false,
      copay: 75,
      waitMinutes: 0,
      urgent: true,
      color: 'violet',
    },
  ]
}

function getKpis() {
  return {
    date: new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
    totalScheduled: 10,
    completed: 1,
    inOffice: 4,
    remaining: 5,
    noShows: 0,
    avgWaitTime: 7,
    checkedInCount: 2,
    preTestCount: 1,
    withDoctorCount: 1,
    checkoutCount: 0,
    dailyGoalRevenue: 4800,
    collectedToday: 1240,
    pendingCopays: 3,
    intakeIncomplete: 4,
    insuranceUnverified: 3,
    providers: [
      {
        id: 'dr-chen',
        name: 'Dr. Sarah Chen',
        credentials: 'OD',
        color: 'blue',
        status: 'WITH_PATIENT',
        statusLabel: 'With Patient',
        currentPatient: 'Priya Nair',
        room: 'Pre-Test A',
        nextAppt: '09:20 — Amelia Torres',
        scheduledToday: 5,
        completedToday: 1,
      },
      {
        id: 'dr-patel',
        name: 'Dr. Raj Patel',
        credentials: 'MD',
        color: 'violet',
        status: 'WITH_PATIENT',
        statusLabel: 'With Patient',
        currentPatient: 'Derek Holloway',
        room: 'Exam 3',
        nextAppt: '09:00 — Charles Beaumont',
        scheduledToday: 5,
        completedToday: 1,
      },
    ],
    rooms: [
      { id: 'exam-1', name: 'Exam Room 1', type: 'EXAM', status: 'AVAILABLE', patient: null },
      { id: 'exam-2', name: 'Exam Room 2', type: 'EXAM', status: 'AVAILABLE', patient: null },
      { id: 'exam-3', name: 'Exam Room 3', type: 'EXAM', status: 'OCCUPIED', patient: 'Derek Holloway — Dr. Patel' },
      { id: 'pretest-a', name: 'Pre-Test A', type: 'PRE_TEST', status: 'OCCUPIED', patient: 'Priya Nair — Tech. Rivera' },
      { id: 'pretest-b', name: 'Pre-Test B', type: 'PRE_TEST', status: 'AVAILABLE', patient: null },
      { id: 'optical', name: 'Optical', type: 'OPTICAL', status: 'AVAILABLE', patient: null },
    ],
  }
}

// ── GET /api/dashboard/today ──────────────────────────────────────────────
dashboardRoutes.get('/today', (c) => {
  return c.json<ApiResponse>({
    success: true,
    data: {
      schedule: getTodaySchedule(),
      kpis: getKpis(),
    },
  })
})

// ── GET /api/dashboard/kpis ───────────────────────────────────────────────
dashboardRoutes.get('/kpis', (c) => {
  return c.json<ApiResponse>({ success: true, data: getKpis() })
})

// ── POST /api/dashboard/flow ──────────────────────────────────────────────
dashboardRoutes.post('/flow', async (c) => {
  const body = await c.req.json<{ appointmentId: string; newStatus: string; room?: string }>()
  // In production: update DB + push to WebSocket subscribers
  // For now: echo back as success
  return c.json<ApiResponse>({
    success: true,
    message: `Status updated to ${body.newStatus}`,
    data: { appointmentId: body.appointmentId, status: body.newStatus },
  })
})

export default dashboardRoutes
