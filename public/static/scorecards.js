// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 7A: Provider Scorecards & Benchmarking — Frontend
// ─────────────────────────────────────────────────────────────────────────────

const API = '/api/scorecards'

// ── State ─────────────────────────────────────────────────────────────────────
let state = {
  range: '30d',
  selectedProvider: null,   // null = practice view
  summary: null,
  scorecard: null,
  goals: [],
  providers: [],
}

// ── Chart registry (destroy before recreating) ────────────────────────────────
const CHARTS = {}
function mkChart(id, config) {
  if (CHARTS[id]) { CHARTS[id].destroy(); delete CHARTS[id] }
  const el = document.getElementById(id)
  if (!el) return null
  CHARTS[id] = new Chart(el, config)
  return CHARTS[id]
}

// ── Colour palette ────────────────────────────────────────────────────────────
const PALETTE = ['#6366f1','#10b981','#f59e0b','#ef4444','#06b6d4','#a855f7','#f97316','#3b82f6']
const GRID   = 'rgba(99,102,241,0.07)'
const TICK   = '#475569'

// ── Chart defaults ────────────────────────────────────────────────────────────
Chart.defaults.color = '#94a3b8'
Chart.defaults.font.family = "'Inter', system-ui, sans-serif"
Chart.defaults.font.size = 11

function lineOpts(label, color) {
  return {
    type: 'line',
    data: { labels: [], datasets: [{ label, data: [], borderColor: color, backgroundColor: color + '22',
      borderWidth: 2, pointRadius: 2, pointHoverRadius: 4, fill: true, tension: 0.35 }] },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: GRID }, ticks: { color: TICK, maxTicksLimit: 8, maxRotation: 0 } },
        y: { grid: { color: GRID }, ticks: { color: TICK } },
      },
    },
  }
}

function barOpts(labels, data, colors) {
  return {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: colors || PALETTE.slice(0, labels.length),
      borderRadius: 4, borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: TICK, maxRotation: 30 } },
        y: { grid: { color: GRID }, ticks: { color: TICK } },
      },
    },
  }
}

function doughnutOpts(labels, data) {
  return {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: PALETTE.slice(0, labels.length),
      borderWidth: 0, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: true,
      cutout: '60%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 12, boxWidth: 10, font: { size: 10 } } },
      },
    },
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function $id(id) { return document.getElementById(id) }
function fmt$(n) { return n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + n }
function fmtN(n) { return typeof n === 'number' ? n.toLocaleString() : '—' }
function fmtPct(n) { return typeof n === 'number' ? n + '%' : '—' }

function trendHtml(dir, pct) {
  const cls = dir === 'up' ? 't-up' : dir === 'down' ? 't-down' : 't-flat'
  const ico = dir === 'up' ? 'fa-arrow-trend-up' : dir === 'down' ? 'fa-arrow-trend-down' : 'fa-minus'
  return `<span class="${cls}"><i class="fas ${ico} mr-0.5"></i>${Math.abs(pct)}%</span>`
}

function chipHtml(status) {
  const map = { ON_TRACK: ['on_track','On Track'], AT_RISK: ['at_risk','At Risk'],
                ACHIEVED: ['achieved','Achieved'], MISSED: ['missed','Missed'] }
  const [cls, lbl] = map[status] || ['on_track', status]
  return `<span class="chip ch-${cls}">${lbl}</span>`
}

function provColor(id) {
  const map = { 'dr-chen': '#6366f1', 'dr-patel': '#10b981', 'dr-torres': '#f59e0b' }
  return map[id] || '#94a3b8'
}

function showToast(msg, isErr = false) {
  const el = $id('toast')
  el.textContent = msg
  el.className = `fixed bottom-6 left-1/2 -translate-x-1/2 text-sm px-5 py-2.5 rounded-xl shadow-2xl z-[300] ${isErr ? 'bg-red-900 border border-red-700 text-red-200' : 'bg-slate-800 border border-slate-600 text-white'}`
  setTimeout(() => el.classList.add('hidden'), 3000)
}

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const r = await fetch(API + path, opts)
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

// ── Initialization ────────────────────────────────────────────────────────────
async function init() {
  try {
    await apiFetch('/ping')
    const r = await apiFetch('/providers')
    state.providers = r.data || []
    renderProviderSidebar()
    await loadPracticeSummary()
  } catch (e) {
    console.error('init error', e)
    showToast('Failed to load scorecards data', true)
  }
}

// ── Provider sidebar ──────────────────────────────────────────────────────────
function renderProviderSidebar() {
  const el = $id('provider-list')
  if (!el) return
  el.innerHTML = state.providers.map(p => `
    <button onclick="selectProvider('${p.id}')" id="prov-btn-${p.id}" class="prov-card w-full text-left flex items-center gap-2">
      <div class="prov-avatar text-white" style="background:${provColor(p.id)}">${p.initials}</div>
      <div>
        <div class="text-xs font-bold text-slate-200">${p.name}</div>
        <div class="text-xs text-slate-500">${p.specialty.split(' ')[0]}</div>
      </div>
    </button>
  `).join('')
}

// ── Provider / Practice selection ─────────────────────────────────────────────
async function selectProvider(id) {
  state.selectedProvider = id === '__practice__' ? null : id

  // Update sidebar active state
  document.querySelectorAll('.prov-card').forEach(el => el.classList.remove('active'))
  const btn = $id(`prov-btn-${id}`)
  if (btn) btn.classList.add('active')

  if (state.selectedProvider === null) {
    await loadPracticeSummary()
  } else {
    await loadProviderScorecard(state.selectedProvider)
  }
}

// ── Date range ────────────────────────────────────────────────────────────────
async function setRange(range, el) {
  state.range = range
  document.querySelectorAll('.range-pill').forEach(p => p.classList.remove('active'))
  if (el) el.classList.add('active')

  if (state.selectedProvider) {
    await loadProviderScorecard(state.selectedProvider)
  } else {
    await loadPracticeSummary()
  }
}

// ── Practice summary ──────────────────────────────────────────────────────────
async function loadPracticeSummary() {
  try {
    const r = await apiFetch(`/summary?range=${state.range}`)
    state.summary = r.data
    renderOverview(state.summary)

    // If in overview tab, show it; else switch
    const overviewTab = $id('tab-overview')
    if (overviewTab && !overviewTab.classList.contains('hidden')) {
      // already visible
    } else {
      showTab('overview', $id('tab-btn-overview'))
    }
  } catch (e) {
    console.error('summary error', e)
    showToast('Failed to load practice summary', true)
  }
}

// ── Render overview tab ───────────────────────────────────────────────────────
function renderOverview(s) {
  if (!s) return

  // Stats
  $id('ov-visits').textContent    = fmtN(s.totalVisits)
  $id('ov-revenue').textContent   = fmt$(s.totalRevenue)
  $id('ov-coll-rate').textContent = s.avgCollectionRate + '% collection'
  $id('ov-new-pts').textContent   = fmtN(s.totalNewPatients)
  $id('ov-satisf').textContent    = s.avgSatisfaction
  $id('ov-exam-min').textContent  = s.avgExamMinutes + ' min'
  $id('ov-providers').textContent = s.providerCount + ' providers'

  // Leaderboard
  const lb = $id('leaderboard-list')
  if (lb) {
    lb.innerHTML = s.leaderboard.map(e => `
      <div class="lb-row">
        <div class="lb-rank rank-${e.rank}">${e.rank}</div>
        <div class="prov-avatar text-white text-xs" style="background:${provColor(e.providerId)}">
          ${state.providers.find(p => p.id === e.providerId)?.initials || '?'}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-bold text-slate-200 truncate">${e.providerName}</div>
          <div class="text-xs text-slate-500">${e.specialty.split('&')[0].trim()}</div>
        </div>
        <div class="text-right">
          <div class="text-sm font-bold text-indigo-400">${e.overallScore}</div>
          <div class="text-xs text-slate-500">score</div>
        </div>
        <div class="text-right ml-2">
          <div class="text-xs font-semibold">${fmtN(e.visits)}</div>
          <div class="text-xs text-slate-500">visits</div>
        </div>
        <div class="ml-2">${trendHtml(e.trend, 0)}</div>
      </div>
    `).join('')
  }

  // Practice visits chart
  if (s.practiceByDay?.length) {
    const cfg = lineOpts('Visits', '#6366f1')
    cfg.data.labels = s.practiceByDay.map(d => d.date.slice(5))
    cfg.data.datasets[0].data = s.practiceByDay.map(d => d.value)
    mkChart('chart-practice-visits', cfg)
  }

  // Visits by type (bar)
  const typeKeys = Object.keys(s.visitsByType || {})
  if (typeKeys.length) {
    const shortLabels = typeKeys.map(k => k.replace(/_/g, ' ').split(' ').map(w => w[0]).join(''))
    mkChart('chart-visit-types', barOpts(shortLabels, typeKeys.map(k => s.visitsByType[k]), PALETTE.slice(0, typeKeys.length)))
  }

  // Revenue by payer (doughnut)
  const payerKeys = Object.keys(s.revenueByPayer || {})
  if (payerKeys.length) {
    mkChart('chart-payer-mix', doughnutOpts(payerKeys, payerKeys.map(k => s.revenueByPayer[k])))
  }
}

// ── Provider scorecard ────────────────────────────────────────────────────────
async function loadProviderScorecard(providerId) {
  try {
    const r = await apiFetch(`/providers/${providerId}?range=${state.range}`)
    state.scorecard = r.data
    renderScorecard(state.scorecard)
    showTab('scorecard', $id('tab-btn-scorecard'))
  } catch (e) {
    console.error('scorecard error', e)
    showToast('Failed to load provider scorecard', true)
  }
}

function renderScorecard(card) {
  if (!card) return

  // Show content, hide prompt
  $id('scorecard-select-prompt')?.classList.add('hidden')
  $id('scorecard-content')?.classList.remove('hidden')
  $id('bench-select-prompt')?.classList.add('hidden')
  $id('bench-content')?.classList.remove('hidden')
  $id('trends-select-prompt')?.classList.add('hidden')
  $id('trends-content')?.classList.remove('hidden')

  // Provider header
  const avatarEl = $id('sc-avatar')
  if (avatarEl) {
    avatarEl.textContent = card.avatarInitials
    avatarEl.style.background = provColor(card.providerId)
  }
  $id('sc-name').textContent = card.providerName
  $id('sc-specialty').textContent = card.specialty
  $id('sc-score').textContent = card.overallScore

  // Trend text
  const t = card.overallTrend
  $id('sc-trend-text').innerHTML = trendHtml(t.dir, t.pct)

  // Score ring chart (doughnut)
  const ringColor = card.overallScore >= 85 ? '#10b981' : card.overallScore >= 70 ? '#6366f1' : card.overallScore >= 55 ? '#f59e0b' : '#ef4444'
  mkChart('chart-score-ring', {
    type: 'doughnut',
    data: { datasets: [{ data: [card.overallScore, 100 - card.overallScore],
      backgroundColor: [ringColor, 'rgba(99,102,241,0.08)'], borderWidth: 0, hoverOffset: 0 }] },
    options: { responsive: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: false } } },
  })

  // KPI grid
  const v = card.volume, e = card.efficiency, r = card.revenue, q = card.quality
  const kpis = [
    { lbl: 'Total Visits',     val: fmtN(v.totalVisits),          sub: `${v.avgDailyVisits}/day avg`,    col: 'c-indigo' },
    { lbl: 'New Patients',     val: fmtN(v.newPatients),           sub: `${v.returnPatients} returning`,  col: 'c-cyan'   },
    { lbl: 'Revenue Charged',  val: fmt$(r.totalCharged),          sub: fmt$(r.totalCollected) + ' collected', col: 'c-green' },
    { lbl: 'Collection Rate',  val: fmtPct(r.collectionRate),      sub: fmt$(r.outstandingAr) + ' AR',    col: 'c-yellow' },
    { lbl: 'Avg Exam (min)',   val: e.avgExamMinutes + ' min',     sub: e.examCompletionRate + '% signed',col: 'c-indigo' },
    { lbl: 'Utilization',      val: fmtPct(e.utilizationRate),     sub: e.onTimeStartRate + '% on-time',  col: 'c-purple' },
    { lbl: 'Satisfaction',     val: q.patientSatisfactionScore,    sub: '/ 5.0 rating',                   col: 'c-yellow' },
    { lbl: 'Return Visit Rate',val: fmtPct(q.returnVisitRate),     sub: q.referralRate + '% referred',    col: 'c-green'  },
    { lbl: 'Coding Accuracy',  val: fmtPct(q.codingAccuracy),      sub: q.preventiveCareRate + '% prev. care', col: 'c-cyan' },
  ]
  const grid = $id('sc-kpi-grid')
  if (grid) {
    grid.innerHTML = kpis.map(k => `
      <div class="stat-card ${k.col}">
        <div class="num">${k.val}</div>
        <div class="lbl">${k.lbl}</div>
        <div class="sub">${k.sub}</div>
      </div>
    `).join('')
  }

  // Volume & Revenue daily charts
  if (v.visitsByDay?.length) {
    const cfg = lineOpts('Visits', '#06b6d4')
    cfg.data.labels = v.visitsByDay.map(d => d.date.slice(5))
    cfg.data.datasets[0].data = v.visitsByDay.map(d => d.value)
    mkChart('chart-sc-volume', cfg)
  }
  if (r.revenueByDay?.length) {
    const cfg = lineOpts('Revenue', '#10b981')
    cfg.data.labels = r.revenueByDay.map(d => d.date.slice(5))
    cfg.data.datasets[0].data = r.revenueByDay.map(d => d.value)
    mkChart('chart-sc-revenue', cfg)
  }

  // Appt type & payer charts
  const typeKeys = Object.keys(v.visitsByType || {})
  if (typeKeys.length) {
    const labels = typeKeys.map(k => k.replace(/_/g, ' '))
    mkChart('chart-sc-appt-types', doughnutOpts(labels, typeKeys.map(k => v.visitsByType[k])))
  }
  const payerKeys = Object.keys(r.revenueByPayer || {})
  if (payerKeys.length) {
    mkChart('chart-sc-payer', doughnutOpts(payerKeys, payerKeys.map(k => r.revenueByPayer[k])))
  }

  // Benchmarks tab
  renderBenchmarks(card.benchmarks)

  // Trends tab
  renderTrends(card.periodSnapshots)
}

// ── Benchmarks ────────────────────────────────────────────────────────────────
function renderBenchmarks(benchmarks) {
  const list = $id('benchmark-list')
  if (!list || !benchmarks) return

  // Find max for bar scaling
  const maxVal = benchmarks.reduce((mx, b) => Math.max(mx, b.providerValue, b.practiceAvg, b.nationalAvg), 0)

  list.innerHTML = benchmarks.map(b => {
    const pct = maxVal > 0 ? (b.providerValue / maxVal * 100).toFixed(1) : 0
    const isGood = b.higherIsBetter
      ? b.providerValue >= b.practiceAvg
      : b.providerValue <= b.practiceAvg
    const barColor = isGood ? '#10b981' : '#f59e0b'
    const compSymbol = b.higherIsBetter
      ? (b.providerValue >= b.practiceAvg ? '▲' : '▼')
      : (b.providerValue <= b.practiceAvg ? '▲' : '▼')
    const compColor = isGood ? 'text-green-400' : 'text-yellow-400'

    return `
      <div class="bm-row">
        <div class="bm-label">${b.metric}</div>
        <div class="bm-bar-wrap">
          <div class="bm-bar" style="width:${pct}%;background:${barColor}"></div>
        </div>
        <div class="bm-value">${b.providerValue}${b.unit.startsWith('/') || b.unit === '%' ? b.unit : ' ' + b.unit}</div>
        <div class="bm-avg text-slate-500">
          <span class="font-mono">${b.practiceAvg}${b.unit.startsWith('/') || b.unit === '%' ? b.unit : ''}</span>
          <span class="${compColor} ml-1">${compSymbol}</span>
        </div>
      </div>
    `
  }).join('')

  // Radar chart
  const labels = benchmarks.map(b => b.metric.split(' ').slice(0, 2).join(' '))
  // Normalise to 0-100 for radar
  const normalize = (b) => {
    const ref = b.nationalAvg || 1
    if (b.higherIsBetter) return Math.min(100, (b.providerValue / ref) * 100)
    else return Math.min(100, (ref / (b.providerValue || 1)) * 100)
  }
  const provData = benchmarks.map(normalize)
  const practiceData = benchmarks.map(b => {
    const ref = b.nationalAvg || 1
    if (b.higherIsBetter) return Math.min(100, (b.practiceAvg / ref) * 100)
    else return Math.min(100, (ref / (b.practiceAvg || 1)) * 100)
  })

  mkChart('chart-radar', {
    type: 'radar',
    data: {
      labels,
      datasets: [
        { label: 'This Provider', data: provData, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.2)', borderWidth: 2, pointRadius: 3 },
        { label: 'Practice Avg',  data: practiceData, borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.08)', borderWidth: 1.5, borderDash: [4,3], pointRadius: 2 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        r: {
          grid: { color: GRID },
          ticks: { display: false },
          pointLabels: { color: '#94a3b8', font: { size: 10 } },
          min: 0, max: 120,
        },
      },
      plugins: { legend: { position: 'bottom', labels: { padding: 14, boxWidth: 10 } } },
    },
  })
}

// ── Trends ────────────────────────────────────────────────────────────────────
function renderTrends(snapshots) {
  if (!snapshots?.length) return

  // Table
  const tbody = $id('snapshots-body')
  if (tbody) {
    tbody.innerHTML = snapshots.map(s => `
      <tr>
        <td class="font-mono text-slate-400">${s.period}</td>
        <td class="font-semibold">${fmtN(s.visits)}</td>
        <td class="text-green-400">${fmt$(s.revenue)}</td>
        <td>${fmtN(s.newPatients)}</td>
        <td>${s.avgExamMin} min</td>
        <td>${s.satisfaction} <span class="text-slate-500">/ 5</span></td>
      </tr>
    `).join('')
  }

  // Weekly visits chart
  const visitCfg = {
    type: 'bar',
    data: {
      labels: snapshots.map(s => s.period.split('-').slice(1).join('-')),
      datasets: [{
        label: 'Visits', data: snapshots.map(s => s.visits),
        backgroundColor: '#6366f1', borderRadius: 5, borderWidth: 0,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: TICK } },
        y: { grid: { color: GRID }, ticks: { color: TICK } },
      },
    },
  }
  mkChart('chart-weekly-visits', visitCfg)

  // Weekly revenue chart
  const revCfg = {
    type: 'line',
    data: {
      labels: snapshots.map(s => s.period.split('-').slice(1).join('-')),
      datasets: [{
        label: 'Revenue', data: snapshots.map(s => s.revenue),
        borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,0.15)',
        borderWidth: 2, pointRadius: 3, fill: true, tension: 0.35,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: TICK } },
        y: { grid: { color: GRID }, ticks: { color: TICK, callback: v => '$' + (v/1000).toFixed(0) + 'k' } },
      },
    },
  }
  mkChart('chart-weekly-revenue', revCfg)
}

// ── Goals ─────────────────────────────────────────────────────────────────────
async function loadGoals() {
  const provFilter   = $id('goals-prov-filter')?.value || ''
  const statusFilter = $id('goals-status-filter')?.value || ''
  try {
    const params = provFilter ? `?providerId=${provFilter}` : ''
    const r = await apiFetch(`/goals${params}`)
    let goals = r.data || []
    if (statusFilter) goals = goals.filter(g => g.status === statusFilter)
    state.goals = goals
    renderGoals(goals)
  } catch (e) {
    console.error('goals error', e)
    showToast('Failed to load goals', true)
  }
}

function renderGoals(goals) {
  const el = $id('goals-list')
  if (!el) return
  if (!goals.length) {
    el.innerHTML = '<div class="text-slate-500 text-sm text-center py-8">No goals found. Create one using the button above.</div>'
    return
  }

  const provName = (id) => state.providers.find(p => p.id === id)?.name || id

  el.innerHTML = goals.map(g => {
    const pct = g.targetValue > 0 ? Math.min(100, Math.round(g.currentValue / g.targetValue * 100)) : 0
    const fillColor = g.status === 'ACHIEVED' ? '#06b6d4' : g.status === 'ON_TRACK' ? '#10b981' : g.status === 'AT_RISK' ? '#f59e0b' : '#ef4444'
    return `
      <div class="card mb-3">
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              ${chipHtml(g.status)}
              <span class="text-xs text-slate-500">${provName(g.providerId)} · ${g.period}</span>
            </div>
            <div class="text-sm font-semibold text-slate-100 mb-2">${g.description}</div>
            <div class="prog-bar mb-1.5">
              <div class="prog-fill" style="width:${pct}%;background:${fillColor}"></div>
            </div>
            <div class="flex justify-between text-xs text-slate-400">
              <span>Current: <strong>${g.currentValue} ${g.unit}</strong></span>
              <span>${pct}% of goal</span>
              <span>Target: <strong>${g.targetValue} ${g.unit}</strong></span>
            </div>
            <div class="text-xs text-slate-500 mt-1">Due: ${g.dueDate}</div>
          </div>
          <div class="flex gap-1.5 flex-shrink-0">
            <button onclick="editGoal('${g.id}')" class="btn-sm"><i class="fas fa-edit"></i></button>
            <button onclick="deleteGoal('${g.id}')" class="btn-danger"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </div>
    `
  }).join('')
}

// ── Goal modal ────────────────────────────────────────────────────────────────
function openGoalModal(prefillProviderId) {
  $id('goal-edit-id').value = ''
  $id('modal-goal-title').textContent = 'New Goal'
  $id('goal-provider').value = prefillProviderId || (state.selectedProvider || 'dr-chen')
  $id('goal-metric').value = 'visits'
  $id('goal-period').value = ''
  $id('goal-desc').value = ''
  $id('goal-target').value = ''
  $id('goal-current').value = ''
  $id('goal-unit').value = ''
  const d = new Date(); d.setMonth(d.getMonth() + 1)
  $id('goal-due').value = d.toISOString().slice(0, 10)
  $id('goal-status').value = 'ON_TRACK'
  $id('modal-goal').classList.remove('hidden')
}

async function editGoal(id) {
  const goal = state.goals.find(g => g.id === id)
  if (!goal) return
  $id('goal-edit-id').value = id
  $id('modal-goal-title').textContent = 'Edit Goal'
  $id('goal-provider').value = goal.providerId
  $id('goal-metric').value = goal.metric
  $id('goal-period').value = goal.period
  $id('goal-desc').value = goal.description
  $id('goal-target').value = goal.targetValue
  $id('goal-current').value = goal.currentValue
  $id('goal-unit').value = goal.unit
  $id('goal-due').value = goal.dueDate
  $id('goal-status').value = goal.status
  $id('modal-goal').classList.remove('hidden')
}

async function submitGoal() {
  const editId = $id('goal-edit-id').value
  const body = {
    providerId:   $id('goal-provider').value,
    metric:       $id('goal-metric').value,
    description:  $id('goal-desc').value,
    targetValue:  parseFloat($id('goal-target').value),
    currentValue: parseFloat($id('goal-current').value),
    unit:         $id('goal-unit').value,
    period:       $id('goal-period').value,
    dueDate:      $id('goal-due').value,
    status:       $id('goal-status').value,
  }
  if (!body.description || !body.period || !body.unit || isNaN(body.targetValue) || isNaN(body.currentValue)) {
    showToast('Please fill in all required fields', true)
    return
  }
  try {
    if (editId) {
      await apiFetch(`/goals/${editId}`, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) })
      showToast('Goal updated')
    } else {
      await apiFetch('/goals', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) })
      showToast('Goal created')
    }
    closeModal('modal-goal')
    await loadGoals()
  } catch (e) {
    showToast('Failed to save goal: ' + e.message, true)
  }
}

async function deleteGoal(id) {
  if (!confirm('Delete this goal?')) return
  try {
    await apiFetch(`/goals/${id}`, { method: 'DELETE' })
    showToast('Goal deleted')
    await loadGoals()
  } catch (e) {
    showToast('Failed to delete goal', true)
  }
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function showTab(name, el) {
  // Deactivate all tabs
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('[id^="tab-"]').forEach(t => {
    if (!t.id.startsWith('tab-btn')) t.classList.add('hidden')
  })
  // Activate selected
  if (el) el.classList.add('active')
  const tab = $id(`tab-${name}`)
  if (tab) tab.classList.remove('hidden')

  // Lazy-load goals tab
  if (name === 'goals') loadGoals()
}

// ── Modal helpers ─────────────────────────────────────────────────────────────
function closeModal(id) {
  $id(id)?.classList.add('hidden')
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden')
  }
})

// ── Start ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', init)
