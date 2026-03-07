// Phase 9A – Revenue Cycle Management frontend
const API = '/api/rcm';
let allClaims = [];
let allStatuses = [];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt$ = n => '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = s => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

function statusBadge(s) {
  const m = {
    PAID: 'paid', PENDING: 'pending', DENIED: 'denied', DRAFT: 'draft',
    SUBMITTED: 'submitted', ACKNOWLEDGED: 'submitted', APPEALED: 'appealed',
    APPEAL_APPROVED: 'paid', APPEAL_DENIED: 'denied',
    PARTIAL_PAYMENT: 'partial', READY_TO_SUBMIT: 'ready',
    WRITTEN_OFF: 'written', VOIDED: 'voided', UNDER_REVIEW: 'pending',
  };
  return `<span class="badge badge-${m[s] || 'draft'}">${s?.replace(/_/g,' ')}</span>`;
}
function eraBadge(s) {
  const m = { RECEIVED: 'pending', POSTED: 'paid', EXCEPTIONS: 'denied' };
  return `<span class="badge badge-${m[s] || 'draft'}">${s}</span>`;
}
function stmtBadge(s) {
  const m = { DRAFT: 'draft', SENT: 'submitted', VIEWED: 'ready', PAID: 'paid', OVERDUE: 'denied' };
  return `<span class="badge badge-${m[s] || 'draft'}">${s}</span>`;
}
function planBadge(s) {
  const m = { ACTIVE: 'ready', COMPLETED: 'paid', DEFAULTED: 'denied', CANCELLED: 'written' };
  return `<span class="badge badge-${m[s] || 'draft'}">${s}</span>`;
}

function switchTab(name, btn) {
  document.querySelectorAll('[id^=tab-]').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  $('tab-' + name).classList.remove('hidden');
  btn.classList.add('active');
  if (name === 'claims') loadClaims();
  if (name === 'remittance') loadERAs();
  if (name === 'statements') loadStatements();
  if (name === 'plans') loadPlans();
}

function openModal(id) { $(id).classList.remove('hidden'); }
function closeModal(id) { $(id).classList.add('hidden'); }

// ─── Overview ─────────────────────────────────────────────────────────────────
async function loadOverview() {
  const r = await fetch(`${API}/dashboard`);
  const { data: d } = await r.json();
  if (!d) return;

  $('kpi-charges').textContent = fmt$(d.totalCharges);
  $('kpi-collected').textContent = fmt$(d.totalCollected);
  $('kpi-outstanding').textContent = fmt$(d.totalOutstanding);
  $('kpi-collection-rate').textContent = d.collectionRate + '%';
  $('kpi-clean-rate').textContent = d.cleanClaimRate + '%';
  $('kpi-denial-rate').textContent = d.denialRate + '%';
  $('kpi-avg-days').textContent = d.avgDaysToPayment + ' days';
  $('kpi-inflight').textContent = d.claimsInFlight;

  const agingLabels = { CURRENT: 'Current', '1_30': '1–30 days', '31_60': '31–60 days', '61_90': '61–90 days', '91_120': '91–120 days', OVER_120: '120+ days' };
  const maxAmt = Math.max(...d.agingBuckets.map(b => b.amount), 1);
  $('aging-buckets').innerHTML = d.agingBuckets.map(b => `
    <div>
      <div class="flex justify-between text-xs mb-1">
        <span class="text-slate-300">${agingLabels[b.bucket] || b.bucket}</span>
        <span class="text-slate-400">${b.count} claims · ${fmt$(b.amount)}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.round(b.amount/maxAmt*100)}%"></div></div>
    </div>
  `).join('');

  $('denial-reasons').innerHTML = d.topDenialReasons.length
    ? d.topDenialReasons.map(dr => `
        <div class="flex items-center justify-between text-sm">
          <span class="text-slate-300">${dr.reason.replace(/_/g,' ')}</span>
          <div class="flex items-center gap-3">
            <span class="text-red-400 font-semibold">${dr.count}</span>
            <span class="text-slate-400 text-xs">${fmt$(dr.amount)}</span>
          </div>
        </div>
      `).join('')
    : '<p class="text-slate-400 text-sm">No denials recorded</p>';

  $('recent-activity').innerHTML = (d.recentActivity || []).map(c => `
    <tr class="tbl-row border-b border-slate-800">
      <td class="px-0 py-2 text-sky-400 font-mono text-xs">${c.claimNumber}</td>
      <td class="py-2">${c.patientName}</td>
      <td class="py-2 text-slate-400 text-xs">${c.payerName}</td>
      <td class="py-2 text-right font-mono text-xs">${fmt$(c.totalCharged)}</td>
      <td class="py-2">${statusBadge(c.status)}</td>
    </tr>
  `).join('');
}

// ─── Claims ───────────────────────────────────────────────────────────────────
async function loadClaims() {
  const r = await fetch(`${API}/claims`);
  const { data } = await r.json();
  allClaims = data || [];
  // Populate status filter
  const metaR = await fetch(`${API}/statuses`);
  const { data: meta } = await metaR.json();
  allStatuses = meta?.claimStatuses || [];
  const sel = $('claim-status-filter');
  sel.innerHTML = '<option value="">All Statuses</option>' +
    allStatuses.map(s => `<option value="${s}">${s.replace(/_/g,' ')}</option>`).join('');
  renderClaims(allClaims);
}

function filterClaims() {
  const q = $('claim-search').value.toLowerCase();
  const s = $('claim-status-filter').value;
  let filtered = allClaims;
  if (q) filtered = filtered.filter(c =>
    c.patientName.toLowerCase().includes(q) ||
    c.claimNumber.toLowerCase().includes(q) ||
    c.payerName.toLowerCase().includes(q)
  );
  if (s) filtered = filtered.filter(c => c.status === s);
  renderClaims(filtered);
}

function renderClaims(claims) {
  $('claims-table').innerHTML = claims.length ? claims.map(c => `
    <tr class="tbl-row border-b border-slate-800 hover:bg-slate-800/50">
      <td class="px-4 py-3 text-sky-400 font-mono text-xs cursor-pointer" onclick="viewClaim('${c.id}')">${c.claimNumber}</td>
      <td class="px-4 py-3">${c.patientName}</td>
      <td class="px-4 py-3 text-slate-400 text-xs">${c.payerName}</td>
      <td class="px-4 py-3 text-slate-400 text-xs">${fmtDate(c.serviceDate)}</td>
      <td class="px-4 py-3 text-right font-mono text-xs">${fmt$(c.totalCharged)}</td>
      <td class="px-4 py-3 text-right font-mono text-xs text-green-400">${fmt$(c.totalPaid)}</td>
      <td class="px-4 py-3 text-right font-mono text-xs text-yellow-400">${fmt$(c.outstandingBalance)}</td>
      <td class="px-4 py-3">${statusBadge(c.status)}</td>
      <td class="px-4 py-3">
        <button onclick="viewClaim('${c.id}')" class="text-sky-400 hover:text-sky-300 text-xs mr-2">
          <i class="fas fa-eye"></i>
        </button>
        <button onclick="deleteClaim('${c.id}')" class="text-red-400 hover:text-red-300 text-xs">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="9" class="px-4 py-8 text-center text-slate-400">No claims found</td></tr>';
}

async function viewClaim(id) {
  const r = await fetch(`${API}/claims/${id}`);
  const { data: c } = await r.json();
  if (!c) return;
  $('claim-modal-title').textContent = `Claim: ${c.claimNumber}`;
  $('claim-modal-body').innerHTML = `
    <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
      <div><span class="text-slate-400">Patient:</span> <span class="text-white">${c.patientName}</span></div>
      <div><span class="text-slate-400">Payer:</span> <span class="text-white">${c.payerName}</span></div>
      <div><span class="text-slate-400">Plan:</span> <span class="text-white">${c.insurancePlan || '—'}</span></div>
      <div><span class="text-slate-400">Member ID:</span> <span class="text-white font-mono text-xs">${c.memberId}</span></div>
      <div><span class="text-slate-400">Provider:</span> <span class="text-white">${c.providerName}</span></div>
      <div><span class="text-slate-400">Service Date:</span> <span class="text-white">${fmtDate(c.serviceDate)}</span></div>
      <div><span class="text-slate-400">Status:</span> ${statusBadge(c.status)}</div>
      <div><span class="text-slate-400">Prior Auth #:</span> <span class="text-white text-xs">${c.priorAuthNumber || 'None'}</span></div>
    </div>
    <div class="grid grid-cols-3 gap-3 mb-4">
      <div class="stat-card text-center"><div class="text-xs text-slate-400">Charged</div><div class="font-bold text-white">${fmt$(c.totalCharged)}</div></div>
      <div class="stat-card text-center"><div class="text-xs text-slate-400">Paid</div><div class="font-bold text-green-400">${fmt$(c.totalPaid)}</div></div>
      <div class="stat-card text-center"><div class="text-xs text-slate-400">Balance</div><div class="font-bold text-yellow-400">${fmt$(c.outstandingBalance)}</div></div>
    </div>
    ${c.claimLines.length ? `
    <h4 class="text-slate-300 font-semibold text-sm mb-2">Claim Lines</h4>
    <table class="w-full text-xs mb-4">
      <thead><tr class="text-slate-400 border-b border-slate-700">
        <th class="text-left py-1">CPT</th><th class="text-left py-1">Description</th>
        <th class="text-right py-1">Units</th><th class="text-right py-1">Charged</th><th class="text-right py-1">Paid</th>
      </tr></thead>
      <tbody>${c.claimLines.map(l => `
        <tr class="border-b border-slate-800">
          <td class="py-1 font-mono text-sky-400">${l.cptCode}</td>
          <td class="py-1">${l.description}</td>
          <td class="py-1 text-right">${l.units}</td>
          <td class="py-1 text-right">${fmt$(l.chargedAmount)}</td>
          <td class="py-1 text-right text-green-400">${fmt$(l.paidAmount)}</td>
        </tr>
      `).join('')}</tbody>
    </table>
    ` : ''}
    ${c.denials.length ? `
    <h4 class="text-red-400 font-semibold text-sm mb-2"><i class="fas fa-exclamation-circle mr-1"></i>Denials</h4>
    <div class="space-y-2 mb-4">${c.denials.map(d => `
      <div class="bg-red-900/20 border border-red-800 rounded p-3 text-xs">
        <div class="font-semibold text-red-300">${d.reason.replace(/_/g,' ')}</div>
        <div class="text-slate-300">${d.reasonDescription}</div>
        <div class="text-slate-400 mt-1">Denied: ${fmtDate(d.deniedDate)} | Appeal deadline: ${fmtDate(d.appealDeadline)}</div>
      </div>
    `).join('')}</div>` : ''}
    ${c.payments.length ? `
    <h4 class="text-green-400 font-semibold text-sm mb-2"><i class="fas fa-check-circle mr-1"></i>Payments</h4>
    <div class="space-y-2 mb-4">${c.payments.map(p => `
      <div class="bg-green-900/20 border border-green-800 rounded p-3 text-xs flex justify-between">
        <div><span class="text-green-300 font-semibold">${fmt$(p.amount)}</span> via ${p.method}</div>
        <div class="text-slate-400">${fmtDate(p.paymentDate)} · ${p.postedBy}</div>
      </div>
    `).join('')}</div>` : ''}
    ${c.notes.length ? `
    <h4 class="text-slate-300 font-semibold text-sm mb-2">Notes</h4>
    <div class="space-y-2">${c.notes.map(n => `
      <div class="bg-slate-800 rounded p-3 text-xs">
        <div class="font-semibold text-sky-300">${n.authorName}</div>
        <div class="text-slate-300">${n.content}</div>
        <div class="text-slate-500 mt-1">${fmtDate(n.createdAt)}</div>
      </div>
    `).join('')}</div>` : ''}
    <div class="mt-4 flex gap-2">
      <button onclick="openPostPaymentModal('${c.id}')" class="btn-primary text-xs"><i class="fas fa-credit-card mr-1"></i>Post Payment</button>
      <button onclick="openAddDenialModal('${c.id}')" class="btn-danger text-xs"><i class="fas fa-ban mr-1"></i>Add Denial</button>
    </div>
  `;
  openModal('claim-modal');
}

async function deleteClaim(id) {
  if (!confirm('Delete this claim? This cannot be undone.')) return;
  const r = await fetch(`${API}/claims/${id}`, { method: 'DELETE' });
  const data = await r.json();
  if (data.success) loadClaims();
  else alert(data.error || 'Delete failed');
}

// ─── Post Payment inline modal ────────────────────────────────────────────────
function openPostPaymentModal(claimId) {
  const body = $('claim-modal-body');
  body.insertAdjacentHTML('beforeend', `
    <div id="pay-inline" class="mt-4 border-t border-slate-700 pt-4">
      <h4 class="text-slate-300 font-semibold text-sm mb-3">Post Payment</h4>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="text-xs text-slate-400">Amount ($) *</label><input id="pay-amount" type="number" placeholder="132"></div>
        <div><label class="text-xs text-slate-400">Method *</label>
          <select id="pay-method">
            <option value="EFT">EFT</option><option value="CHECK">Check</option>
            <option value="CREDIT_CARD">Credit Card</option><option value="CASH">Cash</option>
            <option value="PATIENT_PORTAL">Patient Portal</option><option value="ADJUSTMENT">Adjustment</option>
            <option value="WRITE_OFF">Write-Off</option>
          </select>
        </div>
        <div><label class="text-xs text-slate-400">Posted By *</label><input id="pay-postedBy" placeholder="admin"></div>
        <div><label class="text-xs text-slate-400">Reference #</label><input id="pay-ref" placeholder="EFT-88221"></div>
      </div>
      <div id="pay-err" class="text-red-400 text-xs hidden mt-2"></div>
      <button onclick="submitPayment('${claimId}')" class="btn-primary text-xs mt-3">Post Payment</button>
    </div>
  `);
}

async function submitPayment(claimId) {
  const amount = parseFloat($('pay-amount').value);
  const method = $('pay-method').value;
  const postedBy = $('pay-postedBy').value.trim();
  if (!amount || !postedBy) { $('pay-err').textContent = 'amount and postedBy required'; $('pay-err').classList.remove('hidden'); return; }
  const r = await fetch(`${API}/claims/${claimId}/payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount, method, postedBy, referenceNumber: $('pay-ref').value }),
  });
  const data = await r.json();
  if (data.success) { closeModal('claim-modal'); loadClaims(); loadOverview(); }
  else { $('pay-err').textContent = data.error || 'Post failed'; $('pay-err').classList.remove('hidden'); }
}

function openAddDenialModal(claimId) {
  const body = $('claim-modal-body');
  body.insertAdjacentHTML('beforeend', `
    <div id="denial-inline" class="mt-4 border-t border-slate-700 pt-4">
      <h4 class="text-red-400 font-semibold text-sm mb-3">Add Denial</h4>
      <div class="grid grid-cols-1 gap-3">
        <div><label class="text-xs text-slate-400">Reason *</label>
          <select id="denial-reason">
            ${['NOT_COVERED','AUTHORIZATION_REQUIRED','MEDICAL_NECESSITY','DUPLICATE_CLAIM',
               'TIMELY_FILING','ELIGIBILITY','COORDINATION_OF_BENEFITS','CODING_ERROR',
               'MISSING_INFORMATION','BUNDLING','FREQUENCY_LIMITATION','OTHER'
              ].map(r => `<option value="${r}">${r.replace(/_/g,' ')}</option>`).join('')}
          </select>
        </div>
        <div><label class="text-xs text-slate-400">Description *</label><textarea id="denial-desc" rows="2" placeholder="Reason details…"></textarea></div>
        <div><label class="text-xs text-slate-400">Appeal Deadline</label><input id="denial-deadline" type="date"></div>
      </div>
      <div id="denial-err" class="text-red-400 text-xs hidden mt-2"></div>
      <button onclick="submitDenial('${claimId}')" class="btn-danger text-xs mt-3">Add Denial</button>
    </div>
  `);
}

async function submitDenial(claimId) {
  const reason = $('denial-reason').value;
  const reasonDescription = $('denial-desc').value.trim();
  if (!reasonDescription) { $('denial-err').textContent = 'Description required'; $('denial-err').classList.remove('hidden'); return; }
  const r = await fetch(`${API}/claims/${claimId}/denials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, reasonDescription, appealDeadline: $('denial-deadline').value || undefined }),
  });
  const data = await r.json();
  if (data.success) { closeModal('claim-modal'); loadClaims(); loadOverview(); }
  else { $('denial-err').textContent = data.error || 'Failed'; $('denial-err').classList.remove('hidden'); }
}

// ─── New Claim ────────────────────────────────────────────────────────────────
function openNewClaimModal() { openModal('new-claim-modal'); }
async function submitNewClaim() {
  const body = {
    patientId: $('nc-patientId').value.trim(),
    patientName: $('nc-patientName').value.trim(),
    payerId: $('nc-payerId').value.trim(),
    payerName: $('nc-payerName').value.trim(),
    insurancePlan: $('nc-insurancePlan').value.trim(),
    memberId: $('nc-memberId').value.trim(),
    providerId: $('nc-providerId').value.trim(),
    providerName: $('nc-providerName').value.trim(),
    serviceDate: $('nc-serviceDate').value,
    totalCharged: parseFloat($('nc-totalCharged').value) || 0,
  };
  if (!body.patientId || !body.patientName || !body.payerId || !body.payerName || !body.serviceDate) {
    $('nc-error').textContent = 'Required fields missing'; $('nc-error').classList.remove('hidden'); return;
  }
  const r = await fetch(`${API}/claims`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (data.success) { closeModal('new-claim-modal'); loadClaims(); loadOverview(); }
  else { $('nc-error').textContent = data.error || 'Create failed'; $('nc-error').classList.remove('hidden'); }
}

// ─── ERAs ─────────────────────────────────────────────────────────────────────
async function loadERAs() {
  const r = await fetch(`${API}/eras`);
  const { data } = await r.json();
  $('era-table').innerHTML = (data || []).length ? (data || []).map(e => `
    <tr class="tbl-row border-b border-slate-800 hover:bg-slate-800/50">
      <td class="px-4 py-3 text-sky-400 font-mono text-xs">${e.id}</td>
      <td class="px-4 py-3">${e.payerName}</td>
      <td class="px-4 py-3 text-slate-400 text-xs">${fmtDate(e.checkDate)}</td>
      <td class="px-4 py-3 font-mono text-xs text-slate-300">${e.eftTraceNumber || e.checkNumber || '—'}</td>
      <td class="px-4 py-3 text-right font-mono text-xs text-green-400">${fmt$(e.totalPayment)}</td>
      <td class="px-4 py-3 text-right">${e.claimsCount}</td>
      <td class="px-4 py-3">${eraBadge(e.status)}</td>
    </tr>
  `).join('') : '<tr><td colspan="7" class="px-4 py-8 text-center text-slate-400">No ERAs recorded</td></tr>';
}

function openNewERAModal() { openModal('new-era-modal'); }
async function submitNewERA() {
  const body = {
    payerId: $('era-payerId').value.trim(),
    payerName: $('era-payerName').value.trim(),
    checkDate: $('era-checkDate').value,
    eftTraceNumber: $('era-eft').value.trim() || undefined,
    totalPayment: parseFloat($('era-total').value) || 0,
  };
  if (!body.payerId || !body.payerName || !body.checkDate || body.totalPayment === undefined) {
    $('era-error').textContent = 'Required fields missing'; $('era-error').classList.remove('hidden'); return;
  }
  const r = await fetch(`${API}/eras`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (data.success) { closeModal('new-era-modal'); loadERAs(); }
  else { $('era-error').textContent = data.error || 'Failed'; $('era-error').classList.remove('hidden'); }
}

// ─── Statements ───────────────────────────────────────────────────────────────
async function loadStatements() {
  const r = await fetch(`${API}/statements`);
  const { data } = await r.json();
  $('statements-table').innerHTML = (data || []).length ? (data || []).map(s => `
    <tr class="tbl-row border-b border-slate-800 hover:bg-slate-800/50">
      <td class="px-4 py-3 text-sky-400 font-mono text-xs">${s.id}</td>
      <td class="px-4 py-3">${s.patientName}</td>
      <td class="px-4 py-3 text-slate-400 text-xs">${fmtDate(s.statementDate)}</td>
      <td class="px-4 py-3 text-slate-400 text-xs">${fmtDate(s.dueDate)}</td>
      <td class="px-4 py-3 text-right font-mono text-xs text-yellow-400">${fmt$(s.totalDue)}</td>
      <td class="px-4 py-3">${stmtBadge(s.status)}</td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="px-4 py-8 text-center text-slate-400">No statements found</td></tr>';
}

function openNewStatementModal() { openModal('new-stmt-modal'); }
async function submitNewStatement() {
  const body = {
    patientId: $('stmt-patientId').value.trim(),
    patientName: $('stmt-patientName').value.trim(),
    totalDue: parseFloat($('stmt-totalDue').value) || 0,
    dueDate: $('stmt-dueDate').value,
  };
  if (!body.patientId || !body.patientName || !body.dueDate) {
    $('stmt-error').textContent = 'Required fields missing'; $('stmt-error').classList.remove('hidden'); return;
  }
  const r = await fetch(`${API}/statements`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (data.success) { closeModal('new-stmt-modal'); loadStatements(); }
  else { $('stmt-error').textContent = data.error || 'Failed'; $('stmt-error').classList.remove('hidden'); }
}

// ─── Payment Plans ────────────────────────────────────────────────────────────
async function loadPlans() {
  const r = await fetch(`${API}/payment-plans`);
  const { data } = await r.json();
  $('plans-list').innerHTML = (data || []).length ? (data || []).map(p => `
    <div class="card p-4">
      <div class="flex items-center justify-between mb-3">
        <div>
          <div class="font-semibold text-white">${p.patientName}</div>
          <div class="text-xs text-slate-400 font-mono">${p.id}</div>
        </div>
        ${planBadge(p.status)}
      </div>
      <div class="grid grid-cols-3 gap-3 mb-3">
        <div class="text-center"><div class="text-xs text-slate-400">Balance</div><div class="font-bold text-white">${fmt$(p.totalBalance)}</div></div>
        <div class="text-center"><div class="text-xs text-slate-400">Monthly</div><div class="font-bold text-sky-400">${fmt$(p.monthlyPayment)}</div></div>
        <div class="text-center"><div class="text-xs text-slate-400">Payments</div><div class="font-bold text-white">${p.payments.length}</div></div>
      </div>
      <div class="space-y-1">
        ${p.payments.slice(0,3).map(pay => `
          <div class="flex justify-between text-xs">
            <span class="text-slate-400">${fmtDate(pay.date)}</span>
            <span class="${pay.status==='PAID'?'text-green-400':pay.status==='MISSED'?'text-red-400':'text-slate-300'}">${pay.status}</span>
            <span class="font-mono">${fmt$(pay.amount)}</span>
          </div>
        `).join('')}
        ${p.payments.length > 3 ? `<div class="text-xs text-slate-500">+${p.payments.length-3} more</div>` : ''}
      </div>
    </div>
  `).join('') : '<div class="col-span-2 text-slate-400 text-center py-8">No payment plans</div>';
}

function openNewPlanModal() { openModal('new-plan-modal'); }
async function submitNewPlan() {
  const body = {
    patientId: $('pp-patientId').value.trim(),
    patientName: $('pp-patientName').value.trim(),
    totalBalance: parseFloat($('pp-balance').value) || 0,
    monthlyPayment: parseFloat($('pp-monthly').value) || 0,
    startDate: $('pp-start').value || new Date().toISOString().slice(0,10),
  };
  if (!body.patientId || !body.patientName || !body.totalBalance || !body.monthlyPayment) {
    $('plan-error').textContent = 'Required fields missing'; $('plan-error').classList.remove('hidden'); return;
  }
  const r = await fetch(`${API}/payment-plans`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  if (data.success) { closeModal('new-plan-modal'); loadPlans(); }
  else { $('plan-error').textContent = data.error || 'Failed'; $('plan-error').classList.remove('hidden'); }
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadOverview();
  // Pre-set today for date fields
  const today = new Date().toISOString().slice(0,10);
  $('nc-serviceDate') && ($('nc-serviceDate').value = today);
  $('era-checkDate') && ($('era-checkDate').value = today);
  $('stmt-dueDate') && ($('stmt-dueDate').value = new Date(Date.now()+30*86400000).toISOString().slice(0,10));
  $('pp-start') && ($('pp-start').value = today);
});
