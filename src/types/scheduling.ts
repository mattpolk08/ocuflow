// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Scheduling Types (Phase 1C)
// ─────────────────────────────────────────────────────────────────────────────

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'CHECKED_IN'
  | 'IN_PRETESTING'
  | 'READY_FOR_DOCTOR'
  | 'WITH_DOCTOR'
  | 'CHECKOUT'
  | 'COMPLETED'
  | 'NO_SHOW'
  | 'CANCELLED'

export type AppointmentType =
  | 'COMPREHENSIVE_EYE_EXAM'
  | 'CONTACT_LENS_FITTING'
  | 'GLAUCOMA_FOLLOWUP'
  | 'DIABETIC_EYE_EXAM'
  | 'POST_OP'
  | 'FOLLOWUP'
  | 'REFRACTION_ONLY'
  | 'URGENT_CARE'
  | 'PEDIATRIC_EXAM'
  | 'DRY_EYE_CONSULT'
  | 'RETINA_CONSULT'
  | 'PRE_OP'

export type VisitReason = string  // free-text chief complaint

export interface AppointmentTypeConfig {
  type: AppointmentType
  label: string
  duration: number        // minutes
  color: string           // tailwind color key e.g. 'blue', 'violet', 'emerald'
  icon: string            // FA icon class
  requiresDialation: boolean
}

export const APPOINTMENT_TYPES: AppointmentTypeConfig[] = [
  { type: 'COMPREHENSIVE_EYE_EXAM', label: 'Comprehensive Exam',   duration: 40, color: 'blue',    icon: 'fa-eye',                  requiresDialation: true  },
  { type: 'CONTACT_LENS_FITTING',   label: 'Contact Lens Fitting', duration: 40, color: 'cyan',    icon: 'fa-circle-dot',            requiresDialation: false },
  { type: 'GLAUCOMA_FOLLOWUP',      label: 'Glaucoma Follow-up',   duration: 30, color: 'violet',  icon: 'fa-eye-dropper',           requiresDialation: true  },
  { type: 'DIABETIC_EYE_EXAM',      label: 'Diabetic Eye Exam',    duration: 30, color: 'amber',   icon: 'fa-syringe',               requiresDialation: true  },
  { type: 'POST_OP',                label: 'Post-Op Check',        duration: 20, color: 'emerald', icon: 'fa-bandage',               requiresDialation: false },
  { type: 'FOLLOWUP',               label: 'Follow-up',            duration: 20, color: 'slate',   icon: 'fa-rotate-right',          requiresDialation: false },
  { type: 'REFRACTION_ONLY',        label: 'Refraction Only',      duration: 20, color: 'sky',     icon: 'fa-glasses',               requiresDialation: false },
  { type: 'URGENT_CARE',            label: 'Urgent Care',          duration: 30, color: 'red',     icon: 'fa-triangle-exclamation',  requiresDialation: false },
  { type: 'PEDIATRIC_EXAM',         label: 'Pediatric Exam',       duration: 40, color: 'pink',    icon: 'fa-child',                 requiresDialation: true  },
  { type: 'DRY_EYE_CONSULT',        label: 'Dry Eye Consult',      duration: 30, color: 'orange',  icon: 'fa-droplet-slash',         requiresDialation: false },
  { type: 'RETINA_CONSULT',         label: 'Retina Consult',       duration: 40, color: 'rose',    icon: 'fa-wave-square',           requiresDialation: true  },
  { type: 'PRE_OP',                 label: 'Pre-Op Evaluation',    duration: 40, color: 'teal',    icon: 'fa-clipboard-list',        requiresDialation: true  },
]

export interface Provider {
  id: string
  name: string
  firstName: string
  lastName: string
  credentials: string       // OD | MD | NP
  specialty: string
  color: string             // tailwind color key
  npi: string
  isActive: boolean
  // Availability per day (0=Sun … 6=Sat)
  workDays: number[]
  startTime: string         // HH:MM
  endTime: string           // HH:MM
  lunchStart?: string       // HH:MM
  lunchEnd?: string         // HH:MM
  slotDuration: number      // minutes (default 20)
  maxPatientsPerDay: number
}

export interface Room {
  id: string
  name: string
  type: 'EXAM' | 'PRE_TEST' | 'OPTICAL' | 'PROCEDURE' | 'WAITING'
  isActive: boolean
}

export interface TimeSlot {
  providerId: string
  providerName: string
  date: string              // YYYY-MM-DD
  startTime: string         // HH:MM
  endTime: string           // HH:MM
  isAvailable: boolean
  appointmentId?: string    // set when booked
}

export interface Appointment {
  id: string
  organizationId: string
  // Patient
  patientId: string
  patientName: string
  patientDob: string
  patientPhone?: string
  // Scheduling
  providerId: string
  providerName: string
  date: string              // YYYY-MM-DD
  startTime: string         // HH:MM
  endTime: string           // HH:MM
  duration: number          // minutes
  room?: string
  // Visit
  appointmentType: AppointmentType
  typeLabel: string
  chiefComplaint?: string
  notes?: string
  // Status
  status: AppointmentStatus
  confirmationCode: string
  // Flags
  intakeComplete: boolean
  insuranceVerified: boolean
  copay?: number
  urgent: boolean
  color: string
  // Timestamps
  createdAt: string
  updatedAt: string
  confirmedAt?: string
  checkedInAt?: string
  completedAt?: string
  cancelledAt?: string
  cancellationReason?: string
  // Wait tracking
  waitMinutes?: number
}

export interface WaitlistEntry {
  id: string
  patientId: string
  patientName: string
  patientPhone?: string
  providerId?: string       // preferred provider (optional)
  appointmentType: AppointmentType
  typeLabel: string
  preferredDates?: string[] // YYYY-MM-DD
  preferredTimes?: ('AM' | 'PM' | 'ANY')[]
  notes?: string
  priority: 'URGENT' | 'NORMAL' | 'FLEXIBLE'
  addedAt: string
  notifiedAt?: string
  status: 'WAITING' | 'OFFERED' | 'BOOKED' | 'REMOVED'
}

export interface AppointmentCreateInput {
  patientId: string
  patientName: string
  patientDob: string
  patientPhone?: string
  providerId: string
  date: string
  startTime: string
  appointmentType: AppointmentType
  chiefComplaint?: string
  notes?: string
  copay?: number
  insuranceVerified?: boolean
  urgent?: boolean
}

export interface ScheduleDay {
  date: string
  dayLabel: string          // 'Mon', 'Tue' …
  dateLabel: string         // 'Mar 10'
  isToday: boolean
  isWeekend: boolean
  appointments: Appointment[]
  slots: TimeSlot[]
  totalBooked: number
  totalCapacity: number
}
