// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Exam Record Types (Phase 1D)
// src/types/exam.ts
// ─────────────────────────────────────────────────────────────────────────────

// ── Visual Acuity ─────────────────────────────────────────────────────────────
export interface EyeAcuity {
  sc?:   string   // sine correctione (without correction) e.g. "20/200"
  cc?:   string   // cum correctione (with correction) e.g. "20/20"
  ph?:   string   // pinhole
  near?: string   // near acuity e.g. "J1+"
}

export interface VisualAcuity {
  od:   EyeAcuity
  os:   EyeAcuity
  ou?:  EyeAcuity
  method?: 'Snellen' | 'LogMAR' | 'ETDRS' | 'Allen' | 'Teller'
  distance?: number   // testing distance in feet (default 20)
  notes?: string
}

// ── Pupils ────────────────────────────────────────────────────────────────────
export interface PupilExam {
  od: { size: string; reaction: string; relative?: string }
  os: { size: string; reaction: string; relative?: string }
  apd?: 'OD' | 'OS' | 'none'   // afferent pupillary defect
  notes?: string
}

// ── Extra-Ocular Motility ─────────────────────────────────────────────────────
export type EomResult = 'Full' | 'Restricted' | 'Paretic' | 'N/A'
export interface EOM {
  od: EomResult
  os: EomResult
  versions?: string      // description of versions
  cover?: string         // cover/uncover test
  notes?: string
}

// ── Confrontation Visual Fields ───────────────────────────────────────────────
export interface ConfrontationFields {
  od: 'Full' | 'Defect' | 'Not tested'
  os: 'Full' | 'Defect' | 'Not tested'
  notes?: string
}

// ── Intraocular Pressure ──────────────────────────────────────────────────────
export type IopMethod = 'Goldmann' | 'Non-contact' | 'iCare' | 'Tono-pen' | 'Perkins' | 'Digital'
export interface IopReading {
  od: number    // mmHg
  os: number
  method: IopMethod
  time?: string  // HH:MM
  cctvOD?: number  // central corneal thickness in microns
  cctvOS?: number
}

// ── Slit Lamp ─────────────────────────────────────────────────────────────────
export type GradingScale = '0' | '1+' | '2+' | '3+' | '4+' | 'Trace' | 'WNL' | 'N/A'

export interface SlitLampEye {
  lids?:           string
  lashes?:         string
  conjunctiva?:    string
  sclera?:         string
  cornea?:         string
  anteriorChamber?: string
  acCell?:         GradingScale
  acFlare?:        GradingScale
  iris?:           string
  lens?:           string
  vitreous?:       string
  notes?:          string
}

export interface SlitLamp {
  od: SlitLampEye
  os: SlitLampEye
  dilation?: {
    performed: boolean
    agent?: string       // e.g. "1% Tropicamide + 2.5% Phenylephrine"
    time?: string        // time drops instilled
    readyTime?: string   // time ready for dilation
  }
  notes?: string
}

// ── Fundus Examination ────────────────────────────────────────────────────────
export type CdRatio = '0.0' | '0.1' | '0.2' | '0.3' | '0.4' | '0.5' | '0.6' | '0.7' | '0.8' | '0.9' | '1.0'
export type MacularGrade = 'Normal' | 'Drusen' | 'ARMD dry' | 'ARMD wet' | 'ERM' | 'CME' | 'MH' | 'Flat' | 'Other'

export interface FundusEye {
  disc?:          string    // e.g. "Pink, sharp, distinct margins"
  cdRatio?:       CdRatio
  cdRatioV?:      CdRatio   // vertical
  rim?:           string    // neural rim description
  vessels?:       string
  macula?:        string
  macularGrade?:  MacularGrade
  periphery?:     string
  vitreous?:      string
  notes?:         string
}

export interface FundusExam {
  od: FundusEye
  os: FundusEye
  method?: 'BIO' | 'Direct' | 'Slit lamp 90D' | 'Slit lamp 78D' | 'RetCam' | 'OCT'
  dilated?: boolean
  notes?: string
}

// ── Refraction ────────────────────────────────────────────────────────────────
export interface RefractionEye {
  sphere?: string    // e.g. "-2.25"
  cylinder?: string  // e.g. "-0.75"
  axis?: number      // 1-180
  add?: string       // near add e.g. "+2.50"
  prism?: string
  base?: string
  vaWithRx?: string  // VA achieved with this Rx
}

export interface Refraction {
  od:           RefractionEye
  os:           RefractionEye
  type?:        'Manifest' | 'Cycloplegic' | 'Dry' | 'Wet'
  finalRxOd?:   RefractionEye
  finalRxOs?:   RefractionEye
  pupillaryDistance?: { od: number; os: number } | { total: number }
  nearRxOd?:    RefractionEye
  nearRxOs?:    RefractionEye
  contactLensRx?: {
    od?: { brand?: string; baseCurve?: string; diameter?: string; power?: string; cylinder?: string; axis?: number; addDesig?: string }
    os?: { brand?: string; baseCurve?: string; diameter?: string; power?: string; cylinder?: string; axis?: number; addDesig?: string }
  }
  notes?: string
}

// ── Assessment & Plan ─────────────────────────────────────────────────────────
export interface DiagnosisEntry {
  icd10Code: string           // e.g. "H40.11X1"
  description: string        // e.g. "Primary open-angle glaucoma, right eye, mild stage"
  eye?: 'OD' | 'OS' | 'OU' | 'N/A'
  chronic?: boolean
  primary?: boolean
}

export interface PlanEntry {
  category: 'Medication' | 'Procedure' | 'Referral' | 'Testing' | 'Education' | 'Follow-up' | 'Optical' | 'Other'
  description: string
  eye?: 'OD' | 'OS' | 'OU'
  details?: string
  duration?: string
}

export interface Assessment {
  diagnoses:    DiagnosisEntry[]
  plan:         PlanEntry[]
  followUp?:    string   // e.g. "1 month", "6 months", "PRN"
  referrals?:   string
  providerNotes?: string
}

// ── Chief Complaint / HPI ─────────────────────────────────────────────────────
export interface ChiefComplaint {
  chief: string
  hpi?: string
  onset?: string
  duration?: string
  severity?: '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'
  quality?: string
  modifying?: string
  associated?: string
  reviewOfSystems?: {
    ocular?: string
    systemic?: string
  }
}

// ── Exam Status ───────────────────────────────────────────────────────────────
export type ExamStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETE' | 'SIGNED' | 'AMENDED'
export type ExamType = 'COMPREHENSIVE' | 'FOLLOWUP' | 'URGENT' | 'CONTACT_LENS' | 'GLAUCOMA' | 'DIABETIC' | 'POST_OP' | 'PEDIATRIC' | 'REFRACTIVE'

// ── Full Exam Record ──────────────────────────────────────────────────────────
export interface ExamRecord {
  id:             string      // exam-{uuid8}
  organizationId: string
  patientId:      string
  patientName:    string
  patientDob?:    string
  appointmentId?: string
  examDate:       string      // YYYY-MM-DD
  examTime?:      string      // HH:MM
  examType:       ExamType
  providerId:     string
  providerName:   string
  status:         ExamStatus

  // Clinical sections (all optional — completed progressively)
  chiefComplaint?: ChiefComplaint
  medicalHistory?: {
    ocular?: string
    systemic?: string
    surgical?: string
    family?: string
    medications?: string
    allergies?: string
    socialHistory?: string
  }
  visualAcuity?:        VisualAcuity
  pupils?:              PupilExam
  eom?:                 EOM
  confrontationFields?: ConfrontationFields
  iop?:                 IopReading
  slitLamp?:            SlitLamp
  fundus?:              FundusExam
  refraction?:          Refraction
  assessment?:          Assessment

  // Signature / lock
  signedBy?:    string
  signedAt?:    string
  amendedAt?:   string
  amendmentNote?: string

  // Audit
  createdAt:  string
  updatedAt:  string
  createdBy?: string

  // Computed display helpers
  completionPct?: number   // 0-100
}

// ── Lightweight summary for lists ─────────────────────────────────────────────
export interface ExamSummary {
  id:           string
  patientId:    string
  patientName:  string
  examDate:     string
  examType:     ExamType
  providerName: string
  status:       ExamStatus
  completionPct: number
  chiefComplaint?: string
  diagnoses?:   string[]   // ICD-10 codes
}

// ── Create input ──────────────────────────────────────────────────────────────
export interface ExamCreateInput {
  patientId:      string
  patientName:    string
  patientDob?:    string
  appointmentId?: string
  examDate:       string
  examTime?:      string
  examType:       ExamType
  providerId:     string
  providerName:   string
  chiefComplaint?: string
}

// ── ICD-10 Quick-pick codes (ophthalmology) ───────────────────────────────────
export const COMMON_ICD10: { code: string; desc: string; eye?: boolean }[] = [
  { code: 'Z01.01',   desc: 'Encounter for exam of eyes — with abnormal findings', eye: false },
  { code: 'Z01.00',   desc: 'Encounter for exam of eyes — no abnormal findings',   eye: false },
  { code: 'H52.10',   desc: 'Myopia, unspecified',                                 eye: true  },
  { code: 'H52.201',  desc: 'Unspecified astigmatism, right eye',                  eye: true  },
  { code: 'H52.202',  desc: 'Unspecified astigmatism, left eye',                   eye: true  },
  { code: 'H52.4',    desc: 'Presbyopia',                                           eye: false },
  { code: 'H52.31',   desc: 'Anisometropia',                                        eye: false },
  { code: 'H40.1110', desc: 'POAG, right eye, mild stage',                          eye: true  },
  { code: 'H40.1120', desc: 'POAG, left eye, mild stage',                           eye: true  },
  { code: 'H40.1130', desc: 'POAG, bilateral, mild stage',                          eye: true  },
  { code: 'H40.1210', desc: 'Low-tension glaucoma, right eye, mild stage',          eye: true  },
  { code: 'H35.30',   desc: 'Unspecified ARMD',                                     eye: true  },
  { code: 'H35.31',   desc: 'Nonexudative AMD, right eye',                          eye: true  },
  { code: 'H35.32',   desc: 'Nonexudative AMD, left eye',                           eye: true  },
  { code: 'H35.81',   desc: 'Retinal edema',                                        eye: true  },
  { code: 'E11.3591', desc: 'T2DM with proliferative DR w/o DME, right eye',        eye: true  },
  { code: 'H26.9',    desc: 'Unspecified cataract',                                 eye: true  },
  { code: 'H26.011',  desc: 'Cortical infantile & juvenile cataract, right eye',    eye: true  },
  { code: 'H04.123',  desc: 'Dry eye syndrome, bilateral',                          eye: false },
  { code: 'H10.13',   desc: 'Acute atopic conjunctivitis, bilateral',               eye: false },
  { code: 'H16.009',  desc: 'Unspecified corneal ulcer, unspecified eye',           eye: true  },
  { code: 'H02.401',  desc: 'Unspecified ptosis, right eye',                        eye: true  },
  { code: 'H50.00',   desc: 'Unspecified esotropia',                                eye: false },
  { code: 'H50.10',   desc: 'Unspecified exotropia',                                eye: false },
  { code: 'H53.141',  desc: 'Visual discomfort, right eye',                         eye: true  },
  { code: 'H57.10',   desc: 'Ocular pain, unspecified eye',                         eye: true  },
  { code: 'Z96.1',    desc: 'Presence of intraocular lens',                         eye: false },
]
