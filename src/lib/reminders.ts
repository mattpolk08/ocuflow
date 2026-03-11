// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Reminders & Communications (Phase D1-9) — D1-backed
// reminder_templates, reminder_messages, reminder_rules,
// outreach_campaigns → D1
// KV param kept for backward-compat but NOT used for data.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  MessageTemplate, OutboundMessage, ReminderRule,
  OutreachCampaign, CommsDashboard,
  CommChannel, DeliveryStatus, MessageType, PatientResponse,
} from '../types/reminders'
import { dbGet, dbAll, dbRun, now as dbNow } from './db'

// ── Fill template variables ────────────────────────────────────────────────────
export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// ── Row mappers ───────────────────────────────────────────────────────────────
function rowToTemplate(r: Record<string, unknown>): MessageTemplate {
  return {
    id:        r.id as string,
    name:      r.name as string,
    type:      r.type as MessageType,
    channel:   r.channel as CommChannel,
    subject:   r.subject as string | undefined,
    body:      r.body as string,
    variables: JSON.parse((r.variables as string) || '[]'),
    isActive:  Boolean(r.is_active),
    useCount:  r.use_count as number,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

function rowToMessage(r: Record<string, unknown>): OutboundMessage {
  return {
    id:            r.id as string,
    patientId:     r.patient_id as string,
    patientName:   r.patient_name as string,
    patientPhone:  r.patient_phone as string | undefined,
    patientEmail:  r.patient_email as string | undefined,
    appointmentId: r.appointment_id as string | undefined,
    templateId:    r.template_id as string | undefined,
    type:          r.type as MessageType,
    channel:       r.channel as CommChannel,
    status:        r.status as DeliveryStatus,
    subject:       r.subject as string | undefined,
    body:          r.body as string,
    sentAt:        r.sent_at as string | undefined,
    deliveredAt:   r.delivered_at as string | undefined,
    response:      r.response as PatientResponse | undefined,
    responseAt:    r.response_at as string | undefined,
    errorMessage:  r.error_message as string | undefined,
    scheduledFor:  r.scheduled_for as string | undefined,
    createdAt:     r.created_at as string,
    updatedAt:     r.updated_at as string,
  };
}

function rowToRule(r: Record<string, unknown>): ReminderRule {
  return {
    id:           r.id as string,
    name:         r.name as string,
    triggerType:  r.trigger_type as ReminderRule['triggerType'],
    hoursBefore:  r.hours_before as number | undefined,
    templateId:   r.template_id as string | undefined,
    channel:      r.channel as CommChannel,
    isActive:     Boolean(r.is_active),
    createdAt:    r.created_at as string,
  };
}

function rowToCampaign(r: Record<string, unknown>): OutreachCampaign {
  return {
    id:            r.id as string,
    name:          r.name as string,
    type:          r.type as string,
    status:        r.status as OutreachCampaign['status'],
    targetCount:   r.target_count as number,
    sentCount:     r.sent_count as number,
    responseCount: r.response_count as number,
    scheduledFor:  r.scheduled_for as string | undefined,
    sentAt:        r.sent_at as string | undefined,
    templateId:    r.template_id as string | undefined,
    filters:       JSON.parse((r.filters as string) || '{}'),
    createdBy:     r.created_by as string | undefined,
    createdAt:     r.created_at as string,
    updatedAt:     r.updated_at as string,
  };
}

// ── ensureCommsSeed ────────────────────────────────────────────────────────────
// Seeding done via migration 0014; no-op kept for backward-compat.
export async function ensureCommsSeed(kv: KVNamespace, db?: D1Database): Promise<void> { /* migration */ }

// ── Templates ─────────────────────────────────────────────────────────────────
export async function listTemplates(kv: KVNamespace, db?: D1Database): Promise<MessageTemplate[]> {
  if (!db) return [];
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM reminder_templates ORDER BY created_at DESC`
  );
  return rows.map(rowToTemplate);
}

export async function getTemplate(kv: KVNamespace, id: string, db?: D1Database): Promise<MessageTemplate | null> {
  if (!db) return null;
  const row = await dbGet<Record<string, unknown>>(db, `SELECT * FROM reminder_templates WHERE id=?`, [id]);
  return row ? rowToTemplate(row) : null;
}

export async function createTemplate(
  kv: KVNamespace,
  data: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>,
  db?: D1Database
): Promise<MessageTemplate> {
  if (!db) throw new Error('D1 required');
  const now = dbNow();
  const id  = `tpl-${Date.now().toString(36)}`;
  await dbRun(db,
    `INSERT INTO reminder_templates
       (id, name, type, channel, subject, body, variables, is_active, use_count, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,1,0,?,?)`,
    [id, data.name, data.type, data.channel, data.subject ?? null,
     data.body, JSON.stringify(data.variables ?? []), now, now]
  );
  return (await getTemplate(kv, id, db))!;
}

export async function updateTemplate(
  kv: KVNamespace, id: string, patch: Partial<MessageTemplate>, db?: D1Database
): Promise<MessageTemplate | null> {
  if (!db) return null;
  const sets: string[]  = ['updated_at=?'];
  const vals: unknown[] = [dbNow()];
  if (patch.name      !== undefined) { sets.push('name=?');      vals.push(patch.name); }
  if (patch.body      !== undefined) { sets.push('body=?');      vals.push(patch.body); }
  if (patch.subject   !== undefined) { sets.push('subject=?');   vals.push(patch.subject); }
  if (patch.isActive  !== undefined) { sets.push('is_active=?'); vals.push(patch.isActive ? 1 : 0); }
  if (patch.channel   !== undefined) { sets.push('channel=?');   vals.push(patch.channel); }
  vals.push(id);
  await dbRun(db, `UPDATE reminder_templates SET ${sets.join(', ')} WHERE id=?`, vals);
  return getTemplate(kv, id, db);
}

// ── Messages ──────────────────────────────────────────────────────────────────
export async function listMessages(
  kv: KVNamespace,
  opts: { patientId?: string; status?: string; messageType?: string; limit?: number } = {},
  db?: D1Database
): Promise<OutboundMessage[]> {
  if (!db) return [];
  const conditions: string[] = [];
  const params: unknown[]    = [];
  if (opts.patientId)   { conditions.push('patient_id=?'); params.push(opts.patientId); }
  if (opts.status)      { conditions.push('status=?');     params.push(opts.status); }
  if (opts.messageType) { conditions.push('type=?');       params.push(opts.messageType); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 100;
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM reminder_messages ${where} ORDER BY created_at DESC LIMIT ?`,
    [...params, limit]
  );
  return rows.map(rowToMessage);
}

export async function getMessage(kv: KVNamespace, id: string, db?: D1Database): Promise<OutboundMessage | null> {
  if (!db) return null;
  const row = await dbGet<Record<string, unknown>>(db, `SELECT * FROM reminder_messages WHERE id=?`, [id]);
  return row ? rowToMessage(row) : null;
}

export async function sendMessage(
  kv: KVNamespace,
  data: Omit<OutboundMessage, 'id' | 'createdAt' | 'updatedAt'>,
  db?: D1Database
): Promise<OutboundMessage> {
  if (!db) throw new Error('D1 required');
  const now = dbNow();
  const id  = `msg-${Date.now().toString(36)}`;
  await dbRun(db,
    `INSERT INTO reminder_messages
       (id, patient_id, patient_name, patient_phone, patient_email,
        appointment_id, template_id, type, channel, status,
        subject, body, scheduled_for, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, data.patientId, data.patientName,
      data.patientPhone ?? null, data.patientEmail ?? null,
      data.appointmentId ?? null, data.templateId ?? null,
      data.type, data.channel, data.status ?? 'PENDING',
      data.subject ?? null, data.body,
      data.scheduledFor ?? null, now, now,
    ]
  );
  return (await getMessage(kv, id, db))!;
}

export async function updateMessageStatus(
  kv: KVNamespace,
  id: string,
  status: DeliveryStatus,
  response?: PatientResponse,
  db?: D1Database
): Promise<OutboundMessage | null> {
  if (!db) return null;
  const now = dbNow();
  const sets = ['status=?', 'updated_at=?'];
  const vals: unknown[] = [status, now];
  if (status === 'DELIVERED') { sets.push('delivered_at=?'); vals.push(now); }
  if (status === 'SENT')      { sets.push('sent_at=?'); vals.push(now); }
  if (response) { sets.push('response=?', 'response_at=?'); vals.push(response, now); }
  vals.push(id);
  await dbRun(db, `UPDATE reminder_messages SET ${sets.join(', ')} WHERE id=?`, vals);
  return getMessage(kv, id, db);
}

// ── Rules ─────────────────────────────────────────────────────────────────────
export async function listRules(kv: KVNamespace, db?: D1Database): Promise<ReminderRule[]> {
  if (!db) return [];
  const rows = await dbAll<Record<string, unknown>>(db, `SELECT * FROM reminder_rules ORDER BY created_at`);
  return rows.map(rowToRule);
}

export async function createRule(
  kv: KVNamespace,
  data: Omit<ReminderRule, 'id' | 'createdAt'>,
  db?: D1Database
): Promise<ReminderRule> {
  if (!db) throw new Error('D1 required');
  const now = dbNow();
  const id  = `rule-${Date.now().toString(36)}`;
  await dbRun(db,
    `INSERT INTO reminder_rules (id, name, trigger_type, hours_before, template_id, channel, is_active, created_at)
     VALUES (?,?,?,?,?,?,1,?)`,
    [id, data.name, data.triggerType, data.hoursBefore ?? null, data.templateId ?? null, data.channel, now]
  );
  return (await listRules(kv, db)).find(r => r.id === id)!;
}

// ── Campaigns ─────────────────────────────────────────────────────────────────
export async function listCampaigns(kv: KVNamespace, db?: D1Database): Promise<OutreachCampaign[]> {
  if (!db) return [];
  const rows = await dbAll<Record<string, unknown>>(db, `SELECT * FROM outreach_campaigns ORDER BY created_at DESC`);
  return rows.map(rowToCampaign);
}

export async function getCampaign(kv: KVNamespace, id: string, db?: D1Database): Promise<OutreachCampaign | null> {
  if (!db) return null;
  const row = await dbGet<Record<string, unknown>>(db, `SELECT * FROM outreach_campaigns WHERE id=?`, [id]);
  return row ? rowToCampaign(row) : null;
}

export async function createCampaign(
  kv: KVNamespace,
  data: Omit<OutreachCampaign, 'id' | 'createdAt' | 'updatedAt'>,
  db?: D1Database
): Promise<OutreachCampaign> {
  if (!db) throw new Error('D1 required');
  const now = dbNow();
  const id  = `camp-${Date.now().toString(36)}`;
  await dbRun(db,
    `INSERT INTO outreach_campaigns
       (id, name, type, status, target_count, sent_count, response_count,
        scheduled_for, template_id, filters, created_by, created_at, updated_at)
     VALUES (?,?,?,?,0,0,0,?,?,?,?,?,?)`,
    [id, data.name, data.type ?? 'RECALL', data.status ?? 'DRAFT',
     data.scheduledFor ?? null, data.templateId ?? null,
     JSON.stringify(data.filters ?? {}), data.createdBy ?? null, now, now]
  );
  return (await getCampaign(kv, id, db))!;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export async function getCommsDashboard(kv: KVNamespace, db?: D1Database): Promise<CommsDashboard> {
  if (!db) return {
    pendingSend: 0, sentToday: 0, failedToday: 0,
    confirmationRate: 0, optOutRate: 0,
    recentMessages: [], upcomingReminders: [],
  };

  const today = dbNow().slice(0, 10);
  const [pending, sentToday, failed, recent] = await Promise.all([
    dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM reminder_messages WHERE status='PENDING'`),
    dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM reminder_messages WHERE status IN ('SENT','DELIVERED') AND DATE(sent_at)=?`, [today]),
    dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM reminder_messages WHERE status='FAILED' AND DATE(created_at)=?`, [today]),
    dbAll<Record<string, unknown>>(db, `SELECT * FROM reminder_messages ORDER BY created_at DESC LIMIT 10`),
  ]);

  const confirmed = await dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM reminder_messages WHERE response='CONFIRMED'`);
  const total     = await dbGet<{ c: number }>(db, `SELECT COUNT(*) as c FROM reminder_messages WHERE response IS NOT NULL`);
  const confirmRate = (total?.c ?? 0) > 0 ? Math.round(((confirmed?.c ?? 0) / total!.c) * 100) : 0;

  return {
    pendingSend:      pending?.c ?? 0,
    sentToday:        sentToday?.c ?? 0,
    failedToday:      failed?.c ?? 0,
    confirmationRate: confirmRate,
    optOutRate:       0,
    recentMessages:   recent.map(rowToMessage),
    upcomingReminders: [],
  };
}

// ── Aliases and stubs for backward-compat with routes ─────────────────────────
export async function sendAppointmentReminder(
  kv: KVNamespace, data: Parameters<typeof sendMessage>[1], db?: D1Database
): Promise<ReturnType<typeof sendMessage>> {
  return sendMessage(kv, data, db);
}

export async function recordPatientResponse(
  kv: KVNamespace, id: string, response: import('../types/reminders').PatientResponse, db?: D1Database
) {
  return updateMessageStatus(kv, id, 'DELIVERED', response, db);
}

export async function updateRule(
  kv: KVNamespace, id: string, patch: Partial<import('../types/reminders').ReminderRule>, db?: D1Database
): Promise<import('../types/reminders').ReminderRule | null> {
  if (!db) return null;
  const { dbRun, now: dbNow2 } = await import('./db');
  const sets: string[] = ['updated_at' in patch ? '' : ''];
  // Simple: if isActive changed, update it
  if (patch.isActive !== undefined) {
    await dbRun(db, `UPDATE reminder_rules SET is_active=?, created_at=created_at WHERE id=?`, [patch.isActive ? 1 : 0, id]);
  }
  return (await listRules(kv, db)).find(r => r.id === id) ?? null;
}

export async function listNoShows(kv: KVNamespace, filters?: { patientId?: string }, db?: D1Database) {
  return listMessages(kv, { patientId: filters?.patientId, messageType: 'NO_SHOW_FOLLOWUP' }, db);
}

export async function createNoShow(kv: KVNamespace, data: Parameters<typeof sendMessage>[1], db?: D1Database) {
  return sendMessage(kv, { ...data, type: 'NO_SHOW_FOLLOWUP' as import('../types/reminders').MessageType }, db);
}

export async function updateNoShow(kv: KVNamespace, id: string, patch: { status?: string }, db?: D1Database) {
  if (!patch.status) return getMessage(kv, id, db);
  return updateMessageStatus(kv, id, patch.status as import('../types/reminders').DeliveryStatus, undefined, db);
}

export async function updateCampaignStatus(kv: KVNamespace, id: string, status: string, db?: D1Database) {
  if (!db) return null;
  const { dbRun, now: dbNow3 } = await import('./db');
  await dbRun(db, `UPDATE outreach_campaigns SET status=?, updated_at=? WHERE id=?`, [status, dbNow3(), id]);
  return getCampaign(kv, id, db);
}
