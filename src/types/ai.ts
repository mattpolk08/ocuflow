// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 8A: AI Clinical Decision Support — TypeScript Types
// ─────────────────────────────────────────────────────────────────────────────

// ── ICD-10 Code Suggestion ────────────────────────────────────────────────────
export type IcdCategory =
  | 'GLAUCOMA'
  | 'RETINA'
  | 'CORNEA'
  | 'CATARACT'
  | 'STRABISMUS'
  | 'OCULOMOTOR'
  | 'EYELID'
  | 'LACRIMAL'
  | 'REFRACTIVE'
  | 'NEURO_OPHTHALMIC'
  | 'SYSTEMIC_OCULAR'
  | 'TRAUMA'
  | 'OTHER'

export interface IcdCode {
  code: string
  description: string
  category: IcdCategory
  billable: boolean
  notes?: string
  commonPresentations?: string[]
  relatedCodes?: string[]
}

export interface IcdSuggestion {
  icdCode: IcdCode
  confidence: number        // 0–1
  matchReason: string
  primarySuggestion: boolean
}

export interface IcdSuggestionRequest {
  symptoms: string[]
  examFindings?: string[]
  patientAge?: number
  patientSex?: 'M' | 'F' | 'OTHER'
  freeText?: string
  existingDiagnoses?: string[]
  limit?: number
}

export interface IcdSuggestionResult {
  query: IcdSuggestionRequest
  suggestions: IcdSuggestion[]
  processingMs: number
  model: string
  timestamp: string
}

// ── Drug Interaction Alert ────────────────────────────────────────────────────
export type InteractionSeverity = 'MINOR' | 'MODERATE' | 'MAJOR' | 'CONTRAINDICATED'

export interface DrugInteractionAlert {
  id: string
  drug1Id: string
  drug1Name: string
  drug2Id: string
  drug2Name: string
  severity: InteractionSeverity
  mechanism: string
  clinicalEffect: string
  management: string
  references: string[]
  createdAt: string
}

// ── Clinical Guideline ────────────────────────────────────────────────────────
export type GuidelineSource = 'AAO' | 'AOS' | 'GLRS' | 'AGS' | 'DRCR' | 'FDA' | 'ASRS' | 'OTHER'
export type GuidelineTopic =
  | 'GLAUCOMA_SCREENING'
  | 'GLAUCOMA_TREATMENT'
  | 'DIABETIC_RETINOPATHY'
  | 'AMD_TREATMENT'
  | 'CATARACT_SURGERY'
  | 'DRY_EYE_TREATMENT'
  | 'CORNEAL_DISEASE'
  | 'PEDIATRIC_VISION'
  | 'MYOPIA_MANAGEMENT'
  | 'RETINAL_DETACHMENT'
  | 'UVEITIS'
  | 'ORBITAL_DISEASE'

export interface ClinicalGuideline {
  id: string
  title: string
  topic: GuidelineTopic
  source: GuidelineSource
  year: number
  summary: string
  keyRecommendations: string[]
  evidenceLevel: 'I' | 'II' | 'III'
  applicableIcdCodes: string[]
  url?: string
  lastReviewed: string
}

// ── AI-Assisted Exam Note ─────────────────────────────────────────────────────
export type NoteSection =
  | 'CHIEF_COMPLAINT'
  | 'HPI'
  | 'REVIEW_OF_SYSTEMS'
  | 'PHYSICAL_EXAM'
  | 'ASSESSMENT'
  | 'PLAN'
  | 'FOLLOW_UP'

export interface GeneratedNoteSection {
  section: NoteSection
  content: string
  confidence: number
  requiresReview: boolean
}

export interface NoteGenerationRequest {
  patientId?: string
  chiefComplaint: string
  symptoms: string[]
  examFindings: Record<string, string>   // e.g. { VA: '20/40', IOP: '22 mmHg' }
  diagnoses?: string[]
  existingNote?: string
}

export interface GeneratedNote {
  id: string
  request: NoteGenerationRequest
  sections: GeneratedNoteSection[]
  fullText: string
  wordCount: number
  model: string
  generatedAt: string
  reviewed: boolean
  reviewedBy?: string
  reviewedAt?: string
}

// ── Risk Stratification ───────────────────────────────────────────────────────
export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'
export type RiskCategory =
  | 'GLAUCOMA_PROGRESSION'
  | 'DIABETIC_RETINOPATHY_PROGRESSION'
  | 'AMD_PROGRESSION'
  | 'VISION_LOSS'
  | 'SURGICAL_RISK'
  | 'MEDICATION_ADHERENCE'
  | 'NO_SHOW_RISK'
  | 'READMISSION_RISK'

export interface RiskFactor {
  factor: string
  weight: number      // contribution to overall risk
  value: string       // actual patient value
  threshold: string   // threshold that triggers risk
}

export interface RiskScore {
  id: string
  patientId: string
  patientName: string
  category: RiskCategory
  level: RiskLevel
  score: number           // 0–100
  riskFactors: RiskFactor[]
  recommendation: string
  urgentAction: boolean
  calculatedAt: string
  nextReviewDate: string
}

// ── AI Insight / Alert ────────────────────────────────────────────────────────
export type InsightType =
  | 'ICD_SUGGESTION'
  | 'DRUG_INTERACTION'
  | 'GUIDELINE_ALERT'
  | 'RISK_SCORE'
  | 'RECALL_DUE'
  | 'MISSING_DOCUMENTATION'
  | 'CODING_OPPORTUNITY'
  | 'FOLLOW_UP_DUE'

export type InsightPriority = 'INFO' | 'WARNING' | 'CRITICAL'

export interface AiInsight {
  id: string
  type: InsightType
  priority: InsightPriority
  title: string
  body: string
  patientId?: string
  patientName?: string
  relatedEntityId?: string   // examId, prescriptionId, etc.
  actionLabel?: string
  actionRoute?: string
  dismissed: boolean
  createdAt: string
  dismissedAt?: string
}

// ── AI Dashboard ──────────────────────────────────────────────────────────────
export interface AiDashboard {
  pendingInsights: number
  criticalAlerts: number
  icdSuggestionsToday: number
  notesGeneratedToday: number
  riskScoresComputed: number
  interactionAlertsActive: number
  recentInsights: AiInsight[]
  riskDistribution: { level: RiskLevel; count: number }[]
  topRiskPatients: RiskScore[]
}

// ── AI Session / History ──────────────────────────────────────────────────────
export interface AiQueryLog {
  id: string
  queryType: 'ICD_SUGGESTION' | 'NOTE_GENERATION' | 'GUIDELINE_LOOKUP' | 'RISK_CALC'
  input: Record<string, unknown>
  outputSummary: string
  userId: string
  userName: string
  durationMs: number
  timestamp: string
}
