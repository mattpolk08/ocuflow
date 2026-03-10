// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Clinical Messaging & Task Board (Phase D1-8) — D1-backed
// msg_threads, msg_messages, msg_tasks, msg_recalls → D1
// KV param kept for backward-compat but NOT used for data.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  StaffMember, StaffRole,
  StaffMessage, MessageThread, MessagePriority, MessageCategory,
  ClinicalTask, TaskStatus, TaskPriority, TaskCategory, TaskComment,
  RecallEntry, RecallStatus, RecallReason,
  MessagingDashboard,
} from '../types/messaging'
import { dbGet, dbAll, dbRun, now as dbNow } from './db'

// ── Static staff directory (mirrors staff_users but with messaging-specific fields) ──
const STAFF_DIRECTORY: StaffMember[] = [
  { id: 'dr-chen',         name: 'Dr. Emily Chen',   role: 'OPTOMETRIST', title: 'OD, FAAO',         color: '#4F46E5', isOnline: true  },
  { id: 'dr-patel',        name: 'Dr. Raj Patel',    role: 'OPTOMETRIST', title: 'MD, PhD',           color: '#7C3AED', isOnline: true  },
  { id: 'usr-billing-001', name: 'Billing Staff',     role: 'BILLING',     title: 'Billing Specialist', color: '#059669', isOnline: false },
  { id: 'usr-frontdesk-001', name: 'Front Desk',      role: 'FRONT_DESK',  title: 'Front Desk Coordinator', color: '#DC2626', isOnline: true },
  { id: 'usr-admin-001',   name: 'Practice Admin',    role: 'ADMIN',       title: 'Practice Administrator', color: '#D97706', isOnline: false },
  { id: 'usr-optical-001', name: 'Optical Staff',     role: 'TECHNICIAN',  title: 'Optical Technician', color: '#0891B2', isOnline: false },
]

// ── Row mappers ───────────────────────────────────────────────────────────────
function rowToThread(r: Record<string, unknown>): MessageThread {
  const participantIds   = JSON.parse((r.participant_ids as string)   || '[]') as string[];
  const readBy           = JSON.parse((r.read_by as string)           || '[]') as string[];
  const participantNames = participantIds.map(id => STAFF_DIRECTORY.find(s => s.id === id)?.name ?? id);
  return {
    id:                   r.id as string,
    subject:              r.subject as string,
    category:             (r.category as MessageCategory) ?? 'GENERAL',
    priority:             (r.priority as MessagePriority) ?? 'NORMAL',
    participantIds,
    participantNames,
    patientId:            r.patient_id as string | undefined,
    patientName:          r.patient_name as string | undefined,
    createdById:          r.creator_id as string,
    createdByName:        r.creator_name as string,
    lastMessageAt:        (r.last_message_at as string) ?? (r.created_at as string),
    lastMessagePreview:   '',
    messageCount:         r.message_count as number,
    isArchived:           Boolean(r.is_archived),
    isPinned:             Boolean(r.is_pinned),
    readBy,
    status:               (r.status as string) ?? 'OPEN',
    createdAt:            r.created_at as string,
    updatedAt:            r.updated_at as string,
  };
}

function rowToMessage(r: Record<string, unknown>): StaffMessage {
  const staff = STAFF_DIRECTORY.find(s => s.id === (r.sender_id as string));
  return {
    id:           r.id as string,
    threadId:     r.thread_id as string,
    senderId:     r.sender_id as string,
    senderName:   r.sender_name as string,
    senderRole:   (r.sender_role as StaffRole) ?? (staff?.role ?? 'FRONT_DESK'),
    body:         r.content as string,
    priority:     'NORMAL',
    category:     'GENERAL',
    attachments:  JSON.parse((r.attachments as string) || '[]'),
    isRead:       false,
    readBy:       [],
    createdAt:    r.created_at as string,
    isDeleted:    false,
  };
}

function rowToTask(r: Record<string, unknown>): ClinicalTask {
  return {
    id:             r.id as string,
    title:          r.title as string,
    description:    r.description as string | undefined,
    category:       (r.category as TaskCategory) ?? 'GENERAL',
    priority:       (r.priority as TaskPriority) ?? 'NORMAL',
    status:         (r.status as TaskStatus) ?? 'OPEN',
    patientId:      r.patient_id as string | undefined,
    patientName:    r.patient_name as string | undefined,
    assignedToId:   r.assigned_to as string,
    assignedToName: r.assigned_name as string,
    createdById:    r.created_by as string,
    createdByName:  r.created_by_name as string,
    dueDate:        r.due_date as string | undefined,
    completedAt:    r.completed_at as string | undefined,
    threadId:       r.thread_id as string | undefined,
    comments:       JSON.parse((r.comments as string) || '[]'),
    createdAt:      r.created_at as string,
    updatedAt:      r.updated_at as string,
  };
}

function rowToRecall(r: Record<string, unknown>): RecallEntry {
  return {
    id:              r.id as string,
    patientId:       r.patient_id as string,
    patientName:     r.patient_name as string,
    recallType:      (r.recall_type as RecallReason) ?? 'ANNUAL_EXAM',
    dueDate:         r.due_date as string,
    priority:        (r.priority as 'NORMAL' | 'HIGH') ?? 'NORMAL',
    status:          (r.status as RecallStatus) ?? 'PENDING',
    notes:           r.notes as string | undefined,
    assignedTo:      r.assigned_to as string | undefined,
    lastContactDate: r.last_contact_date as string | undefined,
    contactAttempts: r.contact_attempts as number,
    createdAt:       r.created_at as string,
    updatedAt:       r.updated_at as string,
  };
}

// ── Staff directory ───────────────────────────────────────────────────────────
export async function ensureMessagingSeed(kv: KVNamespace, db?: D1Database): Promise<void> { /* migration */ }

export async function listStaff(kv: KVNamespace, db?: D1Database): Promise<StaffMember[]> {
  return STAFF_DIRECTORY;
}

export async function getStaffMember(kv: KVNamespace, id: string, db?: D1Database): Promise<StaffMember | null> {
  return STAFF_DIRECTORY.find(s => s.id === id) ?? null;
}

// ── Threads ───────────────────────────────────────────────────────────────────
export async function listThreads(
  kv: KVNamespace,
  filters?: { staffId?: string; patientId?: string; category?: string; archived?: boolean },
  db?: D1Database
): Promise<MessageThread[]> {
  if (!db) return [];
  const conditions: string[] = ['1=1'];
  const params: unknown[]    = [];
  if (filters?.patientId) { conditions.push('patient_id=?');  params.push(filters.patientId); }
  if (filters?.category)  { conditions.push('category=?');    params.push(filters.category); }
  if (filters?.archived !== undefined) {
    conditions.push('is_archived=?'); params.push(filters.archived ? 1 : 0);
  }
  if (filters?.staffId) {
    // Filter threads where staffId is creator or participant
    conditions.push(`(creator_id=? OR participant_ids LIKE ?)`);
    params.push(filters.staffId, `%"${filters.staffId}"%`);
  }
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM msg_threads WHERE ${conditions.join(' AND ')} ORDER BY updated_at DESC`,
    params
  );
  return rows.map(rowToThread);
}

export async function getThread(kv: KVNamespace, id: string, db?: D1Database): Promise<MessageThread | null> {
  if (!db) return null;
  const row = await dbGet<Record<string, unknown>>(db, `SELECT * FROM msg_threads WHERE id=?`, [id]);
  return row ? rowToThread(row) : null;
}

export async function createThread(
  kv: KVNamespace,
  data: {
    subject: string
    category: MessageCategory
    priority: MessagePriority
    participantIds: string[]
    creatorId: string
    creatorName: string
    patientId?: string
    patientName?: string
    initialMessage: string
  },
  db?: D1Database
): Promise<MessageThread> {
  if (!db) throw new Error('D1 required');
  const now = dbNow();
  const tid = `thread-${Date.now().toString(36)}`;
  const mid = `msg-${Date.now().toString(36)}`;

  await dbRun(db,
    `INSERT INTO msg_threads
       (id, subject, category, priority, patient_id, patient_name,
        creator_id, creator_name, participant_ids, status,
        message_count, last_message_at, read_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?,?)`,
    [
      tid, data.subject, data.category, data.priority,
      data.patientId ?? null, data.patientName ?? null,
      data.creatorId, data.creatorName,
      JSON.stringify(data.participantIds),
      'OPEN', now,
      JSON.stringify([data.creatorId]),
      now, now,
    ]
  );

  const staffMember = STAFF_DIRECTORY.find(s => s.id === data.creatorId);
  await dbRun(db,
    `INSERT INTO msg_messages (id, thread_id, sender_id, sender_name, sender_role, content, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [mid, tid, data.creatorId, data.creatorName, staffMember?.role ?? 'FRONT_DESK', data.initialMessage, now]
  );

  return (await getThread(kv, tid, db))!;
}

export async function replyToThread(
  kv: KVNamespace,
  threadId: string,
  data: { senderId: string; senderName: string; body: string },
  db?: D1Database
): Promise<StaffMessage | null> {
  if (!db) return null;
  const now = dbNow();
  const mid = `msg-${Date.now().toString(36)}`;
  const staff = STAFF_DIRECTORY.find(s => s.id === data.senderId);

  await dbRun(db,
    `INSERT INTO msg_messages (id, thread_id, sender_id, sender_name, sender_role, content, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [mid, threadId, data.senderId, data.senderName, staff?.role ?? 'FRONT_DESK', data.body, now]
  );

  // Update thread metadata
  await dbRun(db,
    `UPDATE msg_threads
       SET message_count = message_count + 1, last_message_at=?, updated_at=?
     WHERE id=?`,
    [now, now, threadId]
  );

  const row = await dbGet<Record<string, unknown>>(db, `SELECT * FROM msg_messages WHERE id=?`, [mid]);
  return row ? rowToMessage(row) : null;
}

export async function getThreadMessages(kv: KVNamespace, threadId: string, db?: D1Database): Promise<StaffMessage[]> {
  if (!db) return [];
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM msg_messages WHERE thread_id=? ORDER BY created_at ASC`, [threadId]
  );
  return rows.map(rowToMessage);
}

export async function markThreadRead(kv: KVNamespace, threadId: string, staffId: string, db?: D1Database): Promise<void> {
  if (!db) return;
  const thread = await getThread(kv, threadId, db);
  if (!thread) return;
  const readBy = Array.from(new Set([...thread.readBy, staffId]));
  await dbRun(db, `UPDATE msg_threads SET read_by=?, updated_at=? WHERE id=?`,
    [JSON.stringify(readBy), dbNow(), threadId]);
}

export async function archiveThread(kv: KVNamespace, threadId: string, archived: boolean, db?: D1Database): Promise<void> {
  if (!db) return;
  await dbRun(db, `UPDATE msg_threads SET is_archived=?, updated_at=? WHERE id=?`,
    [archived ? 1 : 0, dbNow(), threadId]);
}

export async function pinThread(kv: KVNamespace, threadId: string, pinned: boolean, db?: D1Database): Promise<void> {
  if (!db) return;
  await dbRun(db, `UPDATE msg_threads SET is_pinned=?, updated_at=? WHERE id=?`,
    [pinned ? 1 : 0, dbNow(), threadId]);
}

// ── Clinical Tasks ────────────────────────────────────────────────────────────
export async function listTasks(
  kv: KVNamespace,
  filters?: { assignedTo?: string; patientId?: string; status?: TaskStatus; priority?: TaskPriority },
  db?: D1Database
): Promise<ClinicalTask[]> {
  if (!db) return [];
  const conditions: string[] = [];
  const params: unknown[]    = [];
  if (filters?.assignedTo) { conditions.push('assigned_to=?'); params.push(filters.assignedTo); }
  if (filters?.patientId)  { conditions.push('patient_id=?');  params.push(filters.patientId); }
  if (filters?.status)     { conditions.push('status=?');      params.push(filters.status); }
  if (filters?.priority)   { conditions.push('priority=?');    params.push(filters.priority); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM msg_tasks ${where} ORDER BY due_date ASC NULLS LAST, created_at DESC`, params
  );
  return rows.map(rowToTask);
}

export async function getTask(kv: KVNamespace, id: string, db?: D1Database): Promise<ClinicalTask | null> {
  if (!db) return null;
  const row = await dbGet<Record<string, unknown>>(db, `SELECT * FROM msg_tasks WHERE id=?`, [id]);
  return row ? rowToTask(row) : null;
}

export async function createTask(
  kv: KVNamespace,
  data: Omit<ClinicalTask, 'id' | 'comments' | 'createdAt' | 'updatedAt'>,
  db?: D1Database
): Promise<ClinicalTask> {
  if (!db) throw new Error('D1 required');
  const now = dbNow();
  const id  = `task-${Date.now().toString(36)}`;
  await dbRun(db,
    `INSERT INTO msg_tasks
       (id, title, description, category, priority, status,
        patient_id, patient_name, assigned_to, assigned_name,
        created_by, created_by_name, due_date, thread_id, comments,
        created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, data.title, data.description ?? null,
      data.category, data.priority, data.status,
      data.patientId ?? null, data.patientName ?? null,
      data.assignedToId, data.assignedToName,
      data.createdById, data.createdByName,
      data.dueDate ?? null, data.threadId ?? null,
      '[]', now, now,
    ]
  );
  return (await getTask(kv, id, db))!;
}

export async function updateTask(
  kv: KVNamespace, id: string, patch: Partial<ClinicalTask>, db?: D1Database
): Promise<ClinicalTask | null> {
  if (!db) return null;
  const sets: string[]  = ['updated_at=?'];
  const vals: unknown[] = [dbNow()];

  if (patch.status       !== undefined) {
    sets.push('status=?'); vals.push(patch.status);
    if (patch.status === 'DONE') { sets.push('completed_at=?'); vals.push(dbNow()); }
  }
  if (patch.priority     !== undefined) { sets.push('priority=?');     vals.push(patch.priority); }
  if (patch.dueDate      !== undefined) { sets.push('due_date=?');      vals.push(patch.dueDate); }
  if (patch.assignedToId !== undefined) { sets.push('assigned_to=?');   vals.push(patch.assignedToId); }
  if (patch.description  !== undefined) { sets.push('description=?');   vals.push(patch.description); }

  vals.push(id);
  await dbRun(db, `UPDATE msg_tasks SET ${sets.join(', ')} WHERE id=?`, vals);
  return getTask(kv, id, db);
}

export async function addTaskComment(
  kv: KVNamespace,
  taskId: string,
  data: { authorId: string; authorName: string; content: string },
  db?: D1Database
): Promise<ClinicalTask | null> {
  if (!db) return null;
  const task = await getTask(kv, taskId, db);
  if (!task) return null;
  const comment: TaskComment = {
    id: `cmt-${Date.now().toString(36)}`,
    authorId: data.authorId, authorName: data.authorName,
    content: data.content, createdAt: dbNow(),
  };
  await dbRun(db,
    `UPDATE msg_tasks SET comments=?, updated_at=? WHERE id=?`,
    [JSON.stringify([...task.comments, comment]), dbNow(), taskId]
  );
  return getTask(kv, taskId, db);
}

// ── Recalls ───────────────────────────────────────────────────────────────────
export async function listRecalls(
  kv: KVNamespace,
  filters?: { patientId?: string; status?: RecallStatus },
  db?: D1Database
): Promise<RecallEntry[]> {
  if (!db) return [];
  const conditions: string[] = [];
  const params: unknown[]    = [];
  if (filters?.patientId) { conditions.push('patient_id=?'); params.push(filters.patientId); }
  if (filters?.status)    { conditions.push('status=?');     params.push(filters.status); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM msg_recalls ${where} ORDER BY due_date ASC`, params
  );
  return rows.map(rowToRecall);
}

export async function createRecall(
  kv: KVNamespace,
  data: Omit<RecallEntry, 'id' | 'createdAt' | 'updatedAt'>,
  db?: D1Database
): Promise<RecallEntry> {
  if (!db) throw new Error('D1 required');
  const now = dbNow();
  const id  = `recall-${Date.now().toString(36)}`;
  await dbRun(db,
    `INSERT INTO msg_recalls
       (id, patient_id, patient_name, recall_type, due_date, priority, status,
        notes, assigned_to, contact_attempts, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,0,?,?)`,
    [
      id, data.patientId, data.patientName,
      data.recallType, data.dueDate, data.priority, data.status,
      data.notes ?? null, data.assignedTo ?? null,
      now, now,
    ]
  );
  return (await listRecalls(kv, { patientId: data.patientId }, db)).find(r => r.id === id)!;
}

export async function updateRecall(
  kv: KVNamespace, id: string, patch: Partial<RecallEntry>, db?: D1Database
): Promise<RecallEntry | null> {
  if (!db) return null;
  const sets: string[]  = ['updated_at=?'];
  const vals: unknown[] = [dbNow()];
  if (patch.status            !== undefined) { sets.push('status=?');             vals.push(patch.status); }
  if (patch.lastContactDate   !== undefined) { sets.push('last_contact_date=?');  vals.push(patch.lastContactDate); }
  if (patch.contactAttempts   !== undefined) { sets.push('contact_attempts=?');   vals.push(patch.contactAttempts); }
  if (patch.notes             !== undefined) { sets.push('notes=?');              vals.push(patch.notes); }
  vals.push(id);
  await dbRun(db, `UPDATE msg_recalls SET ${sets.join(', ')} WHERE id=?`, vals);
  const row = await dbGet<Record<string, unknown>>(db, `SELECT * FROM msg_recalls WHERE id=?`, [id]);
  return row ? rowToRecall(row) : null;
}

// ── Messaging Dashboard ───────────────────────────────────────────────────────
export async function getMessagingDashboard(
  kv: KVNamespace, staffId?: string, db?: D1Database
): Promise<MessagingDashboard> {
  if (!db) return {
    unreadCount: 0, urgentCount: 0, myThreads: [],
    pendingTasks: 0, overdueTasks: 0, myTasks: [],
    pendingRecalls: 0, overdueRecalls: 0,
  };

  const today = dbNow().slice(0, 10);

  const [allThreads, allTasks, allRecalls] = await Promise.all([
    listThreads(kv, staffId ? { staffId } : undefined, db),
    listTasks(kv, staffId ? { assignedTo: staffId } : undefined, db),
    listRecalls(kv, undefined, db),
  ]);

  const openTasks    = allTasks.filter(t => !['DONE', 'CANCELLED'].includes(t.status));
  const overdueTasks = openTasks.filter(t => t.dueDate && t.dueDate < today);
  const openRecalls  = allRecalls.filter(r => r.status === 'PENDING');
  const overdueRecalls = openRecalls.filter(r => r.dueDate < today);

  return {
    unreadCount:    allThreads.filter(t => !t.isArchived && staffId && !t.readBy.includes(staffId)).length,
    urgentCount:    allThreads.filter(t => t.priority === 'URGENT' || t.priority === 'STAT').length,
    myThreads:      allThreads.filter(t => !t.isArchived).slice(0, 10),
    pendingTasks:   openTasks.length,
    overdueTasks:   overdueTasks.length,
    myTasks:        openTasks.slice(0, 10),
    pendingRecalls: openRecalls.length,
    overdueRecalls: overdueRecalls.length,
  };
}
