// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Exam Record KV Store (Phase 1D)
// src/lib/exams.ts
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ExamRecord, ExamSummary, ExamCreateInput, ExamStatus, ExamType,
  VisualAcuity, IopReading, SlitLamp, FundusExam, Refraction, Assessment,
  ChiefComplaint, PupilExam, EOM, ConfrontationFields,
} from '../types/exam'

// ── KV Key Schema ─────────────────────────────────────────────────────────────
// exams:index          → string[]  (all exam IDs)
// exams:patient:{pid}  → string[]  (exam IDs for a patient)
// exam:{id}            → ExamRecord JSON

const KV_INDEX        = 'exams:index'
const KV_PT_PREFIX    = 'exams:patient:'
const KV_EXAM_PREFIX  = 'exam:'

// ── Helpers ───────────────────────────────────────────────────────────────────
function calcCompletionPct(e: ExamRecord): number {
  const sections = [
    e.chiefComplaint,
    e.visualAcuity,
    e.iop,
    e.pupils,
    e.slitLamp,
    e.fundus,
    e.refraction,
    e.assessment,
  ]
  const filled = sections.filter(Boolean).length
  return Math.round((filled / sections.length) * 100)
}

function toSummary(e: ExamRecord): ExamSummary {
  return {
    id:            e.id,
    patientId:     e.patientId,
    patientName:   e.patientName,
    examDate:      e.examDate,
    examType:      e.examType,
    providerName:  e.providerName,
    status:        e.status,
    completionPct: e.completionPct ?? calcCompletionPct(e),
    chiefComplaint: e.chiefComplaint?.chief,
    diagnoses:     e.assessment?.diagnoses?.map(d => d.icd10Code) ?? [],
  }
}

// ── Seed Data ─────────────────────────────────────────────────────────────────
const SEED_EXAMS: ExamRecord[] = [
  {
    id: 'exam-001',
    organizationId: 'org-001',
    patientId: 'pt-001',
    patientName: 'Margaret Sullivan',
    patientDob: '1948-06-14',
    appointmentId: 'appt-001',
    examDate: '2026-03-07',
    examTime: '08:00',
    examType: 'COMPREHENSIVE',
    providerId: 'dr-chen',
    providerName: 'Dr. Sarah Chen, OD',
    status: 'SIGNED',
    chiefComplaint: {
      chief: 'Annual comprehensive eye exam',
      hpi: 'Patient presents for routine annual exam. Reports mild blur at distance with current glasses. No new symptoms. Glaucoma follow-up included.',
      onset: 'Gradual over 6 months',
      severity: '3',
    },
    medicalHistory: {
      ocular: 'Glaucoma (diagnosed 2019), Pseudophakia OU (cataract surgery 2021)',
      systemic: 'Hypertension, Hyperlipidemia',
      surgical: 'Cataract extraction with IOL implantation OU (2021)',
      medications: 'Timolol 0.5% BID OU, Latanoprost 0.005% QHS OS, Lisinopril 10mg QD, Atorvastatin 40mg QD',
      allergies: 'Penicillin, Sulfa drugs',
    },
    visualAcuity: {
      od: { sc: '20/100', cc: '20/30', ph: '20/25' },
      os: { sc: '20/200', cc: '20/40', ph: '20/30' },
      method: 'Snellen',
    },
    pupils: {
      od: { size: '3mm', reaction: 'Brisk' },
      os: { size: '3mm', reaction: 'Brisk' },
      apd: 'none',
    },
    eom: { od: 'Full', os: 'Full', versions: 'Full, smooth, comitant', cover: 'Orthophoria' },
    confrontationFields: { od: 'Full', os: 'Full' },
    iop: { od: 16, os: 14, method: 'Goldmann', time: '08:15' },
    slitLamp: {
      od: {
        lids: 'WNL',
        conjunctiva: 'Clear, white, quiet',
        cornea: 'Clear, trace guttata',
        anteriorChamber: 'Deep and quiet',
        acCell: 'WNL', acFlare: 'WNL',
        iris: 'Flat, round, intact',
        lens: 'IOL in place, posterior capsule clear',
      },
      os: {
        lids: 'WNL',
        conjunctiva: 'Clear, white, quiet',
        cornea: 'Clear',
        anteriorChamber: 'Deep and quiet',
        acCell: 'WNL', acFlare: 'WNL',
        iris: 'Flat, round, intact',
        lens: 'IOL in place, posterior capsule clear',
      },
      dilation: { performed: true, agent: '1% Tropicamide + 2.5% Phenylephrine', time: '08:20', readyTime: '08:45' },
    },
    fundus: {
      od: {
        disc: 'Pink, sharp margins, distinct',
        cdRatio: '0.5', cdRatioV: '0.5',
        rim: 'Intact rim tissue, no notching',
        vessels: 'A/V ratio 2/3, mild AV nicking',
        macula: 'Flat, even reflex, no drusen',
        periphery: 'Flat, no tears, breaks or lattice',
      },
      os: {
        disc: 'Pink, sharp margins',
        cdRatio: '0.6', cdRatioV: '0.6',
        rim: 'Inferior rim slightly thinned',
        vessels: 'A/V ratio 2/3',
        macula: 'Flat, even reflex',
        periphery: 'Flat, no pathology',
      },
      method: 'BIO',
      dilated: true,
    },
    refraction: {
      od: { sphere: '-1.25', cylinder: '-0.50', axis: 95, vaWithRx: '20/25' },
      os: { sphere: '-1.75', cylinder: '-0.75', axis: 82, vaWithRx: '20/30' },
      finalRxOd: { sphere: '-1.25', cylinder: '-0.50', axis: 95, add: '+2.50' },
      finalRxOs: { sphere: '-1.75', cylinder: '-0.75', axis: 82, add: '+2.50' },
      type: 'Manifest',
      pupillaryDistance: { od: 32, os: 32 },
    },
    assessment: {
      diagnoses: [
        { icd10Code: 'H40.1130', description: 'POAG, bilateral, mild stage', eye: 'OU', chronic: true, primary: true },
        { icd10Code: 'Z96.1',    description: 'Presence of intraocular lens', eye: 'OU', chronic: true },
        { icd10Code: 'H52.10',   description: 'Myopia, unspecified', eye: 'OU', chronic: false },
      ],
      plan: [
        { category: 'Medication', description: 'Continue Timolol 0.5% BID OU', eye: 'OU' },
        { category: 'Medication', description: 'Continue Latanoprost 0.005% QHS OS', eye: 'OS' },
        { category: 'Testing',    description: 'Visual field test (HVF 24-2) — both eyes' },
        { category: 'Optical',    description: 'Update distance Rx, progressive lenses' },
        { category: 'Follow-up',  description: 'Return in 6 months for glaucoma IOP check' },
      ],
      followUp: '6 months',
      providerNotes: 'IOP well controlled on current regimen. OS disc slightly larger cup — continue monitoring. New Rx issued.',
    },
    signedBy: 'Dr. Sarah Chen, OD',
    signedAt: '2026-03-07T09:45:00Z',
    createdAt: '2026-03-07T08:00:00Z',
    updatedAt: '2026-03-07T09:45:00Z',
    completionPct: 100,
  },

  {
    id: 'exam-002',
    organizationId: 'org-001',
    patientId: 'pt-002',
    patientName: 'Derek Holloway',
    patientDob: '1972-03-28',
    appointmentId: 'appt-002',
    examDate: '2026-03-07',
    examTime: '09:00',
    examType: 'DIABETIC',
    providerId: 'dr-patel',
    providerName: 'Dr. Raj Patel, MD',
    status: 'IN_PROGRESS',
    chiefComplaint: {
      chief: 'Diabetic eye exam — annual',
      hpi: 'Type 2 DM for 12 years. Last HbA1c 7.8%. No new visual complaints. Mild blur distance.',
      severity: '2',
    },
    medicalHistory: {
      ocular: 'Background diabetic retinopathy OS (2024)',
      systemic: 'Type 2 Diabetes Mellitus (x12yr), Hypertension, Obesity',
      medications: 'Metformin 1000mg BID, Lisinopril 20mg QD, Aspirin 81mg QD',
      allergies: 'NKDA',
    },
    visualAcuity: {
      od: { sc: '20/30', cc: '20/20' },
      os: { sc: '20/50', cc: '20/30', ph: '20/25' },
      method: 'Snellen',
    },
    iop: { od: 15, os: 17, method: 'Non-contact', time: '09:10' },
    slitLamp: {
      od: {
        conjunctiva: 'Clear',
        cornea: 'Clear',
        anteriorChamber: 'Deep and quiet',
        acCell: 'WNL', acFlare: 'WNL',
        lens: 'Trace nuclear sclerosis',
      },
      os: {
        conjunctiva: 'Clear',
        cornea: 'Clear',
        anteriorChamber: 'Deep and quiet',
        acCell: 'WNL', acFlare: 'WNL',
        lens: 'Trace nuclear sclerosis',
      },
      dilation: { performed: true, agent: '1% Tropicamide', time: '09:15', readyTime: '09:40' },
    },
    fundus: {
      od: {
        disc: 'Pink, sharp, 0.3 C/D',
        cdRatio: '0.3',
        vessels: 'Mild AV nicking, no NVD',
        macula: 'Flat, no exudate',
        periphery: 'Dot hemorrhages peripheral, no NVE',
      },
      os: {
        disc: 'Pink, sharp, 0.4 C/D',
        cdRatio: '0.4',
        vessels: 'Scattered dot-blot hemorrhages, microaneurysms',
        macula: 'Hard exudate approaching fovea — concern for CSME',
        periphery: 'Dot-blot hemorrhages, microaneurysms x 3 quadrants',
      },
      method: 'BIO',
      dilated: true,
    },
    assessment: {
      diagnoses: [
        { icd10Code: 'E11.3591', description: 'T2DM with proliferative DR without DME, right eye', eye: 'OD', primary: true },
        { icd10Code: 'E11.3592', description: 'T2DM with non-proliferative DR moderate, left eye', eye: 'OS', primary: false },
      ],
      plan: [
        { category: 'Referral',  description: 'Retina consult for OS CSME evaluation', eye: 'OS', details: 'Urgent — within 2 weeks' },
        { category: 'Testing',   description: 'OCT macula OS — today' },
        { category: 'Education', description: 'Diabetic eye disease counseling provided' },
        { category: 'Follow-up', description: 'Return 3 months or sooner if vision change' },
      ],
      followUp: '3 months',
    },
    createdAt: '2026-03-07T09:00:00Z',
    updatedAt: '2026-03-07T10:30:00Z',
    completionPct: 75,
  },

  {
    id: 'exam-003',
    organizationId: 'org-001',
    patientId: 'pt-003',
    patientName: 'Priya Nair',
    patientDob: '1988-11-22',
    examDate: '2026-03-07',
    examTime: '10:00',
    examType: 'CONTACT_LENS',
    providerId: 'dr-chen',
    providerName: 'Dr. Sarah Chen, OD',
    status: 'DRAFT',
    chiefComplaint: {
      chief: 'Contact lens fitting — first time',
      hpi: 'Established patient requesting contact lenses. Currently wearing glasses -3.25 OD, -3.75 OS. Works on computer 8+ hours/day.',
    },
    medicalHistory: {
      systemic: 'No systemic conditions',
      medications: 'None',
      allergies: 'NKDA',
    },
    visualAcuity: {
      od: { sc: '20/400', cc: '20/20' },
      os: { sc: '20/400', cc: '20/20' },
    },
    iop: { od: 12, os: 13, method: 'Non-contact' },
    createdAt: '2026-03-07T10:00:00Z',
    updatedAt: '2026-03-07T10:05:00Z',
    completionPct: 25,
  },
]

let _seeded = false

// ── ensureSeedData ─────────────────────────────────────────────────────────────
export async function ensureExamSeed(kv: KVNamespace): Promise<void> {
  if (_seeded) return
  const existing = await kv.get(KV_INDEX)
  if (existing) { _seeded = true; return }

  // Write all seed exams
  for (const exam of SEED_EXAMS) {
    exam.completionPct = calcCompletionPct(exam)
    await kv.put(KV_EXAM_PREFIX + exam.id, JSON.stringify(exam))
    // Update patient index
    const ptKey  = KV_PT_PREFIX + exam.patientId
    const ptList = JSON.parse((await kv.get(ptKey)) || '[]') as string[]
    if (!ptList.includes(exam.id)) ptList.push(exam.id)
    await kv.put(ptKey, JSON.stringify(ptList))
  }

  // Write global index
  await kv.put(KV_INDEX, JSON.stringify(SEED_EXAMS.map(e => e.id)))
  _seeded = true
}

// ── getExam ────────────────────────────────────────────────────────────────────
export async function getExam(kv: KVNamespace, id: string): Promise<ExamRecord | null> {
  const raw = await kv.get(KV_EXAM_PREFIX + id)
  if (!raw) return null
  const e = JSON.parse(raw) as ExamRecord
  e.completionPct = calcCompletionPct(e)
  return e
}

// ── listExamsForPatient ────────────────────────────────────────────────────────
export async function listExamsForPatient(kv: KVNamespace, patientId: string): Promise<ExamSummary[]> {
  const ptKey = KV_PT_PREFIX + patientId
  const ids   = JSON.parse((await kv.get(ptKey)) || '[]') as string[]
  const exams: ExamRecord[] = []
  for (const id of ids) {
    const e = await getExam(kv, id)
    if (e) exams.push(e)
  }
  // Sort newest first
  exams.sort((a, b) => b.examDate.localeCompare(a.examDate))
  return exams.map(toSummary)
}

// ── listRecentExams ────────────────────────────────────────────────────────────
export async function listRecentExams(kv: KVNamespace, limit = 20): Promise<ExamSummary[]> {
  const ids   = JSON.parse((await kv.get(KV_INDEX)) || '[]') as string[]
  const exams: ExamRecord[] = []
  for (const id of ids.slice(-limit).reverse()) {
    const e = await getExam(kv, id)
    if (e) exams.push(e)
  }
  exams.sort((a, b) => {
    const da = `${a.examDate}T${a.examTime || '00:00'}`
    const db = `${b.examDate}T${b.examTime || '00:00'}`
    return db.localeCompare(da)
  })
  return exams.slice(0, limit).map(toSummary)
}

// ── createExam ────────────────────────────────────────────────────────────────
export async function createExam(kv: KVNamespace, input: ExamCreateInput): Promise<ExamRecord> {
  const now  = new Date().toISOString()
  const id   = `exam-${crypto.randomUUID().slice(0, 8)}`

  const exam: ExamRecord = {
    id,
    organizationId: 'org-001',
    patientId:     input.patientId,
    patientName:   input.patientName,
    patientDob:    input.patientDob,
    appointmentId: input.appointmentId,
    examDate:      input.examDate,
    examTime:      input.examTime,
    examType:      input.examType,
    providerId:    input.providerId,
    providerName:  input.providerName,
    status:        'DRAFT',
    chiefComplaint: input.chiefComplaint
      ? { chief: input.chiefComplaint }
      : undefined,
    createdAt: now,
    updatedAt: now,
    completionPct: 0,
  }

  await kv.put(KV_EXAM_PREFIX + id, JSON.stringify(exam))

  // Update indices
  const globalIds = JSON.parse((await kv.get(KV_INDEX)) || '[]') as string[]
  globalIds.push(id)
  await kv.put(KV_INDEX, JSON.stringify(globalIds))

  const ptKey  = KV_PT_PREFIX + input.patientId
  const ptList = JSON.parse((await kv.get(ptKey)) || '[]') as string[]
  ptList.push(id)
  await kv.put(ptKey, JSON.stringify(ptList))

  return exam
}

// ── updateExamSection ─────────────────────────────────────────────────────────
// Partial update — merges a named section into the exam record
export async function updateExamSection(
  kv: KVNamespace,
  id: string,
  section: string,
  data: unknown,
): Promise<ExamRecord | null> {
  const exam = await getExam(kv, id)
  if (!exam) return null
  if (exam.status === 'SIGNED') return null  // locked

  const allowed = [
    'chiefComplaint', 'medicalHistory', 'visualAcuity', 'pupils',
    'eom', 'confrontationFields', 'iop', 'slitLamp', 'fundus',
    'refraction', 'assessment',
  ]
  if (!allowed.includes(section)) return null;

  (exam as Record<string, unknown>)[section] = data
  exam.status        = 'IN_PROGRESS'
  exam.updatedAt     = new Date().toISOString()
  exam.completionPct = calcCompletionPct(exam)

  await kv.put(KV_EXAM_PREFIX + id, JSON.stringify(exam))
  return exam
}

// ── updateExamMeta ────────────────────────────────────────────────────────────
export async function updateExamMeta(
  kv: KVNamespace,
  id: string,
  updates: Partial<Pick<ExamRecord, 'examType' | 'examDate' | 'examTime' | 'providerId' | 'providerName'>>,
): Promise<ExamRecord | null> {
  const exam = await getExam(kv, id)
  if (!exam) return null
  if (exam.status === 'SIGNED') return null

  Object.assign(exam, updates)
  exam.updatedAt = new Date().toISOString()
  await kv.put(KV_EXAM_PREFIX + id, JSON.stringify(exam))
  return exam
}

// ── signExam ──────────────────────────────────────────────────────────────────
export async function signExam(
  kv: KVNamespace,
  id: string,
  providerName: string,
): Promise<ExamRecord | null> {
  const exam = await getExam(kv, id)
  if (!exam) return null
  if (exam.status === 'SIGNED') return exam  // already signed

  exam.status       = 'SIGNED'
  exam.signedBy     = providerName
  exam.signedAt     = new Date().toISOString()
  exam.updatedAt    = exam.signedAt
  exam.completionPct = calcCompletionPct(exam)

  await kv.put(KV_EXAM_PREFIX + id, JSON.stringify(exam))
  return exam
}

// ── amendExam ─────────────────────────────────────────────────────────────────
export async function amendExam(
  kv: KVNamespace,
  id: string,
  note: string,
): Promise<ExamRecord | null> {
  const exam = await getExam(kv, id)
  if (!exam) return null

  exam.status       = 'AMENDED'
  exam.amendedAt    = new Date().toISOString()
  exam.amendmentNote = note
  exam.updatedAt    = exam.amendedAt

  await kv.put(KV_EXAM_PREFIX + id, JSON.stringify(exam))
  return exam
}

// ── deleteExam ────────────────────────────────────────────────────────────────
export async function deleteExam(kv: KVNamespace, id: string): Promise<boolean> {
  const exam = await getExam(kv, id)
  if (!exam) return false
  if (exam.status === 'SIGNED') return false  // cannot delete signed exam

  await kv.delete(KV_EXAM_PREFIX + id)

  // Remove from global index
  const globalIds = JSON.parse((await kv.get(KV_INDEX)) || '[]') as string[]
  await kv.put(KV_INDEX, JSON.stringify(globalIds.filter((i: string) => i !== id)))

  // Remove from patient index
  const ptKey  = KV_PT_PREFIX + exam.patientId
  const ptList = JSON.parse((await kv.get(ptKey)) || '[]') as string[]
  await kv.put(ptKey, JSON.stringify(ptList.filter((i: string) => i !== id)))

  return true
}
