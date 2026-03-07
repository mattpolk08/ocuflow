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
export async function ensureEngagementSeed(kv: KVNamespace): Promise<void> {
  if (await kv.get(K.seeded)) return

  // Seed care gaps
  const cgIds: string[] = []
  for (const gap of SEED_CARE_GAPS) {
    const id = uid('cg'); const t = now()
    await kvPut(kv, K.careGap(id), { ...gap, id, createdAt: t, updatedAt: t })
    cgIds.push(id)
  }
  await kvPut(kv, K.careGapIdx(), cgIds)

  // Seed recalls
  const rcIds: string[] = []
  for (const recall of SEED_RECALLS) {
    const id = uid('rc'); const t = now()
    await kvPut(kv, K.recall(id), { ...recall, id, createdAt: t, updatedAt: t })
    rcIds.push(id)
  }
  await kvPut(kv, K.recallIdx(), rcIds)

  // Seed surveys
  const svIds: string[] = []
  for (const survey of SEED_SURVEYS) {
    const id = uid('sv'); const t = now()
    await kvPut(kv, K.survey(id), { ...survey, id, createdAt: t, updatedAt: t })
    svIds.push(id)
  }
  await kvPut(kv, K.surveyIdx(), svIds)

  // Seed sample survey responses
  const svRespIds: string[] = []
  const sampleResponses: Omit<SurveyResponse, 'id' | 'createdAt'>[] = [
    { surveyId: svIds[0], patientId: 'pat-001', patientName: 'Maria Rodriguez',
      answers: { q1: 5, q2: 4, q3: 5, q4: 'YES', q5: 'Dr. Chen was wonderful and very thorough!' },
      npsScore: undefined, overallScore: 4.7, sentiment: 'POSITIVE', followUpRequired: false, submittedAt: daysAgo(2) },
    { surveyId: svIds[0], patientId: 'pat-002', patientName: 'James Thompson',
      answers: { q1: 3, q2: 2, q3: 4, q4: 'NO', q5: 'Wait time was too long.' },
      npsScore: undefined, overallScore: 3.0, sentiment: 'NEUTRAL', followUpRequired: true, followUpReason: 'Low wait time score + would not recommend', submittedAt: daysAgo(5) },
    { surveyId: svIds[1], patientId: 'pat-003', patientName: 'Sarah Johnson',
      answers: { q1: 9, q2: 'Great communication from staff' },
      npsScore: 9, overallScore: 9, sentiment: 'POSITIVE', followUpRequired: false, submittedAt: daysAgo(1) },
    { surveyId: svIds[1], patientId: 'pat-004', patientName: 'Michael Chen',
      answers: { q1: 10, q2: 'Best eye doctor I\'ve ever been to!' },
      npsScore: 10, overallScore: 10, sentiment: 'POSITIVE', followUpRequired: false, submittedAt: daysAgo(3) },
    { surveyId: svIds[2], patientId: 'pat-005', patientName: 'Emily Williams',
      answers: { q1: 4, q2: 5, q3: 'YES' },
      npsScore: undefined, overallScore: 4.5, sentiment: 'POSITIVE', followUpRequired: false, submittedAt: daysAgo(4) },
  ]
  for (const resp of sampleResponses) {
    const id = uid('sr'); const t = now()
    await kvPut(kv, K.surveyResponse(id), { ...resp, id, createdAt: t })
    svRespIds.push(id)
  }
  await kvPut(kv, K.surveyRespIdx(), svRespIds)

  // Seed loyalty accounts
  const loyaltyPats = [
    { patientId: 'pat-001', patientName: 'Maria Rodriguez', totalPoints: 450, lifetimePoints: 650 },
    { patientId: 'pat-003', patientName: 'Sarah Johnson',   totalPoints: 280, lifetimePoints: 280 },
    { patientId: 'pat-005', patientName: 'Emily Williams',  totalPoints: 620, lifetimePoints: 820 },
    { patientId: 'pat-002', patientName: 'James Thompson',  totalPoints: 150, lifetimePoints: 200 },
  ]
  const loyaltyIds: string[] = []
  for (const p of loyaltyPats) {
    const tier = p.totalPoints >= 500 ? 'GOLD' : p.totalPoints >= 250 ? 'SILVER' : 'BRONZE'
    const account: LoyaltyAccount = {
      ...p, tier: tier as LoyaltyAccount['tier'],
      history: [
        { id: uid('le'), type: 'VISIT', points: 100, description: 'Annual eye exam', date: daysAgo(30) },
        { id: uid('le'), type: 'SURVEY_COMPLETED', points: 25, description: 'Post-visit survey', date: daysAgo(29) },
        ...(p.lifetimePoints > p.totalPoints ? [{ id: uid('le'), type: 'REDEEMED' as const, points: -(p.lifetimePoints - p.totalPoints), description: 'Redeemed for optical discount', date: daysAgo(15) }] : []),
      ],
      createdAt: daysAgo(365), updatedAt: now(),
    }
    await kvPut(kv, K.loyaltyPts(p.patientId), account)
    loyaltyIds.push(p.patientId)
  }
  await kvPut(kv, K.loyaltyIdx(), loyaltyIds)

  await kvPut(kv, K.seeded, true)
}

// ─── Care Gap CRUD ────────────────────────────────────────────────────────────
export async function listCareGaps(kv: KVNamespace, opts: { status?: CareGapStatus; priority?: string; gapType?: CareGapType } = {}): Promise<CareGap[]> {
  await ensureEngagementSeed(kv)
  const ids = (await kvGet<string[]>(kv, K.careGapIdx())) ?? []
  const all = (await Promise.all(ids.map(id => kvGet<CareGap>(kv, K.careGap(id))))).filter(Boolean) as CareGap[]
  return all
    .filter(g => !opts.status   || g.status   === opts.status)
    .filter(g => !opts.priority || g.priority === opts.priority)
    .filter(g => !opts.gapType  || g.gapType  === opts.gapType)
    .sort((a, b) => b.daysOverdue - a.daysOverdue)
}

export async function getCareGap(kv: KVNamespace, id: string): Promise<CareGap | null> {
  return kvGet<CareGap>(kv, K.careGap(id))
}

export async function createCareGap(kv: KVNamespace, data: Omit<CareGap, 'id' | 'createdAt' | 'updatedAt'>): Promise<CareGap> {
  await ensureEngagementSeed(kv)
  const id = uid('cg'); const t = now()
  const gap: CareGap = { ...data, id, createdAt: t, updatedAt: t }
  await kvPut(kv, K.careGap(id), gap)
  const ids = (await kvGet<string[]>(kv, K.careGapIdx())) ?? []
  await kvPut(kv, K.careGapIdx(), [id, ...ids])
  return gap
}

export async function updateCareGap(kv: KVNamespace, id: string, patch: Partial<CareGap>): Promise<CareGap | null> {
  const gap = await kvGet<CareGap>(kv, K.careGap(id)); if (!gap) return null
  const updated: CareGap = { ...gap, ...patch, id, updatedAt: now() }
  await kvPut(kv, K.careGap(id), updated); return updated
}

// ─── Recall CRUD ──────────────────────────────────────────────────────────────
export async function listRecalls(kv: KVNamespace, opts: { status?: RecallStatus } = {}): Promise<RecallRecord[]> {
  await ensureEngagementSeed(kv)
  const ids = (await kvGet<string[]>(kv, K.recallIdx())) ?? []
  const all = (await Promise.all(ids.map(id => kvGet<RecallRecord>(kv, K.recall(id))))).filter(Boolean) as RecallRecord[]
  return all.filter(r => !opts.status || r.status === opts.status)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

export async function updateRecall(kv: KVNamespace, id: string, patch: Partial<RecallRecord>): Promise<RecallRecord | null> {
  const recall = await kvGet<RecallRecord>(kv, K.recall(id)); if (!recall) return null
  const updated: RecallRecord = { ...recall, ...patch, id, updatedAt: now() }
  await kvPut(kv, K.recall(id), updated); return updated
}

export async function createRecall(kv: KVNamespace, data: Omit<RecallRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<RecallRecord> {
  await ensureEngagementSeed(kv)
  const id = uid('rc'); const t = now()
  const record: RecallRecord = { ...data, id, createdAt: t, updatedAt: t }
  await kvPut(kv, K.recall(id), record)
  const ids = (await kvGet<string[]>(kv, K.recallIdx())) ?? []
  await kvPut(kv, K.recallIdx(), [id, ...ids])
  return record
}

// ─── Survey CRUD ──────────────────────────────────────────────────────────────
export async function listSurveys(kv: KVNamespace): Promise<Survey[]> {
  await ensureEngagementSeed(kv)
  const ids = (await kvGet<string[]>(kv, K.surveyIdx())) ?? []
  return (await Promise.all(ids.map(id => kvGet<Survey>(kv, K.survey(id))))).filter(Boolean) as Survey[]
}

export async function getSurvey(kv: KVNamespace, id: string): Promise<Survey | null> {
  return kvGet<Survey>(kv, K.survey(id))
}

export async function createSurvey(kv: KVNamespace, data: Omit<Survey, 'id' | 'createdAt' | 'updatedAt' | 'totalSent' | 'totalResponses'>): Promise<Survey> {
  await ensureEngagementSeed(kv)
  const id = uid('sv'); const t = now()
  const survey: Survey = { ...data, id, totalSent: 0, totalResponses: 0, createdAt: t, updatedAt: t }
  await kvPut(kv, K.survey(id), survey)
  const ids = (await kvGet<string[]>(kv, K.surveyIdx())) ?? []
  await kvPut(kv, K.surveyIdx(), [id, ...ids])
  return survey
}

export async function updateSurvey(kv: KVNamespace, id: string, patch: Partial<Survey>): Promise<Survey | null> {
  const survey = await kvGet<Survey>(kv, K.survey(id)); if (!survey) return null
  const updated: Survey = { ...survey, ...patch, id, updatedAt: now() }
  await kvPut(kv, K.survey(id), updated); return updated
}

export async function listSurveyResponses(kv: KVNamespace, surveyId?: string): Promise<SurveyResponse[]> {
  await ensureEngagementSeed(kv)
  const ids = (await kvGet<string[]>(kv, K.surveyRespIdx())) ?? []
  const all = (await Promise.all(ids.map(id => kvGet<SurveyResponse>(kv, K.surveyResponse(id))))).filter(Boolean) as SurveyResponse[]
  return surveyId ? all.filter(r => r.surveyId === surveyId) : all
}

export async function submitSurveyResponse(kv: KVNamespace, data: Omit<SurveyResponse, 'id' | 'createdAt'>): Promise<SurveyResponse> {
  await ensureEngagementSeed(kv)
  const id = uid('sr'); const t = now()
  const resp: SurveyResponse = { ...data, id, createdAt: t }
  await kvPut(kv, K.surveyResponse(id), resp)
  const ids = (await kvGet<string[]>(kv, K.surveyRespIdx())) ?? []
  await kvPut(kv, K.surveyRespIdx(), [id, ...ids])
  // Update survey aggregates
  const survey = await kvGet<Survey>(kv, K.survey(data.surveyId))
  if (survey) {
    const allResps = await listSurveyResponses(kv, data.surveyId)
    const scored   = allResps.filter(r => r.overallScore !== undefined)
    const avgScore = scored.length ? scored.reduce((s, r) => s + (r.overallScore ?? 0), 0) / scored.length : undefined
    await kvPut(kv, K.survey(data.surveyId), { ...survey, totalResponses: allResps.length, averageScore: avgScore, updatedAt: t })
  }
  return resp
}

// ─── Loyalty ──────────────────────────────────────────────────────────────────
export async function getLoyaltyAccount(kv: KVNamespace, patientId: string): Promise<LoyaltyAccount | null> {
  await ensureEngagementSeed(kv)
  return kvGet<LoyaltyAccount>(kv, K.loyaltyPts(patientId))
}

export async function addLoyaltyPoints(kv: KVNamespace, patientId: string, patientName: string, event: Omit<LoyaltyEvent, 'id'>): Promise<LoyaltyAccount> {
  await ensureEngagementSeed(kv)
  const existing = await kvGet<LoyaltyAccount>(kv, K.loyaltyPts(patientId))
  const t = now()
  const le: LoyaltyEvent = { ...event, id: uid('le') }
  const newTotal    = (existing?.totalPoints    ?? 0) + event.points
  const newLifetime = (existing?.lifetimePoints ?? 0) + Math.max(event.points, 0)
  const tier: LoyaltyAccount['tier'] = newTotal >= 1000 ? 'PLATINUM' : newTotal >= 500 ? 'GOLD' : newTotal >= 250 ? 'SILVER' : 'BRONZE'
  const account: LoyaltyAccount = {
    patientId, patientName,
    totalPoints:    newTotal,
    lifetimePoints: newLifetime,
    tier,
    history: [le, ...(existing?.history ?? [])].slice(0, 50),
    createdAt: existing?.createdAt ?? t,
    updatedAt: t,
  }
  await kvPut(kv, K.loyaltyPts(patientId), account)
  if (!existing) {
    const ids = (await kvGet<string[]>(kv, K.loyaltyIdx())) ?? []
    await kvPut(kv, K.loyaltyIdx(), [patientId, ...ids])
  }
  return account
}

export async function listLoyaltyAccounts(kv: KVNamespace, limit = 20): Promise<LoyaltyAccount[]> {
  await ensureEngagementSeed(kv)
  const ids = (await kvGet<string[]>(kv, K.loyaltyIdx())) ?? []
  const all = (await Promise.all(ids.slice(0, 100).map(id => kvGet<LoyaltyAccount>(kv, K.loyaltyPts(id))))).filter(Boolean) as LoyaltyAccount[]
  return all.sort((a, b) => b.totalPoints - a.totalPoints).slice(0, limit)
}

// ─── Dashboard aggregation ────────────────────────────────────────────────────
export async function getEngagementDashboard(kv: KVNamespace): Promise<EngagementDashboard> {
  await ensureEngagementSeed(kv)

  const [gaps, recalls, surveys, responses, loyalty] = await Promise.all([
    listCareGaps(kv),
    listRecalls(kv),
    listSurveys(kv),
    listSurveyResponses(kv),
    listLoyaltyAccounts(kv, 5),
  ])

  const openGaps    = gaps.filter(g => g.status === 'OPEN' || g.status === 'OUTREACH_SENT')
  const highPriGaps = gaps.filter(g => g.priority === 'HIGH' && g.status === 'OPEN')
  const avgOverdue  = openGaps.length ? Math.round(openGaps.reduce((s, g) => s + g.daysOverdue, 0) / openGaps.length) : 0

  const pendingRecalls   = recalls.filter(r => r.status === 'PENDING').length
  const contactedRecalls = recalls.filter(r => r.status === 'CONTACTED').length
  const scheduledRecalls = recalls.filter(r => r.status === 'SCHEDULED').length
  const completedRecalls = recalls.filter(r => r.status === 'COMPLETED').length
  const completionRate   = recalls.length ? Math.round(completedRecalls / recalls.length * 100) : 0

  const totalSent    = surveys.reduce((s, sv) => s + sv.totalSent, 0)
  const totalResps   = surveys.reduce((s, sv) => s + sv.totalResponses, 0)
  const responseRate = totalSent ? Math.round(totalResps / totalSent * 100) : 0
  const npsResponses = responses.filter(r => r.npsScore !== undefined)
  const avgNps       = npsResponses.length ? Math.round(npsResponses.reduce((s, r) => s + (r.npsScore ?? 0), 0) / npsResponses.length * 10) / 10 : 0
  const recentResps  = responses.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)).slice(0, 5)

  const loyaltyIds = (await kvGet<string[]>(kv, K.loyaltyIdx())) ?? []

  // Care gaps by type
  const byType = new Map<CareGapType, { count: number; highPriority: number }>()
  for (const g of gaps) {
    const e = byType.get(g.gapType) ?? { count: 0, highPriority: 0 }
    e.count++
    if (g.priority === 'HIGH') e.highPriority++
    byType.set(g.gapType, e)
  }

  return {
    careGaps: { total: gaps.length, open: openGaps.length, scheduled: gaps.filter(g => g.status === 'SCHEDULED').length, highPriority: highPriGaps.length, avgDaysOverdue: avgOverdue },
    recall:   { total: recalls.length, pending: pendingRecalls, contacted: contactedRecalls, scheduled: scheduledRecalls, completionRate },
    surveys:  { totalSent, totalResponses: totalResps, responseRate, avgNps, recentResponses: recentResps },
    loyalty:  { totalEnrolled: loyaltyIds.length, activeThisMonth: Math.min(loyaltyIds.length, 12), topPatients: loyalty },
    careGapsByType: Array.from(byType.entries()).map(([type, v]) => ({ type, ...v })).sort((a, b) => b.count - a.count),
  }
}
