// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 6A: Appointment Reminders & Communications — Frontend JS
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/reminders'

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  dashboard: null,
  messages: [],
  noShows: [],
  campaigns: [],
  templates: [],
  rules: [],
  currentTab: 'overview',
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadDashboard()
  loadTemplates() // needed for campaign modal
})

// ── Tab Navigation ─────────────────────────────────────────────────────────────
function showTab(name, btn) {
  document.querySelectorAll('[id^="tab-"]').forEach(el => {
    if (el.id.startsWith('tab-btn-')) return
    el.classList.add('hidden')
  })
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))

  const tabEl = document.getElementById('tab-' + name)
  if (tabEl) tabEl.classList.remove('hidden')
  if (btn) btn.classList.add('active')
  state.currentTab = name

  switch (name) {
    case 'overview':   loadDashboard(); break
    case 'messages':   loadMessages(); break
    case 'noshows':    loadNoShows(); break
    case 'campaigns':  loadCampaigns(); break
    case 'templates':  loadTemplates(); break
    case 'rules':      loadRules(); break
  }
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function api(path, method = 'GET', body = null) {
  const tok = sessionStorage.getItem('of_access_token');
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (tok) opts.headers['Authorization'] = `Bearer ${tok}`;
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(API + path, opts)
  if (res.status === 401) { sessionStorage.clear(); location.href = '/login'; return {}; }
  return res.json()
}

// ── Format helpers ─────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
  catch { return iso }
}
function fmtDateShort(iso) {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return iso }
}
function channelBadge(ch) {
  const map = { SMS: 'ch-sms', EMAIL: 'ch-email', BOTH: 'ch-both' }
  const icons = { SMS: 'fa-mobile-screen', EMAIL: 'fa-envelope', BOTH: 'fa-layer-group' }
  return `<span class="chip ${map[ch] || 'ch-sms'}"><i class="fas ${icons[ch] || 'fa-mobile-screen'}"></i>${ch}</span>`
}
function statusBadge(s) {
  const map = {
    DELIVERED: 'ch-delivered', SENT: 'ch-sent', PENDING: 'ch-pending',
    FAILED: 'ch-failed', BOUNCED: 'ch-bounced', OPTED_OUT: 'ch-opted_out',
  }
  return `<span class="chip ${map[s] || 'ch-pending'}">${s.replace(/_/g, ' ')}</span>`
}
function responseBadge(r) {
  if (!r) return '<span class="text-slate-500 text-xs">—</span>'
  const map = {
    CONFIRMED: 'ch-confirmed', CANCELLED: 'ch-cancelled',
    RESCHEDULE: 'ch-reschedule', NO_RESPONSE: 'ch-no_response',
  }
  return `<span class="chip ${map[r] || 'ch-no_response'}">${r.replace(/_/g, ' ')}</span>`
}
function noShowStatusBadge(s) {
  const map = {
    UNCONTACTED: 'ch-uncontacted', FOLLOWUP_SENT: 'ch-followup_sent',
    RESCHEDULED: 'ch-rescheduled', DISMISSED: 'ch-dismissed',
  }
  return `<span class="chip ${map[s] || 'ch-pending'}">${s.replace(/_/g, ' ')}</span>`
}
function campaignStatusBadge(s) {
  const map = {
    DRAFT: 'ch-draft', SCHEDULED: 'ch-scheduled', RUNNING: 'ch-running',
    COMPLETED: 'ch-completed', PAUSED: 'ch-paused', CANCELLED: 'ch-cancelled-c',
  }
  return `<span class="chip ${map[s] || 'ch-draft'}">${s}</span>`
}
function msgTypeFmt(t) {
  const map = {
    REMINDER_24H: '24h Reminder', REMINDER_48H: '48h Reminder', REMINDER_1H: '1h Reminder',
    CONFIRMATION_REQUEST: 'Confirmation', CONFIRMATION_RECEIVED: 'Confirmed',
    CANCELLATION_NOTICE: 'Cancellation', RESCHEDULE_NOTICE: 'Reschedule',
    NO_SHOW_FOLLOWUP: 'No-Show F/U', RECALL_OUTREACH: 'Recall', CUSTOM: 'Custom',
  }
  return map[t] || t
}

// ── OVERVIEW (Dashboard) ──────────────────────────────────────────────────────
async function loadDashboard() {
  const res = await api('/dashboard')
  if (!res.success) return
  const d = res.data
  state.dashboard = d

  document.getElementById('s-pending').textContent       = d.pendingReminders ?? 0
  document.getElementById('s-sent').textContent          = d.sentToday ?? 0
  document.getElementById('s-delivered-sub').textContent = `${d.deliveredToday ?? 0} delivered`
  document.getElementById('s-confirmed').textContent     = d.confirmedToday ?? 0
  document.getElementById('s-noshows').textContent       = d.noShowsToday ?? 0
  document.getElementById('s-response-rate').textContent = (d.responseRate ?? 0) + '%'

  // Upcoming reminders
  const upList = document.getElementById('upcoming-list')
  if (d.upcomingReminders?.length) {
    upList.innerHTML = d.upcomingReminders.map(r => `
      <div class="reminder-row">
        <div class="p-dot pd-NORMAL"></div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-semibold text-slate-200 truncate">${r.patientName}</div>
          <div class="text-xs text-slate-500">${r.date} · ${r.time}</div>
        </div>
        <div>${channelBadge(r.channel)}</div>
        <div class="text-xs text-slate-500 whitespace-nowrap">${fmtDate(r.scheduledFor)}</div>
      </div>`).join('')
  } else {
    upList.innerHTML = '<div class="text-slate-500 text-xs text-center py-4">No upcoming reminders</div>'
  }

  // Recent messages
  const tbody = document.getElementById('recent-msgs-body')
  if (d.recentMessages?.length) {
    tbody.innerHTML = d.recentMessages.slice(0, 8).map(m => `
      <tr>
        <td class="text-xs font-medium text-slate-200">${m.patientName}</td>
        <td class="text-xs text-slate-400">${msgTypeFmt(m.messageType)}</td>
        <td>${channelBadge(m.channel)}</td>
        <td>${statusBadge(m.status)}</td>
        <td>${responseBadge(m.patientResponse)}</td>
      </tr>`).join('')
  } else {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-4">No messages yet</td></tr>'
  }

  // Active campaigns
  const campEl = document.getElementById('active-campaigns-list')
  if (d.activeCampaigns?.length) {
    campEl.innerHTML = d.activeCampaigns.map(c => {
      const pct = c.recipientCount > 0 ? Math.round((c.deliveredCount / c.recipientCount) * 100) : 0
      return `
        <div class="mb-3">
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs font-semibold text-slate-200 truncate mr-2">${c.name}</span>
            ${campaignStatusBadge(c.status)}
          </div>
          <div class="flex items-center gap-2 text-xs text-slate-500 mb-1">
            <span>${c.deliveredCount}/${c.recipientCount} delivered</span>
            <span>·</span>
            <span>${c.confirmedCount} confirmed</span>
            <span>·</span>
            ${channelBadge(c.channel)}
          </div>
          <div class="prog-bar"><div class="prog-fill bg-indigo-500" style="width:${pct}%"></div></div>
        </div>`
    }).join('')
  } else {
    campEl.innerHTML = '<div class="text-slate-500 text-xs text-center py-4">No active campaigns</div>'
  }

  // Open no-shows
  const nsEl = document.getElementById('open-noshows-list')
  const openNs = (d.noShows || []).filter(n => n.status !== 'DISMISSED' && n.status !== 'RESCHEDULED')
  if (openNs.length) {
    nsEl.innerHTML = openNs.map(n => `
      <div class="flex items-center gap-3 py-2 border-b border-slate-800/60">
        <div class="p-dot pd-URGENT"></div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-semibold text-slate-200 truncate">${n.patientName}</div>
          <div class="text-xs text-slate-500">${n.appointmentType.replace(/_/g,' ')} · ${n.providerName}</div>
        </div>
        ${noShowStatusBadge(n.status)}
        <button onclick="sendFollowup('${n.id}')" class="btn-sm text-xs py-1 px-2"><i class="fas fa-paper-plane"></i></button>
      </div>`).join('')
  } else {
    nsEl.innerHTML = '<div class="text-slate-500 text-xs text-center py-4">No open no-shows</div>'
  }

  // Badge counts
  const nsCount = (d.noShows || []).filter(n => n.status === 'UNCONTACTED').length
  document.getElementById('badge-ns').textContent = nsCount || '0'
  document.getElementById('badge-msg').textContent = d.sentToday || '0'
}

// ── MESSAGES TAB ──────────────────────────────────────────────────────────────
async function loadMessages() {
  const statusFilter = document.getElementById('msg-filter-status')?.value || ''
  const typeFilter   = document.getElementById('msg-filter-type')?.value || ''
  let url = '/messages'
  const params = []
  if (statusFilter) params.push('status=' + statusFilter)
  if (typeFilter)   params.push('messageType=' + typeFilter)
  if (params.length) url += '?' + params.join('&')

  const res = await api(url)
  if (!res.success) return
  state.messages = res.data
  renderMessagesTable()
}

function renderMessagesTable() {
  const tbody = document.getElementById('msgs-body')
  if (!state.messages.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-slate-500 text-center py-6">No messages found</td></tr>'
    return
  }
  tbody.innerHTML = state.messages.map(m => `
    <tr>
      <td>
        <div class="text-xs font-semibold text-slate-200">${m.patientName}</div>
        <div class="text-xs text-slate-500">${m.patientId}</div>
      </td>
      <td class="text-xs text-slate-400">${msgTypeFmt(m.messageType)}</td>
      <td>${channelBadge(m.channel)}</td>
      <td>${statusBadge(m.status)}</td>
      <td>${responseBadge(m.patientResponse)}</td>
      <td class="text-xs text-slate-500">${fmtDate(m.sentAt)}</td>
      <td>
        ${!m.patientResponse ? `
          <div class="flex gap-1">
            <button onclick="recordResponse('${m.id}','CONFIRMED')" class="btn-green py-1 px-2 text-xs" title="Mark Confirmed"><i class="fas fa-check"></i></button>
            <button onclick="recordResponse('${m.id}','CANCELLED')" class="btn-danger py-1 px-2 text-xs" title="Mark Cancelled"><i class="fas fa-times"></i></button>
          </div>` : '<span class="text-slate-600 text-xs">—</span>'}
      </td>
    </tr>`).join('')
}

async function recordResponse(msgId, response) {
  const res = await api(`/messages/${msgId}/response`, 'POST', { response })
  if (res.success) {
    toast(`Marked as ${response}`, 'green')
    loadMessages()
    if (state.currentTab === 'overview') loadDashboard()
  } else {
    toast(res.error || 'Failed to record response', 'red')
  }
}

// ── NO-SHOWS TAB ──────────────────────────────────────────────────────────────
async function loadNoShows() {
  const statusFilter = document.getElementById('ns-filter')?.value || ''
  let url = '/no-shows'
  if (statusFilter) url += '?status=' + statusFilter
  const res = await api(url)
  if (!res.success) return
  state.noShows = res.data
  renderNoShowsTable()
}

function renderNoShowsTable() {
  const tbody = document.getElementById('ns-body')
  if (!state.noShows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-slate-500 text-center py-6">No no-show records found</td></tr>'
    return
  }
  tbody.innerHTML = state.noShows.map(n => `
    <tr>
      <td>
        <div class="text-xs font-semibold text-slate-200">${n.patientName}</div>
        <div class="text-xs text-slate-500">${n.patientPhone || n.patientEmail || n.patientId}</div>
      </td>
      <td class="text-xs text-slate-400">${fmtDateShort(n.missedDate)}</td>
      <td class="text-xs text-slate-400">${(n.appointmentType || '').replace(/_/g,' ')}</td>
      <td class="text-xs text-slate-400">${n.providerName}</td>
      <td>${noShowStatusBadge(n.status)}</td>
      <td class="text-xs text-slate-500 max-w-32 truncate">${n.notes || '—'}</td>
      <td>
        <div class="flex gap-1 flex-wrap">
          ${n.status === 'UNCONTACTED' ? `<button onclick="sendFollowup('${n.id}')" class="btn-sm py-1 px-2 text-xs"><i class="fas fa-paper-plane"></i> Follow-up</button>` : ''}
          ${n.status !== 'DISMISSED' && n.status !== 'RESCHEDULED' ? `
            <button onclick="updateNoShowStatus('${n.id}','RESCHEDULED')" class="btn-green py-1 px-2 text-xs"><i class="fas fa-calendar-plus"></i></button>
            <button onclick="updateNoShowStatus('${n.id}','DISMISSED')" class="btn-danger py-1 px-2 text-xs"><i class="fas fa-ban"></i></button>
          ` : ''}
        </div>
      </td>
    </tr>`).join('')
}

async function sendFollowup(noShowId) {
  const res = await api(`/no-shows/${noShowId}/followup`, 'POST', {})
  if (res.success) {
    toast('Follow-up SMS sent ✓', 'green')
    loadNoShows()
    loadDashboard()
  } else {
    toast(res.error || 'Failed to send follow-up', 'red')
  }
}

async function updateNoShowStatus(noShowId, status) {
  const res = await api(`/no-shows/${noShowId}`, 'PATCH', { status })
  if (res.success) {
    toast(`No-show marked ${status.replace(/_/g,' ')}`, 'green')
    loadNoShows()
    loadDashboard()
  } else {
    toast(res.error || 'Failed to update', 'red')
  }
}

// ── CAMPAIGNS TAB ─────────────────────────────────────────────────────────────
async function loadCampaigns() {
  const res = await api('/campaigns')
  if (!res.success) return
  state.campaigns = res.data
  renderCampaigns()
}

function renderCampaigns() {
  const el = document.getElementById('campaigns-list')
  if (!state.campaigns.length) {
    el.innerHTML = '<div class="text-slate-500 text-xs text-center py-8">No campaigns yet</div>'
    return
  }
  el.innerHTML = state.campaigns.map(c => {
    const delivPct = c.recipientCount > 0 ? Math.round((c.deliveredCount / c.recipientCount) * 100) : 0
    const confPct  = c.recipientCount > 0 ? Math.round((c.confirmedCount / c.recipientCount) * 100) : 0
    return `
      <div class="card mb-3">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              ${campaignStatusBadge(c.status)}
              ${channelBadge(c.channel)}
            </div>
            <div class="text-sm font-bold text-slate-100">${c.name}</div>
            ${c.description ? `<div class="text-xs text-slate-500 mt-0.5">${c.description}</div>` : ''}
          </div>
          <div class="flex gap-1 flex-shrink-0">
            ${c.status === 'DRAFT' ? `<button onclick="launchCampaign('${c.id}')" class="btn-primary text-xs py-1 px-3"><i class="fas fa-rocket"></i> Launch</button>` : ''}
            ${c.status === 'RUNNING' ? `<button onclick="pauseCampaign('${c.id}')" class="btn-sm text-xs py-1 px-3"><i class="fas fa-pause"></i></button>` : ''}
          </div>
        </div>
        <div class="grid grid-cols-4 gap-3 mb-3 text-center">
          <div><div class="text-base font-bold text-slate-200">${c.recipientCount}</div><div class="text-xs text-slate-500">Recipients</div></div>
          <div><div class="text-base font-bold text-indigo-400">${c.sentCount}</div><div class="text-xs text-slate-500">Sent</div></div>
          <div><div class="text-base font-bold text-green-400">${c.deliveredCount}</div><div class="text-xs text-slate-500">Delivered</div></div>
          <div><div class="text-base font-bold text-cyan-400">${c.confirmedCount}</div><div class="text-xs text-slate-500">Confirmed</div></div>
        </div>
        <div class="space-y-1.5">
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500 w-20">Delivered</span>
            <div class="prog-bar flex-1"><div class="prog-fill bg-indigo-500" style="width:${delivPct}%"></div></div>
            <span class="text-xs text-slate-400 w-8">${delivPct}%</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-slate-500 w-20">Confirmed</span>
            <div class="prog-bar flex-1"><div class="prog-fill bg-green-500" style="width:${confPct}%"></div></div>
            <span class="text-xs text-slate-400 w-8">${confPct}%</span>
          </div>
        </div>
        <div class="flex items-center gap-3 mt-3 text-xs text-slate-600">
          <span>By ${c.createdByName}</span>
          ${c.startedAt ? `<span>· Started ${fmtDateShort(c.startedAt)}</span>` : ''}
          ${c.completedAt ? `<span>· Completed ${fmtDateShort(c.completedAt)}</span>` : ''}
        </div>
      </div>`
  }).join('')
}

async function launchCampaign(id) {
  const res = await api(`/campaigns/${id}/launch`, 'POST', {})
  if (res.success) {
    toast(`Campaign launched: ${res.data.sent} sent, ${res.data.delivered} delivered`, 'green')
    loadCampaigns()
  } else {
    toast(res.error || 'Launch failed', 'red')
  }
}

async function pauseCampaign(id) {
  const res = await api(`/campaigns/${id}/status`, 'PATCH', { status: 'PAUSED' })
  if (res.success) { toast('Campaign paused', 'yellow'); loadCampaigns() }
  else toast(res.error || 'Failed', 'red')
}

// ── TEMPLATES TAB ─────────────────────────────────────────────────────────────
async function loadTemplates() {
  const res = await api('/templates')
  if (!res.success) return
  state.templates = res.data
  renderTemplates()
  // Populate campaign template select
  const sel = document.getElementById('cmp-template')
  if (sel) {
    const existing = Array.from(sel.options).map(o => o.value)
    state.templates.forEach(t => {
      if (!existing.includes(t.id)) {
        const opt = document.createElement('option')
        opt.value = t.id; opt.textContent = t.name
        sel.appendChild(opt)
      }
    })
  }
}

function renderTemplates() {
  const el = document.getElementById('templates-list')
  if (!el) return
  if (!state.templates.length) {
    el.innerHTML = '<div class="text-slate-500 text-xs text-center py-8 col-span-2">No templates yet</div>'
    return
  }
  el.innerHTML = state.templates.map(t => `
    <div class="card">
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <div class="text-sm font-bold text-slate-100 truncate">${t.name}</div>
          <div class="flex items-center gap-2 mt-1">
            ${channelBadge(t.channel)}
            <span class="text-xs text-slate-500">${msgTypeFmt(t.type)}</span>
          </div>
        </div>
        <div class="flex gap-1">
          <button onclick="toggleTemplate('${t.id}',${!t.isActive})" class="btn-sm text-xs py-1 px-2 ${t.isActive ? 'text-green-400' : 'text-slate-500'}">
            <i class="fas fa-${t.isActive ? 'toggle-on' : 'toggle-off'}"></i>
          </button>
        </div>
      </div>
      ${t.subject ? `<div class="text-xs text-slate-400 mb-1 font-medium">Subject: ${t.subject}</div>` : ''}
      <div class="tpl-preview">${t.body}</div>
    </div>`).join('')
}

async function toggleTemplate(id, isActive) {
  const res = await api(`/templates/${id}`, 'PATCH', { isActive })
  if (res.success) { toast(isActive ? 'Template activated' : 'Template deactivated', 'green'); loadTemplates() }
  else toast(res.error || 'Failed', 'red')
}

// ── AUTOMATION RULES TAB ──────────────────────────────────────────────────────
async function loadRules() {
  const res = await api('/rules')
  if (!res.success) return
  state.rules = res.data
  renderRules()
}

function renderRules() {
  const el = document.getElementById('rules-list')
  if (!el) return
  if (!state.rules.length) {
    el.innerHTML = '<div class="text-slate-500 text-xs text-center py-8">No automation rules</div>'
    return
  }
  el.innerHTML = state.rules.map(r => {
    const triggerStr = r.triggerValue < 0
      ? `${Math.abs(r.triggerValue)}h after (no-show check)`
      : `${r.triggerValue}h before`
    return `
      <div class="card flex items-center gap-4">
        <button onclick="toggleRule('${r.id}',${!r.isActive})" class="text-2xl ${r.isActive ? 'text-green-400' : 'text-slate-600'}" title="${r.isActive ? 'Active — click to disable' : 'Disabled — click to enable'}">
          <i class="fas fa-toggle-${r.isActive ? 'on' : 'off'}"></i>
        </button>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-sm font-bold text-slate-200">${r.name}</span>
            ${channelBadge(r.channel)}
            <span class="chip ch-pending">${msgTypeFmt(r.messageType)}</span>
          </div>
          <div class="text-xs text-slate-500 mt-1">
            Fires <strong class="text-slate-400">${triggerStr}</strong> appointment ·
            Template: <strong class="text-slate-400">${r.templateId}</strong>
            ${r.appointmentTypes.length ? ` · Types: ${r.appointmentTypes.join(', ')}` : ' · All appointment types'}
          </div>
        </div>
        <div class="${r.isActive ? 'text-green-500' : 'text-slate-600'} text-xs font-bold">${r.isActive ? 'ACTIVE' : 'DISABLED'}</div>
      </div>`
  }).join('')
}

async function toggleRule(id, isActive) {
  const res = await api(`/rules/${id}`, 'PATCH', { isActive })
  if (res.success) { toast(isActive ? 'Rule enabled' : 'Rule disabled', 'green'); loadRules() }
  else toast(res.error || 'Failed', 'red')
}

// ── MODALS ────────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id)?.classList.remove('hidden') }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden') }

function openSendModal() { openModal('modal-send') }
function openCampaignModal() {
  loadTemplates()
  openModal('modal-campaign')
}
function openTemplateModal() {
  document.getElementById('tpl-subject-group')?.classList.add('hidden')
  openModal('modal-template')
}

// Channel change → show/hide subject
document.addEventListener('change', e => {
  if (e.target.id === 'tpl-channel') {
    const g = document.getElementById('tpl-subject-group')
    if (g) g.classList.toggle('hidden', e.target.value === 'SMS')
  }
})

// Template body preview
function previewTpl() {
  const body = document.getElementById('tpl-body')?.value || ''
  const preview = body
    .replace(/\{\{patient_name\}\}/g, 'Jane Doe')
    .replace(/\{\{date\}\}/g, 'March 10, 2026')
    .replace(/\{\{time\}\}/g, '10:00 AM')
    .replace(/\{\{provider\}\}/g, 'Dr. Sarah Chen')
    .replace(/\{\{location\}\}/g, 'OculoFlow Eye Care, 100 Brickell Ave, Miami FL')
    .replace(/\{\{reason\}\}/g, 'Annual Eye Exam')
  const box = document.getElementById('tpl-preview-box')
  if (box) box.textContent = preview || 'Start typing to see preview…'
}

// ── Submit: Send Message ──────────────────────────────────────────────────────
async function submitSend() {
  const patientName = document.getElementById('snd-patient')?.value.trim()
  const patientId   = document.getElementById('snd-pid')?.value.trim() || ('pat-' + Date.now().toString(36))
  const phone       = document.getElementById('snd-phone')?.value.trim()
  const email       = document.getElementById('snd-email')?.value.trim()
  const channel     = document.getElementById('snd-channel')?.value
  const messageType = document.getElementById('snd-type')?.value
  const body        = document.getElementById('snd-body')?.value.trim()

  if (!patientName) { toast('Patient name is required', 'red'); return }
  if (!body)        { toast('Message body is required', 'red'); return }

  const payload = { patientId, patientName, channel, messageType, body }
  if (phone) payload.patientPhone = phone
  if (email) payload.patientEmail = email

  const res = await api('/messages/send', 'POST', payload)
  if (res.success) {
    toast(res.message || 'Message sent', 'green')
    closeModal('modal-send')
    if (state.currentTab === 'messages') loadMessages()
    loadDashboard()
  } else {
    toast(res.error || 'Failed to send', 'red')
  }
}

// ── Submit: New Campaign ──────────────────────────────────────────────────────
async function submitCampaign() {
  const name        = document.getElementById('cmp-name')?.value.trim()
  const description = document.getElementById('cmp-desc')?.value.trim()
  const channel     = document.getElementById('cmp-channel')?.value
  const messageType = document.getElementById('cmp-type')?.value
  const templateId  = document.getElementById('cmp-template')?.value
  const creator     = document.getElementById('cmp-creator')?.value.trim() || 'Staff'

  if (!name)       { toast('Campaign name is required', 'red'); return }
  if (!templateId) { toast('Please select a template', 'red'); return }

  const payload = {
    name, channel, messageType, templateId,
    description: description || undefined,
    createdById: 'staff-001', createdByName: creator,
    recipients: [],
  }

  const res = await api('/campaigns', 'POST', payload)
  if (res.success) {
    toast('Campaign created ✓', 'green')
    closeModal('modal-campaign')
    showTab('campaigns', document.getElementById('tab-btn-campaigns'))
    loadCampaigns()
  } else {
    toast(res.error || 'Failed', 'red')
  }
}

// ── Submit: New Template ──────────────────────────────────────────────────────
async function submitTemplate() {
  const name    = document.getElementById('tpl-name')?.value.trim()
  const type    = document.getElementById('tpl-type')?.value
  const channel = document.getElementById('tpl-channel')?.value
  const subject = document.getElementById('tpl-subject')?.value.trim()
  const body    = document.getElementById('tpl-body')?.value.trim()

  if (!name) { toast('Template name is required', 'red'); return }
  if (!body) { toast('Template body is required', 'red'); return }

  const payload = { name, type, channel, body, isActive: true }
  if (channel !== 'SMS' && subject) payload.subject = subject

  const res = await api('/templates', 'POST', payload)
  if (res.success) {
    toast('Template saved ✓', 'green')
    closeModal('modal-template')
    loadTemplates()
  } else {
    toast(res.error || 'Failed', 'red')
  }
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null
function toast(msg, type = 'green') {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.className = `fixed bottom-6 left-1/2 -translate-x-1/2 text-white text-sm px-5 py-2.5 rounded-xl shadow-2xl z-[300] ${
    type === 'green'  ? 'bg-emerald-800 border border-emerald-600' :
    type === 'red'    ? 'bg-red-900 border border-red-700' :
    type === 'yellow' ? 'bg-yellow-800 border border-yellow-600' :
    'bg-slate-800 border border-slate-600'
  }`
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500)
}

// Close modals on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden')
  }
})
