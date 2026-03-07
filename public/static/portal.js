// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 4A: Patient Portal Controller
// ─────────────────────────────────────────────────────────────────────────────

/* ── State ─────────────────────────────────────────────────────────────────── */
const portal = {
  session: null,          // PortalSession
  dashboard: null,        // PortalDashboard
  currentTab: 'home',
  selectedThread: null,
  selectedUrgency: 'routine',
  threads: [],
  apptRequests: [],
  rxList: [],
  opticalOrders: [],
  billingItems: [],
}

/* ── Utilities ─────────────────────────────────────────────────────────────── */
const $ = id => document.getElementById(id)

function fmt$(n) { return n == null ? '—' : `$${Number(n).toFixed(2)}` }
function fmtDate(d) {
  if (!d) return '—'
  // Handle YYYY-MM-DD without timezone offset
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number)
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtDateTime(d) {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt) ? d : dt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}
function fmtAge(dob) {
  if (!dob) return ''
  const [y, m, day] = dob.split('-').map(Number)
  const age = Math.floor((Date.now() - new Date(y, m - 1, day).getTime()) / (365.25 * 86400000))
  return `Age ${age}`
}
function initials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

function showToast(msg, ok = true) {
  const toast = $('toast')
  $('toast-msg').textContent = msg
  $('toast-icon').className = `fas ${ok ? 'fa-check-circle text-emerald-400' : 'fa-circle-exclamation text-red-400'} text-lg`
  toast.classList.remove('hidden')
  setTimeout(() => toast.classList.add('hidden'), 4000)
}

async function api(method, path, body, sessionId) {
  const sid = sessionId ?? portal.session?.sessionId ?? ''
  const opts = { method, headers: { 'Content-Type': 'application/json', 'X-Portal-Session': sid } }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`/api/portal${path}`, opts)
  return res.json()
}

function closeModal(id) { $(id).classList.add('hidden') }

/* ── Status helpers ─────────────────────────────────────────────────────────── */
const REQ_STATUS = { PENDING: 'badge-yellow', CONFIRMED: 'badge-green', DECLINED: 'badge-red', CANCELLED: 'badge-slate' }
const ORD_STATUS = {
  DRAFT:'badge-slate', APPROVED:'badge-blue', SENT_TO_LAB:'badge-blue',
  IN_PRODUCTION:'badge-purple', QUALITY_CHECK:'badge-purple', RECEIVED:'badge-blue',
  READY_FOR_PICKUP:'badge-green', DISPENSED:'badge-green', CANCELLED:'badge-red',
}
const MSG_CAT_ICONS = {
  GENERAL:'fa-comment', PRESCRIPTION_REQUEST:'fa-prescription', APPOINTMENT_QUESTION:'fa-calendar',
  BILLING_QUESTION:'fa-dollar-sign', OPTICAL_ORDER_STATUS:'fa-glasses',
  TEST_RESULTS:'fa-flask', MEDICATION_REFILL:'fa-pills', OTHER:'fa-ellipsis',
}

function badge(text, cls) {
  return `<span class="badge ${cls}">${text.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase())}</span>`
}

/* ── Auth ───────────────────────────────────────────────────────────────────── */
async function doLogin() {
  const lastName = $('login-lastname').value.trim()
  const dob      = $('login-dob').value
  const mrn      = $('login-mrn').value.trim()

  if (!lastName || !dob) {
    showLoginError('Please enter your last name and date of birth.')
    return
  }

  try {
    const payload = { lastName, dob }
    if (mrn.includes('@')) payload.email = mrn
    else if (mrn) payload.mrn = mrn

    const res = await fetch('/api/portal/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (data.success) {
      portal.session = data.data
      localStorage.setItem('portal_session', data.data.sessionId)
      enterPortal()
    } else {
      showLoginError(data.error ?? 'Login failed. Please check your information.')
    }
  } catch (e) {
    showLoginError('Connection error. Please try again.')
  }
}

async function doDemo() {
  try {
    const res = await fetch('/api/portal/auth/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
    const data = await res.json()
    if (data.success) {
      portal.session = data.data
      localStorage.setItem('portal_session', data.data.sessionId)
      enterPortal()
    } else {
      showLoginError(data.error ?? 'Demo login failed')
    }
  } catch (e) {
    showLoginError('Connection error.')
  }
}

async function doLogout() {
  if (portal.session) {
    await fetch('/api/portal/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: portal.session.sessionId }),
    }).catch(() => {})
    portal.session = null
  }
  localStorage.removeItem('portal_session')
  $('portal-app').classList.add('hidden')
  $('portal-app').classList.remove('flex')
  $('login-screen').classList.remove('hidden')
}

function showLoginError(msg) {
  const el = $('login-error')
  el.textContent = msg
  el.classList.remove('hidden')
  setTimeout(() => el.classList.add('hidden'), 5000)
}

async function tryAutoLogin() {
  const saved = localStorage.getItem('portal_session')
  if (!saved) return false
  try {
    const res = await fetch(`/api/portal/auth/session?session=${saved}`, {
      headers: { 'X-Portal-Session': saved },
    })
    const data = await res.json()
    if (data.success) {
      portal.session = data.data
      return true
    }
  } catch (e) {}
  localStorage.removeItem('portal_session')
  return false
}

/* ── Enter / Exit Portal ────────────────────────────────────────────────────── */
function enterPortal() {
  $('login-screen').classList.add('hidden')
  $('portal-app').classList.remove('hidden')
  $('portal-app').classList.add('flex')

  // Set topbar
  const s = portal.session
  $('topbar-name').textContent = s.patientName
  $('topbar-dob').textContent  = fmtDate(s.patientDob)
  $('topbar-avatar').textContent = initials(s.patientName)

  // Load dashboard data
  loadPortalDashboard()
}

/* ── Tab Navigation ─────────────────────────────────────────────────────────── */
function showPortalTab(tab, btnEl) {
  document.querySelectorAll('.portal-tab').forEach(p => p.classList.add('hidden'))
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'))
  const panel = $(`portal-tab-${tab}`)
  if (panel) panel.classList.remove('hidden')

  // Activate both desktop and mobile buttons
  document.querySelectorAll('.nav-tab').forEach(b => {
    if (b.getAttribute('onclick')?.includes(`'${tab}'`)) b.classList.add('active')
  })
  if (btnEl) btnEl.classList.add('active')
  portal.currentTab = tab

  // Lazy-load tab data
  if (tab === 'appointments' && !portal.apptRequests.length) loadApptRequests()
  if (tab === 'records')      loadRecords()
  if (tab === 'optical')      loadOpticalOrders()
  if (tab === 'billing')      loadBilling()
  if (tab === 'messages')     loadMessages()
}

/* ── Dashboard / Overview ───────────────────────────────────────────────────── */
async function loadPortalDashboard() {
  try {
    const res = await api('GET', '/dashboard')
    if (!res.success) { showToast(res.error ?? 'Could not load dashboard', false); return }
    portal.dashboard = res.data
    renderOverview(res.data)
  } catch (e) {
    showToast('Dashboard load error', false)
  }
}

function renderOverview(d) {
  $('overview-name').textContent   = d.patient?.name?.split(' ')[0] ?? '—'
  $('overview-subtitle').textContent = `${d.patient?.insuranceName ? d.patient.insuranceName + ' · ' : ''}${fmtAge(d.patient?.dob)}`

  // KPIs
  const nextAppt = d.upcomingAppointments?.[0]
  $('kpi-next-appt').textContent = nextAppt
    ? `${fmtDate(nextAppt.date)} ${nextAppt.time}`
    : 'None scheduled'

  $('kpi-rx').textContent = d.activeRx
    ? `${d.activeRx.lensType} · Exp ${fmtDate(d.activeRx.expiresDate)}`
    : 'None on file'

  const bal = d.balanceSummary?.totalBalance ?? 0
  const balEl = $('kpi-balance')
  balEl.textContent = fmt$(bal)
  balEl.className = `font-bold text-sm ${bal > 0 ? 'text-amber-400' : 'text-emerald-400'}`

  const unread = d.unreadMessages ?? 0
  $('kpi-msgs').textContent = unread > 0 ? `${unread} unread` : 'No new messages'
  $('kpi-msgs').className = `font-bold text-sm ${unread > 0 ? 'text-blue-400' : 'text-slate-400'}`

  // Unread badge in nav
  if (unread > 0) {
    $('msg-badge').textContent = unread
    $('msg-badge').classList.remove('hidden')
  }

  // Upcoming appointments
  const apptEl = $('upcoming-appts-list')
  if (!d.upcomingAppointments?.length) {
    apptEl.innerHTML = '<p class="text-slate-500 text-sm">No upcoming appointments.</p><button onclick="showPortalTab(\'appointments\')" class="btn-ghost mt-2 text-blue-400 hover:text-blue-300"><i class="fas fa-plus mr-1"></i>Request one</button>'
  } else {
    apptEl.innerHTML = d.upcomingAppointments.map(a => `
      <div class="flex items-center gap-3 p-3 bg-slate-900/60 rounded-lg">
        <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex flex-col items-center justify-center shrink-0">
          <span class="text-xs font-bold text-blue-400">${fmtDate(a.date).split(' ')[0].toUpperCase()}</span>
          <span class="text-base font-bold text-white leading-tight">${fmtDate(a.date).split(' ')[1]?.replace(',','')}</span>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-white">${a.type}</p>
          <p class="text-xs text-slate-500">${a.time} · ${a.provider}</p>
        </div>
        ${badge(a.status, a.status === 'CONFIRMED' ? 'badge-green' : 'badge-blue')}
      </div>`).join('')
  }

  // Active Rx
  const rxEl = $('active-rx-content')
  if (d.activeRx) {
    const rx = d.activeRx
    rxEl.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <p class="text-xs text-slate-500 mb-2 uppercase tracking-wider">Prescription Details</p>
          <div class="text-xs space-y-1">
            <div class="flex justify-between"><span class="text-slate-500">Provider</span><span class="text-white">${rx.providerName}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Date</span><span class="text-white">${fmtDate(rx.rxDate)}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Expires</span><span class="${new Date(rx.expiresDate) > new Date() ? 'text-emerald-400' : 'text-red-400'}">${fmtDate(rx.expiresDate)}</span></div>
            <div class="flex justify-between"><span class="text-slate-500">Type</span><span class="text-white">${rx.lensType}</span></div>
          </div>
        </div>
        <div>
          <p class="text-xs text-slate-500 mb-2 uppercase tracking-wider">Rx Values</p>
          <table class="w-full text-xs">
            <thead><tr><th class="text-left text-slate-500 pb-1">Eye</th><th class="text-right text-slate-500 pb-1">SPH</th><th class="text-right text-slate-500 pb-1">CYL</th><th class="text-right text-slate-500 pb-1">AXIS</th><th class="text-right text-slate-500 pb-1">ADD</th></tr></thead>
            <tbody>
              ${['od','os'].map(e => `<tr class="border-t border-slate-700/40">
                <td class="py-1.5 font-bold ${e==='od'?'text-blue-400':'text-purple-400'}">${e.toUpperCase()}</td>
                <td class="text-right font-mono text-white">${rxFmt(rx[e]?.sphere)}</td>
                <td class="text-right font-mono text-white">${rxFmt(rx[e]?.cylinder)}</td>
                <td class="text-right font-mono text-white">${rx[e]?.axis ?? '—'}</td>
                <td class="text-right font-mono text-white">${rx[e]?.add != null ? '+' + Number(rx[e].add).toFixed(2) : '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
          <p class="text-xs text-slate-500 mt-2">Binocular PD: <span class="text-white font-mono">${rx.binocularPd ?? '—'}</span></p>
        </div>
      </div>`
  } else {
    rxEl.innerHTML = '<p class="text-slate-500 text-sm">No prescription on file.</p>'
  }

  // Most recent exam
  const examEl = $('recent-exam-content')
  const exam = d.recentExams?.[0]
  if (exam) {
    examEl.innerHTML = `
      <div class="flex items-start justify-between gap-3 mb-3">
        <div>
          <p class="text-white font-medium">${exam.examType || 'Eye Exam'}</p>
          <p class="text-xs text-slate-500">${fmtDate(exam.examDate)} · ${exam.providerName}</p>
        </div>
        ${badge(exam.signed ? 'SIGNED' : 'DRAFT', exam.signed ? 'badge-green' : 'badge-yellow')}
      </div>
      ${exam.diagnoses?.length ? `
        <div class="mb-2">
          <p class="text-xs text-slate-500 uppercase tracking-wider mb-1">Diagnoses</p>
          ${exam.diagnoses.map(d => `<p class="text-xs text-slate-300"><span class="font-mono text-blue-400">${d.code}</span> — ${d.description}</p>`).join('')}
        </div>` : ''}
      ${exam.visionOD || exam.visionOS ? `<p class="text-xs text-slate-400">Vision: OD <span class="text-white">${exam.visionOD ?? '—'}</span> · OS <span class="text-white">${exam.visionOS ?? '—'}</span></p>` : ''}
      ${exam.recommendations ? `<p class="text-xs text-slate-400 mt-2">Plan: <span class="text-slate-300">${exam.recommendations}</span></p>` : ''}`
  } else {
    examEl.innerHTML = '<p class="text-slate-500 text-sm">No recent visits on file.</p>'
  }
}

function rxFmt(v) {
  if (v == null) return '—'
  return (v >= 0 ? '+' : '') + Number(v).toFixed(2)
}

/* ── Appointments Tab ───────────────────────────────────────────────────────── */
async function loadApptRequests() {
  const res = await api('GET', '/appointments')
  portal.apptRequests = res.data ?? []
  renderApptRequests()
}

function renderApptRequests() {
  const el = $('appt-requests-list')
  if (!portal.apptRequests.length) {
    el.innerHTML = `<div class="card text-center py-10">
      <i class="fas fa-calendar-plus text-4xl text-slate-600 mb-3"></i>
      <p class="text-slate-400 mb-4">No appointment requests yet.</p>
      <button onclick="openNewApptModal()" class="btn-primary mx-auto"><i class="fas fa-plus"></i>Request an Appointment</button>
    </div>`
    return
  }
  const urgIcons = { routine: 'fa-clock text-slate-400', soon: 'fa-circle-exclamation text-amber-400', urgent: 'fa-triangle-exclamation text-red-400' }
  el.innerHTML = portal.apptRequests.map(r => `
    <div class="card hover:border-slate-600 transition-colors">
      <div class="flex items-start justify-between gap-3 mb-3">
        <div>
          <p class="font-medium text-white">${(r.requestType ?? '').replace(/_/g,' ')}</p>
          <p class="text-xs text-slate-500">Submitted ${fmtDate(r.createdAt)}</p>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <i class="fas ${urgIcons[r.urgency] ?? 'fa-clock text-slate-400'}" title="${r.urgency}"></i>
          ${badge(r.status, REQ_STATUS[r.status] ?? 'badge-slate')}
        </div>
      </div>
      <p class="text-sm text-slate-300 mb-3">${r.reason}</p>
      ${r.preferredDates?.length ? `<p class="text-xs text-slate-500">Preferred: ${r.preferredDates.map(d => fmtDate(d)).join(', ')}</p>` : ''}
      ${r.status === 'CONFIRMED' ? `
        <div class="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm">
          <p class="text-emerald-400 font-medium"><i class="fas fa-check-circle mr-1"></i>Confirmed: ${fmtDate(r.confirmedDate)} at ${r.confirmedTime}</p>
          <p class="text-slate-400 text-xs mt-1">Provider: ${r.confirmedProvider ?? '—'}</p>
        </div>` : ''}
      ${r.status === 'DECLINED' ? `
        <div class="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm">
          <p class="text-red-400"><i class="fas fa-xmark-circle mr-1"></i>Request declined. ${r.staffNotes ? `Notes: ${r.staffNotes}` : 'Please call us to reschedule.'}</p>
        </div>` : ''}
    </div>`).join('')
}

function openNewApptModal() {
  // Set min date to tomorrow
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1)
  const minDate  = tomorrow.toISOString().slice(0,10)
  ;['appt-date1','appt-date2','appt-date3'].forEach(id => { $(id).min = minDate; $(id).value = '' })
  $('appt-reason').value = ''
  $('appt-notes').value  = ''
  $('modal-new-appt').classList.remove('hidden')
}

function setUrgency(val) {
  portal.selectedUrgency = val
  const colors = { routine: 'border-slate-600', soon: 'border-amber-500', urgent: 'border-red-500' }
  ;['routine','soon','urgent'].forEach(u => {
    const lbl = $(`urg-${u}-lbl`)
    lbl.className = lbl.className.replace(/border-\S+/, '').trim() + ' ' + (u === val ? colors[val] + ' bg-slate-800' : 'border-slate-700')
  })
}

async function submitApptRequest() {
  const requestType = $('appt-type').value
  const reason      = $('appt-reason').value.trim()
  if (!reason) { showToast('Please describe the reason for your visit', false); return }

  const preferredDates = ['appt-date1','appt-date2','appt-date3']
    .map(id => $(id).value).filter(Boolean)
  const preferredTimes = [...document.querySelectorAll('.appt-time-cb:checked')].map(cb => cb.value)
  if (!preferredTimes.length) preferredTimes.push('any')

  const res = await api('POST', '/appointments', {
    requestType, reason,
    preferredDates, preferredTimes,
    preferredProvider: $('appt-provider').value,
    urgency: portal.selectedUrgency,
    patientNotes: $('appt-notes').value.trim() || undefined,
  })

  if (res.success) {
    showToast('Appointment request submitted! We\'ll contact you shortly.')
    closeModal('modal-new-appt')
    portal.apptRequests.unshift(res.data)
    renderApptRequests()
  } else {
    showToast(res.error ?? 'Submission failed', false)
  }
}

/* ── Records Tab ────────────────────────────────────────────────────────────── */
async function loadRecords() {
  const [rxRes] = await Promise.all([api('GET', '/rx')])
  portal.rxList = rxRes.data ?? []
  renderRecordsRx()
  renderRecordsExams()
}

function renderRecordsRx() {
  const el = $('records-rx-list')
  if (!portal.rxList.length) {
    el.innerHTML = '<div class="card text-slate-500 text-sm py-4 text-center">No prescriptions on file.</div>'
    return
  }
  el.innerHTML = portal.rxList.map(rx => `
    <div class="card">
      <div class="flex items-start justify-between mb-3 gap-3">
        <div>
          <p class="font-medium text-white">${rx.lensType?.replace(/_/g,' ') || 'Prescription'}</p>
          <p class="text-xs text-slate-500">${rx.providerName} · ${fmtDate(rx.rxDate)}</p>
        </div>
        <div class="text-right shrink-0">
          ${badge(rx.signed ? 'SIGNED' : 'Unsigned', rx.signed ? 'badge-green' : 'badge-yellow')}
          <p class="text-xs text-slate-500 mt-1">Exp: <span class="${new Date(rx.expiresDate) > new Date() ? 'text-emerald-400' : 'text-red-400'}">${fmtDate(rx.expiresDate)}</span></p>
        </div>
      </div>
      <table class="w-full text-xs">
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
          ${['od','os'].map(e => `<tr class="border-t border-slate-700/40">
            <td class="py-1.5 font-bold ${e==='od'?'text-blue-400':'text-purple-400'}">${e.toUpperCase()}</td>
            <td class="text-right font-mono text-white">${rxFmt(rx[e]?.sphere)}</td>
            <td class="text-right font-mono text-white">${rxFmt(rx[e]?.cylinder)}</td>
            <td class="text-right font-mono text-white">${rx[e]?.axis ?? '—'}</td>
            <td class="text-right font-mono text-white">${rx[e]?.add != null ? '+' + Number(rx[e].add).toFixed(2) : '—'}</td>
            <td class="text-right font-mono text-white">${rx[e]?.pd ?? '—'}</td>
            <td class="text-right text-white">${rx[e]?.va ?? '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      ${rx.binocularPd ? `<p class="text-xs text-slate-500 mt-2">Binocular PD: <span class="font-mono text-white">${rx.binocularPd}</span></p>` : ''}
    </div>`).join('')
}

function renderRecordsExams() {
  const el = $('records-exams-list')
  const exams = portal.dashboard?.recentExams ?? []
  if (!exams.length) { el.innerHTML = '<div class="card text-slate-500 text-sm py-4 text-center">No visit records found.</div>'; return }
  el.innerHTML = exams.map(e => `
    <div class="card">
      <div class="flex items-start justify-between mb-2 gap-3">
        <div>
          <p class="font-medium text-white">${e.examType || 'Eye Exam'}</p>
          <p class="text-xs text-slate-500">${fmtDate(e.examDate)} · ${e.providerName}</p>
        </div>
        ${badge(e.signed ? 'Signed' : 'Draft', e.signed ? 'badge-green' : 'badge-yellow')}
      </div>
      ${e.diagnoses?.length ? `<div class="mb-2">${e.diagnoses.map(d => `<p class="text-xs text-slate-400"><span class="font-mono text-blue-400">${d.code}</span> — ${d.description}</p>`).join('')}</div>` : ''}
      ${e.visionOD || e.visionOS ? `<p class="text-xs text-slate-500">Vision: OD <span class="text-white">${e.visionOD ?? '—'}</span> · OS <span class="text-white">${e.visionOS ?? '—'}</span>${e.iopOD || e.iopOS ? ` · IOP OD <span class="text-white">${e.iopOD ?? '—'}</span>/<span class="text-white">${e.iopOS ?? '—'}</span>` : ''}</p>` : ''}
      ${e.recommendations ? `<p class="text-xs text-slate-500 mt-2">Plan: <span class="text-slate-300">${e.recommendations}</span></p>` : ''}
      ${e.followUpIn ? `<p class="text-xs text-slate-500 mt-1">Follow-up in: <span class="text-white">${e.followUpIn}</span></p>` : ''}
    </div>`).join('')
}

/* ── Optical Tab ────────────────────────────────────────────────────────────── */
async function loadOpticalOrders() {
  const res = await api('GET', '/optical-orders')
  portal.opticalOrders = res.data ?? []
  renderOpticalOrders()
}

const ORD_STATUS_LABELS = {
  DRAFT:'Draft', APPROVED:'Approved', SENT_TO_LAB:'Sent to Lab', IN_PRODUCTION:'In Production',
  QUALITY_CHECK:'Quality Check', RECEIVED:'Received', READY_FOR_PICKUP:'Ready for Pickup!',
  DISPENSED:'Dispensed', CANCELLED:'Cancelled',
}
const ORD_STEPS = ['APPROVED','SENT_TO_LAB','IN_PRODUCTION','QUALITY_CHECK','RECEIVED','READY_FOR_PICKUP','DISPENSED']

function renderOpticalOrders() {
  const el = $('optical-orders-list')
  if (!portal.opticalOrders.length) {
    el.innerHTML = '<div class="card text-center text-slate-500 py-10"><i class="fas fa-glasses text-4xl mb-3 opacity-30"></i><p>No optical orders on file.</p></div>'
    return
  }
  el.innerHTML = portal.opticalOrders.map(o => {
    const stepIdx  = ORD_STEPS.indexOf(o.status)
    const pct = o.status === 'DISPENSED' ? 100 : o.status === 'READY_FOR_PICKUP' ? 90 : Math.max(5, (stepIdx / (ORD_STEPS.length - 1)) * 85)
    const isReady  = o.status === 'READY_FOR_PICKUP'
    return `
    <div class="card ${isReady ? 'border-emerald-500/30 bg-emerald-500/5' : ''}">
      <div class="flex items-start justify-between gap-3 mb-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <p class="font-semibold text-white">${o.orderNumber}</p>
            ${badge(ORD_STATUS_LABELS[o.status] ?? o.status, ORD_STATUS[o.status] ?? 'badge-slate')}
          </div>
          <p class="text-sm text-slate-400">${o.lineItemsSummary || o.orderType}</p>
        </div>
        ${isReady ? `<div class="text-emerald-400 text-2xl animate-bounce shrink-0"><i class="fas fa-bell"></i></div>` : ''}
      </div>

      ${isReady ? `<div class="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm text-emerald-400"><i class="fas fa-store mr-1.5"></i>Your glasses are ready for pickup at our office!</div>` : ''}

      <!-- Progress bar -->
      <div class="mb-4">
        <div class="flex justify-between text-xs text-slate-500 mb-1.5">
          <span>Order Progress</span><span>${Math.round(pct)}%</span>
        </div>
        <div class="w-full bg-slate-700/60 rounded-full h-2">
          <div class="h-2 rounded-full transition-all duration-500 ${o.status === 'DISPENSED' ? 'bg-emerald-500' : isReady ? 'bg-emerald-400' : 'bg-blue-500'}" style="width:${pct}%"></div>
        </div>
        <div class="flex justify-between text-xs text-slate-600 mt-1">
          <span>Order Placed</span><span>Pickup Ready</span>
        </div>
      </div>

      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div><p class="text-slate-500">Lab</p><p class="text-white">${o.lab ?? '—'}</p></div>
        <div><p class="text-slate-500">Est. Ready</p><p class="text-white">${fmtDate(o.estimatedReady)}</p></div>
        <div><p class="text-slate-500">Total</p><p class="text-white font-medium">${fmt$(o.totalCharge)}</p></div>
        <div><p class="text-slate-500">Balance</p><p class="${o.balanceDue > 0 ? 'text-amber-400 font-medium' : 'text-emerald-400'}">${fmt$(o.balanceDue)}</p></div>
      </div>
    </div>`
  }).join('')
}

/* ── Billing Tab ────────────────────────────────────────────────────────────── */
async function loadBilling() {
  const res = await api('GET', '/balance')
  portal.billingItems = res.data?.items ?? []
  const total = res.data?.totalBalance ?? 0

  const balEl = $('billing-total-balance')
  balEl.textContent = fmt$(total)
  balEl.className = `text-3xl font-bold mt-1 ${total > 0 ? 'text-amber-400' : 'text-emerald-400'}`
  $('payment-balance').textContent = fmt$(total)

  const el = $('billing-items-list')
  if (!portal.billingItems.length) {
    el.innerHTML = '<div class="card text-center text-slate-500 py-10"><i class="fas fa-file-invoice text-4xl mb-3 opacity-30"></i><p class="text-emerald-400 font-medium">Your account is paid in full.</p></div>'
    return
  }
  el.innerHTML = portal.billingItems.map(item => `
    <div class="card">
      <div class="flex items-start justify-between gap-3 mb-2">
        <div>
          <p class="font-medium text-white text-sm">${item.description}</p>
          <p class="text-xs text-slate-500">Service date: ${fmtDate(item.serviceDate)}</p>
        </div>
        ${badge(item.status, 'badge-yellow')}
      </div>
      <div class="grid grid-cols-3 gap-2 text-xs mt-3">
        <div><p class="text-slate-500">Charged</p><p class="text-white font-medium">${fmt$(item.totalCharge)}</p></div>
        <div><p class="text-slate-500">Insurance Paid</p><p class="text-emerald-400">${fmt$(item.insurancePaid)}</p></div>
        <div><p class="text-slate-500">Your Balance</p><p class="text-amber-400 font-bold">${fmt$(item.patientBalance)}</p></div>
      </div>
    </div>`).join('')
}

function openPaymentModal() { $('modal-payment').classList.remove('hidden') }

async function submitPayment() {
  const amount = parseFloat($('payment-amount').value) || 0
  if (amount <= 0) { showToast('Enter a valid payment amount', false); return }
  showToast(`Payment of ${fmt$(amount)} recorded (demo only)`)
  closeModal('modal-payment')
}

/* ── Messages Tab ───────────────────────────────────────────────────────────── */
async function loadMessages() {
  const res = await api('GET', '/messages')
  portal.threads = res.data ?? []
  renderThreadList()
}

function renderThreadList() {
  const el = $('thread-list')
  if (!portal.threads.length) {
    el.innerHTML = '<div class="card text-slate-500 text-sm py-6 text-center">No messages yet.</div>'
    return
  }
  el.innerHTML = portal.threads.map(t => `
    <div class="p-3 rounded-xl border cursor-pointer transition-all hover:border-blue-500/40 hover:bg-slate-800/50 ${t.status === 'UNREAD' ? 'border-blue-500/30 bg-blue-500/5' : 'border-slate-700/50 bg-slate-800/20'}"
      id="thread-item-${t.threadId}" onclick="openThread('${t.threadId}')">
      <div class="flex items-start gap-2 mb-1">
        <div class="w-7 h-7 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
          <i class="fas ${MSG_CAT_ICONS[t.category] ?? 'fa-comment'} text-blue-400 text-xs"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-white truncate ${t.status === 'UNREAD' ? 'font-semibold' : ''}">${t.subject}</p>
          <p class="text-xs text-slate-500">${fmtDateTime(t.updatedAt)}</p>
        </div>
        ${t.status === 'UNREAD' ? '<div class="w-2 h-2 bg-blue-400 rounded-full shrink-0 mt-1.5"></div>' : ''}
      </div>
      <p class="text-xs text-slate-400 line-clamp-1 ml-9">${t.lastMessage?.body ?? ''}</p>
    </div>`).join('')
}

async function openThread(threadId) {
  portal.selectedThread = threadId

  // Mark as read
  await api('GET', `/messages/${threadId}`)

  const thread = portal.threads.find(t => t.threadId === threadId)
  if (!thread) return

  // Update thread item style
  const item = $(`thread-item-${threadId}`)
  if (item) {
    item.className = item.className.replace('border-blue-500/30 bg-blue-500/5', 'border-slate-700/50 bg-slate-800/20')
    item.querySelector('.w-2.h-2')?.remove()
    const subj = item.querySelector('p.font-semibold')
    if (subj) subj.classList.remove('font-semibold')
  }

  // Get messages
  const msgRes = await api('GET', `/messages/${threadId}`)
  const messages = Array.isArray(msgRes.data) ? msgRes.data : [thread.lastMessage]

  const detailEl = $('thread-detail')
  detailEl.innerHTML = `
    <div class="flex items-center justify-between p-4 border-b border-slate-800">
      <div>
        <p class="font-semibold text-white">${thread.subject}</p>
        <p class="text-xs text-slate-500">${(thread.category ?? '').replace(/_/g,' ')}</p>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto p-4 space-y-4" id="msg-body-${threadId}">
      ${messages.map(m => `
        <div class="${m.fromPatient ? 'flex flex-col items-end' : 'flex flex-col items-start'}">
          <div class="${m.fromPatient ? 'msg-bubble-patient' : 'msg-bubble-staff'}">
            <p class="text-xs font-semibold ${m.fromPatient ? 'text-blue-400' : 'text-slate-400'} mb-1">${m.senderName}</p>
            <p class="text-sm text-slate-200 whitespace-pre-wrap">${m.body}</p>
          </div>
          <p class="text-xs text-slate-600 mt-1 px-2">${fmtDateTime(m.createdAt)}</p>
        </div>`).join('')}
    </div>
    <div class="p-4 border-t border-slate-800">
      <div class="flex gap-2">
        <textarea id="reply-body-${threadId}" class="input-field flex-1 h-16 resize-none" placeholder="Type your reply…"></textarea>
        <button onclick="sendReply('${threadId}')" class="btn-primary px-3 self-end"><i class="fas fa-paper-plane"></i></button>
      </div>
    </div>`

  // Mobile: replace thread list with detail
  if (window.innerWidth < 768) {
    $('thread-list').classList.add('hidden')
    detailEl.classList.remove('hidden')
    detailEl.classList.add('flex')
  } else {
    detailEl.classList.remove('hidden')
    detailEl.classList.add('flex')
    detailEl.classList.remove('hidden')
  }
}

async function sendReply(threadId) {
  const bodyEl = $(`reply-body-${threadId}`)
  const body = bodyEl?.value.trim()
  if (!body) return

  const thread = portal.threads.find(t => t.threadId === threadId)
  if (!thread) return

  const res = await api('POST', '/messages', {
    subject: `Re: ${thread.subject}`,
    category: thread.category,
    body,
    threadId,
  })

  if (res.success) {
    bodyEl.value = ''
    showToast('Reply sent')
    // Re-open the thread to refresh
    await openThread(threadId)
  } else {
    showToast(res.error ?? 'Failed to send', false)
  }
}

/* ── New Message ────────────────────────────────────────────────────────────── */
function openNewMsgModal() {
  $('msg-subject').value = ''
  $('msg-body').value    = ''
  $('modal-new-msg').classList.remove('hidden')
}

async function submitMessage() {
  const subject  = $('msg-subject').value.trim()
  const body     = $('msg-body').value.trim()
  const category = $('msg-category').value
  if (!subject || !body) { showToast('Subject and message are required', false); return }

  const res = await api('POST', '/messages', { subject, body, category })
  if (res.success) {
    showToast('Message sent to care team')
    closeModal('modal-new-msg')
    portal.threads = []
    loadMessages()
  } else {
    showToast(res.error ?? 'Failed to send', false)
  }
}

/* ── Keyboard ───────────────────────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeModal('modal-new-appt')
    closeModal('modal-new-msg')
    closeModal('modal-payment')
    // Mobile back from thread detail
    if (window.innerWidth < 768 && $('thread-detail').classList.contains('flex')) {
      $('thread-detail').classList.remove('flex')
      $('thread-detail').classList.add('hidden')
      $('thread-list').classList.remove('hidden')
    }
  }
  if (e.key === 'Enter' && e.target === $('login-lastname')) $('login-dob').focus()
  if (e.key === 'Enter' && e.target === $('login-dob')) doLogin()
})

/* ── Init ───────────────────────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', async () => {
  // Try auto-login from saved session
  const autoLogged = await tryAutoLogin()
  if (autoLogged) {
    enterPortal()
  }
  // Default urgency label styling
  setUrgency('routine')
})
