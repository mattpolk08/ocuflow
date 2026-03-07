// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 5A: Clinical Messaging & Task Board — Types
// ─────────────────────────────────────────────────────────────────────────────

// ── Staff Users ───────────────────────────────────────────────────────────────

export type StaffRole = 
  | 'PHYSICIAN'
  | 'OPTOMETRIST'
  | 'TECHNICIAN'
  | 'NURSE'
  | 'FRONT_DESK'
  | 'BILLING'
  | 'MANAGER'
  | 'ADMIN'

export interface StaffMember {
  id: string
  name: string
  role: StaffRole
  title: string
  avatar?: string   // initials fallback
  color: string     // hex for avatar bg
  isOnline?: boolean
  lastSeen?: string
}

// ── Messages ──────────────────────────────────────────────────────────────────

export type MessagePriority = 'NORMAL' | 'URGENT' | 'STAT'
export type MessageCategory  = 
  | 'GENERAL'
  | 'PATIENT_CARE'
  | 'REFERRAL'
  | 'PRESCRIPTION'
  | 'LAB_RESULT'
  | 'SCHEDULING'
  | 'BILLING'
  | 'ADMINISTRATIVE'

export interface MessageAttachment {
  id: string
  name: string
  type: string        // mime
  size: number        // bytes
  url?: string
}

export interface StaffMessage {
  id: string
  threadId: string
  senderId: string
  senderName: string
  senderRole: StaffRole
  body: string
  priority: MessagePriority
  category: MessageCategory
  patientId?: string
  patientName?: string
  attachments: MessageAttachment[]
  isRead: boolean
  readBy: { staffId: string; readAt: string }[]
  createdAt: string
  editedAt?: string
  isDeleted?: boolean
}

export interface MessageThread {
  id: string
  subject: string
  category: MessageCategory
  priority: MessagePriority
  participantIds: string[]
  participantNames: string[]
  patientId?: string
  patientName?: string
  createdById: string
  createdByName: string
  lastMessageAt: string
  lastMessagePreview: string
  unreadCount: number
  messageCount: number
  isArchived: boolean
  isPinned: boolean
  createdAt: string
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export type TaskStatus   = 'OPEN' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE' | 'CANCELLED'
export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'
export type TaskCategory =
  | 'CLINICAL'
  | 'ADMINISTRATIVE'
  | 'FOLLOW_UP'
  | 'RECALL'
  | 'PRESCRIPTION_REFILL'
  | 'INSURANCE'
  | 'REFERRAL'
  | 'LAB'
  | 'OPTICAL'
  | 'BILLING'
  | 'OTHER'

export interface TaskComment {
  id: string
  taskId: string
  authorId: string
  authorName: string
  body: string
  createdAt: string
}

export interface ClinicalTask {
  id: string
  title: string
  description?: string
  category: TaskCategory
  status: TaskStatus
  priority: TaskPriority
  assignedToId?: string
  assignedToName?: string
  assignedById: string
  assignedByName: string
  patientId?: string
  patientName?: string
  dueDate?: string        // ISO date string YYYY-MM-DD
  dueTime?: string        // HH:MM
  completedAt?: string
  completedById?: string
  completedByName?: string
  comments: TaskComment[]
  tags: string[]
  createdAt: string
  updatedAt: string
}

// ── Recall Lists ──────────────────────────────────────────────────────────────

export type RecallStatus = 'PENDING' | 'CONTACTED' | 'SCHEDULED' | 'DECLINED' | 'UNREACHABLE'
export type RecallReason =
  | 'ANNUAL_EXAM'
  | 'GLAUCOMA_FOLLOWUP'
  | 'DIABETIC_EYE_EXAM'
  | 'POST_OP'
  | 'CONTACT_LENS_FITTING'
  | 'DRY_EYE_FOLLOWUP'
  | 'PRESCRIPTION_REVIEW'
  | 'OTHER'

export interface RecallEntry {
  id: string
  patientId: string
  patientName: string
  patientPhone: string
  patientEmail: string
  reason: RecallReason
  dueDate: string
  status: RecallStatus
  priority: TaskPriority
  assignedToId?: string
  assignedToName?: string
  notes?: string
  lastContactedAt?: string
  scheduledApptId?: string
  createdAt: string
  updatedAt: string
}

// ── Dashboard summary ─────────────────────────────────────────────────────────

export interface MessagingDashboard {
  unreadMessages: number
  urgentMessages: number
  openTasks: number
  overdueTasks: number
  urgentTasks: number
  pendingRecalls: number
  recentThreads: MessageThread[]
  myTasks: ClinicalTask[]
  overdueRecalls: RecallEntry[]
}
