// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Billing & Claims Controller  (Phase 2A)
// public/static/billing.js
// ─────────────────────────────────────────────────────────────────────────────

'use strict'

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel)
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)]
const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

// ── API helpers ───────────────────────────────────────────────────────────────
function _authHdr(extra = {}) {
  const tok = sessionStorage.getItem('of_access_token');
  const h = { 'Content-Type': 'application/json', ...extra };
  if (tok) h['Authorization'] = `Bearer ${tok}`;
  return h;
}
function _handle401(r) { if (r.status === 401) { sessionStorage.clear(); location.href = '/login'; } return r; }
async function apiGet(url) {
  const r = _handle401(await fetch(url, { headers: _authHdr() }))
  return r.json()
}
async function apiPost(url, body) {
  const r = _handle401(await fetch(url, { method: 'POST', headers: _authHdr(), body: JSON.stringify(body) }))
  return r.json()
}
async function apiPut(url, body) {
  const r = _handle401(await fetch(url, { method: 'PUT', headers: _authHdr(), body: JSON.stringify(body) }))
  return r.json()
}

// ── Format helpers ────────────────────────────────────────────────────────────
function fmtUSD(n) { return '$' + (n ?? 0).toFixed(2) }
function fmtDate(s) {
  if (!s) return '—'
  const d = new Date(s + (s.length === 10 ? 'T12:00:00' : ''))
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CFG = {
  DRAFT:          { label: 'Draft',          cls: 'badge-draft',          icon: 'fa-pencil',              next: 'PENDING_REVIEW' },
  PENDING_REVIEW: { label: 'Pending Review', cls: 'badge-pending_review', icon: 'fa-clock',               next: 'REVIEWED' },
  REVIEWED:       { label: 'Reviewed',       cls: 'badge-reviewed',       icon: 'fa-check-double',        next: 'SUBMITTED' },
  SUBMITTED:      { label: 'Submitted',      cls: 'badge-submitted',      icon: 'fa-paper-plane',         next: 'PAID' },
  PAID:           { label: 'Paid',           cls: 'badge-paid',           icon: 'fa-circle-check',        next: null },
  PARTIALLY_PAID: { label: 'Partially Paid', cls: 'badge-partially_paid', icon: 'fa-circle-half-stroke',  next: null },
  DENIED:         { label: 'Denied',         cls: 'badge-denied',         icon: 'fa-triangle-exclamation',next: 'PENDING_REVIEW' },
  VOIDED:         { label: 'Voided',         cls: 'badge-voided',         icon: 'fa-ban',                 next: null },
}

function statusBadge(status) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.DRAFT
  return `<span class="badge ${c.cls}"><i class="fas ${c.icon}"></i>${c.label}</span>`
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer
function showToast(msg, type = 'success') {
  const t = $('#toast'), icon = $('#toast-icon'), m = $('#toast-msg')
  icon.className = type === 'success'
    ? 'fas fa-check-circle text-emerald-400'
    : type === 'error'
    ? 'fas fa-circle-xmark text-red-400'
    : 'fas fa-circle-info text-blue-400'
  m.textContent = msg
  t.classList.remove('hidden')
  t.classList.add('flex')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { t.classList.add('hidden'); t.classList.remove('flex') }, 3500)
}

// ── Global state ──────────────────────────────────────────────────────────────
const S = {
  superbills:   [],        // SuperbillSummary[]
  currentSb:    null,      // full Superbill | null
  currentView:  'superbills',
  activeFilter: 'ALL',
  searchQuery:  '',
  payBy:        'PATIENT',
  cptCatalog:   [],
  selectedCpt:  null,      // CptCode for add-line modal
  cptAddLines:  [],        // pending lines while editing
}

// ── Load AR summary (stat bar) ────────────────────────────────────────────────
async function loadArBar() {
  const res = await apiGet('/api/billing/ar')
  if (!res.success) return
  const d = res.data
  const bar = $('#ar-bar')
  bar.innerHTML = `
    <div class="stat-card">
      <p class="text-xs text-slate-500 mb-1">Total Outstanding</p>
      <p class="text-xl font-bold text-red-400">${fmtUSD(d.totalOutstanding)}</p>
    </div>
    <div class="stat-card">
      <p class="text-xs text-slate-500 mb-1">Total Charged</p>
      <p class="text-xl font-bold text-white">${fmtUSD(d.totalCharged)}</p>
    </div>
    <div class="stat-card">
      <p class="text-xs text-slate-500 mb-1">Total Collected</p>
      <p class="text-xl font-bold text-emerald-400">${fmtUSD(d.totalCollected)}</p>
    </div>
    <div class="stat-card">
      <p class="text-xs text-slate-500 mb-1">Adjustments</p>
      <p class="text-xl font-bold text-slate-400">${fmtUSD(d.totalAdjustments)}</p>
    </div>
  `
}

// ── Load & render superbills list ─────────────────────────────────────────────
async function loadSuperbills() {
  const res = await apiGet('/api/billing/superbills')
  if (!res.success) return
  S.superbills = res.data
  renderSuperbillTable()
}

function filteredSuperbills() {
  let list = S.superbills
  if (S.activeFilter !== 'ALL') list = list.filter(s => s.status === S.activeFilter)
  if (S.searchQuery) {
    const q = S.searchQuery.toLowerCase()
    list = list.filter(s =>
      s.patientName.toLowerCase().includes(q) ||
      s.id.includes(q) ||
      (s.claimNumber ?? '').toLowerCase().includes(q) ||
      s.cptCodes.some(c => c.includes(q)) ||
      s.diagnosisCodes.some(c => c.toLowerCase().includes(q))
    )
  }
  return list
}

function renderSuperbillTable() {
  const tbody = $('#sb-tbody')
  const list  = filteredSuperbills()
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-16 text-slate-500 text-sm">No superbills found</td></tr>`
    return
  }
  tbody.innerHTML = list.map(s => {
    const selected = S.currentSb?.id === s.id ? 'selected' : ''
    const codes = [...new Set([...s.cptCodes.slice(0,3), ...s.diagnosisCodes.slice(0,2)])]
    return `
      <tr class="sb-row border-b border-slate-800/60 ${selected}" data-id="${esc(s.id)}">
        <td class="px-4 py-3">
          <p class="font-medium text-white text-sm">${esc(s.patientName)}</p>
          <p class="text-xs text-slate-500">${esc(s.patientId)}</p>
        </td>
        <td class="px-4 py-3 text-xs text-slate-400">${fmtDate(s.serviceDate)}</td>
        <td class="px-4 py-3 text-xs text-slate-300">${esc(s.providerName)}</td>
        <td class="px-4 py-3">
          <div class="flex flex-wrap gap-1">
            ${codes.slice(0,4).map(c => `<span class="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-slate-300">${esc(c)}</span>`).join('')}
            ${codes.length > 4 ? `<span class="text-[10px] text-slate-500">+${codes.length-4}</span>` : ''}
          </div>
        </td>
        <td class="px-4 py-3 text-right font-semibold text-white text-sm">${fmtUSD(s.totalCharge)}</td>
        <td class="px-4 py-3 text-right font-semibold text-sm ${s.patientBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}">${fmtUSD(s.patientBalance)}</td>
        <td class="px-4 py-3 text-center">${statusBadge(s.status)}</td>
        <td class="px-4 py-3 text-right">
          <button class="btn-open-drawer w-7 h-7 rounded-lg hover:bg-slate-700 flex items-center justify-center text-slate-500 hover:text-white transition-colors" data-id="${esc(s.id)}">
            <i class="fas fa-chevron-right text-xs"></i>
          </button>
        </td>
      </tr>
    `
  }).join('')
}

// ── Load & render Claims Queue ────────────────────────────────────────────────
function renderClaimsQueue() {
  const submitted = S.superbills.filter(s => ['SUBMITTED','DENIED','PARTIALLY_PAID'].includes(s.status))
  const list = $('#claims-list')
  if (!submitted.length) {
    list.innerHTML = `<p class="text-sm text-slate-500 text-center py-12">No claims in queue</p>`
    return
  }
  list.innerHTML = submitted.map(s => `
    <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-4 hover:border-slate-700 cursor-pointer sb-row" data-id="${esc(s.id)}">
      <div class="flex-1">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-semibold text-white text-sm">${esc(s.patientName)}</span>
          ${statusBadge(s.status)}
        </div>
        <div class="flex flex-wrap gap-3 text-xs text-slate-500">
          <span><i class="fas fa-calendar mr-1"></i>${fmtDate(s.serviceDate)}</span>
          <span><i class="fas fa-user-md mr-1"></i>${esc(s.providerName)}</span>
          ${s.claimNumber ? `<span class="font-mono text-slate-400"><i class="fas fa-hashtag mr-1"></i>${esc(s.claimNumber)}</span>` : ''}
        </div>
      </div>
      <div class="text-right">
        <p class="font-bold text-white">${fmtUSD(s.totalCharge)}</p>
        <p class="text-xs text-slate-500">charged</p>
      </div>
    </div>
  `).join('')
}

// ── Load & render CPT Catalog ─────────────────────────────────────────────────
async function loadCptCatalog() {
  if (S.cptCatalog.length) { renderCptCatalog(); return }
  const res = await apiGet('/api/billing/cpt')
  if (!res.success) return
  S.cptCatalog = res.data
  renderCptCatalog()
}

function renderCptCatalog(filter = '') {
  const tbody = $('#cpt-catalog-tbody')
  const q = filter.toLowerCase()
  const list = q
    ? S.cptCatalog.filter(c => c.code.includes(q) || c.description.toLowerCase().includes(q))
    : S.cptCatalog
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8 text-slate-500 text-sm">No codes found</td></tr>`
    return
  }
  tbody.innerHTML = list.map(c => `
    <tr class="li-row border-b border-slate-800/60">
      <td class="px-3 py-2 font-mono text-blue-400 font-semibold">${esc(c.code)}</td>
      <td class="px-3 py-2 text-slate-200">${esc(c.description)}</td>
      <td class="px-3 py-2 text-slate-500 text-xs">${esc(c.category.replace(/_/g,' '))}</td>
      <td class="px-3 py-2 text-right font-semibold text-emerald-400">${fmtUSD(c.fee)}</td>
    </tr>
  `).join('')
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
async function openDrawer(id) {
  const res = await apiGet(`/api/billing/superbills/${id}`)
  if (!res.success) { showToast('Could not load superbill', 'error'); return }
  S.currentSb = res.data
  renderDrawer()
  renderSuperbillTable()  // re-render to highlight selected row

  const drawer = $('#detail-drawer')
  drawer.classList.remove('hidden-right')
  drawer.classList.add('visible')
}

function closeDrawer() {
  const drawer = $('#detail-drawer')
  drawer.classList.remove('visible')
  drawer.classList.add('hidden-right')
  S.currentSb = null
  renderSuperbillTable()
}

function renderDrawer() {
  const sb = S.currentSb
  if (!sb) return

  $('#drawer-title').textContent = `Superbill #${sb.id}`

  const cfg = STATUS_CFG[sb.status] ?? STATUS_CFG.DRAFT

  $('#drawer-content').innerHTML = `
    <!-- Header info -->
    <div class="flex items-start justify-between">
      <div>
        <p class="text-base font-semibold text-white">${esc(sb.patientName)}</p>
        <p class="text-xs text-slate-500">${esc(sb.patientId)} · ${fmtDate(sb.serviceDate)}</p>
      </div>
      ${statusBadge(sb.status)}
    </div>

    <!-- Provider & Insurance -->
    <div class="grid grid-cols-2 gap-3">
      <div class="bg-slate-800/50 rounded-lg p-3">
        <p class="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Provider</p>
        <p class="text-sm text-white">${esc(sb.providerName)}</p>
        ${sb.providerNpi ? `<p class="text-xs text-slate-500">NPI: ${esc(sb.providerNpi)}</p>` : ''}
      </div>
      <div class="bg-slate-800/50 rounded-lg p-3">
        <p class="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1">Insurance</p>
        ${sb.primaryInsurance
          ? `<p class="text-sm text-white">${esc(sb.primaryInsurance.payerName)}</p>
             <p class="text-xs text-slate-500">${esc(sb.primaryInsurance.memberId)}</p>`
          : `<p class="text-xs text-slate-500">Self-pay</p>`}
      </div>
    </div>

    <!-- Diagnoses -->
    <div>
      <p class="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Diagnoses</p>
      <div class="space-y-1">
        ${(sb.diagnoses ?? []).map((d, i) => `
          <div class="flex items-center gap-2 text-xs">
            <span class="font-mono px-1.5 py-0.5 rounded bg-slate-800 text-blue-400 font-semibold">${esc(d.icd10Code)}</span>
            <span class="text-slate-300">${esc(d.description)}</span>
            ${d.primary ? '<span class="text-[9px] font-semibold text-amber-400 uppercase">Primary</span>' : ''}
          </div>
        `).join('')}
      </div>
    </div>

    <!-- Line Items -->
    <div>
      <div class="flex items-center justify-between mb-2">
        <p class="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">CPT Line Items</p>
        ${['DRAFT','PENDING_REVIEW','REVIEWED'].includes(sb.status) ? `
          <button id="btn-drawer-add-cpt" class="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
            <i class="fas fa-plus text-[10px]"></i> Add CPT
          </button>` : ''}
      </div>
      <table class="w-full li-table">
        <thead>
          <tr class="border-b border-slate-800">
            <th class="text-left px-2 py-1.5">CPT</th>
            <th class="text-left px-2 py-1.5">Description</th>
            <th class="text-center px-2 py-1.5">Units</th>
            <th class="text-right px-2 py-1.5">Fee</th>
            <th class="text-right px-2 py-1.5">Total</th>
          </tr>
        </thead>
        <tbody>
          ${(sb.lineItems ?? []).map(li => `
            <tr class="li-row border-b border-slate-800/40">
              <td class="px-2 py-2 font-mono text-blue-400 font-semibold">${esc(li.cptCode)}</td>
              <td class="px-2 py-2 text-slate-300 text-xs">${esc(li.description)}${li.modifier ? ` <span class="ml-1 px-1 rounded bg-slate-700 text-slate-400 font-mono text-[10px]">${esc(li.modifier)}</span>` : ''}</td>
              <td class="px-2 py-2 text-center text-slate-400">${li.units}</td>
              <td class="px-2 py-2 text-right text-slate-300">${fmtUSD(li.fee)}</td>
              <td class="px-2 py-2 text-right font-semibold text-white">${fmtUSD(li.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <!-- Financial Summary -->
    <div class="bg-slate-800/50 rounded-lg p-3 space-y-2">
      <p class="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-2">Financials</p>
      <div class="flex justify-between text-xs"><span class="text-slate-400">Total Charged</span><span class="font-semibold text-white">${fmtUSD(sb.totalCharge)}</span></div>
      <div class="flex justify-between text-xs"><span class="text-slate-400">Contractual Adj.</span><span class="text-slate-400">-${fmtUSD(sb.adjustments)}</span></div>
      <div class="flex justify-between text-xs"><span class="text-slate-400">Insurance Billed</span><span class="text-slate-300">${fmtUSD(sb.insuranceBilled)}</span></div>
      ${sb.insurancePaid != null ? `<div class="flex justify-between text-xs"><span class="text-slate-400">Insurance Paid</span><span class="text-emerald-400">${fmtUSD(sb.insurancePaid)}</span></div>` : ''}
      <div class="flex justify-between text-xs"><span class="text-slate-400">Copay</span><span>${fmtUSD(sb.copayAmount)}</span></div>
      <div class="flex justify-between text-xs"><span class="text-slate-400">Copay Collected</span><span class="text-emerald-400">${fmtUSD(sb.copayCollected)}</span></div>
      <div class="h-px bg-slate-700 my-1"></div>
      <div class="flex justify-between text-sm font-bold"><span class="text-slate-300">Patient Balance</span><span class="${sb.patientBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}">${fmtUSD(sb.patientBalance)}</span></div>
    </div>

    ${sb.claimNumber ? `<div class="text-xs text-slate-500">Claim #: <span class="font-mono text-slate-300">${esc(sb.claimNumber)}</span></div>` : ''}
    ${sb.notes ? `<div class="bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2 text-xs text-amber-300"><i class="fas fa-exclamation-triangle mr-1.5"></i>${esc(sb.notes)}</div>` : ''}
  `

  // Drawer action buttons
  const actions = $('#drawer-actions')
  actions.innerHTML = ''

  // Advance status button
  if (cfg.next) {
    const nextCfg = STATUS_CFG[cfg.next]
    const btn = document.createElement('button')
    btn.id = 'btn-advance-status'
    btn.className = 'flex-1 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white transition-colors flex items-center justify-center gap-1.5'
    btn.innerHTML = `<i class="fas fa-arrow-right"></i> → ${nextCfg?.label ?? cfg.next}`
    btn.addEventListener('click', async () => {
      const res = await apiPost(`/api/billing/superbills/${sb.id}/status`, {})
      if (res.success) {
        showToast(`Status updated to ${STATUS_CFG[res.data.status]?.label ?? res.data.status}`)
        await openDrawer(sb.id)
        await loadSuperbills()
        await loadArBar()
      } else {
        showToast(res.error ?? 'Failed to update status', 'error')
      }
    })
    actions.appendChild(btn)
  }

  // Payment button (if there's a balance or we're submitted)
  if (['SUBMITTED','PARTIALLY_PAID','DRAFT','PENDING_REVIEW','REVIEWED'].includes(sb.status)) {
    const btn = document.createElement('button')
    btn.id = 'btn-open-payment'
    btn.className = 'px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-xs font-semibold text-white transition-colors flex items-center gap-1.5'
    btn.innerHTML = `<i class="fas fa-circle-dollar-to-slot"></i> Payment`
    btn.addEventListener('click', () => openPaymentModal())
    actions.appendChild(btn)
  }

  // Re-attach add-cpt listener
  const addCptBtn = $('#btn-drawer-add-cpt')
  if (addCptBtn) {
    addCptBtn.addEventListener('click', () => openAddCptModal())
  }
}

// ── View switching ────────────────────────────────────────────────────────────
function switchView(view) {
  S.currentView = view
  $$('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view))
  $('#view-superbills').classList.toggle('hidden', view !== 'superbills')
  $('#view-claims').classList.toggle('hidden', view !== 'claims')
  $('#view-cpt').classList.toggle('hidden', view !== 'cpt')

  if (view === 'claims') renderClaimsQueue()
  if (view === 'cpt')    loadCptCatalog()

  if (view !== 'superbills' && S.currentSb) closeDrawer()
}

// ── Sidebar filter ────────────────────────────────────────────────────────────
function setFilter(filter) {
  S.activeFilter = filter
  $$('[data-filter]').forEach(el => el.classList.toggle('active', el.dataset.filter === filter))
  renderSuperbillTable()
}

// ── New Superbill Modal ───────────────────────────────────────────────────────
function openNewSbModal() {
  // Set today's date as default
  const today = new Date().toISOString().slice(0, 10)
  $('#new-sb-date').value = today
  $('#new-sb-error').classList.add('hidden')
  showModal('modal-new-sb')
}

function showModal(id) {
  const m = $(`#${id}`)
  m.classList.remove('hidden')
  m.classList.add('flex')
}
function hideModal(id) {
  const m = $(`#${id}`)
  m.classList.remove('flex')
  m.classList.add('hidden')
}

async function createSuperbill() {
  const patientId   = $('#new-sb-patient-id').value.trim()
  const patientName = $('#new-sb-patient-name').value.trim()
  const serviceDate = $('#new-sb-date').value
  const copayAmount = parseFloat($('#new-sb-copay').value ?? 0) || 0
  const providerEl  = $('#new-sb-provider')
  const providerId  = providerEl.value
  const providerName = providerEl.options[providerEl.selectedIndex].dataset.name

  const err = $('#new-sb-error')
  if (!patientId || !patientName || !serviceDate || !providerId) {
    err.textContent = 'Please fill in all required fields.'
    err.classList.remove('hidden')
    return
  }
  err.classList.add('hidden')

  const btn = $('#btn-create-sb')
  btn.disabled = true
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1.5"></i>Creating…'

  const res = await apiPost('/api/billing/superbills', {
    patientId, patientName, serviceDate, providerId, providerName, copayAmount
  })

  btn.disabled = false
  btn.innerHTML = '<i class="fas fa-plus mr-1.5"></i>Create Superbill'

  if (!res.success) {
    err.textContent = res.error ?? 'Failed to create superbill.'
    err.classList.remove('hidden')
    return
  }

  hideModal('modal-new-sb')
  showToast('Superbill created')
  await loadSuperbills()
  await loadArBar()
  openDrawer(res.data.id)
}

// ── Payment Modal ─────────────────────────────────────────────────────────────
function openPaymentModal() {
  $('#pay-amount').value = ''
  $('#pay-ref').value = ''
  $('#pay-error').classList.add('hidden')
  S.payBy = 'PATIENT'
  $$('.pay-by-btn').forEach(b => {
    const active = b.dataset.val === 'PATIENT'
    b.classList.toggle('border-blue-500', active)
    b.classList.toggle('bg-blue-500/10', active)
    b.classList.toggle('text-blue-400', active)
    b.classList.toggle('border-slate-700', !active)
    b.classList.toggle('text-slate-400', !active)
  })
  showModal('modal-payment')
}

async function submitPayment() {
  const amount    = parseFloat($('#pay-amount').value)
  const method    = $('#pay-method').value
  const reference = $('#pay-ref').value.trim()
  const err       = $('#pay-error')

  if (!amount || amount <= 0 || !method) {
    err.textContent = 'Amount and method are required.'
    err.classList.remove('hidden')
    return
  }
  err.classList.add('hidden')

  const btn = $('#btn-submit-payment')
  btn.disabled = true
  btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-1.5"></i>Posting…'

  const res = await apiPost(`/api/billing/superbills/${S.currentSb.id}/payment`, {
    amount, method, paidBy: S.payBy, reference: reference || undefined
  })

  btn.disabled = false
  btn.innerHTML = '<i class="fas fa-check mr-1.5"></i>Post Payment'

  if (!res.success) {
    err.textContent = res.error ?? 'Payment failed.'
    err.classList.remove('hidden')
    return
  }

  hideModal('modal-payment')
  showToast(`Payment of ${fmtUSD(amount)} posted`)
  await openDrawer(S.currentSb.id)
  await loadSuperbills()
  await loadArBar()
}

// ── Add CPT Line Modal ────────────────────────────────────────────────────────
function openAddCptModal() {
  S.selectedCpt = null
  $('#cpt-search-input').value = ''
  $('#cpt-dropdown').innerHTML = ''
  $('#cpt-dropdown').classList.add('hidden')
  $('#cpt-selected-preview').classList.add('hidden')
  $('#cpt-units').value = '1'
  $('#cpt-modifier').value = ''
  showModal('modal-add-cpt')
  setTimeout(() => $('#cpt-search-input').focus(), 100)
}

let cptSearchTimer
async function onCptSearchInput(val) {
  clearTimeout(cptSearchTimer)
  if (val.length < 2) {
    $('#cpt-dropdown').classList.add('hidden')
    return
  }
  cptSearchTimer = setTimeout(async () => {
    const res = await apiGet(`/api/billing/cpt/search?q=${encodeURIComponent(val)}`)
    if (!res.success || !res.data.length) {
      $('#cpt-dropdown').classList.add('hidden')
      return
    }
    const dd = $('#cpt-dropdown')
    dd.innerHTML = res.data.map(c => `
      <div class="cpt-opt px-3 py-2 cursor-pointer text-xs" data-code="${esc(c.code)}" data-desc="${esc(c.description)}" data-fee="${c.fee}">
        <span class="font-mono font-bold text-blue-400">${esc(c.code)}</span>
        <span class="text-slate-300 mx-2">—</span>
        <span class="text-slate-300">${esc(c.description)}</span>
        <span class="float-right text-emerald-400 font-semibold">${fmtUSD(c.fee)}</span>
      </div>
    `).join('')
    dd.classList.remove('hidden')
  }, 250)
}

function selectCptFromDropdown(el) {
  const code = el.dataset.code
  const desc = el.dataset.desc
  const fee  = parseFloat(el.dataset.fee)
  S.selectedCpt = { code, description: desc, fee }

  $('#cpt-sel-code').textContent = code
  $('#cpt-sel-desc').textContent = desc
  $('#cpt-sel-fee').textContent  = fmtUSD(fee)
  $('#cpt-selected-preview').classList.remove('hidden')
  $('#cpt-dropdown').classList.add('hidden')
  $('#cpt-search-input').value = `${code} — ${desc}`
}

async function addCptLine() {
  if (!S.selectedCpt) { showToast('Please select a CPT code first', 'info'); return }
  const sb = S.currentSb
  if (!sb) return

  const units    = parseInt($('#cpt-units').value) || 1
  const modifier = $('#cpt-modifier').value

  const newLine = {
    id:            `li-${Math.random().toString(36).slice(2, 10)}`,
    cptCode:       S.selectedCpt.code,
    description:   S.selectedCpt.description,
    icd10Pointers: sb.diagnoses.map(d => d.icd10Code).slice(0, 4),
    units,
    fee:           S.selectedCpt.fee,
    total:         S.selectedCpt.fee * units,
    modifier:      modifier || undefined,
    approved:      true,
  }

  const updatedLines = [...sb.lineItems, newLine]
  const res = await apiPut(`/api/billing/superbills/${sb.id}/items`, {
    lineItems: updatedLines,
    diagnoses: sb.diagnoses,
  })

  if (!res.success) { showToast(res.error ?? 'Failed to add CPT', 'error'); return }

  hideModal('modal-add-cpt')
  showToast(`CPT ${S.selectedCpt.code} added`)
  await openDrawer(sb.id)
  await loadSuperbills()
  await loadArBar()
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Set today's date default for new superbill
  const todayInput = $('#new-sb-date')
  if (todayInput) todayInput.value = new Date().toISOString().slice(0, 10)

  // Load data
  await Promise.all([loadSuperbills(), loadArBar()])

  // View tabs
  $$('.view-tab').forEach(t => {
    t.addEventListener('click', () => switchView(t.dataset.view))
  })

  // Sidebar filters
  $$('[data-filter]').forEach(el => {
    el.addEventListener('click', () => setFilter(el.dataset.filter))
  })

  // Superbill row click → open drawer
  $('#sb-tbody').addEventListener('click', e => {
    const row = e.target.closest('.sb-row')
    const btn = e.target.closest('.btn-open-drawer')
    const id  = (btn ?? row)?.dataset.id
    if (id) openDrawer(id)
  })

  // Claims list row click
  $('#claims-list').addEventListener('click', e => {
    const row = e.target.closest('.sb-row')
    if (row?.dataset.id) { switchView('superbills'); openDrawer(row.dataset.id) }
  })

  // Close drawer
  $('#btn-close-drawer').addEventListener('click', closeDrawer)

  // New Superbill
  $('#btn-new-sb').addEventListener('click', openNewSbModal)
  $('#btn-create-sb').addEventListener('click', createSuperbill)

  // Payment
  $('#btn-submit-payment').addEventListener('click', submitPayment)
  $$('.pay-by-btn').forEach(b => {
    b.addEventListener('click', () => {
      S.payBy = b.dataset.val
      $$('.pay-by-btn').forEach(x => {
        const active = x.dataset.val === S.payBy
        x.classList.toggle('border-blue-500', active)
        x.classList.toggle('bg-blue-500/10', active)
        x.classList.toggle('text-blue-400', active)
        x.classList.toggle('border-slate-700', !active)
        x.classList.toggle('text-slate-400', !active)
      })
    })
  })

  // Add CPT
  $('#btn-add-cpt-line').addEventListener('click', addCptLine)
  $('#cpt-search-input').addEventListener('input', e => onCptSearchInput(e.target.value))
  document.addEventListener('click', e => {
    if (!e.target.closest('#cpt-search-input') && !e.target.closest('#cpt-dropdown')) {
      $('#cpt-dropdown').classList.add('hidden')
    }
    if (e.target.closest('.cpt-opt')) {
      selectCptFromDropdown(e.target.closest('.cpt-opt'))
    }
  })

  // CPT catalog search
  $('#cpt-catalog-search').addEventListener('input', e => renderCptCatalog(e.target.value))

  // Search bar
  $('#sb-search').addEventListener('input', e => {
    S.searchQuery = e.target.value.trim()
    renderSuperbillTable()
  })

  // Modal close buttons
  document.addEventListener('click', e => {
    if (e.target.closest('.modal-close')) {
      $$('.modal-close').forEach(btn => {
        const modal = btn.closest('[id^="modal-"]')
        if (modal) hideModal(modal.id)
      })
    }
  })

  // Close modal on backdrop click
  $$('[id^="modal-"]').forEach(m => {
    m.addEventListener('click', e => {
      if (e.target === m) hideModal(m.id)
    })
  })

  // Keyboard shortcuts
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      // Close any open modal first
      const openModal = $$('[id^="modal-"]').find(m => m.classList.contains('flex'))
      if (openModal) { hideModal(openModal.id); return }
      if (S.currentSb) closeDrawer()
    }
    if (e.key === 'n' && !e.target.closest('input,textarea,select')) openNewSbModal()
  })
}

document.addEventListener('DOMContentLoaded', init)
