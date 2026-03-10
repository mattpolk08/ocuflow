// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 5A: Clinical Messaging & Task Board — Frontend JS
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/messaging'

// ── State ─────────────────────────────────────────────────────────────────────
let currentView   = 'inbox'
let currentItemId = null
let allItems      = []        // raw list from last API call
let staff         = []
let dashData      = null

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  setTodayDate()
  await Promise.all([loadDashboard(), loadStaff()])
  await setView('inbox')
})

function setTodayDate() {
  const d = document.getElementById('tk-due')
  if (d) d.value = new Date().toISOString().slice(0, 10)
}

// ── Dashboard & Stats ─────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const r = await fetch(`${API}/dashboard`)
    const { success, data } = await r.json()
    if (!success) return
    dashData = data

    setText('stat-unread',       data.unreadMessages)
    setText('stat-urgent-msg',   data.urgentMessages)
    setText('stat-open-tasks',   data.openTasks)
    setText('stat-overdue-tasks',data.overdueTasks)

    // badges
    setBadge('badge-inbox',   data.unreadMessages)
    setBadge('badge-urgent',  data.urgentMessages)
    setBadge('badge-tasks',   data.openTasks)
    setBadge('badge-overdue', data.overdueTasks)
    setBadge('badge-recalls', data.pendingRecalls)
  } catch {}
}

function setText(id, val) {
  const el = document.getElementById(id)
  if (el) el.textContent = val
}
function setBadge(id, count) {
  const el = document.getElementById(id)
  if (!el) return
  if (count > 0) { el.textContent = count; el.style.display = 'inline-flex' }
  else           { el.style.display = 'none' }
}

// ── Staff ─────────────────────────────────────────────────────────────────────
async function loadStaff() {
  try {
    const r = await fetch(`${API}/staff`)
    const { success, data } = await r.json()
    if (!success) return
    staff = data
    renderStaffList()
  } catch {}
}

function renderStaffList() {
  const el = document.getElementById('staff-list')
  if (!el) return
  el.innerHTML = staff.slice(0, 4).map(s => `
    <div class="flex items-center gap-2 px-2 py-1">
      <div class="avatar-xs" style="background:${s.color}">${initials(s.name)}</div>
      <span class="text-xs text-slate-300 truncate flex-1">${s.name.replace('Dr. ','')}</span>
      <span class="w-2 h-2 rounded-full ${s.isOnline ? 'bg-emerald-500' : 'bg-slate-600'}"></span>
    </div>`).join('')
}

function initials(name) {
  return name.split(' ').filter(w => /[A-Z]/.test(w[0])).map(w => w[0]).slice(0,2).join('')
}

// ── View switching ────────────────────────────────────────────────────────────
async function setView(view) {
  currentView   = view
  currentItemId = null

  // Update sidebar active state
  document.querySelectorAll('.side-btn').forEach(b => b.classList.remove('active'))
  const btn = document.getElementById(`view-${view}`)
  if (btn) btn.classList.add('active')

  clearRightPanel()
  await loadList(view)
}

async function loadList(view) {
  const listEl  = document.getElementById('item-list')
  const titleEl = document.getElementById('list-title')
  listEl.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin text-2xl opacity-40"></i></div>'

  try {
    let url, title, renderFn

    switch (view) {
      case 'inbox':
        url = `${API}/threads?archived=false`; title = 'All Messages'; renderFn = renderThreads; break
      case 'urgent':
        url = `${API}/threads?priority=STAT`; title = 'STAT Messages'; renderFn = renderThreads; break
      case 'patient':
        url = `${API}/threads?category=PATIENT_CARE`; title = 'Patient Care'; renderFn = renderThreads; break
      case 'referral':
        url = `${API}/threads?category=REFERRAL`; title = 'Referrals'; renderFn = renderThreads; break
      case 'billing-msg':
        url = `${API}/threads?category=BILLING`; title = 'Billing Messages'; renderFn = renderThreads; break
      case 'archived':
        url = `${API}/threads?archived=true`; title = 'Archived'; renderFn = renderThreads; break
      case 'tasks':
        url = `${API}/tasks`; title = 'All Tasks'; renderFn = renderTasks; break
      case 'my-tasks':
        url = `${API}/tasks`; title = 'My Tasks'; renderFn = renderTasks; break
      case 'overdue':
        url = `${API}/tasks`; title = 'Overdue Tasks'; renderFn = renderTasksOverdue; break
      case 'recalls':
        url = `${API}/recalls`; title = 'Recall List'; renderFn = renderRecalls; break
      default:
        url = `${API}/threads`; title = 'Messages'; renderFn = renderThreads
    }

    titleEl.textContent = title
    const r = await fetch(url)
    const { success, data } = await r.json()
    if (!success || !data) { listEl.innerHTML = '<div class="empty-state"><i class="fas fa-inbox"></i><span>No items found</span></div>'; return }

    allItems = Array.isArray(data) ? data : []

    if (view === 'overdue') {
      const today = new Date().toISOString().slice(0,10)
      allItems = allItems.filter(t => t.dueDate && t.dueDate < today && t.status !== 'DONE' && t.status !== 'CANCELLED')
    }

    renderFn(allItems, listEl)
    if (allItems.length === 0) listEl.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle text-emerald-500"></i><span>All clear!</span></div>'
  } catch (e) {
    listEl.innerHTML = `<div class="empty-state"><i class="fas fa-triangle-exclamation text-red-400"></i><span>Failed to load</span></div>`
  }
}

function refreshList() { loadList(currentView); loadDashboard() }

// ── Thread list render ─────────────────────────────────────────────────────────
function renderThreads(threads, container) {
  container.innerHTML = threads.map(t => `
    <div class="thread-item ${t.id === currentItemId ? 'active' : ''}" onclick="openThread('${t.id}')" id="thr-${t.id}">
      <div class="meta">
        <span class="priority-dot p-${t.priority}"></span>
        <span class="cat-tag cat-${t.category}">${fmtCat(t.category)}</span>
        ${t.isPinned ? '<i class="fas fa-thumbtack text-yellow-400 text-xs ml-auto"></i>' : ''}
        ${t.unreadCount > 0 ? `<span class="ml-auto unread-dot"></span>` : ''}
      </div>
      <div class="subject">${esc(t.subject)}</div>
      <div class="flex items-center gap-2 mt-1">
        <span class="preview flex-1">${esc(t.lastMessagePreview)}</span>
      </div>
      <div class="flex items-center gap-2 mt-1.5">
        <span class="text-[10px] text-slate-600">${relTime(t.lastMessageAt)}</span>
        ${t.patientName ? `<span class="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded"><i class="fas fa-user w-2.5"></i> ${esc(t.patientName)}</span>` : ''}
        ${t.unreadCount > 0 ? `<span class="ml-auto text-[10px] font-bold text-indigo-400">${t.unreadCount} unread</span>` : ''}
      </div>
    </div>`).join('')
}

// ── Task list render ──────────────────────────────────────────────────────────
function renderTasks(tasks, container) {
  renderTasksBase(tasks, container)
}
function renderTasksOverdue(tasks, container) {
  renderTasksBase(tasks, container)
}
function renderTasksBase(tasks, container) {
  const today = new Date().toISOString().slice(0,10)
  container.innerHTML = tasks.map(t => {
    const overdue = t.dueDate && t.dueDate < today && t.status !== 'DONE' && t.status !== 'CANCELLED'
    return `
    <div class="task-item ${t.id === currentItemId ? 'active' : ''}" onclick="openTask('${t.id}')" id="tsk-${t.id}">
      <div class="flex items-start gap-2 mb-2">
        <span class="priority-dot p-${t.priority} mt-1.5 flex-shrink-0"></span>
        <div class="title flex-1">${esc(t.title)}</div>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <span class="task-status s-${t.status}">${fmtStatus(t.status)}</span>
        <span class="cat-tag cat-${t.category}">${fmtCat(t.category)}</span>
        ${overdue ? '<span class="overdue-chip"><i class="fas fa-clock mr-0.5"></i>Overdue</span>' : ''}
      </div>
      <div class="flex items-center gap-2 mt-2">
        ${t.assignedToName ? `<span class="text-[10px] text-slate-500"><i class="fas fa-user w-2.5"></i> ${esc(t.assignedToName)}</span>` : ''}
        ${t.dueDate ? `<span class="text-[10px] ${overdue?'text-red-400':'text-slate-500'}"><i class="fas fa-calendar w-2.5"></i> ${t.dueDate}</span>` : ''}
        ${t.patientName ? `<span class="text-[10px] text-slate-500 ml-auto">${esc(t.patientName)}</span>` : ''}
      </div>
    </div>`
  }).join('')
}

// ── Recall list render ────────────────────────────────────────────────────────
function renderRecalls(recalls, container) {
  const today = new Date().toISOString().slice(0,10)
  container.innerHTML = recalls.map(r => {
    const overdue = r.dueDate < today && r.status !== 'SCHEDULED' && r.status !== 'DECLINED'
    return `
    <div class="recall-item ${r.id === currentItemId ? 'active' : ''}" onclick="openRecall('${r.id}')" id="rcl-${r.id}">
      <div class="flex items-center gap-2 mb-1">
        <span class="priority-dot p-${r.priority}"></span>
        <span class="text-xs font-semibold text-slate-200">${esc(r.patientName)}</span>
        <span class="recall-status rs-${r.status} ml-auto">${r.status}</span>
      </div>
      <div class="text-[11px] text-slate-400 mb-1"><i class="fas fa-stethoscope w-3.5 text-center mr-1"></i>${fmtReason(r.reason)}</div>
      <div class="flex items-center gap-2">
        <span class="text-[10px] ${overdue?'text-red-400':'text-slate-500'}"><i class="fas fa-calendar-days w-3 text-center"></i> Due ${r.dueDate}</span>
        ${r.assignedToName ? `<span class="text-[10px] text-slate-500 ml-auto"><i class="fas fa-user w-2.5"></i> ${esc(r.assignedToName)}</span>` : ''}
      </div>
    </div>`
  }).join('')
}

// ── Open Thread Detail ────────────────────────────────────────────────────────
async function openThread(threadId) {
  currentItemId = threadId
  highlightItem(`thr-${threadId}`, 'thread-item')

  const rp = document.getElementById('right-panel')
  rp.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin text-2xl opacity-40"></i></div>'

  try {
    const [trRes, msRes] = await Promise.all([
      fetch(`${API}/threads/${threadId}`),
      fetch(`${API}/threads/${threadId}/messages`),
    ])
    const { data: thread } = await trRes.json()
    const { data: messages } = await msRes.json()
    if (!thread) return

    rp.innerHTML = `
      <div class="detail-header">
        <div class="flex items-start gap-2 mb-2">
          <span class="priority-dot p-${thread.priority} mt-1.5 flex-shrink-0"></span>
          <h2 class="text-sm font-bold text-slate-100 flex-1 leading-snug">${esc(thread.subject)}</h2>
          <span class="badge badge-${thread.priority==='STAT'?'red':thread.priority==='URGENT'?'orange':'blue'}">${thread.priority}</span>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="cat-tag cat-${thread.category}">${fmtCat(thread.category)}</span>
          ${thread.patientName ? `<span class="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full"><i class="fas fa-user mr-1"></i>${esc(thread.patientName)}</span>` : ''}
          <span class="text-[10px] text-slate-500">${thread.messageCount} message${thread.messageCount!==1?'s':''}</span>
          <div class="ml-auto flex gap-1.5">
            ${thread.isPinned ? '<button onclick="togglePin(\''+threadId+'\',false)" class="btn-ghost py-1 text-yellow-400 border-yellow-500/30"><i class="fas fa-thumbtack"></i> Unpin</button>' : '<button onclick="togglePin(\''+threadId+'\',true)" class="btn-ghost py-1"><i class="fas fa-thumbtack"></i> Pin</button>'}
            ${thread.isArchived ? '<button onclick="toggleArchive(\''+threadId+'\',false)" class="btn-ghost py-1"><i class="fas fa-inbox"></i> Unarchive</button>' : '<button onclick="toggleArchive(\''+threadId+'\',true)" class="btn-ghost py-1"><i class="fas fa-archive"></i> Archive</button>'}
          </div>
        </div>
        <div class="flex flex-wrap gap-1 mt-2">
          ${(thread.participantNames || []).map((n,i) => `
            <span class="participant-chip">
              <span class="avatar-xs" style="background:${getStaffColor(thread.participantIds[i])}">${initials(n)}</span>
              ${n}
            </span>`).join('')}
        </div>
      </div>
      <div class="detail-content" id="msg-list" style="padding:12px 0;">
        ${(messages || []).map(m => `
          <div class="msg-bubble ${m.senderId === 'staff-001' ? 'own' : ''}">
            <div class="sender">
              <span class="avatar-xs mr-1" style="display:inline-flex;background:${getStaffColor(m.senderId)}">${initials(m.senderName)}</span>
              ${esc(m.senderName)}
              <span class="role-tag">${m.senderRole}</span>
              ${m.priority==='STAT' ? '<span class="badge badge-red ml-2">STAT</span>' : m.priority==='URGENT' ? '<span class="badge badge-orange ml-2">URGENT</span>' : ''}
            </div>
            <div class="body">${esc(m.body)}</div>
            <div class="ts">${fmtTime(m.createdAt)} ${m.isRead ? '• <span class="text-emerald-500">Read</span>' : '<span class="text-slate-600">Unread</span>'}</div>
          </div>`).join('')}
      </div>
      <div class="compose-bar">
        <textarea class="compose-input" id="reply-body" placeholder="Type a reply… (Ctrl+Enter to send)" onkeydown="handleReplyKey(event,'${threadId}')"></textarea>
        <div class="flex items-center gap-2 mt-2">
          <select id="reply-priority" class="form-input" style="width:auto;padding:5px 8px;font-size:11px;">
            <option value="NORMAL">Normal</option>
            <option value="URGENT">Urgent</option>
            <option value="STAT">STAT</option>
          </select>
          <div class="ml-auto flex gap-2">
            <button onclick="markRead('${threadId}')" class="btn-ghost py-1"><i class="fas fa-check-double"></i> Mark Read</button>
            <button onclick="sendReply('${threadId}')" class="btn-send"><i class="fas fa-paper-plane"></i> Send</button>
          </div>
        </div>
      </div>`

    // Scroll to bottom of messages
    const ml = document.getElementById('msg-list')
    if (ml) ml.scrollTop = ml.scrollHeight
  } catch(e) {
    rp.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation text-red-400"></i><span>Failed to load thread</span></div>'
  }
}

async function sendReply(threadId) {
  const body = document.getElementById('reply-body')?.value?.trim()
  const priority = document.getElementById('reply-priority')?.value
  if (!body) return showToast('Reply cannot be empty', 'error')

  try {
    const r = await fetch(`${API}/threads/${threadId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: 'staff-001', senderName: 'Dr. Sarah Chen', senderRole: 'OPTOMETRIST', body, priority }),
    })
    const { success } = await r.json()
    if (success) { showToast('Reply sent'); openThread(threadId); loadDashboard() }
    else showToast('Failed to send', 'error')
  } catch { showToast('Network error', 'error') }
}

function handleReplyKey(e, threadId) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); sendReply(threadId) }
}

async function markRead(threadId) {
  await fetch(`${API}/threads/${threadId}/read`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staffId: 'staff-001' }),
  })
  showToast('Marked as read')
  openThread(threadId)
  loadDashboard()
}

async function togglePin(threadId, pinned) {
  await fetch(`${API}/threads/${threadId}/pin`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pinned }),
  })
  showToast(pinned ? 'Thread pinned' : 'Thread unpinned')
  openThread(threadId); refreshList()
}

async function toggleArchive(threadId, archived) {
  await fetch(`${API}/threads/${threadId}/archive`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ archived }),
  })
  showToast(archived ? 'Thread archived' : 'Moved to inbox')
  clearRightPanel(); refreshList()
}

// ── Open Task Detail ──────────────────────────────────────────────────────────
async function openTask(taskId) {
  currentItemId = taskId
  highlightItem(`tsk-${taskId}`, 'task-item')

  const rp = document.getElementById('right-panel')
  rp.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin text-2xl opacity-40"></i></div>'

  try {
    const r = await fetch(`${API}/tasks/${taskId}`)
    const { data: task } = await r.json()
    if (!task) return

    const today = new Date().toISOString().slice(0,10)
    const overdue = task.dueDate && task.dueDate < today && task.status !== 'DONE' && task.status !== 'CANCELLED'

    rp.innerHTML = `
      <div class="detail-header">
        <div class="flex items-start gap-2 mb-2">
          <span class="priority-dot p-${task.priority} mt-1.5 flex-shrink-0"></span>
          <h2 class="text-sm font-bold text-slate-100 flex-1 leading-snug">${esc(task.title)}</h2>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <span class="task-status s-${task.status}">${fmtStatus(task.status)}</span>
          <span class="cat-tag cat-${task.category}">${fmtCat(task.category)}</span>
          <span class="badge badge-${task.priority==='URGENT'?'red':task.priority==='HIGH'?'orange':'blue'}">${task.priority}</span>
          ${overdue ? '<span class="overdue-chip"><i class="fas fa-clock mr-1"></i>Overdue</span>' : ''}
          <div class="ml-auto flex gap-1.5 flex-wrap">
            ${task.status !== 'DONE' ? `<button onclick="updateTaskStatus('${taskId}','IN_PROGRESS')" class="btn-ghost py-1"><i class="fas fa-play"></i> Start</button>
            <button onclick="updateTaskStatus('${taskId}','DONE')" class="btn-ghost py-1 text-emerald-400 border-emerald-500/30"><i class="fas fa-check"></i> Complete</button>` : ''}
            ${task.status === 'DONE' ? '<span class="text-xs text-emerald-400"><i class="fas fa-check-circle mr-1"></i>Completed</span>' : ''}
          </div>
        </div>
      </div>
      <div class="task-detail detail-content">
        ${task.description ? `<div class="task-field"><label>Description</label><div class="val text-slate-300">${esc(task.description)}</div></div>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="task-field"><label>Assigned To</label><div class="val">${task.assignedToName ? `<span class="participant-chip"><span class="avatar-xs mr-1" style="background:${getStaffColor(task.assignedToId)}">${initials(task.assignedToName)}</span>${esc(task.assignedToName)}</span>` : '—'}</div></div>
          <div class="task-field"><label>Created By</label><div class="val text-slate-300">${esc(task.assignedByName)}</div></div>
          ${task.patientName ? `<div class="task-field"><label>Patient</label><div class="val"><span class="text-indigo-300"><i class="fas fa-user mr-1"></i>${esc(task.patientName)}</span></div></div>` : ''}
          <div class="task-field"><label>Due Date</label><div class="val ${overdue?'text-red-400':'text-slate-300'}">${task.dueDate ? `${task.dueDate}${task.dueTime?' at '+task.dueTime:''}` : '—'}</div></div>
          <div class="task-field"><label>Created</label><div class="val text-slate-400 text-xs">${fmtTime(task.createdAt)}</div></div>
          <div class="task-field"><label>Updated</label><div class="val text-slate-400 text-xs">${fmtTime(task.updatedAt)}</div></div>
        </div>
        ${task.tags?.length ? `<div class="task-field"><label>Tags</label><div class="flex gap-1 flex-wrap">${task.tags.map(t=>`<span class="cat-tag cat-OTHER">${esc(t)}</span>`).join('')}</div></div>` : ''}

        <!-- Quick status change -->
        <div class="task-field">
          <label>Update Status</label>
          <div class="flex gap-2 flex-wrap">
            ${['OPEN','IN_PROGRESS','BLOCKED','DONE','CANCELLED'].map(s => `
              <button onclick="updateTaskStatus('${taskId}','${s}')" class="btn-ghost py-1 text-xs ${task.status===s?'border-indigo-500 text-indigo-300':''}">${fmtStatus(s)}</button>`).join('')}
          </div>
        </div>

        <!-- Comments -->
        <div class="task-field">
          <label>Comments (${task.comments?.length || 0})</label>
          <div class="comment-list">
            ${(task.comments || []).map(c => `
              <div class="comment-item">
                <div class="author">${esc(c.authorName)}</div>
                <div class="body">${esc(c.body)}</div>
                <div class="ts">${fmtTime(c.createdAt)}</div>
              </div>`).join('') || '<div class="text-xs text-slate-600 mb-3">No comments yet.</div>'}
          </div>
          <div class="flex gap-2 mt-2">
            <input class="form-input flex-1" id="comment-body" placeholder="Add a comment…" onkeydown="if(event.key==='Enter')addComment('${taskId}')">
            <button onclick="addComment('${taskId}')" class="btn-ghost py-1.5 px-3">Post</button>
          </div>
        </div>
      </div>`
  } catch {
    rp.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation text-red-400"></i><span>Failed to load task</span></div>'
  }
}

async function updateTaskStatus(taskId, status) {
  const r = await fetch(`${API}/tasks/${taskId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  const { success } = await r.json()
  if (success) { showToast(`Task marked ${fmtStatus(status)}`); openTask(taskId); refreshList(); loadDashboard() }
  else showToast('Update failed', 'error')
}

async function addComment(taskId) {
  const body = document.getElementById('comment-body')?.value?.trim()
  if (!body) return
  const r = await fetch(`${API}/tasks/${taskId}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorId: 'staff-001', authorName: 'Dr. Sarah Chen', body }),
  })
  const { success } = await r.json()
  if (success) { showToast('Comment added'); openTask(taskId) }
  else showToast('Failed to add comment', 'error')
}

// ── Open Recall Detail ────────────────────────────────────────────────────────
async function openRecall(recallId) {
  currentItemId = recallId
  highlightItem(`rcl-${recallId}`, 'recall-item')

  const rp = document.getElementById('right-panel')
  rp.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin text-2xl opacity-40"></i></div>'

  try {
    // Fetch full recalls list and find this one
    const r = await fetch(`${API}/recalls`)
    const { data: recalls } = await r.json()
    const recall = (recalls || []).find(rc => rc.id === recallId)
    if (!recall) return

    const today = new Date().toISOString().slice(0,10)
    const overdue = recall.dueDate < today && recall.status !== 'SCHEDULED' && recall.status !== 'DECLINED'

    rp.innerHTML = `
      <div class="detail-header">
        <div class="flex items-start gap-2 mb-2">
          <span class="priority-dot p-${recall.priority} mt-1.5 flex-shrink-0"></span>
          <h2 class="text-sm font-bold text-slate-100 flex-1">${esc(recall.patientName)}</h2>
          <span class="recall-status rs-${recall.status}">${recall.status}</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="cat-tag cat-RECALL">${fmtReason(recall.reason)}</span>
          ${overdue ? '<span class="overdue-chip"><i class="fas fa-clock mr-1"></i>Overdue</span>' : ''}
        </div>
      </div>
      <div class="recall-detail detail-content">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
          <div class="task-field"><label>Patient</label><div class="val text-indigo-300">${esc(recall.patientName)}</div></div>
          <div class="task-field"><label>Due Date</label><div class="val ${overdue?'text-red-400':'text-slate-300'}">${recall.dueDate}</div></div>
          <div class="task-field"><label>Phone</label><div class="val"><a href="tel:${recall.patientPhone}" class="text-indigo-300 hover:text-indigo-200">${esc(recall.patientPhone)}</a></div></div>
          <div class="task-field"><label>Email</label><div class="val"><a href="mailto:${recall.patientEmail}" class="text-indigo-300 hover:text-indigo-200 text-xs truncate block">${esc(recall.patientEmail)}</a></div></div>
          <div class="task-field"><label>Assigned To</label><div class="val text-slate-300">${recall.assignedToName || '—'}</div></div>
          <div class="task-field"><label>Last Contacted</label><div class="val text-slate-300">${recall.lastContactedAt ? fmtTime(recall.lastContactedAt) : '—'}</div></div>
        </div>
        ${recall.notes ? `<div class="task-field"><label>Notes</label><div class="val text-slate-300 bg-slate-800/50 rounded-lg p-3 text-sm">${esc(recall.notes)}</div></div>` : ''}
        <div class="task-field">
          <label>Update Status</label>
          <div class="flex gap-2 flex-wrap">
            ${['PENDING','CONTACTED','SCHEDULED','DECLINED','UNREACHABLE'].map(s => `
              <button onclick="updateRecallStatus('${recallId}','${s}')" class="btn-ghost py-1 text-xs ${recall.status===s?'border-indigo-500 text-indigo-300':''}">${s.replace('_',' ')}</button>`).join('')}
          </div>
        </div>
        <div class="task-field">
          <label>Log Contact Attempt</label>
          <div class="flex gap-2">
            <button onclick="logContact('${recallId}')" class="btn-ghost py-1.5"><i class="fas fa-phone mr-1"></i>Log Call</button>
            <button onclick="updateRecallStatus('${recallId}','CONTACTED')" class="btn-ghost py-1.5"><i class="fas fa-check mr-1"></i>Mark Contacted</button>
            <button onclick="updateRecallStatus('${recallId}','SCHEDULED')" class="btn-ghost py-1.5 text-emerald-400 border-emerald-500/30"><i class="fas fa-calendar-check mr-1"></i>Mark Scheduled</button>
          </div>
        </div>
      </div>`
  } catch {
    rp.innerHTML = '<div class="empty-state"><i class="fas fa-triangle-exclamation text-red-400"></i><span>Failed to load</span></div>'
  }
}

async function updateRecallStatus(recallId, status) {
  const patch = { status }
  if (status === 'CONTACTED') patch.lastContactedAt = new Date().toISOString()
  const r = await fetch(`${API}/recalls/${recallId}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  const { success } = await r.json()
  if (success) { showToast(`Recall updated: ${status}`); openRecall(recallId); refreshList(); loadDashboard() }
  else showToast('Update failed', 'error')
}

async function logContact(recallId) {
  await updateRecallStatus(recallId, 'CONTACTED')
}

// ── New Thread Modal ──────────────────────────────────────────────────────────
function openNewThreadModal() {
  document.getElementById('modal-thread').classList.remove('hidden')
}
async function submitNewThread() {
  const subject = document.getElementById('nt-subject').value.trim()
  const body    = document.getElementById('nt-body').value.trim()
  const sender  = document.getElementById('nt-sender').value.trim()
  if (!subject || !body || !sender) return showToast('Subject, sender and message are required', 'error')

  const patient = document.getElementById('nt-patient').value.trim()
  const r = await fetch(`${API}/threads`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject,
      category: document.getElementById('nt-category').value,
      priority: document.getElementById('nt-priority').value,
      participantIds: ['staff-001','staff-002'],
      participantNames: [sender, 'Dr. Raj Patel'],
      createdById: 'staff-001', createdByName: sender,
      body, senderRole: document.getElementById('nt-role').value,
      patientName: patient || undefined,
    }),
  })
  const { success, data } = await r.json()
  if (success) {
    showToast('Message sent')
    closeModal('modal-thread')
    clearForm('modal-thread')
    setView('inbox')
    setTimeout(() => openThread(data.id), 400)
  } else showToast('Failed to send', 'error')
}

// ── New Task Modal ────────────────────────────────────────────────────────────
function openNewTaskModal() {
  document.getElementById('modal-task').classList.remove('hidden')
}
async function submitNewTask() {
  const title   = document.getElementById('tk-title').value.trim()
  const creator = document.getElementById('tk-creator').value.trim()
  if (!title || !creator) return showToast('Title and creator are required', 'error')

  const r = await fetch(`${API}/tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      description:  document.getElementById('tk-desc').value.trim() || undefined,
      category:     document.getElementById('tk-category').value,
      priority:     document.getElementById('tk-priority').value,
      assignedToName: document.getElementById('tk-assignee').value.trim() || undefined,
      assignedById: 'staff-001', assignedByName: creator,
      patientName: document.getElementById('tk-patient').value.trim() || undefined,
      dueDate: document.getElementById('tk-due').value || undefined,
      status: 'OPEN', tags: [],
    }),
  })
  const { success, data } = await r.json()
  if (success) {
    showToast('Task created')
    closeModal('modal-task')
    clearForm('modal-task')
    setView('tasks')
    setTimeout(() => openTask(data.id), 400)
  } else showToast('Failed to create task', 'error')
}

// ── Search / filter ───────────────────────────────────────────────────────────
function filterList(query) {
  const q = query.toLowerCase()
  const container = document.getElementById('item-list')
  if (!q) { loadList(currentView); return }

  const filtered = allItems.filter(item => {
    const searchable = [
      item.subject, item.title, item.preview,
      item.patientName, item.lastMessagePreview,
      item.description, item.assignedToName,
    ].filter(Boolean).join(' ').toLowerCase()
    return searchable.includes(q)
  })

  if (['tasks','my-tasks','overdue'].includes(currentView)) renderTasksBase(filtered, container)
  else if (currentView === 'recalls') renderRecalls(filtered, container)
  else renderThreads(filtered, container)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function clearRightPanel() {
  document.getElementById('right-panel').innerHTML = `
    <div class="empty-state" id="empty-state">
      <i class="fas fa-comment-medical"></i>
      <span class="text-sm font-semibold text-slate-400">Select a thread or task</span>
      <span class="text-xs text-slate-600 text-center max-w-xs">Choose an item from the list to view details, reply, or update status.</span>
    </div>`
  currentItemId = null
}

function highlightItem(itemId, itemClass) {
  document.querySelectorAll(`.${itemClass}`).forEach(el => el.classList.remove('active'))
  const el = document.getElementById(itemId)
  if (el) el.classList.add('active')
}

function getStaffColor(id) {
  const s = staff.find(x => x.id === id)
  return s ? s.color : '#6366f1'
}

function esc(s) {
  if (!s) return ''
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function relTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h/24)}d ago`
}

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit', hour12:true })
}

function fmtCat(c) {
  return (c || '').replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())
}

function fmtStatus(s) {
  return (s || '').replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())
}

function fmtReason(r) {
  return (r || '').replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase())
}

function openModal(id)  { document.getElementById(id)?.classList.remove('hidden') }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden') }

function clearForm(modalId) {
  document.querySelectorAll(`#${modalId} input, #${modalId} textarea`).forEach(el => { el.value = '' })
  document.querySelectorAll(`#${modalId} select`).forEach(el => { el.selectedIndex = 0 })
}

let toastTimer
function showToast(msg, type = 'ok') {
  const el = document.getElementById('toast')
  if (!el) return
  el.textContent = msg
  el.style.background = type === 'error' ? '#7f1d1d' : '#1e293b'
  el.style.borderColor = type === 'error' ? '#991b1b' : '#475569'
  el.classList.remove('hidden')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3000)
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden') })
})
