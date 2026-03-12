// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 7B: Telehealth / Async Video Visit — Frontend
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/telehealth'

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  visits: [],
  dashboard: null,
  selectedVisitId: null,
  queueFilter: 'ALL',
  activeTab: 'overview',
  rxRows: 0,
}

// ── Utilities ─────────────────────────────────────────────────────────────────
const $id = id => document.getElementById(id)
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'
const fmtDateTime = iso => iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
const timeAgo = iso => {
  if (!iso) return '—'
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function showToast(msg, isErr = false) {
  const el = $id('toast')
  el.textContent = msg
  el.className = `fixed bottom-6 left-1/2 -translate-x-1/2 text-sm px-5 py-2.5 rounded-xl shadow-2xl z-[300] ${isErr ? 'bg-red-900 border border-red-700 text-red-200' : 'bg-slate-800 border border-slate-600 text-white'}`
  el.classList.remove('hidden')
  setTimeout(() => el.classList.add('hidden'), 3500)
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const tok = sessionStorage.getItem('of_access_token');
  const headers = { 'Content-Type': 'application/json' };
  if (tok) headers['Authorization'] = `Bearer ${tok}`;
  const r = await fetch(API + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } })
  if (r.status === 401) { sessionStorage.clear(); location.href = '/login'; return {}; }
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}
async function apiPost(path, body) {
  return apiFetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}
async function apiPatch(path, body) {
  return apiFetch(path, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

// ── Status / urgency helpers ──────────────────────────────────────────────────
function statusLabel(s) {
  const m = { INTAKE_PENDING: 'Intake Pending', INTAKE_COMPLETE: 'Ready for Review', UNDER_REVIEW: 'Under Review',
              AWAITING_INFO: 'Awaiting Info', COMPLETED: 'Completed', CANCELLED: 'Cancelled' }
  return m[s] || s
}
function statusChip(s) {
  return `<span class="chip ch-${s.toLowerCase()}">${statusLabel(s)}</span>`
}
function urgencyDot(u) {
  const cls = { ROUTINE: 'urg-routine', URGENT: 'urg-urgent', EMERGENT: 'urg-emergent' }[u] || 'urg-routine'
  return `<div class="urg-dot ${cls}" title="${u}"></div>`
}
function visitTypeIcon(t) {
  const m = { ASYNC_REVIEW: 'fa-file-medical', LIVE_VIDEO: 'fa-video', PHOTO_REVIEW: 'fa-camera',
              MEDICATION_FOLLOWUP: 'fa-pills', SECOND_OPINION: 'fa-user-doctor' }
  return `<i class="fas ${m[t] || 'fa-notes-medical'} text-teal-400"></i>`
}
function visitTypeLabel(t) {
  const m = { ASYNC_REVIEW: 'Async Review', LIVE_VIDEO: 'Live Video', PHOTO_REVIEW: 'Photo Review',
              MEDICATION_FOLLOWUP: 'Med Follow-up', SECOND_OPINION: '2nd Opinion' }
  return m[t] || t
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  try {
    await apiFetch('/ping')
    await Promise.all([loadDashboard(), loadVisits()])
    renderSettingsProviders()
  } catch (e) {
    showToast('Failed to load telehealth data', true)
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const r = await apiFetch('/dashboard')
  state.dashboard = r.data
  renderDashboard(state.dashboard)
}

function renderDashboard(d) {
  if (!d) return
  $id('ov-awaiting').textContent  = d.awaitingReview
  $id('ov-info').textContent      = d.awaitingInfo
  $id('ov-urgent').textContent    = d.urgentPending
  $id('ov-live').textContent      = d.upcomingLive.length
  $id('ov-completed').textContent = d.completedToday
  $id('ov-week').textContent      = `${d.totalThisWeek} this week`

  // Active queue
  const queueEl = $id('ov-queue-list')
  if (queueEl) {
    const active = d.recentVisits || []
    $id('ov-queue-count').textContent = `${active.length} active`
    if (!active.length) {
      queueEl.innerHTML = '<div class="text-slate-500 text-xs text-center py-4">No active visits</div>'
    } else {
      queueEl.innerHTML = active.map(v => `
        <div class="flex items-center gap-2 py-2.5 border-b border-slate-800 last:border-0 cursor-pointer hover:bg-slate-800/30 -mx-2 px-2 rounded" onclick="selectVisit('${v.id}')">
          ${urgencyDot(v.urgency)}
          <div class="flex-1 min-w-0">
            <div class="text-xs font-semibold text-slate-200 truncate">${v.patientName}</div>
            <div class="text-xs text-slate-500 truncate">${v.chiefComplaint}</div>
          </div>
          ${statusChip(v.status)}
          <div class="text-xs text-slate-500">${timeAgo(v.updatedAt)}</div>
        </div>
      `).join('')
    }
  }

  // Upcoming live sessions
  const liveEl = $id('ov-live-list')
  if (liveEl) {
    if (!d.upcomingLive.length) {
      liveEl.innerHTML = '<div class="text-slate-500 text-xs text-center py-4">No live sessions scheduled</div>'
    } else {
      liveEl.innerHTML = d.upcomingLive.map(v => `
        <div class="flex items-center gap-3 py-2.5 border-b border-slate-800 last:border-0">
          <div class="w-8 h-8 rounded-full bg-teal-600/20 flex items-center justify-center flex-shrink-0">
            <i class="fas fa-video text-teal-400 text-xs"></i>
          </div>
          <div class="flex-1">
            <div class="text-xs font-semibold text-slate-200">${v.patientName}</div>
            <div class="text-xs text-slate-500">${v.chiefComplaint}</div>
          </div>
          <div class="text-right">
            <div class="text-xs font-bold text-teal-400">${fmtTime(v.scheduledAt)}</div>
            <div class="text-xs text-slate-500">${fmtDate(v.scheduledAt)}</div>
          </div>
          <a href="${v.videoRoomUrl}" target="_blank" class="btn-sm text-xs">
            <i class="fas fa-video text-teal-400"></i> Join
          </a>
        </div>
      `).join('')
    }
  }
}

// ── Visit list (sidebar) ──────────────────────────────────────────────────────
async function loadVisits() {
  const r = await apiFetch(`/visits?filter=${state.queueFilter}`)
  state.visits = r.data || []
  renderVisitList()
  renderCompletedList()
  renderLiveSessions()
}

function renderVisitList() {
  const el = $id('visit-list')
  if (!el) return

  const filtered = state.visits.filter(v => {
    if (state.queueFilter === 'PENDING') return v.status === 'INTAKE_PENDING' || v.status === 'INTAKE_COMPLETE'
    if (state.queueFilter === 'URGENT') return v.urgency === 'URGENT' || v.urgency === 'EMERGENT'
    if (state.queueFilter === 'LIVE') return v.visitType === 'LIVE_VIDEO'
    return true
  })

  if (!filtered.length) {
    el.innerHTML = '<div class="text-slate-500 text-xs text-center py-8">No visits in this queue</div>'
    return
  }

  el.innerHTML = filtered.map(v => {
    const isActive = v.id === state.selectedVisitId
    const unreadMsgs = (v.messages || []).filter(m => !m.isRead && m.senderRole === 'PATIENT').length
    return `
      <div class="visit-row ${isActive ? 'active' : ''}" onclick="selectVisit('${v.id}')">
        <div class="flex items-start gap-2">
          ${urgencyDot(v.urgency)}
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-1.5 mb-0.5">
              <span class="text-xs font-bold text-slate-200">${v.patientName}</span>
              ${unreadMsgs > 0 ? `<span class="bg-teal-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">${unreadMsgs}</span>` : ''}
            </div>
            <div class="text-xs text-slate-400 truncate mb-1">${v.chiefComplaint}</div>
            <div class="flex items-center gap-1.5 flex-wrap">
              ${statusChip(v.status)}
              <span class="text-xs text-slate-600">${visitTypeLabel(v.visitType)}</span>
            </div>
          </div>
          <div class="text-xs text-slate-600 flex-shrink-0">${timeAgo(v.updatedAt)}</div>
        </div>
      </div>
    `
  }).join('')
}

// ── Visit selection ───────────────────────────────────────────────────────────
async function selectVisit(id) {
  state.selectedVisitId = id

  // Update sidebar active state
  document.querySelectorAll('.visit-row').forEach(el => {
    el.classList.toggle('active', el.onclick?.toString().includes(`'${id}'`))
  })
  renderVisitList()

  // Switch to queue tab and show detail
  showTab('queue', $id('tab-btn-queue'))

  // Load fresh visit data
  try {
    const r = await apiFetch(`/visits/${id}`)
    const visit = r.data
    renderVisitDetail(visit)
  } catch (e) {
    showToast('Failed to load visit details', true)
  }
}

function renderVisitDetail(v) {
  $id('visit-detail-placeholder')?.classList.add('hidden')
  const detailEl = $id('visit-detail')
  detailEl.classList.remove('hidden')

  const q = v.questionnaire
  const rv = v.review

  // Video banner for live sessions
  const videoBanner = v.visitType === 'LIVE_VIDEO' && v.videoRoomUrl ? `
    <div class="video-banner">
      <div class="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center flex-shrink-0">
        <i class="fas fa-video text-teal-400 text-sm"></i>
      </div>
      <div class="flex-1">
        <div class="text-sm font-bold text-teal-300">Live Video Session</div>
        <div class="text-xs text-slate-400">Scheduled: ${fmtDateTime(v.scheduledAt)}</div>
      </div>
      <a href="${v.videoRoomUrl}" target="_blank" class="btn-primary text-xs">
        <i class="fas fa-video"></i> Join Call
      </a>
    </div>
  ` : ''

  // Action buttons based on status
  const actions = renderActionButtons(v)

  // Open info requests
  const openIRs = (v.infoRequests || []).filter(ir => !ir.isResolved)
  const resolvedIRs = (v.infoRequests || []).filter(ir => ir.isResolved)

  detailEl.innerHTML = `
    <!-- Header -->
    <div class="card mb-4">
      ${videoBanner}
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            ${urgencyDot(v.urgency)}
            <h2 class="text-base font-bold text-slate-100">${v.patientName}</h2>
            ${statusChip(v.status)}
          </div>
          <div class="text-sm text-slate-400 mb-2">${v.chiefComplaint}</div>
          <div class="flex flex-wrap gap-2 text-xs text-slate-500">
            <span>${visitTypeIcon(v.visitType)} ${visitTypeLabel(v.visitType)}</span>
            ${v.assignedProviderName ? `<span><i class="fas fa-user-doctor text-indigo-400"></i> ${v.assignedProviderName}</span>` : '<span class="text-yellow-500"><i class="fas fa-user-slash"></i> Unassigned</span>'}
            <span><i class="fas fa-clock"></i> Created ${fmtDateTime(v.createdAt)}</span>
            ${v.completedAt ? `<span class="text-green-400"><i class="fas fa-check"></i> Completed ${fmtDateTime(v.completedAt)}</span>` : ''}
          </div>
        </div>
        <div class="flex gap-2 flex-wrap justify-end">${actions}</div>
      </div>
    </div>

    <!-- Info requests (open) -->
    ${openIRs.length > 0 ? `
      <div class="card mb-4" style="border-color:rgba(245,158,11,.3);">
        <div class="card-title"><i class="fas fa-question-circle text-yellow-400"></i>Awaiting Patient Response (${openIRs.length})</div>
        ${openIRs.map(ir => `
          <div class="ir-card">
            <div class="text-xs font-bold text-yellow-400 mb-1">Q: ${ir.question}</div>
            <div class="text-xs text-slate-500">${ir.requestedBy} · ${timeAgo(ir.requestedAt)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- Questionnaire -->
    ${q ? `
      <div class="card mb-4">
        <div class="card-title"><i class="fas fa-clipboard-list text-teal-400"></i>Pre-Visit Questionnaire
          <span class="text-xs text-slate-500 font-normal ml-auto">Submitted ${timeAgo(q.submittedAt)}</span>
        </div>
        <div class="detail-row"><div class="detail-key">Chief Complaint</div><div class="detail-val">${q.chiefComplaint}</div></div>
        <div class="detail-row"><div class="detail-key">Symptoms Onset</div><div class="detail-val">${q.symptomsOnset}</div></div>
        <div class="detail-row"><div class="detail-key">Severity</div>
          <div class="detail-val">
            <div class="scale-bar">
              ${Array.from({length:10},(_,i)=>`<div class="scale-dot" style="background:${i<q.symptomsSeverity?(q.symptomsSeverity<=3?'#10b981':q.symptomsSeverity<=6?'#f59e0b':'#ef4444'):'rgba(71,85,105,0.4)'}"></div>`).join('')}
              <span class="ml-2 text-xs font-bold">${q.symptomsSeverity}/10</span>
            </div>
          </div>
        </div>
        <div class="detail-row"><div class="detail-key">Description</div><div class="detail-val">${q.symptomsDescription}</div></div>
        <div class="detail-row"><div class="detail-key">Affected Eye</div><div class="detail-val font-mono text-teal-400">${q.affectedEye}</div></div>
        <div class="detail-row"><div class="detail-key">Pain Level</div><div class="detail-val">${q.painLevel}/10</div></div>
        <div class="detail-row"><div class="detail-key">Medications</div><div class="detail-val">${q.currentMedications}</div></div>
        <div class="detail-row"><div class="detail-key">Allergies</div><div class="detail-val">${q.allergies}</div></div>
        <div class="g3 mt-3 text-xs">
          ${[['Vision Changes',q.visionChanges],['Light Sensitivity',q.lightSensitivity],['Floaters/Flashes',q.floatersOrFlashes],['Recent Injury',q.recentEyeInjury]].map(([lbl,val])=>`
            <div class="flex items-center gap-1.5"><i class="fas fa-${val?'check-circle text-green-400':'circle-xmark text-slate-600'}"></i><span class="text-slate-400">${lbl}</span></div>
          `).join('')}
        </div>
        ${q.additionalNotes ? `<div class="detail-row mt-2"><div class="detail-key">Notes</div><div class="detail-val text-slate-400 italic">${q.additionalNotes}</div></div>` : ''}
        ${q.photoUrls?.length ? `
          <div class="mt-3">
            <div class="section-label">Submitted Photos (${q.photoUrls.length})</div>
            <div class="flex gap-2 flex-wrap">
              ${q.photoUrls.map(url => `<img src="${url}" class="photo-thumb" alt="Patient photo" onerror="this.src='https://placehold.co/90x70/1e293b/475569?text=Photo'">`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    ` : `
      <div class="card mb-4 text-center" style="border-style:dashed;">
        <i class="fas fa-clipboard text-slate-600 text-2xl mb-2 block"></i>
        <div class="text-sm text-slate-500">Patient has not submitted their questionnaire yet.</div>
        ${v.status === 'INTAKE_PENDING' ? `<div class="text-xs text-slate-600 mt-1">An intake link has been sent.</div>` : ''}
      </div>
    `}

    <!-- Resolved info requests -->
    ${resolvedIRs.length > 0 ? `
      <div class="card mb-4">
        <div class="card-title"><i class="fas fa-comments text-indigo-400"></i>Resolved Info Requests</div>
        ${resolvedIRs.map(ir => `
          <div class="ir-card resolved mb-2">
            <div class="text-xs font-semibold text-slate-300 mb-1">${ir.question}</div>
            ${ir.patientResponse ? `<div class="text-xs text-green-400 mt-1"><i class="fas fa-reply mr-1"></i>${ir.patientResponse}</div>` : ''}
            <div class="text-xs text-slate-600 mt-1">${ir.requestedBy} · Resolved ${timeAgo(ir.respondedAt)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <!-- Provider review (if exists) -->
    ${rv ? `
      <div class="card mb-4" style="border-color:rgba(16,185,129,.2);">
        <div class="card-title"><i class="fas fa-stethoscope text-green-400"></i>Provider Review
          <span class="text-xs text-green-400 font-normal ml-auto">
            ${rv.signedAt ? `<i class="fas fa-check-circle mr-1"></i>Signed ${fmtDateTime(rv.signedAt)}` : 'Draft'}
          </span>
        </div>
        <div class="detail-row"><div class="detail-key">Provider</div><div class="detail-val">${rv.providerName}</div></div>
        <div class="detail-row"><div class="detail-key">Clinical Findings</div><div class="detail-val">${rv.clinicalFindings}</div></div>
        <div class="detail-row"><div class="detail-key">Assessment</div><div class="detail-val font-medium text-slate-200">${rv.assessment}</div></div>
        <div class="detail-row"><div class="detail-key">Plan</div><div class="detail-val">${rv.plan}</div></div>
        ${rv.prescriptions?.length ? `
          <div class="mt-3">
            <div class="section-label">Prescriptions</div>
            ${rv.prescriptions.map(p => `
              <div class="rx-row">
                <div class="font-semibold text-slate-200">${p.medication}</div>
                <div class="text-slate-400">${p.dosage} · ${p.frequency} · ${p.duration} · ${p.refills} refill(s)</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
        <div class="detail-row mt-2"><div class="detail-key">Patient Instructions</div><div class="detail-val text-teal-300">${rv.patientInstructions}</div></div>
        ${rv.followUpRequired ? `<div class="detail-row"><div class="detail-key">Follow-up</div><div class="detail-val">In ${rv.followUpInDays} days</div></div>` : ''}
        ${rv.referralRequired ? `<div class="detail-row"><div class="detail-key">Referral</div><div class="detail-val text-yellow-400">${rv.referralTo}</div></div>` : ''}
      </div>
    ` : ''}

    <!-- Messages -->
    <div class="card">
      <div class="card-title"><i class="fas fa-comments text-indigo-400"></i>Visit Messages
        <button onclick="openMessageModal('${v.id}')" class="btn-sm text-xs ml-auto"><i class="fas fa-plus"></i> Message</button>
      </div>
      ${!(v.messages?.length) ? '<div class="text-slate-500 text-xs text-center py-3">No messages yet</div>' : ''}
      <div class="flex flex-col gap-1">
        ${(v.messages || []).map(m => `
          <div class="flex flex-col ${m.senderRole !== 'PATIENT' ? 'items-end' : 'items-start'}">
            <div class="msg-meta ${m.senderRole !== 'PATIENT' ? 'text-right' : ''}">${m.senderName} · ${timeAgo(m.sentAt)}</div>
            <div class="msg-bubble msg-${m.senderRole.toLowerCase()}">${m.body}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `
}

function renderActionButtons(v) {
  const btns = []
  if (v.status === 'INTAKE_COMPLETE' || v.status === 'AWAITING_INFO') {
    btns.push(`<button onclick="openReviewModal('${v.id}')" class="btn-primary text-xs"><i class="fas fa-stethoscope"></i> Review</button>`)
  }
  if (v.status === 'UNDER_REVIEW') {
    btns.push(`<button onclick="openReviewModal('${v.id}')" class="btn-primary text-xs"><i class="fas fa-edit"></i> Edit Review</button>`)
  }
  if (v.status !== 'COMPLETED' && v.status !== 'CANCELLED') {
    btns.push(`<button onclick="openInfoReqModal('${v.id}')" class="btn-sm text-xs"><i class="fas fa-question-circle text-yellow-400"></i> Ask Patient</button>`)
  }
  if (v.status !== 'COMPLETED' && v.status !== 'CANCELLED') {
    btns.push(`<button onclick="cancelVisit('${v.id}')" class="btn-danger text-xs"><i class="fas fa-xmark"></i> Cancel</button>`)
  }
  return btns.join('')
}

// ── Live sessions tab ─────────────────────────────────────────────────────────
function renderLiveSessions() {
  const el = $id('live-sessions-list')
  if (!el) return
  const live = state.visits.filter(v => v.visitType === 'LIVE_VIDEO' && v.status !== 'COMPLETED' && v.status !== 'CANCELLED')
  if (!live.length) {
    el.innerHTML = '<div class="text-slate-500 text-sm text-center py-12"><i class="fas fa-video text-3xl mb-3 block text-slate-700"></i>No live sessions scheduled</div>'
    return
  }
  el.innerHTML = live.map(v => `
    <div class="card mb-4">
      <div class="video-banner mb-4">
        <div class="w-10 h-10 rounded-full bg-teal-500/20 flex items-center justify-center flex-shrink-0">
          <i class="fas fa-video text-teal-400 text-sm"></i>
        </div>
        <div class="flex-1">
          <div class="text-sm font-bold text-slate-100">${v.patientName}</div>
          <div class="text-xs text-slate-400">${v.chiefComplaint}</div>
          ${v.scheduledAt ? `<div class="text-xs text-teal-400 mt-1"><i class="fas fa-clock mr-1"></i>${fmtDateTime(v.scheduledAt)}</div>` : ''}
        </div>
        ${statusChip(v.status)}
        ${v.videoRoomUrl ? `<a href="${v.videoRoomUrl}" target="_blank" class="btn-primary"><i class="fas fa-video"></i> Join</a>` : ''}
      </div>
      <div class="flex gap-2">
        <button onclick="selectVisit('${v.id}')" class="btn-sm text-xs"><i class="fas fa-eye"></i> View Details</button>
        <button onclick="openReviewModal('${v.id}')" class="btn-primary text-xs"><i class="fas fa-stethoscope"></i> Start Review</button>
      </div>
    </div>
  `).join('')
}

// ── Completed tab ─────────────────────────────────────────────────────────────
function renderCompletedList() {
  const el = $id('completed-list')
  if (!el) return
  const done = state.visits.filter(v => v.status === 'COMPLETED')
  if (!done.length) {
    el.innerHTML = '<div class="text-slate-500 text-sm text-center py-12"><i class="fas fa-check-circle text-3xl mb-3 block text-slate-700"></i>No completed visits</div>'
    return
  }
  el.innerHTML = done.map(v => `
    <div class="card mb-3 cursor-pointer hover:border-teal-500/30 transition-colors" onclick="selectVisit('${v.id}')">
      <div class="flex items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <span class="text-sm font-bold text-slate-200">${v.patientName}</span>
            ${statusChip(v.status)}
          </div>
          <div class="text-xs text-slate-400 mb-2">${v.chiefComplaint}</div>
          <div class="flex gap-3 text-xs text-slate-500">
            <span>${visitTypeIcon(v.visitType)} ${visitTypeLabel(v.visitType)}</span>
            ${v.assignedProviderName ? `<span><i class="fas fa-user-doctor text-indigo-400 mr-1"></i>${v.assignedProviderName}</span>` : ''}
            <span><i class="fas fa-check mr-1 text-green-400"></i>Completed ${timeAgo(v.completedAt)}</span>
          </div>
        </div>
        ${v.review ? `
          <div class="text-right">
            <div class="text-xs font-semibold text-slate-300 mb-1">Assessment</div>
            <div class="text-xs text-slate-400 max-w-xs">${v.review.assessment.substring(0, 80)}${v.review.assessment.length > 80 ? '…' : ''}</div>
          </div>
        ` : ''}
      </div>
    </div>
  `).join('')
}

// ── Queue filter ──────────────────────────────────────────────────────────────
async function setQueueFilter(filter, el) {
  state.queueFilter = filter
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'))
  if (el) el.classList.add('active')
  await loadVisits()
}

// ── Settings providers ────────────────────────────────────────────────────────
function renderSettingsProviders() {
  const el = $id('settings-providers')
  if (!el) return
  const providers = [
    { id: 'dr-chen',   name: 'Dr. Sarah Chen',  specialty: 'Comprehensive Ophthalmology', color: '#6366f1' },
    { id: 'dr-patel',  name: 'Dr. Raj Patel',   specialty: 'Glaucoma & Anterior Segment', color: '#10b981' },
    { id: 'dr-torres', name: 'Dr. Amy Torres',  specialty: 'Retina & Vitreous',           color: '#f59e0b' },
  ]
  el.innerHTML = providers.map(p => `
    <div class="flex items-center gap-3 py-2.5 border-b border-slate-800 last:border-0">
      <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style="background:${p.color}">
        ${p.name.split(' ').map(n => n[0]).slice(1,3).join('')}
      </div>
      <div class="flex-1">
        <div class="text-xs font-bold text-slate-200">${p.name}</div>
        <div class="text-xs text-slate-500">${p.specialty}</div>
      </div>
      <span class="chip ch-completed">Active</span>
    </div>
  `).join('')
}

// ── New visit modal ───────────────────────────────────────────────────────────
function openNewVisitModal() {
  $id('nv-patient-name').value = ''
  $id('nv-patient-id').value   = ''
  $id('nv-email').value        = ''
  $id('nv-phone').value        = ''
  $id('nv-type').value         = 'ASYNC_REVIEW'
  $id('nv-urgency').value      = 'ROUTINE'
  $id('nv-complaint').value    = ''
  $id('nv-provider').value     = ''
  $id('nv-schedule-group').style.display = 'none'
  $id('modal-new-visit').classList.remove('hidden')

  $id('nv-type').onchange = () => {
    $id('nv-schedule-group').style.display = $id('nv-type').value === 'LIVE_VIDEO' ? '' : 'none'
  }
}

async function submitNewVisit() {
  const name = $id('nv-patient-name').value.trim()
  const complaint = $id('nv-complaint').value.trim()
  if (!name || !complaint) { showToast('Patient name and chief complaint are required', true); return }

  const providerVal = $id('nv-provider').value
  const [providerId, providerName] = providerVal ? providerVal.split('|') : ['', '']
  const type = $id('nv-type').value
  const scheduledAt = type === 'LIVE_VIDEO' ? $id('nv-scheduled').value || undefined : undefined

  try {
    const r = await apiPost('/visits', {
      patientId:   $id('nv-patient-id').value || `pt-new-${Date.now()}`,
      patientName: name,
      patientEmail: $id('nv-email').value || undefined,
      patientPhone: $id('nv-phone').value || undefined,
      visitType:   type,
      urgency:     $id('nv-urgency').value,
      chiefComplaint: complaint,
      assignedProviderId:   providerId || undefined,
      assignedProviderName: providerName || undefined,
      scheduledAt,
      videoRoomUrl: type === 'LIVE_VIDEO' ? `https://meet.oculoflow.ai/room/${Date.now()}` : undefined,
    })
    showToast(`Visit created for ${name}`)
    closeModal('modal-new-visit')
    await loadVisits()
    await loadDashboard()
    if (r.data?.id) selectVisit(r.data.id)
  } catch (e) {
    showToast('Failed to create visit', true)
  }
}

// ── Review modal ──────────────────────────────────────────────────────────────
function openReviewModal(visitId) {
  $id('review-visit-id').value = visitId
  $id('rv-findings').value = ''
  $id('rv-assessment').value = ''
  $id('rv-plan').value = ''
  $id('rv-instructions').value = ''
  $id('rv-internal').value = ''
  $id('rv-followup').value = 'no'
  $id('rv-referral').value = 'no'
  $id('rv-followup-days-group').style.display = 'none'
  $id('rv-referral-to-group').style.display = 'none'
  $id('rx-rows').innerHTML = ''
  state.rxRows = 0

  $id('rv-followup').onchange = () => {
    $id('rv-followup-days-group').style.display = $id('rv-followup').value === 'yes' ? '' : 'none'
  }
  $id('rv-referral').onchange = () => {
    $id('rv-referral-to-group').style.display = $id('rv-referral').value === 'yes' ? '' : 'none'
  }

  // Pre-fill if visit has existing review
  const visit = state.visits.find(v => v.id === visitId)
  if (visit?.review) {
    const rv = visit.review
    $id('rv-findings').value = rv.clinicalFindings
    $id('rv-assessment').value = rv.assessment
    $id('rv-plan').value = rv.plan
    $id('rv-instructions').value = rv.patientInstructions
    $id('rv-internal').value = rv.internalNotes
    if (rv.followUpRequired) {
      $id('rv-followup').value = 'yes'
      $id('rv-followup-days-group').style.display = ''
      $id('rv-followup-days').value = rv.followUpInDays || ''
    }
    if (rv.referralRequired) {
      $id('rv-referral').value = 'yes'
      $id('rv-referral-to-group').style.display = ''
      $id('rv-referral-to').value = rv.referralTo || ''
    }
    rv.prescriptions?.forEach(p => addRxRowWithData(p))
  }

  $id('modal-review').classList.remove('hidden')
}

function addRxRow() { addRxRowWithData({}) }
function addRxRowWithData(p = {}) {
  state.rxRows++
  const idx = state.rxRows
  const el = document.createElement('div')
  el.className = 'rx-item'
  el.id = `rx-row-${idx}`
  el.innerHTML = `
    <button onclick="document.getElementById('rx-row-${idx}').remove()" style="position:absolute;top:6px;right:8px;background:none;border:none;color:#64748b;cursor:pointer;font-size:12px;">✕</button>
    <div class="g2 mb-2">
      <div><label class="form-label">Medication</label><input class="form-input" id="rx-med-${idx}" value="${p.medication||''}" placeholder="e.g. Cyclosporine 0.05%"></div>
      <div><label class="form-label">Dosage</label><input class="form-input" id="rx-dose-${idx}" value="${p.dosage||''}" placeholder="e.g. 1 drop each eye"></div>
    </div>
    <div class="g3">
      <div><label class="form-label">Frequency</label><input class="form-input" id="rx-freq-${idx}" value="${p.frequency||''}" placeholder="BID"></div>
      <div><label class="form-label">Duration</label><input class="form-input" id="rx-dur-${idx}" value="${p.duration||''}" placeholder="30 days"></div>
      <div><label class="form-label">Refills</label><input class="form-input" id="rx-refills-${idx}" value="${p.refills??0}" type="number" min="0"></div>
    </div>
  `
  $id('rx-rows').appendChild(el)
}

async function submitReview(sign) {
  const visitId = $id('review-visit-id').value
  const findings = $id('rv-findings').value.trim()
  const assessment = $id('rv-assessment').value.trim()
  const plan = $id('rv-plan').value.trim()
  const instructions = $id('rv-instructions').value.trim()

  if (!findings || !assessment || !plan || !instructions) {
    showToast('Please fill in all required fields', true); return
  }

  // Collect prescriptions
  const prescriptions = []
  for (let i = 1; i <= state.rxRows; i++) {
    const medEl = $id(`rx-med-${i}`)
    if (medEl && medEl.closest('.rx-item') && medEl.value.trim()) {
      prescriptions.push({
        medication: medEl.value,
        dosage: $id(`rx-dose-${i}`).value,
        frequency: $id(`rx-freq-${i}`).value,
        duration: $id(`rx-dur-${i}`).value,
        refills: parseInt($id(`rx-refills-${i}`).value) || 0,
      })
    }
  }

  try {
    const r = await apiPost(`/visits/${visitId}/review`, {
      providerId:   'dr-chen',
      providerName: 'Dr. Sarah Chen',
      clinicalFindings: findings,
      assessment, plan,
      prescriptions,
      followUpRequired: $id('rv-followup').value === 'yes',
      followUpInDays:   parseInt($id('rv-followup-days').value) || undefined,
      referralRequired: $id('rv-referral').value === 'yes',
      referralTo:       $id('rv-referral-to').value || undefined,
      patientInstructions: instructions,
      internalNotes: $id('rv-internal').value,
      sign,
    })
    showToast(sign ? 'Review signed & visit completed' : 'Review saved as draft')
    closeModal('modal-review')
    await loadVisits()
    await loadDashboard()
    selectVisit(visitId)
  } catch (e) {
    showToast('Failed to save review', true)
  }
}

// ── Info request modal ────────────────────────────────────────────────────────
function openInfoReqModal(visitId) {
  $id('ir-visit-id').value = visitId
  $id('ir-question').value = ''
  $id('modal-info-req').classList.remove('hidden')
}

async function submitInfoRequest() {
  const visitId  = $id('ir-visit-id').value
  const question = $id('ir-question').value.trim()
  if (!question) { showToast('Please enter a question', true); return }
  try {
    await apiPost(`/visits/${visitId}/info-request`, { question, requestedBy: 'Dr. Sarah Chen' })
    showToast('Info request sent to patient')
    closeModal('modal-info-req')
    await loadVisits()
    selectVisit(visitId)
  } catch (e) {
    showToast('Failed to send info request', true)
  }
}

// ── Message modal ─────────────────────────────────────────────────────────────
function openMessageModal(visitId) {
  $id('msg-visit-id').value = visitId
  $id('msg-body').value = ''
  $id('modal-message').classList.remove('hidden')
}

async function submitMessage() {
  const visitId = $id('msg-visit-id').value
  const body = $id('msg-body').value.trim()
  if (!body) { showToast('Please enter a message', true); return }
  try {
    await apiPost(`/visits/${visitId}/messages`, {
      senderId: 'dr-chen', senderName: 'Dr. Sarah Chen', senderRole: 'PROVIDER', body,
    })
    showToast('Message sent')
    closeModal('modal-message')
    await loadVisits()
    selectVisit(visitId)
  } catch (e) {
    showToast('Failed to send message', true)
  }
}

// ── Cancel visit ──────────────────────────────────────────────────────────────
async function cancelVisit(visitId) {
  if (!confirm('Cancel this telehealth visit?')) return
  try {
    await apiPatch(`/visits/${visitId}/status`, { status: 'CANCELLED' })
    showToast('Visit cancelled')
    state.selectedVisitId = null
    $id('visit-detail-placeholder')?.classList.remove('hidden')
    $id('visit-detail')?.classList.add('hidden')
    await loadVisits()
    await loadDashboard()
  } catch (e) {
    showToast('Failed to cancel visit', true)
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function showTab(name, el) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('[id^="tab-"]').forEach(t => {
    if (!t.id.startsWith('tab-btn')) t.classList.add('hidden')
  })
  if (el) el.classList.add('active')
  $id(`tab-${name}`)?.classList.remove('hidden')
  state.activeTab = name
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function closeModal(id) { $id(id)?.classList.add('hidden') }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.add('hidden')
})

// ── Start ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init)
