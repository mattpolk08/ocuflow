// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Exam Record Controller  (Phase 1D)
// public/static/exam.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────
const CAT_CLASS = {
  Medication: 'cat-med', Procedure: 'cat-proc', Referral: 'cat-ref',
  Testing:    'cat-test', Education: 'cat-edu',  'Follow-up': 'cat-fu',
  Optical:    'cat-opt',  Other:     'cat-oth',
};

const PROVIDER_MAP = {
  'dr-chen':  'Dr. Sarah Chen, OD',
  'dr-patel': 'Dr. Raj Patel, MD',
};

const EXAM_TYPE_LABELS = {
  COMPREHENSIVE: 'Comprehensive Exam', FOLLOWUP:    'Follow-up',
  CONTACT_LENS:  'Contact Lens',       GLAUCOMA:    'Glaucoma Exam',
  DIABETIC:      'Diabetic Eye Exam',  POST_OP:     'Post-Op Check',
  PEDIATRIC:     'Pediatric Exam',     URGENT:      'Urgent Care',
  REFRACTIVE:    'Refractive Eval',
};

// ── State ──────────────────────────────────────────────────────────────────────
const ES = {
  exam:          null,    // Current ExamRecord
  currentSec:    'overview',
  planItems:     [],      // { category, description, eye, details }
  diagnoses:     [],      // { icd10Code, description, eye, chronic, primary }
  icdDropTimeout: null,
  autoSaveTimer:  null,
  dirty:          false,
};

// ── DOM helpers ────────────────────────────────────────────────────────────────
const $  = (s, ctx = document) => ctx.querySelector(s);
const $$ = (s, ctx = document) => [...ctx.querySelectorAll(s)];
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let toastTimer;
function showToast(msg, type = 'success') {
  const t = $('#toast'), icon = $('#toast-icon'), msgEl = $('#toast-msg');
  icon.className = 'fas ' + (type === 'success' ? 'fa-circle-check text-emerald-400' : type === 'error' ? 'fa-circle-xmark text-red-400' : 'fa-circle-info text-blue-400');
  msgEl.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

// ── API ────────────────────────────────────────────────────────────────────────
function _authHdr(extra = {}) {
  const tok = sessionStorage.getItem('of_access_token');
  const h = { 'Content-Type': 'application/json', ...extra };
  if (tok) h['Authorization'] = `Bearer ${tok}`;
  return h;
}
async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: _authHdr(opts.headers) });
  if (res.status === 401) { sessionStorage.clear(); location.href = '/login'; return {}; }
  const j   = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}
const apiGet  = p => api(p);
const apiPost = (p, b) => api(p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
const apiPut  = (p, b) => api(p, { method: 'PUT',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });

// ── Section navigation ─────────────────────────────────────────────────────────
function switchSection(sec) {
  ES.currentSec = sec;
  $$('.sec-item[data-sec]').forEach(b => b.classList.toggle('active', b.dataset.sec === sec));
  $$('.section-panel').forEach(p => p.classList.remove('active'));
  const target = $(`#sec-${sec}`);
  if (target) target.classList.add('active');
}

// ── Status chip rendering ──────────────────────────────────────────────────────
function statusChip(status) {
  const map = {
    DRAFT:       ['chip-draft',       'fa-circle-dot',   'Draft'],
    IN_PROGRESS: ['chip-in-progress', 'fa-pen',          'In Progress'],
    COMPLETE:    ['chip-complete',     'fa-check',        'Complete'],
    SIGNED:      ['chip-signed',       'fa-lock',         'Signed'],
    AMENDED:     ['chip-amended',      'fa-pen-to-square','Amended'],
  };
  const [cls, icon, label] = map[status] || map.DRAFT;
  return `<span class="chip ${cls}"><i class="fas ${icon} text-[8px]"></i> ${label}</span>`;
}

function updateTopbar() {
  const e = ES.exam;
  if (!e) return;
  const init = (e.patientName || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  $('#topbar-avatar').textContent = init;
  $('#topbar-patient').textContent = e.patientName || 'Unknown';
  $('#topbar-sub').textContent = `${EXAM_TYPE_LABELS[e.examType] || e.examType} · ${e.examDate} · ${e.providerName}`;

  const pct = e.completionPct || 0;
  $('#pct-label').textContent = pct + '%';
  $('#progress-fill').style.width = pct + '%';

  const chip = $('#exam-status-chip');
  chip.outerHTML; // noop to avoid stale ref
  $('#exam-status-chip').className = 'chip ' + (
    e.status === 'SIGNED'      ? 'chip-signed'      :
    e.status === 'IN_PROGRESS' ? 'chip-in-progress' :
    e.status === 'COMPLETE'    ? 'chip-complete'     :
    e.status === 'AMENDED'     ? 'chip-amended'      :
    'chip-draft'
  );
  $('#exam-status-chip').innerHTML = `<i class="fas ${
    e.status === 'SIGNED' ? 'fa-lock' : e.status === 'IN_PROGRESS' ? 'fa-pen' : 'fa-circle-dot'
  } text-[8px]"></i> ${
    e.status === 'SIGNED' ? 'Signed' : e.status === 'IN_PROGRESS' ? 'In Progress' : e.status === 'COMPLETE' ? 'Complete' : e.status === 'AMENDED' ? 'Amended' : 'Draft'
  }`;

  // Sign button
  const signBtn = $('#btn-sign-exam');
  signBtn.disabled = e.status === 'SIGNED';

  // Signed banner
  const banner = $('#signed-banner');
  if (e.status === 'SIGNED') {
    banner.classList.remove('hidden');
    $('#signed-by-text').textContent = `Signed by ${e.signedBy} on ${new Date(e.signedAt).toLocaleString()}`;
  } else {
    banner.classList.add('hidden');
  }
}

function markSectionDone(sec, done) {
  const btn = $(`.sec-item[data-sec="${sec}"]`);
  if (!btn) return;
  btn.classList.toggle('done', !!done);
}

function updateSectionDots() {
  const e = ES.exam;
  if (!e) return;
  markSectionDone('hpi',        !!e.chiefComplaint);
  markSectionDone('history',    !!e.medicalHistory);
  markSectionDone('va',         !!e.visualAcuity);
  markSectionDone('prelim',     !!(e.pupils || e.eom || e.confrontationFields));
  markSectionDone('iop',        !!e.iop);
  markSectionDone('slitlamp',   !!e.slitLamp);
  markSectionDone('fundus',     !!e.fundus);
  markSectionDone('refraction', !!e.refraction);
  markSectionDone('assessment', !!e.assessment);
}

// ── Recent exams list ──────────────────────────────────────────────────────────
async function loadRecentExams() {
  try {
    const res   = await apiGet('/api/exams');
    const exams = res.data.exams;
    const list  = $('#recent-list');

    if (!exams.length) {
      list.innerHTML = '<p class="text-slate-600 text-sm text-center py-8">No exams yet. Click "New Exam" to start.</p>';
      return;
    }

    list.innerHTML = exams.map(e => {
      const pct   = e.completionPct || 0;
      const chips = {
        DRAFT:       '<span class="chip chip-draft"><i class="fas fa-circle-dot text-[8px]"></i> Draft</span>',
        IN_PROGRESS: '<span class="chip chip-in-progress"><i class="fas fa-pen text-[8px]"></i> In Progress</span>',
        COMPLETE:    '<span class="chip chip-complete"><i class="fas fa-check text-[8px]"></i> Complete</span>',
        SIGNED:      '<span class="chip chip-signed"><i class="fas fa-lock text-[8px]"></i> Signed</span>',
        AMENDED:     '<span class="chip chip-amended"><i class="fas fa-pen-to-square text-[8px]"></i> Amended</span>',
      };
      return `<div class="p-4 rounded-xl border border-slate-800 bg-slate-900/70 hover:bg-slate-800/70 cursor-pointer transition-all flex items-center gap-4" data-exam-id="${esc(e.id)}">
        <div class="w-10 h-10 rounded-xl bg-blue-600/20 flex items-center justify-center flex-shrink-0">
          <i class="fas fa-file-medical text-blue-400 text-sm"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-0.5 flex-wrap">
            <p class="font-semibold text-sm text-white">${esc(e.patientName)}</p>
            ${chips[e.status] || chips.DRAFT}
          </div>
          <p class="text-xs text-slate-400">${esc(EXAM_TYPE_LABELS[e.examType] || e.examType)} · ${esc(e.examDate)} · ${esc(e.providerName)}</p>
          ${e.chiefComplaint ? `<p class="text-xs text-slate-500 truncate italic">"${esc(e.chiefComplaint)}"</p>` : ''}
        </div>
        <div class="flex-shrink-0 text-right hidden sm:block">
          <div class="text-sm font-bold text-slate-300 mb-1">${pct}%</div>
          <div class="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full bg-blue-500 rounded-full" style="width:${pct}%"></div>
          </div>
        </div>
      </div>`;
    }).join('');

    $$('#recent-list [data-exam-id]').forEach(el => {
      el.addEventListener('click', () => loadExam(el.dataset.examId));
    });
  } catch (e) {
    $('#recent-list').innerHTML = '<p class="text-red-400 text-sm text-center py-4">Failed to load exams</p>';
  }
}

// ── Load exam ──────────────────────────────────────────────────────────────────
async function loadExam(id) {
  try {
    const res = await apiGet(`/api/exams/${id}`);
    ES.exam = res.data;
    renderExam();
  } catch (e) {
    showToast('Could not load exam: ' + e.message, 'error');
  }
}

function renderExam() {
  const e = ES.exam;
  $('#panel-recents').classList.add('hidden');
  $('#panel-exam').classList.remove('hidden');

  updateTopbar();
  updateSectionDots();
  renderOverview();
  populateAllSections();
  switchSection('overview');

  // Lock inputs if signed
  setFormLocked(e.status === 'SIGNED');
}

function setFormLocked(locked) {
  $$('#panel-exam input, #panel-exam textarea, #panel-exam select').forEach(el => {
    el.disabled = locked;
  });
  $$('#panel-exam button[data-save]').forEach(b => b.style.display = locked ? 'none' : '');
  $$('#panel-exam .grade-btn').forEach(b => b.disabled = locked);
}

// ── Overview panel ─────────────────────────────────────────────────────────────
function renderOverview() {
  const e   = ES.exam;
  const row = (label, val) => val
    ? `<div class="flex justify-between py-1.5 border-b border-slate-800/60 last:border-0">
         <span class="text-slate-500 text-xs">${esc(label)}</span>
         <span class="text-slate-200 text-xs font-medium max-w-[60%] text-right">${esc(String(val))}</span>
       </div>`
    : '';

  $('#overview-content').innerHTML = `
    ${row('Patient', e.patientName)}
    ${row('Date of Birth', e.patientDob)}
    ${row('Exam Type', EXAM_TYPE_LABELS[e.examType] || e.examType)}
    ${row('Exam Date', e.examDate + (e.examTime ? ' at ' + e.examTime : ''))}
    ${row('Provider', e.providerName)}
    ${row('Appointment', e.appointmentId)}
    ${row('Status', e.status)}
    ${row('Completion', (e.completionPct || 0) + '%')}
    ${e.chiefComplaint?.chief ? row('Chief Complaint', e.chiefComplaint.chief) : ''}
    ${e.assessment?.diagnoses?.length
      ? row('Diagnoses', e.assessment.diagnoses.map(d => d.icd10Code + ' ' + d.description).join('; '))
      : ''}
    ${e.signedBy ? row('Signed By', e.signedBy) : ''}
    ${e.signedAt ? row('Signed At', new Date(e.signedAt).toLocaleString()) : ''}
  `;
}

// ── Populate form fields from exam data ────────────────────────────────────────
function populateAllSections() {
  const e = ES.exam;
  if (!e) return;

  // HPI
  const cc = e.chiefComplaint || {};
  setVal('hpi-chief',     cc.chief);
  setVal('hpi-hpi',       cc.hpi);
  setVal('hpi-onset',     cc.onset);
  setVal('hpi-duration',  cc.duration);
  setVal('hpi-severity',  cc.severity);
  setVal('hpi-quality',   cc.quality);
  setVal('hpi-modifying', cc.modifying);
  setVal('hpi-associated',cc.associated);

  // History
  const h = e.medicalHistory || {};
  setVal('hist-ocular',      h.ocular);
  setVal('hist-systemic',    h.systemic);
  setVal('hist-surgical',    h.surgical);
  setVal('hist-family',      h.family);
  setVal('hist-medications', h.medications);
  setVal('hist-allergies',   h.allergies);
  setVal('hist-social',      h.socialHistory);

  // VA
  const va = e.visualAcuity || {};
  setVal('va-od-sc',   va.od?.sc);
  setVal('va-od-cc',   va.od?.cc);
  setVal('va-od-ph',   va.od?.ph);
  setVal('va-od-near', va.od?.near);
  setVal('va-os-sc',   va.os?.sc);
  setVal('va-os-cc',   va.os?.cc);
  setVal('va-os-ph',   va.os?.ph);
  setVal('va-os-near', va.os?.near);
  setVal('va-method',  va.method);
  setVal('va-notes',   va.notes);

  // Pupils
  const pu = e.pupils || {};
  setVal('pu-od-size', pu.od?.size);
  setVal('pu-od-rxn',  pu.od?.reaction);
  setVal('pu-os-size', pu.os?.size);
  setVal('pu-os-rxn',  pu.os?.reaction);
  setVal('pu-apd',     pu.apd);
  setVal('pu-notes',   pu.notes);

  // EOMs
  const eom = e.eom || {};
  setVal('eom-od',       eom.od);
  setVal('eom-os',       eom.os);
  setVal('eom-versions', eom.versions);
  setVal('eom-cover',    eom.cover);

  // CVF
  const cvf = e.confrontationFields || {};
  setVal('cvf-od',    cvf.od);
  setVal('cvf-os',    cvf.os);
  setVal('cvf-notes', cvf.notes);

  // IOP
  const iop = e.iop || {};
  setVal('iop-od',     iop.od);
  setVal('iop-os',     iop.os);
  setVal('iop-method', iop.method);
  setVal('iop-time',   iop.time);
  setVal('iop-cct-od', iop.cctvOD);
  setVal('iop-cct-os', iop.cctvOS);

  // Slit lamp
  const sl = e.slitLamp || {};
  setVal('sl-od-lids',   sl.od?.lids);
  setVal('sl-od-conj',   sl.od?.conjunctiva);
  setVal('sl-od-cornea', sl.od?.cornea);
  setVal('sl-od-ac',     sl.od?.anteriorChamber);
  setVal('sl-od-iris',   sl.od?.iris);
  setVal('sl-od-lens',   sl.od?.lens);
  setVal('sl-od-vit',    sl.od?.vitreous);
  setGradeBtn('sl-od-cell-btns',  'sl-od-cell',  sl.od?.acCell  || 'WNL');
  setGradeBtn('sl-os-cell-btns',  'sl-os-cell',  sl.os?.acCell  || 'WNL');
  setGradeBtn('sl-od-flare-btns', 'sl-od-flare', sl.od?.acFlare || 'WNL');
  setGradeBtn('sl-os-flare-btns', 'sl-os-flare', sl.os?.acFlare || 'WNL');

  setVal('sl-os-lids',   sl.os?.lids);
  setVal('sl-os-conj',   sl.os?.conjunctiva);
  setVal('sl-os-cornea', sl.os?.cornea);
  setVal('sl-os-ac',     sl.os?.anteriorChamber);
  setVal('sl-os-iris',   sl.os?.iris);
  setVal('sl-os-lens',   sl.os?.lens);
  setVal('sl-os-vit',    sl.os?.vitreous);

  const dil = sl.dilation || {};
  if ($('#sl-dil-done')) $('#sl-dil-done').checked = !!dil.performed;
  setVal('sl-dil-agent', dil.agent);
  setVal('sl-dil-time',  dil.time);
  setVal('sl-dil-ready', dil.readyTime);

  // Fundus
  const f = e.fundus || {};
  setVal('fun-method',    f.method);
  if ($('#fun-dilated')) $('#fun-dilated').checked = !!f.dilated;
  setVal('fun-od-disc',    f.od?.disc);
  setVal('fun-od-cd',      f.od?.cdRatio);
  setVal('fun-od-cdv',     f.od?.cdRatioV);
  setVal('fun-od-rim',     f.od?.rim);
  setVal('fun-od-vessels', f.od?.vessels);
  setVal('fun-od-macula',  f.od?.macula);
  setVal('fun-od-periph',  f.od?.periphery);
  setVal('fun-od-notes',   f.od?.notes);
  setVal('fun-os-disc',    f.os?.disc);
  setVal('fun-os-cd',      f.os?.cdRatio);
  setVal('fun-os-cdv',     f.os?.cdRatioV);
  setVal('fun-os-rim',     f.os?.rim);
  setVal('fun-os-vessels', f.os?.vessels);
  setVal('fun-os-macula',  f.os?.macula);
  setVal('fun-os-periph',  f.os?.periphery);
  setVal('fun-os-notes',   f.os?.notes);

  // Refraction
  const rx = e.refraction || {};
  setVal('rx-type',    rx.type);
  setVal('rx-od-sph',  rx.od?.sphere);
  setVal('rx-od-cyl',  rx.od?.cylinder);
  setVal('rx-od-axis', rx.od?.axis);
  setVal('rx-od-add',  rx.od?.add);
  setVal('rx-od-va',   rx.od?.vaWithRx);
  setVal('rx-os-sph',  rx.os?.sphere);
  setVal('rx-os-cyl',  rx.os?.cylinder);
  setVal('rx-os-axis', rx.os?.axis);
  setVal('rx-os-add',  rx.os?.add);
  setVal('rx-os-va',   rx.os?.vaWithRx);
  setVal('frx-od-sph', rx.finalRxOd?.sphere);
  setVal('frx-od-cyl', rx.finalRxOd?.cylinder);
  setVal('frx-od-axis',rx.finalRxOd?.axis);
  setVal('frx-od-add', rx.finalRxOd?.add);
  setVal('frx-os-sph', rx.finalRxOs?.sphere);
  setVal('frx-os-cyl', rx.finalRxOs?.cylinder);
  setVal('frx-os-axis',rx.finalRxOs?.axis);
  setVal('frx-os-add', rx.finalRxOs?.add);
  if (rx.pupillaryDistance?.od) setVal('frx-pd-od', rx.pupillaryDistance.od);
  if (rx.pupillaryDistance?.os) setVal('frx-pd-os', rx.pupillaryDistance.os);
  setVal('rx-notes', rx.notes);

  // Assessment
  const ap = e.assessment || {};
  ES.diagnoses  = (ap.diagnoses || []).slice();
  ES.planItems  = (ap.plan      || []).slice();
  renderDiagnosisTags();
  renderPlanList();
  setVal('ap-followup',  ap.followUp);
  setVal('ap-referrals', ap.referrals);
  setVal('ap-notes',     ap.providerNotes);
}

function setVal(id, val) {
  const el = $(`#${id}`);
  if (!el || val == null) return;
  el.value = String(val);
}

// ── Grade buttons (slit lamp) ──────────────────────────────────────────────────
function setGradeBtn(btnsId, hiddenId, value) {
  const container = $(`#${btnsId}`);
  const hidden    = $(`#${hiddenId}`);
  if (!container || !hidden) return;
  hidden.value = value || 'WNL';
  $$('.grade-btn', container).forEach(b => b.classList.toggle('sel', b.dataset.grade === (value || 'WNL')));
}

function wireGradeBtns() {
  $$('.grade-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const container = btn.closest('[id$="-btns"]');
      if (!container) return;
      const hiddenId  = container.id.replace('-btns', '');
      const hidden    = $(`#${hiddenId}`);
      $$('.grade-btn', container).forEach(b => b.classList.remove('sel'));
      btn.classList.add('sel');
      if (hidden) hidden.value = btn.dataset.grade;
    });
  });
}

// ── Section collectors (DOM → data objects) ────────────────────────────────────
function collectHpi() {
  return {
    chief:      $('#hpi-chief').value.trim(),
    hpi:        $('#hpi-hpi').value.trim()        || undefined,
    onset:      $('#hpi-onset').value.trim()      || undefined,
    duration:   $('#hpi-duration').value.trim()   || undefined,
    severity:   $('#hpi-severity').value          || undefined,
    quality:    $('#hpi-quality').value.trim()    || undefined,
    modifying:  $('#hpi-modifying').value.trim()  || undefined,
    associated: $('#hpi-associated').value.trim() || undefined,
  };
}
function collectHistory() {
  return {
    ocular:       $('#hist-ocular').value.trim()      || undefined,
    systemic:     $('#hist-systemic').value.trim()    || undefined,
    surgical:     $('#hist-surgical').value.trim()    || undefined,
    family:       $('#hist-family').value.trim()      || undefined,
    medications:  $('#hist-medications').value.trim() || undefined,
    allergies:    $('#hist-allergies').value.trim()   || undefined,
    socialHistory:$('#hist-social').value.trim()      || undefined,
  };
}
function collectVA() {
  return {
    od: { sc: v('va-od-sc'), cc: v('va-od-cc'), ph: v('va-od-ph'), near: v('va-od-near') },
    os: { sc: v('va-os-sc'), cc: v('va-os-cc'), ph: v('va-os-ph'), near: v('va-os-near') },
    method: $('#va-method').value || undefined,
    notes:  v('va-notes'),
  };
}
function collectPrelim() {
  return {
    pupils: {
      od: { size: v('pu-od-size'), reaction: v('pu-od-rxn') },
      os: { size: v('pu-os-size'), reaction: v('pu-os-rxn') },
      apd:   $('#pu-apd').value   || undefined,
      notes: v('pu-notes'),
    },
    eom: {
      od:       $('#eom-od').value,
      os:       $('#eom-os').value,
      versions: v('eom-versions'),
      cover:    v('eom-cover'),
    },
    confrontationFields: {
      od:    $('#cvf-od').value,
      os:    $('#cvf-os').value,
      notes: v('cvf-notes'),
    },
  };
}
function collectIop() {
  const od = parseFloat($('#iop-od').value);
  const os = parseFloat($('#iop-os').value);
  if (!od || !os) return null;
  return {
    od,
    os,
    method:  $('#iop-method').value,
    time:    v('iop-time'),
    cctvOD:  num('iop-cct-od'),
    cctvOS:  num('iop-cct-os'),
  };
}
function collectSlitLamp() {
  return {
    od: {
      lids:             v('sl-od-lids'),
      conjunctiva:      v('sl-od-conj'),
      cornea:           v('sl-od-cornea'),
      anteriorChamber:  v('sl-od-ac'),
      acCell:           $('#sl-od-cell').value || undefined,
      acFlare:          $('#sl-od-flare').value || undefined,
      iris:             v('sl-od-iris'),
      lens:             v('sl-od-lens'),
      vitreous:         v('sl-od-vit'),
    },
    os: {
      lids:             v('sl-os-lids'),
      conjunctiva:      v('sl-os-conj'),
      cornea:           v('sl-os-cornea'),
      anteriorChamber:  v('sl-os-ac'),
      acCell:           $('#sl-os-cell').value || undefined,
      acFlare:          $('#sl-os-flare').value || undefined,
      iris:             v('sl-os-iris'),
      lens:             v('sl-os-lens'),
      vitreous:         v('sl-os-vit'),
    },
    dilation: {
      performed:  $('#sl-dil-done').checked,
      agent:      v('sl-dil-agent'),
      time:       v('sl-dil-time'),
      readyTime:  v('sl-dil-ready'),
    },
  };
}
function collectFundus() {
  return {
    od: {
      disc:      v('fun-od-disc'),
      cdRatio:   $('#fun-od-cd').value  || undefined,
      cdRatioV:  $('#fun-od-cdv').value || undefined,
      rim:       v('fun-od-rim'),
      vessels:   v('fun-od-vessels'),
      macula:    v('fun-od-macula'),
      periphery: v('fun-od-periph'),
      notes:     v('fun-od-notes'),
    },
    os: {
      disc:      v('fun-os-disc'),
      cdRatio:   $('#fun-os-cd').value  || undefined,
      cdRatioV:  $('#fun-os-cdv').value || undefined,
      rim:       v('fun-os-rim'),
      vessels:   v('fun-os-vessels'),
      macula:    v('fun-os-macula'),
      periphery: v('fun-os-periph'),
      notes:     v('fun-os-notes'),
    },
    method:  $('#fun-method').value || undefined,
    dilated: $('#fun-dilated').checked,
  };
}
function collectRefraction() {
  return {
    od: { sphere: v('rx-od-sph'), cylinder: v('rx-od-cyl'), axis: num('rx-od-axis'), add: v('rx-od-add'), vaWithRx: v('rx-od-va') },
    os: { sphere: v('rx-os-sph'), cylinder: v('rx-os-cyl'), axis: num('rx-os-axis'), add: v('rx-os-add'), vaWithRx: v('rx-os-va') },
    finalRxOd: { sphere: v('frx-od-sph'), cylinder: v('frx-od-cyl'), axis: num('frx-od-axis'), add: v('frx-od-add') },
    finalRxOs: { sphere: v('frx-os-sph'), cylinder: v('frx-os-cyl'), axis: num('frx-os-axis'), add: v('frx-os-add') },
    type: $('#rx-type').value || undefined,
    pupillaryDistance: { od: num('frx-pd-od'), os: num('frx-pd-os') },
    notes: v('rx-notes'),
  };
}
function collectAssessment() {
  return {
    diagnoses:     ES.diagnoses,
    plan:          ES.planItems,
    followUp:      v('ap-followup'),
    referrals:     v('ap-referrals'),
    providerNotes: v('ap-notes'),
  };
}

function v(id) { const el = $(`#${id}`); return el?.value?.trim() || undefined; }
function num(id) { const el = $(`#${id}`); const n = parseFloat(el?.value); return isNaN(n) ? undefined : n; }

// ── Save a section ─────────────────────────────────────────────────────────────
async function saveSection(sectionKey) {
  if (!ES.exam) return;
  if (ES.exam.status === 'SIGNED') { showToast('Exam is signed and locked', 'error'); return; }

  let data;
  if (sectionKey === 'chiefComplaint')      data = collectHpi();
  else if (sectionKey === 'medicalHistory') data = collectHistory();
  else if (sectionKey === 'visualAcuity')   data = collectVA();
  else if (sectionKey === 'prelim') {
    // Save 3 sections at once
    const { pupils, eom, confrontationFields } = collectPrelim();
    await saveSingleSection('pupils', pupils);
    await saveSingleSection('eom', eom);
    await saveSingleSection('confrontationFields', confrontationFields);
    showToast('Pupils / EOMs / Fields saved', 'success');
    return;
  }
  else if (sectionKey === 'iop')          data = collectIop();
  else if (sectionKey === 'slitLamp')     data = collectSlitLamp();
  else if (sectionKey === 'fundus')       data = collectFundus();
  else if (sectionKey === 'refraction')   data = collectRefraction();
  else if (sectionKey === 'assessment')   data = collectAssessment();
  else return;

  if (!data) { showToast('Fill in required fields first', 'error'); return; }
  await saveSingleSection(sectionKey, data);
  showToast('Saved', 'success');
}

async function saveSingleSection(section, data) {
  try {
    const res   = await apiPut(`/api/exams/${ES.exam.id}/section/${section}`, data);
    ES.exam     = res.data;
    updateTopbar();
    updateSectionDots();
    renderOverview();
  } catch (e) {
    showToast('Save failed: ' + e.message, 'error');
    throw e;
  }
}

// ── ICD-10 autocomplete ────────────────────────────────────────────────────────
function renderDiagnosisTags() {
  const container = $('#icd-tags');
  if (!container) return;
  if (!ES.diagnoses.length) {
    container.innerHTML = '<span class="text-xs text-slate-600 italic">No diagnoses added yet</span>';
    return;
  }
  container.innerHTML = ES.diagnoses.map((d, i) => `
    <span class="icd-tag">
      <span class="font-mono font-bold">${esc(d.icd10Code)}</span>
      <span class="text-slate-300">${esc(d.description)}</span>
      <span class="rm" data-idx="${i}">×</span>
    </span>`).join('');

  $$('.icd-tag .rm', container).forEach(rm => {
    rm.addEventListener('click', () => {
      ES.diagnoses.splice(parseInt(rm.dataset.idx), 1);
      renderDiagnosisTags();
    });
  });
}

async function searchIcd(query) {
  const dropdown = $('#icd-dropdown');
  if (!query.trim()) { dropdown.classList.add('hidden'); return; }

  try {
    const res     = await apiGet(`/api/exams/icd10/search?q=${encodeURIComponent(query)}`);
    const results = res.data;
    if (!results.length) { dropdown.classList.add('hidden'); return; }

    dropdown.innerHTML = results.map(r => `
      <div class="icd-item" data-code="${esc(r.code)}" data-desc="${esc(r.desc)}">
        <span class="font-mono text-blue-400 font-bold text-xs flex-shrink-0">${esc(r.code)}</span>
        <span class="text-slate-300 text-xs">${esc(r.desc)}</span>
      </div>`).join('');
    dropdown.classList.remove('hidden');

    $$('.icd-item', dropdown).forEach(item => {
      item.addEventListener('click', () => {
        const already = ES.diagnoses.find(d => d.icd10Code === item.dataset.code);
        if (!already) {
          ES.diagnoses.push({
            icd10Code:   item.dataset.code,
            description: item.dataset.desc,
            primary:     ES.diagnoses.length === 0,
          });
          renderDiagnosisTags();
        }
        dropdown.classList.add('hidden');
        $('#icd-search').value = '';
      });
    });
  } catch (e) { dropdown.classList.add('hidden'); }
}

// ── Plan list ──────────────────────────────────────────────────────────────────
function renderPlanList() {
  const container = $('#plan-list');
  if (!container) return;
  if (!ES.planItems.length) {
    container.innerHTML = '<p class="text-xs text-slate-600 italic">No plan items yet</p>';
    return;
  }
  container.innerHTML = ES.planItems.map((p, i) => {
    const catCls = CAT_CLASS[p.category] || 'cat-oth';
    return `<div class="plan-item">
      <span class="plan-cat ${catCls}">${esc(p.category)}</span>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white">${esc(p.description)}${p.eye ? ` <span class="text-slate-500">${esc(p.eye)}</span>` : ''}</p>
        ${p.details ? `<p class="text-xs text-slate-400">${esc(p.details)}</p>` : ''}
      </div>
      <button class="btn-remove-plan text-slate-600 hover:text-red-400 transition-colors text-xs flex-shrink-0" data-idx="${i}">
        <i class="fas fa-times"></i>
      </button>
    </div>`;
  }).join('');

  $$('.btn-remove-plan').forEach(btn => {
    btn.addEventListener('click', () => {
      ES.planItems.splice(parseInt(btn.dataset.idx), 1);
      renderPlanList();
    });
  });
}

// ── Sign & Lock ────────────────────────────────────────────────────────────────
function openSignModal() {
  if (!ES.exam) return;
  const modal = $('#modal-sign');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  $('#sign-provider-name').value = ES.exam.providerName || '';
}
function closeSignModal() {
  const modal = $('#modal-sign');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function confirmSign() {
  const providerName = $('#sign-provider-name').value.trim();
  if (!providerName) { showToast('Provider name is required', 'error'); return; }

  try {
    $('#btn-confirm-sign').disabled = true;
    const res   = await apiPost(`/api/exams/${ES.exam.id}/sign`, { providerName });
    ES.exam     = res.data;
    closeSignModal();
    renderExam();
    showToast(`Exam signed by ${providerName}`, 'success');
  } catch (e) {
    showToast('Sign failed: ' + e.message, 'error');
  } finally {
    $('#btn-confirm-sign').disabled = false;
  }
}

// ── Amend ──────────────────────────────────────────────────────────────────────
async function handleAmend() {
  if (!ES.exam) return;
  const note = prompt('Enter amendment reason / note:');
  if (!note) return;

  try {
    const res = await apiPost(`/api/exams/${ES.exam.id}/amend`, { note });
    ES.exam   = res.data;
    renderExam();
    showToast('Exam amended — sections now editable', 'info');
  } catch (e) {
    showToast('Amend failed: ' + e.message, 'error');
  }
}

// ── New exam modal ─────────────────────────────────────────────────────────────
function openNewModal() {
  const modal = $('#modal-new');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  // Default today
  $('#new-exam-date').value = new Date().toISOString().split('T')[0];
  $('#new-error').classList.add('hidden');
}
function closeNewModal() {
  $('#modal-new').classList.add('hidden');
  $('#modal-new').classList.remove('flex');
}

async function confirmNewExam() {
  const name       = $('#new-patient-name').value.trim();
  const patientId  = $('#new-patient-id').value.trim();
  const examDate   = $('#new-exam-date').value;
  const examType   = $('#new-exam-type').value;
  const providerId = $('#new-provider-id').value;
  const chief      = $('#new-chief').value.trim();

  if (!name || !patientId || !examDate) {
    const err = $('#new-error');
    err.classList.remove('hidden');
    err.querySelector('span').textContent = 'Patient name, ID, and exam date are required';
    return;
  }

  try {
    $('#btn-confirm-new').disabled = true;
    const res = await apiPost('/api/exams', {
      patientId,
      patientName:  name,
      patientDob:   $('#new-patient-dob').value || undefined,
      examDate,
      examType,
      providerId,
      providerName: PROVIDER_MAP[providerId] || providerId,
      chiefComplaint: chief || undefined,
    });
    closeNewModal();
    ES.exam = res.data;
    renderExam();
    showToast('Exam created — ' + res.data.id, 'success');
  } catch (e) {
    const err = $('#new-error');
    err.classList.remove('hidden');
    err.querySelector('span').textContent = e.message;
  } finally {
    $('#btn-confirm-new').disabled = false;
  }
}

// ── URL-based exam loading ─────────────────────────────────────────────────────
function checkUrlExamId() {
  const path  = window.location.pathname;
  const match = path.match(/\/exam\/([^/]+)/);
  if (match) {
    loadExam(match[1]);
    return true;
  }
  return false;
}

// ── INIT ───────────────────────────────────────────────────────────────────────
async function init() {
  // Section nav clicks
  $$('.sec-item[data-sec]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (ES.exam) switchSection(btn.dataset.sec);
      else showToast('Load an exam first', 'info');
    });
  });

  // Save section buttons
  $$('[data-save]').forEach(btn => {
    btn.addEventListener('click', () => saveSection(btn.dataset.save));
  });

  // Grade buttons (slit lamp)
  wireGradeBtns();

  // Sign exam
  $('#btn-sign-exam').addEventListener('click', openSignModal);
  $('#btn-cancel-sign').addEventListener('click', closeSignModal);
  $('#btn-confirm-sign').addEventListener('click', confirmSign);
  $('#modal-sign').addEventListener('click', e => { if (e.target === $('#modal-sign')) closeSignModal(); });

  // Amend
  $('#btn-amend')?.addEventListener('click', handleAmend);

  // New exam
  ['btn-new-exam', 'btn-new-exam-2'].forEach(id => {
    $(`#${id}`)?.addEventListener('click', openNewModal);
  });
  $('#btn-cancel-new').addEventListener('click', closeNewModal);
  $('#btn-close-new').addEventListener('click', closeNewModal);
  $('#btn-confirm-new').addEventListener('click', confirmNewExam);
  $('#modal-new').addEventListener('click', e => { if (e.target === $('#modal-new')) closeNewModal(); });

  // ICD-10 autocomplete
  const icdSearch = $('#icd-search');
  if (icdSearch) {
    icdSearch.addEventListener('input', () => {
      clearTimeout(ES.icdDropTimeout);
      ES.icdDropTimeout = setTimeout(() => searchIcd(icdSearch.value), 200);
    });
    document.addEventListener('click', e => {
      if (!icdSearch.contains(e.target)) $('#icd-dropdown').classList.add('hidden');
    });
  }

  // Add plan item
  $('#btn-add-plan')?.addEventListener('click', () => {
    const desc = $('#plan-desc').value.trim();
    if (!desc) { showToast('Plan description is required', 'error'); return; }
    ES.planItems.push({
      category:    $('#plan-cat').value,
      description: desc,
      eye:         $('#plan-eye').value || undefined,
      details:     $('#plan-details').value.trim() || undefined,
    });
    renderPlanList();
    $('#plan-desc').value    = '';
    $('#plan-details').value = '';
  });

  // Keyboard: Esc = close modals
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      closeSignModal();
      closeNewModal();
      $('#icd-dropdown').classList.add('hidden');
    }
  });

  // Load exam from URL or show recents
  const fromUrl = checkUrlExamId();
  if (!fromUrl) {
    await loadRecentExams();
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
