// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 1 Intake Types
// ─────────────────────────────────────────────────────────────────────────────

export type IntakeStep =
  | 'VERIFY_IDENTITY'
  | 'DEMOGRAPHICS'
  | 'INSURANCE'
  | 'MEDICAL_HISTORY'
  | 'CONSENTS'
  | 'COMPLETE'

export interface StepMeta {
  id: IntakeStep
  label: string
  icon: string
  description: string
}

export const INTAKE_STEPS: StepMeta[] = [
  {
    id: 'VERIFY_IDENTITY',
    label: 'Verify Identity',
    icon: 'shield-check',
    description: "Let's confirm who you are",
  },
  {
    id: 'DEMOGRAPHICS',
    label: 'Your Information',
    icon: 'user',
    description: 'Quick personal details',
  },
  {
    id: 'INSURANCE',
    label: 'Insurance',
    icon: 'id-card',
    description: 'Upload your insurance card',
  },
  {
    id: 'MEDICAL_HISTORY',
    label: 'Health History',
    icon: 'clipboard-list',
    description: 'A few quick questions',
  },
  {
    id: 'CONSENTS',
    label: 'Consent & Sign',
    icon: 'pen-line',
    description: 'Review and sign forms',
  },
]

export interface PatientDemographics {
  firstName: string
  lastName: string
  dateOfBirth: string
  gender: string
  phone: string
  email: string
  address: string
  city: string
  state: string
  zip: string
  preferredLanguage: string
}

export interface InsuranceData {
  payerName: string
  memberId: string
  groupNumber: string
  subscriberName: string
  relationship: string
  cardFrontDataUrl?: string
  cardBackDataUrl?: string
  ocrConfidence?: number
}

export interface MedicalHistoryData {
  chiefComplaint: string
  currentMedications: string
  allergies: string
  eyeConditions: string[]
  systemicConditions: string[]
  lastEyeExam: string
  wearingGlasses: boolean
  wearingContacts: boolean
  familyHistoryGlaucoma: boolean
  familyHistoryMacularDegeneration: boolean
}

export interface ConsentData {
  hipaaAcknowledged: boolean
  treatmentConsent: boolean
  financialResponsibility: boolean
  telehealth: boolean
  marketingOptIn: boolean
  signatureDataUrl: string
  signedAt: string
}

export interface IntakeSession {
  sessionToken: string
  appointmentId: string
  patientId?: string
  phone: string
  step: IntakeStep
  demographics?: PatientDemographics
  insurance?: InsuranceData
  medicalHistory?: MedicalHistoryData
  consents?: ConsentData
  otpVerified: boolean
  createdAt: string
  expiresAt: string
}

export interface OcrResult {
  memberId?: string
  groupNumber?: string
  payerName?: string
  subscriberName?: string
  planName?: string
  raw?: string
  confidence: number
  success: boolean
  error?: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
}
