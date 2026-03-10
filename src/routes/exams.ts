// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Exam Record Routes (Phase D1-5)
//
// GET  /api/exams                       — recent exams list
// GET  /api/exams/patient/:pid          — all exams for a patient
// GET  /api/exams/:id                   — single exam record
// POST /api/exams                       — create new exam
// PUT  /api/exams/:id/section/:section  — update a clinical section
// PUT  /api/exams/:id/meta              — update exam metadata
// POST /api/exams/:id/sign              — sign & lock exam
// POST /api/exams/:id/amend             — amend a signed exam
// DELETE /api/exams/:id                 — delete draft exam
// GET  /api/exams/icd10/search          — ICD-10 quick search
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import type { ApiResponse } from '../types/intake'
import type { ExamCreateInput, ExamType } from '../types/exam'
import { COMMON_ICD10 } from '../types/exam'
import {
  ensureExamSeed,
  getExam,
  listExamsForPatient,
  listRecentExams,
  createExam,
  updateExamSection,
  updateExamMeta,
  signExam,
  amendExam,
  deleteExam,
} from '../lib/exams'
import { requireRole } from '../middleware/auth'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  DB: D1Database
  DEMO_MODE: string
}
type Variables = { auth: import('../types/auth').AuthContext }

const examRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ── GET /api/exams ─────────────────────────────────────────────────────────────
examRoutes.get('/', async (c) => {
  const limit = parseInt(c.req.query('limit') || '20', 10)
  try {
    await ensureExamSeed(c.env.OCULOFLOW_KV, c.env.DB)
    const exams = await listRecentExams(c.env.OCULOFLOW_KV, limit, c.env.DB)
    return c.json<ApiResponse>({ success: true, data: { exams, total: exams.length } })
  } catch (err) {
    console.error('List exams error:', err)
    return c.json<ApiResponse>({ success: false, error: 'Could not load exams' }, 500)
  }
})

// ── GET /api/exams/icd10/search ────────────────────────────────────────────────
examRoutes.get('/icd10/search', (c) => {
  const q = (c.req.query('q') || '').toLowerCase().trim()
  if (!q) return c.json<ApiResponse>({ success: true, data: COMMON_ICD10.slice(0, 10) })

  const results = COMMON_ICD10.filter(
    d => d.code.toLowerCase().includes(q) || d.desc.toLowerCase().includes(q)
  ).slice(0, 15)

  return c.json<ApiResponse>({ success: true, data: results })
})

// ── GET /api/exams/patient/:pid ────────────────────────────────────────────────
examRoutes.get('/patient/:pid', async (c) => {
  const patientId = c.req.param('pid')
  try {
    const exams = await listExamsForPatient(c.env.OCULOFLOW_KV, patientId, c.env.DB)
    return c.json<ApiResponse>({ success: true, data: { exams, patientId } })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not load patient exams' }, 500)
  }
})

// ── GET /api/exams/:id ─────────────────────────────────────────────────────────
examRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const exam = await getExam(c.env.OCULOFLOW_KV, id, c.env.DB)
    if (!exam) return c.json<ApiResponse>({ success: false, error: 'Exam not found' }, 404)
    return c.json<ApiResponse>({ success: true, data: exam })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not load exam' }, 500)
  }
})

// ── POST /api/exams ────────────────────────────────────────────────────────────
examRoutes.post('/', requireRole('ADMIN', 'PROVIDER', 'NURSE'), async (c) => {
  const body = await c.req.json<ExamCreateInput>()

  if (!body.patientId || !body.patientName || !body.examDate || !body.examType || !body.providerId) {
    return c.json<ApiResponse>({
      success: false,
      error: 'patientId, patientName, examDate, examType, providerId are required',
    }, 400)
  }

  const validTypes: ExamType[] = [
    'COMPREHENSIVE', 'FOLLOWUP', 'URGENT', 'CONTACT_LENS',
    'GLAUCOMA', 'DIABETIC', 'POST_OP', 'PEDIATRIC', 'REFRACTIVE',
  ]
  if (!validTypes.includes(body.examType)) {
    return c.json<ApiResponse>({ success: false, error: `Invalid examType. Valid: ${validTypes.join(', ')}` }, 400)
  }

  try {
    const exam = await createExam(c.env.OCULOFLOW_KV, body, c.env.DB)
    return c.json<ApiResponse>({ success: true, data: exam, message: `Exam created — ${exam.id}` }, 201)
  } catch (err) {
    console.error('Create exam error:', err)
    return c.json<ApiResponse>({ success: false, error: 'Could not create exam' }, 500)
  }
})

// ── PUT /api/exams/:id/section/:section ────────────────────────────────────────
examRoutes.put('/:id/section/:section', requireRole('ADMIN', 'PROVIDER', 'NURSE'), async (c) => {
  const id      = c.req.param('id')
  const section = c.req.param('section')
  const data    = await c.req.json()

  try {
    const exam = await updateExamSection(c.env.OCULOFLOW_KV, id, section, data, c.env.DB)
    if (!exam) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Exam not found, section invalid, or exam is signed and locked',
      }, 404)
    }
    return c.json<ApiResponse>({
      success: true,
      data: exam,
      message: `Section '${section}' saved — ${exam.completionPct}% complete`,
    })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not save section' }, 500)
  }
})

// ── PUT /api/exams/:id/meta ────────────────────────────────────────────────────
examRoutes.put('/:id/meta', requireRole('ADMIN', 'PROVIDER', 'NURSE'), async (c) => {
  const id   = c.req.param('id')
  const body = await c.req.json()

  // Guard: only allow safe meta fields
  const safe = ['examType', 'examDate', 'examTime', 'providerId', 'providerName']
  const updates: Record<string, unknown> = {}
  safe.forEach(k => { if (body[k] !== undefined) updates[k] = body[k] })

  try {
    const exam = await updateExamMeta(c.env.OCULOFLOW_KV, id, updates as never, c.env.DB)
    if (!exam) return c.json<ApiResponse>({ success: false, error: 'Exam not found or locked' }, 404)
    return c.json<ApiResponse>({ success: true, data: exam, message: 'Exam metadata updated' })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not update exam' }, 500)
  }
})

// ── POST /api/exams/:id/sign ───────────────────────────────────────────────────
examRoutes.post('/:id/sign', requireRole('PROVIDER', 'ADMIN'), async (c) => {
  const id   = c.req.param('id')
  const body = await c.req.json<{ providerName?: string }>()

  if (!body.providerName) {
    return c.json<ApiResponse>({ success: false, error: 'providerName is required to sign' }, 400)
  }

  try {
    const exam = await signExam(c.env.OCULOFLOW_KV, id, body.providerName, c.env.DB)
    if (!exam) return c.json<ApiResponse>({ success: false, error: 'Exam not found' }, 404)
    return c.json<ApiResponse>({
      success: true,
      data: exam,
      message: `Exam signed by ${body.providerName} at ${exam.signedAt}`,
    })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not sign exam' }, 500)
  }
})

// ── POST /api/exams/:id/amend ──────────────────────────────────────────────────
examRoutes.post('/:id/amend', requireRole('PROVIDER', 'ADMIN'), async (c) => {
  const id   = c.req.param('id')
  const body = await c.req.json<{ note?: string }>()

  if (!body.note) {
    return c.json<ApiResponse>({ success: false, error: 'Amendment note is required' }, 400)
  }

  try {
    const exam = await amendExam(c.env.OCULOFLOW_KV, id, body.note, c.env.DB)
    if (!exam) return c.json<ApiResponse>({ success: false, error: 'Exam not found' }, 404)
    return c.json<ApiResponse>({ success: true, data: exam, message: 'Exam amended' })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not amend exam' }, 500)
  }
})

// ── DELETE /api/exams/:id ──────────────────────────────────────────────────────
examRoutes.delete('/:id', requireRole('ADMIN', 'PROVIDER'), async (c) => {
  const id = c.req.param('id')
  try {
    const ok = await deleteExam(c.env.OCULOFLOW_KV, id, c.env.DB)
    if (!ok) return c.json<ApiResponse>({ success: false, error: 'Exam not found or is signed (cannot delete)' }, 400)
    return c.json<ApiResponse>({ success: true, message: 'Exam deleted' })
  } catch (err) {
    return c.json<ApiResponse>({ success: false, error: 'Could not delete exam' }, 500)
  }
})

export default examRoutes
