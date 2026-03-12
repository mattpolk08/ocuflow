// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 3A: Optical Dispensary Controller
// ─────────────────────────────────────────────────────────────────────────────

/* ── State ─────────────────────────────────────────────────────────────────── */
const state = {
  orders: [], frames: [], lenses: [], cl: [], rx: [],
  currentTab: 'orders',
  activeOrder: null,
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */
const $  = id  => document.getElementById(id)
const $$ = sel => document.querySelectorAll(sel)

function fmt$(n) { return n == null ? '—' : `$${Number(n).toFixed(2)}` }
function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function showToast(msg, ok = true) {
  const toast = $('toast')
  $('toast-msg').textContent = msg
  $('toast-icon').className = `fas ${ok ? 'fa-check-circle text-emerald-400' : 'fa-circle-exclamation text-red-400'} text-lg`
  toast.classList.remove('hidden')
  setTimeout(() => toast.classList.add('hidden'), 3500)
}

async function api(method, path, body) {
  const tok = sessionStorage.getItem('of_access_token');
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (tok) opts.headers['Authorization'] = `Bearer ${tok}`;
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`/api/optical${path}`, opts)
  if (res.status === 401) { sessionStorage.clear(); location.href = '/login'; return {}; }
  return res.json()
}

/* ── Status helpers ─────────────────────────────────────────────────────────── */
const ORDER_STATUS_LABELS = {
  DRAFT: 'Draft', PENDING_APPROVAL: 'Pending Approval', APPROVED: 'Approved',
  SENT_TO_LAB: 'Sent to Lab', IN_PRODUCTION: 'In Production',
  QUALITY_CHECK: 'QC Check', RECEIVED: 'Received',
  READY_FOR_PICKUP: 'Ready for Pickup', DISPENSED: 'Dispensed',
  CANCELLED: 'Cancelled', REMAKE: 'Remake',
}
const ORDER_STATUS_BADGE = {
  DRAFT: 'badge-slate', PENDING_APPROVAL: 'badge-yellow', APPROVED: 'badge-blue',
  SENT_TO_LAB: 'badge-blue', IN_PRODUCTION: 'badge-purple', QUALITY_CHECK: 'badge-purple',
  RECEIVED: 'badge-blue', READY_FOR_PICKUP: 'badge-green', DISPENSED: 'badge-green',
  CANCELLED: 'badge-red', REMAKE: 'badge-yellow',
}
const STOCK_STATUS_BADGE = {
  IN_STOCK: 'badge-green', LOW_STOCK: 'badge-yellow',
  OUT_OF_STOCK: 'badge-red', DISCONTINUED: 'badge-slate',
}
const NEXT_STATUS = {
  DRAFT: ['APPROVED', 'CANCELLED'],
  APPROVED: ['SENT_TO_LAB', 'CANCELLED'],
  SENT_TO_LAB: ['IN_PRODUCTION', 'CANCELLED'],
  IN_PRODUCTION: ['QUALITY_CHECK', 'REMAKE'],
  QUALITY_CHECK: ['RECEIVED', 'REMAKE'],
  RECEIVED: ['READY_FOR_PICKUP'],
  READY_FOR_PICKUP: ['DISPENSED'],
  REMAKE: ['SENT_TO_LAB', 'CANCELLED'],
}

function statusBadge(status, map = ORDER_STATUS_BADGE) {
  const cls = map[status] ?? 'badge-slate'
  const lbl = ORDER_STATUS_LABELS[status] ?? status
  return `<span class="badge ${cls}">${lbl}</span>`
}

function stockBadge(status) {
  const cls = STOCK_STATUS_BADGE[status] ?? 'badge-slate'
  const lbl = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return `<span class="badge ${cls}">${lbl}</span>`
}

/* ── Tab navigation ─────────────────────────────────────────────────────────── */
function showTab(tab, el) {
  if (el && el.href) el.preventDefault?.()
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'))
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'))
  const panel = $(`tab-${tab}`)
  if (panel) panel.classList.remove('hidden')
  const navEl = $(`nav-${tab}`)
  if (navEl) navEl.classList.add('active')
  state.currentTab = tab

  if (tab === 'frames' && !state.frames.length) loadFrames()
  if (tab === 'lenses' && !state.lenses.length) loadLenses()
  if (tab === 'cl'     && !state.cl.length)     loadCL()
  return false
}

/* ── KPI bar ────────────────────────────────────────────────────────────────── */
async function loadKPIs() {
  try {
    const [oRes, iRes] = await Promise.all([
      api('GET', '/orders/summary'),
      api('GET', '/inventory'),
    ])
    if (oRes.success) {
      const d = oRes.data
      $('kpi-total').textContent   = d.totalOrders
      $('kpi-inprog').textContent  = d.inProgressOrders
      $('kpi-ready').textContent   = d.readyForPickup
      $('kpi-overdue').textContent = d.overdueOrders
    }
    if (iRes.success) {
      const d = iRes.data
      $('kpi-frames').textContent  = d.totalFrames
      $('kpi-inv').textContent     = `$${Math.round(d.totalInventoryValue).toLocaleString()}`
    }
  } catch (e) { console.error('KPI load error', e) }
}

/* ── Orders tab ─────────────────────────────────────────────────────────────── */
async function loadOrders(statusFilter = '') {
  const tbody = $('orders-body')
  tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i>Loading…</td></tr>'
  try {
    const path = statusFilter ? `/orders?status=${statusFilter}` : '/orders'
    const res  = await api('GET', path)
    state.orders = res.data ?? []
    renderOrdersTable(state.orders)
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-red-400">${e.message}</td></tr>`
  }
}

function renderOrdersTable(orders) {
  const tbody = $('orders-body')
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-slate-500">No orders found.</td></tr>'
    return
  }
  tbody.innerHTML = orders.map(o => {
    const isOverdue = o.estimatedReady && o.estimatedReady < new Date().toISOString().slice(0,10) &&
      !['DISPENSED','CANCELLED','READY_FOR_PICKUP'].includes(o.status)
    return `<tr onclick="openOrderDrawer('${o.id}')">
      <td class="font-mono text-xs text-blue-400">${o.orderNumber}</td>
      <td>
        <div class="font-medium text-white text-sm">${o.patientName}</div>
        <div class="text-xs text-slate-500">${o.patientPhone ?? ''}</div>
      </td>
      <td class="text-sm text-slate-300">${o.orderType.replace(/_/g,' ')}</td>
      <td>${statusBadge(o.status)}</td>
      <td class="text-sm text-slate-400">${o.lab ?? '—'}</td>
      <td class="text-sm ${isOverdue ? 'text-red-400 font-medium' : 'text-slate-400'}">${fmtDate(o.estimatedReady)}</td>
      <td class="text-sm font-medium">${fmt$(o.totalCharge)}</td>
      <td class="text-sm ${o.balanceDue > 0 ? 'text-amber-400' : 'text-emerald-400'}">${fmt$(o.balanceDue)}</td>
      <td><button class="btn-ghost" onclick="event.stopPropagation(); openOrderDrawer('${o.id}')"><i class="fas fa-chevron-right"></i></button></td>
    </tr>`
  }).join('')
}

function filterOrders() {
  const status = $('orders-filter').value
  loadOrders(status)
}

/* ── Order Drawer ───────────────────────────────────────────────────────────── */
async function openOrderDrawer(orderId) {
  const res = await api('GET', `/orders/${orderId}`)
  if (!res.success) return showToast('Could not load order', false)
  const o = res.data
  state.activeOrder = o

  const drawer = $('order-drawer')
  $('drawer-title').textContent    = o.orderNumber
  $('drawer-subtitle').textContent = `${o.patientName} · ${o.orderType.replace(/_/g,' ')}`

  // Status timeline
  const steps = ['DRAFT','APPROVED','SENT_TO_LAB','IN_PRODUCTION','QUALITY_CHECK','RECEIVED','READY_FOR_PICKUP','DISPENSED']
  const currentIdx = steps.indexOf(o.status)
  const timelineHtml = steps.map((s, i) => {
    const done    = i < currentIdx
    const current = i === currentIdx
    const dotCls  = done ? 'border-blue-500 bg-blue-500' : current ? 'border-blue-400 bg-blue-400/20 text-blue-400' : 'border-slate-600 text-slate-600'
    const lineCls  = i < steps.length - 1 ? (done || current ? 'bg-blue-500/50' : 'bg-slate-700') : ''
    return `<div class="flex items-start gap-2">
      <div class="flex flex-col items-center">
        <div class="step-dot ${dotCls}">${done ? '<i class="fas fa-check text-white text-xs"></i>' : `<span>${i+1}</span>`}</div>
        ${i < steps.length - 1 ? `<div class="w-0.5 flex-1 min-h-4 mt-1 ${lineCls}"></div>` : ''}
      </div>
      <div class="pb-3 flex-1 min-w-0">
        <p class="text-xs font-medium ${current ? 'text-white' : done ? 'text-slate-300' : 'text-slate-600'}">${ORDER_STATUS_LABELS[s] ?? s}</p>
        ${o.statusHistory?.find(h => h.status === s)
          ? `<p class="text-xs text-slate-500">${fmtDateTime(o.statusHistory.find(h=>h.status===s).at)}${o.statusHistory.find(h=>h.status===s).by ? ` · ${o.statusHistory.find(h=>h.status===s).by}` : ''}</p>`
          : ''}
      </div>
    </div>`
  }).join('')

  // Line items
  const liHtml = o.lineItems.map(li => `
    <div class="flex items-start justify-between gap-2 py-2 border-t border-slate-700/50 first:border-0">
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white">${li.description}</p>
        <p class="text-xs text-slate-500">${li.type} · qty ${li.quantity}${li.eye ? ` · ${li.eye}` : ''}</p>
      </div>
      <p class="text-sm font-medium text-white shrink-0">${fmt$(li.total)}</p>
    </div>`).join('')

  $('drawer-content').innerHTML = `
    <div class="space-y-5">
      <!-- Status -->
      <div>
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Order Status</p>
        <div class="pl-1">${timelineHtml}</div>
      </div>

      <!-- Patient & Provider -->
      <div class="card">
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Details</p>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div><p class="text-slate-500 text-xs">Patient</p><p class="text-white font-medium">${o.patientName}</p></div>
          <div><p class="text-slate-500 text-xs">Provider</p><p class="text-white">${o.providerName}</p></div>
          <div><p class="text-slate-500 text-xs">Lab</p><p class="text-white">${o.lab ?? '—'}</p></div>
          <div><p class="text-slate-500 text-xs">Lab Order #</p><p class="text-white font-mono text-xs">${o.labOrderNumber ?? '—'}</p></div>
          <div><p class="text-slate-500 text-xs">Est. Ready</p><p class="text-white">${fmtDate(o.estimatedReady)}</p></div>
          <div><p class="text-slate-500 text-xs">Received</p><p class="text-white">${fmtDate(o.receivedAt)}</p></div>
        </div>
        ${o.specialInstructions ? `<div class="mt-3 pt-3 border-t border-slate-700/40">
          <p class="text-xs text-slate-500">Special Instructions</p>
          <p class="text-sm text-slate-300 mt-1">${o.specialInstructions}</p>
        </div>` : ''}
      </div>

      <!-- Line Items -->
      <div class="card">
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Line Items</p>
        ${liHtml}
      </div>

      <!-- Financials -->
      <div class="card">
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Financials</p>
        <div class="space-y-1.5 text-sm">
          <div class="flex justify-between"><span class="text-slate-400">Subtotal</span><span>${fmt$(o.subtotal)}</span></div>
          ${o.discount ? `<div class="flex justify-between"><span class="text-slate-400">Discount</span><span class="text-red-400">-${fmt$(o.discount)}</span></div>` : ''}
          ${o.insuranceBenefit ? `<div class="flex justify-between"><span class="text-slate-400">Insurance Benefit</span><span class="text-emerald-400">-${fmt$(o.insuranceBenefit)}</span></div>` : ''}
          <div class="flex justify-between font-semibold border-t border-slate-700/50 pt-1.5"><span>Total Charge</span><span>${fmt$(o.totalCharge)}</span></div>
          <div class="flex justify-between text-slate-400"><span>Deposit Paid</span><span>${fmt$(o.depositPaid)}</span></div>
          <div class="flex justify-between font-bold text-lg ${o.balanceDue > 0 ? 'text-amber-400' : 'text-emerald-400'}"><span>Balance Due</span><span>${fmt$(o.balanceDue)}</span></div>
        </div>
      </div>
    </div>`

  // Action buttons
  const nextStatuses = NEXT_STATUS[o.status] ?? []
  const statusBtns = nextStatuses.map(s => {
    const label = ORDER_STATUS_LABELS[s] ?? s
    const cls = s === 'CANCELLED' ? 'btn-secondary text-red-400 hover:text-red-300' : s === 'DISPENSED' ? 'btn-primary bg-emerald-600 hover:bg-emerald-700' : 'btn-primary'
    return `<button class="${cls}" onclick="advanceOrder('${o.id}','${s}')"><i class="fas fa-arrow-right mr-1"></i>${label}</button>`
  }).join('')

  $('drawer-actions').innerHTML = `
    ${statusBtns}
    <button class="btn-ghost ml-auto" onclick="closeDrawer()">Close</button>`

  drawer.classList.remove('translate-x-full')
}

async function advanceOrder(orderId, newStatus) {
  const res = await api('POST', `/orders/${orderId}/status`, { status: newStatus })
  if (res.success) {
    showToast(`Order → ${ORDER_STATUS_LABELS[newStatus] ?? newStatus}`)
    loadKPIs()
    loadOrders($('orders-filter').value)
    openOrderDrawer(orderId)
  } else {
    showToast(res.error ?? 'Failed to advance order', false)
  }
}

function closeDrawer()              { $('order-drawer').classList.add('translate-x-full'); state.activeOrder = null }
function closeDrawerOutside(e)      { if (e.target === $('order-drawer')) closeDrawer() }
function closeModal(id)             { $(id).classList.add('hidden') }

/* ── Frames tab ─────────────────────────────────────────────────────────────── */
async function loadFrames() {
  $('frames-grid').innerHTML = '<div class="card text-center text-slate-500 py-8 col-span-full"><i class="fas fa-spinner fa-spin text-2xl"></i></div>'
  const res = await api('GET', '/frames')
  state.frames = res.data ?? []
  renderFramesGrid(state.frames)
}

function renderFramesGrid(frames) {
  if (!frames.length) {
    $('frames-grid').innerHTML = '<div class="card text-center text-slate-500 py-8 col-span-full">No frames found.</div>'
    return
  }
  $('frames-grid').innerHTML = frames.map(f => `
    <div class="card hover:border-blue-500/40 transition-colors cursor-pointer group" onclick="openFrameModal('${f.id}')">
      <div class="flex items-start justify-between gap-2 mb-3">
        <div>
          <p class="font-semibold text-white text-sm group-hover:text-blue-300 transition-colors">${f.brand} ${f.model}</p>
          <p class="text-xs text-slate-500">${f.color} · ${f.size}</p>
        </div>
        ${stockBadge(f.status)}
      </div>
      <div class="grid grid-cols-2 gap-2 text-xs mb-3">
        <div><span class="text-slate-500">SKU</span> <span class="font-mono text-slate-300">${f.sku}</span></div>
        <div><span class="text-slate-500">Material</span> <span class="text-slate-300">${f.material}</span></div>
        <div><span class="text-slate-500">Category</span> <span class="text-slate-300">${f.category.replace(/_/g,' ')}</span></div>
        <div><span class="text-slate-500">Gender</span> <span class="text-slate-300">${f.gender}</span></div>
      </div>
      <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/40">
        <div class="text-sm">
          <span class="text-slate-500 text-xs">Retail</span>
          <span class="font-semibold text-white ml-1">${fmt$(f.retail)}</span>
        </div>
        <div class="text-xs text-slate-500">Qty: <span class="font-medium ${f.quantity <= f.minQuantity ? 'text-amber-400' : 'text-white'}">${f.quantity}</span></div>
        ${f.location ? `<span class="text-xs text-slate-600 font-mono">${f.location}</span>` : ''}
      </div>
    </div>`).join('')
}

async function filterFrames() {
  const q   = $('frames-search').value.toLowerCase()
  const cat = $('frames-cat').value
  let frames = state.frames
  if (!frames.length) { await loadFrames(); frames = state.frames }
  if (q)   frames = frames.filter(f => `${f.brand} ${f.model} ${f.color} ${f.sku}`.toLowerCase().includes(q))
  if (cat) frames = frames.filter(f => f.category === cat)
  renderFramesGrid(frames)
}

async function openFrameModal(frameId) {
  const f = state.frames.find(fr => fr.id === frameId)
  if (!f) return
  $('frame-detail-content').innerHTML = `
    <div class="grid grid-cols-2 gap-4 text-sm">
      <div class="col-span-2 flex items-start justify-between">
        <div>
          <h4 class="text-xl font-bold text-white">${f.brand} ${f.model}</h4>
          <p class="text-slate-400">${f.color} · ${f.size}</p>
        </div>
        ${stockBadge(f.status)}
      </div>
      <div><p class="text-slate-500 text-xs">SKU</p><p class="font-mono">${f.sku}</p></div>
      <div><p class="text-slate-500 text-xs">Category</p><p>${f.category.replace(/_/g,' ')}</p></div>
      <div><p class="text-slate-500 text-xs">Material</p><p>${f.material}</p></div>
      <div><p class="text-slate-500 text-xs">Gender</p><p>${f.gender}</p></div>
      <div><p class="text-slate-500 text-xs">Retail Price</p><p class="text-white font-bold text-lg">${fmt$(f.retail)}</p></div>
      <div><p class="text-slate-500 text-xs">Wholesale</p><p>${fmt$(f.wholesale)}</p></div>
      <div><p class="text-slate-500 text-xs">Insurance Allow.</p><p>${fmt$(f.insuranceAllowance ?? 0)}</p></div>
      <div><p class="text-slate-500 text-xs">Stock Qty</p><p class="${f.quantity <= f.minQuantity ? 'text-amber-400 font-bold' : 'text-white'}">${f.quantity} (min ${f.minQuantity})</p></div>
      ${f.location ? `<div><p class="text-slate-500 text-xs">Location</p><p class="font-mono">${f.location}</p></div>` : ''}
      ${f.notes ? `<div class="col-span-2"><p class="text-slate-500 text-xs">Notes</p><p class="text-slate-300">${f.notes}</p></div>` : ''}
    </div>
    <div class="mt-5 pt-4 border-t border-slate-700/50 flex gap-3 justify-between items-center">
      <div class="text-xs text-slate-500">Adjust Quantity</div>
      <div class="flex items-center gap-2">
        <button onclick="adjustQty('${f.id}', ${f.quantity - 1})" class="btn-ghost px-3 py-1.5 text-lg leading-none">−</button>
        <span class="text-white font-bold w-8 text-center">${f.quantity}</span>
        <button onclick="adjustQty('${f.id}', ${f.quantity + 1})" class="btn-ghost px-3 py-1.5 text-lg leading-none">+</button>
      </div>
    </div>`
  $('modal-frame').classList.remove('hidden')
}

async function adjustQty(frameId, newQty) {
  if (newQty < 0) return
  const res = await api('PATCH', `/frames/${frameId}`, { quantity: newQty })
  if (res.success) {
    const idx = state.frames.findIndex(f => f.id === frameId)
    if (idx !== -1) state.frames[idx] = res.data
    showToast(`Quantity updated → ${newQty}`)
    openFrameModal(frameId)
    loadKPIs()
    renderFramesGrid(state.frames)
  } else {
    showToast(res.error ?? 'Update failed', false)
  }
}

/* ── Lenses tab ─────────────────────────────────────────────────────────────── */
async function loadLenses() {
  $('lenses-body').innerHTML = '<tr><td colspan="8" class="text-center py-8 text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i>Loading…</td></tr>'
  const res = await api('GET', '/lenses')
  state.lenses = res.data ?? []
  renderLensesTable(state.lenses)
}

function renderLensesTable(lenses) {
  if (!lenses.length) { $('lenses-body').innerHTML = '<tr><td colspan="8" class="text-center py-8 text-slate-500">No lenses found.</td></tr>'; return }
  const typeLabels = { SINGLE_VISION:'SV', BIFOCAL:'BF', TRIFOCAL:'TF', PROGRESSIVE:'Progressive', READING:'Reading', COMPUTER:'Computer', OCCUPATIONAL:'Occupational' }
  const coatLabels = { NONE:'None', AR:'AR', AR_PREMIUM:'AR Premium', BLUE_LIGHT:'Blue Light', PHOTOCHROMIC:'Photochromic', POLARIZED:'Polarized', UV_ONLY:'UV Only', MIRROR:'Mirror' }
  $('lenses-body').innerHTML = lenses.map(l => `<tr>
    <td>
      <div class="font-medium text-white text-sm">${l.name}</div>
      <div class="font-mono text-xs text-slate-500">${l.sku}</div>
    </td>
    <td class="text-sm">${typeLabels[l.type] ?? l.type}</td>
    <td class="text-sm text-slate-300">${l.material.replace(/_/g,' ')}</td>
    <td class="text-sm">${coatLabels[l.coating] ?? l.coating}</td>
    <td class="font-semibold">${fmt$(l.retail)}</td>
    <td class="text-slate-400">${fmt$(l.insuranceAllowance ?? 0)}</td>
    <td>${stockBadge(l.status)}</td>
    <td class="text-sm text-slate-400">${l.labTurnaround ? `${l.labTurnaround}d` : '—'}</td>
  </tr>`).join('')
}

function filterLenses() {
  const q = $('lenses-search').value.toLowerCase()
  renderLensesTable(state.lenses.filter(l =>
    !q || `${l.name} ${l.sku} ${l.type} ${l.material}`.toLowerCase().includes(q)
  ))
}

/* ── Contact Lens tab ───────────────────────────────────────────────────────── */
async function loadCL() {
  $('cl-body').innerHTML = '<tr><td colspan="8" class="text-center py-8 text-slate-500"><i class="fas fa-spinner fa-spin mr-2"></i>Loading…</td></tr>'
  const res = await api('GET', '/contact-lenses')
  state.cl = res.data ?? []
  renderCLTable(state.cl)
}

function renderCLTable(items) {
  if (!items.length) { $('cl-body').innerHTML = '<tr><td colspan="8" class="text-center py-8 text-slate-500">No contact lenses found.</td></tr>'; return }
  $('cl-body').innerHTML = items.map(cl => `<tr>
    <td>
      <div class="font-medium text-white text-sm">${cl.brand}</div>
      <div class="font-mono text-xs text-slate-500">${cl.sku}</div>
    </td>
    <td class="text-sm">${cl.product}</td>
    <td>${stockBadge(cl.type === 'DAILY' ? 'IN_STOCK' : 'IN_STOCK')} <span class="text-xs text-slate-400 ml-1">${cl.type}</span></td>
    <td class="text-sm font-mono">${cl.sphere != null ? (cl.sphere >= 0 ? '+' : '') + cl.sphere.toFixed(2) : '—'}</td>
    <td class="text-sm text-slate-300">${cl.unitsPerBox} pk</td>
    <td>${stockBadge(cl.status)}</td>
    <td class="font-semibold">${fmt$(cl.retail)}</td>
    <td class="text-slate-400">${fmt$(cl.insuranceAllowance ?? 0)}/yr</td>
  </tr>`).join('')
}

function filterCL() {
  const q = $('cl-search').value.toLowerCase()
  renderCLTable(state.cl.filter(c => !q || `${c.brand} ${c.product} ${c.sku}`.toLowerCase().includes(q)))
}

/* ── Prescriptions tab ──────────────────────────────────────────────────────── */
async function loadRx() {
  const pid = $('rx-patient-id').value.trim()
  if (!pid) { showToast('Enter a Patient ID first', false); return }
  $('rx-list').innerHTML = '<div class="card text-center text-slate-500 py-8 col-span-full"><i class="fas fa-spinner fa-spin text-2xl"></i></div>'
  const res = await api('GET', `/rx/patient/${pid}`)
  state.rx = res.data ?? []
  renderRxList(state.rx)
}

function rxVal(eye, field) {
  if (eye == null) return '—'
  const v = eye[field]
  if (v == null) return '—'
  if (field === 'sphere' || field === 'cylinder') return (v >= 0 ? '+' : '') + v.toFixed(2)
  if (field === 'add') return `+${Number(v).toFixed(2)}`
  return v
}

function renderRxList(rxList) {
  if (!rxList.length) {
    $('rx-list').innerHTML = '<div class="card text-center text-slate-500 py-8 col-span-full">No prescriptions found for this patient.</div>'
    return
  }
  $('rx-list').innerHTML = rxList.map(rx => `
    <div class="card">
      <div class="flex items-start justify-between mb-4">
        <div>
          <p class="font-semibold text-white">${rx.patientName}</p>
          <p class="text-xs text-slate-500">${rx.providerName} · ${fmtDate(rx.rxDate)}</p>
        </div>
        <div class="text-right">
          <span class="badge ${rx.signed ? 'badge-green' : 'badge-yellow'}">${rx.signed ? 'Signed' : 'Unsigned'}</span>
          <p class="text-xs text-slate-500 mt-1">Expires ${fmtDate(rx.expiresDate)}</p>
        </div>
      </div>
      <!-- Rx Grid -->
      <table class="w-full text-xs mb-3">
        <thead><tr>
          <th class="text-left text-slate-500 pb-1 font-medium">Eye</th>
          <th class="text-right text-slate-500 pb-1 font-medium">SPH</th>
          <th class="text-right text-slate-500 pb-1 font-medium">CYL</th>
          <th class="text-right text-slate-500 pb-1 font-medium">AXIS</th>
          <th class="text-right text-slate-500 pb-1 font-medium">ADD</th>
          <th class="text-right text-slate-500 pb-1 font-medium">PD</th>
          <th class="text-right text-slate-500 pb-1 font-medium">VA</th>
        </tr></thead>
        <tbody>
          <tr class="border-t border-slate-700/40">
            <td class="py-1.5 font-semibold text-blue-400">OD</td>
            <td class="text-right font-mono text-white">${rxVal(rx.od,'sphere')}</td>
            <td class="text-right font-mono text-white">${rxVal(rx.od,'cylinder')}</td>
            <td class="text-right font-mono text-white">${rxVal(rx.od,'axis')}</td>
            <td class="text-right font-mono text-white">${rxVal(rx.od,'add')}</td>
            <td class="text-right font-mono text-white">${rxVal(rx.od,'pd')}</td>
            <td class="text-right text-white">${rxVal(rx.od,'va')}</td>
          </tr>
          <tr class="border-t border-slate-700/40">
            <td class="py-1.5 font-semibold text-purple-400">OS</td>
            <td class="text-right font-mono text-white">${rxVal(rx.os,'sphere')}</td>
            <td class="text-right font-mono text-white">${rxVal(rx.os,'cylinder')}</td>
            <td class="text-right font-mono text-white">${rxVal(rx.os,'axis')}</td>
            <td class="text-right font-mono text-white">${rxVal(rx.os,'add')}</td>
            <td class="text-right font-mono text-white">${rxVal(rx.os,'pd')}</td>
            <td class="text-right text-white">${rxVal(rx.os,'va')}</td>
          </tr>
        </tbody>
      </table>
      <div class="flex items-center justify-between text-xs text-slate-500 mt-2 pt-2 border-t border-slate-700/40">
        <span>Binocular PD: <span class="text-white font-mono">${rx.binocularPd ?? '—'}</span></span>
        <span>Lens Type: <span class="text-white">${rx.lensType.replace(/_/g,' ')}</span></span>
        <span class="font-mono text-xs text-slate-600">${rx.id}</span>
      </div>
    </div>`).join('')
}

/* ── New Order Modal ─────────────────────────────────────────────────────────── */
let lineItemCount = 0

function openNewOrderModal() {
  lineItemCount = 0
  $('line-items-container').innerHTML = ''
  // Set default ready date to 7 days out
  const d = new Date(); d.setDate(d.getDate() + 7)
  $('no-ready').value = d.toISOString().slice(0,10)
  addLineItem()  // start with one line item
  $('modal-new-order').classList.remove('hidden')
}

function addLineItem() {
  lineItemCount++
  const n = lineItemCount
  const div = document.createElement('div')
  div.id = `li-row-${n}`
  div.className = 'grid grid-cols-12 gap-2 items-end'
  div.innerHTML = `
    <div class="col-span-5">
      <label class="block text-xs text-slate-400 mb-1">Description</label>
      <input id="li-desc-${n}" class="input-field" placeholder="Frame / Lens / CL…" />
    </div>
    <div class="col-span-2">
      <label class="block text-xs text-slate-400 mb-1">Type</label>
      <select id="li-type-${n}" class="select-field">
        <option value="FRAME">Frame</option>
        <option value="LENS">Lens</option>
        <option value="CONTACT_LENS">CL</option>
        <option value="SERVICE">Service</option>
        <option value="ACCESSORY">Accessory</option>
      </select>
    </div>
    <div class="col-span-1">
      <label class="block text-xs text-slate-400 mb-1">Qty</label>
      <input id="li-qty-${n}" type="number" value="1" min="1" class="input-field" />
    </div>
    <div class="col-span-2">
      <label class="block text-xs text-slate-400 mb-1">Retail $</label>
      <input id="li-retail-${n}" type="number" placeholder="0.00" class="input-field" />
    </div>
    <div class="col-span-1">
      <label class="block text-xs text-slate-400 mb-1">Eye</label>
      <select id="li-eye-${n}" class="select-field">
        <option value="">—</option>
        <option value="OD">OD</option>
        <option value="OS">OS</option>
        <option value="OU">OU</option>
      </select>
    </div>
    <div class="col-span-1 flex justify-end">
      <button class="btn-ghost text-red-400 hover:text-red-300 mt-4" onclick="document.getElementById('li-row-${n}').remove()"><i class="fas fa-trash-can"></i></button>
    </div>`
  $('line-items-container').appendChild(div)
}

async function submitNewOrder() {
  const patientId = $('no-pid').value.trim()
  const patientName = $('no-pname').value.trim()
  if (!patientId || !patientName) { showToast('Patient ID and Name are required', false); return }

  const lineItems = []
  for (let n = 1; n <= lineItemCount; n++) {
    const desc = document.getElementById(`li-desc-${n}`)
    if (!desc) continue
    const descVal   = desc.value.trim()
    const typeVal   = document.getElementById(`li-type-${n}`).value
    const qty       = parseInt(document.getElementById(`li-qty-${n}`).value) || 1
    const retail    = parseFloat(document.getElementById(`li-retail-${n}`).value) || 0
    const eye       = document.getElementById(`li-eye-${n}`).value || undefined
    if (!descVal || retail <= 0) continue
    lineItems.push({
      type: typeVal, itemId: `item-${n}`, description: descVal,
      quantity: qty, unitCost: retail * 0.55, unitRetail: retail,
      discount: 0, ...(eye ? { eye } : {}),
    })
  }
  if (!lineItems.length) { showToast('Add at least one line item', false); return }

  const providerMap = { 'dr-chen': 'Dr. Emily Chen', 'dr-patel': 'Dr. Raj Patel' }
  const providerId   = $('no-provider').value
  const payload = {
    patientId, patientName,
    patientPhone: $('no-phone').value.trim() || undefined,
    providerId, providerName: providerMap[providerId] ?? providerId,
    orderType: $('no-type').value,
    lab: $('no-lab').value.trim() || undefined,
    estimatedReady: $('no-ready').value || undefined,
    insuranceBenefit: parseFloat($('no-ins').value) || 0,
    depositPaid: parseFloat($('no-deposit').value) || 0,
    specialInstructions: $('no-notes').value.trim() || undefined,
    lineItems,
  }

  const res = await api('POST', '/orders', payload)
  if (res.success) {
    showToast(`${res.data.orderNumber} created`)
    closeModal('modal-new-order')
    loadOrders($('orders-filter').value)
    loadKPIs()
  } else {
    showToast(res.error ?? 'Failed to create order', false)
  }
}

/* ── Keyboard shortcuts ─────────────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeDrawer(); closeModal('modal-new-order'); closeModal('modal-frame') }
  if (e.key === 'n' && !e.target.matches('input,textarea,select')) openNewOrderModal()
})

/* ── Init ───────────────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  await loadKPIs()
  await loadOrders()
  // Pre-load frames/lenses/CL in background
  Promise.all([loadFrames(), loadLenses(), loadCL()]).catch(() => {})
})
