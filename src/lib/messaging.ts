// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 5A: Clinical Messaging & Task Board — KV Library
// ─────────────────────────────────────────────────────────────────────────────

import type {
  StaffMember, StaffRole,
  StaffMessage, MessageThread, MessagePriority, MessageCategory,
  ClinicalTask, TaskStatus, TaskPriority, TaskCategory, TaskComment,
  RecallEntry, RecallStatus, RecallReason,
  MessagingDashboard,
} from '../types/messaging'

// ── KV key helpers ─────────────────────────────────────────────────────────────
const K = {
  seeded:        () => 'msg:seeded',
  staffIndex:    () => 'msg:staff:index',
  staff:      (id: string) => `msg:staff:${id}`,
  threadIndex:   () => 'msg:thread:index',
  thread:     (id: string) => `msg:thread:${id}`,
  messages:   (threadId: string) => `msg:messages:${threadId}`,
  taskIndex:     () => 'msg:task:index',
  task:       (id: string) => `msg:task:${id}`,
  recallIndex:   () => 'msg:recall:index',
  recall:     (id: string) => `msg:recall:${id}`,
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function now(): string { return new Date().toISOString() }

// ── Seed data ─────────────────────────────────────────────────────────────────

const SEED_STAFF: StaffMember[] = [
  { id: 'staff-001', name: 'Dr. Sarah Chen',      role: 'OPTOMETRIST',  title: 'OD',                color: '#6366f1', isOnline: true  },
  { id: 'staff-002', name: 'Dr. Raj Patel',        role: 'PHYSICIAN',    title: 'Ophthalmologist',   color: '#8b5cf6', isOnline: false },
  { id: 'staff-003', name: 'Maria Gonzalez',       role: 'TECHNICIAN',   title: 'Ophthalmic Tech',   color: '#06b6d4', isOnline: true  },
  { id: 'staff-004', name: 'James Okafor',         role: 'FRONT_DESK',   title: 'Front Desk',        color: '#10b981', isOnline: true  },
  { id: 'staff-005', name: 'Lisa Park',            role: 'BILLING',      title: 'Billing Specialist',color: '#f59e0b', isOnline: false },
  { id: 'staff-006', name: 'Dr. Amy Torres',       role: 'PHYSICIAN',    title: 'Retina Specialist', color: '#ec4899', isOnline: false },
]

function makeSeedThreads(ts: number): { threads: MessageThread[]; messageMap: Record<string, StaffMessage[]> } {
  const base = new Date(ts)
  const ago  = (h: number) => new Date(base.getTime() - h * 3600_000).toISOString()

  const threads: MessageThread[] = [
    {
      id: 'thread-001', subject: 'STAT: Margaret Sullivan — IOP spike post-op',
      category: 'PATIENT_CARE', priority: 'STAT',
      participantIds: ['staff-001','staff-002','staff-003'],
      participantNames: ['Dr. Sarah Chen','Dr. Raj Patel','Maria Gonzalez'],
      patientId: 'pat-001', patientName: 'Margaret Sullivan',
      createdById: 'staff-003', createdByName: 'Maria Gonzalez',
      lastMessageAt: ago(0.25), lastMessagePreview: 'IOP now 28mmHg OS. Administering brimonidine.',
      unreadCount: 2, messageCount: 4, isArchived: false, isPinned: true, createdAt: ago(2),
    },
    {
      id: 'thread-002', subject: 'Derek Holloway — Referral to retina',
      category: 'REFERRAL', priority: 'URGENT',
      participantIds: ['staff-001','staff-006','staff-004'],
      participantNames: ['Dr. Sarah Chen','Dr. Amy Torres','James Okafor'],
      patientId: 'pat-002', patientName: 'Derek Holloway',
      createdById: 'staff-001', createdByName: 'Dr. Sarah Chen',
      lastMessageAt: ago(1.5), lastMessagePreview: 'Scheduled for Thursday 2pm with Dr Torres.',
      unreadCount: 1, messageCount: 3, isArchived: false, isPinned: false, createdAt: ago(3),
    },
    {
      id: 'thread-003', subject: 'Insurance auth — Avastin injections (pat-007)',
      category: 'BILLING', priority: 'URGENT',
      participantIds: ['staff-002','staff-005','staff-004'],
      participantNames: ['Dr. Raj Patel','Lisa Park','James Okafor'],
      patientId: 'pat-007', patientName: 'Samuel Torres',
      createdById: 'staff-005', createdByName: 'Lisa Park',
      lastMessageAt: ago(4), lastMessagePreview: 'Prior auth submitted to BlueCross, ETA 48h.',
      unreadCount: 0, messageCount: 5, isArchived: false, isPinned: false, createdAt: ago(8),
    },
    {
      id: 'thread-004', subject: 'Staff meeting — schedule change 3/10',
      category: 'ADMINISTRATIVE', priority: 'NORMAL',
      participantIds: ['staff-001','staff-002','staff-003','staff-004','staff-005','staff-006'],
      participantNames: ['Dr. Sarah Chen','Dr. Raj Patel','Maria Gonzalez','James Okafor','Lisa Park','Dr. Amy Torres'],
      createdById: 'staff-004', createdByName: 'James Okafor',
      lastMessageAt: ago(22), lastMessagePreview: 'Meeting moved to 8:30am in conference room B.',
      unreadCount: 0, messageCount: 2, isArchived: false, isPinned: false, createdAt: ago(26),
    },
    {
      id: 'thread-005', subject: 'Priya Nair — Rx refill request',
      category: 'PRESCRIPTION', priority: 'NORMAL',
      participantIds: ['staff-001','staff-004'],
      participantNames: ['Dr. Sarah Chen','James Okafor'],
      patientId: 'pat-003', patientName: 'Priya Nair',
      createdById: 'staff-004', createdByName: 'James Okafor',
      lastMessageAt: ago(26), lastMessagePreview: 'Patient called — needs Restasis refill.',
      unreadCount: 1, messageCount: 2, isArchived: false, isPinned: false, createdAt: ago(28),
    },
  ]

  const messageMap: Record<string, StaffMessage[]> = {
    'thread-001': [
      { id: 'msg-001-1', threadId: 'thread-001', senderId: 'staff-003', senderName: 'Maria Gonzalez', senderRole: 'TECHNICIAN',
        body: 'IOP check on Margaret Sullivan post-op: OD 14, OS 24 — elevated. Notifying Dr. Chen.', priority: 'STAT',
        category: 'PATIENT_CARE', patientId: 'pat-001', patientName: 'Margaret Sullivan',
        attachments: [], isRead: true, readBy: [{staffId:'staff-001',readAt:ago(1.9)}], createdAt: ago(2) },
      { id: 'msg-001-2', threadId: 'thread-001', senderId: 'staff-001', senderName: 'Dr. Sarah Chen', senderRole: 'OPTOMETRIST',
        body: 'Adding Dr. Patel to this thread. Please recheck in 30min and administer brimonidine 0.2% if >26.', priority: 'STAT',
        category: 'PATIENT_CARE', patientId: 'pat-001', patientName: 'Margaret Sullivan',
        attachments: [], isRead: true, readBy: [{staffId:'staff-002',readAt:ago(1.5)}], createdAt: ago(1.8) },
      { id: 'msg-001-3', threadId: 'thread-001', senderId: 'staff-002', senderName: 'Dr. Raj Patel', senderRole: 'PHYSICIAN',
        body: 'Agree. If IOP stays elevated after 30min, schedule for SLT consult this week.', priority: 'STAT',
        category: 'PATIENT_CARE', patientId: 'pat-001', patientName: 'Margaret Sullivan',
        attachments: [], isRead: false, readBy: [], createdAt: ago(1.5) },
      { id: 'msg-001-4', threadId: 'thread-001', senderId: 'staff-003', senderName: 'Maria Gonzalez', senderRole: 'TECHNICIAN',
        body: 'IOP now 28mmHg OS. Administering brimonidine.', priority: 'STAT',
        category: 'PATIENT_CARE', patientId: 'pat-001', patientName: 'Margaret Sullivan',
        attachments: [], isRead: false, readBy: [], createdAt: ago(0.25) },
    ],
    'thread-002': [
      { id: 'msg-002-1', threadId: 'thread-002', senderId: 'staff-001', senderName: 'Dr. Sarah Chen', senderRole: 'OPTOMETRIST',
        body: 'Derek Holloway, DOB 1942-11-30. New onset subretinal fluid OD on OCT today. Need urgent retina consult.',
        priority: 'URGENT', category: 'REFERRAL', patientId: 'pat-002', patientName: 'Derek Holloway',
        attachments: [], isRead: true, readBy: [{staffId:'staff-006',readAt:ago(2.5)}], createdAt: ago(3) },
      { id: 'msg-002-2', threadId: 'thread-002', senderId: 'staff-006', senderName: 'Dr. Amy Torres', senderRole: 'PHYSICIAN',
        body: 'Sending James scheduling details now. Can fit him Thursday 2pm.', priority: 'URGENT',
        category: 'REFERRAL', patientId: 'pat-002', patientName: 'Derek Holloway',
        attachments: [], isRead: true, readBy: [{staffId:'staff-001',readAt:ago(2)}], createdAt: ago(2.5) },
      { id: 'msg-002-3', threadId: 'thread-002', senderId: 'staff-004', senderName: 'James Okafor', senderRole: 'FRONT_DESK',
        body: 'Scheduled for Thursday 2pm with Dr Torres. Patient notified by phone.', priority: 'URGENT',
        category: 'REFERRAL', patientId: 'pat-002', patientName: 'Derek Holloway',
        attachments: [], isRead: false, readBy: [], createdAt: ago(1.5) },
    ],
    'thread-003': [
      { id: 'msg-003-1', threadId: 'thread-003', senderId: 'staff-005', senderName: 'Lisa Park', senderRole: 'BILLING',
        body: 'Starting prior auth process for Samuel Torres — Avastin injections x6. Need diagnosis codes from Dr. Patel.', priority: 'URGENT',
        category: 'BILLING', patientId: 'pat-007', patientName: 'Samuel Torres',
        attachments: [], isRead: true, readBy: [{staffId:'staff-002',readAt:ago(7.5)}], createdAt: ago(8) },
      { id: 'msg-003-2', threadId: 'thread-003', senderId: 'staff-002', senderName: 'Dr. Raj Patel', senderRole: 'PHYSICIAN',
        body: 'Dx: H35.31 (Nonexudative AMD, stage 3), H35.351 bilateral. Using CPT 67028 x6 sessions.',
        priority: 'URGENT', category: 'BILLING', patientId: 'pat-007', patientName: 'Samuel Torres',
        attachments: [], isRead: true, readBy: [{staffId:'staff-005',readAt:ago(7)}], createdAt: ago(7.5) },
      { id: 'msg-003-3', threadId: 'thread-003', senderId: 'staff-005', senderName: 'Lisa Park', senderRole: 'BILLING',
        body: 'Prior auth submitted to BlueCross. ETA 48h. Will update when approved.',
        priority: 'NORMAL', category: 'BILLING', patientId: 'pat-007', patientName: 'Samuel Torres',
        attachments: [], isRead: true, readBy: [], createdAt: ago(7) },
    ],
    'thread-004': [
      { id: 'msg-004-1', threadId: 'thread-004', senderId: 'staff-004', senderName: 'James Okafor', senderRole: 'FRONT_DESK',
        body: 'Heads up — Monday staff meeting moved to Tuesday 3/10 at 8:30am. Conference room B. Agenda: EMR upgrade, recall backlog.',
        priority: 'NORMAL', category: 'ADMINISTRATIVE',
        attachments: [], isRead: true, readBy: [], createdAt: ago(26) },
      { id: 'msg-004-2', threadId: 'thread-004', senderId: 'staff-001', senderName: 'Dr. Sarah Chen', senderRole: 'OPTOMETRIST',
        body: 'Confirmed. Will send agenda tomorrow.',
        priority: 'NORMAL', category: 'ADMINISTRATIVE',
        attachments: [], isRead: true, readBy: [], createdAt: ago(22) },
    ],
    'thread-005': [
      { id: 'msg-005-1', threadId: 'thread-005', senderId: 'staff-004', senderName: 'James Okafor', senderRole: 'FRONT_DESK',
        body: 'Priya Nair called — requesting Restasis refill x3 months. Pharmacy: Walgreens (305) 555-0177.',
        priority: 'NORMAL', category: 'PRESCRIPTION', patientId: 'pat-003', patientName: 'Priya Nair',
        attachments: [], isRead: true, readBy: [{staffId:'staff-001',readAt:ago(27)}], createdAt: ago(28) },
      { id: 'msg-005-2', threadId: 'thread-005', senderId: 'staff-001', senderName: 'Dr. Sarah Chen', senderRole: 'OPTOMETRIST',
        body: 'Approved. Sending Rx to Walgreens now. Last exam was 8 months ago — schedule 4-month follow-up.',
        priority: 'NORMAL', category: 'PRESCRIPTION', patientId: 'pat-003', patientName: 'Priya Nair',
        attachments: [], isRead: false, readBy: [], createdAt: ago(26) },
    ],
  }

  return { threads, messageMap }
}

function makeSeedTasks(ts: number): ClinicalTask[] {
  const ago  = (h: number) => new Date(ts - h * 3600_000).toISOString()
  const date = (d: number) => {
    const dt = new Date(ts); dt.setDate(dt.getDate() + d)
    return dt.toISOString().slice(0, 10)
  }
  return [
    { id: 'task-001', title: 'Schedule 4-month follow-up — Priya Nair (dry eye)',
      description: 'Post Restasis refill follow-up. Last exam 8 months ago.',
      category: 'FOLLOW_UP', status: 'OPEN', priority: 'NORMAL',
      assignedToId: 'staff-004', assignedToName: 'James Okafor',
      assignedById: 'staff-001', assignedByName: 'Dr. Sarah Chen',
      patientId: 'pat-003', patientName: 'Priya Nair',
      dueDate: date(3), tags: ['dry-eye','follow-up'], comments: [], createdAt: ago(26), updatedAt: ago(26) },
    { id: 'task-002', title: 'STAT: Call Margaret Sullivan re post-op IOP',
      description: 'IOP 28mmHg OS post-op. Call patient with instructions, schedule SLT consult if needed.',
      category: 'CLINICAL', status: 'IN_PROGRESS', priority: 'URGENT',
      assignedToId: 'staff-003', assignedToName: 'Maria Gonzalez',
      assignedById: 'staff-001', assignedByName: 'Dr. Sarah Chen',
      patientId: 'pat-001', patientName: 'Margaret Sullivan',
      dueDate: date(0), dueTime: '14:00', tags: ['post-op','iop','stat'], comments: [
        { id: 'tc-001', taskId: 'task-002', authorId: 'staff-003', authorName: 'Maria Gonzalez',
          body: 'Patient reached. Brimonidine administered. Rechecking at 2pm.', createdAt: ago(0.5) }
      ], createdAt: ago(2), updatedAt: ago(0.5) },
    { id: 'task-003', title: 'Obtain surgical clearance — Eleanor Voss (cataract)',
      description: 'Need H&P from PCP Dr. Williams before surgery scheduled 3/15.',
      category: 'ADMINISTRATIVE', status: 'OPEN', priority: 'HIGH',
      assignedToId: 'staff-004', assignedToName: 'James Okafor',
      assignedById: 'staff-002', assignedByName: 'Dr. Raj Patel',
      patientId: 'pat-005', patientName: 'Eleanor Voss',
      dueDate: date(2), tags: ['surgery','clearance'], comments: [], createdAt: ago(6), updatedAt: ago(6) },
    { id: 'task-004', title: 'File prior auth — Avastin injections (Samuel Torres)',
      category: 'INSURANCE', status: 'IN_PROGRESS', priority: 'URGENT',
      description: 'BlueCross prior auth submitted. Follow up if no response in 48h.',
      assignedToId: 'staff-005', assignedToName: 'Lisa Park',
      assignedById: 'staff-005', assignedByName: 'Lisa Park',
      patientId: 'pat-007', patientName: 'Samuel Torres',
      dueDate: date(1), tags: ['billing','prior-auth','avastin'], comments: [], createdAt: ago(8), updatedAt: ago(7) },
    { id: 'task-005', title: 'Contact lab — Holloway frame order delayed',
      category: 'OPTICAL', status: 'OPEN', priority: 'NORMAL',
      description: 'OPT-260307-1002 frames 5 days overdue. Call Essilor lab for ETA.',
      assignedToId: 'staff-003', assignedToName: 'Maria Gonzalez',
      assignedById: 'staff-003', assignedByName: 'Maria Gonzalez',
      patientId: 'pat-002', patientName: 'Derek Holloway',
      dueDate: date(0), tags: ['optical','lab'], comments: [], createdAt: ago(10), updatedAt: ago(10) },
    { id: 'task-006', title: 'Recall: Marcus Webb — overdue diabetic eye exam',
      category: 'RECALL', status: 'OPEN', priority: 'HIGH',
      description: 'Last diabetic exam 14 months ago. PCP Dr. Adams requesting annual report.',
      assignedToId: 'staff-004', assignedToName: 'James Okafor',
      assignedById: 'staff-001', assignedByName: 'Dr. Sarah Chen',
      patientId: 'pat-006', patientName: 'Marcus Webb',
      dueDate: date(-2), tags: ['recall','diabetic','overdue'], comments: [], createdAt: ago(72), updatedAt: ago(24) },
    { id: 'task-007', title: 'Review OCT comparison — Yuki Nakamura',
      category: 'CLINICAL', status: 'OPEN', priority: 'NORMAL',
      description: 'Compare OCT from today vs 6 months ago. Evaluate RNFL thinning progression.',
      assignedToId: 'staff-001', assignedToName: 'Dr. Sarah Chen',
      assignedById: 'staff-001', assignedByName: 'Dr. Sarah Chen',
      patientId: 'pat-004', patientName: 'Yuki Nakamura',
      dueDate: date(1), tags: ['oct','glaucoma'], comments: [], createdAt: ago(4), updatedAt: ago(4) },
    { id: 'task-008', title: 'Submit CMS-1500 for March batch',
      category: 'BILLING', status: 'OPEN', priority: 'NORMAL',
      description: 'Batch claims due end of week. 12 superbills pending submission.',
      assignedToId: 'staff-005', assignedToName: 'Lisa Park',
      assignedById: 'staff-005', assignedByName: 'Lisa Park',
      dueDate: date(4), tags: ['billing','claims'], comments: [], createdAt: ago(48), updatedAt: ago(48) } as ClinicalTask,
  ]
}

function makeSeedRecalls(ts: number): RecallEntry[] {
  const date = (d: number) => {
    const dt = new Date(ts); dt.setDate(dt.getDate() + d)
    return dt.toISOString().slice(0, 10)
  }
  return [
    { id: 'recall-001', patientId: 'pat-006', patientName: 'Marcus Webb',
      patientPhone: '(305) 555-0106', patientEmail: 'marcus.webb@email.com',
      reason: 'DIABETIC_EYE_EXAM', dueDate: date(-14), status: 'PENDING', priority: 'HIGH',
      assignedToId: 'staff-004', assignedToName: 'James Okafor',
      notes: 'PCP requested annual exam report. Left 2 voicemails — try email.',
      createdAt: new Date(ts - 20*86400_000).toISOString(), updatedAt: new Date(ts - 2*86400_000).toISOString() },
    { id: 'recall-002', patientId: 'pat-003', patientName: 'Priya Nair',
      patientPhone: '(305) 555-0103', patientEmail: 'priya.nair@email.com',
      reason: 'DRY_EYE_FOLLOWUP', dueDate: date(90), status: 'PENDING', priority: 'NORMAL',
      assignedToId: 'staff-004', assignedToName: 'James Okafor',
      notes: 'Schedule 4-month follow-up post Restasis refill.',
      createdAt: new Date(ts - 86400_000).toISOString(), updatedAt: new Date(ts - 86400_000).toISOString() },
    { id: 'recall-003', patientId: 'pat-001', patientName: 'Margaret Sullivan',
      patientPhone: '(305) 555-0101', patientEmail: 'margaret.sullivan@email.com',
      reason: 'GLAUCOMA_FOLLOWUP', dueDate: date(30), status: 'PENDING', priority: 'HIGH',
      assignedToId: 'staff-001', assignedToName: 'Dr. Sarah Chen',
      notes: 'Post-op IOP monitoring. Follow up 1 month post trabeculoplasty.',
      createdAt: new Date(ts - 7*86400_000).toISOString(), updatedAt: new Date(ts - 7*86400_000).toISOString() },
    { id: 'recall-004', patientId: 'pat-002', patientName: 'Derek Holloway',
      patientPhone: '(305) 555-0102', patientEmail: 'derek.holloway@email.com',
      reason: 'ANNUAL_EXAM', dueDate: date(-5), status: 'CONTACTED', priority: 'NORMAL',
      assignedToId: 'staff-004', assignedToName: 'James Okafor',
      notes: 'Left voicemail. Also has retina consult scheduled — coordinate timing.',
      lastContactedAt: new Date(ts - 3*86400_000).toISOString(),
      createdAt: new Date(ts - 30*86400_000).toISOString(), updatedAt: new Date(ts - 3*86400_000).toISOString() },
    { id: 'recall-005', patientId: 'pat-005', patientName: 'Eleanor Voss',
      patientPhone: '(305) 555-0105', patientEmail: 'eleanor.voss@email.com',
      reason: 'POST_OP', dueDate: date(7), status: 'SCHEDULED', priority: 'NORMAL',
      assignedToId: 'staff-004', assignedToName: 'James Okafor',
      notes: 'Post-cataract surgery follow-up. Patient booked 3/14 9am.',
      scheduledApptId: 'appt-post-op-001',
      createdAt: new Date(ts - 14*86400_000).toISOString(), updatedAt: new Date(ts - 2*86400_000).toISOString() },
  ]
}

// ── Seed guard ─────────────────────────────────────────────────────────────────

export async function ensureMessagingSeed(kv: KVNamespace): Promise<void> {
  const flag = await kv.get(K.seeded())
  if (flag) return

  const ts = Date.now()
  const { threads, messageMap } = makeSeedThreads(ts)
  const tasks   = makeSeedTasks(ts)
  const recalls = makeSeedRecalls(ts)

  // Staff
  const staffIds = SEED_STAFF.map(s => s.id)
  await kv.put(K.staffIndex(), JSON.stringify(staffIds))
  await Promise.all(SEED_STAFF.map(s => kv.put(K.staff(s.id), JSON.stringify(s))))

  // Threads + messages
  const threadIds = threads.map(t => t.id)
  await kv.put(K.threadIndex(), JSON.stringify(threadIds))
  await Promise.all(threads.map(t => kv.put(K.thread(t.id), JSON.stringify(t))))
  await Promise.all(Object.entries(messageMap).map(([tid, msgs]) =>
    kv.put(K.messages(tid), JSON.stringify(msgs))
  ))

  // Tasks
  const taskIds = tasks.map(t => t.id)
  await kv.put(K.taskIndex(), JSON.stringify(taskIds))
  await Promise.all(tasks.map(t => kv.put(K.task(t.id), JSON.stringify(t))))

  // Recalls
  const recallIds = recalls.map(r => r.id)
  await kv.put(K.recallIndex(), JSON.stringify(recallIds))
  await Promise.all(recalls.map(r => kv.put(K.recall(r.id), JSON.stringify(r))))

  await kv.put(K.seeded(), '1')
}

// ── Staff ─────────────────────────────────────────────────────────────────────

export async function listStaff(kv: KVNamespace): Promise<StaffMember[]> {
  await ensureMessagingSeed(kv)
  const raw = await kv.get(K.staffIndex())
  if (!raw) return []
  const ids: string[] = JSON.parse(raw)
  const results = await Promise.all(ids.map(id => kv.get(K.staff(id))))
  return results.filter(Boolean).map(r => JSON.parse(r!))
}

export async function getStaffMember(kv: KVNamespace, id: string): Promise<StaffMember | null> {
  const raw = await kv.get(K.staff(id))
  return raw ? JSON.parse(raw) : null
}

// ── Threads ───────────────────────────────────────────────────────────────────

export async function listThreads(
  kv: KVNamespace,
  opts: { participantId?: string; category?: string; priority?: string; archived?: boolean } = {}
): Promise<MessageThread[]> {
  await ensureMessagingSeed(kv)
  const raw = await kv.get(K.threadIndex())
  if (!raw) return []
  const ids: string[] = JSON.parse(raw)
  const results = await Promise.all(ids.map(id => kv.get(K.thread(id))))
  let threads = results.filter(Boolean).map(r => JSON.parse(r!) as MessageThread)
  if (opts.participantId) threads = threads.filter(t => t.participantIds.includes(opts.participantId!))
  if (opts.category)      threads = threads.filter(t => t.category === opts.category)
  if (opts.priority)      threads = threads.filter(t => t.priority === opts.priority)
  if (opts.archived !== undefined) threads = threads.filter(t => t.isArchived === opts.archived)
  return threads.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
}

export async function getThread(kv: KVNamespace, id: string): Promise<MessageThread | null> {
  await ensureMessagingSeed(kv)
  const raw = await kv.get(K.thread(id))
  return raw ? JSON.parse(raw) : null
}

export async function createThread(kv: KVNamespace, data: {
  subject: string
  category: MessageCategory
  priority: MessagePriority
  participantIds: string[]
  participantNames: string[]
  createdById: string
  createdByName: string
  patientId?: string
  patientName?: string
  body: string
  senderRole: StaffRole
}): Promise<MessageThread> {
  await ensureMessagingSeed(kv)
  const threadId = uid('thread')
  const msgId    = uid('msg')
  const nowStr   = now()

  const thread: MessageThread = {
    id: threadId, subject: data.subject, category: data.category, priority: data.priority,
    participantIds: data.participantIds, participantNames: data.participantNames,
    patientId: data.patientId, patientName: data.patientName,
    createdById: data.createdById, createdByName: data.createdByName,
    lastMessageAt: nowStr, lastMessagePreview: data.body.slice(0, 80),
    unreadCount: Math.max(0, data.participantIds.length - 1),
    messageCount: 1, isArchived: false, isPinned: false, createdAt: nowStr,
  }

  const message: StaffMessage = {
    id: msgId, threadId, senderId: data.createdById, senderName: data.createdByName,
    senderRole: data.senderRole, body: data.body, priority: data.priority,
    category: data.category, patientId: data.patientId, patientName: data.patientName,
    attachments: [], isRead: false, readBy: [], createdAt: nowStr,
  }

  const rawIdx = await kv.get(K.threadIndex())
  const ids: string[] = rawIdx ? JSON.parse(rawIdx) : []
  ids.unshift(threadId)
  await kv.put(K.threadIndex(), JSON.stringify(ids))
  await kv.put(K.thread(threadId), JSON.stringify(thread))
  await kv.put(K.messages(threadId), JSON.stringify([message]))
  return thread
}

export async function replyToThread(kv: KVNamespace, threadId: string, data: {
  senderId: string; senderName: string; senderRole: StaffRole; body: string; priority?: MessagePriority
}): Promise<StaffMessage> {
  await ensureMessagingSeed(kv)
  const thread = await getThread(kv, threadId)
  if (!thread) throw new Error('Thread not found')

  const msgId  = uid('msg')
  const nowStr = now()
  const message: StaffMessage = {
    id: msgId, threadId,
    senderId: data.senderId, senderName: data.senderName, senderRole: data.senderRole,
    body: data.body, priority: data.priority ?? 'NORMAL',
    category: thread.category, patientId: thread.patientId, patientName: thread.patientName,
    attachments: [], isRead: false, readBy: [], createdAt: nowStr,
  }

  const rawMsgs = await kv.get(K.messages(threadId))
  const msgs: StaffMessage[] = rawMsgs ? JSON.parse(rawMsgs) : []
  msgs.push(message)
  await kv.put(K.messages(threadId), JSON.stringify(msgs))

  const updThread: MessageThread = {
    ...thread,
    lastMessageAt: nowStr,
    lastMessagePreview: data.body.slice(0, 80),
    messageCount: msgs.length,
    unreadCount: thread.unreadCount + Math.max(0, thread.participantIds.length - 1),
  }
  await kv.put(K.thread(threadId), JSON.stringify(updThread))
  return message
}

export async function getThreadMessages(kv: KVNamespace, threadId: string): Promise<StaffMessage[]> {
  await ensureMessagingSeed(kv)
  const raw = await kv.get(K.messages(threadId))
  return raw ? JSON.parse(raw) : []
}

export async function markThreadRead(kv: KVNamespace, threadId: string, staffId: string): Promise<void> {
  const thread = await getThread(kv, threadId)
  if (!thread) return
  const rawMsgs = await kv.get(K.messages(threadId))
  const msgs: StaffMessage[] = rawMsgs ? JSON.parse(rawMsgs) : []
  const nowStr = now()
  const updMsgs = msgs.map(m => {
    if (m.isRead || m.readBy.some(r => r.staffId === staffId)) return m
    return { ...m, isRead: true, readBy: [...m.readBy, { staffId, readAt: nowStr }] }
  })
  await kv.put(K.messages(threadId), JSON.stringify(updMsgs))
  const updThread = { ...thread, unreadCount: 0 }
  await kv.put(K.thread(threadId), JSON.stringify(updThread))
}

export async function archiveThread(kv: KVNamespace, threadId: string, archived: boolean): Promise<void> {
  const thread = await getThread(kv, threadId)
  if (!thread) return
  await kv.put(K.thread(threadId), JSON.stringify({ ...thread, isArchived: archived }))
}

export async function pinThread(kv: KVNamespace, threadId: string, pinned: boolean): Promise<void> {
  const thread = await getThread(kv, threadId)
  if (!thread) return
  await kv.put(K.thread(threadId), JSON.stringify({ ...thread, isPinned: pinned }))
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function listTasks(
  kv: KVNamespace,
  opts: { assignedToId?: string; status?: string; priority?: string; category?: string; patientId?: string } = {}
): Promise<ClinicalTask[]> {
  await ensureMessagingSeed(kv)
  const raw = await kv.get(K.taskIndex())
  if (!raw) return []
  const ids: string[] = JSON.parse(raw)
  const results = await Promise.all(ids.map(id => kv.get(K.task(id))))
  let tasks = results.filter(Boolean).map(r => JSON.parse(r!) as ClinicalTask)
  if (opts.assignedToId) tasks = tasks.filter(t => t.assignedToId === opts.assignedToId)
  if (opts.status)       tasks = tasks.filter(t => t.status === opts.status)
  if (opts.priority)     tasks = tasks.filter(t => t.priority === opts.priority)
  if (opts.category)     tasks = tasks.filter(t => t.category === opts.category)
  if (opts.patientId)    tasks = tasks.filter(t => t.patientId === opts.patientId)
  return tasks.sort((a, b) => {
    const pOrd = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 }
    const po = (pOrd[a.priority] ?? 9) - (pOrd[b.priority] ?? 9)
    if (po !== 0) return po
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export async function getTask(kv: KVNamespace, id: string): Promise<ClinicalTask | null> {
  await ensureMessagingSeed(kv)
  const raw = await kv.get(K.task(id))
  return raw ? JSON.parse(raw) : null
}

export async function createTask(kv: KVNamespace, data: Omit<ClinicalTask, 'id' | 'comments' | 'createdAt' | 'updatedAt'>): Promise<ClinicalTask> {
  await ensureMessagingSeed(kv)
  const id     = uid('task')
  const nowStr = now()
  const task: ClinicalTask = { ...data, id, comments: [], createdAt: nowStr, updatedAt: nowStr }
  const rawIdx = await kv.get(K.taskIndex())
  const ids: string[] = rawIdx ? JSON.parse(rawIdx) : []
  ids.unshift(id)
  await kv.put(K.taskIndex(), JSON.stringify(ids))
  await kv.put(K.task(id), JSON.stringify(task))
  return task
}

export async function updateTask(kv: KVNamespace, id: string, patch: Partial<ClinicalTask>): Promise<ClinicalTask | null> {
  const task = await getTask(kv, id)
  if (!task) return null
  const nowStr = now()
  const updated: ClinicalTask = {
    ...task, ...patch, id, comments: task.comments, createdAt: task.createdAt, updatedAt: nowStr,
  }
  if (patch.status === 'DONE' && !task.completedAt) {
    updated.completedAt = nowStr
  }
  await kv.put(K.task(id), JSON.stringify(updated))
  return updated
}

export async function addTaskComment(kv: KVNamespace, taskId: string, data: {
  authorId: string; authorName: string; body: string
}): Promise<TaskComment | null> {
  const task = await getTask(kv, taskId)
  if (!task) return null
  const comment: TaskComment = { id: uid('tc'), taskId, ...data, createdAt: now() }
  const updated = { ...task, comments: [...task.comments, comment], updatedAt: now() }
  await kv.put(K.task(taskId), JSON.stringify(updated))
  return comment
}

// ── Recalls ───────────────────────────────────────────────────────────────────

export async function listRecalls(
  kv: KVNamespace,
  opts: { status?: string; assignedToId?: string; overdueOnly?: boolean } = {}
): Promise<RecallEntry[]> {
  await ensureMessagingSeed(kv)
  const raw = await kv.get(K.recallIndex())
  if (!raw) return []
  const ids: string[] = JSON.parse(raw)
  const results = await Promise.all(ids.map(id => kv.get(K.recall(id))))
  let recalls = results.filter(Boolean).map(r => JSON.parse(r!) as RecallEntry)
  if (opts.status)       recalls = recalls.filter(r => r.status === opts.status)
  if (opts.assignedToId) recalls = recalls.filter(r => r.assignedToId === opts.assignedToId)
  if (opts.overdueOnly)  recalls = recalls.filter(r => r.dueDate < new Date().toISOString().slice(0,10) && r.status !== 'SCHEDULED' && r.status !== 'DECLINED')
  return recalls.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

export async function createRecall(kv: KVNamespace, data: Omit<RecallEntry, 'id' | 'createdAt' | 'updatedAt'>): Promise<RecallEntry> {
  await ensureMessagingSeed(kv)
  const id     = uid('recall')
  const nowStr = now()
  const recall: RecallEntry = { ...data, id, createdAt: nowStr, updatedAt: nowStr }
  const rawIdx = await kv.get(K.recallIndex())
  const ids: string[] = rawIdx ? JSON.parse(rawIdx) : []
  ids.unshift(id)
  await kv.put(K.recallIndex(), JSON.stringify(ids))
  await kv.put(K.recall(id), JSON.stringify(recall))
  return recall
}

export async function updateRecall(kv: KVNamespace, id: string, patch: Partial<RecallEntry>): Promise<RecallEntry | null> {
  const raw = await kv.get(K.recall(id))
  if (!raw) return null
  const recall: RecallEntry = JSON.parse(raw)
  const updated = { ...recall, ...patch, id, createdAt: recall.createdAt, updatedAt: now() }
  await kv.put(K.recall(id), JSON.stringify(updated))
  return updated
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getMessagingDashboard(kv: KVNamespace, staffId?: string): Promise<MessagingDashboard> {
  await ensureMessagingSeed(kv)
  const [threads, tasks, recalls] = await Promise.all([
    listThreads(kv),
    listTasks(kv, staffId ? { assignedToId: staffId } : {}),
    listRecalls(kv),
  ])

  const today = new Date().toISOString().slice(0, 10)
  const overdueTasks   = tasks.filter(t => t.dueDate && t.dueDate < today && t.status !== 'DONE' && t.status !== 'CANCELLED')
  const openTasks      = tasks.filter(t => t.status === 'OPEN' || t.status === 'IN_PROGRESS')
  const urgentTasks    = tasks.filter(t => t.priority === 'URGENT' && t.status !== 'DONE' && t.status !== 'CANCELLED')
  const urgentMessages = threads.filter(t => t.priority === 'STAT' || t.priority === 'URGENT')
  const unreadMessages = threads.reduce((s, t) => s + t.unreadCount, 0)
  const pendingRecalls = recalls.filter(r => r.status === 'PENDING' || r.status === 'CONTACTED')
  const overdueRecalls = recalls.filter(r => r.dueDate < today && r.status !== 'SCHEDULED' && r.status !== 'DECLINED')

  return {
    unreadMessages,
    urgentMessages: urgentMessages.length,
    openTasks: openTasks.length,
    overdueTasks: overdueTasks.length,
    urgentTasks: urgentTasks.length,
    pendingRecalls: pendingRecalls.length,
    recentThreads: threads.slice(0, 5),
    myTasks: tasks.slice(0, 8),
    overdueRecalls,
  }
}
