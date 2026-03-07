// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 3A: Optical Dispensary Library
// KV-backed store: frames, lenses, contact lenses, orders, Rx
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Frame, Lens, ContactLens, OpticalRx, OpticalOrder, OrderLineItem,
  InventorySummary, InventoryAlert, OrdersSummary,
  FrameCreateInput, LensCreateInput, OrderCreateInput, OrderStatus,
  FrameStatus, LensStatus, CLStatus,
} from '../types/optical'

// KV key constants
const KV_FRAME_INDEX   = 'optical:frames:index'
const KV_FRAME_PFX     = 'optical:frame:'
const KV_LENS_INDEX    = 'optical:lenses:index'
const KV_LENS_PFX      = 'optical:lens:'
const KV_CL_INDEX      = 'optical:cl:index'
const KV_CL_PFX        = 'optical:cl:'
const KV_RX_INDEX      = 'optical:rx:index'
const KV_RX_PFX        = 'optical:rx:'
const KV_ORDER_INDEX   = 'optical:orders:index'
const KV_ORDER_PFX     = 'optical:order:'

// ── Utilities ─────────────────────────────────────────────────────────────────

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).substring(2, 7)}`
}

function orderNumber(): string {
  const now = new Date()
  const yy  = String(now.getFullYear()).slice(2)
  const mm  = String(now.getMonth() + 1).padStart(2, '0')
  const dd  = String(now.getDate()).padStart(2, '0')
  const seq = Math.floor(Math.random() * 9000 + 1000)
  return `OPT-${yy}${mm}${dd}-${seq}`
}

async function getIndex(kv: KVNamespace, key: string): Promise<string[]> {
  const raw = await kv.get(key)
  return raw ? JSON.parse(raw) : []
}

async function addToIndex(kv: KVNamespace, key: string, id: string): Promise<void> {
  const ids = await getIndex(kv, key)
  if (!ids.includes(id)) { ids.unshift(id); await kv.put(key, JSON.stringify(ids)) }
}

async function removeFromIndex(kv: KVNamespace, key: string, id: string): Promise<void> {
  const ids = (await getIndex(kv, key)).filter(x => x !== id)
  await kv.put(key, JSON.stringify(ids))
}

// ── Seed Data ─────────────────────────────────────────────────────────────────

let _seeded = false

export async function ensureOpticalSeed(kv: KVNamespace): Promise<void> {
  if (_seeded) return
  const existing = await kv.get(KV_FRAME_INDEX)
  if (existing) { _seeded = true; return }

  const now = new Date().toISOString()

  // ── Seed Frames ───────────────────────────────────────────────────────────
  const frames: Frame[] = [
    {
      id: 'frame-001', sku: 'MNZ-BLK-52', brand: 'Maui Jim', model: 'Westside', color: 'Matte Black',
      size: '52-18-140', category: 'FULL_RIM', gender: 'UNISEX', material: 'Titanium',
      wholesale: 85, retail: 195, insuranceAllowance: 150, quantity: 4, minQuantity: 2,
      status: 'IN_STOCK', location: 'A1', createdAt: now, updatedAt: now,
    },
    {
      id: 'frame-002', sku: 'RAY-TORT-54', brand: 'Ray-Ban', model: 'RB5154 Clubmaster', color: 'Tortoise',
      size: '54-21-145', category: 'SEMI_RIM', gender: 'UNISEX', material: 'Acetate',
      wholesale: 60, retail: 155, insuranceAllowance: 130, quantity: 3, minQuantity: 2,
      status: 'IN_STOCK', location: 'A2', createdAt: now, updatedAt: now,
    },
    {
      id: 'frame-003', sku: 'LNS-ROSE-50', brand: 'Lindberg', model: 'Strip Titanium', color: 'Rose Gold',
      size: '50-15-135', category: 'RIMLESS', gender: 'WOMENS', material: 'Pure Titanium',
      wholesale: 210, retail: 480, insuranceAllowance: 150, quantity: 2, minQuantity: 2,
      status: 'LOW_STOCK', location: 'B1', createdAt: now, updatedAt: now,
    },
    {
      id: 'frame-004', sku: 'OAK-BLU-55', brand: 'Oakley', model: 'OX3156 Crosslink', color: 'Navy Blue',
      size: '55-17-138', category: 'SPORTS', gender: 'MENS', material: 'O-Matter',
      wholesale: 75, retail: 178, quantity: 5, minQuantity: 3, status: 'IN_STOCK', location: 'C3', createdAt: now, updatedAt: now,
    },
    {
      id: 'frame-005', sku: 'KID-RED-44', brand: 'Miraflex', model: 'Baby Twist', color: 'Red',
      size: '44-14-120', category: 'PEDIATRIC', gender: 'KIDS', material: 'Soft Polymer',
      wholesale: 35, retail: 89, quantity: 6, minQuantity: 3, status: 'IN_STOCK', location: 'D1', createdAt: now, updatedAt: now,
    },
    {
      id: 'frame-006', sku: 'GUC-GLD-51', brand: 'Gucci', model: 'GG0396O', color: 'Gold/Havana',
      size: '51-19-145', category: 'FULL_RIM', gender: 'WOMENS', material: 'Metal/Acetate',
      wholesale: 175, retail: 395, insuranceAllowance: 150, quantity: 1, minQuantity: 2,
      status: 'LOW_STOCK', location: 'B3', createdAt: now, updatedAt: now,
    },
  ]

  for (const f of frames) {
    await kv.put(`${KV_FRAME_PFX}${f.id}`, JSON.stringify(f))
  }
  await kv.put(KV_FRAME_INDEX, JSON.stringify(frames.map(f => f.id)))

  // ── Seed Lenses ───────────────────────────────────────────────────────────
  const lenses: Lens[] = [
    {
      id: 'lens-001', sku: 'SV-PC-AR', name: 'Single Vision Polycarbonate AR', type: 'SINGLE_VISION',
      material: 'POLYCARBONATE', coating: 'AR', index: 1.59, sphereRange: '+6.00 to -8.00',
      wholesale: 35, retail: 85, insuranceAllowance: 70, quantity: 50, minQuantity: 10,
      status: 'IN_STOCK', labTurnaround: 5, createdAt: now, updatedAt: now,
    },
    {
      id: 'lens-002', sku: 'PROG-167-AR', name: 'Progressive High Index 1.67 AR Premium', type: 'PROGRESSIVE',
      material: 'HIGH_INDEX_1_67', coating: 'AR_PREMIUM', index: 1.67, sphereRange: '+4.00 to -8.00', cylRange: 'up to -4.00',
      wholesale: 95, retail: 245, insuranceAllowance: 120, quantity: 25, minQuantity: 5,
      status: 'IN_STOCK', labTurnaround: 7, createdAt: now, updatedAt: now,
    },
    {
      id: 'lens-003', sku: 'PHOTO-174-AR', name: 'Transitions Gen 8 Hi-Index 1.74', type: 'SINGLE_VISION',
      material: 'HIGH_INDEX_1_74', coating: 'PHOTOCHROMIC', index: 1.74, sphereRange: '+4.00 to -10.00',
      wholesale: 115, retail: 285, quantity: 15, minQuantity: 5, status: 'IN_STOCK', labTurnaround: 7, createdAt: now, updatedAt: now,
    },
    {
      id: 'lens-004', sku: 'BLU-PC', name: 'Blue Light Blocking Polycarbonate', type: 'SINGLE_VISION',
      material: 'POLYCARBONATE', coating: 'BLUE_LIGHT', index: 1.59,
      wholesale: 45, retail: 110, quantity: 30, minQuantity: 10, status: 'IN_STOCK', labTurnaround: 5, createdAt: now, updatedAt: now,
    },
    {
      id: 'lens-005', sku: 'BIF-PC-FL', name: 'Flat-top Bifocal Polycarbonate', type: 'BIFOCAL',
      material: 'POLYCARBONATE', coating: 'AR', index: 1.59,
      wholesale: 55, retail: 130, insuranceAllowance: 100, quantity: 8, minQuantity: 5,
      status: 'IN_STOCK', labTurnaround: 7, createdAt: now, updatedAt: now,
    },
  ]

  for (const l of lenses) {
    await kv.put(`${KV_LENS_PFX}${l.id}`, JSON.stringify(l))
  }
  await kv.put(KV_LENS_INDEX, JSON.stringify(lenses.map(l => l.id)))

  // ── Seed Contact Lenses ───────────────────────────────────────────────────
  const cls: import('../types/optical').ContactLens[] = [
    {
      id: 'cl-001', sku: 'AIR-OPT-D-300', brand: 'Alcon', product: 'Air Optix Plus HydraGlyde',
      type: 'MONTHLY', modality: 'CONVENTIONAL', baseCurve: 8.6, diameter: 14.2,
      sphere: -3.00, unitsPerBox: 6, wholesale: 18, retail: 35, insuranceAllowance: 150,
      quantity: 12, minQuantity: 4, status: 'IN_STOCK', eye: 'OU', createdAt: now, updatedAt: now,
    },
    {
      id: 'cl-002', sku: 'ACUVUE-1D-200', brand: 'J&J', product: 'Acuvue Oasys 1-Day',
      type: 'DAILY', modality: 'DAILY_DISPOSABLE', baseCurve: 8.5, diameter: 14.3,
      sphere: -2.00, unitsPerBox: 90, wholesale: 42, retail: 75, insuranceAllowance: 150,
      quantity: 8, minQuantity: 4, status: 'IN_STOCK', eye: 'OU', createdAt: now, updatedAt: now,
    },
    {
      id: 'cl-003', sku: 'BIOTRUE-TOR-100', brand: 'Bausch+Lomb', product: 'Biotrue ONEday for Astigmatism',
      type: 'TORIC', modality: 'DAILY_DISPOSABLE', baseCurve: 8.7, diameter: 14.5,
      sphere: -1.00, cylinder: -0.75, axis: 180, unitsPerBox: 90,
      wholesale: 48, retail: 88, quantity: 3, minQuantity: 4, status: 'LOW_STOCK', eye: 'OU', createdAt: now, updatedAt: now,
    },
  ]

  for (const cl of cls) {
    await kv.put(`${KV_CL_PFX}${cl.id}`, JSON.stringify(cl))
  }
  await kv.put(KV_CL_INDEX, JSON.stringify(cls.map(c => c.id)))

  // ── Seed Optical Prescriptions ────────────────────────────────────────────
  const rxRecords: OpticalRx[] = [
    {
      id: 'rx-001', patientId: 'pat-001', patientName: 'Margaret Sullivan',
      examId: 'exam-001', providerId: 'dr-chen', providerName: 'Dr. Emily Chen',
      rxDate: '2026-02-10', expiresDate: '2028-02-10',
      od: { sphere: -2.25, cylinder: -0.50, axis: 180, add: 2.00, pd: 31.5, va: '20/20' },
      os: { sphere: -1.75, cylinder: -0.75, axis: 175, add: 2.00, pd: 32.0, va: '20/20' },
      binocularPd: 63.5, lensType: 'PROGRESSIVE', signed: true,
      createdAt: now,
    },
    {
      id: 'rx-002', patientId: 'pat-002', patientName: 'Derek Holloway',
      providerId: 'dr-patel', providerName: 'Dr. Raj Patel',
      rxDate: '2026-01-22', expiresDate: '2028-01-22',
      od: { sphere: -3.50, cylinder: -1.00, axis: 90, pd: 32.0, va: '20/20' },
      os: { sphere: -3.25, cylinder: -0.75, axis: 85, pd: 31.0, va: '20/20' },
      binocularPd: 63.0, lensType: 'SINGLE_VISION', signed: true,
      createdAt: now,
    },
  ]

  for (const rx of rxRecords) {
    await kv.put(`${KV_RX_PFX}${rx.id}`, JSON.stringify(rx))
  }
  await kv.put(KV_RX_INDEX, JSON.stringify(rxRecords.map(r => r.id)))

  // ── Seed Orders ───────────────────────────────────────────────────────────
  const seedOrders: OpticalOrder[] = [
    {
      id: 'ord-001', orderNumber: 'OPT-260307-1001',
      patientId: 'pat-001', patientName: 'Margaret Sullivan', patientPhone: '555-0101',
      rxId: 'rx-001', examId: 'exam-001',
      providerId: 'dr-chen', providerName: 'Dr. Emily Chen',
      orderType: 'NEW_RX', status: 'READY_FOR_PICKUP',
      lab: 'Vision One Labs', labOrderNumber: 'VOL-89234',
      labSentAt: '2026-02-11T08:00:00Z', estimatedReady: '2026-02-16',
      receivedAt: '2026-02-15T14:00:00Z',
      lineItems: [
        {
          id: 'li-001a', type: 'FRAME', itemId: 'frame-001', description: 'Maui Jim Westside Matte Black 52-18',
          quantity: 1, unitCost: 85, unitRetail: 195, discount: 0, total: 195,
        },
        {
          id: 'li-001b', type: 'LENS', itemId: 'lens-002',
          description: 'Progressive Hi-Index 1.67 AR Premium OD', quantity: 1,
          unitCost: 95, unitRetail: 245, discount: 0, total: 245, eye: 'OD',
        },
        {
          id: 'li-001c', type: 'LENS', itemId: 'lens-002',
          description: 'Progressive Hi-Index 1.67 AR Premium OS', quantity: 1,
          unitCost: 95, unitRetail: 245, discount: 0, total: 245, eye: 'OS',
        },
      ],
      subtotal: 685, discount: 0, insuranceBenefit: 370, taxAmount: 0,
      totalCharge: 315, depositPaid: 150, balanceDue: 165,
      statusHistory: [
        { status: 'DRAFT', at: '2026-02-10T10:00:00Z' },
        { status: 'APPROVED', at: '2026-02-10T10:30:00Z', by: 'Dr. Emily Chen' },
        { status: 'SENT_TO_LAB', at: '2026-02-11T08:00:00Z' },
        { status: 'IN_PRODUCTION', at: '2026-02-12T09:00:00Z' },
        { status: 'RECEIVED', at: '2026-02-15T14:00:00Z' },
        { status: 'READY_FOR_PICKUP', at: '2026-02-15T15:00:00Z' },
      ],
      createdAt: '2026-02-10T10:00:00Z', updatedAt: '2026-02-15T15:00:00Z',
    },
    {
      id: 'ord-002', orderNumber: 'OPT-260307-1002',
      patientId: 'pat-002', patientName: 'Derek Holloway', patientPhone: '555-0202',
      rxId: 'rx-002',
      providerId: 'dr-patel', providerName: 'Dr. Raj Patel',
      orderType: 'NEW_RX', status: 'IN_PRODUCTION',
      lab: 'ClearVision Lab', labOrderNumber: 'CVL-56789',
      labSentAt: '2026-02-23T08:00:00Z', estimatedReady: '2026-02-28',
      lineItems: [
        {
          id: 'li-002a', type: 'FRAME', itemId: 'frame-002', description: 'Ray-Ban Clubmaster Tortoise 54-21',
          quantity: 1, unitCost: 60, unitRetail: 155, discount: 0, total: 155,
        },
        {
          id: 'li-002b', type: 'LENS', itemId: 'lens-003',
          description: 'Transitions Gen 8 Hi-Index 1.74 OU', quantity: 2,
          unitCost: 115, unitRetail: 285, discount: 0, total: 570,
        },
      ],
      subtotal: 725, discount: 25, insuranceBenefit: 300, taxAmount: 0,
      totalCharge: 400, depositPaid: 200, balanceDue: 200,
      statusHistory: [
        { status: 'DRAFT', at: '2026-02-22T11:00:00Z' },
        { status: 'APPROVED', at: '2026-02-22T11:30:00Z' },
        { status: 'SENT_TO_LAB', at: '2026-02-23T08:00:00Z' },
        { status: 'IN_PRODUCTION', at: '2026-02-24T09:00:00Z' },
      ],
      createdAt: '2026-02-22T11:00:00Z', updatedAt: '2026-02-24T09:00:00Z',
    },
    {
      id: 'ord-003', orderNumber: 'OPT-260307-1003',
      patientId: 'pat-003', patientName: 'Priya Nair', patientPhone: '555-0303',
      providerId: 'dr-chen', providerName: 'Dr. Emily Chen',
      orderType: 'CONTACT_LENS', status: 'DRAFT',
      lineItems: [
        {
          id: 'li-003a', type: 'CONTACT_LENS', itemId: 'cl-002',
          description: 'Acuvue Oasys 1-Day -2.00 OD × 3 boxes', quantity: 3,
          unitCost: 42, unitRetail: 75, discount: 0, total: 225, eye: 'OD',
        },
        {
          id: 'li-003b', type: 'CONTACT_LENS', itemId: 'cl-002',
          description: 'Acuvue Oasys 1-Day -2.00 OS × 3 boxes', quantity: 3,
          unitCost: 42, unitRetail: 75, discount: 0, total: 225, eye: 'OS',
        },
      ],
      subtotal: 450, discount: 0, insuranceBenefit: 150, taxAmount: 0,
      totalCharge: 300, depositPaid: 0, balanceDue: 300,
      statusHistory: [{ status: 'DRAFT', at: now }],
      createdAt: now, updatedAt: now,
    },
  ]

  for (const o of seedOrders) {
    await kv.put(`${KV_ORDER_PFX}${o.id}`, JSON.stringify(o))
  }
  await kv.put(KV_ORDER_INDEX, JSON.stringify(seedOrders.map(o => o.id)))
  _seeded = true
}

// ── Frame CRUD ─────────────────────────────────────────────────────────────────

export async function listFrames(kv: KVNamespace): Promise<Frame[]> {
  await ensureOpticalSeed(kv)
  const ids = await getIndex(kv, KV_FRAME_INDEX)
  const frames = await Promise.all(
    ids.map(async id => {
      const raw = await kv.get(`${KV_FRAME_PFX}${id}`)
      return raw ? JSON.parse(raw) as Frame : null
    })
  )
  return frames.filter(Boolean) as Frame[]
}

export async function getFrame(kv: KVNamespace, id: string): Promise<Frame | null> {
  const raw = await kv.get(`${KV_FRAME_PFX}${id}`)
  return raw ? JSON.parse(raw) : null
}

export async function createFrame(kv: KVNamespace, input: FrameCreateInput): Promise<Frame> {
  const now = new Date().toISOString()
  const frame: Frame = {
    ...input,
    id: uid('frame'),
    status: input.status ?? (input.quantity > input.minQuantity ? 'IN_STOCK' : input.quantity > 0 ? 'LOW_STOCK' : 'OUT_OF_STOCK'),
    createdAt: now, updatedAt: now,
  }
  await kv.put(`${KV_FRAME_PFX}${frame.id}`, JSON.stringify(frame))
  await addToIndex(kv, KV_FRAME_INDEX, frame.id)
  return frame
}

export async function updateFrame(kv: KVNamespace, id: string, updates: Partial<Frame>): Promise<Frame | null> {
  const frame = await getFrame(kv, id)
  if (!frame) return null
  const updated: Frame = { ...frame, ...updates, id, updatedAt: new Date().toISOString() }
  // Auto-compute status from quantity
  if (updates.quantity !== undefined && !updates.status) {
    updated.status = updated.quantity <= 0 ? 'OUT_OF_STOCK' : updated.quantity <= updated.minQuantity ? 'LOW_STOCK' : 'IN_STOCK'
  }
  await kv.put(`${KV_FRAME_PFX}${id}`, JSON.stringify(updated))
  return updated
}

// ── Lens CRUD ──────────────────────────────────────────────────────────────────

export async function listLenses(kv: KVNamespace): Promise<Lens[]> {
  await ensureOpticalSeed(kv)
  const ids = await getIndex(kv, KV_LENS_INDEX)
  const items = await Promise.all(ids.map(async id => {
    const raw = await kv.get(`${KV_LENS_PFX}${id}`)
    return raw ? JSON.parse(raw) as Lens : null
  }))
  return items.filter(Boolean) as Lens[]
}

export async function getLens(kv: KVNamespace, id: string): Promise<Lens | null> {
  const raw = await kv.get(`${KV_LENS_PFX}${id}`)
  return raw ? JSON.parse(raw) : null
}

// ── Contact Lens CRUD ──────────────────────────────────────────────────────────

export async function listContactLenses(kv: KVNamespace): Promise<import('../types/optical').ContactLens[]> {
  await ensureOpticalSeed(kv)
  const ids = await getIndex(kv, KV_CL_INDEX)
  const items = await Promise.all(ids.map(async id => {
    const raw = await kv.get(`${KV_CL_PFX}${id}`)
    return raw ? JSON.parse(raw) as import('../types/optical').ContactLens : null
  }))
  return items.filter(Boolean) as import('../types/optical').ContactLens[]
}

// ── Rx CRUD ────────────────────────────────────────────────────────────────────

export async function listRxForPatient(kv: KVNamespace, patientId: string): Promise<OpticalRx[]> {
  await ensureOpticalSeed(kv)
  const ids = await getIndex(kv, KV_RX_INDEX)
  const items = await Promise.all(ids.map(async id => {
    const raw = await kv.get(`${KV_RX_PFX}${id}`)
    return raw ? JSON.parse(raw) as OpticalRx : null
  }))
  return (items.filter(Boolean) as OpticalRx[]).filter(r => r.patientId === patientId)
}

export async function getRx(kv: KVNamespace, id: string): Promise<OpticalRx | null> {
  const raw = await kv.get(`${KV_RX_PFX}${id}`)
  return raw ? JSON.parse(raw) : null
}

export async function createRx(kv: KVNamespace, rx: Omit<OpticalRx, 'id' | 'createdAt'>): Promise<OpticalRx> {
  const now = new Date().toISOString()
  const record: OpticalRx = { ...rx, id: uid('rx'), createdAt: now }
  await kv.put(`${KV_RX_PFX}${record.id}`, JSON.stringify(record))
  await addToIndex(kv, KV_RX_INDEX, record.id)
  return record
}

// ── Order CRUD ─────────────────────────────────────────────────────────────────

export async function listOrders(kv: KVNamespace): Promise<OpticalOrder[]> {
  await ensureOpticalSeed(kv)
  const ids = await getIndex(kv, KV_ORDER_INDEX)
  const items = await Promise.all(ids.map(async id => {
    const raw = await kv.get(`${KV_ORDER_PFX}${id}`)
    return raw ? JSON.parse(raw) as OpticalOrder : null
  }))
  return items.filter(Boolean) as OpticalOrder[]
}

export async function getOrder(kv: KVNamespace, id: string): Promise<OpticalOrder | null> {
  const raw = await kv.get(`${KV_ORDER_PFX}${id}`)
  return raw ? JSON.parse(raw) : null
}

export async function createOrder(kv: KVNamespace, input: OrderCreateInput): Promise<OpticalOrder> {
  const now = new Date().toISOString()

  const lineItems: OrderLineItem[] = input.lineItems.map((li, i) => ({
    ...li,
    id: `li-${uid('x')}-${i}`,
    total: li.quantity * li.unitRetail - (li.discount ?? 0),
  }))

  const subtotal = lineItems.reduce((s, l) => s + l.total, 0)
  const discount = input.discount ?? 0
  const insuranceBenefit = input.insuranceBenefit ?? 0
  const taxAmount = input.taxAmount ?? 0
  const totalCharge = subtotal - discount - insuranceBenefit + taxAmount
  const depositPaid = input.depositPaid ?? 0

  const order: OpticalOrder = {
    id: uid('ord'),
    orderNumber: orderNumber(),
    patientId: input.patientId,
    patientName: input.patientName,
    patientPhone: input.patientPhone,
    rxId: input.rxId,
    examId: input.examId,
    providerId: input.providerId,
    providerName: input.providerName,
    orderType: input.orderType,
    status: 'DRAFT',
    lab: input.lab,
    estimatedReady: input.estimatedReady,
    lineItems,
    subtotal,
    discount,
    insuranceBenefit,
    taxAmount,
    totalCharge,
    depositPaid,
    balanceDue: totalCharge - depositPaid,
    rx: input.rx as OpticalRx | undefined,
    specialInstructions: input.specialInstructions,
    internalNotes: input.internalNotes,
    statusHistory: [{ status: 'DRAFT', at: now }],
    createdAt: now, updatedAt: now,
  }

  await kv.put(`${KV_ORDER_PFX}${order.id}`, JSON.stringify(order))
  await addToIndex(kv, KV_ORDER_INDEX, order.id)
  return order
}

// ── Order Status Workflow ──────────────────────────────────────────────────────

const STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  DRAFT:             ['PENDING_APPROVAL', 'APPROVED', 'CANCELLED'],
  PENDING_APPROVAL:  ['APPROVED', 'CANCELLED'],
  APPROVED:          ['SENT_TO_LAB', 'CANCELLED'],
  SENT_TO_LAB:       ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION:     ['QUALITY_CHECK', 'REMAKE', 'CANCELLED'],
  QUALITY_CHECK:     ['RECEIVED', 'REMAKE'],
  RECEIVED:          ['READY_FOR_PICKUP'],
  READY_FOR_PICKUP:  ['DISPENSED'],
  DISPENSED:         [],
  CANCELLED:         [],
  REMAKE:            ['SENT_TO_LAB', 'CANCELLED'],
}

export async function advanceOrderStatus(
  kv: KVNamespace, id: string, newStatus: OrderStatus, by?: string, note?: string
): Promise<{ success: boolean; order?: OpticalOrder; error?: string }> {
  const order = await getOrder(kv, id)
  if (!order) return { success: false, error: 'Order not found' }

  const allowed = STATUS_FLOW[order.status] ?? []
  if (!allowed.includes(newStatus)) {
    return { success: false, error: `Cannot transition from ${order.status} → ${newStatus}` }
  }

  const now = new Date().toISOString()
  const updated: OpticalOrder = {
    ...order,
    status: newStatus,
    updatedAt: now,
    ...(newStatus === 'SENT_TO_LAB'       ? { labSentAt: now }    : {}),
    ...(newStatus === 'RECEIVED'          ? { receivedAt: now }   : {}),
    ...(newStatus === 'DISPENSED'         ? { dispensedAt: now, dispensedBy: by } : {}),
    statusHistory: [...order.statusHistory, { status: newStatus, at: now, by, note }],
  }

  await kv.put(`${KV_ORDER_PFX}${id}`, JSON.stringify(updated))
  return { success: true, order: updated }
}

export async function updateOrderNotes(
  kv: KVNamespace, id: string, updates: { lab?: string; labOrderNumber?: string; estimatedReady?: string; specialInstructions?: string; internalNotes?: string; depositPaid?: number }
): Promise<OpticalOrder | null> {
  const order = await getOrder(kv, id)
  if (!order) return null
  const updated = {
    ...order,
    ...updates,
    balanceDue: order.totalCharge - (updates.depositPaid ?? order.depositPaid),
    updatedAt: new Date().toISOString(),
  }
  await kv.put(`${KV_ORDER_PFX}${id}`, JSON.stringify(updated))
  return updated
}

// ── Inventory Summary ──────────────────────────────────────────────────────────

export async function getInventorySummary(kv: KVNamespace): Promise<InventorySummary> {
  const [frames, lenses, cls] = await Promise.all([
    listFrames(kv),
    listLenses(kv),
    listContactLenses(kv),
  ])

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
    totalFrames: frames.length,
    totalLenses: lenses.length,
    totalContactLenses: cls.length,
    lowStockAlerts: alerts,
    outOfStockAlerts: outAlerts,
    totalInventoryValue,
    totalRetailValue,
  }
}

// ── Orders Summary ─────────────────────────────────────────────────────────────

export async function getOrdersSummary(kv: KVNamespace): Promise<OrdersSummary> {
  const orders = await listOrders(kv)
  const today  = new Date().toISOString().slice(0, 10)

  const inProgress: OrderStatus[] = ['PENDING_APPROVAL','APPROVED','SENT_TO_LAB','IN_PRODUCTION','QUALITY_CHECK','RECEIVED','REMAKE']

  const dispensedToday = orders.filter(o => o.dispensedAt && o.dispensedAt.slice(0, 10) === today).length
  const overdue = orders.filter(o =>
    o.estimatedReady && o.estimatedReady < today &&
    !['DISPENSED','CANCELLED','READY_FOR_PICKUP'].includes(o.status)
  ).length

  const turnarounds = orders
    .filter(o => o.dispensedAt && o.labSentAt)
    .map(o => (new Date(o.dispensedAt!).getTime() - new Date(o.labSentAt!).getTime()) / 86400000)

  return {
    totalOrders: orders.length,
    draftOrders: orders.filter(o => o.status === 'DRAFT').length,
    inProgressOrders: orders.filter(o => inProgress.includes(o.status)).length,
    readyForPickup: orders.filter(o => o.status === 'READY_FOR_PICKUP').length,
    dispensedToday,
    overdueOrders: overdue,
    totalRevenue: orders.filter(o => o.status === 'DISPENSED').reduce((s, o) => s + o.totalCharge, 0),
    avgTurnaround: turnarounds.length ? Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length) : 0,
  }
}
