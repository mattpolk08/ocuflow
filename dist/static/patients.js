// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Patients Module Controller  (Phase 1B)
// public/static/patients.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Common payers (mirrors src/types/patient.ts) ──────────────────────────────
const COMMON_PAYERS = [
  { id: '60054',     name: 'Aetna' },
  { id: 'BCBSF',    name: 'Blue Cross Blue Shield of Florida' },
  { id: 'BCBSIL',   name: 'Blue Cross Blue Shield of Illinois' },
  { id: 'CIGNA',    name: 'Cigna' },
  { id: 'HUMANA',   name: 'Humana' },
  { id: '00901',    name: 'Medicare' },
  { id: 'MDCD',     name: 'Medicaid' },
  { id: 'UHC',      name: 'UnitedHealthcare' },
  { id: 'MVPHP',    name: 'MVP Health Plan' },
  { id: 'OXHP',     name: 'Oxford Health Plans' },
  { id: 'WPS',      name: 'WPS Health Insurance' },
  { id: 'TRICARE',  name: 'TRICARE' },
  { id: 'VSP',      name: 'VSP Vision Care' },
  { id: 'EYE',      name: 'EyeMed Vision Care' },
  { id: 'DAVIS',    name: 'Davis Vision' },
  { id: 'NUVISION', name: 'NVA (National Vision Administrators)' },
  { id: 'CAREFIRST',name: 'CareFirst BlueCross BlueShield' },
  { id: 'KAISER',   name: 'Kaiser Permanente' },
  { id: 'ANTHEM',   name: 'Anthem Blue Cross' },
  { id: 'MOLINA',   name: 'Molina Healthcare' },
];

// ── Eligibility display config ────────────────────────────────────────────────
const ELIG = {
  ACTIVE:   { label: 'Active',     icon: 'fa-circle-check',    color: 'text-emerald-400', chipClass: 'elig-active',   panelClass: 'elig-panel-active' },
  INACTIVE: { label: 'Inactive',   icon: 'fa-circle-xmark',    color: 'text-red-400',     chipClass: 'elig-inactive', panelClass: 'elig-panel-inactive' },
  UNKNOWN:  { label: 'Unverified', icon: 'fa-circle-question', color: 'text-slate-400',   chipClass: 'elig-unknown',  panelClass: 'elig-panel-unknown' },
  PENDING:  { label: 'Pending',    icon: 'fa-clock',           color: 'text-yellow-400',  chipClass: 'elig-pending',  panelClass: 'elig-panel-pending' },
};

// ── Avatar palette ────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  ['bg-blue-500/20 text-blue-300',    'from-blue-600 to-blue-800'],
  ['bg-violet-500/20 text-violet-300','from-violet-600 to-violet-800'],
  ['bg-emerald-500/20 text-emerald-300','from-emerald-600 to-emerald-800'],
  ['bg-amber-500/20 text-amber-300',  'from-amber-600 to-amber-800'],
  ['bg-rose-500/20 text-rose-300',    'from-rose-600 to-rose-800'],
  ['bg-cyan-500/20 text-cyan-300',    'from-cyan-600 to-cyan-800'],
  ['bg-pink-500/20 text-pink-300',    'from-pink-600 to-pink-800'],
  ['bg-indigo-500/20 text-indigo-300','from-indigo-600 to-indigo-800'],
];

function avatarColor(name) {
  let h = 0;
  for (let i = 0; i < (name||'A').length; i++) h = (h * 31 + (name||'A').charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// ── Application State ─────────────────────────────────────────────────────────
const PS = {
  patients:      [],    // current page data (PatientSearchResult[])
  total:         0,
  page:          1,
  pageSize:      25,
  filter:        'all', // all | new | unverified | active
  searchDebounce:null,
  tableQuery:    '',
  insuranceFilter: '',
  openPatient:   null,  // full Patient object currently in profile modal
  wizardStep:    1,
  isLoading:     false,
  pendingEligChecks: new Set(), // plan IDs currently being verified
};

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $  = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const [y,m,d] = iso.split('T')[0].split('-');
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[+m-1]} ${+d}, ${y}`;
  } catch { return iso; }
}

function calcAge(dob) {
  if (!dob) return '?';
  const birth = new Date(dob), today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function highlight(text, query) {
  if (!query || !text) return escHtml(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  return escHtml(text).replace(new RegExp(`(${escaped})`, 'gi'), '<mark>$1</mark>');
}

let toastTimer = null;
function showToast(msg, type = 'success') {
  const toast = $('#toast');
  const icon  = $('#toast-icon');
  const msgEl = $('#toast-msg');
  icon.className = 'fas ' + (type === 'success' ? 'fa-circle-check text-emerald-400' :
                              type === 'error'   ? 'fa-circle-xmark text-red-400' :
                                                   'fa-circle-info text-blue-400');
  msgEl.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── API calls ─────────────────────────────────────────────────────────────────
function _authHdr(extra = {}) {
  const tok = sessionStorage.getItem('of_access_token');
  const h = { 'Content-Type': 'application/json', ...extra };
  if (tok) h['Authorization'] = `Bearer ${tok}`;
  return h;
}
async function apiGet(path) {
  const res = await fetch(path, { headers: _authHdr() });
  if (res.status === 401) { sessionStorage.clear(); location.href = '/login'; return {}; }
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || res.statusText); }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: _authHdr(),
    body: JSON.stringify(body),
  });
  if (res.status === 401) { sessionStorage.clear(); location.href = '/login'; return {}; }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT TABLE
// ─────────────────────────────────────────────────────────────────────────────

async function loadPatients(page = 1, query = '', insFilter = '') {
  PS.isLoading = true;
  const tbody = $('#patient-table-body');
  tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-slate-600">
    <div class="flex flex-col items-center gap-3"><div class="spinner w-6 h-6"></div><span class="text-xs">Loading patients…</span></div>
  </td></tr>`;

  try {
    let url = query && query.length >= 2
      ? `/api/patients?q=${encodeURIComponent(query)}&limit=50`
      : `/api/patients?page=${page}&limit=${PS.pageSize}`;

    const res = await apiGet(url);
    let patients = res.data.patients || [];

    // Client-side insurance filter
    if (insFilter) {
      patients = patients.filter(pt => {
        // We don't have full insurance data in search result, but we can proxy
        // via the primaryInsurance presence for 'ACTIVE' roughly
        if (insFilter === 'ACTIVE')   return pt.primaryInsurance && pt.isActive;
        if (insFilter === 'UNKNOWN')  return !pt.primaryInsurance || !pt.isActive;
        return true;
      });
    }

    // Sidebar filter
    if (PS.filter === 'new')        patients = patients.filter(p => p.isNewPatient);
    if (PS.filter === 'unverified') patients = patients.filter(p => !p.primaryInsurance);
    if (PS.filter === 'active')     patients = patients.filter(p => p.isActive);

    PS.patients = patients;
    PS.total    = res.data.total || patients.length;
    PS.page     = page;

    renderTable(patients, query);
    updateStats(res.data);
    updatePagination(res.data.total || patients.length, page);

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-8 text-center text-red-400 text-xs">
      <i class="fas fa-triangle-exclamation mr-2"></i>${escHtml(err.message)}
    </td></tr>`;
  } finally {
    PS.isLoading = false;
  }
}

function renderTable(patients, query = '') {
  const tbody = $('#patient-table-body');
  if (!patients.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="px-4 py-12 text-center">
      <div class="flex flex-col items-center gap-3 text-slate-600">
        <i class="fas fa-user-magnifying-glass text-3xl"></i>
        <p class="text-sm">No patients found</p>
        ${query ? `<p class="text-xs">Try a different search term</p>` : `<button onclick="openNewPatientModal()" class="text-xs text-blue-400 hover:text-blue-300 underline">Add the first patient</button>`}
      </div>
    </td></tr>`;
    return;
  }

  tbody.innerHTML = patients.map(pt => {
    const q    = query || PS.tableQuery;
    const name = highlight(pt.fullName, q);
    const mrn  = highlight(pt.mrn, q);
    const [bgText] = avatarColor(pt.fullName);
    const initials = (pt.fullName || '?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();

    const statusChip = pt.isNewPatient
      ? `<span class="chip chip-new"><i class="fas fa-star text-[9px]"></i> New</span>`
      : pt.isActive
        ? `<span class="chip chip-active"><i class="fas fa-circle text-[6px]"></i> Active</span>`
        : `<span class="chip chip-inactive"><i class="fas fa-circle text-[6px]"></i> Inactive</span>`;

    const insName = pt.primaryInsurance
      ? `<span class="text-slate-300">${escHtml(pt.primaryInsurance)}</span>`
      : `<span class="text-slate-600 italic">No insurance</span>`;

    const lastVisit = pt.lastVisitDate
      ? formatDate(pt.lastVisitDate)
      : `<span class="text-slate-600">—</span>`;

    return `<tr class="pt-row border-b border-slate-800/60" data-patient-id="${escHtml(pt.id)}" tabindex="0" role="button">
      <td class="px-4 py-3">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg flex-shrink-0 flex items-center justify-center font-bold text-xs ${bgText}">
            ${initials}
          </div>
          <div class="min-w-0">
            <p class="font-semibold text-white text-sm leading-tight">${name}</p>
            <p class="text-xs text-slate-500 mt-0.5">${mrn}</p>
          </div>
        </div>
      </td>
      <td class="px-4 py-3 font-mono text-xs text-slate-400">${mrn}</td>
      <td class="px-4 py-3 text-xs text-slate-400 hidden md:table-cell">
        ${formatDate(pt.dateOfBirth)}<br/>
        <span class="text-slate-600">Age ${calcAge(pt.dateOfBirth)}</span>
      </td>
      <td class="px-4 py-3 text-xs text-slate-400 hidden lg:table-cell">
        <div>${pt.phone ? escHtml(pt.phone) : '<span class="text-slate-600">—</span>'}</div>
        <div class="text-slate-600 truncate max-w-[160px]">${escHtml(pt.email||'')}</div>
      </td>
      <td class="px-4 py-3 text-xs">${insName}</td>
      <td class="px-4 py-3 text-xs text-slate-400 hidden sm:table-cell">${lastVisit}</td>
      <td class="px-4 py-3 text-center">${statusChip}</td>
    </tr>`;
  }).join('');

  // Row click → open profile
  $$('#patient-table-body .pt-row').forEach(row => {
    row.addEventListener('click', () => openPatientProfile(row.dataset.patientId));
    row.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openPatientProfile(row.dataset.patientId); });
  });
}

function updateStats(data) {
  const patients = data.patients || [];
  const total    = data.total    || patients.length;
  const newPts   = patients.filter(p => p.isNewPatient).length;
  const verified = patients.filter(p => p.primaryInsurance).length;
  const unver    = patients.filter(p => !p.primaryInsurance).length;

  $('#stat-total').textContent     = total;
  $('#stat-new').textContent       = newPts;
  $('#stat-verified').textContent  = verified;
  $('#stat-unverified').textContent= unver;

  $('#count-all').textContent        = total;
  $('#count-new').textContent        = newPts;
  $('#count-unverified').textContent = unver;
}

function updatePagination(total, page) {
  const info   = $('#pagination-info');
  const btnPrev= $('#btn-prev');
  const btnNext= $('#btn-next');
  const start  = (page - 1) * PS.pageSize + 1;
  const end    = Math.min(page * PS.pageSize, total);
  info.textContent = total > 0 ? `${start}–${end} of ${total} patients` : '0 patients';
  btnPrev.disabled = page <= 1;
  btnNext.disabled = end >= total;
}

// ─────────────────────────────────────────────────────────────────────────────
// PATIENT PROFILE MODAL
// ─────────────────────────────────────────────────────────────────────────────

async function openPatientProfile(id) {
  const modal = $('#modal-profile');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Reset tabs
  $$('.profile-tab').forEach(t => t.classList.remove('active'));
  $$('.tab-panel').forEach(p => p.classList.remove('active'));
  $('[data-tab="overview"]').classList.add('active');
  $('#tab-overview').classList.add('active');

  // Show loading state
  $('#profile-name').textContent = 'Loading…';
  $('#profile-mrn').textContent  = '—';

  try {
    const res = await apiGet(`/api/patients/${id}`);
    const pt  = res.data;
    PS.openPatient = pt;
    renderPatientProfile(pt);
  } catch (err) {
    showToast('Failed to load patient: ' + err.message, 'error');
    closeProfileModal();
  }
}

function renderPatientProfile(pt) {
  // Avatar
  const [bgText, gradient] = avatarColor(pt.fullName || pt.firstName);
  const initials = `${pt.firstName[0]}${pt.lastName[0]}`.toUpperCase();
  const avatarEl = $('#profile-avatar');
  avatarEl.className = `w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center text-xl font-bold shadow-lg ${bgText}`;
  avatarEl.textContent = initials;

  // Header
  $('#profile-name').textContent = `${pt.firstName} ${pt.lastName}`;
  $('#profile-mrn').textContent  = pt.mrn;
  $('#profile-dob').textContent  = `${formatDate(pt.dateOfBirth)} (Age ${calcAge(pt.dateOfBirth)})`;
  $('#profile-gender').textContent = capitalizeFirst(pt.gender || '—');

  const statusChip = $('#profile-status-chip');
  if (pt.isActive) {
    statusChip.className = 'chip chip-active';
    statusChip.innerHTML = '<i class="fas fa-circle text-[6px]"></i> Active';
  } else {
    statusChip.className = 'chip chip-inactive';
    statusChip.innerHTML = '<i class="fas fa-circle text-[6px]"></i> Inactive';
  }

  const newChip = $('#profile-new-chip');
  newChip.classList.toggle('hidden', !pt.isNewPatient);

  // Quick stats
  $('#profile-last-visit').textContent = pt.lastVisitDate ? formatDate(pt.lastVisitDate) : 'No visits yet';
  const primary = pt.insurancePlans?.find(p => p.priority === 'PRIMARY');
  $('#profile-primary-ins').textContent = primary?.payerName || 'No insurance on file';

  const eligEl = $('#profile-elig-status');
  if (primary) {
    const ec = ELIG[primary.eligibilityStatus] || ELIG.UNKNOWN;
    eligEl.innerHTML = `<i class="fas ${ec.icon} mr-1"></i>${ec.label}`;
    eligEl.className = `text-sm font-semibold ${ec.color}`;
  } else {
    eligEl.textContent = '—';
    eligEl.className   = 'text-sm font-semibold text-slate-500';
  }

  // Overview tab
  $('#ov-phone').textContent   = pt.phone || pt.cellPhone || '—';
  $('#ov-email').textContent   = pt.email || '—';
  const addr = pt.address;
  $('#ov-address').textContent = addr
    ? `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}`
    : '—';
  const langMap = { en:'English', es:'Spanish', pt:'Portuguese', ht:'Haitian Creole', zh:'Chinese', fr:'French' };
  $('#ov-language').textContent = langMap[pt.preferredLanguage] || pt.preferredLanguage || '—';
  $('#ov-portal').innerHTML    = pt.portalAccess
    ? '<span class="text-emerald-400"><i class="fas fa-check mr-1"></i>Yes</span>'
    : '<span class="text-slate-500">No</span>';
  $('#ov-referral').textContent = pt.referralSource || '—';
  $('#ov-since').textContent   = pt.createdAt ? formatDate(pt.createdAt.split('T')[0]) : '—';

  // Insurance tab
  renderInsurancePlans(pt);

  // Clinical tab
  $('#clin-allergies').textContent = pt.allergies || 'NKDA';
  $('#clin-meds').textContent      = pt.currentMedications || 'None';

  // Contacts tab
  renderContacts(pt);
}

function renderInsurancePlans(pt) {
  const container = $('#insurance-plans-container');
  const plans     = pt.insurancePlans || [];

  if (!plans.length) {
    container.innerHTML = `<div class="text-center py-8 text-slate-600">
      <i class="fas fa-shield-halved text-3xl mb-3 block"></i>
      <p class="text-sm">No insurance plans on file</p>
    </div>`;
    return;
  }

  container.innerHTML = plans.map((plan, idx) => {
    const ec       = ELIG[plan.eligibilityStatus] || ELIG.UNKNOWN;
    const priority = plan.priority === 'PRIMARY' ? '1st' : plan.priority === 'SECONDARY' ? '2nd' : '3rd';
    const det      = plan.eligibilityDetails;

    return `
    <div class="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden" id="plan-card-${escHtml(plan.id)}">
      <!-- Plan Header -->
      <div class="px-4 py-3 flex items-center justify-between gap-3 border-b border-slate-700/50">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-lg bg-slate-700 flex items-center justify-center flex-shrink-0">
            <i class="fas fa-shield-heart text-blue-400 text-sm"></i>
          </div>
          <div class="min-w-0">
            <p class="font-semibold text-white text-sm leading-tight truncate">${escHtml(plan.payerName)}</p>
            <p class="text-xs text-slate-500">${priority} / ${escHtml(plan.planName || plan.priority)}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <span class="chip ${ec.chipClass}"><i class="fas ${ec.icon} text-[9px]"></i> ${ec.label}</span>
          <button
            class="verify-btn px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5
                   ${plan.eligibilityStatus === 'ACTIVE'
                     ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                     : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'}"
            data-plan-id="${escHtml(plan.id)}"
            data-patient-id="${escHtml(pt.id)}"
            ${PS.pendingEligChecks.has(plan.id) ? 'disabled' : ''}>
            ${PS.pendingEligChecks.has(plan.id)
              ? '<span class="spinner w-3 h-3"></span> Checking…'
              : plan.eligibilityStatus === 'ACTIVE'
                ? '<i class="fas fa-rotate-right text-[10px]"></i> Re-verify'
                : '<i class="fas fa-bolt text-[10px]"></i> Verify Now'}
          </button>
        </div>
      </div>

      <!-- Plan Details Grid -->
      <div class="px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-xs">
        <div><span class="text-slate-500">Member ID</span><p class="text-slate-200 font-mono mt-0.5">${escHtml(plan.memberId)}</p></div>
        ${plan.groupNumber ? `<div><span class="text-slate-500">Group #</span><p class="text-slate-200 font-mono mt-0.5">${escHtml(plan.groupNumber)}</p></div>` : ''}
        ${plan.subscriberName ? `<div><span class="text-slate-500">Subscriber</span><p class="text-slate-200 mt-0.5">${escHtml(plan.subscriberName)}</p></div>` : ''}
        ${plan.copay != null ? `<div><span class="text-slate-500">Copay</span><p class="text-slate-200 mt-0.5">$${plan.copay}</p></div>` : ''}
        ${plan.deductible != null ? `<div><span class="text-slate-500">Deductible</span><p class="text-slate-200 mt-0.5">$${plan.deductible}</p></div>` : ''}
        ${plan.outOfPocketMax != null ? `<div><span class="text-slate-500">OOP Max</span><p class="text-slate-200 mt-0.5">$${plan.outOfPocketMax}</p></div>` : ''}
        ${plan.eligibilityCheckedAt ? `<div class="col-span-2 sm:col-span-3"><span class="text-slate-500">Last Checked</span><p class="text-slate-400 mt-0.5">${formatDate(plan.eligibilityCheckedAt.split('T')[0])}</p></div>` : ''}
      </div>

      <!-- Eligibility Details (when active) -->
      <div id="elig-details-${escHtml(plan.id)}">
        ${det ? renderEligibilityDetails(det, plan.eligibilityStatus) : ''}
      </div>
    </div>`;
  }).join('');

  // Wire up verify buttons
  $$('.verify-btn', container).forEach(btn => {
    btn.addEventListener('click', () => runEligibilityCheck(btn.dataset.patientId, btn.dataset.planId));
  });
}

function renderEligibilityDetails(det, status) {
  const panelClass = (ELIG[status] || ELIG.UNKNOWN).panelClass;
  const items = [];

  if (det.coinsurance != null)       items.push(['Coinsurance', `${det.coinsurance}%`]);
  if (det.deductibleMet != null)     items.push(['Deductible Met', `$${det.deductibleMet}`]);
  if (det.outOfPocketMet != null)    items.push(['OOP Met', `$${det.outOfPocketMet}`]);
  if (det.copaySpecialist != null)   items.push(['Specialist Copay', `$${det.copaySpecialist}`]);
  if (det.copayPCP != null)          items.push(['PCP Copay', `$${det.copayPCP}`]);
  if (det.visionBenefit != null)     items.push(['Vision Benefit', det.visionBenefit ? '✓ Included' : '✗ Not included']);
  if (det.visionCopay != null)       items.push(['Vision Copay', `$${det.visionCopay}`]);
  if (det.visionAllowance != null)   items.push(['Frame Allowance', `$${det.visionAllowance}`]);

  if (!items.length) return '';

  return `<div class="elig-panel ${panelClass} mx-4 mb-3">
    <p class="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
      <i class="fas fa-file-medical text-xs"></i> Eligibility Details
    </p>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
      ${items.map(([k,v]) => `
        <div class="flex justify-between gap-1">
          <span class="text-slate-500">${k}</span>
          <span class="text-slate-200 font-medium">${v}</span>
        </div>`).join('')}
    </div>
  </div>`;
}

async function runEligibilityCheck(patientId, planId) {
  if (PS.pendingEligChecks.has(planId)) return;
  PS.pendingEligChecks.add(planId);

  // Update button to loading state
  const btn = $(`.verify-btn[data-plan-id="${planId}"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner w-3 h-3"></span> Checking…';
  }

  try {
    const res = await apiPost(`/api/patients/${patientId}/verify-eligibility`, { insurancePlanId: planId });
    const { status, details, payerName } = res.data;

    // Refresh patient data
    const ptRes = await apiGet(`/api/patients/${patientId}`);
    PS.openPatient = ptRes.data;

    // Update chips and details inline
    const planCard = $(`#plan-card-${planId}`);
    if (planCard) {
      const ec = ELIG[status] || ELIG.UNKNOWN;
      // Update eligibility chip
      const chipEl = planCard.querySelector('.chip');
      if (chipEl) {
        chipEl.className = `chip ${ec.chipClass}`;
        chipEl.innerHTML = `<i class="fas ${ec.icon} text-[9px]"></i> ${ec.label}`;
      }
      // Update button
      const verifyBtn = planCard.querySelector('.verify-btn');
      if (verifyBtn) {
        verifyBtn.disabled = false;
        verifyBtn.className = `verify-btn px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5
          bg-slate-700 hover:bg-slate-600 text-slate-300`;
        verifyBtn.innerHTML = '<i class="fas fa-rotate-right text-[10px]"></i> Re-verify';
      }
      // Update details area
      const detArea = $(`#elig-details-${planId}`);
      if (detArea && details) detArea.innerHTML = renderEligibilityDetails(details, status);
    }

    // Update quick-stat bar
    const ec = ELIG[status] || ELIG.UNKNOWN;
    const eligEl = $('#profile-elig-status');
    const primary = PS.openPatient.insurancePlans?.find(p => p.priority === 'PRIMARY');
    if (primary && primary.id === planId) {
      eligEl.innerHTML = `<i class="fas ${ec.icon} mr-1"></i>${ec.label}`;
      eligEl.className = `text-sm font-semibold ${ec.color}`;
    }

    showToast(`${payerName}: ${ec.label}`, status === 'ACTIVE' ? 'success' : 'info');
  } catch (err) {
    showToast('Eligibility check failed: ' + err.message, 'error');
    const btn2 = $(`.verify-btn[data-plan-id="${planId}"]`);
    if (btn2) {
      btn2.disabled = false;
      btn2.innerHTML = '<i class="fas fa-bolt text-[10px]"></i> Retry';
    }
  } finally {
    PS.pendingEligChecks.delete(planId);
  }
}

function renderContacts(pt) {
  const container = $('#contacts-container');
  const items     = [];

  if (pt.emergencyContact?.name) {
    items.push(`
      <div class="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
          <i class="fas fa-heart-pulse text-rose-400"></i> Emergency Contact
        </p>
        <div class="grid grid-cols-2 gap-2 text-sm">
          <div><span class="text-slate-500 text-xs">Name</span><p class="text-slate-200">${escHtml(pt.emergencyContact.name)}</p></div>
          <div><span class="text-slate-500 text-xs">Relationship</span><p class="text-slate-200">${escHtml(pt.emergencyContact.relationship)}</p></div>
          <div><span class="text-slate-500 text-xs">Phone</span><p class="text-slate-200">${escHtml(pt.emergencyContact.phone)}</p></div>
        </div>
      </div>`);
  }

  if (!items.length) {
    items.push(`<div class="text-center py-8 text-slate-600 text-sm">
      <i class="fas fa-user-slash text-2xl block mb-2"></i>No emergency contact on file
    </div>`);
  }

  container.innerHTML = items.join('');
}

function closeProfileModal() {
  $('#modal-profile').classList.remove('open');
  document.body.style.overflow = '';
  PS.openPatient = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW PATIENT WIZARD
// ─────────────────────────────────────────────────────────────────────────────

function openNewPatientModal() {
  resetWizard();
  $('#modal-new-patient').classList.add('open');
  document.body.style.overflow = 'hidden';
  setTimeout(() => $('#p-first-name')?.focus(), 200);
}

function closeNewPatientModal() {
  $('#modal-new-patient').classList.remove('open');
  document.body.style.overflow = '';
}

function resetWizard() {
  PS.wizardStep = 1;
  // Clear all fields
  ['p-first-name','p-last-name','p-middle-name','p-dob','p-cell','p-email',
   'p-street','p-city','p-zip','p-ec-name','p-ec-phone','p-referral',
   'p-ins-payer','p-ins-payer-id','p-ins-plan','p-ins-member-id',
   'p-ins-group','p-ins-sub-name','p-ins-sub-dob','p-ins-eff-date','p-ins-copay'
  ].forEach(id => { const el = $(`#${id}`); if (el) el.value = ''; });
  $(`#p-gender`).value = '';
  $(`#p-language`).value = 'en';
  $(`#p-state`).value = 'FL';
  $(`#p-ec-rel`).value = '';
  $(`#p-ins-rel`).value = 'SELF';
  $(`#payer-dropdown`).classList.remove('open');

  updateWizardUI();
  hideErrors();
}

function updateWizardUI() {
  const s = PS.wizardStep;
  // Steps
  [1,2,3].forEach(n => {
    $(`#wiz-step-${n}`).classList.toggle('active', n === s);
    const dot  = $(`#wdot-${n}`);
    if (n < s)  { dot.className = 'wiz-step-dot done';    dot.innerHTML = '<i class="fas fa-check text-[10px]"></i>'; }
    if (n === s){ dot.className = 'wiz-step-dot current';  dot.textContent = n; }
    if (n > s)  { dot.className = 'wiz-step-dot todo';     dot.textContent = n; }
  });
  [1,2].forEach(n => { $(`#wline-${n}`)?.classList.toggle('done', n < s); });

  const stepLabels = ['1 of 3 — Demographics', '2 of 3 — Insurance', '3 of 3 — Confirm'];
  $('#wizard-step-label').textContent = `Step ${stepLabels[s-1]}`;

  // Back button
  const btnBack = $('#btn-wiz-back');
  btnBack.classList.toggle('hidden', s === 1);

  // Skip button (step 2 only)
  const btnSkip = $('#btn-wiz-skip');
  btnSkip.classList.toggle('hidden', s !== 2);

  // Next / Submit label
  const btnNext = $('#btn-wiz-next');
  if (s < 3) {
    btnNext.innerHTML = 'Next <i class="fas fa-arrow-right text-xs"></i>';
  } else {
    btnNext.innerHTML = '<i class="fas fa-user-plus text-xs mr-1"></i> Create Patient';
  }

  // If step 3, build summary
  if (s === 3) buildConfirmSummary();
}

function buildConfirmSummary() {
  const fname = $val('p-first-name'), lname = $val('p-last-name');
  const dob   = $val('p-dob'),        gender  = $val('p-gender');
  const phone = $val('p-cell'),       email   = $val('p-email');
  const street= $val('p-street'),     city    = $val('p-city');
  const state = $val('p-state'),      zip     = $val('p-zip');
  const payer = $val('p-ins-payer'),  memberId= $val('p-ins-member-id');

  const [bgText] = avatarColor(`${fname} ${lname}`);
  const initials = `${fname[0]||'?'}${lname[0]||'?'}`.toUpperCase();

  $('#confirm-summary').innerHTML = `
    <div class="flex items-center gap-3 p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
      <div class="w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center font-bold ${bgText}">${initials}</div>
      <div>
        <p class="font-bold text-white">${escHtml(fname)} ${escHtml(lname)}</p>
        <p class="text-xs text-slate-500">DOB: ${formatDate(dob)} · ${capitalizeFirst(gender)}</p>
      </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
      ${phone ? `<div class="flex justify-between p-2 rounded bg-slate-800/30"><span class="text-slate-500">Phone</span><span class="text-slate-300">${escHtml(phone)}</span></div>` : ''}
      ${email ? `<div class="flex justify-between p-2 rounded bg-slate-800/30"><span class="text-slate-500">Email</span><span class="text-slate-300">${escHtml(email)}</span></div>` : ''}
      ${street? `<div class="flex justify-between p-2 rounded bg-slate-800/30 sm:col-span-2"><span class="text-slate-500">Address</span><span class="text-slate-300">${escHtml(street)}, ${escHtml(city)}, ${escHtml(state)} ${escHtml(zip)}</span></div>` : ''}
    </div>
    ${payer ? `
    <div class="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs">
      <p class="font-semibold text-blue-300 mb-1"><i class="fas fa-shield-heart mr-1.5"></i>Insurance</p>
      <div class="grid grid-cols-2 gap-1 text-slate-300">
        <span class="text-slate-500">Payer</span><span>${escHtml(payer)}</span>
        ${memberId ? `<span class="text-slate-500">Member ID</span><span class="font-mono">${escHtml(memberId)}</span>` : ''}
      </div>
    </div>` : `<p class="text-xs text-slate-600 italic p-2">No insurance added</p>`}
  `;
}

function $val(id) { return ($(`#${id}`)?.value || '').trim(); }

function showStepError(step, msg) {
  const el = $(`#step${step}-error`);
  if (!el) return;
  el.classList.remove('hidden');
  el.querySelector('span').textContent = msg;
}
function hideErrors() {
  [1,2,3].forEach(n => {
    const el = $(`#step${n}-error`);
    if (el) el.classList.add('hidden');
  });
}

function validateStep1() {
  const fn  = $val('p-first-name');
  const ln  = $val('p-last-name');
  const dob = $val('p-dob');
  const gen = $val('p-gender');
  if (!fn)  { showStepError(1,'First name is required.'); return false; }
  if (!ln)  { showStepError(1,'Last name is required.'); return false; }
  if (!dob) { showStepError(1,'Date of birth is required.'); return false; }
  if (!gen) { showStepError(1,'Gender is required.'); return false; }
  // DOB sanity
  const age = calcAge(dob);
  if (age < 0 || age > 130) { showStepError(1,'Please enter a valid date of birth.'); return false; }
  return true;
}

function validateStep2() {
  // Step 2 is optional (can skip), but if payer entered, member ID required
  const payer    = $val('p-ins-payer');
  const memberId = $val('p-ins-member-id');
  if (payer && !memberId) {
    showStepError(2,'Member ID is required when insurance is entered.');
    return false;
  }
  return true;
}

async function submitNewPatient() {
  const btn = $('#btn-wiz-next');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner w-4 h-4"></span> Saving…';

  const hasInsurance = !!$val('p-ins-payer') && !!$val('p-ins-member-id');

  const payload = {
    firstName:         $val('p-first-name'),
    lastName:          $val('p-last-name'),
    middleName:        $val('p-middle-name') || undefined,
    dateOfBirth:       $val('p-dob'),
    gender:            $val('p-gender'),
    preferredLanguage: $val('p-language') || 'en',
    phone:             $val('p-cell') || undefined,
    cellPhone:         $val('p-cell') || undefined,
    email:             $val('p-email') || undefined,
    address: {
      street: $val('p-street') || '',
      city:   $val('p-city')   || '',
      state:  $val('p-state')  || 'FL',
      zip:    $val('p-zip')    || '',
    },
    referralSource: $val('p-referral') || undefined,
    ...(($val('p-ec-name')) ? {
      emergencyContact: {
        name:         $val('p-ec-name'),
        relationship: $val('p-ec-rel') || 'Other',
        phone:        $val('p-ec-phone') || '',
      }
    } : {}),
    insurancePlans: hasInsurance ? [{
      priority:         'PRIMARY',
      payerName:        $val('p-ins-payer'),
      payerId:          $val('p-ins-payer-id') || $val('p-ins-payer').toUpperCase().slice(0,8),
      planName:         $val('p-ins-plan') || undefined,
      memberId:         $val('p-ins-member-id'),
      groupNumber:      $val('p-ins-group') || undefined,
      relationship:     $val('p-ins-rel') || 'SELF',
      subscriberName:   $val('p-ins-sub-name') || undefined,
      subscriberDob:    $val('p-ins-sub-dob') || undefined,
      effectiveDate:    $val('p-ins-eff-date') || undefined,
      copay:            $val('p-ins-copay') ? +$val('p-ins-copay') : undefined,
      isActive:         true,
    }] : [],
  };

  try {
    const res = await apiPost('/api/patients', payload);
    closeNewPatientModal();
    showToast(`${res.data.firstName} ${res.data.lastName} — ${res.data.mrn} created`, 'success');
    // Reload table
    await loadPatients(1, '', '');
    // Auto-open profile
    setTimeout(() => openPatientProfile(res.data.id), 400);
  } catch (err) {
    showStepError(3, err.message || 'Failed to create patient.');
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-plus text-xs mr-1"></i> Create Patient';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYER AUTOCOMPLETE
// ─────────────────────────────────────────────────────────────────────────────

function setupPayerAutocomplete() {
  const input    = $('#p-ins-payer');
  const hiddenId = $('#p-ins-payer-id');
  const dropdown = $('#payer-dropdown');

  input.addEventListener('input', () => {
    const q = input.value.toLowerCase().trim();
    if (!q) { dropdown.classList.remove('open'); return; }
    const matches = COMMON_PAYERS.filter(p => p.name.toLowerCase().includes(q)).slice(0,8);
    if (!matches.length) { dropdown.classList.remove('open'); return; }
    dropdown.innerHTML = matches.map(p =>
      `<div class="payer-opt" data-id="${escHtml(p.id)}" data-name="${escHtml(p.name)}">${escHtml(p.name)}</div>`
    ).join('');
    dropdown.classList.add('open');
  });

  dropdown.addEventListener('click', e => {
    const opt = e.target.closest('.payer-opt');
    if (!opt) return;
    input.value    = opt.dataset.name;
    hiddenId.value = opt.dataset.id;
    // Auto-fill subscriber name from patient name
    const sub = $('#p-ins-sub-name');
    if (sub && !sub.value) {
      const fn = $val('p-first-name'), ln = $val('p-last-name');
      if (fn && ln) sub.value = `${fn.toUpperCase()} ${ln.toUpperCase()}`;
    }
    dropdown.classList.remove('open');
  });

  document.addEventListener('click', e => {
    if (!$('#payer-wrap')?.contains(e.target)) dropdown.classList.remove('open');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR FILTERS
// ─────────────────────────────────────────────────────────────────────────────

function setupSidebar() {
  $$('[data-filter]').forEach(el => {
    el.addEventListener('click', () => {
      PS.filter = el.dataset.filter;
      $$('[data-filter]').forEach(e => e.classList.remove('active'));
      el.classList.add('active');
      loadPatients(1, PS.tableQuery, PS.insuranceFilter);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SEARCH (global + table)
// ─────────────────────────────────────────────────────────────────────────────

function setupSearch() {
  // Global header search
  const globalSearch = $('#global-search');
  globalSearch.addEventListener('input', () => {
    clearTimeout(PS.searchDebounce);
    PS.searchDebounce = setTimeout(() => {
      PS.tableQuery = globalSearch.value;
      loadPatients(1, globalSearch.value, PS.insuranceFilter);
    }, 320);
  });

  // Table filter input (mirrors global)
  const tableSearch = $('#table-search');
  tableSearch.addEventListener('input', () => {
    clearTimeout(PS.searchDebounce);
    PS.searchDebounce = setTimeout(() => {
      PS.tableQuery = tableSearch.value;
      loadPatients(1, tableSearch.value, PS.insuranceFilter);
    }, 320);
  });

  // Insurance dropdown filter
  $('#filter-insurance').addEventListener('change', e => {
    PS.insuranceFilter = e.target.value;
    loadPatients(1, PS.tableQuery, PS.insuranceFilter);
  });

  // Keyboard shortcut ⌘K / Ctrl+K
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      globalSearch.focus();
      globalSearch.select();
    }
    // ESC closes modals
    if (e.key === 'Escape') {
      if ($('#modal-profile').classList.contains('open'))      closeProfileModal();
      if ($('#modal-new-patient').classList.contains('open'))  closeNewPatientModal();
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE TABS
// ─────────────────────────────────────────────────────────────────────────────

function setupProfileTabs() {
  document.addEventListener('click', e => {
    const tab = e.target.closest('.profile-tab');
    if (!tab) return;
    const name = tab.dataset.tab;
    $$('.profile-tab').forEach(t => t.classList.remove('active'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $(`#tab-${name}`)?.classList.add('active');
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// WIZARD NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

function setupWizardNav() {
  $('#btn-wiz-next').addEventListener('click', async () => {
    hideErrors();
    if (PS.wizardStep === 1) {
      if (!validateStep1()) return;
      PS.wizardStep = 2;
      updateWizardUI();
    } else if (PS.wizardStep === 2) {
      if (!validateStep2()) return;
      PS.wizardStep = 3;
      updateWizardUI();
    } else if (PS.wizardStep === 3) {
      await submitNewPatient();
    }
  });

  $('#btn-wiz-back').addEventListener('click', () => {
    if (PS.wizardStep > 1) { PS.wizardStep--; updateWizardUI(); }
  });

  $('#btn-wiz-skip').addEventListener('click', () => {
    // Clear insurance fields and skip to confirm
    ['p-ins-payer','p-ins-payer-id','p-ins-plan','p-ins-member-id',
     'p-ins-group','p-ins-sub-name','p-ins-sub-dob','p-ins-copay'].forEach(id => {
      const el = $(`#${id}`); if (el) el.value = '';
    });
    PS.wizardStep = 3;
    updateWizardUI();
  });

  $('#btn-close-new-patient').addEventListener('click', closeNewPatientModal);
  $('#modal-new-patient').addEventListener('click', e => {
    if (e.target === $('#modal-new-patient')) closeNewPatientModal();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MISC HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function capitalizeFirst(str) {
  if (!str) return '—';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  // Wire up static buttons
  $('#btn-new-patient').addEventListener('click', openNewPatientModal);
  $('#btn-close-profile').addEventListener('click', closeProfileModal);
  $('#btn-intake-link').addEventListener('click', () => {
    window.open('/intake?demo=true', '_blank');
  });
  $('#modal-profile').addEventListener('click', e => {
    if (e.target === $('#modal-profile')) closeProfileModal();
  });
  $('#btn-refresh').addEventListener('click', () => loadPatients(PS.page, PS.tableQuery, PS.insuranceFilter));

  // Pagination
  $('#btn-prev').addEventListener('click', () => loadPatients(PS.page - 1, PS.tableQuery, PS.insuranceFilter));
  $('#btn-next').addEventListener('click', () => loadPatients(PS.page + 1, PS.tableQuery, PS.insuranceFilter));

  setupSearch();
  setupSidebar();
  setupProfileTabs();
  setupWizardNav();
  setupPayerAutocomplete();

  // Load data
  await loadPatients(1, '', '');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Expose for inline onclick attributes
window.openNewPatientModal   = openNewPatientModal;
window.openPatientProfile    = openPatientProfile;
