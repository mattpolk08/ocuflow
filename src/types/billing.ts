// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Billing & Claims Types  (Phase 2A)
// src/types/billing.ts
// ─────────────────────────────────────────────────────────────────────────────

// ── CPT Code Registry ─────────────────────────────────────────────────────────
export interface CptCode {
  code:         string    // e.g. "92004"
  description:  string    // e.g. "Comprehensive eye exam, new patient"
  category:     CptCategory
  fee:          number    // standard fee in USD (2 decimal places)
  units?:       number    // default billing units (usually 1)
  modifiers?:   string[]  // common modifiers (e.g. ["25","57"])
  requiresDx?:  boolean   // requires ICD-10 diagnosis pointer
}

export type CptCategory =
  | 'EYE_EXAM'
  | 'CONTACT_LENS'
  | 'GLAUCOMA'
  | 'RETINA'
  | 'ANTERIOR_SEGMENT'
  | 'POSTERIOR_SEGMENT'
  | 'TESTING'
  | 'SURGICAL'
  | 'EVALUATION'
  | 'OFFICE_VISIT'
  | 'OTHER'

// ── Superbill Line Item ────────────────────────────────────────────────────────
export interface BillLineItem {
  id:           string
  cptCode:      string
  description:  string
  icd10Pointers: string[]   // ICD-10 codes linked to this CPT
  units:        number
  fee:          number      // charge per unit
  total:        number      // fee × units
  modifier?:    string      // e.g. "25", "RT", "LT"
  eye?:         'OD' | 'OS' | 'OU'
  approved:     boolean
}

// ── Superbill ──────────────────────────────────────────────────────────────────
export type SuperbillStatus =
  | 'DRAFT'
  | 'PENDING_REVIEW'
  | 'REVIEWED'
  | 'SUBMITTED'
  | 'PAID'
  | 'PARTIALLY_PAID'
  | 'DENIED'
  | 'VOIDED'

export interface Superbill {
  id:             string    // sb-{uuid8}
  organizationId: string
  patientId:      string
  patientName:    string
  examId?:        string
  appointmentId?: string
  serviceDate:    string    // YYYY-MM-DD
  providerId:     string
  providerName:   string
  providerNpi?:   string

  // Insurance info (from patient record)
  primaryInsurance?: {
    payerName:  string
    payerId:    string
    memberId:   string
    groupId?:   string
    copay?:     number
  }

  diagnoses:      { icd10Code: string; description: string; primary: boolean }[]
  lineItems:      BillLineItem[]

  // Financial summary
  totalCharge:    number    // sum of all line item totals
  copayAmount:    number    // expected copay
  copayCollected: number    // copay actually collected
  insuranceBilled?: number
  insurancePaid?:   number
  patientBalance:   number  // what patient still owes
  adjustments:      number  // contractual write-offs

  status:         SuperbillStatus
  notes?:         string
  claimNumber?:   string    // clearinghouse claim #
  submittedAt?:   string
  paidAt?:        string

  createdAt:      string
  updatedAt:      string
}

// ── Payment ────────────────────────────────────────────────────────────────────
export type PaymentMethod = 'CASH' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'CHECK' | 'INSURANCE' | 'WRITE_OFF' | 'OTHER'
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'REFUNDED' | 'FAILED'

export interface Payment {
  id:             string    // pay-{uuid8}
  superbillId:    string
  patientId:      string
  patientName:    string
  amount:         number
  method:         PaymentMethod
  status:         PaymentStatus
  reference?:     string    // check #, last 4 of card, etc.
  paidBy:         'PATIENT' | 'INSURANCE'
  notes?:         string
  postedAt:       string    // ISO datetime
  createdAt:      string
}

// ── Summary views ──────────────────────────────────────────────────────────────
export interface SuperbillSummary {
  id:           string
  patientId:    string
  patientName:  string
  serviceDate:  string
  providerName: string
  status:       SuperbillStatus
  totalCharge:  number
  patientBalance: number
  copayCollected: number
  diagnosisCodes: string[]
  cptCodes:       string[]
  claimNumber?:   string
}

// ── Create input ───────────────────────────────────────────────────────────────
export interface SuperbillCreateInput {
  patientId:      string
  patientName:    string
  examId?:        string
  appointmentId?: string
  serviceDate:    string
  providerId:     string
  providerName:   string
  copayAmount?:   number
  primaryInsurance?: Superbill['primaryInsurance']
  diagnoses?:     Superbill['diagnoses']
}

// ── CPT Fee Schedule (ophthalmology-specific) ─────────────────────────────────
export const CPT_CODES: CptCode[] = [
  // ── Eye Examinations ──
  { code: '92002', description: 'Eye exam, new patient, intermediate',            category: 'EYE_EXAM',    fee: 115.00, requiresDx: true },
  { code: '92004', description: 'Eye exam, new patient, comprehensive',           category: 'EYE_EXAM',    fee: 185.00, requiresDx: true },
  { code: '92012', description: 'Eye exam, established patient, intermediate',    category: 'EYE_EXAM',    fee:  90.00, requiresDx: true },
  { code: '92014', description: 'Eye exam, established patient, comprehensive',   category: 'EYE_EXAM',    fee: 155.00, requiresDx: true },

  // ── Office/Outpatient E&M ──
  { code: '99202', description: 'Office visit, new patient, low complexity',      category: 'OFFICE_VISIT', fee: 110.00 },
  { code: '99203', description: 'Office visit, new patient, moderate complexity', category: 'OFFICE_VISIT', fee: 160.00 },
  { code: '99204', description: 'Office visit, new patient, high complexity',     category: 'OFFICE_VISIT', fee: 215.00 },
  { code: '99211', description: 'Office visit, established, minimal',             category: 'OFFICE_VISIT', fee:  45.00 },
  { code: '99212', description: 'Office visit, established, low complexity',      category: 'OFFICE_VISIT', fee:  78.00 },
  { code: '99213', description: 'Office visit, established, moderate complexity', category: 'OFFICE_VISIT', fee: 120.00 },
  { code: '99214', description: 'Office visit, established, high complexity',     category: 'OFFICE_VISIT', fee: 175.00 },

  // ── Contact Lens Services ──
  { code: '92310', description: 'Contact lens fitting, one eye',                  category: 'CONTACT_LENS', fee:  85.00 },
  { code: '92311', description: 'Contact lens fitting, bifocal, one eye',         category: 'CONTACT_LENS', fee: 110.00 },
  { code: '92314', description: 'Prescription of contact lens',                   category: 'CONTACT_LENS', fee:  55.00 },
  { code: '92325', description: 'Modification of contact lens',                   category: 'CONTACT_LENS', fee:  45.00 },
  { code: '92326', description: 'Replacement of contact lens',                    category: 'CONTACT_LENS', fee:  40.00 },

  // ── Glaucoma ──
  { code: '92083', description: 'Visual field examination, extended (HVF 24-2)',  category: 'GLAUCOMA',    fee: 120.00, requiresDx: true },
  { code: '92133', description: 'Scanning computerized optic nerve imaging (OCT)', category: 'GLAUCOMA',   fee: 145.00, requiresDx: true },
  { code: '92134', description: 'Scanning computerized retinal imaging (OCT)',    category: 'RETINA',      fee: 145.00, requiresDx: true },
  { code: '76514', description: 'Ophthalmic biometry — pachymetry (corneal thickness)', category: 'TESTING', fee: 65.00 },

  // ── Diagnostics / Testing ──
  { code: '92020', description: 'Gonioscopy',                                     category: 'GLAUCOMA',    fee:  95.00, requiresDx: true },
  { code: '92025', description: 'Corneal topography',                             category: 'TESTING',     fee: 115.00 },
  { code: '92060', description: 'Sensorimotor examination',                       category: 'TESTING',     fee:  90.00 },
  { code: '92081', description: 'Visual field examination, limited (confrontation)', category: 'TESTING',  fee:  55.00 },
  { code: '92082', description: 'Visual field examination, intermediate',         category: 'TESTING',     fee:  85.00 },
  { code: '92100', description: 'Serial tonometry — one or more measurements',    category: 'GLAUCOMA',    fee:  75.00 },
  { code: '92235', description: 'Fluorescein angiography',                        category: 'RETINA',      fee: 265.00, requiresDx: true },
  { code: '92250', description: 'Fundus photography',                             category: 'RETINA',      fee: 125.00, requiresDx: true },

  // ── Procedures ──
  { code: '65222', description: 'Removal of foreign body, conjunctival, embedded', category: 'ANTERIOR_SEGMENT', fee: 215.00, modifiers: ['RT','LT'] },
  { code: '65430', description: 'Scraping of cornea, diagnostic',                 category: 'ANTERIOR_SEGMENT', fee: 195.00, modifiers: ['RT','LT'] },
  { code: '66821', description: 'YAG laser capsulotomy',                          category: 'SURGICAL',    fee: 680.00, modifiers: ['RT','LT'], requiresDx: true },
  { code: '67028', description: 'Intravitreal injection',                         category: 'RETINA',      fee: 195.00, modifiers: ['RT','LT'], requiresDx: true },
  { code: '67210', description: 'Photocoagulation, retinal lesion',               category: 'RETINA',      fee: 745.00, modifiers: ['RT','LT'], requiresDx: true },

  // ── Dilation / Misc ──
  { code: '99070', description: 'Supplies/materials beyond usual (dilation drops)', category: 'OTHER',     fee:  18.00 },
  { code: '99211', description: 'IOP check only, brief visit',                    category: 'GLAUCOMA',    fee:  45.00 },
]

// Quick lookup map
export const CPT_MAP: Record<string, CptCode> = Object.fromEntries(CPT_CODES.map(c => [c.code, c]))

// ── Exam type → suggested CPT codes ──────────────────────────────────────────
export const EXAM_TYPE_CPT_MAP: Record<string, string[]> = {
  COMPREHENSIVE:  ['92004', '92014'],
  FOLLOWUP:       ['92012', '99213'],
  CONTACT_LENS:   ['92004', '92014', '92310', '92314'],
  GLAUCOMA:       ['92014', '92083', '92133', '92020', '92100'],
  DIABETIC:       ['92014', '92134', '92250', '92083'],
  POST_OP:        ['99213', '66821'],
  PEDIATRIC:      ['92004', '92014'],
  URGENT:         ['99203', '99213'],
  REFRACTIVE:     ['92014', '92025'],
}
