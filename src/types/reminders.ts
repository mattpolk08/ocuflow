// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 6A: Appointment Reminders & Communications — Types
// ─────────────────────────────────────────────────────────────────────────────

// ── Channels & delivery ───────────────────────────────────────────────────────
export type CommChannel   = 'SMS' | 'EMAIL' | 'BOTH'
export type DeliveryStatus = 'PENDING' | 'SENT' | 'DELIVERED' | 'FAILED' | 'BOUNCED' | 'OPTED_OUT'
export type MessageType   =
  | 'REMINDER_24H'
  | 'REMINDER_48H'
  | 'REMINDER_1H'
  | 'CONFIRMATION_REQUEST'
  | 'CONFIRMATION_RECEIVED'
  | 'CANCELLATION_NOTICE'
  | 'RESCHEDULE_NOTICE'
  | 'NO_SHOW_FOLLOWUP'
  | 'RECALL_OUTREACH'
  | 'CUSTOM'

export type PatientResponse = 'CONFIRMED' | 'CANCELLED' | 'RESCHEDULE' | 'NO_RESPONSE'

// ── Message template ──────────────────────────────────────────────────────────
export interface MessageTemplate {
  id: string
  name: string
  type: MessageType
  channel: CommChannel
  subject?: string          // for email
  body: string              // supports {{patient_name}}, {{date}}, {{time}}, {{provider}}, {{location}}
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// ── Outbound communication ────────────────────────────────────────────────────
export interface OutboundMessage {
  id: string
  appointmentId?: string
  patientId: string
  patientName: string
  patientPhone?: string
  patientEmail?: string
  channel: CommChannel
  messageType: MessageType
  templateId?: string
  subject?: string
  body: string
  status: DeliveryStatus
  sentAt?: string
  deliveredAt?: string
  failureReason?: string
  // two-way reply
  patientResponse?: PatientResponse
  patientResponseText?: string
  patientResponseAt?: string
  createdAt: string
}

// ── Reminder rule ─────────────────────────────────────────────────────────────
export type ReminderTrigger = 'HOURS_BEFORE' | 'DAYS_BEFORE' | 'ON_DAY'
export interface ReminderRule {
  id: string
  name: string
  trigger: ReminderTrigger
  triggerValue: number          // e.g. 24 (hours), 2 (days)
  messageType: MessageType
  channel: CommChannel
  templateId: string
  isActive: boolean
  appointmentTypes: string[]    // empty = all types
  createdAt: string
}

// ── No-show ───────────────────────────────────────────────────────────────────
export type NoShowStatus = 'UNCONTACTED' | 'FOLLOWUP_SENT' | 'RESCHEDULED' | 'DISMISSED'
export interface NoShowRecord {
  id: string
  appointmentId: string
  patientId: string
  patientName: string
  patientPhone?: string
  patientEmail?: string
  missedDate: string
  appointmentType: string
  providerId: string
  providerName: string
  status: NoShowStatus
  followupMessageId?: string
  rescheduledApptId?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

// ── Campaign (bulk outreach) ──────────────────────────────────────────────────
export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'PAUSED' | 'CANCELLED'
export interface CampaignRecipient {
  patientId: string
  patientName: string
  patientPhone?: string
  patientEmail?: string
  status: DeliveryStatus
  response?: PatientResponse
  messageId?: string
}
export interface OutreachCampaign {
  id: string
  name: string
  description?: string
  channel: CommChannel
  messageType: MessageType
  templateId: string
  recipientCount: number
  sentCount: number
  deliveredCount: number
  responseCount: number
  confirmedCount: number
  status: CampaignStatus
  scheduledAt?: string
  startedAt?: string
  completedAt?: string
  recipients: CampaignRecipient[]
  createdById: string
  createdByName: string
  createdAt: string
  updatedAt: string
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export interface CommsDashboard {
  pendingReminders: number
  sentToday: number
  deliveredToday: number
  confirmedToday: number
  noShowsToday: number
  responseRate: number          // 0-100 %
  recentMessages: OutboundMessage[]
  upcomingReminders: { appointmentId: string; patientName: string; date: string; time: string; channel: CommChannel; scheduledFor: string }[]
  noShows: NoShowRecord[]
  activeCampaigns: OutreachCampaign[]
}
