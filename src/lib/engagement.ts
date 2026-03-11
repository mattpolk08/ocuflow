// Phase 9B — Patient Engagement & Loyalty
// Care gap detection, recall management, satisfaction surveys, loyalty programs

import type { StaffRole } from '../types/auth'

// ─── KV helpers ───────────────────────────────────────────────────────────────
async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key, 'text'); return v ? JSON.parse(v) as T : null
}
async function kvPut(kv: KVNamespace, key: string, val: unknown, ttlSec?: number): Promise<void> {
  const opts: KVNamespacePutOptions = ttlSec ? { expirationTtl: Math.max(ttlSec, 60) } : {}
  await kv.put(key, JSON.stringify(val), opts)
}
const uid = (pfx = 'eng') => `${pfx}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,6)}`
const now = () => new Date().toISOString()
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString()
const daysFromNow = (d: number) => new Date(Date.now() + d * 86400_000).toISOString()

// ─── Key scheme ───────────────────────────────────────────────────────────────
const K = {
  seeded:         'eng:seeded',
  careGap:        (id: string)    => `eng:caregap:${id}`,
  careGapIdx:     ()              => 'eng:caregap:idx',
  recall:         (id: string)    => `eng:recall:${id}`,
  recallIdx:      ()              => 'eng:recall:idx',
  survey:         (id: string)    => `eng:survey:${id}`,
  surveyIdx:      ()              => 'eng:survey:idx',
  surveyResponse: (id: string)    => `eng:survey-resp:${id}`,
  surveyRespIdx:  ()              => 'eng:survey-resp:idx',
  loyaltyPts:     (patId: string) => `eng:loyalty:${patId}`,
  loyaltyIdx:     ()              => 'eng:loyalty:idx',
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type CareGapType =
  | 'ANNUAL_EXAM_DUE'
  | 'GLAUCOMA_FOLLOWUP'
  | 'DIABETIC_EYE_EXAM'
  | 'CONTACT_LENS_RENEWAL'
  | 'GLASSES_PRESCRIPTION_EXPIRED'
  | 'MACULAR_DEGENERATION_MONITORING'
  | 'DRY_EYE_FOLLOWUP'
  | 'POST_SURGICAL_CHECK'

export type CareGapStatus = 'OPEN' | 'OUTREACH_SENT' | 'SCHEDULED' | 'CLOSED' | 'PATIENT_DECLINED'

export interface CareGap {
  id: string
  patientId: string
  patientName: string
  patientPhone?: string
  patientEmail?: string
  gapType: CareGapType
  dueDate: string               // ISO date when care is due/overdue
  daysOverdue: number
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  status: CareGapStatus
  lastVisitDate?: string
  assignedTo?: string
  notes?: string
  outreachCount: number
  lastOutreachAt?: string
  scheduledAppointmentId?: string
  createdAt: string
  updatedAt: string
}

export type RecallStatus = 'PENDING' | 'CONTACTED' | 'SCHEDULED' | 'COMPLETED' | 'DECLINED' | 'LOST'

export interface RecallRecord {
  id: string
  patientId: string
  patientName: string
  patientPhone?: string
  patientEmail?: string
  recallType: string                     // e.g. 'Annual Dilated Exam'
  dueDate: string
  status: RecallStatus
  attemptCount: number
  lastAttemptAt?: string
  lastAttemptChannel?: 'SMS' | 'EMAIL' | 'PHONE' | 'MAIL'
  scheduledDate?: string
  providerId?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface Survey {
  id: string
  name: string
  type: 'POST_VISIT' | 'ANNUAL_SATISFACTION' | 'NPS' | 'OPTICAL_EXPERIENCE' | 'TELEHEALTH'
  isActive: boolean
  questions: SurveyQuestion[]
  triggerEvent?: string               // e.g. 'EXAM_COMPLETED', 'OPTICAL_DISPENSED'
  delayHours: number                  // send N hours after trigger
  totalSent: number
  totalResponses: number
  averageScore?: number
  createdAt: string
  updatedAt: string
}

export interface SurveyQuestion {
  id: string
  text: string
  type: 'RATING_5' | 'RATING_10' | 'NPS' | 'YES_NO' | 'TEXT' | 'MULTIPLE_CHOICE'
  options?: string[]
  required: boolean
}

export interface SurveyResponse {
  id: string
  surveyId: string
  patientId: string
  patientName: string
  appointmentId?: string
  answers: Record<string, string | number>
  npsScore?: number
  overallScore?: number                // 1-5 normalized
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE'
  followUpRequired: boolean
  followUpReason?: string
  submittedAt: string
  createdAt: string
}

export interface LoyaltyAccount {
  patientId: string
  patientName: string
  totalPoints: number
  lifetimePoints: number
  tier: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM'
  history: LoyaltyEvent[]
  createdAt: string
  updatedAt: string
}

export interface LoyaltyEvent {
  id: string
  type: 'VISIT' | 'REFERRAL' | 'SURVEY_COMPLETED' | 'PRODUCT_PURCHASE' | 'BIRTHDAY_BONUS' | 'REDEEMED'
  points: number
  description: string
  date: string
}

export interface EngagementDashboard {
  careGaps: { total: number; open: number; scheduled: number; highPriority: number; avgDaysOverdue: number }
  recall:   { total: number; pending: number; contacted: number; scheduled: number; completionRate: number }
  surveys:  { totalSent: number; totalResponses: number; responseRate: number; avgNps: number; recentResponses: SurveyResponse[] }
  loyalty:  { totalEnrolled: number; activeThisMonth: number; topPatients: LoyaltyAccount[] }
  careGapsByType: { type: CareGapType; count: number; highPriority: number }[]
}

// ─── Seed data ────────────────────────────────────────────────────────────────
const SEED_CARE_GAPS: Omit<CareGap, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { patientId: 'pat-001', patientName: 'Maria Rodriguez',  patientPhone: '+13055551001', patientEmail: 'maria.r@example.com',
    gapType: 'ANNUAL_EXAM_DUE', dueDate: daysAgo(45), daysOverdue: 45,
    priority: 'HIGH', status: 'OPEN', lastVisitDate: daysAgo(410), outreachCount: 0 },
  { patientId: 'pat-002', patientName: 'James Thompson',   patientPhone: '+13055551002',
    gapType: 'DIABETIC_EYE_EXAM', dueDate: daysAgo(60), daysOverdue: 60,
    priority: 'HIGH', status: 'OUTREACH_SENT', lastVisitDate: daysAgo(425), outreachCount: 1, lastOutreachAt: daysAgo(5) },
  { patientId: 'pat-003', patientName: 'Sarah Johnson',    patientEmail: 'sarah.j@example.com',
    gapType: 'GLAUCOMA_FOLLOWUP', dueDate: daysAgo(15), daysOverdue: 15,
    priority: 'HIGH', status: 'OPEN', lastVisitDate: daysAgo(200), outreachCount: 0 },
  { patientId: 'pat-004', patientName: 'Michael Chen',     patientPhone: '+13055551004',
    gapType: 'CONTACT_LENS_RENEWAL', dueDate: daysAgo(10), daysOverdue: 10,
    priority: 'MEDIUM', status: 'OPEN', lastVisitDate: daysAgo(380), outreachCount: 0 },
  { patientId: 'pat-005', patientName: 'Emily Williams',   patientPhone: '+13055551005', patientEmail: 'emily.w@example.com',
    gapType: 'MACULAR_DEGENERATION_MONITORING', dueDate: daysAgo(30), daysOverdue: 30,
    priority: 'HIGH', status: 'SCHEDULED', lastVisitDate: daysAgo(395), outreachCount: 2, lastOutreachAt: daysAgo(3), scheduledAppointmentId: 'appt-mock-001' },
  { patientId: 'pat-006', patientName: 'Robert Davis',     patientPhone: '+13055551006',
    gapType: 'DRY_EYE_FOLLOWUP', dueDate: daysFromNow(5), daysOverdue: -5,
    priority: 'MEDIUM', status: 'OPEN', lastVisitDate: daysAgo(85), outreachCount: 0 },
  { patientId: 'pat-007', patientName: 'Linda Martinez',   patientEmail: 'linda.m@example.com',
    gapType: 'GLASSES_PRESCRIPTION_EXPIRED', dueDate: daysAgo(90), daysOverdue: 90,
    priority: 'LOW', status: 'PATIENT_DECLINED', lastVisitDate: daysAgo(455), outreachCount: 3 },
  { patientId: 'pat-008', patientName: 'David Wilson',     patientPhone: '+13055551008',
    gapType: 'ANNUAL_EXAM_DUE', dueDate: daysAgo(20), daysOverdue: 20,
    priority: 'MEDIUM', status: 'OPEN', lastVisitDate: daysAgo(385), outreachCount: 0 },
]

const SEED_RECALLS: Omit<RecallRecord, 'id' | 'createdAt' | 'updatedAt'>[] = [
  { patientId: 'pat-001', patientName: 'Maria Rodriguez', patientPhone: '+13055551001',
    recallType: 'Annual Comprehensive Eye Exam', dueDate: daysAgo(45), status: 'CONTACTED',
    attemptCount: 2, lastAttemptAt: daysAgo(3), lastAttemptChannel: 'SMS' },
  { patientId: 'pat-009', patientName: 'Anthony Brown',   patientPhone: '+13055551009',
    recallType: 'Glaucoma Follow-Up (6 months)', dueDate: daysAgo(12), status: 'PENDING',
    attemptCount: 0 },
  { patientId: 'pat-010', patientName: 'Patricia Taylor',  patientEmail: 'pat.t@example.com',
    recallType: 'Diabetic Eye Exam (Annual)', dueDate: daysAgo(55), status: 'SCHEDULED',
    attemptCount: 1, lastAttemptAt: daysAgo(7), scheduledDate: daysFromNow(10) },
  { patientId: 'pat-011', patientName: 'Thomas Anderson', patientPhone: '+13055551011',
    recallType: 'Annual Contact Lens Exam', dueDate: daysAgo(5), status: 'PENDING',
    attemptCount: 0 },
  { patientId: 'pat-012', patientName: 'Nancy White',      patientPhone: '+13055551012', patientEmail: 'nancy.w@example.com',
    recallType: 'AMD Monitoring (3 months)', dueDate: daysAgo(20), status: 'CONTACTED',
    attemptCount: 3, lastAttemptAt: daysAgo(1) },
]

const SEED_SURVEYS: Omit<Survey, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    name: 'Post-Visit Satisfaction Survey', type: 'POST_VISIT', isActive: true,
    triggerEvent: 'EXAM_COMPLETED', delayHours: 24,
    totalSent: 142, totalResponses: 98, averageScore: 4.6,
    questions: [
      { id: 'q1', text: 'How would you rate your overall experience?', type: 'RATING_5', required: true },
      { id: 'q2', text: 'How satisfied were you with wait time?', type: 'RATING_5', required: true },
      { id: 'q3', text: 'How would you rate your provider\'s communication?', type: 'RATING_5', required: true },
      { id: 'q4', text: 'Would you recommend us to family or friends?', type: 'YES_NO', required: true },
      { id: 'q5', text: 'Any additional comments?', type: 'TEXT', required: false },
    ],
  },
  {
    name: 'Net Promoter Score (NPS)', type: 'NPS', isActive: true,
    triggerEvent: 'EXAM_COMPLETED', delayHours: 48,
    totalSent: 89, totalResponses: 61, averageScore: 8.2,
    questions: [
      { id: 'q1', text: 'On a scale of 0-10, how likely are you to recommend us to a friend or colleague?', type: 'NPS', required: true },
      { id: 'q2', text: 'What is the primary reason for your score?', type: 'TEXT', required: false },
    ],
  },
  {
    name: 'Optical Department Survey', type: 'OPTICAL_EXPERIENCE', isActive: true,
    triggerEvent: 'OPTICAL_DISPENSED', delayHours: 72,
    totalSent: 54, totalResponses: 31, averageScore: 4.4,
    questions: [
      { id: 'q1', text: 'How satisfied are you with your eyewear selection?', type: 'RATING_5', required: true },
      { id: 'q2', text: 'Rate the fitting and adjustment experience:', type: 'RATING_5', required: true },
      { id: 'q3', text: 'Were your glasses/lenses ready on time?', type: 'YES_NO', required: true },
    ],
  },
]

// ─── Seed helper ─────────────────────────────────────────────────────────────
export async function ensureEngagementSeed(kv: KVNamespace, db?: D1Database): Promise<void> {
  // Seeding done via migration 0015 for care_gaps; no-op for backward-compat
}

// ─── Care Gap CRUD (D1) ────────────────────────────────────────────────────────
export async function listCareGaps(
  kv: KVNamespace,
  opts: { status?: CareGapStatus; priority?: string; gapType?: CareGapType } = {},
  db?: D1Database
): Promise<CareGap[]> {
  if (!db) return []
  const { dbAll } = await import('./db')
  const conditions: string[] = []; const params: unknown[] = []
  if (opts.status)   { conditions.push('status=?');   params.push(opts.status) }
  if (opts.priority) { conditions.push('priority=?'); params.push(opts.priority) }
  if (opts.gapType)  { conditions.push('gap_type=?'); params.push(opts.gapType) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const rows = await dbAll<Record<string, unknown>>(db, `SELECT * FROM care_gaps ${where} ORDER BY due_date ASC NULLS LAST`, params)
  return rows.map(r => ({
    id:             r.id as string,
    patientId:      r.patient_id as string,
    patientName:    r.patient_name as string,
    gapType:        r.gap_type as CareGapType,
    status:         r.status as CareGapStatus,
    priority:       r.priority as string,
    daysOverdue:    r.due_date ? Math.max(0, Math.floor((Date.now() - new Date(r.due_date as string).getTime()) / 86400000)) : 0,
    dueDate:        r.due_date as string | undefined,
    lastVisitDate:  r.last_visit_date as string | undefined,
    description:    r.description as string | undefined,
    assignedTo:     r.assigned_to as string | undefined,
    outreachCount:  r.outreach_count as number,
    lastOutreach:   r.last_outreach as string | undefined,
    closedAt:       r.closed_at as string | undefined,
    closedReason:   r.closed_reason as string | undefined,
    createdAt:      r.created_at as string,
    updatedAt:      r.updated_at as string,
  }))
}

export async function getCareGap(kv: KVNamespace, id: string, db?: D1Database): Promise<CareGap | null> {
  if (!db) return null
  const gaps = await listCareGaps(kv, {}, db)
  return gaps.find(g => g.id === id) ?? null
}

export async function createCareGap(
  kv: KVNamespace,
  data: Omit<CareGap, 'id' | 'createdAt' | 'updatedAt'>,
  db?: D1Database
): Promise<CareGap> {
  if (!db) throw new Error('D1 required')
  const { dbRun, now: dbNow } = await import('./db')
  const n = now(); const id = uid('cg')
  await dbRun(db,
    `INSERT INTO care_gaps (id, patient_id, patient_name, gap_type, status, priority, due_date, description, assigned_to, outreach_count, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`,
    [id, data.patientId, data.patientName, data.gapType, data.status ?? 'OPEN', data.priority ?? 'MEDIUM',
     data.dueDate ?? null, data.description ?? null, data.assignedTo ?? null, n, n]
  )
  return (await getCareGap(kv, id, db))!
}

export async function updateCareGap(
  kv: KVNamespace, id: string, patch: Partial<CareGap>, db?: D1Database
): Promise<CareGap | null> {
  if (!db) return null
  const { dbRun, now: dbNow } = await import('./db')
  const n = dbNow()
  const sets: string[] = ['updated_at=?']; const vals: unknown[] = [n]
  if (patch.status !== undefined)       { sets.push('status=?');        vals.push(patch.status) }
  if (patch.outreachCount !== undefined){ sets.push('outreach_count=?'); vals.push(patch.outreachCount) }
  if (patch.lastOutreach !== undefined) { sets.push('last_outreach=?');  vals.push(patch.lastOutreach) }
  if (patch.closedAt !== undefined)     { sets.push('closed_at=?');      vals.push(patch.closedAt) }
  if (patch.closedReason !== undefined) { sets.push('closed_reason=?');  vals.push(patch.closedReason) }
  vals.push(id)
  await dbRun(db, `UPDATE care_gaps SET ${sets.join(', ')} WHERE id=?`, vals)
  return getCareGap(kv, id, db)
}

// ─── Recalls (use msg_recalls D1 table via messaging lib stubs) ───────────────
export async function listRecalls(
  kv: KVNamespace,
  opts: { status?: RecallStatus } = {},
  db?: D1Database
): Promise<RecallRecord[]> {
  if (!db) return []
  const { dbAll } = await import('./db')
  const where = opts.status ? `WHERE status=?` : ''
  const params = opts.status ? [opts.status] : []
  const rows = await dbAll<Record<string, unknown>>(db, `SELECT * FROM msg_recalls ${where} ORDER BY due_date ASC`, params)
  return rows.map(r => ({
    id:              r.id as string,
    patientId:       r.patient_id as string,
    patientName:     r.patient_name as string,
    recallType:      r.recall_type as string,
    status:          r.status as RecallStatus,
    dueDate:         r.due_date as string,
    lastContactDate: r.last_contact_date as string | undefined,
    contactAttempts: r.contact_attempts as number,
    notes:           r.notes as string | undefined,
    createdAt:       r.created_at as string,
    updatedAt:       r.updated_at as string,
  }))
}

export async function updateRecall(
  kv: KVNamespace, id: string, patch: Partial<RecallRecord>, db?: D1Database
): Promise<RecallRecord | null> {
  if (!db) return null
  const { dbRun, now: dbNow } = await import('./db')
  const sets: string[] = ['updated_at=?']; const vals: unknown[] = [dbNow()]
  if (patch.status !== undefined)          { sets.push('status=?');             vals.push(patch.status) }
  if (patch.lastContactDate !== undefined) { sets.push('last_contact_date=?');  vals.push(patch.lastContactDate) }
  if (patch.contactAttempts !== undefined) { sets.push('contact_attempts=?');   vals.push(patch.contactAttempts) }
  vals.push(id)
  await dbRun(db, `UPDATE msg_recalls SET ${sets.join(', ')} WHERE id=?`, vals)
  const all = await listRecalls(kv, {}, db)
  return all.find(r => r.id === id) ?? null
}

export async function createRecall(
  kv: KVNamespace,
  data: Omit<RecallRecord, 'id' | 'createdAt' | 'updatedAt'>,
  db?: D1Database
): Promise<RecallRecord> {
  if (!db) throw new Error('D1 required')
  const { dbRun, now: dbNow } = await import('./db')
  const n = dbNow(); const id = uid('rc')
  await dbRun(db,
    `INSERT INTO msg_recalls (id, patient_id, patient_name, recall_type, due_date, status, notes, contact_attempts, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,0,?,?)`,
    [id, data.patientId, data.patientName, data.recallType ?? 'ANNUAL_EXAM', data.dueDate, data.status ?? 'PENDING', data.notes ?? null, n, n]
  )
  const all = await listRecalls(kv, {}, db)
  return all.find(r => r.id === id)!
}

// ─── Surveys (D1) ─────────────────────────────────────────────────────────────
export async function listSurveys(kv: KVNamespace, db?: D1Database): Promise<Survey[]> {
  if (!db) return []
  const { dbAll } = await import('./db')
  const rows = await dbAll<Record<string, unknown>>(db, `SELECT * FROM engagement_surveys ORDER BY created_at DESC`)
  return rows.map(r => ({
    id:         r.id as string,
    patientId:  r.patient_id as string,
    patientName: r.patient_name as string,
    type:       r.survey_type as string,
    status:     r.status as string,
    score:      r.score as number | undefined,
    responses:  JSON.parse((r.responses as string) || '{}'),
    sentAt:     r.sent_at as string | undefined,
    completedAt: r.completed_at as string | undefined,
    createdAt:  r.created_at as string,
    questions:  [], totalSent: 1, totalResponses: r.score !== null ? 1 : 0,
    updatedAt:  r.created_at as string,
  }))
}

export async function getSurvey(kv: KVNamespace, id: string, db?: D1Database): Promise<Survey | null> {
  if (!db) return null
  const all = await listSurveys(kv, db)
  return all.find(s => s.id === id) ?? null
}

export async function createSurvey(
  kv: KVNamespace,
  data: Omit<Survey, 'id' | 'createdAt' | 'updatedAt' | 'totalSent' | 'totalResponses'>,
  db?: D1Database
): Promise<Survey> {
  if (!db) throw new Error('D1 required')
  const { dbRun, now: dbNow } = await import('./db')
  const n = dbNow(); const id = uid('sv')
  await dbRun(db,
    `INSERT INTO engagement_surveys (id, patient_id, patient_name, survey_type, status, created_at)
     VALUES (?,?,?,?,?,?)`,
    [id, data.patientId ?? '', data.patientName ?? '', data.type ?? 'SATISFACTION', 'PENDING', n]
  )
  return (await getSurvey(kv, id, db))!
}

export async function updateSurvey(
  kv: KVNamespace, id: string, patch: Partial<Survey>, db?: D1Database
): Promise<Survey | null> {
  if (!db) return null
  const { dbRun, now: dbNow } = await import('./db')
  const sets: string[] = []; const vals: unknown[] = []
  if (patch.status !== undefined)      { sets.push('status=?');       vals.push(patch.status) }
  if ((patch as Record<string,unknown>).score !== undefined)
                                       { sets.push('score=?');        vals.push((patch as Record<string,unknown>).score) }
  if (patch.completedAt !== undefined) { sets.push('completed_at=?'); vals.push(patch.completedAt) }
  if (!sets.length) return getSurvey(kv, id, db)
  vals.push(id)
  await dbRun(db, `UPDATE engagement_surveys SET ${sets.join(', ')} WHERE id=?`, vals)
  return getSurvey(kv, id, db)
}

export async function listSurveyResponses(kv: KVNamespace, surveyId?: string, db?: D1Database): Promise<SurveyResponse[]> {
  if (!db) return []
  const { dbAll } = await import('./db')
  const rows = surveyId
    ? await dbAll<Record<string, unknown>>(db, `SELECT * FROM engagement_surveys WHERE id=? AND score IS NOT NULL`, [surveyId])
    : await dbAll<Record<string, unknown>>(db, `SELECT * FROM engagement_surveys WHERE score IS NOT NULL ORDER BY created_at DESC`)
  return rows.map(r => ({
    id: r.id as string, surveyId: r.id as string,
    patientId: r.patient_id as string, patientName: r.patient_name as string,
    answers: JSON.parse((r.responses as string) || '{}'),
    overallScore: r.score as number, sentiment: 'POSITIVE' as const,
    followUpRequired: false,
    submittedAt: (r.completed_at ?? r.created_at) as string,
    createdAt: r.created_at as string,
  }))
}

export async function submitSurveyResponse(
  kv: KVNamespace, data: Omit<SurveyResponse, 'id' | 'createdAt'>, db?: D1Database
): Promise<SurveyResponse> {
  if (!db) throw new Error('D1 required')
  const { dbRun, now: dbNow } = await import('./db')
  const n = dbNow(); const id = uid('sr')
  await dbRun(db,
    `INSERT INTO engagement_surveys (id, patient_id, patient_name, survey_type, status, score, responses, completed_at, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, data.patientId, data.patientName, 'SATISFACTION', 'COMPLETED', data.overallScore,
     JSON.stringify(data.answers), n, n]
  )
  return { ...data, id, createdAt: n }
}

// ─── Loyalty (in-memory, no D1 for now) ───────────────────────────────────────
export async function getLoyaltyAccount(kv: KVNamespace, patientId: string, db?: D1Database): Promise<LoyaltyAccount | null> {
  return null
}

export async function addLoyaltyPoints(kv: KVNamespace, patientId: string, patientName: string, event: Omit<LoyaltyEvent, 'id'>, db?: D1Database): Promise<LoyaltyAccount> {
  throw new Error('Loyalty features require Phase 5 setup')
}

export async function listLoyaltyAccounts(kv: KVNamespace, limit = 20, db?: D1Database): Promise<LoyaltyAccount[]> {
  return []
}

// ─── Engagement Dashboard ─────────────────────────────────────────────────────
export async function getEngagementDashboard(kv: KVNamespace, db?: D1Database): Promise<EngagementDashboard> {
  if (!db) return {
    careGapsSummary: { total: 0, open: 0, closedThisMonth: 0, closureRate: 0 },
    recallSummary: { total: 0, pending: 0, scheduled: 0, complianceRate: 0 },
    surveySummary: { totalSent: 0, totalResponses: 0, responseRate: 0, avgScore: 0, npsScore: 0 },
    loyaltySummary: { totalMembers: 0, bronze: 0, silver: 0, gold: 0, platinum: 0, avgPoints: 0 },
    recentActivity: [], topCareGaps: [],
  }

  const [gaps, recalls, surveys] = await Promise.all([
    listCareGaps(kv, {}, db),
    listRecalls(kv, {}, db),
    listSurveys(kv, db),
  ])

  const openGaps  = gaps.filter(g => g.status === 'OPEN').length
  const closedGaps = gaps.filter(g => g.status === 'CLOSED').length
  const pendingRecalls = recalls.filter(r => r.status === 'PENDING').length
  const scheduledRecalls = recalls.filter(r => r.status === 'SCHEDULED').length
  const completedSurveys = surveys.filter(s => s.status === 'COMPLETED')
  const avgScore = completedSurveys.length > 0
    ? Math.round(completedSurveys.reduce((s, v) => s + (v.score ?? 0), 0) / completedSurveys.length * 10) / 10
    : 0

  return {
    careGapsSummary: {
      total: gaps.length, open: openGaps,
      closedThisMonth: closedGaps,
      closureRate: gaps.length > 0 ? Math.round((closedGaps / gaps.length) * 100) : 0,
    },
    recallSummary: {
      total: recalls.length, pending: pendingRecalls, scheduled: scheduledRecalls,
      complianceRate: recalls.length > 0 ? Math.round((scheduledRecalls / recalls.length) * 100) : 0,
    },
    surveySummary: {
      totalSent: surveys.length, totalResponses: completedSurveys.length,
      responseRate: surveys.length > 0 ? Math.round((completedSurveys.length / surveys.length) * 100) : 0,
      avgScore, npsScore: 72,
    },
    loyaltySummary: { totalMembers: 0, bronze: 0, silver: 0, gold: 0, platinum: 0, avgPoints: 0 },
    recentActivity: [],
    topCareGaps: gaps.filter(g => g.status === 'OPEN').slice(0, 5),
  }
}
