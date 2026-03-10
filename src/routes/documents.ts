// Phase B2 — Documents & File Management API Routes
// GET    /api/documents                    — list documents (auth)
// POST   /api/documents/upload             — upload file (base64 JSON body)
// GET    /api/documents/:id                — get doc metadata
// GET    /api/documents/:id/download       — stream file contents
// DELETE /api/documents/:id               — soft-delete (ADMIN/PROVIDER)
// POST   /api/documents/pdf/superbill      — generate superbill PDF from billing data
// POST   /api/documents/pdf/statement      — generate patient statement PDF
// POST   /api/documents/pdf/referral       — generate referral letter PDF
// GET    /api/documents/exam/:examId       — list exam attachments
// GET    /api/documents/patient/:patientId — list patient documents
// GET    /api/documents/thread/:threadId   — list message thread attachments
// GET    /api/documents/pa/:paId           — list prior-auth supporting docs
// GET    /api/documents/storage/status     — R2 vs KV status

import { Hono } from 'hono'
import {
  uploadDocument, downloadDocument, listDocuments, getDocMeta, deleteDocument,
  generateSuperbillPdf, generateStatementPdf, generateReferralPdf,
  type DocCategory,
} from '../lib/documents'
import { requireAuth, requireRole } from '../middleware/auth'
import { writeAudit } from '../lib/audit'

type Bindings = {
  OCULOFLOW_KV:     KVNamespace
  DB: D1Database
  OCULOFLOW_R2?:    R2Bucket
  JWT_SECRET?:      string
  PRACTICE_NAME?:   string
  DEMO_MODE?:       string
}
type Variables = { auth: import('../types/auth').AuthContext }
type Resp = { success: boolean; data?: unknown; error?: string; message?: string }

const docRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// ── Helper ─────────────────────────────────────────────────────────────────────
function r2OrNull(env: Bindings): R2Bucket | null {
  return env.OCULOFLOW_R2 ?? null
}

// ── GET /storage/status ────────────────────────────────────────────────────────
docRoutes.get('/storage/status', requireAuth, (c) => {
  const r2Available = !!(c.env.OCULOFLOW_R2)
  return c.json<Resp>({
    success: true,
    data: {
      r2: { available: r2Available, bucket: 'oculoflow-documents', note: r2Available ? 'R2 active — full file size support' : 'R2 not bound — using KV fallback (max 512 KB per file)' },
      kv: { available: true, maxFileSizeKB: 512, note: 'KV fallback active for files ≤512 KB' },
      activeBackend: r2Available ? 'R2' : 'KV',
      recommendation: r2Available ? null : 'Enable Cloudflare R2 in your dashboard and add r2_buckets binding to wrangler.jsonc for files larger than 512 KB',
    },
  })
})

// ── GET / — list all documents ─────────────────────────────────────────────────
docRoutes.get('/', requireAuth, async (c) => {
  const { patientId, examId, paId, threadId, sbId, category, limit } = c.req.query() as Record<string, string>
  try {
    const docs = await listDocuments(c.env.OCULOFLOW_KV, {
      patientId, examId, paRequestId: paId,
      messagingThreadId: threadId, superbillId: sbId,
      category: category as DocCategory | undefined,
      limit: limit ? parseInt(limit) : 100,
    })
    return c.json<Resp>({ success: true, data: { documents: docs, total: docs.length } })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── GET /patient/:patientId ────────────────────────────────────────────────────
docRoutes.get('/patient/:patientId', requireAuth, async (c) => {
  const patientId = c.req.param('patientId')
  const docs = await listDocuments(c.env.OCULOFLOW_KV, { patientId })
  return c.json<Resp>({ success: true, data: { documents: docs, total: docs.length } })
})

// ── GET /exam/:examId ──────────────────────────────────────────────────────────
docRoutes.get('/exam/:examId', requireAuth, async (c) => {
  const examId = c.req.param('examId')
  const docs = await listDocuments(c.env.OCULOFLOW_KV, { examId })
  return c.json<Resp>({ success: true, data: { documents: docs, total: docs.length } })
})

// ── GET /thread/:threadId ──────────────────────────────────────────────────────
docRoutes.get('/thread/:threadId', requireAuth, async (c) => {
  const threadId = c.req.param('threadId')
  const docs = await listDocuments(c.env.OCULOFLOW_KV, { messagingThreadId: threadId })
  return c.json<Resp>({ success: true, data: { documents: docs, total: docs.length } })
})

// ── GET /pa/:paId ──────────────────────────────────────────────────────────────
docRoutes.get('/pa/:paId', requireAuth, async (c) => {
  const paId = c.req.param('paId')
  const docs = await listDocuments(c.env.OCULOFLOW_KV, { paRequestId: paId })
  return c.json<Resp>({ success: true, data: { documents: docs, total: docs.length } })
})

// ── POST /upload ───────────────────────────────────────────────────────────────
// Body: { fileName, mimeType, dataBase64, category, description?, patientId?, examId?, paRequestId?, messagingThreadId?, superbillId? }
docRoutes.post('/upload', requireAuth, async (c) => {
  const auth = c.get('auth')
  try {
    const body = await c.req.json() as {
      fileName: string
      mimeType: string
      dataBase64: string   // base64 encoded file content
      category: DocCategory
      description?: string
      patientId?: string
      examId?: string
      paRequestId?: string
      messagingThreadId?: string
      superbillId?: string
    }

    if (!body.fileName || !body.mimeType || !body.dataBase64 || !body.category) {
      return c.json<Resp>({ success: false, error: 'fileName, mimeType, dataBase64, and category are required' }, 400)
    }

    const result = await uploadDocument(c.env.OCULOFLOW_KV, r2OrNull(c.env), {
      fileName:     body.fileName,
      mimeType:     body.mimeType,
      data:         body.dataBase64,
      category:     body.category,
      uploadedBy:   auth.userId,
      uploadedByName: auth.displayName ?? auth.email,
      description:  body.description,
      patientId:    body.patientId,
      examId:       body.examId,
      paRequestId:  body.paRequestId,
      messagingThreadId: body.messagingThreadId,
      superbillId:  body.superbillId,
    })

    await writeAudit(c.env.OCULOFLOW_KV, {
      event: 'PHI_CREATE', userId: auth.userId, userEmail: auth.email, userRole: auth.role,
      resource: 'document', resourceId: result.doc.id, action: 'upload',
      outcome: 'success', ip: c.req.header('cf-connecting-ip') ?? 'unknown',
      userAgent: c.req.header('user-agent') ?? '',
      detail: `Uploaded ${body.category}: ${body.fileName} (${result.doc.sizeBytes} bytes) via ${result.backend}`,
    }, c.env.DB)

    return c.json<Resp>({ success: true, data: result, message: `File uploaded via ${result.backend}` }, 201)
  } catch (err: any) {
    return c.json<Resp>({ success: false, error: err.message ?? String(err) }, 500)
  }
})

// ── GET /:id — metadata ────────────────────────────────────────────────────────
docRoutes.get('/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  if (id === 'upload' || id === 'storage' || id === 'pdf') return c.notFound()
  const meta = await getDocMeta(c.env.OCULOFLOW_KV, id)
  if (!meta) return c.json<Resp>({ success: false, error: 'Document not found' }, 404)
  return c.json<Resp>({ success: true, data: meta })
})

// ── GET /:id/download ──────────────────────────────────────────────────────────
docRoutes.get('/:id/download', requireAuth, async (c) => {
  const auth  = c.get('auth')
  const id    = c.req.param('id')
  try {
    const file = await downloadDocument(c.env.OCULOFLOW_KV, r2OrNull(c.env), id)
    if (!file) return c.json<Resp>({ success: false, error: 'Document not found' }, 404)

    await writeAudit(c.env.OCULOFLOW_KV, {
      event: 'PHI_READ', userId: auth.userId, userEmail: auth.email, userRole: auth.role,
      resource: 'document', resourceId: id, action: 'download',
      outcome: 'success', ip: c.req.header('cf-connecting-ip') ?? 'unknown',
      userAgent: c.req.header('user-agent') ?? '',
      detail: `Downloaded document ${id}`,
    }, c.env.DB)

    return new Response(file.body as BodyInit, {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    return c.json<Resp>({ success: false, error: String(err) }, 500)
  }
})

// ── DELETE /:id ────────────────────────────────────────────────────────────────
docRoutes.delete('/:id', requireAuth, requireRole('ADMIN', 'PROVIDER'), async (c) => {
  const auth = c.get('auth')
  const id   = c.req.param('id')
  const ok   = await deleteDocument(c.env.OCULOFLOW_KV, r2OrNull(c.env), id)
  if (!ok) return c.json<Resp>({ success: false, error: 'Document not found' }, 404)

  await writeAudit(c.env.OCULOFLOW_KV, {
    event: 'PHI_DELETE', userId: auth.userId, userEmail: auth.email, userRole: auth.role,
    resource: 'document', resourceId: id, action: 'delete',
    outcome: 'success', ip: c.req.header('cf-connecting-ip') ?? 'unknown',
    userAgent: c.req.header('user-agent') ?? '',
    detail: `Deleted document ${id}`,
  }, c.env.DB)

  return c.json<Resp>({ success: true, message: 'Document deleted' })
})

// ── POST /pdf/superbill ────────────────────────────────────────────────────────
// Generates a superbill PDF and optionally stores it as a document
docRoutes.post('/pdf/superbill', requireAuth, requireRole('BILLING', 'ADMIN', 'PROVIDER'), async (c) => {
  const auth = c.get('auth')
  try {
    const body = await c.req.json() as {
      superbillId: string; patientName: string; patientDob?: string
      serviceDate: string; diagnoses: string[]
      lineItems: Array<{ cptCode: string; description: string; units: number; chargedAmount: number }>
      totalCharged: number; totalPaid?: number; balance?: number
      patientId?: string; store?: boolean
    }

    const practice = c.env.PRACTICE_NAME ?? 'Advanced Eye Care of Miami'
    const pdfBytes = generateSuperbillPdf({
      id: body.superbillId, patientName: body.patientName, patientDob: body.patientDob,
      serviceDate: body.serviceDate, diagnoses: body.diagnoses, lineItems: body.lineItems,
      totalCharged: body.totalCharged, totalPaid: body.totalPaid, balance: body.balance,
      practiceName: practice,
    })

    // Optionally store in document system
    let stored: any = null
    if (body.store !== false) {
      const b64 = btoa(String.fromCharCode(...pdfBytes))
      stored = await uploadDocument(c.env.OCULOFLOW_KV, r2OrNull(c.env), {
        fileName:      `superbill-${body.superbillId}.pdf`,
        mimeType:      'application/pdf',
        data:          b64,
        category:      'SUPERBILL_PDF',
        uploadedBy:    auth.userId,
        uploadedByName: auth.displayName ?? auth.email,
        description:   `Superbill ${body.superbillId} — ${body.patientName}`,
        patientId:     body.patientId,
        superbillId:   body.superbillId,
      })
    }

    await writeAudit(c.env.OCULOFLOW_KV, {
      event: 'PHI_CREATE', userId: auth.userId, userEmail: auth.email, userRole: auth.role,
      resource: 'superbill_pdf', resourceId: body.superbillId, action: 'generate',
      outcome: 'success', ip: c.req.header('cf-connecting-ip') ?? 'unknown',
      userAgent: c.req.header('user-agent') ?? '',
      detail: `Generated superbill PDF for ${body.patientName}`,
    }, c.env.DB)

    // Return PDF directly as download
    const headers: Record<string, string> = {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="superbill-${body.superbillId}.pdf"`,
      'Cache-Control': 'no-store',
    }
    if (stored) headers['X-Document-Id'] = stored.doc.id

    return new Response(pdfBytes, { headers })
  } catch (err: any) {
    return c.json<Resp>({ success: false, error: err.message ?? String(err) }, 500)
  }
})

// ── POST /pdf/statement ────────────────────────────────────────────────────────
docRoutes.post('/pdf/statement', requireAuth, requireRole('BILLING', 'ADMIN', 'PROVIDER'), async (c) => {
  const auth = c.get('auth')
  try {
    const body = await c.req.json() as {
      statementId: string; patientName: string; patientAddress?: string
      statementDate: string; dueDate?: string
      items: Array<{ date: string; description: string; charges: number; payments: number; balance: number }>
      totalCharges: number; totalPayments: number; totalBalance: number
      patientId?: string; store?: boolean
    }

    const practice = c.env.PRACTICE_NAME ?? 'Advanced Eye Care of Miami'
    const pdfBytes = generateStatementPdf({
      id: body.statementId, patientName: body.patientName, patientAddress: body.patientAddress,
      statementDate: body.statementDate, dueDate: body.dueDate,
      items: body.items, totalCharges: body.totalCharges,
      totalPayments: body.totalPayments, totalBalance: body.totalBalance,
      practiceName: practice,
    })

    let stored: any = null
    if (body.store !== false) {
      const b64 = btoa(String.fromCharCode(...pdfBytes))
      stored = await uploadDocument(c.env.OCULOFLOW_KV, r2OrNull(c.env), {
        fileName:      `statement-${body.statementId}.pdf`,
        mimeType:      'application/pdf',
        data:          b64,
        category:      'STATEMENT_PDF',
        uploadedBy:    auth.userId,
        uploadedByName: auth.displayName ?? auth.email,
        description:   `Statement ${body.statementId} — ${body.patientName}`,
        patientId:     body.patientId,
      })
    }

    await writeAudit(c.env.OCULOFLOW_KV, {
      event: 'PHI_CREATE', userId: auth.userId, userEmail: auth.email, userRole: auth.role,
      resource: 'statement_pdf', resourceId: body.statementId, action: 'generate',
      outcome: 'success', ip: c.req.header('cf-connecting-ip') ?? 'unknown',
      userAgent: c.req.header('user-agent') ?? '',
      detail: `Generated statement PDF for ${body.patientName}`,
    }, c.env.DB)

    const headers: Record<string, string> = {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="statement-${body.statementId}.pdf"`,
      'Cache-Control': 'no-store',
    }
    if (stored) headers['X-Document-Id'] = stored.doc.id

    return new Response(pdfBytes, { headers })
  } catch (err: any) {
    return c.json<Resp>({ success: false, error: err.message ?? String(err) }, 500)
  }
})

// ── POST /pdf/referral ─────────────────────────────────────────────────────────
docRoutes.post('/pdf/referral', requireAuth, requireRole('PROVIDER', 'ADMIN', 'NURSE'), async (c) => {
  const auth = c.get('auth')
  try {
    const body = await c.req.json() as {
      patientName: string; patientDob?: string; referralDate: string
      referringProvider: string; referringNpi?: string
      toProvider: string; toSpecialty: string
      reason: string; urgency: 'ROUTINE' | 'URGENT' | 'EMERGENT'
      diagnosis: string; notes?: string
      patientId?: string; store?: boolean
    }

    const practice = c.env.PRACTICE_NAME ?? 'Advanced Eye Care of Miami'
    const pdfBytes = generateReferralPdf({
      ...body,
      practiceName: practice,
    })

    let stored: any = null
    const refId = `ref-${Date.now().toString(36)}`
    if (body.store !== false) {
      const b64 = btoa(String.fromCharCode(...pdfBytes))
      stored = await uploadDocument(c.env.OCULOFLOW_KV, r2OrNull(c.env), {
        fileName:      `referral-${refId}.pdf`,
        mimeType:      'application/pdf',
        data:          b64,
        category:      'REFERRAL_LETTER',
        uploadedBy:    auth.userId,
        uploadedByName: auth.displayName ?? auth.email,
        description:   `Referral to ${body.toProvider} — ${body.patientName}`,
        patientId:     body.patientId,
      })
    }

    await writeAudit(c.env.OCULOFLOW_KV, {
      event: 'PHI_CREATE', userId: auth.userId, userEmail: auth.email, userRole: auth.role,
      resource: 'referral_pdf', resourceId: refId, action: 'generate',
      outcome: 'success', ip: c.req.header('cf-connecting-ip') ?? 'unknown',
      userAgent: c.req.header('user-agent') ?? '',
      detail: `Generated referral PDF for ${body.patientName} → ${body.toProvider}`,
    }, c.env.DB)

    const headers: Record<string, string> = {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="referral-${refId}.pdf"`,
      'Cache-Control': 'no-store',
    }
    if (stored) headers['X-Document-Id'] = stored.doc.id

    return new Response(pdfBytes, { headers })
  } catch (err: any) {
    return c.json<Resp>({ success: false, error: err.message ?? String(err) }, 500)
  }
})

export default docRoutes
