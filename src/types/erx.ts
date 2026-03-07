// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 7C: E-Prescribing & PDMP — Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

export type RxStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'SIGNED'
  | 'SENT'
  | 'FILLED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'DENIED'

export type RxType =
  | 'NEW'
  | 'REFILL'
  | 'CHANGE'
  | 'CANCEL'

export type ControlledSchedule =
  | 'CII'
  | 'CIII'
  | 'CIV'
  | 'CV'
  | 'NON_CONTROLLED'

export type DosageForm =
  | 'EYE_DROPS'
  | 'EYE_OINTMENT'
  | 'ORAL_TABLET'
  | 'ORAL_CAPSULE'
  | 'ORAL_LIQUID'
  | 'TOPICAL_CREAM'
  | 'TOPICAL_GEL'
  | 'INJECTION'
  | 'PATCH'
  | 'OTHER'

export type PharmacyType = 'RETAIL' | 'MAIL_ORDER' | 'SPECIALTY' | 'COMPOUNDING'

export type PdmpStatus = 'CLEAR' | 'ALERT' | 'HIGH_RISK' | 'NOT_CHECKED'

export type DrugInteractionSeverity = 'MINOR' | 'MODERATE' | 'MAJOR' | 'CONTRAINDICATED'

export type AllergyType = 'DRUG' | 'FOOD' | 'ENVIRONMENTAL' | 'LATEX'
export type AllergyReaction = 'ANAPHYLAXIS' | 'RASH' | 'HIVES' | 'NAUSEA' | 'SWELLING' | 'OTHER'
export type AllergySeverity = 'MILD' | 'MODERATE' | 'SEVERE' | 'LIFE_THREATENING'

// ─── Drug / Formulary ────────────────────────────────────────────────────────

export interface DrugEntry {
  id: string
  name: string                    // Brand name
  genericName: string
  ndc: string                     // National Drug Code
  rxcui: string                   // RxNorm Concept Unique Identifier
  form: DosageForm
  strength: string                // e.g. "0.5%", "5mg"
  unit: string                    // e.g. "mL", "tablet"
  schedule: ControlledSchedule
  category: string                // e.g. "Glaucoma", "Anti-infective", "NSAID"
  commonDosing: string            // e.g. "1 drop OU BID"
  maxRefills: number
  isOphthalmic: boolean
  requiresPdmp: boolean
  genericAvailable: boolean
  avgCost: number                 // USD
}

// ─── Pharmacy ────────────────────────────────────────────────────────────────

export interface Pharmacy {
  id: string
  name: string
  type: PharmacyType
  npi: string
  ncpdpId: string
  address: string
  city: string
  state: string
  zip: string
  phone: string
  fax: string
  acceptsEPrescribe: boolean
  acceptsControlled: boolean
  hours: string
  isPreferred: boolean
}

// ─── PDMP ─────────────────────────────────────────────────────────────────────

export interface PdmpReport {
  id: string
  patientId: string
  patientName: string
  requestedBy: string
  requestedAt: string
  status: PdmpStatus
  prescriptions: PdmpPrescription[]
  riskScore: number               // 0–100
  riskFactors: string[]
  reportNotes: string
  expiresAt: string
}

export interface PdmpPrescription {
  drug: string
  schedule: ControlledSchedule
  quantity: number
  daysSupply: number
  prescriber: string
  pharmacy: string
  dispensedDate: string
  refillsRemaining: number
}

// ─── Drug Interaction ─────────────────────────────────────────────────────────

export interface DrugInteraction {
  id: string
  drug1Id: string
  drug1Name: string
  drug2Id: string
  drug2Name: string
  severity: DrugInteractionSeverity
  description: string
  clinicalEffect: string
  mechanism: string
  management: string
  evidenceLevel: 'A' | 'B' | 'C'
}

// ─── Patient Allergy ──────────────────────────────────────────────────────────

export interface PatientAllergy {
  id: string
  patientId: string
  allergen: string
  allergenType: AllergyType
  reaction: AllergyReaction
  severity: AllergySeverity
  onsetDate?: string
  notes: string
  isActive: boolean
  recordedBy: string
  recordedAt: string
}

// ─── Prescription ─────────────────────────────────────────────────────────────

export interface PrescriptionSig {
  quantity: number
  unit: string
  daysSupply: number
  refills: number
  dosageInstructions: string      // Full SIG text
  frequencyCode: string           // QD, BID, TID, QID, QHS, PRN, etc.
  route: string                   // OD, OS, OU, PO, etc.
  prn: boolean
  prnReason?: string
}

export interface Prescription {
  id: string
  patientId: string
  patientName: string
  patientDob: string
  providerId: string
  providerName: string
  providerNpi: string
  drugId: string
  drugName: string
  genericName: string
  strength: string
  form: DosageForm
  sig: PrescriptionSig
  rxType: RxType
  status: RxStatus
  pharmacyId?: string
  pharmacyName?: string
  daw: boolean                    // Dispense As Written
  substitutionNote?: string
  clinicalNote?: string
  pdmpChecked: boolean
  pdmpStatus: PdmpStatus
  pdmpReportId?: string
  drugInteractions: DrugInteraction[]
  allergyAlerts: string[]
  diagnosisCodes: string[]        // ICD-10 codes
  isControlled: boolean
  schedule: ControlledSchedule
  writtenDate: string
  signedAt?: string
  sentAt?: string
  filledAt?: string
  cancelledAt?: string
  expiresAt: string
  refillHistory: RefillEvent[]
  createdAt: string
  updatedAt: string
}

export interface RefillEvent {
  id: string
  prescriptionId: string
  requestedAt: string
  approvedAt?: string
  deniedAt?: string
  denialReason?: string
  pharmacyId: string
  pharmacyName: string
  dispensedAt?: string
  refillNumber: number
  providerId: string
  providerName: string
}

// ─── Prescribing Session (new Rx wizard state) ────────────────────────────────

export interface RxDraft {
  patientId: string
  drugId?: string
  pharmacyId?: string
  sig?: Partial<PrescriptionSig>
  daw?: boolean
  diagnosisCodes?: string[]
  clinicalNote?: string
}

// ─── Aggregates ───────────────────────────────────────────────────────────────

export interface RxDashboard {
  pendingReview: number
  signedToday: number
  sentToday: number
  refillRequests: number
  pdmpAlerts: number
  drugInteractionAlerts: number
  recentPrescriptions: Prescription[]
  pendingRefills: RefillEvent[]
  pdmpAlertList: PdmpReport[]
}

export interface FormularySearchResult {
  drug: DrugEntry
  interactions: DrugInteraction[]
  allergyMatch: boolean
  formularyTier: 1 | 2 | 3 | 4
  priorAuthRequired: boolean
  alternativesDrugs: DrugEntry[]
}
