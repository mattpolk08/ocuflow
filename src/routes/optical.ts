// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 3A: Optical Dispensary Routes
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import {
  listFrames, getFrame, createFrame, updateFrame,
  listLenses, getLens,
  listContactLenses,
  listRxForPatient, getRx, createRx,
  listOrders, getOrder, createOrder, advanceOrderStatus, updateOrderNotes,
  getInventorySummary, getOrdersSummary,
  ensureOpticalSeed,
} from '../lib/optical'
import type { OrderStatus } from '../types/optical'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  DB: D1Database
  DEMO_MODE: string
}
type ApiResp  = { success: boolean; data?: unknown; message?: string; error?: string }

const opticalRoutes = new Hono<{ Bindings: Bindings }>()

// ── Seed ──────────────────────────────────────────────────────────────────────
opticalRoutes.post('/seed', async (c) => {
  try {
    await ensureOpticalSeed(c.env.OCULOFLOW_KV, c.env.DB,  c.env.DB)
    return c.json<ApiResp>({ success: true, message: 'Optical seed complete' })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── Inventory Summary ─────────────────────────────────────────────────────────
opticalRoutes.get('/inventory', async (c) => {
  try {
    const summary = await getInventorySummary(c.env.OCULOFLOW_KV, c.env.DB,  c.env.DB)
    return c.json<ApiResp>({ success: true, data: summary })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── Orders Summary ────────────────────────────────────────────────────────────
opticalRoutes.get('/orders/summary', async (c) => {
  try {
    const summary = await getOrdersSummary(c.env.OCULOFLOW_KV, c.env.DB,  c.env.DB)
    return c.json<ApiResp>({ success: true, data: summary })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── Frames ────────────────────────────────────────────────────────────────────
opticalRoutes.get('/frames', async (c) => {
  try {
    const q      = (c.req.query('q') ?? '').toLowerCase()
    const cat    = c.req.query('category')
    const status = c.req.query('status')
    let frames   = await listFrames(c.env.OCULOFLOW_KV, c.env.DB,  c.env.DB)

    if (q)      frames = frames.filter(f => `${f.brand} ${f.model} ${f.color} ${f.sku}`.toLowerCase().includes(q))
    if (cat)    frames = frames.filter(f => f.category === cat)
    if (status) frames = frames.filter(f => f.status === status)

    return c.json<ApiResp>({ success: true, data: frames })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

opticalRoutes.get('/frames/:id', async (c) => {
  const frame = await getFrame(c.env.OCULOFLOW_KV, c.env.DB, c.req.param('id'))
  if (!frame) return c.json<ApiResp>({ success: false, error: 'Frame not found' }, 404)
  return c.json<ApiResp>({ success: true, data: frame })
})

opticalRoutes.post('/frames', async (c) => {
  try {
    const body  = await c.req.json()
    if (!body.brand || !body.model || !body.sku) {
      return c.json<ApiResp>({ success: false, error: 'brand, model, sku are required' }, 400)
    }
    const frame = await createFrame(c.env.OCULOFLOW_KV, c.env.DB, body)
    return c.json<ApiResp>({ success: true, data: frame, message: 'Frame added to inventory' }, 201)
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

opticalRoutes.patch('/frames/:id', async (c) => {
  try {
    const id      = c.req.param('id')
    const updates = await c.req.json()
    const frame   = await updateFrame(c.env.OCULOFLOW_KV, c.env.DB, id, updates)
    if (!frame) return c.json<ApiResp>({ success: false, error: 'Frame not found' }, 404)
    return c.json<ApiResp>({ success: true, data: frame, message: 'Frame updated' })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── Lenses ────────────────────────────────────────────────────────────────────
opticalRoutes.get('/lenses', async (c) => {
  try {
    const q    = (c.req.query('q') ?? '').toLowerCase()
    let lenses = await listLenses(c.env.OCULOFLOW_KV, c.env.DB,  c.env.DB)
    if (q) lenses = lenses.filter(l => `${l.name} ${l.sku} ${l.type} ${l.material}`.toLowerCase().includes(q))
    return c.json<ApiResp>({ success: true, data: lenses })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

opticalRoutes.get('/lenses/:id', async (c) => {
  const lens = await getLens(c.env.OCULOFLOW_KV, c.env.DB, c.req.param('id'))
  if (!lens) return c.json<ApiResp>({ success: false, error: 'Lens not found' }, 404)
  return c.json<ApiResp>({ success: true, data: lens })
})

// ── Contact Lenses ────────────────────────────────────────────────────────────
opticalRoutes.get('/contact-lenses', async (c) => {
  try {
    const q   = (c.req.query('q') ?? '').toLowerCase()
    let items = await listContactLenses(c.env.OCULOFLOW_KV, c.env.DB,  c.env.DB)
    if (q) items = items.filter(cl => `${cl.brand} ${cl.product} ${cl.sku}`.toLowerCase().includes(q))
    return c.json<ApiResp>({ success: true, data: items })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── Prescriptions ─────────────────────────────────────────────────────────────
opticalRoutes.get('/rx/patient/:pid', async (c) => {
  try {
    const rxList = await listRxForPatient(c.env.OCULOFLOW_KV, c.env.DB, c.req.param('pid'))
    return c.json<ApiResp>({ success: true, data: rxList })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

opticalRoutes.get('/rx/:id', async (c) => {
  const rx = await getRx(c.env.OCULOFLOW_KV, c.env.DB, c.req.param('id'))
  if (!rx) return c.json<ApiResp>({ success: false, error: 'Rx not found' }, 404)
  return c.json<ApiResp>({ success: true, data: rx })
})

opticalRoutes.post('/rx', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.patientId || !body.patientName || !body.providerId || !body.rxDate) {
      return c.json<ApiResp>({ success: false, error: 'patientId, patientName, providerId, rxDate required' }, 400)
    }
    const rx = await createRx(c.env.OCULOFLOW_KV, c.env.DB, body)
    return c.json<ApiResp>({ success: true, data: rx, message: 'Prescription saved' }, 201)
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

// ── Orders ────────────────────────────────────────────────────────────────────
opticalRoutes.get('/orders', async (c) => {
  try {
    const status = c.req.query('status')
    const pid    = c.req.query('patientId')
    let orders   = await listOrders(c.env.OCULOFLOW_KV, c.env.DB,  c.env.DB)
    if (status) orders = orders.filter(o => o.status === status)
    if (pid)    orders = orders.filter(o => o.patientId === pid)
    return c.json<ApiResp>({ success: true, data: orders })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

opticalRoutes.get('/orders/:id', async (c) => {
  const order = await getOrder(c.env.OCULOFLOW_KV, c.env.DB, c.req.param('id'))
  if (!order) return c.json<ApiResp>({ success: false, error: 'Order not found' }, 404)
  return c.json<ApiResp>({ success: true, data: order })
})

opticalRoutes.post('/orders', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.patientId || !body.patientName || !body.providerId || !body.orderType || !body.lineItems?.length) {
      return c.json<ApiResp>({ success: false, error: 'patientId, patientName, providerId, orderType, lineItems required' }, 400)
    }
    const order = await createOrder(c.env.OCULOFLOW_KV, c.env.DB, body)
    return c.json<ApiResp>({ success: true, data: order, message: `Order ${order.orderNumber} created` }, 201)
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

opticalRoutes.post('/orders/:id/status', async (c) => {
  try {
    const id           = c.req.param('id')
    const { status, by, note } = await c.req.json<{ status: OrderStatus; by?: string; note?: string }>()
    if (!status) return c.json<ApiResp>({ success: false, error: 'status required' }, 400)

    const result = await advanceOrderStatus(c.env.OCULOFLOW_KV, c.env.DB, id, status, by, note)
    if (!result.success) return c.json<ApiResp>(result, 400)
    return c.json<ApiResp>({ success: true, data: result.order, message: `Order advanced to ${status}` })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

opticalRoutes.patch('/orders/:id', async (c) => {
  try {
    const id      = c.req.param('id')
    const updates = await c.req.json()
    const order   = await updateOrderNotes(c.env.OCULOFLOW_KV, c.env.DB, id, updates)
    if (!order) return c.json<ApiResp>({ success: false, error: 'Order not found' }, 404)
    return c.json<ApiResp>({ success: true, data: order, message: 'Order updated' })
  } catch (err) {
    return c.json<ApiResp>({ success: false, error: String(err) }, 500)
  }
})

export default opticalRoutes
