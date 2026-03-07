// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 6A: Appointment Reminders & Communications — KV Library
// ─────────────────────────────────────────────────────────────────────────────

import type {
  MessageTemplate, OutboundMessage, ReminderRule, NoShowRecord,
  OutreachCampaign, CampaignRecipient, CommsDashboard,
  CommChannel, DeliveryStatus, MessageType, PatientResponse,
  NoShowStatus, CampaignStatus, ReminderTrigger,
} from '../types/reminders'

// ── KV key helpers ─────────────────────────────────────────────────────────────
const K = {
  seeded:          () => 'comms:seeded',
  templateIndex:   () => 'comms:template:index',
  template:     (id: string) => `comms:template:${id}`,
  msgIndex:        () => 'comms:msg:index',
  msg:          (id: string) => `comms:msg:${id}`,
  ruleIndex:       () => 'comms:rule:index',
  rule:         (id: string) => `comms:rule:${id}`,
  noShowIndex:     () => 'comms:noshow:index',
  noShow:       (id: string) => `comms:noshow:${id}`,
  campaignIndex:   () => 'comms:campaign:index',
  campaign:     (id: string) => `comms:campaign:${id}`,
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
function now(): string { return new Date().toISOString() }
function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86400_000).toISOString()
}
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3600_000).toISOString()
}
function hoursAhead(h: number): string {
  return new Date(Date.now() + h * 3600_000).toISOString()
}
function daysAhead(d: number): string {
  const dt = new Date(); dt.setDate(dt.getDate() + d)
  return dt.toISOString().slice(0, 10)
}

// ── Fill template variables ────────────────────────────────────────────────────
export function fillTemplate(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

// ── Seed data ─────────────────────────────────────────────────────────────────
const SEED_TEMPLATES: MessageTemplate[] = [
  {
    id: 'tpl-001', name: '24-Hour SMS Reminder', type: 'REMINDER_24H', channel: 'SMS',
    body: 'Hi {{patient_name}}, this is a reminder that you have an appointment at OculoFlow Eye Care tomorrow, {{date}} at {{time}} with {{provider}}. Reply Y to confirm or C to cancel. Questions? Call (305) 555-0100.',
    isActive: true, createdAt: daysAgo(30), updatedAt: daysAgo(30),
  },
  {
    id: 'tpl-002', name: '48-Hour Email Reminder', type: 'REMINDER_48H', channel: 'EMAIL',
    subject: 'Reminder: Your Eye Appointment in 2 Days — OculoFlow Eye Care',
    body: `Dear {{patient_name}},

This is a friendly reminder that you have an upcoming appointment:

  Date:     {{date}}
  Time:     {{time}}
  Provider: {{provider}}
  Location: {{location}}

Please reply to this message with CONFIRM to confirm your appointment, or call us at (305) 555-0100 to reschedule.

We look forward to seeing you!

OculoFlow Eye Care Team`,
    isActive: true, createdAt: daysAgo(30), updatedAt: daysAgo(30),
  },
  {
    id: 'tpl-003', name: '1-Hour SMS Reminder', type: 'REMINDER_1H', channel: 'SMS',
    body: 'OculoFlow reminder: Your appointment is in 1 hour at {{time}} with {{provider}}. Location: {{location}}. See you soon!',
    isActive: true, createdAt: daysAgo(30), updatedAt: daysAgo(30),
  },
  {
    id: 'tpl-004', name: 'Confirmation Request SMS', type: 'CONFIRMATION_REQUEST', channel: 'SMS',
    body: 'Hi {{patient_name}}, please confirm your OculoFlow appointment on {{date}} at {{time}} with {{provider}}. Reply Y=Confirm, C=Cancel, R=Reschedule.',
    isActive: true, createdAt: daysAgo(30), updatedAt: daysAgo(30),
  },
  {
    id: 'tpl-005', name: 'No-Show Follow-Up SMS', type: 'NO_SHOW_FOLLOWUP', channel: 'SMS',
    body: 'Hi {{patient_name}}, we missed you today at your {{time}} appointment. We\'d love to reschedule — call us at (305) 555-0100 or reply RESCHEDULE and we\'ll reach out.',
    isActive: true, createdAt: daysAgo(30), updatedAt: daysAgo(30),
  },
  {
    id: 'tpl-006', name: 'Recall Outreach SMS', type: 'RECALL_OUTREACH', channel: 'SMS',
    body: 'Hi {{patient_name}}, it\'s time for your {{reason}} at OculoFlow Eye Care. Your last visit was over a year ago. Call us at (305) 555-0100 to schedule. Reply STOP to opt out.',
    isActive: true, createdAt: daysAgo(30), updatedAt: daysAgo(30),
  },
  {
    id: 'tpl-007', name: 'Cancellation Acknowledgment', type: 'CANCELLATION_NOTICE', channel: 'SMS',
    body: 'Hi {{patient_name}}, your OculoFlow appointment on {{date}} at {{time}} has been cancelled. To reschedule, call (305) 555-0100. We look forward to serving you soon.',
    isActive: true, createdAt: daysAgo(30), updatedAt: daysAgo(30),
  },
]

const SEED_RULES: ReminderRule[] = [
  { id: 'rule-001', name: '48h Email Reminder', trigger: 'HOURS_BEFORE', triggerValue: 48,
    messageType: 'REMINDER_48H', channel: 'EMAIL', templateId: 'tpl-002', isActive: true, appointmentTypes: [], createdAt: daysAgo(30) },
  { id: 'rule-002', name: '24h SMS Reminder', trigger: 'HOURS_BEFORE', triggerValue: 24,
    messageType: 'REMINDER_24H', channel: 'SMS', templateId: 'tpl-001', isActive: true, appointmentTypes: [], createdAt: daysAgo(30) },
  { id: 'rule-003', name: '1h SMS Reminder', trigger: 'HOURS_BEFORE', triggerValue: 1,
    messageType: 'REMINDER_1H', channel: 'SMS', templateId: 'tpl-003', isActive: true, appointmentTypes: [], createdAt: daysAgo(30) },
  { id: 'rule-004', name: 'No-Show Follow-Up (2h after)', trigger: 'HOURS_BEFORE', triggerValue: -2,
    messageType: 'NO_SHOW_FOLLOWUP', channel: 'SMS', templateId: 'tpl-005', isActive: true, appointmentTypes: [], createdAt: daysAgo(30) },
]

function makeSeedMessages(): OutboundMessage[] {
  return [
    // Today's sent messages
    { id: 'msg-c-001', appointmentId: 'appt-001', patientId: 'pat-001', patientName: 'Margaret Sullivan',
      patientPhone: '(305) 555-0101', patientEmail: 'margaret.sullivan@email.com',
      channel: 'SMS', messageType: 'REMINDER_24H', templateId: 'tpl-001',
      body: 'Hi Margaret Sullivan, this is a reminder that you have an appointment at OculoFlow Eye Care tomorrow, March 8 at 10:00 AM with Dr. Sarah Chen. Reply Y to confirm or C to cancel.',
      status: 'DELIVERED', sentAt: hoursAgo(3), deliveredAt: hoursAgo(3),
      patientResponse: 'CONFIRMED', patientResponseText: 'Y', patientResponseAt: hoursAgo(2.5),
      createdAt: hoursAgo(3) },
    { id: 'msg-c-002', appointmentId: 'appt-002', patientId: 'pat-003', patientName: 'Priya Nair',
      patientPhone: '(305) 555-0103', patientEmail: 'priya.nair@email.com',
      channel: 'SMS', messageType: 'REMINDER_24H', templateId: 'tpl-001',
      body: 'Hi Priya Nair, this is a reminder that you have an appointment at OculoFlow Eye Care tomorrow, March 8 at 2:00 PM with Dr. Sarah Chen. Reply Y to confirm or C to cancel.',
      status: 'DELIVERED', sentAt: hoursAgo(3), deliveredAt: hoursAgo(2.8),
      patientResponse: 'CONFIRMED', patientResponseText: 'Y', patientResponseAt: hoursAgo(2),
      createdAt: hoursAgo(3) },
    { id: 'msg-c-003', appointmentId: 'appt-003', patientId: 'pat-004', patientName: 'Yuki Nakamura',
      patientPhone: '(305) 555-0104', patientEmail: 'yuki.nakamura@email.com',
      channel: 'SMS', messageType: 'REMINDER_24H', templateId: 'tpl-001',
      body: 'Hi Yuki Nakamura, this is a reminder that you have an appointment at OculoFlow Eye Care tomorrow, March 8 at 3:30 PM with Dr. Raj Patel. Reply Y to confirm or C to cancel.',
      status: 'DELIVERED', sentAt: hoursAgo(2), deliveredAt: hoursAgo(1.8),
      patientResponse: undefined,
      createdAt: hoursAgo(2) },
    { id: 'msg-c-004', appointmentId: 'appt-004', patientId: 'pat-005', patientName: 'Eleanor Voss',
      patientPhone: '(305) 555-0105', patientEmail: 'eleanor.voss@email.com',
      channel: 'EMAIL', messageType: 'REMINDER_48H', templateId: 'tpl-002',
      subject: 'Reminder: Your Eye Appointment in 2 Days — OculoFlow Eye Care',
      body: 'Dear Eleanor Voss, this is a friendly reminder of your upcoming appointment on March 9 at 9:00 AM with Dr. Raj Patel.',
      status: 'DELIVERED', sentAt: hoursAgo(1.5), deliveredAt: hoursAgo(1.3),
      patientResponse: 'RESCHEDULE', patientResponseText: 'RESCHEDULE', patientResponseAt: hoursAgo(0.5),
      createdAt: hoursAgo(1.5) },
    { id: 'msg-c-005', appointmentId: 'appt-005', patientId: 'pat-002', patientName: 'Derek Holloway',
      patientPhone: '(305) 555-0102',
      channel: 'SMS', messageType: 'REMINDER_24H', templateId: 'tpl-001',
      body: 'Hi Derek Holloway, reminder: appointment tomorrow March 8 at 11:00 AM with Dr. Amy Torres (Retina). Reply Y to confirm.',
      status: 'FAILED', sentAt: hoursAgo(4), failureReason: 'Carrier error – invalid number',
      createdAt: hoursAgo(4) },
    // No-show follow-up
    { id: 'msg-c-006', appointmentId: 'appt-noshow-001', patientId: 'pat-006', patientName: 'Marcus Webb',
      patientPhone: '(305) 555-0106',
      channel: 'SMS', messageType: 'NO_SHOW_FOLLOWUP', templateId: 'tpl-005',
      body: 'Hi Marcus Webb, we missed you today at your 9:00 AM appointment. We\'d love to reschedule — call us at (305) 555-0100.',
      status: 'DELIVERED', sentAt: hoursAgo(5), deliveredAt: hoursAgo(4.9),
      patientResponse: undefined,
      createdAt: hoursAgo(5) },
    // Yesterday's messages
    { id: 'msg-c-007', appointmentId: 'appt-006', patientId: 'pat-007', patientName: 'Samuel Torres',
      patientPhone: '(305) 555-0107',
      channel: 'SMS', messageType: 'CONFIRMATION_REQUEST', templateId: 'tpl-004',
      body: 'Hi Samuel Torres, please confirm your OculoFlow appointment on March 8 at 1:00 PM with Dr. Raj Patel. Reply Y=Confirm, C=Cancel, R=Reschedule.',
      status: 'DELIVERED', sentAt: daysAgo(1), deliveredAt: daysAgo(1),
      patientResponse: 'CONFIRMED', patientResponseText: 'Y', patientResponseAt: daysAgo(1),
      createdAt: daysAgo(1) },
    { id: 'msg-c-008', patientId: 'pat-008', patientName: 'Aisha Okonkwo',
      patientPhone: '(305) 555-0108',
      channel: 'SMS', messageType: 'RECALL_OUTREACH', templateId: 'tpl-006',
      body: 'Hi Aisha Okonkwo, it\'s time for your annual eye exam at OculoFlow Eye Care. Call us at (305) 555-0100 to schedule. Reply STOP to opt out.',
      status: 'DELIVERED', sentAt: daysAgo(2), deliveredAt: daysAgo(2),
      patientResponse: 'CONFIRMED', patientResponseText: 'SCHEDULE', patientResponseAt: daysAgo(1),
      createdAt: daysAgo(2) },
  ]
}

function makeSeedNoShows(): NoShowRecord[] {
  return [
    { id: 'ns-001', appointmentId: 'appt-noshow-001', patientId: 'pat-006', patientName: 'Marcus Webb',
      patientPhone: '(305) 555-0106', patientEmail: 'marcus.webb@email.com',
      missedDate: daysAhead(0).slice(0, 10), appointmentType: 'COMPREHENSIVE_EYE_EXAM',
      providerId: 'dr-chen', providerName: 'Dr. Sarah Chen',
      status: 'FOLLOWUP_SENT', followupMessageId: 'msg-c-006',
      notes: 'Patient has history of missed appointments. PCP has been waiting for exam results.',
      createdAt: hoursAgo(6), updatedAt: hoursAgo(5) },
    { id: 'ns-002', appointmentId: 'appt-noshow-002', patientId: 'pat-009', patientName: 'Carlos Rivera',
      patientPhone: '(305) 555-0109', patientEmail: 'carlos.rivera@email.com',
      missedDate: daysAhead(-1).slice(0, 10), appointmentType: 'CONTACT_LENS_FITTING',
      providerId: 'dr-chen', providerName: 'Dr. Sarah Chen',
      status: 'UNCONTACTED',
      createdAt: daysAgo(1), updatedAt: daysAgo(1) },
    { id: 'ns-003', appointmentId: 'appt-noshow-003', patientId: 'pat-010', patientName: 'Linda Park',
      patientPhone: '(305) 555-0110',
      missedDate: daysAhead(-3).slice(0, 10), appointmentType: 'GLAUCOMA_FOLLOWUP',
      providerId: 'dr-patel', providerName: 'Dr. Raj Patel',
      status: 'RESCHEDULED', rescheduledApptId: 'appt-reschedule-003',
      notes: 'Rescheduled to March 12 per patient request.',
      createdAt: daysAgo(3), updatedAt: daysAgo(1) },
  ]
}

function makeSeedCampaigns(): OutreachCampaign[] {
  return [
    {
      id: 'cmp-001', name: 'March Diabetic Eye Exam Recall', channel: 'SMS',
      messageType: 'RECALL_OUTREACH', templateId: 'tpl-006',
      description: 'Outreach to patients with diabetes who haven\'t had an eye exam in 12+ months.',
      recipientCount: 24, sentCount: 24, deliveredCount: 21, responseCount: 9, confirmedCount: 7,
      status: 'COMPLETED', scheduledAt: daysAgo(7), startedAt: daysAgo(7), completedAt: daysAgo(7),
      recipients: [
        { patientId: 'pat-006', patientName: 'Marcus Webb', patientPhone: '(305) 555-0106', status: 'DELIVERED', response: undefined },
        { patientId: 'pat-007', patientName: 'Samuel Torres', patientPhone: '(305) 555-0107', status: 'DELIVERED', response: 'CONFIRMED' },
        { patientId: 'pat-008', patientName: 'Aisha Okonkwo', patientPhone: '(305) 555-0108', status: 'DELIVERED', response: 'CONFIRMED' },
      ],
      createdById: 'staff-001', createdByName: 'Dr. Sarah Chen',
      createdAt: daysAgo(8), updatedAt: daysAgo(7),
    },
    {
      id: 'cmp-002', name: 'Annual Exam Reminders — Spring', channel: 'BOTH',
      messageType: 'RECALL_OUTREACH', templateId: 'tpl-006',
      description: 'Annual exam recall for patients last seen in March–April 2025.',
      recipientCount: 42, sentCount: 38, deliveredCount: 35, responseCount: 14, confirmedCount: 11,
      status: 'RUNNING',
      recipients: [],
      createdById: 'staff-004', createdByName: 'James Okafor',
      createdAt: daysAgo(2), updatedAt: daysAgo(0),
    },
    {
      id: 'cmp-003', name: 'Post-Op Check-in — Cataract Patients', channel: 'SMS',
      messageType: 'CUSTOM', templateId: 'tpl-005',
      description: 'Custom message to cataract surgery patients about 1-week follow-up.',
      recipientCount: 6, sentCount: 0, deliveredCount: 0, responseCount: 0, confirmedCount: 0,
      status: 'DRAFT',
      recipients: [],
      createdById: 'staff-002', createdByName: 'Dr. Raj Patel',
      createdAt: daysAgo(1), updatedAt: daysAgo(1),
    },
  ]
}

// ── Seed guard ─────────────────────────────────────────────────────────────────
export async function ensureCommsSeed(kv: KVNamespace): Promise<void> {
  const flag = await kv.get(K.seeded())
  if (flag) return

  const templates = SEED_TEMPLATES
  const rules     = SEED_RULES
  const messages  = makeSeedMessages()
  const noShows   = makeSeedNoShows()
  const campaigns = makeSeedCampaigns()

  await kv.put(K.templateIndex(), JSON.stringify(templates.map(t => t.id)))
  await Promise.all(templates.map(t => kv.put(K.template(t.id), JSON.stringify(t))))

  await kv.put(K.ruleIndex(), JSON.stringify(rules.map(r => r.id)))
  await Promise.all(rules.map(r => kv.put(K.rule(r.id), JSON.stringify(r))))

  await kv.put(K.msgIndex(), JSON.stringify(messages.map(m => m.id)))
  await Promise.all(messages.map(m => kv.put(K.msg(m.id), JSON.stringify(m))))

  await kv.put(K.noShowIndex(), JSON.stringify(noShows.map(n => n.id)))
  await Promise.all(noShows.map(n => kv.put(K.noShow(n.id), JSON.stringify(n))))

  await kv.put(K.campaignIndex(), JSON.stringify(campaigns.map(c => c.id)))
  await Promise.all(campaigns.map(c => kv.put(K.campaign(c.id), JSON.stringify(c))))

  await kv.put(K.seeded(), '1')
}

// ── Templates ─────────────────────────────────────────────────────────────────
export async function listTemplates(kv: KVNamespace): Promise<MessageTemplate[]> {
  await ensureCommsSeed(kv)
  const raw = await kv.get(K.templateIndex()); if (!raw) return []
  const ids: string[] = JSON.parse(raw)
  const results = await Promise.all(ids.map(id => kv.get(K.template(id))))
  return results.filter(Boolean).map(r => JSON.parse(r!))
}

export async function getTemplate(kv: KVNamespace, id: string): Promise<MessageTemplate | null> {
  await ensureCommsSeed(kv)
  const raw = await kv.get(K.template(id)); return raw ? JSON.parse(raw) : null
}

export async function createTemplate(kv: KVNamespace, data: Omit<MessageTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<MessageTemplate> {
  await ensureCommsSeed(kv)
  const id  = uid('tpl'); const n = now()
  const tpl: MessageTemplate = { ...data, id, createdAt: n, updatedAt: n }
  const rawIdx = await kv.get(K.templateIndex()); const ids: string[] = rawIdx ? JSON.parse(rawIdx) : []
  ids.unshift(id); await kv.put(K.templateIndex(), JSON.stringify(ids)); await kv.put(K.template(id), JSON.stringify(tpl))
  return tpl
}

export async function updateTemplate(kv: KVNamespace, id: string, patch: Partial<MessageTemplate>): Promise<MessageTemplate | null> {
  const raw = await kv.get(K.template(id)); if (!raw) return null
  const tpl: MessageTemplate = { ...JSON.parse(raw), ...patch, id, updatedAt: now() }
  await kv.put(K.template(id), JSON.stringify(tpl)); return tpl
}

// ── Messages ──────────────────────────────────────────────────────────────────
export async function listMessages(
  kv: KVNamespace,
  opts: { patientId?: string; status?: string; messageType?: string; limit?: number } = {}
): Promise<OutboundMessage[]> {
  await ensureCommsSeed(kv)
  const raw = await kv.get(K.msgIndex()); if (!raw) return []
  const ids: string[] = JSON.parse(raw)
  const results = await Promise.all(ids.map(id => kv.get(K.msg(id))))
  let msgs = results.filter(Boolean).map(r => JSON.parse(r!) as OutboundMessage)
  if (opts.patientId)   msgs = msgs.filter(m => m.patientId === opts.patientId)
  if (opts.status)      msgs = msgs.filter(m => m.status === opts.status)
  if (opts.messageType) msgs = msgs.filter(m => m.messageType === opts.messageType)
  msgs.sort((a, b) => (b.createdAt).localeCompare(a.createdAt))
  return opts.limit ? msgs.slice(0, opts.limit) : msgs
}

export async function getMessage(kv: KVNamespace, id: string): Promise<OutboundMessage | null> {
  await ensureCommsSeed(kv)
  const raw = await kv.get(K.msg(id)); return raw ? JSON.parse(raw) : null
}

export async function sendMessage(kv: KVNamespace, data: {
  patientId: string; patientName: string; patientPhone?: string; patientEmail?: string
  channel: CommChannel; messageType: MessageType; templateId?: string
  subject?: string; body: string; appointmentId?: string
}): Promise<OutboundMessage> {
  await ensureCommsSeed(kv)
  const id = uid('msg-c'); const n = now()
  // Simulate send — 90% success rate
  const success = Math.random() > 0.1
  const msg: OutboundMessage = {
    ...data, id,
    status: success ? 'DELIVERED' : 'FAILED',
    sentAt: n, deliveredAt: success ? n : undefined,
    failureReason: success ? undefined : 'Simulated carrier error',
    createdAt: n,
  }
  const rawIdx = await kv.get(K.msgIndex()); const ids: string[] = rawIdx ? JSON.parse(rawIdx) : []
  ids.unshift(id); await kv.put(K.msgIndex(), JSON.stringify(ids)); await kv.put(K.msg(id), JSON.stringify(msg))
  return msg
}

export async function recordPatientResponse(kv: KVNamespace, messageId: string, response: PatientResponse, text?: string): Promise<OutboundMessage | null> {
  const raw = await kv.get(K.msg(messageId)); if (!raw) return null
  const msg: OutboundMessage = { ...JSON.parse(raw), patientResponse: response, patientResponseText: text ?? response, patientResponseAt: now() }
  await kv.put(K.msg(messageId), JSON.stringify(msg)); return msg
}

// ── Reminder Rules ────────────────────────────────────────────────────────────
export async function listRules(kv: KVNamespace): Promise<ReminderRule[]> {
  await ensureCommsSeed(kv)
  const raw = await kv.get(K.ruleIndex()); if (!raw) return []
  const ids: string[] = JSON.parse(raw)
  const results = await Promise.all(ids.map(id => kv.get(K.rule(id))))
  return results.filter(Boolean).map(r => JSON.parse(r!))
}

export async function updateRule(kv: KVNamespace, id: string, patch: Partial<ReminderRule>): Promise<ReminderRule | null> {
  const raw = await kv.get(K.rule(id)); if (!raw) return null
  const rule: ReminderRule = { ...JSON.parse(raw), ...patch, id }
  await kv.put(K.rule(id), JSON.stringify(rule)); return rule
}

// ── No-Shows ──────────────────────────────────────────────────────────────────
export async function listNoShows(kv: KVNamespace, opts: { status?: string } = {}): Promise<NoShowRecord[]> {
  await ensureCommsSeed(kv)
  const raw = await kv.get(K.noShowIndex()); if (!raw) return []
  const ids: string[] = JSON.parse(raw)
  const results = await Promise.all(ids.map(id => kv.get(K.noShow(id))))
  let records = results.filter(Boolean).map(r => JSON.parse(r!) as NoShowRecord)
  if (opts.status) records = records.filter(r => r.status === opts.status)
  return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createNoShow(kv: KVNamespace, data: Omit<NoShowRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<NoShowRecord> {
  await ensureCommsSeed(kv)
  const id = uid('ns'); const n = now()
  const record: NoShowRecord = { ...data, id, createdAt: n, updatedAt: n }
  const rawIdx = await kv.get(K.noShowIndex()); const ids: string[] = rawIdx ? JSON.parse(rawIdx) : []
  ids.unshift(id); await kv.put(K.noShowIndex(), JSON.stringify(ids)); await kv.put(K.noShow(id), JSON.stringify(record))
  return record
}

export async function updateNoShow(kv: KVNamespace, id: string, patch: Partial<NoShowRecord>): Promise<NoShowRecord | null> {
  const raw = await kv.get(K.noShow(id)); if (!raw) return null
  const record: NoShowRecord = { ...JSON.parse(raw), ...patch, id, updatedAt: now() }
  await kv.put(K.noShow(id), JSON.stringify(record)); return record
}

// ── Campaigns ─────────────────────────────────────────────────────────────────
export async function listCampaigns(kv: KVNamespace): Promise<OutreachCampaign[]> {
  await ensureCommsSeed(kv)
  const raw = await kv.get(K.campaignIndex()); if (!raw) return []
  const ids: string[] = JSON.parse(raw)
  const results = await Promise.all(ids.map(id => kv.get(K.campaign(id))))
  return results.filter(Boolean).map(r => JSON.parse(r!) as OutreachCampaign)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function getCampaign(kv: KVNamespace, id: string): Promise<OutreachCampaign | null> {
  await ensureCommsSeed(kv)
  const raw = await kv.get(K.campaign(id)); return raw ? JSON.parse(raw) : null
}

export async function createCampaign(kv: KVNamespace, data: Omit<OutreachCampaign, 'id' | 'sentCount' | 'deliveredCount' | 'responseCount' | 'confirmedCount' | 'createdAt' | 'updatedAt'>): Promise<OutreachCampaign> {
  await ensureCommsSeed(kv)
  const id = uid('cmp'); const n = now()
  const campaign: OutreachCampaign = { ...data, id, sentCount: 0, deliveredCount: 0, responseCount: 0, confirmedCount: 0, createdAt: n, updatedAt: n }
  const rawIdx = await kv.get(K.campaignIndex()); const ids: string[] = rawIdx ? JSON.parse(rawIdx) : []
  ids.unshift(id); await kv.put(K.campaignIndex(), JSON.stringify(ids)); await kv.put(K.campaign(id), JSON.stringify(campaign))
  return campaign
}

export async function updateCampaignStatus(kv: KVNamespace, id: string, status: CampaignStatus): Promise<OutreachCampaign | null> {
  const raw = await kv.get(K.campaign(id)); if (!raw) return null
  const c: OutreachCampaign = JSON.parse(raw)
  const patch: Partial<OutreachCampaign> = { status, updatedAt: now() }
  if (status === 'RUNNING' && !c.startedAt)  patch.startedAt   = now()
  if (status === 'COMPLETED')                patch.completedAt = now()
  const updated = { ...c, ...patch }
  await kv.put(K.campaign(id), JSON.stringify(updated)); return updated
}

// ── Send appointment reminder (simulated) ─────────────────────────────────────
export async function sendAppointmentReminder(kv: KVNamespace, opts: {
  appointmentId: string; patientId: string; patientName: string
  patientPhone?: string; patientEmail?: string
  channel: CommChannel; messageType: MessageType; templateId: string
  date: string; time: string; provider: string; appointmentType?: string
}): Promise<OutboundMessage> {
  const tpl = await getTemplate(kv, opts.templateId)
  const vars = {
    patient_name: opts.patientName, date: opts.date, time: opts.time,
    provider: opts.provider, location: 'OculoFlow Eye Care, 100 Brickell Ave, Miami FL',
    reason: opts.appointmentType ?? 'appointment',
  }
  const body = tpl ? fillTemplate(tpl.body, vars) : `Reminder: ${opts.patientName}, appt on ${opts.date} at ${opts.time} with ${opts.provider}.`
  const subject = tpl?.subject ? fillTemplate(tpl.subject, vars) : undefined
  return sendMessage(kv, { ...opts, body, subject })
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export async function getCommsDashboard(kv: KVNamespace): Promise<CommsDashboard> {
  await ensureCommsSeed(kv)
  const [messages, noShows, campaigns] = await Promise.all([
    listMessages(kv, { limit: 200 }),
    listNoShows(kv),
    listCampaigns(kv),
  ])

  const todayStr  = new Date().toISOString().slice(0, 10)
  const todayMsgs = messages.filter(m => m.createdAt?.startsWith(todayStr))

  const sentToday      = todayMsgs.filter(m => m.status !== 'PENDING').length
  const deliveredToday = todayMsgs.filter(m => m.status === 'DELIVERED').length
  const confirmedToday = todayMsgs.filter(m => m.patientResponse === 'CONFIRMED').length
  const noShowsToday   = noShows.filter(n => n.missedDate === todayStr).length
  const responded      = messages.filter(m => m.patientResponse).length
  const responseRate   = messages.length > 0 ? Math.round((responded / messages.length) * 100) : 0

  const upcomingReminders = [
    { appointmentId: 'appt-tmrw-001', patientName: 'Priya Nair',        date: daysAhead(1), time: '2:00 PM',  channel: 'SMS'   as CommChannel, scheduledFor: hoursAhead(2)  },
    { appointmentId: 'appt-tmrw-002', patientName: 'Yuki Nakamura',     date: daysAhead(1), time: '3:30 PM',  channel: 'SMS'   as CommChannel, scheduledFor: hoursAhead(4)  },
    { appointmentId: 'appt-tmrw-003', patientName: 'Samuel Torres',     date: daysAhead(1), time: '1:00 PM',  channel: 'EMAIL' as CommChannel, scheduledFor: hoursAhead(6)  },
    { appointmentId: 'appt-tmrw-004', patientName: 'Eleanor Voss',      date: daysAhead(2), time: '9:00 AM',  channel: 'BOTH'  as CommChannel, scheduledFor: hoursAhead(22) },
    { appointmentId: 'appt-tmrw-005', patientName: 'Margaret Sullivan', date: daysAhead(2), time: '10:00 AM', channel: 'SMS'   as CommChannel, scheduledFor: hoursAhead(30) },
  ]

  return {
    pendingReminders: upcomingReminders.length,
    sentToday, deliveredToday, confirmedToday, noShowsToday, responseRate,
    recentMessages: messages.slice(0, 10),
    upcomingReminders,
    noShows: noShows.filter(n => n.status !== 'DISMISSED'),
    activeCampaigns: campaigns.filter(c => c.status === 'RUNNING' || c.status === 'SCHEDULED'),
  }
}
