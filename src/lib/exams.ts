// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Exam Records (Phase D1-5) — D1-backed
// exams table → D1 (persistent, queryable)
// Complex clinical sections stored as JSON blobs in TEXT columns.
// KV param kept for backward-compat but NOT used for exam data.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ExamRecord, ExamSummary, ExamCreateInput,
} from '../types/exam'
import { dbGet, dbAll, dbRun, now as dbNow } from './db'

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

// ── Row mapper ────────────────────────────────────────────────────────────────
function rowToExam(r: Record<string, unknown>): ExamRecord {
  const parse = (v: unknown) => v ? JSON.parse(v as string) : undefined
  return {
    id:                   r.id as string,
    organizationId:       r.organization_id as string,
    patientId:            r.patient_id as string,
    patientName:          r.patient_name as string,
    patientDob:           r.patient_dob as string | undefined,
    appointmentId:        r.appointment_id as string | undefined,
    examDate:             r.exam_date as string,
    examTime:             r.exam_time as string | undefined,
    examType:             r.exam_type as ExamRecord['examType'],
    providerId:           r.provider_id as string | undefined,
    providerName:         r.provider_name as string | undefined,
    status:               r.status as ExamRecord['status'],
    completionPct:        r.completion_pct as number,
    chiefComplaint:       parse(r.chief_complaint),
    medicalHistory:       parse(r.medical_history),
    visualAcuity:         parse(r.visual_acuity),
    pupils:               parse(r.pupils),
    eom:                  parse(r.eom),
    confrontationFields:  parse(r.confrontation_fields),
    iop:                  parse(r.iop),
    slitLamp:             parse(r.slit_lamp),
    fundus:               parse(r.fundus),
    refraction:           parse(r.refraction),
    assessment:           parse(r.assessment),
    signedBy:             r.signed_by as string | undefined,
    signedAt:             r.signed_at as string | undefined,
    amendedAt:            r.amended_at as string | undefined,
    amendmentNote:        r.amendment_note as string | undefined,
    createdAt:            r.created_at as string,
    updatedAt:            r.updated_at as string,
  }
}

// ── ensureExamSeed ─────────────────────────────────────────────────────────────
// Seeding now handled via SQL migration 0012_audit_exams.sql
// This function is a no-op but kept for backward-compat with routes.
export async function ensureExamSeed(kv: KVNamespace, db?: D1Database): Promise<void> {
  // D1 seed is applied via migration; nothing to do here
}

// ── getExam ────────────────────────────────────────────────────────────────────
export async function getExam(kv: KVNamespace, id: string, db?: D1Database): Promise<ExamRecord | null> {
  if (!db) return null
  const row = await dbGet<Record<string, unknown>>(db, `SELECT * FROM exams WHERE id=?`, [id])
  if (!row) return null
  const exam = rowToExam(row)
  exam.completionPct = calcCompletionPct(exam)
  return exam
}

// ── listExamsForPatient ────────────────────────────────────────────────────────
export async function listExamsForPatient(kv: KVNamespace, patientId: string, db?: D1Database): Promise<ExamSummary[]> {
  if (!db) return []
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM exams WHERE patient_id=? ORDER BY exam_date DESC, exam_time DESC`,
    [patientId]
  )
  return rows.map(r => toSummary(rowToExam(r)))
}

// ── listRecentExams ────────────────────────────────────────────────────────────
export async function listRecentExams(kv: KVNamespace, limit = 20, db?: D1Database): Promise<ExamSummary[]> {
  if (!db) return []
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM exams ORDER BY exam_date DESC, exam_time DESC LIMIT ?`,
    [limit]
  )
  return rows.map(r => toSummary(rowToExam(r)))
}

// ── createExam ────────────────────────────────────────────────────────────────
export async function createExam(kv: KVNamespace, input: ExamCreateInput, db?: D1Database): Promise<ExamRecord> {
  if (!db) throw new Error('D1 database required')
  const ts  = dbNow()
  const id  = `exam-${crypto.randomUUID().slice(0, 8)}`

  const chiefJson = input.chiefComplaint
    ? JSON.stringify({ chief: input.chiefComplaint })
    : null

  await dbRun(db,
    `INSERT INTO exams
       (id, organization_id, patient_id, patient_name, patient_dob,
        appointment_id, exam_date, exam_time, exam_type,
        provider_id, provider_name, status, completion_pct,
        chief_complaint, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, 'org-001',
      input.patientId, input.patientName, input.patientDob ?? null,
      input.appointmentId ?? null,
      input.examDate, input.examTime ?? null, input.examType,
      input.providerId ?? null, input.providerName ?? null,
      'DRAFT', 0,
      chiefJson,
      ts, ts,
    ]
  )

  const exam = await getExam(kv, id, db)
  if (!exam) throw new Error('Failed to retrieve created exam')
  return exam
}

// ── updateExamSection ─────────────────────────────────────────────────────────
const SECTION_COLUMN: Record<string, string> = {
  chiefComplaint:      'chief_complaint',
  medicalHistory:      'medical_history',
  visualAcuity:        'visual_acuity',
  pupils:              'pupils',
  eom:                 'eom',
  confrontationFields: 'confrontation_fields',
  iop:                 'iop',
  slitLamp:            'slit_lamp',
  fundus:              'fundus',
  refraction:          'refraction',
  assessment:          'assessment',
}

export async function updateExamSection(
  kv: KVNamespace,
  id: string,
  section: string,
  data: unknown,
  db?: D1Database,
): Promise<ExamRecord | null> {
  if (!db) return null
  const col = SECTION_COLUMN[section]
  if (!col) return null

  const exam = await getExam(kv, id, db)
  if (!exam) return null
  if (exam.status === 'SIGNED') return null   // locked

  // Apply the section update in memory to calc new completion_pct
  ;(exam as Record<string, unknown>)[section] = data
  const pct = calcCompletionPct(exam)

  const ts = dbNow()
  await dbRun(db,
    `UPDATE exams SET ${col}=?, status='IN_PROGRESS', completion_pct=?, updated_at=? WHERE id=?`,
    [JSON.stringify(data), pct, ts, id]
  )

  return getExam(kv, id, db)
}

// ── updateExamMeta ────────────────────────────────────────────────────────────
export async function updateExamMeta(
  kv: KVNamespace,
  id: string,
  updates: Partial<Pick<ExamRecord, 'examType' | 'examDate' | 'examTime' | 'providerId' | 'providerName'>>,
  db?: D1Database,
): Promise<ExamRecord | null> {
  if (!db) return null
  const exam = await getExam(kv, id, db)
  if (!exam || exam.status === 'SIGNED') return null

  const ts = dbNow()
  const sets: string[]  = ['updated_at=?']
  const vals: unknown[] = [ts]

  if (updates.examType     !== undefined) { sets.push('exam_type=?');     vals.push(updates.examType) }
  if (updates.examDate     !== undefined) { sets.push('exam_date=?');     vals.push(updates.examDate) }
  if (updates.examTime     !== undefined) { sets.push('exam_time=?');     vals.push(updates.examTime) }
  if (updates.providerId   !== undefined) { sets.push('provider_id=?');   vals.push(updates.providerId) }
  if (updates.providerName !== undefined) { sets.push('provider_name=?'); vals.push(updates.providerName) }

  vals.push(id)
  await dbRun(db, `UPDATE exams SET ${sets.join(', ')} WHERE id=?`, vals)
  return getExam(kv, id, db)
}

// ── signExam ──────────────────────────────────────────────────────────────────
export async function signExam(
  kv: KVNamespace,
  id: string,
  providerName: string,
  db?: D1Database,
): Promise<ExamRecord | null> {
  if (!db) return null
  const exam = await getExam(kv, id, db)
  if (!exam) return null
  if (exam.status === 'SIGNED') return exam   // already signed

  const ts = dbNow()
  const pct = calcCompletionPct(exam)
  await dbRun(db,
    `UPDATE exams SET status='SIGNED', signed_by=?, signed_at=?, completion_pct=?, updated_at=? WHERE id=?`,
    [providerName, ts, pct, ts, id]
  )
  return getExam(kv, id, db)
}

// ── amendExam ─────────────────────────────────────────────────────────────────
export async function amendExam(
  kv: KVNamespace,
  id: string,
  note: string,
  db?: D1Database,
): Promise<ExamRecord | null> {
  if (!db) return null
  const exam = await getExam(kv, id, db)
  if (!exam) return null

  const ts = dbNow()
  await dbRun(db,
    `UPDATE exams SET status='AMENDED', amended_at=?, amendment_note=?, updated_at=? WHERE id=?`,
    [ts, note, ts, id]
  )
  return getExam(kv, id, db)
}

// ── deleteExam ────────────────────────────────────────────────────────────────
export async function deleteExam(kv: KVNamespace, id: string, db?: D1Database): Promise<boolean> {
  if (!db) return false
  const exam = await getExam(kv, id, db)
  if (!exam) return false
  if (exam.status === 'SIGNED') return false   // cannot delete signed exam

  await dbRun(db, `DELETE FROM exams WHERE id=?`, [id])
  return true
}
