// ─── Phase 8B – Prior Authorization Frontend ─────────────────────────────────
const API = '/api/pa';
let allRequests = [], currentPAId = null, activeFilter = 'ALL', statusChart, payerChart, svctypeChart;

// ── Auth fetch helper ─────────────────────────────────────────────────────────
function _authHdr(extra = {}) {
  const tok = sessionStorage.getItem('of_access_token');
  const h = { 'Content-Type': 'application/json', ...extra };
  if (tok) h['Authorization'] = `Bearer ${tok}`;
  return h;
}
async function apiFetch(url, opts = {}) {
  const r = await fetch(url, { ...opts, headers: _authHdr(opts.headers) });
  if (r.status === 401) { sessionStorage.clear(); location.href = '/login'; return { ok: false }; }
  return r;
}

// ── Status helpers ────────────────────────────────────────────────────────────
function statusBadge(s) {
  const map = {
    DRAFT:'badge-draft',SUBMITTED:'badge-submitted',PENDING_INFO:'badge-pending',
    UNDER_REVIEW:'badge-review',APPROVED:'badge-approved',DENIED:'badge-denied',
    APPEALED:'badge-appealed',APPEAL_APPROVED:'badge-approved',APPEAL_DENIED:'badge-denied',
    EXPIRED:'badge-expired',WITHDRAWN:'badge-withdrawn'
  };
  const labels = {PENDING_INFO:'Pending Info',UNDER_REVIEW:'Under Review',APPEAL_APPROVED:'Appeal Approved',APPEAL_DENIED:'Appeal Denied'};
  const cls = map[s]||'badge-draft';
  return `<span class="badge ${cls}">${labels[s]||s}</span>`;
}
function urgencyBadge(u) {
  const cls = u==='URGENT'?'badge-urgent':u==='EXPEDITED'?'badge-expedited':'badge-routine';
  return `<span class="badge ${cls}">${u}</span>`;
}
function fmt(iso) {
  if(!iso) return '–';
  return new Date(iso).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}
function daysUntil(iso) {
  if(!iso) return null;
  return Math.ceil((new Date(iso)-Date.now())/86400000);
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  await Promise.all([loadDashboard(), loadRequests(), loadCriteria()]);
  switchTab('dashboard');
  setupTabBar();
  setupFilters();
  document.getElementById('pa-search').addEventListener('input', renderSidebar);
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
function setupTabBar() {
  document.querySelectorAll('.tab-bar .tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}
function switchTab(tab) {
  document.querySelectorAll('.tab-bar .tab').forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
  ['dashboard','requests','criteria','analytics','settings'].forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if(el) el.style.display = t===tab?'block':'none';
  });
  if(tab==='analytics') renderAnalytics();
}

// ── Filters ───────────────────────────────────────────────────────────────────
function setupFilters() {
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeFilter = chip.dataset.filter;
      renderSidebar();
    });
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const res = await apiFetch(`${API}/dashboard`).then(r=>r.json()).catch(()=>null);
  if(!res?.success) return;
  const d = res.data;
  document.getElementById('kpi-active').textContent = d.totalActive;
  document.getElementById('kpi-pending').textContent = d.awaitingDecision;
  document.getElementById('kpi-draft').textContent = d.pendingSubmission;
  document.getElementById('kpi-approved').textContent = d.approved;
  document.getElementById('kpi-denied').textContent = d.denied;
  document.getElementById('kpi-appealed').textContent = d.appealed;
  document.getElementById('kpi-rate').textContent = Math.round(d.approvalRate*100)+'%';
  document.getElementById('kpi-turnaround').textContent = d.avgTurnaroundDays+'d';

  // Status chart
  const ctx = document.getElementById('status-chart');
  if(ctx) {
    if(statusChart) statusChart.destroy();
    statusChart = new Chart(ctx, {
      type:'doughnut',
      data:{
        labels:['Approved','Denied','Submitted','Pending Info','Appealed','Draft','Expired'],
        datasets:[{data:[d.approved,d.denied,d.awaitingDecision,
          (d.totalActive-d.awaitingDecision-d.appealed),d.appealed,d.pendingSubmission,0],
          backgroundColor:['#10b981','#ef4444','#3b82f6','#f59e0b','#fb923c','#64748b','#374151'],
          borderWidth:0}]
      },
      options:{responsive:true,plugins:{legend:{labels:{color:'#94a3b8',font:{size:11}}}}}
    });
  }

  // Expiring
  const expEl = document.getElementById('expiring-list');
  const exp = d.recentRequests.filter(r=>r.expiresAt&&r.status==='APPROVED');
  expEl.innerHTML = exp.length===0
    ? '<p style="color:var(--muted);font-size:.8rem">No authorizations expiring soon</p>'
    : exp.map(r=>{
        const days = daysUntil(r.expiresAt);
        const color = days<=7?'var(--red)':days<=14?'var(--yellow)':'var(--green)';
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:.8rem;font-weight:600">${r.patientName}</div>
            <div style="font-size:.7rem;color:var(--muted)">${r.serviceCode} · Auth ${r.authNumber||'–'}</div>
          </div>
          <span style="font-size:.75rem;font-weight:700;color:${color}">${days}d</span>
        </div>`;
      }).join('');

  // Recent requests
  const rr = document.getElementById('recent-requests');
  rr.innerHTML = d.recentRequests.map(r=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:.625rem 0;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:.82rem;font-weight:600">${r.patientName}</div>
        <div style="font-size:.72rem;color:var(--muted)">${r.serviceDescription.slice(0,60)}${r.serviceDescription.length>60?'…':''}</div>
      </div>
      <div style="display:flex;gap:.4rem;align-items:center">
        ${statusBadge(r.status)}
        ${urgencyBadge(r.urgency)}
      </div>
    </div>`).join('');
}

// ── Requests List ─────────────────────────────────────────────────────────────
async function loadRequests() {
  const res = await apiFetch(`${API}/requests`).then(r=>r.json()).catch(()=>null);
  if(!res?.success) return;
  allRequests = res.data.requests||[];
  renderSidebar();
}

function renderSidebar() {
  const search = document.getElementById('pa-search').value.toLowerCase();
  const filtered = allRequests.filter(r=>{
    if(activeFilter!=='ALL'&&r.status!==activeFilter) return false;
    if(search&&!r.patientName.toLowerCase().includes(search)&&!r.serviceCode.toLowerCase().includes(search)&&!r.serviceDescription.toLowerCase().includes(search)) return false;
    return true;
  });
  const list = document.getElementById('pa-list');
  if(!filtered.length) {
    list.innerHTML = '<div class="empty-state" style="padding:2rem"><i class="fas fa-search" style="display:block;font-size:1.5rem;opacity:.3;margin-bottom:.5rem"></i>No results</div>';
    return;
  }
  list.innerHTML = filtered.map(r=>`
    <div class="pa-item${r.id===currentPAId?' selected':''}" onclick="selectPA('${r.id}')">
      <div style="width:2.2rem;height:2.2rem;border-radius:.5rem;background:rgba(99,102,241,.15);display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <i class="fas fa-${r.serviceType==='DRUG'?'prescription-bottle':r.serviceType==='PROCEDURE'?'procedures':r.serviceType==='IMAGING'?'x-ray':'clipboard-list'} text-indigo-400" style="font-size:.8rem"></i>
      </div>
      <div class="pa-item-body">
        <div class="pa-item-patient">${r.patientName}</div>
        <div class="pa-item-svc">${r.serviceCode} · ${r.payerName}</div>
        <div class="pa-item-meta">
          ${statusBadge(r.status)}
          ${urgencyBadge(r.urgency)}
        </div>
      </div>
    </div>`).join('');
}

async function selectPA(id) {
  currentPAId = id;
  renderSidebar();
  switchTab('requests');
  const res = await apiFetch(`${API}/requests/${id}`).then(r=>r.json()).catch(()=>null);
  if(!res?.success) return;
  renderPADetail(res.data);
}

function renderPADetail(r) {
  const panel = document.getElementById('pa-detail-panel');
  const authRow = r.authNumber?`<div class="field"><div class="field-label">Auth Number</div><div class="field-value text-green-400 font-bold">${r.authNumber}</div></div>`:'';
  const decisionRow = r.decisionReason?`<div class="field"><div class="field-label">Decision Reason</div><div class="field-value">${r.decisionReason.replace(/_/g,' ')}</div></div>`:'';
  const expiryRow = r.expiresAt?`<div class="field"><div class="field-label">Expires</div><div class="field-value ${daysUntil(r.expiresAt)<=30?'text-yellow-400':''}">${fmt(r.expiresAt)} (${daysUntil(r.expiresAt)}d)</div></div>`:'';

  // Action buttons
  let actions = '';
  if(r.status==='DRAFT') actions += `<button class="btn btn-primary" onclick="updateStatus('${r.id}','SUBMITTED')"><i class="fas fa-paper-plane"></i> Submit PA</button>`;
  if(r.status==='SUBMITTED'||r.status==='UNDER_REVIEW') actions += `<button class="btn btn-warning" onclick="updateStatus('${r.id}','PENDING_INFO')"><i class="fas fa-question-circle"></i> Mark Pending Info</button>`;
  if(['SUBMITTED','UNDER_REVIEW','PENDING_INFO'].includes(r.status)) {
    actions += `<button class="btn btn-success" onclick="updateStatus('${r.id}','APPROVED')"><i class="fas fa-check"></i> Approve</button>`;
    actions += `<button class="btn btn-danger" onclick="updateStatus('${r.id}','DENIED')"><i class="fas fa-times"></i> Deny</button>`;
  }
  if(r.status==='DENIED'&&!r.appeal) actions += `<button class="btn btn-warning" onclick="openAppeal('${r.id}')"><i class="fas fa-balance-scale"></i> File Appeal</button>`;
  if(['DENIED','PENDING_INFO'].includes(r.status)) actions += `<button class="btn btn-ghost" onclick="openP2P('${r.id}')"><i class="fas fa-phone-alt"></i> P2P Request</button>`;
  actions += `<button class="btn btn-ghost" onclick="openDoc('${r.id}')"><i class="fas fa-file-upload"></i> Add Doc</button>`;
  actions += `<button class="btn btn-ghost" onclick="openNote('${r.id}')"><i class="fas fa-sticky-note"></i> Add Note</button>`;

  // Documents
  const docs = r.documents.length===0
    ? '<p style="color:var(--muted);font-size:.8rem;padding:.5rem 0">No documents attached</p>'
    : r.documents.map(d=>`
        <div class="doc-item">
          <div class="doc-icon"><i class="fas fa-file-pdf text-red-400" style="font-size:.8rem"></i></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:.8rem;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.name}</div>
            <div style="font-size:.7rem;color:var(--muted)">${d.type.replace(/_/g,' ')} · ${d.sizeKb}KB · ${fmt(d.uploadedAt)}</div>
          </div>
        </div>`).join('');

  // Notes
  const notes = r.notes.length===0
    ? '<p style="color:var(--muted);font-size:.8rem;padding:.5rem 0">No notes</p>'
    : r.notes.map(n=>`
        <div class="note-item ${n.isInternal?'':'external'}">
          <div style="display:flex;justify-content:space-between;margin-bottom:.3rem">
            <span style="font-size:.75rem;font-weight:600">${n.authorName} <span style="color:var(--muted);font-weight:400">(${n.authorRole})</span></span>
            <span style="font-size:.7rem;color:var(--muted)">${fmt(n.createdAt)} ${n.isInternal?'<span style="color:var(--muted);font-size:.65rem">Internal</span>':'<span style="color:var(--green);font-size:.65rem">External</span>'}</span>
          </div>
          <div style="font-size:.8rem;color:#e2e8f0">${n.content}</div>
        </div>`).join('');

  // History
  const history = r.statusHistory.map(h=>`
    <div class="history-item">
      <div class="history-dot ${h.status.toLowerCase()}"></div>
      <div>
        <div style="font-size:.78rem;font-weight:600">${statusBadge(h.status)} <span style="color:var(--muted);font-weight:400;font-size:.72rem">by ${h.changedBy}</span></div>
        <div style="font-size:.7rem;color:var(--muted)">${fmt(h.changedAt)}${h.note?` · ${h.note}`:''}</div>
      </div>
    </div>`).join('');

  // Appeal block
  let appealBlock = '';
  if(r.appeal) {
    appealBlock = `<div class="card" style="border-color:rgba(251,146,60,.3);margin-bottom:1rem">
      <div class="section-title" style="color:var(--yellow)">Appeal Filed</div>
      <div class="field-grid">
        <div class="field"><div class="field-label">Type</div><div class="field-value">${r.appeal.appealType.replace(/_/g,' ')}</div></div>
        <div class="field"><div class="field-label">Deadline</div><div class="field-value">${fmt(r.appeal.deadline)}</div></div>
        <div class="field"><div class="field-label">Outcome</div><div class="field-value">${r.appeal.outcome||'PENDING'}</div></div>
        <div class="field"><div class="field-label">Submitted</div><div class="field-value">${fmt(r.appeal.submittedAt)}</div></div>
      </div>
      <div style="font-size:.8rem;color:#e2e8f0;margin-top:.5rem;padding:.625rem;background:rgba(0,0,0,.2);border-radius:.375rem">${r.appeal.reason}</div>
    </div>`;
  }

  // P2P block
  let p2pBlock = '';
  if(r.peerToPeer) {
    p2pBlock = `<div class="card" style="border-color:rgba(59,130,246,.3);margin-bottom:1rem">
      <div class="section-title" style="color:var(--blue)">Peer-to-Peer Request</div>
      <div class="field-grid">
        <div class="field"><div class="field-label">Physician</div><div class="field-value">${r.peerToPeer.physicianName}</div></div>
        <div class="field"><div class="field-label">Scheduled</div><div class="field-value">${r.peerToPeer.scheduledAt?fmt(r.peerToPeer.scheduledAt):'TBD'}</div></div>
        <div class="field"><div class="field-label">Outcome</div><div class="field-value">${r.peerToPeer.outcome||'PENDING'}</div></div>
      </div>
    </div>`;
  }

  panel.innerHTML = `
    <div class="detail-header">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap">
        <div>
          <h2 style="font-size:1.1rem;font-weight:700;color:#fff">${r.patientName}</h2>
          <div style="font-size:.8rem;color:var(--muted);margin-top:.2rem">${r.serviceDescription}</div>
        </div>
        <div style="display:flex;gap:.4rem;flex-wrap:wrap">
          ${statusBadge(r.status)} ${urgencyBadge(r.urgency)}
        </div>
      </div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.875rem">
        ${actions}
      </div>
    </div>

    ${r.status==='DENIED'&&!r.appeal?`<div style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2);border-radius:.625rem;padding:.875rem 1rem;margin-bottom:1rem;font-size:.82rem;color:#f87171">
      <i class="fas fa-exclamation-triangle mr-2"></i><strong>Denied:</strong> ${r.decisionNotes||'No reason provided.'}
    </div>`:''}
    ${r.status==='PENDING_INFO'?`<div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);border-radius:.625rem;padding:.875rem 1rem;margin-bottom:1rem;font-size:.82rem;color:#fbbf24">
      <i class="fas fa-info-circle mr-2"></i><strong>Additional Info Requested:</strong> ${r.decisionNotes||'Payer has requested additional documentation.'}
    </div>`:''}

    ${appealBlock}${p2pBlock}

    <div class="card" style="margin-bottom:1rem">
      <div class="section-title">Request Details</div>
      <div class="field-grid">
        <div class="field"><div class="field-label">PA ID</div><div class="field-value" style="font-family:monospace;font-size:.78rem">${r.id}</div></div>
        <div class="field"><div class="field-label">Service Code</div><div class="field-value font-mono">${r.serviceCode}</div></div>
        <div class="field"><div class="field-label">Service Type</div><div class="field-value">${r.serviceType}</div></div>
        <div class="field"><div class="field-label">Payer</div><div class="field-value">${r.payerName}</div></div>
        <div class="field"><div class="field-label">Member ID</div><div class="field-value">${r.memberId}</div></div>
        <div class="field"><div class="field-label">Provider</div><div class="field-value">${r.providerName}</div></div>
        <div class="field"><div class="field-label">ICD-10 Codes</div><div class="field-value">${r.icdCodes.join(', ')||'–'}</div></div>
        <div class="field"><div class="field-label">Submitted</div><div class="field-value">${fmt(r.submittedAt)}</div></div>
        <div class="field"><div class="field-label">Decision Date</div><div class="field-value">${fmt(r.decisionDate)}</div></div>
        ${authRow}${expiryRow}${decisionRow}
      </div>
      ${r.decisionNotes?`<div style="background:rgba(0,0,0,.2);border-radius:.375rem;padding:.625rem .875rem;font-size:.8rem;color:#e2e8f0;margin-top:.75rem"><span style="color:var(--muted);font-size:.7rem;font-weight:600;text-transform:uppercase">Decision Notes</span><br>${r.decisionNotes}</div>`:''}
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div class="card">
        <div class="section-title" style="display:flex;justify-content:space-between">
          <span>Documents (${r.documents.length})</span>
          <button class="btn btn-ghost" style="padding:.2rem .5rem;font-size:.68rem" onclick="openDoc('${r.id}')"><i class="fas fa-plus"></i></button>
        </div>
        ${docs}
      </div>
      <div class="card">
        <div class="section-title" style="display:flex;justify-content:space-between">
          <span>Notes (${r.notes.length})</span>
          <button class="btn btn-ghost" style="padding:.2rem .5rem;font-size:.68rem" onclick="openNote('${r.id}')"><i class="fas fa-plus"></i></button>
        </div>
        ${notes}
      </div>
    </div>

    <div class="card">
      <div class="section-title">Status History</div>
      ${history}
    </div>
  `;
}

// ── Status Update ─────────────────────────────────────────────────────────────
async function updateStatus(id, status) {
  const authNumber = status==='APPROVED' ? prompt('Enter Auth Number (or leave blank):') || undefined : undefined;
  const res = await apiFetch(`${API}/requests/${id}/status`, {
    method:'PATCH',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ status, changedBy:'Staff', authNumber })
  }).then(r=>r.json()).catch(()=>null);
  if(res?.success) { await loadRequests(); await loadDashboard(); renderPADetail(res.data); }
  else alert('Failed to update status: '+(res?.error||'Unknown error'));
}

// ── New PA ────────────────────────────────────────────────────────────────────
function openNewPA() { document.getElementById('new-pa-modal').style.display='flex'; }
async function submitNewPA() {
  const body = {
    patientId: document.getElementById('np-patient-id').value.trim(),
    patientName: document.getElementById('np-patient-name').value.trim(),
    payerName: document.getElementById('np-payer-name').value.trim(),
    payerId: document.getElementById('np-payer-id').value.trim(),
    insurancePlan: document.getElementById('np-plan').value.trim(),
    memberId: document.getElementById('np-member-id').value.trim(),
    providerName: document.getElementById('np-prov-name').value.trim(),
    providerId: document.getElementById('np-prov-id').value.trim(),
    serviceCode: document.getElementById('np-code').value.trim(),
    serviceDescription: document.getElementById('np-desc').value.trim(),
    serviceType: document.getElementById('np-svc-type').value,
    urgency: document.getElementById('np-urgency').value,
    icdCodes: document.getElementById('np-icd').value.split(',').map(s=>s.trim()).filter(Boolean),
    groupNumber: '', patientDob: '', providerNpi: '',
  };
  if(!body.patientId||!body.patientName||!body.serviceCode||!body.serviceDescription||!body.payerId||!body.payerName||!body.providerId||!body.providerName) {
    alert('Please fill in all required fields.'); return;
  }
  const res = await apiFetch(`${API}/requests`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  if(res.success) {
    closeModal('new-pa-modal');
    await loadRequests(); await loadDashboard();
    selectPA(res.data.id);
  } else alert('Error: '+res.error);
}

// ── Appeal ────────────────────────────────────────────────────────────────────
function openAppeal(id) {
  document.getElementById('appeal-pa-id').value = id;
  const d = new Date(); d.setDate(d.getDate()+30);
  document.getElementById('appeal-deadline').value = d.toISOString().split('T')[0];
  document.getElementById('appeal-modal').style.display='flex';
}
async function submitAppeal() {
  const id = document.getElementById('appeal-pa-id').value;
  const body = {
    appealType: document.getElementById('appeal-type').value,
    reason: document.getElementById('appeal-reason').value.trim(),
    deadline: document.getElementById('appeal-deadline').value,
  };
  if(!body.reason||!body.deadline) { alert('Reason and deadline are required.'); return; }
  const res = await apiFetch(`${API}/requests/${id}/appeal`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  if(res.success) { closeModal('appeal-modal'); await loadRequests(); await loadDashboard(); renderPADetail(res.data); }
  else alert('Error: '+res.error);
}

// ── Peer-to-Peer ──────────────────────────────────────────────────────────────
function openP2P(id) { document.getElementById('p2p-pa-id').value=id; document.getElementById('p2p-modal').style.display='flex'; }
async function submitP2P() {
  const id = document.getElementById('p2p-pa-id').value;
  const body = {
    physicianName: document.getElementById('p2p-physician').value.trim(),
    scheduledAt: document.getElementById('p2p-scheduled').value||undefined,
    notes: document.getElementById('p2p-notes').value.trim()||undefined,
  };
  if(!body.physicianName) { alert('Physician name required.'); return; }
  const res = await apiFetch(`${API}/requests/${id}/peer-to-peer`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  if(res.success) { closeModal('p2p-modal'); renderPADetail(res.data); }
  else alert('Error: '+res.error);
}

// ── Document ──────────────────────────────────────────────────────────────────
function openDoc(id) { document.getElementById('doc-pa-id').value=id; document.getElementById('doc-modal').style.display='flex'; }
async function submitDocument() {
  const id = document.getElementById('doc-pa-id').value;
  const body = {
    type: document.getElementById('doc-type').value,
    name: document.getElementById('doc-name').value.trim(),
    uploadedBy: document.getElementById('doc-by').value.trim(),
    sizeKb: Math.floor(Math.random()*500+50),
  };
  if(!body.name||!body.uploadedBy) { alert('Name and uploader required.'); return; }
  const res = await apiFetch(`${API}/requests/${id}/documents`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  if(res.success) { closeModal('doc-modal'); renderPADetail(res.data); }
  else alert('Error: '+res.error);
}

// ── Note ──────────────────────────────────────────────────────────────────────
function openNote(id) { document.getElementById('note-pa-id').value=id; document.getElementById('note-modal').style.display='flex'; }
async function submitNote() {
  const id = document.getElementById('note-pa-id').value;
  const body = {
    authorId:'staff-001', authorName:'Staff User', authorRole:'Practice Administrator',
    content: document.getElementById('note-content').value.trim(),
    isInternal: document.getElementById('note-internal').checked,
  };
  if(!body.content) { alert('Note content required.'); return; }
  const res = await apiFetch(`${API}/requests/${id}/notes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.json());
  if(res.success) { closeModal('note-modal'); renderPADetail(res.data); }
  else alert('Error: '+res.error);
}

// ── Criteria ──────────────────────────────────────────────────────────────────
async function loadCriteria() {
  const [criRes, payRes] = await Promise.all([
    fetch(`${API}/criteria`).then(r=>r.json()),
    fetch(`${API}/payers`).then(r=>r.json()),
  ]);
  const criteria = criRes.data?.criteria||[];
  const payers = payRes.data||[];

  // Populate payer select
  const payerSel = document.getElementById('criteria-payer');
  payers.forEach(p=>{ const o=document.createElement('option'); o.value=p.id; o.textContent=p.name; payerSel.appendChild(o); });

  // Populate code select
  const codeSel = document.getElementById('criteria-code');
  const codes = [...new Set(criteria.map(c=>c.serviceCode))];
  codes.forEach(code=>{ const o=document.createElement('option'); o.value=code; o.textContent=code; codeSel.appendChild(o); });

  renderCriteria(criteria);
}

async function filterCriteria() {
  const payerId = document.getElementById('criteria-payer').value;
  const serviceCode = document.getElementById('criteria-code').value;
  const params = new URLSearchParams();
  if(payerId) params.set('payerId',payerId);
  if(serviceCode) params.set('serviceCode',serviceCode);
  const res = await apiFetch(`${API}/criteria?${params}`).then(r=>r.json());
  renderCriteria(res.data?.criteria||[]);
}

function renderCriteria(criteria) {
  const el = document.getElementById('criteria-list');
  if(!criteria.length) { el.innerHTML='<div class="empty-state">No criteria found for selected filters</div>'; return; }
  el.innerHTML = criteria.map(c=>`
    <div class="criteria-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem">
        <div>
          <div style="font-size:.88rem;font-weight:700;color:#fff">${c.serviceDescription}</div>
          <div style="font-size:.75rem;color:var(--muted);margin-top:.15rem">${c.payerName} · Code: <span style="font-family:monospace;color:var(--accent)">${c.serviceCode}</span></div>
        </div>
        <div style="display:flex;gap:.4rem">
          <span class="badge ${c.requiresPA?'badge-pending':'badge-approved'}">${c.requiresPA?'PA Required':'No PA Required'}</span>
        </div>
      </div>
      ${c.stepTherapyRequired?`<div class="step-therapy">
        <div style="font-size:.75rem;font-weight:700;color:var(--yellow);margin-bottom:.35rem"><i class="fas fa-exclamation-triangle mr-1"></i>Step Therapy Required</div>
        <div style="font-size:.78rem;color:#e2e8f0">Required prior therapies: ${(c.stepTherapyDrugs||[]).join(', ')}</div>
      </div>`:''}
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.75rem;margin-top:.75rem">
        <div class="field"><div class="field-label">Typical Turnaround</div><div class="field-value">${c.typicalTurnaround}</div></div>
        <div class="field"><div class="field-label">Urgent Turnaround</div><div class="field-value">${c.urgentTurnaround}</div></div>
        <div class="field"><div class="field-label">Required Docs</div><div class="field-value">${c.documentationRequired.length||'None'}</div></div>
      </div>
      ${c.documentationRequired.length?`<div style="display:flex;flex-wrap:wrap;gap:.3rem;margin-top:.5rem">${c.documentationRequired.map(d=>`<span class="badge badge-submitted">${d.replace(/_/g,' ')}</span>`).join('')}</div>`:''}
      ${c.notes?`<div style="font-size:.78rem;color:var(--muted);margin-top:.625rem;padding:.5rem;background:rgba(0,0,0,.2);border-radius:.375rem"><i class="fas fa-info-circle mr-1"></i>${c.notes}</div>`:''}
    </div>`).join('');
}

// ── Analytics ─────────────────────────────────────────────────────────────────
function renderAnalytics() {
  const payers = {};
  const svctypes = {};
  allRequests.forEach(r=>{
    if(!payers[r.payerName]) payers[r.payerName]={approved:0,total:0};
    payers[r.payerName].total++;
    if(r.status==='APPROVED'||r.status==='APPEAL_APPROVED') payers[r.payerName].approvedFound=true;
    if(r.status==='APPROVED') payers[r.payerName].approved++;

    svctypes[r.serviceType]=(svctypes[r.serviceType]||0)+1;
  });

  const payerCtx = document.getElementById('payer-chart');
  if(payerCtx) {
    if(payerChart) payerChart.destroy();
    const labels = Object.keys(payers);
    payerChart = new Chart(payerCtx,{
      type:'bar',
      data:{labels,datasets:[
        {label:'Approved',data:labels.map(l=>payers[l].approved),backgroundColor:'#10b981'},
        {label:'Total',data:labels.map(l=>payers[l].total),backgroundColor:'rgba(99,102,241,.4)'},
      ]},
      options:{responsive:true,plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}}},scales:{x:{ticks:{color:'#64748b',font:{size:10}}},y:{ticks:{color:'#64748b',font:{size:10}}}}}
    });
  }

  const svcCtx = document.getElementById('svctype-chart');
  if(svcCtx) {
    if(svctypeChart) svctypeChart.destroy();
    const labels = Object.keys(svctypes);
    svctypeChart = new Chart(svcCtx,{
      type:'doughnut',
      data:{labels,datasets:[{data:labels.map(l=>svctypes[l]),backgroundColor:['#6366f1','#8b5cf6','#3b82f6','#10b981','#f59e0b','#ef4444'],borderWidth:0}]},
      options:{responsive:true,plugins:{legend:{labels:{color:'#94a3b8',font:{size:10}}}}}
    });
  }

  const tbl = document.getElementById('analytics-table');
  const statuses = [...new Set(allRequests.map(r=>r.status))];
  tbl.innerHTML=`<table style="width:100%;border-collapse:collapse;font-size:.8rem">
    <thead><tr>${['Status','Count','Avg Days to Submit','Has Auth'].map(h=>`<th style="padding:.5rem .75rem;text-align:left;color:var(--muted);font-size:.7rem;border-bottom:1px solid var(--border)">${h}</th>`).join('')}</tr></thead>
    <tbody>${statuses.map(s=>{
      const rows = allRequests.filter(r=>r.status===s);
      const withAuth = rows.filter(r=>r.authNumber).length;
      return `<tr><td style="padding:.5rem .75rem;border-bottom:1px solid var(--border)">${statusBadge(s)}</td>
        <td style="padding:.5rem .75rem;border-bottom:1px solid var(--border);font-weight:600">${rows.length}</td>
        <td style="padding:.5rem .75rem;border-bottom:1px solid var(--border);color:var(--muted)">–</td>
        <td style="padding:.5rem .75rem;border-bottom:1px solid var(--border);color:${withAuth?'var(--green)':'var(--muted)'}">${withAuth}/${rows.length}</td></tr>`;
    }).join('')}</tbody></table>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).style.display='none'; }
document.addEventListener('keydown', e => { if(e.key==='Escape') document.querySelectorAll('.modal-bg').forEach(m=>m.style.display='none'); });

init();
