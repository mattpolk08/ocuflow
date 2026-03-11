// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Telehealth (Phase D1-10) — D1-backed
// telehealth_visits → D1 (JSON blobs for complex nested data)
// KV param kept for backward-compat but NOT used for data.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  TelehealthVisit, VisitStatus, VisitType, Urgency,
  PreVisitQuestionnaire, ProviderReview, InfoRequest,
  VisitMessage, TelehealthDashboard, ReviewPrescription,
} from '../types/telehealth'
import { dbGet, dbAll, dbRun, now as dbNow } from './db'

// ── Row mapper ────────────────────────────────────────────────────────────────
function rowToVisit(r: Record<string, unknown>): TelehealthVisit {
  const parse = (v: unknown) => v ? JSON.parse(v as string) : undefined;
  return {
    id:              r.id as string,
    patientId:       r.patient_id as string,
    patientName:     r.patient_name as string,
    patientEmail:    r.patient_email as string | undefined,
    patientPhone:    r.patient_phone as string | undefined,
    providerId:      r.provider_id as string | undefined,
    providerName:    r.provider_name as string | undefined,
    visitType:       r.visit_type as VisitType,
    status:          r.status as VisitStatus,
    urgency:         r.urgency as Urgency,
    chiefComplaint:  r.chief_complaint as string,
    scheduledFor:    r.scheduled_for as string | undefined,
    startedAt:       r.started_at as string | undefined,
    completedAt:     r.completed_at as string | undefined,
    cancelledAt:     r.cancelled_at as string | undefined,
    cancelReason:    r.cancel_reason as string | undefined,
    questionnaire:   parse(r.questionnaire),
    providerReview:  parse(r.provider_review),
    messages:        parse(r.messages) ?? [],
    infoRequests:    parse(r.info_requests) ?? [],
    prescriptions:   parse(r.prescriptions) ?? [],
    meetingUrl:      r.meeting_url as string | undefined,
    meetingId:       r.meeting_id as string | undefined,
    durationMinutes: r.duration_minutes as number | undefined,
    createdAt:       r.created_at as string,
    updatedAt:       r.updated_at as string,
  };
}

// ── ensureTelehealthSeed ───────────────────────────────────────────────────────
export async function ensureTelehealthSeed(kv: KVNamespace, db?: D1Database): Promise<void> { /* migration */ }

// ── listVisits ────────────────────────────────────────────────────────────────
export async function listVisits(
  kv: KVNamespace,
  filters?: {
    patientId?: string;
    providerId?: string;
    status?: VisitStatus;
    urgency?: Urgency;
    limit?: number;
  },
  db?: D1Database
): Promise<TelehealthVisit[]> {
  if (!db) return [];
  const conditions: string[] = [];
  const params: unknown[]    = [];
  if (filters?.patientId)  { conditions.push('patient_id=?');  params.push(filters.patientId); }
  if (filters?.providerId) { conditions.push('provider_id=?'); params.push(filters.providerId); }
  if (filters?.status)     { conditions.push('status=?');      params.push(filters.status); }
  if (filters?.urgency)    { conditions.push('urgency=?');     params.push(filters.urgency); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters?.limit ?? 50;
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM telehealth_visits ${where} ORDER BY created_at DESC LIMIT ?`,
    [...params, limit]
  );
  return rows.map(rowToVisit);
}

// ── getVisit ──────────────────────────────────────────────────────────────────
export async function getVisit(kv: KVNamespace, id: string, db?: D1Database): Promise<TelehealthVisit | null> {
  if (!db) return null;
  const row = await dbGet<Record<string, unknown>>(db,
    `SELECT * FROM telehealth_visits WHERE id=?`, [id]
  );
  return row ? rowToVisit(row) : null;
}

// ── createVisit ───────────────────────────────────────────────────────────────
export async function createVisit(
  kv: KVNamespace,
  data: Pick<TelehealthVisit, 'patientId' | 'patientName' | 'visitType' | 'urgency' | 'chiefComplaint'> &
        Partial<TelehealthVisit>,
  db?: D1Database
): Promise<TelehealthVisit> {
  if (!db) throw new Error('D1 required');
  const now = dbNow();
  const id  = `tele-${Date.now().toString(36)}`;
  await dbRun(db,
    `INSERT INTO telehealth_visits
       (id, patient_id, patient_name, patient_email, patient_phone,
        provider_id, provider_name, visit_type, status, urgency,
        chief_complaint, scheduled_for, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, data.patientId, data.patientName,
      data.patientEmail ?? null, data.patientPhone ?? null,
      data.providerId ?? null, data.providerName ?? null,
      data.visitType, data.status ?? 'INTAKE_PENDING', data.urgency,
      data.chiefComplaint,
      data.scheduledFor ?? null,
      now, now,
    ]
  );
  return (await getVisit(kv, id, db))!;
}

// ── updateVisitStatus ─────────────────────────────────────────────────────────
export async function updateVisitStatus(
  kv: KVNamespace,
  id: string,
  status: VisitStatus,
  userId: string,
  db?: D1Database
): Promise<TelehealthVisit | null> {
  if (!db) return null;
  const now = dbNow();
  const extra: Record<string, string> = {};
  if (status === 'COMPLETED')   extra.completed_at = now;
  if (status === 'CANCELLED')   extra.cancelled_at  = now;
  if (status === 'UNDER_REVIEW') extra.started_at   = now;

  const sets = ['status=?', 'updated_at=?', ...Object.keys(extra).map(k => `${k}=?`)];
  const vals = [status, now, ...Object.values(extra), id];
  await dbRun(db, `UPDATE telehealth_visits SET ${sets.join(', ')} WHERE id=?`, vals);
  return getVisit(kv, id, db);
}

// ── assignVisit ───────────────────────────────────────────────────────────────
export async function assignVisit(
  kv: KVNamespace,
  id: string,
  providerId: string,
  providerName: string,
  db?: D1Database
): Promise<TelehealthVisit | null> {
  if (!db) return null;
  await dbRun(db,
    `UPDATE telehealth_visits SET provider_id=?, provider_name=?, status='UNDER_REVIEW', updated_at=? WHERE id=?`,
    [providerId, providerName, dbNow(), id]
  );
  return getVisit(kv, id, db);
}

// ── submitQuestionnaire ───────────────────────────────────────────────────────
export async function submitQuestionnaire(
  kv: KVNamespace,
  id: string,
  data: PreVisitQuestionnaire,
  db?: D1Database
): Promise<TelehealthVisit | null> {
  if (!db) return null;
  await dbRun(db,
    `UPDATE telehealth_visits
       SET questionnaire=?, status='INTAKE_COMPLETE', updated_at=?
     WHERE id=? AND status='INTAKE_PENDING'`,
    [JSON.stringify(data), dbNow(), id]
  );
  return getVisit(kv, id, db);
}

// ── submitReview ──────────────────────────────────────────────────────────────
export async function submitReview(
  kv: KVNamespace,
  id: string,
  review: ProviderReview,
  db?: D1Database
): Promise<TelehealthVisit | null> {
  if (!db) return null;
  const now = dbNow();
  await dbRun(db,
    `UPDATE telehealth_visits
       SET provider_review=?, status='COMPLETED', completed_at=?, updated_at=?
     WHERE id=?`,
    [JSON.stringify(review), now, now, id]
  );
  return getVisit(kv, id, db);
}

// ── addVisitMessage ───────────────────────────────────────────────────────────
export async function addVisitMessage(
  kv: KVNamespace,
  id: string,
  message: Omit<VisitMessage, 'id' | 'sentAt'>,
  db?: D1Database
): Promise<TelehealthVisit | null> {
  if (!db) return null;
  const visit = await getVisit(kv, id, db);
  if (!visit) return null;
  const msg: VisitMessage = {
    ...message,
    id: `vmsg-${Date.now().toString(36)}`,
    sentAt: dbNow(),
  };
  await dbRun(db,
    `UPDATE telehealth_visits SET messages=?, updated_at=? WHERE id=?`,
    [JSON.stringify([...visit.messages, msg]), dbNow(), id]
  );
  return getVisit(kv, id, db);
}

// ── requestInfo ───────────────────────────────────────────────────────────────
export async function requestInfo(
  kv: KVNamespace,
  id: string,
  request: Omit<InfoRequest, 'id' | 'requestedAt'>,
  db?: D1Database
): Promise<TelehealthVisit | null> {
  if (!db) return null;
  const visit = await getVisit(kv, id, db);
  if (!visit) return null;
  const req: InfoRequest = {
    ...request,
    id:          `ireq-${Date.now().toString(36)}`,
    requestedAt: dbNow(),
  };
  await dbRun(db,
    `UPDATE telehealth_visits
       SET info_requests=?, status='AWAITING_INFO', updated_at=?
     WHERE id=?`,
    [JSON.stringify([...visit.infoRequests, req]), dbNow(), id]
  );
  return getVisit(kv, id, db);
}

// ── Telehealth Dashboard ──────────────────────────────────────────────────────
export async function getTelehealthDashboard(
  kv: KVNamespace, db?: D1Database
): Promise<TelehealthDashboard> {
  if (!db) return {
    pendingIntake: 0, awaitingReview: 0, inProgress: 0,
    completedToday: 0, urgent: 0,
    recentVisits: [], upcomingVisits: [],
  };

  const today = dbNow().slice(0, 10);
  const rows  = await dbAll<Record<string, unknown>>(db, `SELECT * FROM telehealth_visits ORDER BY created_at DESC`);
  const visits = rows.map(rowToVisit);

  return {
    pendingIntake:  visits.filter(v => v.status === 'INTAKE_PENDING').length,
    awaitingReview: visits.filter(v => v.status === 'INTAKE_COMPLETE').length,
    inProgress:     visits.filter(v => v.status === 'UNDER_REVIEW').length,
    completedToday: visits.filter(v => v.completedAt?.startsWith(today)).length,
    urgent:         visits.filter(v => v.urgency === 'URGENT' && !['COMPLETED','CANCELLED'].includes(v.status)).length,
    recentVisits:   visits.slice(0, 5),
    upcomingVisits: visits.filter(v => v.scheduledFor && v.scheduledFor > today).slice(0, 5),
  };
}

// ── Aliases for backward-compat ───────────────────────────────────────────────
export const addInfoRequest = requestInfo;
export const addMessage     = addVisitMessage;

export async function respondToInfoRequest(
  kv: KVNamespace, visitId: string, requestId: string, response: string, db?: D1Database
): Promise<TelehealthVisit | null> {
  if (!db) return null;
  const visit = await getVisit(kv, visitId, db);
  if (!visit) return null;
  const updated = visit.infoRequests.map((r: InfoRequest) =>
    r.id === requestId ? { ...r, response, respondedAt: dbNow() } : r
  );
  await dbRun(db, `UPDATE telehealth_visits SET info_requests=?, updated_at=? WHERE id=?`,
    [JSON.stringify(updated), dbNow(), visitId]);
  return getVisit(kv, visitId, db);
}
