// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 8A: AI Clinical Decision Support — Frontend JS
// ─────────────────────────────────────────────────────────────────────────────

'use strict';

const API = '/api/ai';
let riskChart = null;
let allIcdCodes = [];

// ── Utilities ─────────────────────────────────────────────────────────────────
function _authHeaders(extra = {}) {
  const token = sessionStorage.getItem('of_access_token');
  const h = { 'Content-Type': 'application/json', ...extra };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}
async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: _authHeaders(opts.headers),
  });
  if (res.status === 401) { sessionStorage.clear(); location.href = '/login'; return null; }
  return res.json();
}

function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  const msgEl = document.getElementById('toast-msg');
  msgEl.textContent = msg;
  el.querySelector('i').className = isError
    ? 'fas fa-exclamation-circle text-red-400 mr-2'
    : 'fas fa-check-circle text-emerald-400 mr-2';
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function priorityBadge(p) {
  const map = { CRITICAL: 'badge-critical', WARNING: 'badge-warning', INFO: 'badge-info' };
  return `<span class="badge ${map[p] || 'badge-info'}">${p}</span>`;
}

function riskBadge(level) {
  const map = { CRITICAL: 'badge-critical', HIGH: 'badge-high', MODERATE: 'badge-moderate', LOW: 'badge-low' };
  return `<span class="badge ${map[level] || 'badge-info'}">${level}</span>`;
}

function severityBadge(sev) {
  const map = { CONTRAINDICATED: 'badge-contra', MAJOR: 'badge-major', MODERATE: 'badge-warning', MINOR: 'badge-minor' };
  return `<span class="badge ${map[sev] || 'badge-info'}">${sev}</span>`;
}

function riskColor(score) {
  if (score >= 75) return '#ef4444';
  if (score >= 50) return '#f97316';
  if (score >= 25) return '#f59e0b';
  return '#22c55e';
}

function scoreRing(score, size = 56) {
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const filled = (score / 100) * circ;
  const color = riskColor(score);
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="flex-shrink-0">
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#1e293b" stroke-width="5"/>
      <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="5"
        stroke-dasharray="${filled} ${circ - filled}" stroke-dashoffset="${circ * 0.25}"
        stroke-linecap="round"/>
      <text x="${size/2}" y="${size/2 + 5}" text-anchor="middle" fill="${color}" font-size="12" font-weight="700">${score}</text>
    </svg>`;
}

// ── Tab Switching ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.remove('hidden');
  const idx = ['dashboard','icd10','interactions','guidelines','notes','risk'].indexOf(tab);
  document.querySelectorAll('.tab-btn')[idx]?.classList.add('active');

  if (tab === 'dashboard') loadDashboard();
  if (tab === 'icd10') loadIcdCatalog();
  if (tab === 'interactions') loadAllInteractions();
  if (tab === 'guidelines') loadGuidelines();
  if (tab === 'notes') loadNoteHistory();
  if (tab === 'risk') loadRiskScores();
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  const d = await apiFetch('/dashboard');
  if (!d.success) return;
  const dash = d.data;

  document.getElementById('kpi-pending').textContent  = dash.pendingInsights;
  document.getElementById('kpi-critical').textContent = dash.criticalAlerts;
  document.getElementById('kpi-icd').textContent      = dash.icdSuggestionsToday;
  document.getElementById('kpi-notes').textContent    = dash.notesGeneratedToday;
  document.getElementById('kpi-risk').textContent     = dash.riskScoresComputed;
  document.getElementById('kpi-ddi').textContent      = dash.interactionAlertsActive;

  // Insights
  const iEl = document.getElementById('insights-list');
  if (dash.recentInsights.length === 0) {
    iEl.innerHTML = '<p class="text-center text-slate-500 text-sm py-6">No active insights</p>';
  } else {
    iEl.innerHTML = dash.recentInsights.map(ins => `
      <div class="insight-card priority-${ins.priority}" id="ins-${ins.id}">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1 flex-wrap">
              ${priorityBadge(ins.priority)}
              <span class="text-xs text-slate-500">${ins.type.replace(/_/g,' ')}</span>
              ${ins.patientName ? `<span class="text-xs text-slate-400">· ${ins.patientName}</span>` : ''}
            </div>
            <p class="text-sm font-medium text-white">${ins.title}</p>
            <p class="text-xs text-slate-400 mt-1">${ins.body}</p>
            ${ins.actionLabel ? `<a href="${ins.actionRoute}" class="text-xs text-indigo-400 hover:text-indigo-300 mt-1 inline-block">${ins.actionLabel} →</a>` : ''}
          </div>
          <button class="text-slate-600 hover:text-slate-400 flex-shrink-0 text-xs mt-1" onclick="dismissInsight('${ins.id}')">
            <i class="fas fa-times"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  // Risk chart
  const dist = dash.riskDistribution;
  if (riskChart) riskChart.destroy();
  const ctx = document.getElementById('risk-chart').getContext('2d');
  riskChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: dist.map(d => d.level),
      datasets: [{
        data: dist.map(d => d.count),
        backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#22c55e'],
        borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } },
      },
      cutout: '65%',
    },
  });

  // Top risk patients
  const trEl = document.getElementById('top-risk-list');
  if (dash.topRiskPatients.length === 0) {
    trEl.innerHTML = '<p class="text-center text-slate-500 text-sm py-2">No risk scores computed yet</p>';
  } else {
    trEl.innerHTML = dash.topRiskPatients.map(r => `
      <div class="flex items-center gap-3">
        ${scoreRing(r.score, 40)}
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-white truncate">${r.patientName}</p>
          <p class="text-xs text-slate-500">${r.category.replace(/_/g,' ')}</p>
        </div>
        ${riskBadge(r.level)}
      </div>
    `).join('');
  }
}

async function dismissInsight(id) {
  const d = await apiFetch(`/insights/${id}/dismiss`, { method: 'PATCH' });
  if (d.success) {
    document.getElementById('ins-' + id)?.remove();
    toast('Insight dismissed');
    const kpi = document.getElementById('kpi-pending');
    if (kpi) kpi.textContent = Math.max(0, parseInt(kpi.textContent) - 1);
  }
}

// ── ICD-10 Suggest ────────────────────────────────────────────────────────────
async function loadIcdCatalog() {
  if (allIcdCodes.length > 0) return;
  const d = await apiFetch('/icd10');
  if (!d.success) return;
  allIcdCodes = d.data;

  // Populate category filter
  const cats = [...new Set(allIcdCodes.map(c => c.category))].sort();
  const sel = document.getElementById('icd-cat-filter');
  cats.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c.replace(/_/g,' ');
    sel.appendChild(opt);
  });
}

async function runIcdSuggest() {
  const freeText = document.getElementById('icd-freetext').value.trim();
  const symptomsRaw = document.getElementById('icd-symptoms').value.trim();
  const symptoms = symptomsRaw ? symptomsRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const age = parseInt(document.getElementById('icd-age').value) || undefined;
  const sex = document.getElementById('icd-sex').value || undefined;
  const existingRaw = document.getElementById('icd-existing').value.trim();
  const existing = existingRaw ? existingRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  if (!freeText && symptoms.length === 0) {
    toast('Enter symptoms or free text first', true);
    return;
  }

  const resEl = document.getElementById('icd-results');
  resEl.innerHTML = '<div class="text-center py-8"><div class="spinner mx-auto mb-2"></div><p class="text-slate-500 text-sm">Analyzing clinical input…</p></div>';

  const d = await apiFetch('/icd10/suggest', {
    method: 'POST',
    body: JSON.stringify({ symptoms, freeText, patientAge: age, patientSex: sex, existingDiagnoses: existing }),
  });

  if (!d.success) {
    resEl.innerHTML = `<div class="card text-center text-red-400 text-sm py-6">${d.error}</div>`;
    return;
  }

  const { suggestions, processingMs } = d.data;
  const countEl = document.getElementById('icd-result-count');
  countEl.textContent = `${suggestions.length} codes · ${processingMs}ms`;
  countEl.classList.remove('hidden');

  if (suggestions.length === 0) {
    resEl.innerHTML = '<div class="card text-center text-slate-500 text-sm py-8">No matching ICD-10 codes found for the provided input</div>';
    return;
  }

  resEl.innerHTML = suggestions.map((s, i) => `
    <div class="suggestion-card">
      <div class="flex items-start gap-3">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm
          ${i === 0 ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}">
          ${i + 1}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="font-mono font-bold text-indigo-300 text-sm">${s.icdCode.code}</span>
            ${s.primarySuggestion ? '<span class="badge badge-info text-xs">Primary</span>' : ''}
            <span class="badge badge-info text-xs">${s.icdCode.category.replace(/_/g,' ')}</span>
            ${s.icdCode.billable ? '<span class="text-xs text-emerald-500"><i class="fas fa-check-circle"></i> Billable</span>' : ''}
          </div>
          <p class="text-sm text-white">${s.icdCode.description}</p>
          <p class="text-xs text-slate-500 mt-1">${s.matchReason}</p>
          <div class="flex items-center gap-2 mt-2">
            <div class="confidence-bar flex-1"><div class="confidence-fill" style="width:${Math.round(s.confidence*100)}%"></div></div>
            <span class="text-xs text-slate-400 w-10 text-right">${Math.round(s.confidence*100)}%</span>
          </div>
          ${s.icdCode.commonPresentations?.length ? `
            <div class="flex flex-wrap gap-1 mt-2">
              ${s.icdCode.commonPresentations.map(p => `<span class="text-xs bg-slate-800 px-2 py-0.5 rounded text-slate-400">${p}</span>`).join('')}
            </div>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function searchIcd() {
  const q = document.getElementById('icd-search').value.toLowerCase();
  const cat = document.getElementById('icd-cat-filter').value;
  const el = document.getElementById('icd-search-results');

  if (!q && !cat) { el.innerHTML = ''; return; }

  let results = allIcdCodes;
  if (cat) results = results.filter(c => c.category === cat);
  if (q) results = results.filter(c =>
    c.code.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) ||
    (c.commonPresentations || []).some(p => p.toLowerCase().includes(q))
  );

  if (results.length === 0) {
    el.innerHTML = '<p class="text-slate-500 text-xs py-2 text-center">No codes found</p>';
    return;
  }

  el.innerHTML = results.slice(0, 20).map(c => `
    <div class="flex items-start gap-2 py-2 border-b border-slate-800 hover:bg-slate-900 rounded px-2 cursor-pointer"
         onclick="document.getElementById('icd-freetext').value += '${c.code} '; toast('Added ${c.code} to search')">
      <span class="font-mono text-indigo-300 text-xs w-24 flex-shrink-0">${c.code}</span>
      <div>
        <p class="text-xs text-white">${c.description}</p>
        <p class="text-xs text-slate-600">${c.category.replace(/_/g,' ')}</p>
      </div>
    </div>
  `).join('');
}

// ── Drug Interactions ─────────────────────────────────────────────────────────
async function loadAllInteractions() {
  const sev = document.getElementById('ddi-sev-filter').value;
  const el = document.getElementById('all-ddi-list');
  el.innerHTML = '<div class="text-center py-4"><div class="spinner mx-auto mb-2"></div></div>';

  const path = sev ? `/interactions?severity=${sev}` : '/interactions';
  const d = await apiFetch(path);
  if (!d.success) { el.innerHTML = '<p class="text-red-400 text-sm text-center py-4">Failed to load</p>'; return; }

  if (d.data.length === 0) { el.innerHTML = '<p class="text-slate-500 text-sm text-center py-4">No interactions found</p>'; return; }

  el.innerHTML = d.data.map(ddi => `
    <div class="p-3 border border-slate-800 rounded-lg hover:border-slate-700">
      <div class="flex items-center gap-2 mb-1 flex-wrap">
        ${severityBadge(ddi.severity)}
        <span class="text-xs text-slate-300">${ddi.drug1Name}</span>
        <i class="fas fa-arrows-left-right text-slate-600 text-xs"></i>
        <span class="text-xs text-slate-300">${ddi.drug2Name}</span>
      </div>
      <p class="text-xs text-slate-400">${ddi.clinicalEffect}</p>
      <p class="text-xs text-slate-600 mt-1"><span class="text-slate-500">Management:</span> ${ddi.management}</p>
    </div>
  `).join('');
}

async function checkInteractions() {
  const idsRaw = document.getElementById('ddi-ids').value.trim();
  if (!idsRaw) { toast('Enter drug IDs to check', true); return; }
  const drugIds = idsRaw.split(',').map(s => s.trim()).filter(Boolean);
  if (drugIds.length < 2) { toast('Enter at least 2 drug IDs', true); return; }

  const d = await apiFetch('/interactions/check', {
    method: 'POST',
    body: JSON.stringify({ drugIds }),
  });

  const resEl = document.getElementById('ddi-result');
  const sumEl = document.getElementById('ddi-summary');
  const listEl = document.getElementById('ddi-list');
  resEl.classList.remove('hidden');

  if (!d.success) { sumEl.innerHTML = `<p class="text-red-400 text-sm">${d.error}</p>`; return; }

  const { interactions, summary, hasCritical } = d.data;
  sumEl.innerHTML = `
    <div class="flex items-center gap-3 p-3 rounded-lg ${hasCritical ? 'bg-red-950/50 border border-red-900' : 'bg-slate-900 border border-slate-800'}">
      <i class="fas ${hasCritical ? 'fa-exclamation-triangle text-red-400' : 'fa-check-circle text-emerald-400'}"></i>
      <div class="text-sm">
        <span class="font-semibold text-white">${summary.total} interaction(s) found</span>
        <span class="text-slate-400 ml-2">for ${drugIds.length} drugs</span>
        <div class="flex gap-3 mt-1 text-xs">
          ${summary.contraindicated > 0 ? `<span class="text-red-400">${summary.contraindicated} contraindicated</span>` : ''}
          ${summary.major > 0 ? `<span class="text-orange-400">${summary.major} major</span>` : ''}
          ${summary.moderate > 0 ? `<span class="text-yellow-400">${summary.moderate} moderate</span>` : ''}
          ${summary.minor > 0 ? `<span class="text-green-400">${summary.minor} minor</span>` : ''}
          ${summary.total === 0 ? '<span class="text-emerald-400">No interactions detected</span>' : ''}
        </div>
      </div>
    </div>`;

  listEl.innerHTML = interactions.length > 0
    ? interactions.map(ddi => `
        <div class="border border-slate-800 rounded-lg p-3">
          <div class="flex items-center gap-2 mb-2 flex-wrap">
            ${severityBadge(ddi.severity)}
            <span class="text-sm text-white">${ddi.drug1Name} × ${ddi.drug2Name}</span>
          </div>
          <p class="text-xs text-slate-400 mb-1"><span class="text-slate-500">Mechanism:</span> ${ddi.mechanism}</p>
          <p class="text-xs text-slate-400 mb-1"><span class="text-slate-500">Effect:</span> ${ddi.clinicalEffect}</p>
          <p class="text-xs text-slate-400"><span class="text-slate-500">Management:</span> ${ddi.management}</p>
        </div>`)
      .join('')
    : '<p class="text-emerald-400 text-sm text-center py-2"><i class="fas fa-check-circle mr-1"></i>No interactions detected between selected drugs</p>';
}

// ── Guidelines ────────────────────────────────────────────────────────────────
async function loadGuidelines() {
  const topicsD = await apiFetch('/guidelines/topics');
  if (topicsD.success) {
    const sel = document.getElementById('gl-topic');
    topicsD.data.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t; opt.textContent = t.replace(/_/g,' ');
      sel.appendChild(opt);
    });
  }
  searchGuidelines();
}

async function searchGuidelines() {
  const q = document.getElementById('gl-search').value.trim();
  const topic = document.getElementById('gl-topic').value;
  const el = document.getElementById('gl-results');
  el.innerHTML = '<div class="text-center py-6"><div class="spinner mx-auto mb-2"></div></div>';

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (topic) params.set('topic', topic);

  const d = await apiFetch('/guidelines' + (params.toString() ? '?' + params : ''));
  renderGuidelines(d.data || [], el);
}

async function lookupByIcd() {
  const code = document.getElementById('gl-icd').value.trim();
  if (!code) { toast('Enter an ICD-10 code', true); return; }
  const el = document.getElementById('gl-results');
  el.innerHTML = '<div class="text-center py-6"><div class="spinner mx-auto mb-2"></div></div>';
  const d = await apiFetch(`/guidelines/by-icd/${encodeURIComponent(code)}`);
  renderGuidelines(d.data || [], el);
}

function renderGuidelines(guidelines, el) {
  if (!guidelines || guidelines.length === 0) {
    el.innerHTML = '<div class="card text-center text-slate-500 text-sm py-8">No guidelines found matching your criteria</div>';
    return;
  }
  const evColors = { I: 'text-emerald-400', II: 'text-yellow-400', III: 'text-orange-400' };
  el.innerHTML = guidelines.map(g => `
    <div class="guideline-card">
      <div class="flex items-start justify-between gap-3 mb-2">
        <div>
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="badge badge-info text-xs">${g.source}</span>
            <span class="text-xs text-slate-500">${g.year}</span>
            <span class="text-xs ${evColors[g.evidenceLevel] || 'text-slate-400'}">Level ${g.evidenceLevel} Evidence</span>
          </div>
          <h4 class="text-sm font-semibold text-white">${g.title}</h4>
          <p class="text-xs text-slate-400 mt-1">${g.summary}</p>
        </div>
        ${g.url ? `<a href="${g.url}" target="_blank" class="text-indigo-400 hover:text-indigo-300 text-xs flex-shrink-0"><i class="fas fa-external-link-alt"></i></a>` : ''}
      </div>
      <div class="mt-3">
        <p class="text-xs font-semibold text-slate-400 mb-2">Key Recommendations:</p>
        <ul class="space-y-1">
          ${g.keyRecommendations.slice(0, 4).map(r => `
            <li class="text-xs text-slate-300 flex gap-2">
              <i class="fas fa-chevron-right text-indigo-400 mt-0.5 flex-shrink-0 text-xs"></i>
              <span>${r}</span>
            </li>`).join('')}
          ${g.keyRecommendations.length > 4 ? `<li class="text-xs text-slate-600">+${g.keyRecommendations.length - 4} more recommendations…</li>` : ''}
        </ul>
      </div>
      ${g.applicableIcdCodes.length > 0 ? `
        <div class="flex flex-wrap gap-1 mt-2 pt-2 border-t border-slate-800">
          ${g.applicableIcdCodes.map(c => `<span class="font-mono text-xs bg-slate-800 text-indigo-300 px-2 py-0.5 rounded">${c}</span>`).join('')}
        </div>` : ''}
    </div>
  `).join('');
}

// ── Note Generator ────────────────────────────────────────────────────────────
async function generateNote() {
  const cc = document.getElementById('note-cc').value.trim();
  if (!cc) { toast('Chief complaint is required', true); return; }

  const symptomsRaw = document.getElementById('note-symptoms').value.trim();
  const symptoms = symptomsRaw ? symptomsRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];

  const findingsRaw = document.getElementById('note-findings').value.trim();
  const examFindings = {};
  if (findingsRaw) {
    findingsRaw.split('\n').forEach(line => {
      const [k, ...v] = line.split(':');
      if (k && v.length) examFindings[k.trim()] = v.join(':').trim();
    });
  }

  const dxRaw = document.getElementById('note-dx').value.trim();
  const diagnoses = dxRaw ? dxRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];
  const patientId = document.getElementById('note-pid').value.trim() || undefined;

  const outEl = document.getElementById('note-output');
  outEl.innerHTML = '<div class="text-center py-8"><div class="spinner mx-auto mb-2"></div><p class="text-slate-500 text-sm">Generating clinical note…</p></div>';

  const d = await apiFetch('/notes/generate', {
    method: 'POST',
    body: JSON.stringify({ chiefComplaint: cc, symptoms, examFindings, diagnoses, patientId }),
  });

  if (!d.success) {
    outEl.innerHTML = `<div class="card text-center text-red-400 text-sm py-6">${d.error}</div>`;
    return;
  }

  const note = d.data;
  document.getElementById('note-copy-btn').classList.remove('hidden');
  window._lastNote = note.fullText;

  const sectionColors = {
    CHIEF_COMPLAINT: 'text-blue-400', HPI: 'text-indigo-400', REVIEW_OF_SYSTEMS: 'text-violet-400',
    PHYSICAL_EXAM: 'text-teal-400', ASSESSMENT: 'text-orange-400', PLAN: 'text-red-400', FOLLOW_UP: 'text-emerald-400',
  };

  outEl.innerHTML = `
    <div class="mb-3 flex items-center gap-2 flex-wrap">
      <span class="badge badge-info"><i class="fas fa-robot mr-1"></i>${note.model}</span>
      <span class="text-xs text-slate-500">${note.wordCount} words</span>
      <span class="text-xs text-slate-500">${note.sections.filter(s => s.requiresReview).length} sections need review</span>
    </div>
    ${note.sections.map(s => `
      <div class="note-section">
        <div class="flex items-center justify-between mb-2">
          <h5 class="text-xs font-bold ${sectionColors[s.section] || 'text-slate-400'}">${s.section.replace(/_/g,' ')}</h5>
          <div class="flex items-center gap-2">
            ${s.requiresReview ? '<span class="badge badge-warning text-xs"><i class="fas fa-eye mr-1"></i>Review</span>' : ''}
            <span class="text-xs text-slate-600">${Math.round(s.confidence * 100)}% conf</span>
          </div>
        </div>
        <p class="text-xs text-slate-300 whitespace-pre-wrap">${s.content}</p>
      </div>
    `).join('')}
  `;

  loadNoteHistory();
  toast(`Note generated — ${note.wordCount} words`);
}

function copyNote() {
  if (window._lastNote) {
    navigator.clipboard.writeText(window._lastNote).then(() => toast('Note copied to clipboard'));
  }
}

async function loadNoteHistory() {
  const d = await apiFetch('/notes');
  const el = document.getElementById('note-history');
  if (!d.success || d.data.length === 0) {
    el.innerHTML = '<p class="text-center text-slate-500 text-xs py-2">No notes generated yet</p>';
    return;
  }
  el.innerHTML = d.data.slice(0, 5).map(n => `
    <div class="flex items-center justify-between py-2 border-b border-slate-800">
      <div>
        <p class="text-xs text-white">${n.request.chiefComplaint.slice(0, 50)}${n.request.chiefComplaint.length > 50 ? '…' : ''}</p>
        <p class="text-xs text-slate-600">${n.wordCount} words · ${new Date(n.generatedAt).toLocaleTimeString()}</p>
      </div>
      ${n.reviewed ? '<span class="badge badge-low text-xs">Reviewed</span>' : '<span class="badge badge-warning text-xs">Needs Review</span>'}
    </div>
  `).join('');
}

// ── Risk Scores ───────────────────────────────────────────────────────────────
async function computeRisk() {
  const patientId = document.getElementById('risk-pid').value.trim();
  const patientName = document.getElementById('risk-pname').value.trim();
  const category = document.getElementById('risk-cat').value;

  if (!patientId || !patientName || !category) {
    toast('All fields are required', true);
    return;
  }

  const resEl = document.getElementById('risk-result');
  resEl.classList.remove('hidden');
  resEl.innerHTML = '<div class="text-center py-4"><div class="spinner mx-auto"></div></div>';

  const d = await apiFetch('/risk/compute', {
    method: 'POST',
    body: JSON.stringify({ patientId, patientName, category }),
  });

  if (!d.success) {
    resEl.innerHTML = `<p class="text-red-400 text-sm">${d.error}</p>`;
    return;
  }

  const r = d.data;
  resEl.innerHTML = `
    <div class="bg-slate-900 border border-slate-700 rounded-xl p-4 mt-2">
      <div class="flex items-center gap-3 mb-3">
        ${scoreRing(r.score, 56)}
        <div>
          <p class="font-semibold text-white">${r.patientName}</p>
          <p class="text-xs text-slate-400">${r.category.replace(/_/g,' ')}</p>
          ${riskBadge(r.level)}
        </div>
      </div>
      <div class="space-y-2 mb-3">
        ${r.riskFactors.map(f => `
          <div class="text-xs">
            <div class="flex justify-between text-slate-400 mb-0.5">
              <span>${f.factor}</span><span class="text-slate-300">${f.value}</span>
            </div>
            <div class="h-1.5 rounded bg-slate-800 overflow-hidden">
              <div class="h-full rounded" style="width:${f.weight}%;background:${riskColor(r.score)}"></div>
            </div>
          </div>
        `).join('')}
      </div>
      <p class="text-xs text-slate-300 bg-slate-800 rounded p-2">${r.recommendation}</p>
      ${r.urgentAction ? '<p class="text-xs text-red-400 mt-2"><i class="fas fa-exclamation-triangle mr-1"></i>Urgent action required</p>' : ''}
    </div>`;

  loadRiskScores();
  toast(`Risk score computed: ${r.level} (${r.score}/100)`);
}

async function loadRiskScores() {
  const patientId = document.getElementById('risk-filter-pid')?.value.trim();
  const category = document.getElementById('risk-filter-cat')?.value;
  const el = document.getElementById('risk-list');
  if (!el) return;

  el.innerHTML = '<div class="text-center py-6"><div class="spinner mx-auto mb-2"></div></div>';

  const params = new URLSearchParams();
  if (patientId) params.set('patientId', patientId);
  if (category) params.set('category', category);

  const d = await apiFetch('/risk' + (params.toString() ? '?' + params : ''));
  if (!d.success || d.data.length === 0) {
    el.innerHTML = '<p class="text-center text-slate-500 text-sm py-8">No risk scores found. Use the form to compute one.</p>';
    return;
  }

  const sorted = [...d.data].sort((a, b) => b.score - a.score);
  el.innerHTML = sorted.map(r => `
    <div class="border border-slate-800 rounded-xl p-4">
      <div class="flex items-start gap-3">
        ${scoreRing(r.score, 52)}
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap mb-1">
            <span class="text-sm font-semibold text-white">${r.patientName}</span>
            ${riskBadge(r.level)}
            ${r.urgentAction ? '<span class="badge badge-critical text-xs"><i class="fas fa-exclamation-triangle mr-1"></i>Urgent</span>' : ''}
          </div>
          <p class="text-xs text-slate-400">${r.category.replace(/_/g,' ')}</p>
          <p class="text-xs text-slate-300 mt-2 bg-slate-900 rounded p-2">${r.recommendation}</p>
          <div class="flex gap-3 mt-2 text-xs text-slate-600">
            <span>${r.riskFactors.length} risk factors</span>
            <span>Next review: ${r.nextReviewDate}</span>
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  apiFetch('/ping').then(() => {
    document.getElementById('ai-status-text').textContent = 'AI Engine Active';
    loadDashboard();
  }).catch(() => {
    document.getElementById('ai-status-dot').className = 'w-2 h-2 rounded-full bg-red-500';
    document.getElementById('ai-status-text').textContent = 'AI Engine Offline';
  });
});
