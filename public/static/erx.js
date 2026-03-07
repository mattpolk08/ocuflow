// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 7C: E-Prescribing Frontend Logic
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/erx'
let state = {
  currentTab: 'dashboard',
  selectedRxId: null,
  rxStep: 1,
  selectedDrug: null,
  newRxData: {},
  pharmacies: [],
  allRx: [],
}

// ── Utilities ──────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts })
  return r.json()
}
const fmtDate = iso => iso ? iso.slice(0, 10) : '—'
const fmtMoney = n => n != null ? `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 })}` : '—'

function statusChip(s) {
  const map = { DRAFT: 'Draft', PENDING_REVIEW: 'Pending Review', SIGNED: 'Signed', SENT: 'Sent', FILLED: 'Filled', CANCELLED: 'Cancelled', EXPIRED: 'Expired', DENIED: 'Denied' }
  return `<span class="chip ch-${s.toLowerCase()}">${map[s] || s}</span>`
}

function scheduleChip(s) {
  if (s === 'NON_CONTROLLED') return ''
  return `<span class="controlled-badge"><i class="fas fa-exclamation-triangle"></i> ${s}</span>`
}

function severityColor(sev) {
  const map = { MINOR: '#94a3b8', MODERATE: '#fbbf24', MAJOR: '#f97316', CONTRAINDICATED: '#ef4444' }
  return map[sev] || '#94a3b8'
}

function pdmpBadge(status) {
  const map = {
    CLEAR: { icon: 'fas fa-check-circle', color: 'text-emerald-400', label: 'Clear' },
    ALERT: { icon: 'fas fa-triangle-exclamation', color: 'text-yellow-400', label: 'Alert' },
    HIGH_RISK: { icon: 'fas fa-circle-xmark', color: 'text-red-400', label: 'High Risk' },
    NOT_CHECKED: { icon: 'fas fa-circle-question', color: 'text-slate-500', label: 'Not Checked' },
  }
  const s = map[status] || map.NOT_CHECKED
  return `<span class="${s.color} text-xs font-semibold flex items-center gap-1"><i class="${s.icon}"></i>${s.label}</span>`
}

// ── Tab Navigation ─────────────────────────────────────────────────────────────
function showTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'))
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'))
  document.getElementById(`tab-${name}`)?.classList.remove('hidden')
  if (btn) btn.classList.add('active')
  state.currentTab = name
  if (name === 'dashboard') loadDashboard()
  if (name === 'queue') loadSidebarRx()
  if (name === 'formulary') loadFormulary()
  if (name === 'pdmp') loadPdmpReports()
  if (name === 'allergies') { /* user loads manually */ }
}

// ── Dashboard ──────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const res = await apiFetch('/dashboard')
  if (!res.success) return
  const d = res.data
  document.getElementById('kpi-pending').textContent = d.pendingReview
  document.getElementById('kpi-signed').textContent  = d.signedToday
  document.getElementById('kpi-sent').textContent    = d.sentToday
  document.getElementById('kpi-refills').textContent = d.refillRequests
  document.getElementById('kpi-pdmp').textContent    = d.pdmpAlerts
  document.getElementById('kpi-ddi').textContent     = d.drugInteractionAlerts
  document.getElementById('dashboard-ts').textContent = new Date().toLocaleTimeString()

  // Recent Rx table
  const tbody = document.getElementById('recent-rx-body')
  tbody.innerHTML = ''
  for (const rx of d.recentPrescriptions) {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${rx.patientName}</td>
      <td><span class="font-semibold">${rx.drugName}</span> <span class="text-slate-500 text-xs">${rx.genericName}</span></td>
      <td class="text-slate-400">${rx.providerName}</td>
      <td>${statusChip(rx.status)}</td>
      <td class="text-slate-500">${fmtDate(rx.writtenDate)}</td>
      <td>
        <button onclick="openRxActionModal('${rx.id}')" class="btn btn-ghost text-xs py-0.5 px-2">View</button>
        ${rx.status === 'DRAFT' || rx.status === 'PENDING_REVIEW' ? `<button onclick="quickSign('${rx.id}')" class="btn btn-primary text-xs py-0.5 px-2 ml-1">Sign</button>` : ''}
      </td>
    `
    tbody.appendChild(tr)
  }
  if (!d.recentPrescriptions.length) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-xs text-slate-500 py-4">No recent prescriptions</td></tr>'

  // Refill requests
  const refillEl = document.getElementById('refill-list')
  if (d.pendingRefills.length) {
    refillEl.innerHTML = d.pendingRefills.map(rf => `
      <div class="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
        <div>
          <p class="text-xs font-semibold">${rf.pharmacyName}</p>
          <p class="text-xs text-slate-400">Refill #${rf.refillNumber} · Requested ${fmtDate(rf.requestedAt)}</p>
        </div>
        <div class="flex gap-1">
          <button onclick="approveRefill('${rf.id}')" class="btn btn-primary text-xs py-0.5 px-2">Approve</button>
          <button onclick="denyRefill('${rf.id}')" class="btn btn-danger text-xs py-0.5 px-2">Deny</button>
        </div>
      </div>
    `).join('')
  } else {
    refillEl.innerHTML = '<p class="text-xs text-slate-500">No pending refills</p>'
  }

  // PDMP alerts
  const pdmpEl = document.getElementById('pdmp-alert-list')
  if (d.pdmpAlertList.length) {
    pdmpEl.innerHTML = d.pdmpAlertList.map(p => `
      <div class="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
        <div>
          <p class="text-xs font-semibold">${p.patientName}</p>
          <p class="text-xs text-slate-400">Risk Score: ${p.riskScore} · ${p.riskFactors[0] || 'Alert'}</p>
        </div>
        <div>${pdmpBadge(p.status)}</div>
      </div>
    `).join('')
  } else {
    pdmpEl.innerHTML = '<p class="text-xs text-slate-500">No active PDMP alerts</p>'
  }
}

// ── Sidebar Rx List ────────────────────────────────────────────────────────────
async function loadSidebarRx() {
  const filter = document.getElementById('sidebar-filter')?.value || ''
  const url = filter ? `/prescriptions?status=${filter}` : '/prescriptions'
  const res = await apiFetch(url)
  state.allRx = res.success ? res.data : []
  renderSidebarRx()
}

function renderSidebarRx() {
  const container = document.getElementById('sidebar-rx-list')
  if (!state.allRx.length) {
    container.innerHTML = '<div class="p-4 text-center text-xs text-slate-500">No prescriptions found</div>'
    return
  }

  // Group by patient
  const byPatient = {}
  for (const rx of state.allRx) {
    if (!byPatient[rx.patientName]) byPatient[rx.patientName] = []
    byPatient[rx.patientName].push(rx)
  }

  let html = ''
  for (const [patient, rxList] of Object.entries(byPatient)) {
    html += `<div class="section-hdr">${patient}</div>`
    for (const rx of rxList) {
      const active = rx.id === state.selectedRxId ? ' active' : ''
      const ctl = rx.isControlled ? '<i class="fas fa-exclamation-triangle text-red-400 text-xs ml-1"></i>' : ''
      const ddi = rx.drugInteractions.length ? '<i class="fas fa-circle-exclamation text-yellow-400 text-xs ml-1"></i>' : ''
      html += `
        <div class="rx-row${active}" onclick="selectRx('${rx.id}')">
          <div class="flex items-center justify-between mb-0.5">
            <span class="text-xs font-semibold">${rx.drugName}${ctl}${ddi}</span>
            ${statusChip(rx.status)}
          </div>
          <div class="text-xs text-slate-400">${rx.genericName} · ${rx.sig?.frequencyCode || ''}</div>
          <div class="text-xs text-slate-500">${rx.providerName} · ${fmtDate(rx.writtenDate)}</div>
        </div>
      `
    }
  }
  container.innerHTML = html
}

async function selectRx(id) {
  state.selectedRxId = id
  renderSidebarRx()
  const res = await apiFetch(`/prescriptions/${id}`)
  if (!res.success) return
  renderRxDetail(res.data)
}

function renderRxDetail(rx) {
  const pane = document.getElementById('rx-detail-pane')
  const ctl = rx.isControlled ? `<span class="controlled-badge ml-2"><i class="fas fa-exclamation-triangle"></i> ${rx.schedule}</span>` : ''
  const ddiHtml = rx.drugInteractions.map(i => `
    <div class="interaction-alert ${i.severity.toLowerCase()}" style="margin-bottom:6px">
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs font-bold" style="color:${severityColor(i.severity)}">${i.severity}</span>
        <span class="text-xs text-slate-400">Evidence: ${i.evidenceLevel}</span>
      </div>
      <p class="text-xs font-semibold">${i.drug1Name} + ${i.drug2Name}</p>
      <p class="text-xs text-slate-300 mt-0.5">${i.clinicalEffect}</p>
      <p class="text-xs text-slate-400 mt-0.5">Management: ${i.management}</p>
    </div>
  `).join('')

  pane.innerHTML = `
    <div class="card fade-in">
      <div class="flex items-start justify-between mb-4">
        <div>
          <h3 class="text-base font-bold">${rx.drugName}${ctl}</h3>
          <p class="text-sm text-slate-400">${rx.genericName} · ${rx.strength} · ${rx.form.replace(/_/g,' ')}</p>
        </div>
        ${statusChip(rx.status)}
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div class="kpi-card"><div class="text-xs text-slate-400">Patient</div><div class="text-sm font-semibold mt-1">${rx.patientName}</div><div class="text-xs text-slate-500">DOB: ${rx.patientDob}</div></div>
        <div class="kpi-card"><div class="text-xs text-slate-400">Provider</div><div class="text-sm font-semibold mt-1">${rx.providerName}</div><div class="text-xs text-slate-500">NPI: ${rx.providerNpi}</div></div>
        <div class="kpi-card"><div class="text-xs text-slate-400">Pharmacy</div><div class="text-sm font-semibold mt-1">${rx.pharmacyName || '—'}</div></div>
        <div class="kpi-card"><div class="text-xs text-slate-400">PDMP</div><div class="mt-1">${pdmpBadge(rx.pdmpStatus)}</div></div>
      </div>
      <!-- SIG -->
      <div class="card mb-3 p-3" style="background:var(--bg-2)">
        <p class="text-xs font-semibold text-slate-400 mb-1">PRESCRIPTION SIG</p>
        <p class="text-sm text-emerald-300 font-mono">${rx.sig?.dosageInstructions || '—'}</p>
        <div class="flex gap-4 mt-2 text-xs text-slate-400">
          <span>Qty: <strong class="text-white">${rx.sig?.quantity} ${rx.sig?.unit}</strong></span>
          <span>Days: <strong class="text-white">${rx.sig?.daysSupply}</strong></span>
          <span>Refills: <strong class="text-white">${rx.sig?.refills}</strong></span>
          <span>Route: <strong class="text-white">${rx.sig?.route}</strong></span>
          <span>DAW: <strong class="text-white">${rx.daw ? 'Yes' : 'No'}</strong></span>
        </div>
      </div>
      <!-- Diagnosis codes -->
      ${rx.diagnosisCodes?.length ? `<div class="mb-3"><p class="text-xs text-slate-400 mb-1">Diagnosis Codes</p><div class="flex gap-2 flex-wrap">${rx.diagnosisCodes.map(c=>`<span class="chip ch-signed">${c}</span>`).join('')}</div></div>` : ''}
      <!-- Clinical note -->
      ${rx.clinicalNote ? `<div class="mb-3"><p class="text-xs text-slate-400 mb-1">Clinical Note</p><p class="text-sm text-slate-300">${rx.clinicalNote}</p></div>` : ''}
      <!-- Drug interactions -->
      ${ddiHtml ? `<div class="mb-3"><p class="text-xs font-semibold text-yellow-300 mb-2"><i class="fas fa-triangle-exclamation mr-1"></i>Drug Interaction Alerts</p>${ddiHtml}</div>` : ''}
      <!-- Timeline -->
      <div class="mb-3">
        <p class="text-xs text-slate-400 mb-1">Timeline</p>
        <div class="flex gap-4 text-xs flex-wrap">
          ${rx.writtenDate ? `<span>Written: <strong class="text-white">${rx.writtenDate}</strong></span>` : ''}
          ${rx.signedAt ? `<span>Signed: <strong class="text-white">${fmtDate(rx.signedAt)}</strong></span>` : ''}
          ${rx.sentAt ? `<span>Sent: <strong class="text-white">${fmtDate(rx.sentAt)}</strong></span>` : ''}
          ${rx.filledAt ? `<span>Filled: <strong class="text-white">${fmtDate(rx.filledAt)}</strong></span>` : ''}
          <span>Expires: <strong class="text-white">${fmtDate(rx.expiresAt)}</strong></span>
        </div>
      </div>
      <!-- Actions -->
      <div class="flex flex-wrap gap-2 pt-3 border-t border-slate-700/40">
        ${rx.status === 'DRAFT' || rx.status === 'PENDING_REVIEW' ? `
          <button onclick="quickSign('${rx.id}')" class="btn btn-primary text-xs"><i class="fas fa-pen-nib"></i> Sign & Send</button>
          <button onclick="quickStatus('${rx.id}','CANCELLED')" class="btn btn-danger text-xs"><i class="fas fa-ban"></i> Cancel</button>
        ` : ''}
        ${rx.status === 'SIGNED' ? `<button onclick="quickStatus('${rx.id}','SENT')" class="btn btn-primary text-xs"><i class="fas fa-paper-plane"></i> Send to Pharmacy</button>` : ''}
        ${rx.status === 'FILLED' ? `<button onclick="openRefillModal('${rx.id}')" class="btn btn-ghost text-xs"><i class="fas fa-rotate"></i> Request Refill</button>` : ''}
        ${rx.status === 'SENT' ? `<button onclick="quickStatus('${rx.id}','FILLED')" class="btn btn-ghost text-xs"><i class="fas fa-check"></i> Mark Filled</button>` : ''}
        <button onclick="openPdmpCheckModalPrefilled('${rx.patientId}','${rx.patientName}','${rx.providerName}')" class="btn btn-warning text-xs"><i class="fas fa-shield-halved"></i> PDMP Check</button>
      </div>
    </div>
  `
}

// ── Quick Status Actions ───────────────────────────────────────────────────────
async function quickStatus(id, status) {
  const res = await apiFetch(`/prescriptions/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) })
  if (res.success) { await loadSidebarRx(); selectRx(id); loadDashboard() }
  else alert('Error: ' + (res.error || 'Unknown'))
}

async function quickSign(id) {
  const res = await apiFetch(`/prescriptions/${id}/sign`, { method: 'POST', body: JSON.stringify({}) })
  if (res.success) { await loadSidebarRx(); selectRx(id); loadDashboard() }
  else alert('Error: ' + (res.error || 'Unknown'))
}

// ── Formulary ──────────────────────────────────────────────────────────────────
async function loadFormulary() {
  const q   = document.getElementById('formulary-search')?.value || ''
  const cat = document.getElementById('cat-filter')?.value || ''
  const url = `/formulary?q=${encodeURIComponent(q)}${cat ? `&category=${cat}` : ''}`
  const res = await apiFetch(url)
  if (!res.success) return
  renderFormulary(res.data)
}

async function loadFormularyCategories() {
  const res = await apiFetch('/formulary/categories/list')
  if (!res.success) return
  const sel = document.getElementById('cat-filter')
  if (!sel) return
  for (const c of res.data) {
    const opt = document.createElement('option'); opt.value = c; opt.textContent = c
    sel.appendChild(opt)
  }
}

function renderFormulary(drugs) {
  const tbody = document.getElementById('formulary-body')
  if (!drugs.length) { tbody.innerHTML = '<tr><td colspan="8" class="text-center text-xs text-slate-500 py-4">No drugs found</td></tr>'; return }
  tbody.innerHTML = drugs.map(d => `
    <tr>
      <td>
        <div class="font-semibold text-white">${d.name}</div>
        <div class="text-xs text-slate-500">NDC: ${d.ndc}</div>
      </td>
      <td class="text-slate-400">${d.genericName}</td>
      <td class="text-slate-400">${d.form.replace(/_/g,' ')}</td>
      <td class="text-emerald-400 font-medium">${d.strength}</td>
      <td><span class="chip ch-signed">${d.category}</span></td>
      <td>${d.schedule === 'NON_CONTROLLED' ? '<span class="text-xs text-slate-500">Non-Ctrl</span>' : `<span class="controlled-badge">${d.schedule}</span>`}</td>
      <td class="text-xs text-slate-400 font-mono">${d.commonDosing}</td>
      <td>
        <button onclick="prescribeDrug('${d.id}')" class="btn btn-primary text-xs py-0.5 px-2">
          <i class="fas fa-pen-nib"></i> Prescribe
        </button>
      </td>
    </tr>
  `).join('')
}

function prescribeDrug(drugId) {
  openNewRxModal()
  setTimeout(() => {
    document.getElementById('drug-search-input').value = ''
    state.selectedDrug = null
    gotoStep(2)
    fetch(`${API}/formulary/${drugId}`).then(r=>r.json()).then(res => {
      if (res.success) selectDrug(res.data)
    })
  }, 100)
}

// ── PDMP ───────────────────────────────────────────────────────────────────────
async function loadPdmpReports() {
  const res = await apiFetch('/pdmp')
  if (!res.success) return
  const container = document.getElementById('pdmp-reports-list')
  if (!res.data.length) { container.innerHTML = '<div class="card text-center py-8"><p class="text-slate-400 text-sm">No PDMP reports. Run a check to see results.</p></div>'; return }
  container.innerHTML = res.data.map(p => {
    const alertClass = p.status === 'ALERT' ? 'pdmp-alert' : p.status === 'HIGH_RISK' ? 'pdmp-high' : 'pdmp-clear'
    return `
      <div class="${alertClass} mb-3 fade-in">
        <div class="flex items-center justify-between mb-2">
          <div>
            <span class="text-sm font-bold">${p.patientName}</span>
            <span class="text-xs text-slate-400 ml-2">ID: ${p.patientId}</span>
          </div>
          <div class="flex items-center gap-3">
            ${pdmpBadge(p.status)}
            <span class="text-xs text-slate-400">Risk: <strong style="color:${p.riskScore>50?'#ef4444':p.riskScore>30?'#f59e0b':'#34d399'}">${p.riskScore}/100</strong></span>
          </div>
        </div>
        ${p.riskFactors.length ? `<div class="mb-2">${p.riskFactors.map(f=>`<span class="text-xs text-yellow-300"><i class="fas fa-circle-dot mr-1"></i>${f}</span>`).join('<br>')}</div>` : ''}
        ${p.prescriptions.length ? `
          <div class="mt-2">
            <p class="text-xs text-slate-400 mb-1">Controlled Substance History (${p.prescriptions.length} records)</p>
            <div style="overflow-x:auto">
              <table class="data-table" style="font-size:11px">
                <thead><tr><th>Drug</th><th>Schedule</th><th>Qty</th><th>Days</th><th>Prescriber</th><th>Pharmacy</th><th>Dispensed</th></tr></thead>
                <tbody>${p.prescriptions.map(px=>`
                  <tr>
                    <td>${px.drug}</td>
                    <td><span class="controlled-badge">${px.schedule}</span></td>
                    <td>${px.quantity}</td>
                    <td>${px.daysSupply}</td>
                    <td class="text-slate-400">${px.prescriber}</td>
                    <td class="text-slate-400">${px.pharmacy}</td>
                    <td class="text-slate-400">${px.dispensedDate}</td>
                  </tr>
                `).join('')}</tbody>
              </table>
            </div>
          </div>
        ` : ''}
        <p class="text-xs text-slate-300 mt-2">${p.reportNotes}</p>
        <div class="flex items-center justify-between mt-2">
          <span class="text-xs text-slate-500">Requested by ${p.requestedBy} on ${fmtDate(p.requestedAt)}</span>
          <span class="text-xs text-slate-500">Expires: ${fmtDate(p.expiresAt)}</span>
        </div>
      </div>
    `
  }).join('')
}

function openPdmpCheckModal() {
  document.getElementById('pdmp-modal').classList.remove('hidden')
}
function closePdmpModal() {
  document.getElementById('pdmp-modal').classList.add('hidden')
}
function openPdmpCheckModalPrefilled(patientId, patientName, requestedBy) {
  document.getElementById('pdmp-patient-id').value = patientId
  document.getElementById('pdmp-patient-name').value = patientName
  document.getElementById('pdmp-requested-by').value = requestedBy
  document.getElementById('pdmp-modal').classList.remove('hidden')
}

async function runPdmpCheck() {
  const patientId   = document.getElementById('pdmp-patient-id').value.trim()
  const patientName = document.getElementById('pdmp-patient-name').value.trim()
  const requestedBy = document.getElementById('pdmp-requested-by').value.trim()
  if (!patientId || !patientName || !requestedBy) { alert('All fields required'); return }
  const res = await apiFetch('/pdmp/check', { method: 'POST', body: JSON.stringify({ patientId, patientName, requestedBy }) })
  if (res.success) {
    closePdmpModal()
    showTab('pdmp', document.getElementById('tab-btn-pdmp'))
    loadPdmpReports()
  } else {
    alert('Error: ' + res.error)
  }
}

// ── Allergies ──────────────────────────────────────────────────────────────────
async function loadAllergies() {
  const pid = document.getElementById('allergy-patient-id').value.trim()
  if (!pid) return
  const res = await apiFetch(`/allergies/${pid}`)
  if (!res.success) return
  const container = document.getElementById('allergies-list')
  if (!res.data.length) { container.innerHTML = '<div class="card text-center py-8"><p class="text-slate-400 text-sm">No allergies on record for this patient.</p></div>'; return }
  container.innerHTML = res.data.map(a => `
    <div class="card mb-2 fade-in">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="allergy-chip"><i class="fas fa-triangle-exclamation"></i>${a.allergen}</span>
          <div>
            <span class="text-xs text-slate-400">${a.allergenType}</span>
            <span class="text-slate-600 mx-1">·</span>
            <span class="text-xs text-slate-400">${a.reaction}</span>
            <span class="text-slate-600 mx-1">·</span>
            <span class="text-xs font-semibold" style="color:${a.severity==='LIFE_THREATENING'?'#ef4444':a.severity==='SEVERE'?'#f97316':a.severity==='MODERATE'?'#f59e0b':'#94a3b8'}">${a.severity}</span>
          </div>
        </div>
        <span class="text-xs text-slate-500">${a.isActive ? '● Active' : '○ Inactive'}</span>
      </div>
      ${a.notes ? `<p class="text-xs text-slate-400 mt-1">${a.notes}</p>` : ''}
      <p class="text-xs text-slate-500 mt-1">Recorded by ${a.recordedBy} · ${fmtDate(a.recordedAt)}</p>
    </div>
  `).join('')
}

function openAllergyModal() {
  const pid = document.getElementById('allergy-patient-id')?.value || ''
  document.getElementById('alg-patient-id').value = pid
  document.getElementById('allergy-modal').classList.remove('hidden')
}
function closeAllergyModal() {
  document.getElementById('allergy-modal').classList.add('hidden')
}

async function saveAllergy() {
  const pid = document.getElementById('alg-patient-id').value.trim()
  const body = {
    allergen: document.getElementById('alg-allergen').value.trim(),
    allergenType: document.getElementById('alg-type').value,
    reaction: document.getElementById('alg-reaction').value,
    severity: document.getElementById('alg-severity').value,
    recordedBy: document.getElementById('alg-recorded-by').value.trim(),
    notes: document.getElementById('alg-notes').value.trim(),
    patientId: pid,
  }
  const missing = ['allergen','allergenType','reaction','severity','recordedBy'].filter(k => !body[k])
  if (!pid || missing.length) { alert(`Missing fields: ${['patientId',...missing].join(', ')}`); return }
  const res = await apiFetch(`/allergies/${pid}`, { method: 'POST', body: JSON.stringify(body) })
  if (res.success) { closeAllergyModal(); loadAllergies() }
  else alert('Error: ' + res.error)
}

// ── New Rx Wizard ─────────────────────────────────────────────────────────────
function openNewRxModal() {
  state.rxStep = 1; state.selectedDrug = null; state.newRxData = {}
  document.getElementById('new-rx-modal').classList.remove('hidden')
  renderStep(1)
  loadPharmacies()
}
function closeNewRxModal() {
  document.getElementById('new-rx-modal').classList.add('hidden')
}

function renderStep(step) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`rx-step-${i}`)
    if (el) el.classList.toggle('hidden', i !== step)
    const sn = document.getElementById(`sn-${i}`)
    if (sn) {
      sn.className = 'step-num ' + (i < step ? 'done' : i === step ? 'active-s' : 'pending-s')
    }
    const ws = document.getElementById(`ws-${i}`)
    if (ws) ws.classList.toggle('active', i === step)
  }
  document.getElementById('rx-step-label').textContent = step
  document.getElementById('rx-prev-btn').classList.toggle('hidden', step === 1)
  document.getElementById('rx-next-btn').classList.toggle('hidden', step === 4)
  document.getElementById('rx-sign-btn').classList.toggle('hidden', step !== 4)
  document.getElementById('rx-draft-btn').classList.toggle('hidden', step !== 4)
  if (step === 4) buildReviewCard()
}

function gotoStep(s) { if (s < state.rxStep || validateStep(state.rxStep)) { state.rxStep = s; renderStep(s) } }
function nextStep() { if (validateStep(state.rxStep)) { state.rxStep++; renderStep(state.rxStep) } }
function prevStep() { if (state.rxStep > 1) { state.rxStep--; renderStep(state.rxStep) } }

function validateStep(step) {
  if (step === 1) {
    const pid = document.getElementById('rx-patient-id').value.trim()
    const pn  = document.getElementById('rx-patient-name').value.trim()
    if (!pid || !pn) { alert('Patient ID and Name are required'); return false }
  }
  if (step === 2) {
    if (!state.selectedDrug) { alert('Please select a drug'); return false }
  }
  if (step === 3) {
    const qty  = document.getElementById('sig-qty').value
    const days = document.getElementById('sig-days').value
    const sig  = document.getElementById('sig-instructions').value.trim()
    if (!qty || !days || !sig) { alert('Quantity, Days Supply, and Dosage Instructions are required'); return false }
  }
  return true
}

// Drug search
async function searchDrugs() {
  const q = document.getElementById('drug-search-input').value.trim()
  if (q.length < 2) { document.getElementById('drug-search-results').innerHTML = ''; return }
  const res = await apiFetch(`/formulary?q=${encodeURIComponent(q)}`)
  if (!res.success) return
  const container = document.getElementById('drug-search-results')
  if (!res.data.length) { container.innerHTML = '<p class="text-xs text-slate-500 p-2">No drugs found</p>'; return }
  container.innerHTML = res.data.map(d => `
    <div class="drug-result ${state.selectedDrug?.id === d.id ? 'selected' : ''}" onclick="selectDrug(${JSON.stringify(d).replace(/"/g,'&quot;')})">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-sm font-semibold">${d.name}</span>
          <span class="text-xs text-slate-400 ml-2">${d.genericName}</span>
          ${d.schedule !== 'NON_CONTROLLED' ? `<span class="controlled-badge ml-2">${d.schedule}</span>` : ''}
        </div>
        <span class="text-xs text-slate-400">${d.strength} · ${d.form.replace(/_/g,' ')}</span>
      </div>
      <p class="text-xs text-slate-500 mt-0.5">${d.category} · ${d.commonDosing}</p>
    </div>
  `).join('')
}

async function selectDrug(drug) {
  state.selectedDrug = drug
  document.getElementById('drug-search-results').innerHTML = ''
  document.getElementById('drug-search-input').value = drug.name

  // Show selected drug card
  const card = document.getElementById('selected-drug-card')
  card.classList.remove('hidden')
  document.getElementById('sel-drug-name').textContent    = drug.name
  document.getElementById('sel-drug-generic').textContent  = drug.genericName
  document.getElementById('sel-drug-form').textContent     = drug.form.replace(/_/g,' ')
  document.getElementById('sel-drug-sched').textContent    = drug.schedule
  document.getElementById('sel-drug-dosing').textContent   = drug.commonDosing

  // Pre-fill step 3 SIG with common dosing
  document.getElementById('sig-qty').value          = drug.unit === 'mL' ? '2.5' : '30'
  document.getElementById('sig-unit').value         = drug.unit
  document.getElementById('sig-days').value         = '30'
  document.getElementById('sig-refills').value      = drug.maxRefills
  document.getElementById('sig-instructions').value = drug.commonDosing
  updateSigPreview()

  // Check interactions with existing patient Rx
  const pid = document.getElementById('rx-patient-id').value.trim()
  if (pid) {
    const rxRes = await apiFetch(`/prescriptions?patientId=${pid}&status=FILLED`)
    if (rxRes.success) {
      const currentIds = rxRes.data.map(r => r.drugId)
      const intRes = await apiFetch('/interactions/check', { method: 'POST', body: JSON.stringify({ drugId: drug.id, currentDrugIds: currentIds }) })
      if (intRes.success && intRes.data.interactions.length) {
        document.getElementById('interaction-alerts').classList.remove('hidden')
        document.getElementById('interaction-alert-list').innerHTML = intRes.data.interactions.map(i => `
          <div class="interaction-alert ${i.severity.toLowerCase()}">
            <span class="text-xs font-bold" style="color:${severityColor(i.severity)}">${i.severity}</span>
            <p class="text-xs mt-0.5">${i.drug1Name} + ${i.drug2Name}</p>
            <p class="text-xs text-slate-300">${i.clinicalEffect}</p>
          </div>
        `).join('')
      } else {
        document.getElementById('interaction-alerts').classList.add('hidden')
      }
    }
  }
}

function severityColor(sev) {
  return { MINOR:'#94a3b8', MODERATE:'#fbbf24', MAJOR:'#f97316', CONTRAINDICATED:'#ef4444' }[sev] || '#94a3b8'
}

function buildSig() { updateSigPreview() }

function updateSigPreview() {
  const instr = document.getElementById('sig-instructions')?.value || ''
  const qty   = document.getElementById('sig-qty')?.value || ''
  const unit  = document.getElementById('sig-unit')?.value || ''
  const days  = document.getElementById('sig-days')?.value || ''
  const ref   = document.getElementById('sig-refills')?.value || '0'
  const freq  = document.getElementById('sig-freq')?.value || ''
  const route = document.getElementById('sig-route')?.value || ''
  const prn   = document.getElementById('sig-prn')?.checked ? ' PRN' : ''
  const preview = document.getElementById('sig-preview')
  if (preview) preview.textContent = `${instr} | Qty: ${qty} ${unit} | ${days} days | ${ref} refills | ${route} ${freq}${prn}`
}

async function loadPharmacies() {
  if (state.pharmacies.length) return
  const res = await apiFetch('/pharmacies')
  if (!res.success) return
  state.pharmacies = res.data
  const sel = document.getElementById('rx-pharmacy')
  if (!sel) return
  for (const p of res.data) {
    const opt = document.createElement('option')
    opt.value = p.id
    opt.textContent = `${p.name} ${p.acceptsControlled ? '(accepts controlled)' : ''}`
    sel.appendChild(opt)
  }
}

function buildReviewCard() {
  const card = document.getElementById('rx-review-card')
  const provRaw = document.getElementById('rx-provider').value
  const [pid, pname] = provRaw.split('|')
  const pharmId   = document.getElementById('rx-pharmacy').value
  const pharm     = state.pharmacies.find(p => p.id === pharmId)
  const drug      = state.selectedDrug
  const controlled = drug?.schedule !== 'NON_CONTROLLED'

  card.innerHTML = `
    <h4 class="text-sm font-bold mb-3">Review Prescription</h4>
    <div class="grid grid-cols-2 gap-4 text-xs mb-3">
      <div>
        <p class="text-slate-400">Patient</p>
        <p class="font-semibold">${document.getElementById('rx-patient-name').value}</p>
        <p class="text-slate-400">ID: ${document.getElementById('rx-patient-id').value}</p>
      </div>
      <div>
        <p class="text-slate-400">Provider</p>
        <p class="font-semibold">${pname}</p>
      </div>
      <div>
        <p class="text-slate-400">Drug</p>
        <p class="font-semibold">${drug?.name || '—'}</p>
        <p class="text-slate-400">${drug?.genericName} · ${drug?.strength}</p>
        ${controlled ? `<span class="controlled-badge mt-1"><i class="fas fa-exclamation-triangle"></i>${drug?.schedule}</span>` : ''}
      </div>
      <div>
        <p class="text-slate-400">Pharmacy</p>
        <p class="font-semibold">${pharm?.name || '—'}</p>
      </div>
    </div>
    <div class="sig-preview mb-3">${document.getElementById('sig-instructions').value || '—'}</div>
    <div class="flex gap-4 text-xs text-slate-400">
      <span>Qty: <strong class="text-white">${document.getElementById('sig-qty').value} ${document.getElementById('sig-unit').value}</strong></span>
      <span>Days: <strong class="text-white">${document.getElementById('sig-days').value}</strong></span>
      <span>Refills: <strong class="text-white">${document.getElementById('sig-refills').value}</strong></span>
      <span>DAW: <strong class="text-white">${document.getElementById('sig-daw').checked ? 'Yes' : 'No'}</strong></span>
    </div>
    ${document.getElementById('rx-note').value ? `<p class="text-xs text-slate-400 mt-2">Note: ${document.getElementById('rx-note').value}</p>` : ''}
  `
}

async function saveDraft() {
  const rx = await buildRxPayload()
  const res = await apiFetch('/prescriptions', { method: 'POST', body: JSON.stringify(rx) })
  if (res.success) {
    closeNewRxModal()
    await loadSidebarRx()
    loadDashboard()
    if (state.currentTab === 'queue') selectRx(res.data.id)
  } else alert('Error: ' + res.error)
}

async function signRx() {
  const rx = await buildRxPayload()
  const createRes = await apiFetch('/prescriptions', { method: 'POST', body: JSON.stringify(rx) })
  if (!createRes.success) { alert('Error creating Rx: ' + createRes.error); return }
  const pharmId = document.getElementById('rx-pharmacy').value
  const signRes = await apiFetch(`/prescriptions/${createRes.data.id}/sign`, { method: 'POST', body: JSON.stringify({ pharmacyId: pharmId || undefined }) })
  if (signRes.success) {
    closeNewRxModal()
    await loadSidebarRx()
    loadDashboard()
    if (state.currentTab === 'queue') selectRx(signRes.data.id)
  } else alert('Error: ' + signRes.error)
}

function buildRxPayload() {
  const provRaw = document.getElementById('rx-provider').value.split('|')
  const pharmId = document.getElementById('rx-pharmacy').value
  return {
    patientId: document.getElementById('rx-patient-id').value.trim(),
    patientName: document.getElementById('rx-patient-name').value.trim(),
    patientDob: document.getElementById('rx-patient-dob').value,
    providerId: provRaw[0],
    providerName: provRaw[1],
    providerNpi: provRaw[2],
    drugId: state.selectedDrug?.id,
    pharmacyId: pharmId || undefined,
    daw: document.getElementById('sig-daw').checked,
    clinicalNote: document.getElementById('rx-note').value.trim(),
    diagnosisCodes: document.getElementById('rx-diag').value.split(',').map(s=>s.trim()).filter(Boolean),
    sig: {
      quantity: parseFloat(document.getElementById('sig-qty').value) || 1,
      unit: document.getElementById('sig-unit').value,
      daysSupply: parseInt(document.getElementById('sig-days').value) || 30,
      refills: parseInt(document.getElementById('sig-refills').value) || 0,
      dosageInstructions: document.getElementById('sig-instructions').value.trim(),
      frequencyCode: document.getElementById('sig-freq').value,
      route: document.getElementById('sig-route').value,
      prn: document.getElementById('sig-prn').checked,
    },
  }
}

// ── Rx Action Modal ────────────────────────────────────────────────────────────
async function openRxActionModal(id) {
  const res = await apiFetch(`/prescriptions/${id}`)
  if (!res.success) return
  const rx = res.data
  document.getElementById('rx-action-title').innerHTML = `<i class="fas fa-prescription-bottle text-emerald-400 mr-2"></i>${rx.drugName} — ${rx.patientName}`
  document.getElementById('rx-action-body').innerHTML = `
    <div class="mb-3">
      ${statusChip(rx.status)}
      ${scheduleChip(rx.schedule)}
    </div>
    <div class="grid grid-cols-2 gap-3 text-xs mb-3">
      <div><span class="text-slate-400">Drug: </span><strong>${rx.drugName} (${rx.genericName})</strong></div>
      <div><span class="text-slate-400">Strength: </span><strong>${rx.strength}</strong></div>
      <div><span class="text-slate-400">SIG: </span><strong>${rx.sig?.dosageInstructions || '—'}</strong></div>
      <div><span class="text-slate-400">Qty/Days: </span><strong>${rx.sig?.quantity} ${rx.sig?.unit} / ${rx.sig?.daysSupply} days</strong></div>
      <div><span class="text-slate-400">Refills: </span><strong>${rx.sig?.refills}</strong></div>
      <div><span class="text-slate-400">Pharmacy: </span><strong>${rx.pharmacyName || '—'}</strong></div>
      <div><span class="text-slate-400">Written: </span><strong>${rx.writtenDate}</strong></div>
      <div><span class="text-slate-400">Expires: </span><strong>${fmtDate(rx.expiresAt)}</strong></div>
    </div>
    ${rx.clinicalNote ? `<p class="text-xs text-slate-400 mb-3">${rx.clinicalNote}</p>` : ''}
    <div class="flex flex-wrap gap-2 pt-3 border-t border-slate-700/40">
      ${rx.status === 'DRAFT' || rx.status === 'PENDING_REVIEW' ? `<button onclick="quickSign('${rx.id}');closeRxActionModal()" class="btn btn-primary text-xs"><i class="fas fa-pen-nib"></i> Sign & Send</button>` : ''}
      ${rx.status === 'DRAFT' || rx.status === 'PENDING_REVIEW' ? `<button onclick="quickStatus('${rx.id}','CANCELLED');closeRxActionModal()" class="btn btn-danger text-xs"><i class="fas fa-ban"></i> Cancel</button>` : ''}
      <button onclick="closeRxActionModal()" class="btn btn-ghost text-xs">Close</button>
    </div>
  `
  document.getElementById('rx-action-modal').classList.remove('hidden')
}
function closeRxActionModal() {
  document.getElementById('rx-action-modal').classList.add('hidden')
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await loadFormularyCategories()
  await loadDashboard()
  await loadSidebarRx()
})
