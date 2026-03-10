// OculoFlow — Patient Portal Frontend  (Phase 4A + B3)
// Supports: DOB login, magic-link/OTP, password login, password reset,
//           appointments, records/exams, optical, billing, messages, settings
'use strict';

// ── State ──────────────────────────────────────────────────────────────────────
const portal = {
  sessionId: null,
  patient: null,
  dashboard: null,
  apptRequests: [],
  rxList: [],
  exams: [],
  opticalOrders: [],
  billing: { totalBalance: 0, items: [] },
  threads: [],
  notifPrefs: {},
  account: {},
  mlEmail: null,   // magic-link email being verified
};

// ── Helpers ────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fmt$ = n => n == null ? '—' : `$${Number(n).toFixed(2)}`;
function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return d; }
}
function fmtDateTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return d; }
}
function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function badge(text, cls) {
  return `<span class="badge badge-${cls}">${text.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase())}</span>`;
}
function rxFmt(v) {
  if (v == null) return '—';
  const s = Number(v).toFixed(2);
  return v > 0 ? `+${s}` : s;
}

function showToast(msg, ok = true) {
  $('toast-icon').className = ok ? 'fas fa-check-circle text-emerald-400 text-lg' : 'fas fa-exclamation-circle text-red-400 text-lg';
  $('toast-msg').textContent = msg;
  $('toast').classList.remove('hidden');
  setTimeout(() => $('toast').classList.add('hidden'), 4000);
}
function closeModal(id) { $(id).classList.add('hidden'); }
function showLoginError(msg) {
  const el = $('login-error');
  el.textContent = msg;
  el.classList.remove('hidden');
  $('login-success').classList.add('hidden');
  setTimeout(() => el.classList.add('hidden'), 6000);
}
function showLoginSuccess(msg) {
  const el = $('login-success');
  el.textContent = msg;
  el.classList.remove('hidden');
  $('login-error').classList.add('hidden');
}

// ── API ────────────────────────────────────────────────────────────────────────
async function api(method, path, body, sessionId) {
  const headers = { 'Content-Type': 'application/json' };
  if (sessionId || portal.sessionId) headers['X-Portal-Session'] = sessionId ?? portal.sessionId;
  try {
    const res = await fetch(`/api/portal${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ── Login Tab Switching ────────────────────────────────────────────────────────
function switchLoginTab(tab, btn) {
  ['dob','email','password'].forEach(t => {
    $(`login-panel-${t}`).classList.add('hidden');
    const b = $(`ltab-${t}`);
    if (b) { b.classList.remove('active'); }
  });
  $(`login-panel-${tab}`).classList.remove('hidden');
  if (btn) btn.classList.add('active');
  $('login-error').classList.add('hidden');
  $('login-success').classList.add('hidden');
  $('forgot-pw-panel').classList.add('hidden');
}

// ── DOB Login ─────────────────────────────────────────────────────────────────
async function doLogin() {
  const lastName = $('login-lastname').value.trim();
  const dob = $('login-dob').value;
  if (!lastName || !dob) { showLoginError('Last name and date of birth are required.'); return; }
  const d = await api('POST', '/auth/login', { lastName, dob });
  if (!d.success) { showLoginError(d.error ?? 'Login failed. Check your last name and date of birth.'); return; }
  saveSession(d.data);
  enterPortal();
}

// ── Demo Session ──────────────────────────────────────────────────────────────
async function doDemo() {
  const d = await api('POST', '/auth/demo', {});
  if (!d.success) { showLoginError(d.error ?? 'Demo failed'); return; }
  saveSession(d.data);
  enterPortal();
}

// ── Magic Link ────────────────────────────────────────────────────────────────
async function doMagicLink() {
  const email = $('ml-email').value.trim();
  if (!email) { showLoginError('Email address required.'); return; }
  const d = await api('POST', '/auth/magic-link', { email });
  if (!d.success) { showLoginError(d.error ?? 'Failed to send link'); return; }

  portal.mlEmail = email;
  $('ml-step-1').classList.add('hidden');
  $('ml-step-2').classList.remove('hidden');

  // Demo mode: show OTP hint
  if (d.data?.demo && d.data?.otp) {
    const hint = $('ml-demo-hint');
    hint.textContent = `Demo code: ${d.data.otp}`;
    hint.classList.remove('hidden');
  }
}
function resetMagicLink() {
  portal.mlEmail = null;
  $('ml-step-1').classList.remove('hidden');
  $('ml-step-2').classList.add('hidden');
  $('ml-demo-hint').classList.add('hidden');
  $('ml-otp').value = '';
}
async function doMagicVerify() {
  const otp = $('ml-otp').value.trim();
  if (!otp || otp.length < 6) { showLoginError('Enter the 6-digit code from your email.'); return; }
  const d = await api('POST', '/auth/magic-verify', { email: portal.mlEmail, otp });
  if (!d.success) { showLoginError(d.error ?? 'Invalid or expired code.'); return; }
  saveSession(d.data);
  enterPortal();
}

// ── Password Login ────────────────────────────────────────────────────────────
async function doPasswordLogin() {
  const email = $('pw-email').value.trim();
  const password = $('pw-password').value;
  if (!email || !password) { showLoginError('Email and password required.'); return; }
  const d = await api('POST', '/auth/password-login', { email, password });
  if (!d.success) { showLoginError(d.error ?? 'Invalid email or password.'); return; }
  saveSession(d.data);
  enterPortal();
}

// ── Forgot / Reset Password ───────────────────────────────────────────────────
function showForgotPassword() {
  $('login-panel-password').classList.add('hidden');
  $('forgot-pw-panel').classList.remove('hidden');
}
function hideForgotPassword() {
  $('forgot-pw-panel').classList.add('hidden');
  $('login-panel-password').classList.remove('hidden');
}
async function doPasswordReset() {
  const email = $('forgot-email').value.trim();
  if (!email) { showLoginError('Email required.'); return; }
  const d = await api('POST', '/auth/password-reset', { email });
  if (!d.success) { showLoginError(d.error ?? 'Failed'); return; }
  showLoginSuccess(d.data?.demo
    ? `Demo reset token: ${d.data.token}. Use magic-link tab to verify, then you can set a new password.`
    : 'Check your email for reset instructions.');
  hideForgotPassword();
}

// ── Logout ────────────────────────────────────────────────────────────────────
async function doLogout() {
  if (portal.sessionId) await api('POST', '/auth/logout', { sessionId: portal.sessionId });
  clearSession();
  $('portal-app').classList.add('hidden');
  $('login-screen').classList.remove('hidden');
  $('portal-app').classList.remove('flex');
}

// ── Session Storage ───────────────────────────────────────────────────────────
function saveSession(session) {
  portal.sessionId = session.sessionId;
  portal.patient = session;
  try { sessionStorage.setItem('of_portal_session', JSON.stringify(session)); } catch {}
}
function clearSession() {
  portal.sessionId = null;
  portal.patient = null;
  try { sessionStorage.removeItem('of_portal_session'); } catch {}
}
async function tryAutoLogin() {
  try {
    const raw = sessionStorage.getItem('of_portal_session');
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved?.sessionId) return false;
    if (new Date(saved.expiresAt) < new Date()) { clearSession(); return false; }
    const d = await api('GET', '/auth/session', null, saved.sessionId);
    if (!d.success) { clearSession(); return false; }
    saveSession(d.data);
    return true;
  } catch { return false; }
}

// ── Portal Entry ──────────────────────────────────────────────────────────────
function enterPortal() {
  $('login-screen').classList.add('hidden');
  $('portal-app').classList.remove('hidden');
  $('portal-app').classList.add('flex');

  const p = portal.patient;
  $('topbar-name').textContent = p.patientName ?? '—';
  $('topbar-dob').textContent = p.patientDob ? fmtDate(p.patientDob) : '';
  $('topbar-avatar').textContent = initials(p.patientName ?? '');

  loadPortalDashboard();
}

// ── Tab Switching ─────────────────────────────────────────────────────────────
function showPortalTab(tab, btnEl) {
  document.querySelectorAll('.portal-tab').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  const el = $(`portal-tab-${tab}`);
  if (el) el.classList.remove('hidden');

  // Find correct button if not passed
  if (btnEl) {
    btnEl.classList.add('active');
  } else {
    document.querySelectorAll('.nav-tab').forEach(b => {
      if (b.getAttribute('onclick')?.includes(`'${tab}'`)) b.classList.add('active');
    });
  }

  if (tab === 'appointments') loadApptRequests();
  else if (tab === 'records')  loadRecords();
  else if (tab === 'optical')  loadOpticalOrders();
  else if (tab === 'billing')  loadBilling();
  else if (tab === 'messages') loadMessages();
  else if (tab === 'settings') loadSettings();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadPortalDashboard() {
  const d = await api('GET', '/dashboard');
  if (!d.success) return;
  portal.dashboard = d.data;
  renderOverview(d.data);
}

function renderOverview(d) {
  const p = d.patient ?? {};
  $('overview-name').textContent = p.name ?? portal.patient?.patientName ?? '—';
  $('overview-subtitle').textContent = p.dob ? `Date of Birth: ${fmtDate(p.dob)}` : 'Your health summary';

  // KPIs
  const nextAppt = d.upcomingAppointments?.[0];
  $('kpi-next-appt').textContent = nextAppt ? fmtDate(nextAppt.date) : 'None scheduled';
  $('kpi-rx').innerHTML = d.activeRx?.length
    ? `<span class="text-emerald-400">${d.activeRx.length} active</span>` : '<span class="text-slate-400">None</span>';

  const bal = d.balance?.totalBalance ?? 0;
  $('kpi-balance').innerHTML = bal > 0
    ? `<span class="text-red-400">${fmt$(bal)}</span>`
    : `<span class="text-emerald-400">${fmt$(bal)}</span>`;

  const unread = d.unreadMessages ?? 0;
  $('kpi-msgs').innerHTML = unread > 0
    ? `<span class="text-amber-400">${unread} unread</span>` : '<span class="text-emerald-400">All read</span>';

  if (unread > 0) {
    $('msg-badge').textContent = unread;
    $('msg-badge').classList.remove('hidden');
  }

  // Upcoming appointments
  const apptEl = $('upcoming-appts-list');
  if (d.upcomingAppointments?.length) {
    apptEl.innerHTML = d.upcomingAppointments.map(a => `
      <div class="flex items-start gap-3 py-2 border-b border-slate-700/30 last:border-0">
        <div class="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center shrink-0 text-center">
          <i class="fas fa-calendar text-blue-400 text-sm"></i>
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-white truncate">${a.appointmentType?.replace(/_/g,' ') ?? 'Appointment'}</p>
          <p class="text-xs text-slate-400">${fmtDate(a.date)}${a.time ? ' at '+a.time : ''} · ${a.providerName ?? 'Care Team'}</p>
        </div>
        ${badge(a.status??'scheduled','blue')}
      </div>`).join('');
  } else {
    apptEl.innerHTML = '<p class="text-sm text-slate-500 text-center py-4">No upcoming appointments</p>';
  }

  // Active Rx snapshot
  const rxEl = $('active-rx-content');
  const rx = d.activeRx?.[0];
  if (rx) {
    rxEl.innerHTML = `
      <div class="grid grid-cols-3 text-xs gap-2 mb-2">
        ${['od','os'].map(eye => `
        <div class="col-span-3 md:col-span-1">
          <p class="font-semibold text-slate-300 uppercase mb-1">${eye.toUpperCase()}</p>
          <table class="text-slate-400 w-full"><tbody>
            <tr><td class="pr-2">Sphere</td><td class="text-white">${rxFmt(rx[eye]?.sphere)}</td></tr>
            <tr><td class="pr-2">Cylinder</td><td class="text-white">${rxFmt(rx[eye]?.cylinder)}</td></tr>
            <tr><td class="pr-2">Axis</td><td class="text-white">${rx[eye]?.axis ?? '—'}°</td></tr>
            ${rx[eye]?.add != null ? `<tr><td class="pr-2">Add</td><td class="text-white">${rxFmt(rx[eye].add)}</td></tr>` : ''}
          </tbody></table>
        </div>`).join('')}
      </div>
      <p class="text-xs text-slate-500">Prescription from ${fmtDate(rx.examDate)}</p>`;
  } else {
    rxEl.innerHTML = '<p class="text-sm text-slate-500">No prescription on file</p>';
  }

  // Recent exam
  const examEl = $('recent-exam-content');
  const exam = d.recentExams?.[0];
  if (exam) {
    examEl.innerHTML = `
      <div class="space-y-1">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-white font-medium">${fmtDate(exam.examDate)}</span>
          ${badge(exam.examType??'exam','purple')}
          ${exam.isSigned ? badge('signed','green') : badge('draft','slate')}
        </div>
        <p class="text-slate-400">${exam.providerName ?? 'Your Care Team'}</p>
        ${exam.diagnoses?.length ? `<p class="text-xs text-slate-500 mt-1">${exam.diagnoses.map(d => `${d.code} — ${d.description}`).join(' · ')}</p>` : ''}
      </div>`;
  } else {
    examEl.innerHTML = '<p class="text-sm text-slate-500">No visit history found</p>';
  }
}

// ── Appointments ──────────────────────────────────────────────────────────────
async function loadApptRequests() {
  const d = await api('GET', '/appointments');
  if (!d.success) { $('appt-requests-list').innerHTML = '<div class="card text-red-400 text-sm">Failed to load requests</div>'; return; }
  portal.apptRequests = d.data ?? [];
  renderApptRequests();
}

function renderApptRequests() {
  const el = $('appt-requests-list');
  if (!portal.apptRequests.length) {
    el.innerHTML = `<div class="card text-center py-10 text-slate-500">
      <i class="fas fa-calendar-plus text-3xl mb-2 opacity-30"></i>
      <p>No appointment requests yet</p>
      <button onclick="openNewApptModal()" class="btn-primary mx-auto mt-3"><i class="fas fa-plus"></i>New Request</button>
    </div>`;
    return;
  }
  el.innerHTML = portal.apptRequests.map(r => {
    const urgCls = r.urgency === 'urgent' ? 'red' : r.urgency === 'soon' ? 'yellow' : 'blue';
    const statusCls = r.status === 'PENDING' ? 'yellow' : r.status === 'CONFIRMED' ? 'green' : r.status === 'CANCELLED' ? 'slate' : 'blue';
    return `<div class="card space-y-2">
      <div class="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p class="font-medium text-white">${(r.requestType??'Appointment').replace(/_/g,' ')}</p>
          <p class="text-xs text-slate-400 mt-0.5">${r.reason}</p>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          ${badge(r.urgency??'routine', urgCls)}
          ${badge(r.status??'pending', statusCls)}
        </div>
      </div>
      ${r.preferredDates?.length ? `<p class="text-xs text-slate-500"><i class="fas fa-calendar-alt mr-1"></i>Preferred: ${r.preferredDates.map(d => fmtDate(d)).join(', ')}</p>` : ''}
      <div class="flex items-center justify-between">
        <p class="text-xs text-slate-600">Submitted ${fmtDateTime(r.createdAt)}</p>
        ${r.status === 'PENDING' ? `<button onclick="cancelApptRequest('${r.id}')" class="btn-ghost text-red-400 hover:text-red-300 text-xs"><i class="fas fa-times mr-1"></i>Cancel</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

function openNewApptModal() {
  $('modal-new-appt').classList.remove('hidden');
  const minDate = new Date().toISOString().slice(0,10);
  ['appt-date1','appt-date2','appt-date3'].forEach(id => { $(id).min = minDate; $(id).value = ''; });
}
function setUrgency(val) {
  ['routine','soon','urgent'].forEach(u => {
    const lbl = $(`urg-${u}-lbl`);
    if (lbl) {
      lbl.classList.toggle('border-blue-500', u === val && val === 'routine');
      lbl.classList.toggle('border-amber-500', u === val && val === 'soon');
      lbl.classList.toggle('border-red-500', u === val && val === 'urgent');
      lbl.classList.toggle('border-slate-700', u !== val);
    }
  });
}
async function submitApptRequest() {
  const reason = $('appt-reason').value.trim();
  if (!reason) { showToast('Please provide a reason for the visit', false); return; }
  const preferredDates = ['appt-date1','appt-date2','appt-date3'].map(id => $(id).value).filter(Boolean);
  const preferredTimes = [...document.querySelectorAll('.appt-time-cb:checked')].map(cb => cb.value);
  const urgency = document.querySelector('input[name="urgency"]:checked')?.value ?? 'routine';
  const d = await api('POST', '/appointments', {
    requestType: $('appt-type').value,
    reason, urgency, preferredDates, preferredTimes,
    preferredProvider: $('appt-provider').value,
    patientNotes: $('appt-notes').value,
  });
  if (!d.success) { showToast(d.error ?? 'Failed to submit', false); return; }
  showToast('Appointment request submitted!');
  closeModal('modal-new-appt');
  $('appt-reason').value = '';
  loadApptRequests();
}
async function cancelApptRequest(id) {
  if (!confirm('Cancel this appointment request?')) return;
  const d = await api('POST', `/appointments/${id}/cancel`, {});
  if (!d.success) { showToast(d.error ?? 'Failed to cancel', false); return; }
  showToast('Request cancelled');
  loadApptRequests();
}

// ── Records ───────────────────────────────────────────────────────────────────
function switchRecordTab(tab, btn) {
  ['prescriptions','visits'].forEach(t => {
    $(`record-panel-${t}`)?.classList.add('hidden');
    $(`rtab-${t}`)?.classList.remove('bg-blue-600','text-white');
    $(`rtab-${t}`)?.classList.add('bg-slate-700','text-slate-200');
  });
  $(`record-panel-${tab}`)?.classList.remove('hidden');
  if (btn) { btn.classList.add('bg-blue-600','text-white'); btn.classList.remove('bg-slate-700','text-slate-200'); }
}

async function loadRecords() {
  // Load both in parallel
  const [rxRes, examRes] = await Promise.all([
    api('GET', '/rx'),
    api('GET', '/exams'),
  ]);
  portal.rxList = rxRes.data ?? [];
  portal.exams = examRes.data ?? [];
  renderRecordsRx();
  renderRecordsExams();
}

function renderRecordsRx() {
  const el = $('records-rx-list');
  if (!portal.rxList.length) {
    el.innerHTML = '<div class="card text-center text-slate-500 py-6">No prescriptions on file</div>';
    return;
  }
  el.innerHTML = portal.rxList.map(rx => `
    <div class="card space-y-3">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <p class="font-medium text-white">${rx.prescriptionType?.replace(/_/g,' ') ?? 'Prescription'}</p>
        <div class="flex gap-2">${badge(rx.status??'active','green')}</div>
      </div>
      <p class="text-xs text-slate-400">${fmtDate(rx.examDate)} · ${rx.providerName ?? 'Your Care Team'}</p>
      <div class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead><tr class="text-slate-500 border-b border-slate-700">
            <th class="text-left pb-1 pr-3">Eye</th>
            <th class="text-right pb-1 pr-3">Sphere</th>
            <th class="text-right pb-1 pr-3">Cylinder</th>
            <th class="text-right pb-1 pr-3">Axis</th>
            <th class="text-right pb-1 pr-3">Add</th>
            <th class="text-right pb-1">VA</th>
          </tr></thead>
          <tbody>
            ${['od','os'].map(eye => `<tr class="border-t border-slate-700/40">
              <td class="py-1 pr-3 font-medium text-slate-300">${eye.toUpperCase()}</td>
              <td class="text-right py-1 pr-3 text-white font-mono">${rxFmt(rx[eye]?.sphere)}</td>
              <td class="text-right py-1 pr-3 text-white font-mono">${rxFmt(rx[eye]?.cylinder)}</td>
              <td class="text-right py-1 pr-3 text-white font-mono">${rx[eye]?.axis ?? '—'}°</td>
              <td class="text-right py-1 pr-3 text-white font-mono">${rxFmt(rx[eye]?.add)}</td>
              <td class="text-right py-1 text-white font-mono">${rx[eye]?.va ?? '—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`).join('');
}

function renderRecordsExams() {
  const el = $('records-exams-list');
  if (!portal.exams.length) {
    el.innerHTML = '<div class="card text-center text-slate-500 py-6">No visit history</div>';
    return;
  }
  el.innerHTML = portal.exams.map(e => `
    <div class="card space-y-2 cursor-pointer hover:border-blue-500/50 transition-colors" onclick="openExamDetail('${e.id}')">
      <div class="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p class="font-medium text-white">${fmtDate(e.examDate)}</p>
          <p class="text-xs text-slate-400">${e.providerName ?? 'Your Care Team'}</p>
        </div>
        <div class="flex gap-1 flex-wrap">
          ${badge(e.examType??'exam','purple')}
          ${e.isSigned ? badge('signed','green') : badge('unsigned','slate')}
        </div>
      </div>
      ${e.chiefComplaint ? `<p class="text-xs text-slate-400">Chief complaint: ${e.chiefComplaint}</p>` : ''}
      ${e.diagnoses?.length ? `<div class="flex flex-wrap gap-1">${e.diagnoses.slice(0,3).map(d => `<span class="text-xs font-mono text-blue-400">${d.code}</span>`).join(' ')}</div>` : ''}
      <p class="text-xs text-blue-400"><i class="fas fa-chevron-right mr-1 text-xs"></i>View summary</p>
    </div>`).join('');
}

async function openExamDetail(examId) {
  $('exam-detail-body').innerHTML = '<div class="text-center text-slate-500 py-6"><i class="fas fa-spinner fa-spin text-xl"></i></div>';
  $('modal-exam-detail').classList.remove('hidden');

  const d = await api('GET', `/exams/${examId}`);
  if (!d.success) { $('exam-detail-body').innerHTML = `<p class="text-red-400">${d.error}</p>`; return; }
  const e = d.data;
  $('exam-detail-title').textContent = `Visit Summary — ${fmtDate(e.examDate)}`;

  let html = `
    <div class="space-y-4">
      <div class="flex flex-wrap gap-2">
        ${badge(e.examType??'exam','purple')}
        ${e.isSigned ? badge('signed','green') : badge('unsigned','slate')}
        ${e.hasRx ? badge('rx available','blue') : ''}
      </div>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div><p class="text-slate-500 text-xs uppercase mb-1">Provider</p><p class="text-white">${e.providerName ?? '—'}</p></div>
        <div><p class="text-slate-500 text-xs uppercase mb-1">Date</p><p class="text-white">${fmtDate(e.examDate)}</p></div>
        ${e.chiefComplaint ? `<div class="col-span-2"><p class="text-slate-500 text-xs uppercase mb-1">Chief Complaint</p><p class="text-white">${e.chiefComplaint}</p></div>` : ''}
      </div>
      ${e.diagnoses?.length ? `
        <div>
          <p class="text-slate-500 text-xs uppercase mb-2">Diagnoses</p>
          <div class="space-y-1">
            ${e.diagnoses.map(d => `<p class="text-sm"><span class="font-mono text-blue-400 mr-2">${d.code}</span><span class="text-slate-300">${d.description}</span></p>`).join('')}
          </div>
        </div>` : ''}`;

  if (e.planInstructions) {
    html += `<div><p class="text-slate-500 text-xs uppercase mb-1">Instructions</p><p class="text-sm text-white">${e.planInstructions}</p></div>`;
  }
  if (e.followUpWeeks) {
    html += `<div><p class="text-slate-500 text-xs uppercase mb-1">Follow-Up</p><p class="text-sm text-white">In ${e.followUpWeeks} weeks</p></div>`;
  }

  if (e.refraction) {
    html += `<div>
      <p class="text-slate-500 text-xs uppercase mb-2">Refraction</p>
      <table class="w-full text-xs"><thead><tr class="text-slate-500 border-b border-slate-700">
        <th class="text-left pb-1 pr-2">Eye</th><th class="text-right pb-1 pr-2">Sphere</th>
        <th class="text-right pb-1 pr-2">Cyl</th><th class="text-right pb-1 pr-2">Axis</th>
        <th class="text-right pb-1">Add</th>
      </tr></thead><tbody>
        ${['od','os'].map(eye => `<tr class="border-t border-slate-700/40">
          <td class="py-1 pr-2 text-slate-300 font-medium">${eye.toUpperCase()}</td>
          <td class="text-right py-1 pr-2 text-white font-mono">${rxFmt(e.refraction[eye]?.sphere)}</td>
          <td class="text-right py-1 pr-2 text-white font-mono">${rxFmt(e.refraction[eye]?.cylinder)}</td>
          <td class="text-right py-1 pr-2 text-white font-mono">${e.refraction[eye]?.axis ?? '—'}°</td>
          <td class="text-right py-1 text-white font-mono">${rxFmt(e.refraction[eye]?.add)}</td>
        </tr>`).join('')}
      </tbody></table>
    </div>`;
  }

  html += '</div>';
  $('exam-detail-body').innerHTML = html;
}

// ── Optical ───────────────────────────────────────────────────────────────────
async function loadOpticalOrders() {
  const d = await api('GET', '/optical-orders');
  if (!d.success) return;
  portal.opticalOrders = d.data ?? [];
  renderOpticalOrders();
}

function renderOpticalOrders() {
  const el = $('optical-orders-list');
  if (!portal.opticalOrders.length) {
    el.innerHTML = '<div class="card text-center text-slate-500 py-8"><i class="fas fa-glasses text-3xl mb-2 opacity-30"></i><p>No optical orders on file</p></div>';
    return;
  }
  el.innerHTML = portal.opticalOrders.map(o => {
    const statusCls = o.status === 'DISPENSED' ? 'green' : o.status === 'ORDERED' ? 'blue' : o.status === 'READY' ? 'yellow' : 'slate';
    return `<div class="card space-y-3">
      <div class="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p class="font-semibold text-white">${o.productName ?? o.orderType?.replace(/_/g,' ') ?? 'Optical Order'}</p>
          <p class="text-xs text-slate-400">Ordered ${fmtDate(o.orderDate)}</p>
        </div>
        ${badge(o.status??'ordered', statusCls)}
      </div>
      ${o.brand ? `<p class="text-xs text-slate-400"><i class="fas fa-tag mr-1"></i>${o.brand}${o.style ? ' — '+o.style : ''}${o.color ? ' · '+o.color : ''}</p>` : ''}
      ${o.estimatedReady ? `<p class="text-xs text-slate-400"><i class="fas fa-clock mr-1"></i>Est. ready ${fmtDate(o.estimatedReady)}</p>` : ''}
      ${o.totalAmount != null ? `<p class="text-xs text-emerald-400 font-medium"><i class="fas fa-dollar-sign mr-1"></i>${fmt$(o.totalAmount)}</p>` : ''}
    </div>`;
  }).join('');
}

// ── Billing ───────────────────────────────────────────────────────────────────
async function loadBilling() {
  const d = await api('GET', '/balance');
  if (!d.success) return;
  portal.billing = d.data ?? { totalBalance: 0, items: [] };
  renderBilling();
}

function renderBilling() {
  const bal = portal.billing.totalBalance ?? 0;
  const balEl = $('billing-total-balance');
  balEl.textContent = fmt$(bal);
  balEl.className = `text-3xl font-bold mt-1 ${bal > 0 ? 'text-red-400' : 'text-emerald-400'}`;

  const el = $('billing-items-list');
  if (!portal.billing.items?.length) {
    el.innerHTML = '<div class="card text-center text-slate-500 py-8"><i class="fas fa-file-invoice text-3xl mb-2 opacity-30"></i><p>No outstanding balance</p></div>';
    return;
  }
  el.innerHTML = portal.billing.items.map(item => `
    <div class="card space-y-2">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <p class="font-medium text-white">${item.description ?? 'Visit'}</p>
        ${badge(item.status,'yellow')}
      </div>
      <div class="grid grid-cols-3 gap-2 text-xs">
        <div><p class="text-slate-500 mb-0.5">Service Date</p><p class="text-white">${fmtDate(item.serviceDate)}</p></div>
        <div><p class="text-slate-500 mb-0.5">Charged</p><p class="text-white">${fmt$(item.totalCharge)}</p></div>
        <div><p class="text-slate-500 mb-0.5">Your Balance</p><p class="text-red-400 font-semibold">${fmt$(item.patientBalance)}</p></div>
      </div>
    </div>`).join('');
}

function openPaymentModal() {
  $('payment-balance').textContent = fmt$(portal.billing.totalBalance);
  $('payment-amount').value = (portal.billing.totalBalance ?? 0).toFixed(2);
  $('modal-payment').classList.remove('hidden');
}
async function submitPayment() {
  showToast('Payment submitted (demo — no charge processed)');
  closeModal('modal-payment');
}

// ── Messages ──────────────────────────────────────────────────────────────────
async function loadMessages() {
  const d = await api('GET', '/messages');
  if (!d.success) return;
  portal.threads = d.data ?? [];
  renderThreadList();
}

function renderThreadList() {
  const el = $('thread-list');
  if (!portal.threads.length) {
    el.innerHTML = '<div class="card text-center text-slate-500 py-6 text-sm">No messages yet</div>';
    return;
  }
  el.innerHTML = portal.threads.map(t => `
    <button onclick="openThread('${t.threadId}')" class="card w-full text-left hover:border-blue-500/40 transition-colors ${t.unreadCount > 0 ? 'border-blue-500/40' : ''}">
      <div class="flex items-start gap-2">
        <div class="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-xs font-bold text-blue-400 shrink-0">
          <i class="fas fa-comment-medical text-xs"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-1">
            <p class="text-sm font-medium text-white truncate">${t.subject}</p>
            ${t.unreadCount > 0 ? `<span class="w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center text-white shrink-0">${t.unreadCount}</span>` : ''}
          </div>
          <p class="text-xs text-slate-500 truncate">${t.category?.replace(/_/g,' ') ?? 'General'}</p>
          <p class="text-xs text-slate-600">${fmtDateTime(t.lastMessageAt)}</p>
        </div>
      </div>
    </button>`).join('');
}

async function openThread(threadId) {
  const detail = $('thread-detail');
  detail.innerHTML = '<div class="flex-1 flex items-center justify-center"><i class="fas fa-spinner fa-spin text-slate-500 text-xl"></i></div>';
  detail.classList.remove('hidden');
  detail.classList.add('flex','flex-col');

  const d = await api('GET', `/messages/${threadId}`);
  if (!d.success) { detail.innerHTML = `<p class="text-red-400 p-4">${d.error}</p>`; return; }
  const messages = d.data ?? [];
  const thread = portal.threads.find(t => t.threadId === threadId);

  detail.innerHTML = `
    <div class="p-4 border-b border-slate-700/50 flex items-center gap-2">
      <div>
        <p class="font-semibold text-white text-sm">${thread?.subject ?? 'Conversation'}</p>
        <p class="text-xs text-slate-500">${thread?.category?.replace(/_/g,' ') ?? ''}</p>
      </div>
    </div>
    <div class="flex-1 overflow-y-auto p-4 space-y-3" id="msg-bubbles">
      ${messages.map(m => `
        <div class="${m.fromPatient ? 'flex justify-end' : 'flex justify-start'}">
          <div class="${m.fromPatient ? 'msg-bubble-patient' : 'msg-bubble-staff'} max-w-sm">
            <p class="text-xs font-medium ${m.fromPatient ? 'text-blue-300' : 'text-slate-400'} mb-1">${m.senderName ?? (m.fromPatient ? 'You' : 'Care Team')}</p>
            <p class="text-sm text-white">${m.body}</p>
            <p class="text-xs text-slate-500 mt-1 text-right">${fmtDateTime(m.sentAt)}</p>
          </div>
        </div>`).join('')}
    </div>
    <div class="p-3 border-t border-slate-700/50 flex gap-2">
      <textarea id="reply-input-${threadId}" class="input-field flex-1 resize-none h-16 text-sm" placeholder="Type a reply…"></textarea>
      <button onclick="sendReply('${threadId}')" class="btn-primary self-end"><i class="fas fa-paper-plane"></i></button>
    </div>`;

  // Reload thread list to clear unread badge
  const t = portal.threads.find(t => t.threadId === threadId);
  if (t) t.unreadCount = 0;
  renderThreadList();
}

async function sendReply(threadId) {
  const input = $(`reply-input-${threadId}`);
  const body = input.value.trim();
  if (!body) return;
  const d = await api('POST', '/messages', {
    subject: 'Re: message', body, category: 'GENERAL', threadId,
  });
  if (!d.success) { showToast(d.error ?? 'Failed to send', false); return; }
  input.value = '';
  await openThread(threadId);
}

function openNewMsgModal() { $('modal-new-msg').classList.remove('hidden'); }
async function submitMessage() {
  const subject = $('msg-subject').value.trim();
  const body = $('msg-body').value.trim();
  const category = $('msg-category').value;
  if (!subject || !body) { showToast('Subject and message required', false); return; }
  const d = await api('POST', '/messages', { subject, body, category });
  if (!d.success) { showToast(d.error ?? 'Failed', false); return; }
  showToast('Message sent!');
  closeModal('modal-new-msg');
  $('msg-subject').value = '';
  $('msg-body').value = '';
  loadMessages();
}

// ── Settings ──────────────────────────────────────────────────────────────────
async function loadSettings() {
  const p = portal.patient;
  $('settings-name').textContent = p?.patientName ?? '—';
  $('settings-dob').textContent = p?.patientDob ? fmtDate(p.patientDob) : '—';

  // Load account info
  const aRes = await api('GET', '/auth/account');
  if (aRes.success) {
    portal.account = aRes.data ?? {};
    $('settings-email').textContent = aRes.data?.email ?? p?.patientEmail ?? '—';
    $('settings-login-method').textContent = (aRes.data?.loginMethod ?? 'dob').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  }

  // Load notification prefs
  const nRes = await api('GET', '/notifications/prefs');
  if (nRes.success) {
    portal.notifPrefs = nRes.data ?? {};
    applyNotifPrefsToUI(nRes.data);
  }
}

function applyNotifPrefsToUI(prefs) {
  ['appointmentReminders','recallNotices','billingAlerts','messageNotifications'].forEach(key => {
    const btn = document.querySelector(`[data-key="${key}"]`);
    if (!btn) return;
    const on = prefs[key] !== false;
    btn.dataset.on = on;
    btn.classList.toggle('bg-blue-600', on);
    btn.classList.toggle('bg-slate-700', !on);
    btn.querySelector('.toggle-thumb').classList.toggle('translate-x-5', on);
    btn.querySelector('.toggle-thumb').classList.toggle('translate-x-0.5', !on);
  });
  const channel = $('notif-channel');
  if (channel && prefs.preferredChannel) channel.value = prefs.preferredChannel;
}

function togglePref(btn, key) {
  const on = btn.dataset.on !== 'true';
  btn.dataset.on = on;
  btn.classList.toggle('bg-blue-600', on);
  btn.classList.toggle('bg-slate-700', !on);
  btn.querySelector('.toggle-thumb').classList.toggle('translate-x-5', on);
  btn.querySelector('.toggle-thumb').classList.toggle('translate-x-0.5', !on);
  portal.notifPrefs[key] = on;
}

async function saveNotifPrefs() {
  const prefs = {
    ...portal.notifPrefs,
    preferredChannel: $('notif-channel').value,
  };
  const d = await api('PATCH', '/notifications/prefs', prefs);
  showToast(d.success ? 'Preferences saved!' : (d.error ?? 'Failed'), d.success);
}

async function changePassword() {
  const current = $('settings-current-pw').value;
  const newPw = $('settings-new-pw').value;
  const confirm = $('settings-confirm-pw').value;
  if (!current || !newPw) { showToast('Current and new password required', false); return; }
  if (newPw.length < 8) { showToast('Password must be at least 8 characters', false); return; }
  if (newPw !== confirm) { showToast('Passwords do not match', false); return; }
  const d = await api('PATCH', '/auth/account', { currentPassword: current, newPassword: newPw });
  if (!d.success) { showToast(d.error ?? 'Failed to update password', false); return; }
  showToast('Password updated!');
  $('settings-current-pw').value = '';
  $('settings-new-pw').value = '';
  $('settings-confirm-pw').value = '';
}

// ── Init ──────────────────────────────────────────────────────────────────────
(async () => {
  // Suppress auth-nav.js redirect — portal has its own auth
  window.__PORTAL_PAGE__ = true;

  // Try auto-login from saved session
  const ok = await tryAutoLogin();
  if (ok) {
    enterPortal();
  } else {
    $('login-screen').classList.remove('hidden');
  }

  // Handle magic-link token in URL ?magic=xxx
  const params = new URLSearchParams(window.location.search);
  const magic = params.get('magic');
  if (magic) {
    const d = await api('POST', '/auth/magic-verify', { token: magic });
    if (d.success) {
      saveSession(d.data);
      history.replaceState({}, '', '/portal');
      enterPortal();
    } else {
      showLoginError('Magic link expired or invalid. Please request a new one.');
      switchLoginTab('email', $('ltab-email'));
    }
  }
})();
