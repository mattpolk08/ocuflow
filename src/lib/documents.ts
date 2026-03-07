// Phase B2 — Documents & File Management
// Handles clinical photos, scan uploads, PDF superbills, referral letters, attachments.
// Storage: Cloudflare R2 (when bound) → KV fallback for small files (≤512KB base64)
// PDF generation: pure-JS (no external deps, Cloudflare Workers compatible)

// ─── KV helpers ───────────────────────────────────────────────────────────────
async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key, 'text'); return v ? JSON.parse(v) as T : null
}
async function kvPut(kv: KVNamespace, key: string, val: unknown, ttlSec?: number): Promise<void> {
  const opts: KVNamespacePutOptions = ttlSec ? { expirationTtl: Math.max(ttlSec, 60) } : {}
  await kv.put(key, JSON.stringify(val), opts)
}

const uid  = (pfx = 'doc') => `${pfx}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`
const now  = () => new Date().toISOString()

// ─── Types ────────────────────────────────────────────────────────────────────
export type DocCategory =
  | 'CLINICAL_PHOTO'     // fundus, slit lamp, OCT
  | 'INSURANCE_CARD'     // front/back insurance card scan
  | 'REFERRAL_LETTER'    // outbound referral PDFs
  | 'SUPERBILL_PDF'      // generated superbill PDF
  | 'STATEMENT_PDF'      // patient statement PDF
  | 'PRIOR_AUTH_SUPPORT' // supporting docs for PA
  | 'INTAKE_FORM'        // signed intake / HIPAA forms
  | 'EXAM_ATTACHMENT'    // misc exam attachments
  | 'MESSAGING_ATTACH'   // file attached to secure message
  | 'OTHER'

export type DocStorageBackend = 'R2' | 'KV'

export interface DocMeta {
  id: string
  category: DocCategory
  fileName: string
  mimeType: string
  sizeBytes: number
  storageBackend: DocStorageBackend
  r2Key?: string         // R2 object key when stored in R2
  // Relations
  patientId?: string
  examId?: string
  paRequestId?: string
  messagingThreadId?: string
  superbillId?: string
  // Metadata
  uploadedBy: string     // userId
  uploadedByName: string
  description?: string
  createdAt: string
  // For KV-stored files, the actual base64 data lives at docDataKey(id)
}

export interface DocUploadResult {
  doc: DocMeta
  backend: DocStorageBackend
  url: string  // download URL (relative path)
}

// ─── Key scheme ───────────────────────────────────────────────────────────────
const K = {
  meta:        (id: string)           => `doc:meta:${id}`,
  data:        (id: string)           => `doc:data:${id}`,   // base64 content (KV fallback)
  idx:         ()                     => 'doc:idx',
  patientIdx:  (patientId: string)    => `doc:patient:${patientId}:idx`,
  examIdx:     (examId: string)       => `doc:exam:${examId}:idx`,
  paIdx:       (paId: string)         => `doc:pa:${paId}:idx`,
  threadIdx:   (threadId: string)     => `doc:thread:${threadId}:idx`,
  sbIdx:       (sbId: string)         => `doc:sb:${sbId}:idx`,
}
const KV_FALLBACK_MAX = 512 * 1024   // 512 KB in base64
const DOC_META_TTL    = 60 * 60 * 24 * 365 * 6  // 6 years (HIPAA)

async function addToIndex(kv: KVNamespace, indexKey: string, docId: string) {
  const idx = (await kvGet<string[]>(kv, indexKey)) ?? []
  if (!idx.includes(docId)) { idx.unshift(docId); await kvPut(kv, indexKey, idx) }
}
async function removeFromIndex(kv: KVNamespace, indexKey: string, docId: string) {
  const idx = (await kvGet<string[]>(kv, indexKey)) ?? []
  await kvPut(kv, indexKey, idx.filter(i => i !== docId))
}

// ─── Upload ───────────────────────────────────────────────────────────────────
export async function uploadDocument(
  kv: KVNamespace,
  r2: R2Bucket | null,
  opts: {
    fileName: string
    mimeType: string
    data: ArrayBuffer | string   // ArrayBuffer or base64 string
    category: DocCategory
    uploadedBy: string
    uploadedByName: string
    description?: string
    patientId?: string
    examId?: string
    paRequestId?: string
    messagingThreadId?: string
    superbillId?: string
  }
): Promise<DocUploadResult> {
  const id = uid()

  // Convert to ArrayBuffer if needed
  let buf: ArrayBuffer
  if (typeof opts.data === 'string') {
    // base64 → Uint8Array
    const b64 = opts.data.replace(/^data:[^;]+;base64,/, '')
    const binary = atob(b64)
    buf = new Uint8Array([...binary].map(c => c.charCodeAt(0))).buffer
  } else {
    buf = opts.data
  }

  const sizeBytes = buf.byteLength
  let storageBackend: DocStorageBackend = 'KV'
  let r2Key: string | undefined

  // Try R2 first
  if (r2) {
    try {
      r2Key = `docs/${opts.category.toLowerCase()}/${id}/${opts.fileName}`
      await r2.put(r2Key, buf, {
        httpMetadata: { contentType: opts.mimeType },
        customMetadata: { patientId: opts.patientId ?? '', category: opts.category },
      })
      storageBackend = 'R2'
    } catch (err) {
      console.warn('[R2] Upload failed, falling back to KV:', err)
      r2Key = undefined
    }
  }

  // KV fallback: store as base64 (max 512KB)
  if (storageBackend === 'KV') {
    if (sizeBytes > KV_FALLBACK_MAX) {
      throw new Error(`File too large for KV fallback (${(sizeBytes/1024).toFixed(0)} KB > 512 KB). Please enable Cloudflare R2.`)
    }
    const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
    await kv.put(K.data(id), JSON.stringify({ mimeType: opts.mimeType, b64 }), { expirationTtl: DOC_META_TTL })
  }

  const doc: DocMeta = {
    id, category: opts.category,
    fileName: opts.fileName, mimeType: opts.mimeType, sizeBytes,
    storageBackend, r2Key,
    patientId: opts.patientId, examId: opts.examId,
    paRequestId: opts.paRequestId, messagingThreadId: opts.messagingThreadId,
    superbillId: opts.superbillId,
    uploadedBy: opts.uploadedBy, uploadedByName: opts.uploadedByName,
    description: opts.description, createdAt: now(),
  }
  await kvPut(kv, K.meta(id), doc, DOC_META_TTL)

  // Update indexes
  await addToIndex(kv, K.idx(), id)
  if (opts.patientId)        await addToIndex(kv, K.patientIdx(opts.patientId), id)
  if (opts.examId)           await addToIndex(kv, K.examIdx(opts.examId), id)
  if (opts.paRequestId)      await addToIndex(kv, K.paIdx(opts.paRequestId), id)
  if (opts.messagingThreadId)await addToIndex(kv, K.threadIdx(opts.messagingThreadId), id)
  if (opts.superbillId)      await addToIndex(kv, K.sbIdx(opts.superbillId), id)

  return { doc, backend: storageBackend, url: `/api/documents/${id}/download` }
}

// ─── Download ─────────────────────────────────────────────────────────────────
export async function downloadDocument(
  kv: KVNamespace,
  r2: R2Bucket | null,
  id: string
): Promise<{ body: ReadableStream | Uint8Array; mimeType: string; fileName: string } | null> {
  const meta = await kvGet<DocMeta>(kv, K.meta(id))
  if (!meta) return null

  if (meta.storageBackend === 'R2' && r2 && meta.r2Key) {
    const obj = await r2.get(meta.r2Key)
    if (!obj) return null
    return { body: obj.body, mimeType: meta.mimeType, fileName: meta.fileName }
  }

  // KV fallback
  const raw = await kv.get(K.data(id), 'text')
  if (!raw) return null
  const { b64 } = JSON.parse(raw) as { mimeType: string; b64: string }
  const binary = atob(b64)
  const bytes = new Uint8Array([...binary].map(c => c.charCodeAt(0)))
  return { body: bytes, mimeType: meta.mimeType, fileName: meta.fileName }
}

// ─── List / query ─────────────────────────────────────────────────────────────
export async function listDocuments(kv: KVNamespace, opts: {
  patientId?: string; examId?: string; paRequestId?: string
  messagingThreadId?: string; superbillId?: string
  category?: DocCategory; limit?: number
} = {}): Promise<DocMeta[]> {
  let indexKey = K.idx()
  if (opts.patientId)         indexKey = K.patientIdx(opts.patientId)
  else if (opts.examId)       indexKey = K.examIdx(opts.examId)
  else if (opts.paRequestId)  indexKey = K.paIdx(opts.paRequestId)
  else if (opts.messagingThreadId) indexKey = K.threadIdx(opts.messagingThreadId)
  else if (opts.superbillId)  indexKey = K.sbIdx(opts.superbillId)

  const idx = (await kvGet<string[]>(kv, indexKey)) ?? []
  const slice = idx.slice(0, opts.limit ?? 100)
  const metas = (await Promise.all(slice.map(id => kvGet<DocMeta>(kv, K.meta(id))))).filter(Boolean) as DocMeta[]
  return opts.category ? metas.filter(m => m.category === opts.category) : metas
}

export async function getDocMeta(kv: KVNamespace, id: string): Promise<DocMeta | null> {
  return kvGet<DocMeta>(kv, K.meta(id))
}

export async function deleteDocument(kv: KVNamespace, r2: R2Bucket | null, id: string): Promise<boolean> {
  const meta = await kvGet<DocMeta>(kv, K.meta(id))
  if (!meta) return false
  if (meta.storageBackend === 'R2' && r2 && meta.r2Key) {
    await r2.delete(meta.r2Key).catch(() => {})
  }
  await kv.delete(K.meta(id))
  await kv.delete(K.data(id))
  // Clean indexes
  await removeFromIndex(kv, K.idx(), id)
  if (meta.patientId)         await removeFromIndex(kv, K.patientIdx(meta.patientId), id)
  if (meta.examId)            await removeFromIndex(kv, K.examIdx(meta.examId), id)
  if (meta.paRequestId)       await removeFromIndex(kv, K.paIdx(meta.paRequestId), id)
  if (meta.messagingThreadId) await removeFromIndex(kv, K.threadIdx(meta.messagingThreadId), id)
  if (meta.superbillId)       await removeFromIndex(kv, K.sbIdx(meta.superbillId), id)
  return true
}

// ─── PDF Generation (pure JS — no external deps) ──────────────────────────────
// Builds minimal but well-structured PDFs using raw PDF syntax.

function pdfText(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

interface PdfPage { lines: Array<{ text: string; x: number; y: number; size?: number; bold?: boolean }> }

function buildPdf(pages: PdfPage[], title: string): Uint8Array {
  const objects: string[] = []
  const offsets: number[] = []
  let pos = 0

  function addObj(content: string): number {
    const n = objects.length + 1
    objects.push(content)
    return n
  }

  const fontRegObjN = addObj('<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica\n>>')
  const fontBldObjN = addObj('<<\n/Type /Font\n/Subtype /Type1\n/BaseFont /Helvetica-Bold\n>>')

  const pageObjNs: number[] = []
  for (const page of pages) {
    let stream = 'BT\n'
    for (const line of page.lines) {
      const font = line.bold ? 'F2' : 'F1'
      const size = line.size ?? 11
      stream += `/${font} ${size} Tf\n${line.x} ${line.y} Td\n(${pdfText(line.text)}) Tj\nT*\n`
    }
    stream += 'ET\n'
    const streamObjN = addObj(`<<\n/Length ${stream.length}\n>>\nstream\n${stream}\nendstream`)
    const pageObjN = addObj(`<<\n/Type /Page\n/Parent 4 0 R\n/MediaBox [0 0 612 792]\n/Contents ${streamObjN} 0 R\n/Resources <<\n/Font <<\n/F1 ${fontRegObjN} 0 R\n/F2 ${fontBldObjN} 0 R\n>>\n>>\n>>`)
    pageObjNs.push(pageObjN)
  }

  const pagesObjN = addObj(`<<\n/Type /Pages\n/Kids [${pageObjNs.map(n => `${n} 0 R`).join(' ')}]\n/Count ${pageObjNs.length}\n>>`)
  const catalogObjN = addObj(`<<\n/Type /Catalog\n/Pages ${pagesObjN} 0 R\n>>`)

  let body = '%PDF-1.4\n'
  pos = body.length
  const objStrs = objects.map((content, i) => {
    const s = `${i + 1} 0 obj\n${content}\nendobj\n`
    offsets.push(pos)
    pos += s.length
    return s
  })
  body += objStrs.join('')

  const xrefPos = pos
  body += 'xref\n'
  body += `0 ${objects.length + 1}\n`
  body += '0000000000 65535 f \n'
  offsets.forEach(o => { body += `${String(o).padStart(10, '0')} 00000 n \n` })
  body += 'trailer\n'
  body += `<<\n/Size ${objects.length + 1}\n/Root ${catalogObjN} 0 R\n>>\n`
  body += `startxref\n${xrefPos}\n%%EOF`

  return new TextEncoder().encode(body)
}

// ─── Superbill PDF ─────────────────────────────────────────────────────────────
export function generateSuperbillPdf(sb: {
  id: string; patientName: string; patientDob?: string; providerId?: string
  serviceDate: string; diagnoses: string[]; lineItems: Array<{
    cptCode: string; description: string; units: number; chargedAmount: number
  }>; totalCharged: number; totalPaid?: number; balance?: number
  practiceName?: string; practiceAddress?: string; practiceNpi?: string
}): Uint8Array {
  const practice = sb.practiceName ?? 'Advanced Eye Care of Miami'
  const y0 = 750
  const lines: PdfPage['lines'] = [
    { text: practice,                      x: 72, y: y0,      size: 16, bold: true },
    { text: sb.practiceAddress ?? '1234 Brickell Ave, Miami, FL 33131', x: 72, y: y0 - 20, size: 9 },
    { text: `NPI: ${sb.practiceNpi ?? '1234567890'}`, x: 72, y: y0 - 32, size: 9 },
    { text: 'SUPERBILL',                   x: 72, y: y0 - 55, size: 14, bold: true },
    { text: `Superbill ID: ${sb.id}`,      x: 72, y: y0 - 75, size: 9 },
    { text: `Service Date: ${sb.serviceDate}`, x: 72, y: y0 - 88, size: 10 },
    { text: `Patient: ${sb.patientName}`,  x: 72, y: y0 - 104, size: 10 },
    ...(sb.patientDob ? [{ text: `DOB: ${sb.patientDob}`, x: 72, y: y0 - 116, size: 9 }] : []),
    { text: 'Diagnoses:',                  x: 72, y: y0 - 134, size: 10, bold: true },
    ...sb.diagnoses.map((d, i) => ({ text: `  ${d}`, x: 72, y: y0 - 148 - i * 14, size: 9 })),
    { text: 'CPT Codes:',                  x: 72, y: y0 - 148 - sb.diagnoses.length * 14 - 14, size: 10, bold: true },
    ...sb.lineItems.map((li, i) => {
      const yBase = y0 - 148 - sb.diagnoses.length * 14 - 30 - i * 14
      return { text: `  ${li.cptCode}  ${li.description.slice(0, 40)}   Units: ${li.units}   $${li.chargedAmount.toFixed(2)}`, x: 72, y: yBase, size: 9 }
    }),
    { text: `Total Charged: $${sb.totalCharged.toFixed(2)}`,       x: 72, y: y0 - 148 - sb.diagnoses.length * 14 - 32 - sb.lineItems.length * 14 - 20, size: 10, bold: true },
    ...(sb.totalPaid  !== undefined ? [{ text: `Total Paid: $${sb.totalPaid.toFixed(2)}`,   x: 72, y: y0 - 148 - sb.diagnoses.length * 14 - 32 - sb.lineItems.length * 14 - 34, size: 10 }] : []),
    ...(sb.balance    !== undefined ? [{ text: `Balance Due: $${sb.balance.toFixed(2)}`,    x: 72, y: y0 - 148 - sb.diagnoses.length * 14 - 32 - sb.lineItems.length * 14 - 48, size: 10, bold: true }] : []),
    { text: 'This document is for insurance filing purposes.',      x: 72, y: 80, size: 8 },
    { text: `Generated: ${new Date().toLocaleDateString()}`,        x: 72, y: 68, size: 8 },
  ]
  return buildPdf([{ lines }], `Superbill ${sb.id}`)
}

// ─── Statement PDF ─────────────────────────────────────────────────────────────
export function generateStatementPdf(stmt: {
  id: string; patientName: string; patientAddress?: string
  statementDate: string; dueDate?: string
  items: Array<{ date: string; description: string; charges: number; payments: number; balance: number }>
  totalCharges: number; totalPayments: number; totalBalance: number
  practiceName?: string; practiceAddress?: string; practicePhone?: string
}): Uint8Array {
  const practice = stmt.practiceName ?? 'Advanced Eye Care of Miami'
  const lines: PdfPage['lines'] = [
    { text: practice,                               x: 72, y: 750, size: 16, bold: true },
    { text: stmt.practiceAddress ?? '',             x: 72, y: 730, size: 9 },
    { text: stmt.practicePhone ?? '',               x: 72, y: 718, size: 9 },
    { text: 'PATIENT STATEMENT',                    x: 72, y: 695, size: 14, bold: true },
    { text: `Statement #: ${stmt.id}`,              x: 72, y: 675, size: 9 },
    { text: `Date: ${stmt.statementDate}`,          x: 72, y: 662, size: 9 },
    ...(stmt.dueDate ? [{ text: `Due Date: ${stmt.dueDate}`, x: 72, y: 650, size: 9 }] : []),
    { text: `Patient: ${stmt.patientName}`,         x: 72, y: 635, size: 10 },
    ...(stmt.patientAddress ? [{ text: stmt.patientAddress, x: 72, y: 622, size: 9 }] : []),
    { text: 'Date',        x: 72,  y: 598, size: 9, bold: true },
    { text: 'Description', x: 130, y: 598, size: 9, bold: true },
    { text: 'Charges',     x: 360, y: 598, size: 9, bold: true },
    { text: 'Payments',    x: 435, y: 598, size: 9, bold: true },
    { text: 'Balance',     x: 510, y: 598, size: 9, bold: true },
    ...stmt.items.flatMap((item, i) => {
      const y = 582 - i * 14
      return [
        { text: item.date,                          x: 72,  y, size: 8 },
        { text: item.description.slice(0, 32),      x: 130, y, size: 8 },
        { text: `$${item.charges.toFixed(2)}`,      x: 360, y, size: 8 },
        { text: `$${item.payments.toFixed(2)}`,     x: 435, y, size: 8 },
        { text: `$${item.balance.toFixed(2)}`,      x: 510, y, size: 8 },
      ]
    }),
    { text: `Total Charges: $${stmt.totalCharges.toFixed(2)}`,   x: 360, y: 582 - stmt.items.length * 14 - 16, size: 9, bold: true },
    { text: `Total Payments: $${stmt.totalPayments.toFixed(2)}`, x: 360, y: 582 - stmt.items.length * 14 - 30, size: 9 },
    { text: `BALANCE DUE: $${stmt.totalBalance.toFixed(2)}`,     x: 360, y: 582 - stmt.items.length * 14 - 46, size: 11, bold: true },
    { text: 'Please remit payment by the due date.',             x: 72,  y: 90,  size: 9 },
    { text: `Generated: ${new Date().toLocaleDateString()}`,     x: 72,  y: 75,  size: 8 },
  ]
  return buildPdf([{ lines }], `Statement ${stmt.id}`)
}

// ─── Referral Letter PDF ───────────────────────────────────────────────────────
export function generateReferralPdf(ref: {
  patientName: string; patientDob?: string; referralDate: string
  referringProvider: string; referringNpi?: string
  toProvider: string; toSpecialty: string
  reason: string; urgency: 'ROUTINE' | 'URGENT' | 'EMERGENT'
  diagnosis: string; notes?: string
  practiceName?: string; practicePhone?: string; practiceFax?: string
}): Uint8Array {
  const practice = ref.practiceName ?? 'Advanced Eye Care of Miami'
  const lines: PdfPage['lines'] = [
    { text: practice,                              x: 72, y: 750, size: 16, bold: true },
    { text: `Phone: ${ref.practicePhone ?? ''}  Fax: ${ref.practiceFax ?? ''}`, x: 72, y: 730, size: 9 },
    { text: 'REFERRAL LETTER',                    x: 72, y: 705, size: 14, bold: true },
    { text: `Date: ${ref.referralDate}`,           x: 72, y: 685, size: 10 },
    { text: `To: ${ref.toProvider}`,               x: 72, y: 668, size: 11, bold: true },
    { text: `Specialty: ${ref.toSpecialty}`,       x: 72, y: 652, size: 10 },
    { text: `Urgency: ${ref.urgency}`,             x: 72, y: 636, size: 10, bold: ref.urgency !== 'ROUTINE' },
    { text: 'Patient Information:',                x: 72, y: 612, size: 10, bold: true },
    { text: `  Name: ${ref.patientName}`,          x: 72, y: 596, size: 10 },
    ...(ref.patientDob ? [{ text: `  DOB: ${ref.patientDob}`, x: 72, y: 582, size: 10 }] : []),
    { text: 'Diagnosis:',                          x: 72, y: 560, size: 10, bold: true },
    { text: `  ${ref.diagnosis}`,                  x: 72, y: 546, size: 10 },
    { text: 'Reason for Referral:',                x: 72, y: 522, size: 10, bold: true },
    ...ref.reason.match(/.{1,80}/g)!.map((chunk, i) => ({ text: `  ${chunk}`, x: 72, y: 508 - i * 14, size: 10 })),
    ...(ref.notes ? [
      { text: 'Additional Notes:', x: 72, y: 460, size: 10, bold: true as boolean },
      ...ref.notes.match(/.{1,80}/g)!.map((c, i) => ({ text: `  ${c}`, x: 72, y: 446 - i * 14, size: 9 })),
    ] : []),
    { text: `Referring Provider: ${ref.referringProvider}`,     x: 72, y: 200, size: 10 },
    ...(ref.referringNpi ? [{ text: `NPI: ${ref.referringNpi}`, x: 72, y: 186, size: 9 }] : []),
    { text: '_______________________________', x: 72, y: 168, size: 10 },
    { text: 'Signature',                           x: 72, y: 155, size: 9 },
    { text: `Generated: ${new Date().toLocaleDateString()}`,    x: 72, y: 80,  size: 8 },
  ]
  return buildPdf([{ lines }], 'Referral Letter')
}
