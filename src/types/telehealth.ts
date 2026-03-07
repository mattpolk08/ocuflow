// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 7B: Telehealth / Async Video Visit — Types
// ─────────────────────────────────────────────────────────────────────────────

// ── Visit status lifecycle ─────────────────────────────────────────────────────
export type VisitStatus =
  | 'INTAKE_PENDING'      // patient hasn't filled questionnaire yet
  | 'INTAKE_COMPLETE'     // questionnaire submitted, awaiting provider
  | 'UNDER_REVIEW'        // provider opened and is reviewing
  | 'AWAITING_INFO'       // provider requested more info from patient
  | 'COMPLETED'           // provider signed & completed
  | 'CANCELLED'

// ── Visit type ────────────────────────────────────────────────────────────────
export type VisitType =
  | 'ASYNC_REVIEW'        // patient submits; provider reviews async
  | 'LIVE_VIDEO'          // scheduled live video session
  | 'PHOTO_REVIEW'        // patient submits photos for review
  | 'MEDICATION_FOLLOWUP' // routine medication check-in
  | 'SECOND_OPINION'

// ── Urgency ───────────────────────────────────────────────────────────────────
export type Urgency = 'ROUTINE' | 'URGENT' | 'EMERGENT'

// ── Pre-visit questionnaire ───────────────────────────────────────────────────
export interface QuestionnaireAnswer {
  questionId: string
  question: string
  answer: string
}

export interface PreVisitQuestionnaire {
  chiefComplaint: string
  symptomsOnset: string       // e.g. "3 days ago"
  symptomsSeverity: number    // 1-10
  symptomsDescription: string
  affectedEye: 'OD' | 'OS' | 'OU' | 'UNKNOWN'
  currentMedications: string
  allergies: string
  recentEyeInjury: boolean
  visionChanges: boolean
  lightSensitivity: boolean
  floatersOrFlashes: boolean
  painLevel: number           // 0-10
  additionalNotes: string
  photoUrls: string[]         // patient-submitted images (simulated URLs)
  submittedAt: string
  answers: QuestionnaireAnswer[]
}

// ── Provider review / clinical response ───────────────────────────────────────
export interface ProviderReview {
  providerId: string
  providerName: string
  reviewedAt: string
  clinicalFindings: string
  assessment: string
  plan: string
  prescriptions: ReviewPrescription[]
  followUpRequired: boolean
  followUpInDays?: number
  referralRequired: boolean
  referralTo?: string
  patientInstructions: string
  internalNotes: string
  signedAt?: string
}

export interface ReviewPrescription {
  medication: string
  dosage: string
  frequency: string
  duration: string
  refills: number
}

// ── Patient info request (back-and-forth) ─────────────────────────────────────
export interface InfoRequest {
  id: string
  visitId: string
  requestedBy: string       // provider name
  requestedAt: string
  question: string
  patientResponse?: string
  respondedAt?: string
  isResolved: boolean
}

// ── Message thread on a visit ─────────────────────────────────────────────────
export interface VisitMessage {
  id: string
  visitId: string
  senderId: string
  senderName: string
  senderRole: 'PATIENT' | 'PROVIDER' | 'STAFF'
  body: string
  sentAt: string
  isRead: boolean
}

// ── Full telehealth visit ─────────────────────────────────────────────────────
export interface TelehealthVisit {
  id: string
  patientId: string
  patientName: string
  patientDob?: string
  patientEmail?: string
  patientPhone?: string

  visitType: VisitType
  urgency: Urgency
  status: VisitStatus

  chiefComplaint: string      // one-line summary
  scheduledAt?: string        // for LIVE_VIDEO only
  videoRoomUrl?: string       // simulated room link

  questionnaire?: PreVisitQuestionnaire
  review?: ProviderReview
  infoRequests: InfoRequest[]
  messages: VisitMessage[]

  assignedProviderId?: string
  assignedProviderName?: string

  createdAt: string
  updatedAt: string
  completedAt?: string
}

// ── Telehealth dashboard summary ──────────────────────────────────────────────
export interface TelehealthDashboard {
  pendingIntake: number
  awaitingReview: number
  underReview: number
  awaitingInfo: number
  completedToday: number
  totalThisWeek: number
  avgReviewMinutes: number
  urgentPending: number
  recentVisits: TelehealthVisit[]
  upcomingLive: TelehealthVisit[]
}

// ── Visit queue filter ────────────────────────────────────────────────────────
export type QueueFilter = 'ALL' | 'PENDING' | 'MY_QUEUE' | 'URGENT' | 'LIVE'
