// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Optical Dispensary Library (D1-backed)
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Frame, Lens, ContactLens, OpticalRx, OpticalOrder, OrderLineItem,
  InventorySummary, InventoryAlert, OrdersSummary,
  FrameCreateInput, LensCreateInput, OrderCreateInput, OrderStatus,
  FrameStatus, LensStatus, CLStatus,
} from '../types/optical'
import { dbGet, dbAll, dbRun, uid as genUid, toJson, fromJson, now } from './db'

function orderNumber(): string {
  const d = new Date()
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `OPT-${yy}${mm}${dd}-${Math.floor(Math.random() * 9000 + 1000)}`
}

function rowToFrame(r: Record<string, unknown>): Frame {
  return {
    id: r.id as string, organizationId: r.organization_id as string,
    sku: r.sku as string, brand: r.brand as string, model: r.model as string,
    color: r.color as string, size: r.size as string, category: r.category as string,
    gender: r.gender as string, material: r.material as string,
    wholesale: (r.wholesale as number) || 0, retail: (r.retail as number) || 0,
    insuranceAllowance: (r.insurance_allowance as number) || 0,
    quantity: (r.quantity as number) || 0, minQuantity: (r.min_quantity as number) || 2,
    status: r.status as FrameStatus, imageUrl: r.image_url as string,
    location: r.location as string, upc: r.upc as string,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  }
}

function rowToLens(r: Record<string, unknown>): Lens {
  return {
    id: r.id as string, organizationId: r.organization_id as string,
    sku: r.sku as string, name: r.name as string, type: r.type as string,
    material: r.material as string, coating: r.coating as string,
    indexValue: r.index_value as number,
    sphereMin: r.sphere_min as number, sphereMax: r.sphere_max as number,
    cylinderMax: r.cylinder_max as number,
    wholesale: (r.wholesale as number) || 0, retail: (r.retail as number) || 0,
    insuranceAllowance: (r.insurance_allowance as number) || 0,
    quantity: (r.quantity as number) || 0, minQuantity: (r.min_quantity as number) || 5,
    status: r.status as LensStatus,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  }
}

function rowToContactLens(r: Record<string, unknown>): ContactLens {
  return {
    id: r.id as string, organizationId: r.organization_id as string,
    sku: r.sku as string, brand: r.brand as string, product: r.product as string,
    modality: r.modality as string, material: r.material as string,
    sphereMin: r.sphere_min as number, sphereMax: r.sphere_max as number,
    cylinder: r.cylinder as number, axis: r.axis as number,
    baseCurve: r.base_curve as string, diameter: r.diameter as number,
    wholesale: (r.wholesale as number) || 0, retail: (r.retail as number) || 0,
    quantity: (r.quantity as number) || 0, minQuantity: (r.min_quantity as number) || 10,
    status: r.status as CLStatus,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  }
}

function rowToRx(r: Record<string, unknown>): OpticalRx {
  return {
    id: r.id as string, patientId: r.patient_id as string,
    examId: r.exam_id as string, providerId: r.provider_id as string,
    rxDate: r.rx_date as string,
    od: { sphere: r.od_sphere as number, cylinder: r.od_cylinder as number, axis: r.od_axis as number, add: r.od_add as number, prism: r.od_prism as number, base: r.od_base as string, pd: r.od_pd as number, va: r.od_va as string },
    os: { sphere: r.os_sphere as number, cylinder: r.os_cylinder as number, axis: r.os_axis as number, add: r.os_add as number, prism: r.os_prism as number, base: r.os_base as string, pd: r.os_pd as number, va: r.os_va as string },
    binocularPd: r.binocular_pd as number, lensType: r.lens_type as string,
    notes: r.notes as string, createdAt: r.created_at as string,
  }
}

function rowToOrder(r: Record<string, unknown>, lineItems: OrderLineItem[]): OpticalOrder {
  return {
    id: r.id as string, organizationId: r.organization_id as string,
    patientId: r.patient_id as string, patientName: r.patient_name as string,
    rxId: r.rx_id as string, orderNumber: r.order_number as string,
    orderType: r.order_type as string, status: r.status as OrderStatus,
    frameId: r.frame_id as string,
    frame: r.frame_sku ? { sku: r.frame_sku as string, brand: r.frame_brand as string, model: r.frame_model as string, color: r.frame_color as string } : undefined,
    lensId: r.lens_id as string,
    lens: r.lens_sku ? { sku: r.lens_sku as string, name: r.lens_name as string, type: r.lens_type as string } : undefined,
    rx: {
      odSphere: r.od_sphere as number, odCylinder: r.od_cylinder as number, odAxis: r.od_axis as number, odAdd: r.od_add as number, odPd: r.od_pd as number,
      osSphere: r.os_sphere as number, osCylinder: r.os_cylinder as number, osAxis: r.os_axis as number, osAdd: r.os_add as number, osPd: r.os_pd as number,
      binocularPd: r.binocular_pd as number,
    },
    coating: r.coating as string, tint: r.tint as string, lab: r.lab as string,
    labOrderNumber: r.lab_order_number as string, estimatedReady: r.estimated_ready as string,
    labSentAt: r.lab_sent_at as string, dispensedAt: r.dispensed_at as string,
    lineItems, subtotal: (r.subtotal as number) || 0, discount: (r.discount as number) || 0,
    insuranceBenefit: (r.insurance_benefit as number) || 0, taxAmount: (r.tax_amount as number) || 0,
    totalCharge: (r.total_charge as number) || 0, depositPaid: (r.deposit_paid as number) || 0,
    balanceDue: (r.balance_due as number) || 0,
    specialInstructions: r.special_instructions as string, internalNotes: r.internal_notes as string,
    createdAt: r.created_at as string, updatedAt: r.updated_at as string,
  }
}

// ── Seed ──────────────────────────────────────────────────────────────────────
export async function ensureOpticalSeed(kv: KVNamespace, db?: D1Database): Promise<void> {
  if (!db) return
  const count = await dbGet<{ n: number }>(db, 'SELECT COUNT(*) as n FROM frames')
  if (count && count.n > 0) return
  const ts = now()
  const frames = [
    { id: 'frm-001', sku: 'RB3025-001', brand: 'Ray-Ban', model: 'Aviator', color: 'Gold/Green', size: '58-14', category: 'SUNGLASSES', gender: 'UNISEX', material: 'Metal', wholesale: 75, retail: 185, qty: 3 },
    { id: 'frm-002', sku: 'VO5051-001', brand: 'Vogue', model: 'VO5051S', color: 'Black', size: '54-16', category: 'EYEGLASSES', gender: 'FEMALE', material: 'Acetate', wholesale: 45, retail: 120, qty: 5 },
    { id: 'frm-003', sku: 'OO9013-001', brand: 'Oakley', model: 'Holbrook', color: 'Matte Black', size: '55-18', category: 'SUNGLASSES', gender: 'MALE', material: 'O-Matter', wholesale: 85, retail: 200, qty: 0 },
  ]
  for (const f of frames) {
    await dbRun(db, `INSERT OR IGNORE INTO frames (id, organization_id, sku, brand, model, color, size, category, gender, material, wholesale, retail, quantity, min_quantity, status, created_at, updated_at) VALUES (?, 'org-001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 2, ?, ?, ?)`,
      [f.id, f.sku, f.brand, f.model, f.color, f.size, f.category, f.gender, f.material,
       f.wholesale, f.retail, f.qty, f.qty <= 0 ? 'OUT_OF_STOCK' : f.qty <= 2 ? 'LOW_STOCK' : 'IN_STOCK', ts, ts])
  }
  const lenses = [
    { id: 'len-001', sku: 'CR39-SV-001', name: 'CR-39 Single Vision', type: 'SINGLE_VISION', material: 'CR-39', coating: 'AR', index: 1.50, wholesale: 25, retail: 80, qty: 20 },
    { id: 'len-002', sku: 'POLY-SV-001', name: 'Polycarbonate Single Vision', type: 'SINGLE_VISION', material: 'Polycarbonate', coating: 'AR+UV', index: 1.59, wholesale: 35, retail: 110, qty: 15 },
  ]
  for (const l of lenses) {
    await dbRun(db, `INSERT OR IGNORE INTO lenses (id, organization_id, sku, name, type, material, coating, index_value, wholesale, retail, quantity, min_quantity, status, created_at, updated_at) VALUES (?, 'org-001', ?, ?, ?, ?, ?, ?, ?, ?, ?, 5, 'IN_STOCK', ?, ?)`,
      [l.id, l.sku, l.name, l.type, l.material, l.coating, l.index, l.wholesale, l.retail, l.qty, ts, ts])
  }
}

// ── Frame CRUD ────────────────────────────────────────────────────────────────
export async function listFrames(kv: KVNamespace, db?: D1Database): Promise<Frame[]> {
  await ensureOpticalSeed(kv, db)
  if (db) return (await dbAll<Record<string, unknown>>(db, 'SELECT * FROM frames WHERE organization_id = \'org-001\'')).map(rowToFrame)
  return []
}

export async function getFrame(kv: KVNamespace, id: string, db?: D1Database): Promise<Frame | null> {
  if (db) {
    const row = await dbGet<Record<string, unknown>>(db, 'SELECT * FROM frames WHERE id = ?', [id])
    return row ? rowToFrame(row) : null
  }
  return null
}

export async function createFrame(kv: KVNamespace, input: FrameCreateInput, db?: D1Database): Promise<Frame> {
  const id = genUid('frm')
  const ts = now()
  const qty = input.quantity || 0
  const status: FrameStatus = qty <= 0 ? 'OUT_OF_STOCK' : qty <= (input.minQuantity || 2) ? 'LOW_STOCK' : 'IN_STOCK'
  const frame: Frame = { id, organizationId: 'org-001', ...input, quantity: qty, minQuantity: input.minQuantity || 2, status, createdAt: ts, updatedAt: ts }
  if (db) {
    await dbRun(db, `INSERT INTO frames (id, organization_id, sku, brand, model, color, size, category, gender, material, wholesale, retail, insurance_allowance, quantity, min_quantity, status, image_url, location, upc, created_at, updated_at) VALUES (?, 'org-001', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.sku, input.brand || null, input.model || null, input.color || null,
       input.size || null, input.category || null, input.gender || null, input.material || null,
       input.wholesale || 0, input.retail || 0, input.insuranceAllowance || 0,
       qty, input.minQuantity || 2, status, input.imageUrl || null, input.location || null, input.upc || null, ts, ts])
  }
  return frame
}

export async function updateFrame(kv: KVNamespace, id: string, updates: Partial<Frame>, db?: D1Database): Promise<Frame | null> {
  const frame = await getFrame(kv, id, db)
  if (!frame) return null
  const updated: Frame = { ...frame, ...updates, id, updatedAt: now() }
  if (updates.quantity !== undefined && !updates.status) {
    updated.status = updated.quantity <= 0 ? 'OUT_OF_STOCK' : updated.quantity <= updated.minQuantity ? 'LOW_STOCK' : 'IN_STOCK'
  }
  if (db) {
    await dbRun(db, `UPDATE frames SET brand=?, model=?, sku=?, color=?, size=?, wholesale=?, retail=?, quantity=?, min_quantity=?, status=?, updated_at=? WHERE id=?`,
      [updated.brand, updated.model, updated.sku, updated.color, updated.size,
       updated.wholesale, updated.retail, updated.quantity, updated.minQuantity, updated.status, updated.updatedAt, id])
  }
  return updated
}

// ── Lens CRUD ─────────────────────────────────────────────────────────────────
export async function listLenses(kv: KVNamespace, db?: D1Database): Promise<Lens[]> {
  await ensureOpticalSeed(kv, db)
  if (db) return (await dbAll<Record<string, unknown>>(db, 'SELECT * FROM lenses WHERE organization_id = \'org-001\'')).map(rowToLens)
  return []
}

export async function getLens(kv: KVNamespace, id: string, db?: D1Database): Promise<Lens | null> {
  if (db) {
    const row = await dbGet<Record<string, unknown>>(db, 'SELECT * FROM lenses WHERE id = ?', [id])
    return row ? rowToLens(row) : null
  }
  return null
}

// ── Contact Lens CRUD ─────────────────────────────────────────────────────────
export async function listContactLenses(kv: KVNamespace, db?: D1Database): Promise<ContactLens[]> {
  await ensureOpticalSeed(kv, db)
  if (db) return (await dbAll<Record<string, unknown>>(db, 'SELECT * FROM contact_lenses WHERE organization_id = \'org-001\'')).map(rowToContactLens)
  return []
}

// ── Rx CRUD ───────────────────────────────────────────────────────────────────
export async function listRxForPatient(kv: KVNamespace, patientId: string, db?: D1Database): Promise<OpticalRx[]> {
  if (db) return (await dbAll<Record<string, unknown>>(db, 'SELECT * FROM optical_rx WHERE patient_id = ? ORDER BY rx_date DESC', [patientId])).map(rowToRx)
  return []
}

export async function getRx(kv: KVNamespace, id: string, db?: D1Database): Promise<OpticalRx | null> {
  if (db) {
    const row = await dbGet<Record<string, unknown>>(db, 'SELECT * FROM optical_rx WHERE id = ?', [id])
    return row ? rowToRx(row) : null
  }
  return null
}

export async function createRx(kv: KVNamespace, rx: Omit<OpticalRx, 'id' | 'createdAt'>, db?: D1Database): Promise<OpticalRx> {
  const id = genUid('rx')
  const ts = now()
  const record: OpticalRx = { ...rx, id, createdAt: ts }
  if (db) {
    await dbRun(db, `INSERT INTO optical_rx (id, patient_id, exam_id, provider_id, rx_date, od_sphere, od_cylinder, od_axis, od_add, od_prism, od_base, od_pd, od_va, os_sphere, os_cylinder, os_axis, os_add, os_prism, os_base, os_pd, os_va, binocular_pd, lens_type, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, rx.patientId, rx.examId || null, rx.providerId || null, rx.rxDate,
       rx.od?.sphere || null, rx.od?.cylinder || null, rx.od?.axis || null, rx.od?.add || null,
       rx.od?.prism || null, rx.od?.base || null, rx.od?.pd || null, rx.od?.va || null,
       rx.os?.sphere || null, rx.os?.cylinder || null, rx.os?.axis || null, rx.os?.add || null,
       rx.os?.prism || null, rx.os?.base || null, rx.os?.pd || null, rx.os?.va || null,
       rx.binocularPd || null, rx.lensType || null, rx.notes || null, ts])
  }
  return record
}

// ── Order CRUD ────────────────────────────────────────────────────────────────
export async function listOrders(kv: KVNamespace, db?: D1Database): Promise<OpticalOrder[]> {
  if (db) {
    const rows = await dbAll<Record<string, unknown>>(db, 'SELECT * FROM optical_orders WHERE organization_id = \'org-001\' ORDER BY created_at DESC')
    return Promise.all(rows.map(async r => {
      const li = await dbAll<OrderLineItem>(db, 'SELECT * FROM optical_order_line_items WHERE order_id = ?', [r.id as string])
      return rowToOrder(r, li)
    }))
  }
  return []
}

export async function getOrder(kv: KVNamespace, id: string, db?: D1Database): Promise<OpticalOrder | null> {
  if (db) {
    const row = await dbGet<Record<string, unknown>>(db, 'SELECT * FROM optical_orders WHERE id = ?', [id])
    if (!row) return null
    const li = await dbAll<OrderLineItem>(db, 'SELECT * FROM optical_order_line_items WHERE order_id = ?', [id])
    return rowToOrder(row, li)
  }
  return null
}

export async function createOrder(kv: KVNamespace, input: OrderCreateInput, db?: D1Database): Promise<OpticalOrder> {
  const id = genUid('ord')
  const ts = now()
  const lineItems: OrderLineItem[] = (input.lineItems || []).map((li, i) => ({
    ...li, id: `li-${genUid('x')}-${i}`, total: li.quantity * li.unitRetail - (li.discount ?? 0),
  }))
  const subtotal = lineItems.reduce((s, l) => s + l.total, 0)
  const discount = input.discount ?? 0
  const insuranceBenefit = input.insuranceBenefit ?? 0
  const taxAmount = input.taxAmount ?? 0
  const totalCharge = subtotal - discount - insuranceBenefit + taxAmount
  const depositPaid = input.depositPaid ?? 0
  const oNum = orderNumber()
  const order: OpticalOrder = {
    id, organizationId: 'org-001', patientId: input.patientId, patientName: input.patientName || '',
    rxId: input.rxId, orderNumber: oNum, orderType: input.orderType || 'GLASSES',
    status: 'DRAFT' as OrderStatus, frameId: input.frameId, frame: input.frame,
    lensId: input.lensId, lens: input.lens, rx: input.rx, coating: input.coating, tint: input.tint,
    lineItems, subtotal, discount, insuranceBenefit, taxAmount, totalCharge, depositPaid,
    balanceDue: totalCharge - depositPaid, specialInstructions: input.specialInstructions,
    internalNotes: input.internalNotes, createdAt: ts, updatedAt: ts,
  }
  if (db) {
    await dbRun(db, `INSERT INTO optical_orders (id, organization_id, patient_id, patient_name, rx_id, order_number, order_type, status, frame_id, frame_sku, frame_brand, frame_model, frame_color, lens_id, lens_sku, lens_name, lens_type, od_sphere, od_cylinder, od_axis, od_add, od_pd, os_sphere, os_cylinder, os_axis, os_add, os_pd, binocular_pd, coating, tint, subtotal, discount, insurance_benefit, tax_amount, total_charge, deposit_paid, balance_due, special_instructions, internal_notes, created_at, updated_at)
      VALUES (?, 'org-001', ?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, input.patientId, input.patientName || '', input.rxId || null, oNum,
       input.orderType || 'GLASSES', input.frameId || null,
       input.frame?.sku || null, input.frame?.brand || null, input.frame?.model || null, input.frame?.color || null,
       input.lensId || null, input.lens?.sku || null, input.lens?.name || null, input.lens?.type || null,
       input.rx?.odSphere || null, input.rx?.odCylinder || null, input.rx?.odAxis || null, input.rx?.odAdd || null, input.rx?.odPd || null,
       input.rx?.osSphere || null, input.rx?.osCylinder || null, input.rx?.osAxis || null, input.rx?.osAdd || null, input.rx?.osPd || null,
       input.rx?.binocularPd || null, input.coating || null, input.tint || null,
       subtotal, discount, insuranceBenefit, taxAmount, totalCharge, depositPaid, totalCharge - depositPaid,
       input.specialInstructions || null, input.internalNotes || null, ts, ts])
    for (const li of lineItems) {
      await dbRun(db, `INSERT INTO optical_order_line_items (id, order_id, item_type, item_id, sku, name, description, quantity, unit_retail, discount, total) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [li.id, id, li.itemType || null, li.itemId || null, li.sku || null,
         li.name || null, li.description || null, li.quantity || 1,
         li.unitRetail || 0, li.discount || 0, li.total || 0])
    }
  }
  return order
}

export async function advanceOrderStatus(kv: KVNamespace, id: string, db?: D1Database): Promise<OpticalOrder | null> {
  const flow: Partial<Record<OrderStatus, OrderStatus>> = {
    DRAFT: 'PENDING_APPROVAL', PENDING_APPROVAL: 'APPROVED', APPROVED: 'SENT_TO_LAB',
    SENT_TO_LAB: 'IN_PRODUCTION', IN_PRODUCTION: 'QUALITY_CHECK', QUALITY_CHECK: 'RECEIVED',
    RECEIVED: 'READY_FOR_PICKUP', READY_FOR_PICKUP: 'DISPENSED',
  }
  const order = await getOrder(kv, id, db)
  if (!order) return null
  const next = flow[order.status]
  if (!next) return null
  if (db) {
    const ts = now()
    await dbRun(db, 'UPDATE optical_orders SET status=?, updated_at=? WHERE id=?', [next, ts, id])
    if (next === 'SENT_TO_LAB') await dbRun(db, 'UPDATE optical_orders SET lab_sent_at=? WHERE id=?', [ts, id])
    if (next === 'DISPENSED') await dbRun(db, 'UPDATE optical_orders SET dispensed_at=? WHERE id=?', [ts, id])
  }
  return getOrder(kv, id, db)
}

export async function updateOrderNotes(
  kv: KVNamespace, id: string,
  updates: { lab?: string; labOrderNumber?: string; estimatedReady?: string; specialInstructions?: string; internalNotes?: string; depositPaid?: number },
  db?: D1Database
): Promise<OpticalOrder | null> {
  if (db) {
    const ts = now()
    if (updates.lab !== undefined) await dbRun(db, 'UPDATE optical_orders SET lab=?, updated_at=? WHERE id=?', [updates.lab, ts, id])
    if (updates.labOrderNumber !== undefined) await dbRun(db, 'UPDATE optical_orders SET lab_order_number=?, updated_at=? WHERE id=?', [updates.labOrderNumber, ts, id])
    if (updates.estimatedReady !== undefined) await dbRun(db, 'UPDATE optical_orders SET estimated_ready=?, updated_at=? WHERE id=?', [updates.estimatedReady, ts, id])
    if (updates.specialInstructions !== undefined) await dbRun(db, 'UPDATE optical_orders SET special_instructions=?, updated_at=? WHERE id=?', [updates.specialInstructions, ts, id])
    if (updates.internalNotes !== undefined) await dbRun(db, 'UPDATE optical_orders SET internal_notes=?, updated_at=? WHERE id=?', [updates.internalNotes, ts, id])
    if (updates.depositPaid !== undefined) {
      const order = await getOrder(kv, id, db)
      if (order) await dbRun(db, 'UPDATE optical_orders SET deposit_paid=?, balance_due=?, updated_at=? WHERE id=?',
        [updates.depositPaid, order.totalCharge - updates.depositPaid, ts, id])
    }
    return getOrder(kv, id, db)
  }
  return null
}

// ── Inventory Summary ─────────────────────────────────────────────────────────
export async function getInventorySummary(kv: KVNamespace, db?: D1Database): Promise<InventorySummary> {
  const [frames, lenses, cls] = await Promise.all([listFrames(kv, db), listLenses(kv, db), listContactLenses(kv, db)])
  const alerts: InventoryAlert[] = []
  const outAlerts: InventoryAlert[] = []
  for (const f of frames) {
    if (f.status === 'OUT_OF_STOCK') outAlerts.push({ itemId: f.id, itemType: 'FRAME', sku: f.sku, name: `${f.brand} ${f.model}`, currentQty: f.quantity, minQty: f.minQuantity, status: f.status })
    else if (f.status === 'LOW_STOCK') alerts.push({ itemId: f.id, itemType: 'FRAME', sku: f.sku, name: `${f.brand} ${f.model}`, currentQty: f.quantity, minQty: f.minQuantity, status: f.status })
  }
  for (const l of lenses) {
    if (l.status === 'OUT_OF_STOCK') outAlerts.push({ itemId: l.id, itemType: 'LENS', sku: l.sku, name: l.name, currentQty: l.quantity, minQty: l.minQuantity, status: l.status })
    else if (l.status === 'LOW_STOCK') alerts.push({ itemId: l.id, itemType: 'LENS', sku: l.sku, name: l.name, currentQty: l.quantity, minQty: l.minQuantity, status: l.status })
  }
  for (const c of cls) {
    if (c.status === 'OUT_OF_STOCK') outAlerts.push({ itemId: c.id, itemType: 'CONTACT_LENS', sku: c.sku, name: `${c.brand} ${c.product}`, currentQty: c.quantity, minQty: c.minQuantity, status: c.status })
    else if (c.status === 'LOW_STOCK') alerts.push({ itemId: c.id, itemType: 'CONTACT_LENS', sku: c.sku, name: `${c.brand} ${c.product}`, currentQty: c.quantity, minQty: c.minQuantity, status: c.status })
  }
  const totalInventoryValue =
    frames.reduce((s, f) => s + f.wholesale * f.quantity, 0) +
    lenses.reduce((s, l) => s + l.wholesale * l.quantity, 0) +
    cls.reduce((s, c) => s + c.wholesale * c.quantity, 0)
  const totalRetailValue =
    frames.reduce((s, f) => s + f.retail * f.quantity, 0) +
    lenses.reduce((s, l) => s + l.retail * l.quantity, 0) +
    cls.reduce((s, c) => s + c.retail * c.quantity, 0)
  return {
    totalItems: frames.length + lenses.length + cls.length,
    totalValue: parseFloat(totalInventoryValue.toFixed(2)),
    totalRetailValue: parseFloat(totalRetailValue.toFixed(2)),
    lowStockItems: alerts.length,
    outOfStockItems: outAlerts.length,
    alerts: [...outAlerts, ...alerts],
    byCategory: {
      frames: { count: frames.length, value: parseFloat(frames.reduce((s, f) => s + f.wholesale * f.quantity, 0).toFixed(2)) },
      lenses: { count: lenses.length, value: parseFloat(lenses.reduce((s, l) => s + l.wholesale * l.quantity, 0).toFixed(2)) },
      contactLenses: { count: cls.length, value: parseFloat(cls.reduce((s, c) => s + c.wholesale * c.quantity, 0).toFixed(2)) },
    },
  }
}

// ── Orders Summary ────────────────────────────────────────────────────────────
export async function getOrdersSummary(kv: KVNamespace, db?: D1Database): Promise<OrdersSummary> {
  const orders = await listOrders(kv, db)
  const today = new Date().toISOString().slice(0, 10)
  const inProgress: OrderStatus[] = ['PENDING_APPROVAL','APPROVED','SENT_TO_LAB','IN_PRODUCTION','QUALITY_CHECK','RECEIVED','REMAKE']
  const dispensedToday = orders.filter(o => o.dispensedAt && o.dispensedAt.slice(0, 10) === today).length
  const overdue = orders.filter(o => o.estimatedReady && o.estimatedReady < today && !['DISPENSED','CANCELLED','READY_FOR_PICKUP'].includes(o.status)).length
  const turnarounds = orders.filter(o => o.dispensedAt && o.labSentAt).map(o => (new Date(o.dispensedAt!).getTime() - new Date(o.labSentAt!).getTime()) / 86400000)
  return {
    totalOrders: orders.length,
    draftOrders: orders.filter(o => o.status === 'DRAFT').length,
    inProgressOrders: orders.filter(o => inProgress.includes(o.status)).length,
    readyForPickup: orders.filter(o => o.status === 'READY_FOR_PICKUP').length,
    dispensedToday, overdueOrders: overdue,
    totalRevenue: orders.filter(o => o.status === 'DISPENSED').reduce((s, o) => s + o.totalCharge, 0),
    avgTurnaround: turnarounds.length ? Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length) : 0,
  }
}
