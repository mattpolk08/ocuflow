// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Prior Authorization (Phase D1-11) — D1-backed
// prior_auth_requests → D1 (JSON blobs for documents, notes, history)
// paCriteriaCatalog stays in-memory (static reference data)
// KV param kept for backward-compat but NOT used for data.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  PriorAuthRequest, PAStatus, PAServiceType, PAUrgency, PADecisionReason,
  PADocument, PANote, PAStatusHistory, PeerToPeerRequest, AppealRecord,
  PACriteria, PADashboardStats,
} from '../types/priorauth'
import { dbGet, dbAll, dbRun, now as dbNow } from './db'

// ── PA Criteria Catalog (static, in-memory) ───────────────────────────────────
export const paCriteriaCatalog: PACriteria[] = [
  { serviceType: 'DIAGNOSTIC_IMAGING', serviceCode: '92134', payerId: 'pay-bcbs', requiresPA: true, commonCriteria: ['Diabetic retinopathy documented','Visual acuity documented','Previous treatment history','ICD-10 codes: E11.35x'], documentationRequired: ['Clinical notes','Fundus photos','VA measurements'], typicalTurnaround: '2-5 business days', expeditedAvailable: true },
  { serviceType: 'DIAGNOSTIC_IMAGING', serviceCode: '92250', payerId: 'pay-medicare', requiresPA: true, commonCriteria: ['Medical necessity documented','Not routine screening','ICD-10 must indicate disease'], documentationRequired: ['Physician notes','Previous visit records'], typicalTurnaround: '5-10 business days', expeditedAvailable: false },
  { serviceType: 'SPECIALTY_MEDICATION', serviceCode: 'J0480', payerId: 'pay-aetna', requiresPA: true, commonCriteria: ['AMD diagnosis confirmed','Previous treatment with anti-VEGF','OCT documentation','Visual acuity documented'], documentationRequired: ['OCT images','Fluorescein angiography','Clinical notes'], typicalTurnaround: '3-7 business days', expeditedAvailable: true },
  { serviceType: 'PROCEDURE', serviceCode: '66984', payerId: 'pay-bcbs', requiresPA: true, commonCriteria: ['Cataract grade 2+ documented','Visual acuity < 20/40','Functional impairment documented'], documentationRequired: ['Slit lamp exam notes','Biometry results','VA records'], typicalTurnaround: '5-7 business days', expeditedAvailable: false },
  { serviceType: 'SPECIALTY_MEDICATION', serviceCode: '00079-0709', payerId: 'pay-cigna', requiresPA: true, commonCriteria: ['DED diagnosis confirmed','Failed artificial tears x 3 months','Schirmer test results'], documentationRequired: ['Clinical notes','Previous treatments tried'], typicalTurnaround: '2-3 business days', expeditedAvailable: false },
]

// ── Row mapper ────────────────────────────────────────────────────────────────
function rowToPA(r: Record<string, unknown>): PriorAuthRequest {
  const parse = (v: unknown) => v ? JSON.parse(v as string) : [];
  return {
    id:                  r.id as string,
    requestNumber:       r.request_number as string,
    patientId:           r.patient_id as string,
    patientName:         r.patient_name as string,
    patientDob:          (r.patient_dob as string) ?? '',
    insurancePlan:       '',
    memberId:            (r.patient_member_id as string) ?? '',
    groupNumber:         '',
    payerId:             r.payer_id as string,
    payerName:           r.payer_name as string,
    providerId:          r.provider_id as string,
    providerName:        r.provider_name as string,
    providerNpi:         '',
    serviceType:         r.service_type as PAServiceType,
    serviceCode:         (r.service_code as string) ?? '',
    serviceDescription:  (r.service_description as string) ?? '',
    icdCodes:            parse(r.diagnosis_codes),
    urgency:             r.urgency as PAUrgency,
    status:              r.status as PAStatus,
    submittedDate:       r.submitted_date as string | undefined,
    decisionDate:        r.decision_date as string | undefined,
    expirationDate:      r.expiration_date as string | undefined,
    decisionReason:      r.decision_reason as PADecisionReason | undefined,
    authorizationNumber: r.auth_number as string | undefined,
    unitsApproved:       r.units_approved as number | undefined,
    documents:           parse(r.documents),
    notes:               parse(r.notes),
    statusHistory:       parse(r.status_history),
    peerToPeer:          r.peer_to_peer ? JSON.parse(r.peer_to_peer as string) : undefined,
    appeal:              r.appeal ? JSON.parse(r.appeal as string) : undefined,
    criteriaMet:         parse(r.criteria_met),
    createdAt:           r.created_at as string,
    updatedAt:           r.updated_at as string,
  };
}

// ── seedPARequests ────────────────────────────────────────────────────────────
export async function seedPARequests(kv: KVNamespace, db?: D1Database): Promise<void> { /* migration */ }

// ── listPARequests ────────────────────────────────────────────────────────────
export async function listPARequests(
  kv: KVNamespace,
  filters: { status?: string; patientId?: string; providerId?: string; serviceType?: string; urgency?: string } = {},
  db?: D1Database
): Promise<PriorAuthRequest[]> {
  if (!db) return [];
  const conditions: string[] = [];
  const params: unknown[]    = [];
  if (filters.status)      { conditions.push('status=?');       params.push(filters.status); }
  if (filters.patientId)   { conditions.push('patient_id=?');   params.push(filters.patientId); }
  if (filters.providerId)  { conditions.push('provider_id=?');  params.push(filters.providerId); }
  if (filters.serviceType) { conditions.push('service_type=?'); params.push(filters.serviceType); }
  if (filters.urgency)     { conditions.push('urgency=?');      params.push(filters.urgency); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM prior_auth_requests ${where} ORDER BY updated_at DESC`, params
  );
  return rows.map(rowToPA);
}

// ── getPARequest ──────────────────────────────────────────────────────────────
export async function getPARequest(kv: KVNamespace, id: string, db?: D1Database): Promise<PriorAuthRequest | null> {
  if (!db) return null;
  const row = await dbGet<Record<string, unknown>>(db,
    `SELECT * FROM prior_auth_requests WHERE id=?`, [id]
  );
  return row ? rowToPA(row) : null;
}

// ── createPARequest ───────────────────────────────────────────────────────────
export async function createPARequest(
  kv: KVNamespace,
  input: Partial<PriorAuthRequest>,
  db?: D1Database
): Promise<PriorAuthRequest> {
  if (!db) throw new Error('D1 required');
  const now = dbNow();
  const id  = `pa-${Date.now().toString(36)}`;
  const reqNum = `PA-${new Date().getFullYear()}-${String(Date.now() % 10000).padStart(4, '0')}`;
  const history: PAStatusHistory[] = [{ status: 'DRAFT', changedAt: now, changedBy: input.providerId ?? 'system' }];

  await dbRun(db,
    `INSERT INTO prior_auth_requests
       (id, request_number, patient_id, patient_name, patient_dob, patient_member_id,
        provider_id, provider_name, payer_id, payer_name,
        service_type, service_code, service_description, diagnosis_codes,
        urgency, status, notes, status_history, criteria_met, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, reqNum,
      input.patientId ?? '', input.patientName ?? '',
      input.patientDob ?? null, input.memberId ?? null,
      input.providerId ?? '', input.providerName ?? '',
      input.payerId ?? '', input.payerName ?? '',
      input.serviceType ?? 'DRUG',
      input.serviceCode ?? null, input.serviceDescription ?? null,
      JSON.stringify(input.icdCodes ?? []),
      input.urgency ?? 'ROUTINE', 'DRAFT',
      '[]', JSON.stringify(history), '[]',
      now, now,
    ]
  );
  return (await getPARequest(kv, id, db))!;
}

// ── updatePAStatus ────────────────────────────────────────────────────────────
export async function updatePAStatus(
  kv: KVNamespace,
  id: string,
  status: PAStatus,
  meta: { changedBy: string; reason?: PADecisionReason; notes?: string; authNumber?: string },
  db?: D1Database
): Promise<PriorAuthRequest | null> {
  if (!db) return null;
  const req = await getPARequest(kv, id, db);
  if (!req) return null;

  const now = dbNow();
  const histEntry: PAStatusHistory = { status, changedAt: now, changedBy: meta.changedBy, reason: meta.reason, notes: meta.notes };
  const newHistory = [...req.statusHistory, histEntry];

  const sets = ['status=?', 'updated_at=?', 'status_history=?'];
  const vals: unknown[] = [status, now, JSON.stringify(newHistory)];

  if (status === 'SUBMITTED')  { sets.push('submitted_date=?'); vals.push(now.slice(0, 10)); }
  if (['APPROVED','DENIED'].includes(status)) { sets.push('decision_date=?'); vals.push(now.slice(0, 10)); }
  if (meta.authNumber)         { sets.push('auth_number=?');   vals.push(meta.authNumber); }
  if (meta.reason)             { sets.push('decision_reason=?'); vals.push(meta.reason); }
  if (meta.notes) {
    const note: PANote = { id: `pan-${Date.now().toString(36)}`, authorId: meta.changedBy, authorName: meta.changedBy, content: meta.notes, isInternal: true, createdAt: now, isPANote: true };
    sets.push('notes=?'); vals.push(JSON.stringify([...req.notes, note]));
  }

  vals.push(id);
  await dbRun(db, `UPDATE prior_auth_requests SET ${sets.join(', ')} WHERE id=?`, vals);
  return getPARequest(kv, id, db);
}

// ── addPADocument ─────────────────────────────────────────────────────────────
export async function addPADocument(
  kv: KVNamespace, id: string, doc: Omit<PADocument, 'id' | 'uploadedAt'>, db?: D1Database
): Promise<PriorAuthRequest | null> {
  if (!db) return null;
  const req = await getPARequest(kv, id, db);
  if (!req) return null;
  const d: PADocument = { ...doc, id: `pdoc-${Date.now().toString(36)}`, uploadedAt: dbNow() };
  await dbRun(db, `UPDATE prior_auth_requests SET documents=?, updated_at=? WHERE id=?`,
    [JSON.stringify([...req.documents, d]), dbNow(), id]);
  return getPARequest(kv, id, db);
}

// ── addPANote ─────────────────────────────────────────────────────────────────
export async function addPANote(
  kv: KVNamespace, id: string,
  note: Omit<PANote, 'id' | 'createdAt'>, db?: D1Database
): Promise<PriorAuthRequest | null> {
  if (!db) return null;
  const req = await getPARequest(kv, id, db);
  if (!req) return null;
  const n: PANote = { ...note, id: `pan-${Date.now().toString(36)}`, createdAt: dbNow() };
  await dbRun(db, `UPDATE prior_auth_requests SET notes=?, updated_at=? WHERE id=?`,
    [JSON.stringify([...req.notes, n]), dbNow(), id]);
  return getPARequest(kv, id, db);
}

// ── submitPeerToPeer ──────────────────────────────────────────────────────────
export async function submitPeerToPeer(
  kv: KVNamespace, id: string,
  data: Omit<PeerToPeerRequest, 'id' | 'requestedAt'>, db?: D1Database
): Promise<PriorAuthRequest | null> {
  if (!db) return null;
  const p2p: PeerToPeerRequest = { ...data, id: `p2p-${Date.now().toString(36)}`, requestedAt: dbNow() };
  await dbRun(db, `UPDATE prior_auth_requests SET peer_to_peer=?, updated_at=? WHERE id=?`,
    [JSON.stringify(p2p), dbNow(), id]);
  return getPARequest(kv, id, db);
}

// ── submitAppeal ──────────────────────────────────────────────────────────────
export async function submitAppeal(
  kv: KVNamespace, id: string,
  data: Omit<AppealRecord, 'id' | 'submittedAt'>, db?: D1Database
): Promise<PriorAuthRequest | null> {
  if (!db) return null;
  const appeal: AppealRecord = { ...data, id: `appeal-${Date.now().toString(36)}`, submittedAt: dbNow() };
  await dbRun(db, `UPDATE prior_auth_requests SET appeal=?, status='APPEALED', updated_at=? WHERE id=?`,
    [JSON.stringify(appeal), dbNow(), id]);
  return getPARequest(kv, id, db);
}

// ── getPADashboard ────────────────────────────────────────────────────────────
export async function getPADashboard(kv: KVNamespace, db?: D1Database): Promise<PADashboardStats> {
  if (!db) return {
    total: 0, draft: 0, submitted: 0, approved: 0, denied: 0, appealed: 0,
    pendingUrgent: 0, avgTurnaroundDays: 0,
    approvalRate: 0, denialRate: 0,
    byServiceType: [], recentRequests: [],
  };

  const rows = await dbAll<Record<string, unknown>>(db, `SELECT * FROM prior_auth_requests ORDER BY updated_at DESC`);
  const all  = rows.map(rowToPA);

  const submitted = all.filter(r => r.submittedDate && r.decisionDate);
  const avgDays = submitted.length > 0
    ? Math.round(submitted.reduce((s, r) => {
        const diff = new Date(r.decisionDate!).getTime() - new Date(r.submittedDate!).getTime();
        return s + diff / 86400000;
      }, 0) / submitted.length)
    : 0;

  const approved = all.filter(r => ['APPROVED','PARTIAL_APPROVAL'].includes(r.status)).length;
  const denied   = all.filter(r => r.status === 'DENIED').length;
  const decided  = approved + denied;

  const byType: Record<string, number> = {};
  all.forEach(r => { byType[r.serviceType] = (byType[r.serviceType] ?? 0) + 1; });

  return {
    total:            all.length,
    draft:            all.filter(r => r.status === 'DRAFT').length,
    submitted:        all.filter(r => ['SUBMITTED','IN_REVIEW'].includes(r.status)).length,
    approved,
    denied,
    appealed:         all.filter(r => r.status === 'APPEALED').length,
    pendingUrgent:    all.filter(r => r.urgency === 'URGENT' && !['APPROVED','DENIED','VOIDED'].includes(r.status)).length,
    avgTurnaroundDays: avgDays,
    approvalRate:     decided > 0 ? Math.round((approved / decided) * 100) : 0,
    denialRate:       decided > 0 ? Math.round((denied / decided) * 100) : 0,
    byServiceType:    Object.entries(byType).map(([type, count]) => ({ type, count })),
    recentRequests:   all.slice(0, 10),
  };
}

// ── Aliases and stubs for backward-compat with routes ────────────────────────
export const schedulePeerToPeer = submitPeerToPeer;

export async function deletePARequest(kv: KVNamespace, id: string, db?: D1Database): Promise<boolean> {
  if (!db) return false;
  const req = await getPARequest(kv, id, db);
  if (!req || req.status !== 'DRAFT') return false;
  await dbRun(db, `DELETE FROM prior_auth_requests WHERE id=?`, [id]);
  return true;
}

export async function lookupPACriteria(
  kv: KVNamespace,
  serviceType: string,
  serviceCode: string,
  payerId: string,
  db?: D1Database
): Promise<typeof paCriteriaCatalog[0] | null> {
  return paCriteriaCatalog.find(c =>
    c.serviceType === serviceType &&
    (c.serviceCode === serviceCode || !c.serviceCode) &&
    (c.payerId === payerId || !c.payerId)
  ) ?? null;
}

export const VALID_PA_STATUSES = [
  'DRAFT','SUBMITTED','IN_REVIEW','APPROVED','PARTIAL_APPROVAL',
  'DENIED','APPEALED','APPEAL_APPROVED','APPEAL_DENIED','WITHDRAWN','EXPIRED','VOIDED',
];
export const VALID_SERVICE_TYPES = [
  'DRUG','PROCEDURE','DURABLE_MEDICAL_EQUIPMENT',
  'DIAGNOSTIC_IMAGING','SPECIALTY_CONSULTATION','INFUSION','BEHAVIORAL_HEALTH','OTHER',
];
export const VALID_URGENCY = ['ROUTINE','URGENT','EXPEDITED'];
