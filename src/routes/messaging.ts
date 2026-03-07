// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 5A: Clinical Messaging & Task Board — Routes
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import {
  ensureMessagingSeed,
  listStaff, getStaffMember,
  listThreads, getThread, createThread, replyToThread,
  getThreadMessages, markThreadRead, archiveThread, pinThread,
  listTasks, getTask, createTask, updateTask, addTaskComment,
  listRecalls, createRecall, updateRecall,
  getMessagingDashboard,
} from '../lib/messaging'
import type { MessageCategory, MessagePriority, StaffRole, TaskCategory, TaskStatus, TaskPriority, RecallReason, RecallStatus } from '../types/messaging'

type Bindings = { OCULOFLOW_KV: KVNamespace }
type Resp     = { success: boolean; data?: unknown; message?: string; error?: string }

const messagingRoutes = new Hono<{ Bindings: Bindings }>()

// ── Health / seed ──────────────────────────────────────────────────────────────

messagingRoutes.get('/ping', async (c) => {
  await ensureMessagingSeed(c.env.OCULOFLOW_KV)
  return c.json<Resp>({ success: true, data: { status: 'ok', module: 'messaging' } })
})

// ── Dashboard ─────────────────────────────────────────────────────────────────

messagingRoutes.get('/dashboard', async (c) => {
  try {
    const staffId = c.req.query('staffId')
    const data = await getMessagingDashboard(c.env.OCULOFLOW_KV, staffId)
    return c.json<Resp>({ success: true, data })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── Staff ─────────────────────────────────────────────────────────────────────

messagingRoutes.get('/staff', async (c) => {
  try {
    const staff = await listStaff(c.env.OCULOFLOW_KV)
    return c.json<Resp>({ success: true, data: staff })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

messagingRoutes.get('/staff/:id', async (c) => {
  try {
    const member = await getStaffMember(c.env.OCULOFLOW_KV, c.req.param('id'))
    if (!member) return c.json<Resp>({ success: false, error: 'Staff member not found' }, 404)
    return c.json<Resp>({ success: true, data: member })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── Threads ───────────────────────────────────────────────────────────────────

messagingRoutes.get('/threads', async (c) => {
  try {
    const { participantId, category, priority, archived } = c.req.query()
    const threads = await listThreads(c.env.OCULOFLOW_KV, {
      participantId,
      category,
      priority,
      archived: archived === 'true' ? true : archived === 'false' ? false : undefined,
    })
    return c.json<Resp>({ success: true, data: threads })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

messagingRoutes.get('/threads/:id', async (c) => {
  try {
    const thread = await getThread(c.env.OCULOFLOW_KV, c.req.param('id'))
    if (!thread) return c.json<Resp>({ success: false, error: 'Thread not found' }, 404)
    return c.json<Resp>({ success: true, data: thread })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

messagingRoutes.get('/threads/:id/messages', async (c) => {
  try {
    const messages = await getThreadMessages(c.env.OCULOFLOW_KV, c.req.param('id'))
    return c.json<Resp>({ success: true, data: messages })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

messagingRoutes.post('/threads', async (c) => {
  try {
    const body = await c.req.json()
    const required = ['subject', 'category', 'priority', 'participantIds', 'participantNames', 'createdById', 'createdByName', 'body', 'senderRole']
    const missing = required.filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)

    const thread = await createThread(c.env.OCULOFLOW_KV, body)
    return c.json<Resp>({ success: true, data: thread, message: 'Thread created' }, 201)
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

messagingRoutes.post('/threads/:id/reply', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.senderId || !body.senderName || !body.senderRole || !body.body) {
      return c.json<Resp>({ success: false, error: 'senderId, senderName, senderRole, body are required' }, 400)
    }
    const message = await replyToThread(c.env.OCULOFLOW_KV, c.req.param('id'), body)
    return c.json<Resp>({ success: true, data: message }, 201)
  } catch (err) {
    const msg = String(err)
    if (msg.includes('not found')) return c.json<Resp>({ success: false, error: msg }, 404)
    return c.json<Resp>({ success: false, error: msg }, 500)
  }
})

messagingRoutes.post('/threads/:id/read', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.staffId) return c.json<Resp>({ success: false, error: 'staffId required' }, 400)
    await markThreadRead(c.env.OCULOFLOW_KV, c.req.param('id'), body.staffId)
    return c.json<Resp>({ success: true, message: 'Marked as read' })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

messagingRoutes.patch('/threads/:id/archive', async (c) => {
  try {
    const body = await c.req.json()
    await archiveThread(c.env.OCULOFLOW_KV, c.req.param('id'), body.archived ?? true)
    return c.json<Resp>({ success: true, message: `Thread ${body.archived ? 'archived' : 'unarchived'}` })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

messagingRoutes.patch('/threads/:id/pin', async (c) => {
  try {
    const body = await c.req.json()
    await pinThread(c.env.OCULOFLOW_KV, c.req.param('id'), body.pinned ?? true)
    return c.json<Resp>({ success: true, message: `Thread ${body.pinned ? 'pinned' : 'unpinned'}` })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── Tasks ─────────────────────────────────────────────────────────────────────

messagingRoutes.get('/tasks', async (c) => {
  try {
    const { assignedToId, status, priority, category, patientId } = c.req.query()
    const tasks = await listTasks(c.env.OCULOFLOW_KV, { assignedToId, status, priority, category, patientId })
    return c.json<Resp>({ success: true, data: tasks })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

messagingRoutes.get('/tasks/:id', async (c) => {
  try {
    const task = await getTask(c.env.OCULOFLOW_KV, c.req.param('id'))
    if (!task) return c.json<Resp>({ success: false, error: 'Task not found' }, 404)
    return c.json<Resp>({ success: true, data: task })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

messagingRoutes.post('/tasks', async (c) => {
  try {
    const body = await c.req.json()
    const required = ['title', 'category', 'priority', 'assignedById', 'assignedByName']
    const missing = required.filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)

    const task = await createTask(c.env.OCULOFLOW_KV, {
      title: body.title, description: body.description,
      category: body.category as TaskCategory,
      status: (body.status ?? 'OPEN') as TaskStatus,
      priority: body.priority as TaskPriority,
      assignedToId: body.assignedToId, assignedToName: body.assignedToName,
      assignedById: body.assignedById, assignedByName: body.assignedByName,
      patientId: body.patientId, patientName: body.patientName,
      dueDate: body.dueDate, dueTime: body.dueTime,
      tags: body.tags ?? [],
    })
    return c.json<Resp>({ success: true, data: task, message: 'Task created' }, 201)
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

messagingRoutes.patch('/tasks/:id', async (c) => {
  try {
    const body = await c.req.json()
    const task = await updateTask(c.env.OCULOFLOW_KV, c.req.param('id'), body)
    if (!task) return c.json<Resp>({ success: false, error: 'Task not found' }, 404)
    return c.json<Resp>({ success: true, data: task, message: 'Task updated' })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

messagingRoutes.post('/tasks/:id/comments', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.authorId || !body.authorName || !body.body) {
      return c.json<Resp>({ success: false, error: 'authorId, authorName, body required' }, 400)
    }
    const comment = await addTaskComment(c.env.OCULOFLOW_KV, c.req.param('id'), body)
    if (!comment) return c.json<Resp>({ success: false, error: 'Task not found' }, 404)
    return c.json<Resp>({ success: true, data: comment }, 201)
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── Recalls ───────────────────────────────────────────────────────────────────

messagingRoutes.get('/recalls', async (c) => {
  try {
    const { status, assignedToId, overdueOnly } = c.req.query()
    const recalls = await listRecalls(c.env.OCULOFLOW_KV, {
      status, assignedToId, overdueOnly: overdueOnly === 'true'
    })
    return c.json<Resp>({ success: true, data: recalls })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

messagingRoutes.post('/recalls', async (c) => {
  try {
    const body = await c.req.json()
    const required = ['patientId', 'patientName', 'patientPhone', 'patientEmail', 'reason', 'dueDate', 'priority']
    const missing = required.filter(k => !body[k])
    if (missing.length) return c.json<Resp>({ success: false, error: `Missing: ${missing.join(', ')}` }, 400)
    const recall = await createRecall(c.env.OCULOFLOW_KV, {
      ...body,
      status: (body.status ?? 'PENDING') as RecallStatus,
      reason: body.reason as RecallReason,
    })
    return c.json<Resp>({ success: true, data: recall, message: 'Recall created' }, 201)
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

messagingRoutes.patch('/recalls/:id', async (c) => {
  try {
    const body = await c.req.json()
    const recall = await updateRecall(c.env.OCULOFLOW_KV, c.req.param('id'), body)
    if (!recall) return c.json<Resp>({ success: false, error: 'Recall not found' }, 404)
    return c.json<Resp>({ success: true, data: recall, message: 'Recall updated' })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

export default messagingRoutes
