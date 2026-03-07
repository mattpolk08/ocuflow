// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 4A: Patient Portal Types
// ─────────────────────────────────────────────────────────────────────────────

// ── Portal Session ────────────────────────────────────────────────────────────

export interface PortalSession {
  sessionId: string
  patientId: string
  patientName: string
  patientEmail: string
  patientDob: string        // YYYY-MM-DD
  createdAt: string
  expiresAt: string         // 1-hour TTL
  lastActivity: string
}

export interface PortalLoginRequest {
  dob: string               // YYYY-MM-DD (used as password in demo)
  lastName: string
  mrn?: string              // or use email
  email?: string
}

// ── Appointment Request ────────────────────────────────────────────────────────

export type AppointmentRequestStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'DECLINED'
  | 'CANCELLED'

export type AppointmentRequestType =
  | 'COMPREHENSIVE_EYE_EXAM'
  | 'CONTACT_LENS_FITTING'
  | 'FOLLOWUP'
  | 'URGENT_CARE'
  | 'GLAUCOMA_FOLLOWUP'
  | 'DIABETIC_EYE_EXAM'
  | 'PEDIATRIC_EXAM'
  | 'OTHER'

export interface AppointmentRequest {
  id: string
  patientId: string
  patientName: string
  patientPhone?: string
  patientEmail?: string
  requestType: AppointmentRequestType
  preferredDates: string[]   // ISO date strings, up to 3
  preferredTimes: string[]   // e.g. ['morning', 'afternoon', 'any']
  preferredProvider?: string // providerId or 'no_preference'
  reason: string
  urgency: 'routine' | 'soon' | 'urgent'
  status: AppointmentRequestStatus
  confirmedDate?: string
  confirmedTime?: string
  confirmedProvider?: string
  confirmedProviderId?: string
  appointmentId?: string     // linked appointment after confirmed
  staffNotes?: string
  patientNotes?: string
  createdAt: string
  updatedAt: string
}

// ── Secure Message ─────────────────────────────────────────────────────────────

export type MessageStatus = 'UNREAD' | 'READ' | 'REPLIED' | 'CLOSED'
export type MessageCategory =
  | 'GENERAL'
  | 'PRESCRIPTION_REQUEST'
  | 'APPOINTMENT_QUESTION'
  | 'BILLING_QUESTION'
  | 'OPTICAL_ORDER_STATUS'
  | 'TEST_RESULTS'
  | 'MEDICATION_REFILL'
  | 'OTHER'

export interface PortalMessage {
  id: string
  threadId: string           // group related messages
  patientId: string
  patientName: string
  subject: string
  category: MessageCategory
  body: string
  fromPatient: boolean       // true = sent by patient, false = sent by staff
  senderName: string
  status: MessageStatus
  attachmentNote?: string    // text-only attachments
  createdAt: string
  readAt?: string
  repliedAt?: string
}

export interface MessageThread {
  threadId: string
  subject: string
  category: MessageCategory
  patientId: string
  patientName: string
  lastMessage: PortalMessage
  messageCount: number
  status: MessageStatus
  createdAt: string
  updatedAt: string
}

// ── Rx & Glasses Status ────────────────────────────────────────────────────────

export interface PortalRxSummary {
  rxId: string
  rxDate: string
  expiresDate: string
  providerName: string
  lensType: string
  signed: boolean
  od: {
    sphere?: number; cylinder?: number; axis?: number; add?: number; pd?: number; va?: string
  }
  os: {
    sphere?: number; cylinder?: number; axis?: number; add?: number; pd?: number; va?: string
  }
  binocularPd?: number
}

export interface PortalOrderStatus {
  orderId: string
  orderNumber: string
  orderType: string
  status: string
  lab?: string
  estimatedReady?: string
  receivedAt?: string
  dispensedAt?: string
  totalCharge: number
  balanceDue: number
  lineItemsSummary: string   // e.g. "Maui Jim Westside + Progressive 1.67 AR"
  lastUpdated: string
}

// ── Balance & Payments ────────────────────────────────────────────────────────

export interface PortalBalanceSummary {
  totalBalance: number
  superbillCount: number
  oldestUnpaidDate?: string
  items: {
    superbillId: string
    serviceDate: string
    description: string
    totalCharge: number
    insurancePaid: number
    patientBalance: number
    status: string
  }[]
}

// ── Exam Summary (patient-facing) ─────────────────────────────────────────────

export interface PortalExamSummary {
  examId: string
  examDate: string
  providerName: string
  examType: string
  diagnoses: { code: string; description: string }[]
  visionOD?: string
  visionOS?: string
  iopOD?: number
  iopOS?: number
  recommendations?: string
  followUpIn?: string        // e.g. "12 months", "6 months"
  signed: boolean
}

// ── Portal Dashboard (full summary) ──────────────────────────────────────────

export interface PortalDashboard {
  patient: {
    id: string
    name: string
    dob: string
    email: string
    phone: string
    insuranceName?: string
  }
  upcomingAppointments: {
    date: string; time: string; provider: string; type: string; status: string
  }[]
  pendingRequests: AppointmentRequest[]
  recentExams: PortalExamSummary[]
  activeRx?: PortalRxSummary
  opticalOrders: PortalOrderStatus[]
  balanceSummary: PortalBalanceSummary
  unreadMessages: number
  recentMessages: MessageThread[]
}

// ── API helpers ────────────────────────────────────────────────────────────────

export interface PortalApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}
