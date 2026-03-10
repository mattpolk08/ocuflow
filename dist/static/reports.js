// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Reports & Analytics Controller  (Phase 2B)
// public/static/reports.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict'

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $ = (s, c = document) => c.querySelector(s)
const $$ = (s, c = document) => [...c.querySelectorAll(s)]

// ── Format helpers ────────────────────────────────────────────────────────────
const fmtUSD  = n => '$' + (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtPct  = n => ((n ?? 0) * 100).toFixed(1) + '%'
const fmtNum  = n => (n ?? 0).toLocaleString()
const esc     = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

// ── Chart.js defaults ─────────────────────────────────────────────────────────
Chart.defaults.color          = '#64748b'
Chart.defaults.borderColor    = '#1e293b'
Chart.defaults.font.family    = 'Inter, sans-serif'
Chart.defaults.font.size      = 11
Chart.defaults.plugins.legend.labels.boxWidth = 10
Chart.defaults.plugins.legend.labels.padding  = 14

const CHART_GRID = { color: 'rgba(30,41,59,0.8)', drawBorder: false }

// ── Palette ───────────────────────────────────────────────────────────────────
const COLORS = {
  blue:   '#3b82f6', emerald:'#10b981', violet:'#8b5cf6', amber: '#f59e0b',
  rose:   '#f43f5e', cyan:   '#06b6d4', indigo:'#6366f1', teal:  '#14b8a6',
  slate:  '#64748b', orange: '#f97316', sky:   '#0ea5e9', pink:  '#ec4899',
}
const PALETTE = Object.values(COLORS)

// ── Chart registry (to destroy on re-render) ──────────────────────────────────
const charts = {}

function destroyChart(id) {
  if (charts[id]) { charts[id].destroy(); delete charts[id] }
}

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  range:       '30d',
  activeSection: 'overview',
  data:        null,   // full ReportsDashboard
  loading:     false,
}

// ── Fetch dashboard data ───────────────────────────────────────────────────────
async function loadData() {
  if (S.loading) return
  S.loading = true
  $('#loading-state').classList.remove('hidden')
  $$('[id^="section-"]').forEach(el => el.classList.add('hidden'))

  try {
    const res = await fetch(`/api/reports/dashboard?range=${S.range}`)
    const json = await res.json()
    if (!json.success) throw new Error(json.error)
    S.data = json.data
    renderAll()
  } catch (err) {
    $('#loading-state').innerHTML = `<div class="text-center"><i class="fas fa-circle-xmark text-red-400 text-3xl mb-3"></i><p class="text-red-400">${esc(err.message)}</p></div>`
  } finally {
    S.loading = false
  }
}

// ── Render everything ─────────────────────────────────────────────────────────
function renderAll() {
  $('#loading-state').classList.add('hidden')
  renderOverview()
  renderRevenue()
  renderProviders()
  renderPayerMix()
  renderArAging()
  renderAppointments()
  renderExams()
  renderPatients()
  showSection(S.activeSection)
}

// ── Section visibility ────────────────────────────────────────────────────────
function showSection(name) {
  S.activeSection = name
  $$('[id^="section-"]').forEach(el => el.classList.add('hidden'))
  $(`#section-${name}`)?.classList.remove('hidden')
  $$('[data-section]').forEach(el => el.classList.toggle('active', el.dataset.section === name))
}

// ── KPI card helper ───────────────────────────────────────────────────────────
function kpiCard(icon, iconColor, label, value, sub = '', trend = '') {
  return `
    <div class="stat-card">
      <div class="flex items-start justify-between mb-2">
        <p class="stat-label">${label}</p>
        <i class="fas ${icon} text-${iconColor}-400 opacity-60"></i>
      </div>
      <p class="stat-value text-white">${value}</p>
      ${sub   ? `<p class="stat-sub">${sub}</p>` : ''}
      ${trend ? `<div class="mt-2">${trend}</div>` : ''}
    </div>
  `
}

// ═══════════════════════════════════════════════════════════════════════════════
// OVERVIEW
// ═══════════════════════════════════════════════════════════════════════════════
function renderOverview() {
  const { revenue, appointments, patients, providers } = S.data

  $('#kpi-row').innerHTML = [
    kpiCard('fa-circle-dollar-to-slot', 'emerald', 'Total Charged', fmtUSD(revenue.totalCharged), `${fmtUSD(revenue.totalCollected)} collected`),
    kpiCard('fa-percent', 'blue',    'Collection Rate', fmtPct(revenue.collectionRate), `${fmtUSD(revenue.totalOutstanding)} outstanding`),
    kpiCard('fa-calendar-check','cyan','Visits',         fmtNum(revenue.visitCount),    `Avg ${fmtUSD(revenue.avgChargePerVisit)}/visit`),
    kpiCard('fa-users',         'violet','Patients',     fmtNum(patients.totalPatients),`${patients.newPatients30d} new (30d)`),
  ].join('')

  // Mini revenue chart (last 14 data points)
  const revSeries = revenue.dailySeries.slice(-14)
  destroyChart('revenue-mini')
  charts['revenue-mini'] = new Chart($('#chart-revenue-mini'), {
    type: 'bar',
    data: {
      labels: revSeries.map(d => d.date.slice(5)),
      datasets: [
        { label: 'Charged',   data: revSeries.map(d => d.charged),   backgroundColor: 'rgba(59,130,246,.35)', borderColor: COLORS.blue,    borderWidth: 1.5, borderRadius: 3 },
        { label: 'Collected', data: revSeries.map(d => d.collected), backgroundColor: 'rgba(16,185,129,.35)', borderColor: COLORS.emerald, borderWidth: 1.5, borderRadius: 3 },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: CHART_GRID }, y: { grid: CHART_GRID, ticks: { callback: v => '$' + v } } } },
  })

  // Mini appt chart
  const apptSeries = appointments.dailySeries.slice(-14)
  destroyChart('appt-mini')
  charts['appt-mini'] = new Chart($('#chart-appt-mini'), {
    type: 'line',
    data: {
      labels: apptSeries.map(d => d.date.slice(5)),
      datasets: [
        { label: 'Scheduled', data: apptSeries.map(d => d.scheduled), borderColor: COLORS.blue,    backgroundColor: 'rgba(59,130,246,.1)',  tension: 0.35, fill: true, pointRadius: 2 },
        { label: 'Completed', data: apptSeries.map(d => d.completed), borderColor: COLORS.emerald, backgroundColor: 'rgba(16,185,129,.1)',  tension: 0.35, fill: false, pointRadius: 2 },
        { label: 'No-Show',   data: apptSeries.map(d => d.noShow),   borderColor: COLORS.rose,    backgroundColor: 'transparent',          tension: 0.35, fill: false, pointRadius: 2, borderDash: [4,3] },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: CHART_GRID }, y: { grid: CHART_GRID, beginAtZero: true } } },
  })

  // Provider cards
  $('#overview-providers').innerHTML = providers.map(p => `
    <div class="flex items-center gap-4 py-3 border-b border-slate-800/60 last:border-0">
      <div class="w-9 h-9 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
        <i class="fas fa-user-doctor text-violet-400 text-sm"></i>
      </div>
      <div class="flex-1 min-w-0">
        <p class="font-semibold text-sm text-white truncate">${esc(p.providerName)}</p>
        <div class="flex gap-4 text-xs text-slate-500 mt-0.5">
          <span>${fmtNum(p.appointmentCount)} appts</span>
          <span>${fmtNum(p.examsCount)} exams</span>
          <span class="${p.noShowRate > 0.15 ? 'text-red-400' : ''}">${fmtPct(p.noShowRate)} no-show</span>
        </div>
      </div>
      <div class="text-right shrink-0">
        <p class="font-bold text-emerald-400 text-sm">${fmtUSD(p.totalCharged)}</p>
        <p class="text-xs text-slate-500">charged</p>
      </div>
    </div>
  `).join('')

  // Payer donut
  const payers = S.data.payerMix
  destroyChart('payer-donut')
  charts['payer-donut'] = new Chart($('#chart-payer-donut'), {
    type: 'doughnut',
    data: {
      labels: payers.map(p => p.payerName),
      datasets: [{ data: payers.map(p => p.totalCharged), backgroundColor: PALETTE.slice(0, payers.length), borderWidth: 2, borderColor: '#0f172a' }],
    },
    options: { responsive: true, cutout: '65%', plugins: { legend: { display: false } } },
  })
  $('#payer-legend').innerHTML = payers.slice(0,6).map((p, i) => `
    <div class="flex items-center justify-between text-xs">
      <div class="flex items-center gap-2"><span class="tooltip-dot" style="background:${PALETTE[i]}"></span><span class="text-slate-400">${esc(p.payerName)}</span></div>
      <span class="font-semibold text-white">${p.percentage}%</span>
    </div>
  `).join('')
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE
// ═══════════════════════════════════════════════════════════════════════════════
function renderRevenue() {
  const { revenue } = S.data
  $('#revenue-kpis').innerHTML = [
    kpiCard('fa-circle-dollar-to-slot', 'emerald', 'Total Charged',      fmtUSD(revenue.totalCharged)),
    kpiCard('fa-money-bill-wave',       'blue',    'Total Collected',     fmtUSD(revenue.totalCollected)),
    kpiCard('fa-percent',               'violet',  'Collection Rate',     fmtPct(revenue.collectionRate)),
    kpiCard('fa-hourglass-half',        'amber',   'Outstanding',         fmtUSD(revenue.totalOutstanding)),
  ].join('')

  const series = revenue.dailySeries
  destroyChart('revenue-full')
  charts['revenue-full'] = new Chart($('#chart-revenue-full'), {
    type: 'bar',
    data: {
      labels: series.map(d => d.date.slice(5)),
      datasets: [
        { label: 'Charged',   data: series.map(d => d.charged),   backgroundColor: 'rgba(59,130,246,.5)', borderColor: COLORS.blue,    borderWidth: 1.5, borderRadius: 3 },
        { label: 'Collected', data: series.map(d => d.collected), backgroundColor: 'rgba(16,185,129,.5)', borderColor: COLORS.emerald, borderWidth: 1.5, borderRadius: 3 },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { grid: CHART_GRID, ticks: { maxTicksLimit: 14 } },
        y: { grid: CHART_GRID, ticks: { callback: v => '$' + v } },
      },
    },
  })

  // Status breakdown table (from billing AR data)
  const billingAR = S.data.revenue   // reuse revenue section
  $('#revenue-status-table').innerHTML = `
    <div class="grid grid-cols-3 gap-3">
      ${[
        { label: 'Draft',          val: fmtUSD(0),     cls: 'text-slate-400' },
        { label: 'Pending Review', val: '',             cls: 'text-yellow-400' },
        { label: 'Submitted',      val: '',             cls: 'text-violet-400' },
        { label: 'Paid',           val: fmtUSD(revenue.totalCollected), cls: 'text-emerald-400' },
        { label: 'Outstanding',    val: fmtUSD(revenue.totalOutstanding), cls: 'text-amber-400' },
        { label: 'Adjustments',    val: fmtUSD(revenue.totalAdjustments), cls: 'text-slate-400' },
      ].map(r => `
        <div class="bg-slate-800/40 rounded-lg p-3">
          <p class="text-[10px] text-slate-500 uppercase tracking-wide mb-1">${r.label}</p>
          <p class="font-bold text-base ${r.cls}">${r.val || '—'}</p>
        </div>
      `).join('')}
    </div>
  `
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROVIDERS
// ═══════════════════════════════════════════════════════════════════════════════
function renderProviders() {
  const { providers } = S.data

  destroyChart('provider-bar')
  charts['provider-bar'] = new Chart($('#chart-provider-bar'), {
    type: 'bar',
    data: {
      labels: providers.map(p => p.providerName.split(' ').slice(0,2).join(' ')),
      datasets: [
        { label: 'Charged',   data: providers.map(p => p.totalCharged),   backgroundColor: 'rgba(139,92,246,.5)', borderColor: COLORS.violet, borderRadius: 5, borderWidth: 1.5 },
        { label: 'Collected', data: providers.map(p => p.totalCollected), backgroundColor: 'rgba(16,185,129,.5)', borderColor: COLORS.emerald, borderRadius: 5, borderWidth: 1.5 },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { x: { grid: CHART_GRID }, y: { grid: CHART_GRID, ticks: { callback: v => '$' + v } } } },
  })

  destroyChart('provider-exams')
  charts['provider-exams'] = new Chart($('#chart-provider-exams'), {
    type: 'bar',
    data: {
      labels: providers.map(p => p.providerName.split(' ').slice(0,2).join(' ')),
      datasets: [
        { label: 'Total Exams', data: providers.map(p => p.examsCount),  backgroundColor: 'rgba(59,130,246,.5)',  borderColor: COLORS.blue,  borderRadius: 5, borderWidth: 1.5 },
        { label: 'Signed',      data: providers.map(p => p.signedExams), backgroundColor: 'rgba(16,185,129,.5)', borderColor: COLORS.emerald, borderRadius: 5, borderWidth: 1.5 },
      ],
    },
    options: { responsive: true, plugins: { legend: { position: 'top' } }, scales: { x: { grid: CHART_GRID }, y: { grid: CHART_GRID, beginAtZero: true } } },
  })

  $('#provider-tbody').innerHTML = providers.map(p => `
    <tr>
      <td class="font-medium text-white">${esc(p.providerName)}</td>
      <td class="text-right">${fmtNum(p.appointmentCount)}</td>
      <td class="text-right ${p.noShowRate > 0.15 ? 'text-red-400 font-semibold' : ''}">${fmtPct(p.noShowRate)}</td>
      <td class="text-right">${fmtNum(p.examsCount)}</td>
      <td class="text-right">${fmtNum(p.signedExams)}</td>
      <td class="text-right font-semibold text-white">${fmtUSD(p.totalCharged)}</td>
      <td class="text-right text-emerald-400">${fmtUSD(p.totalCollected)}</td>
      <td class="text-right text-slate-400">${fmtUSD(p.avgChargePerVisit)}</td>
    </tr>
  `).join('')
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYER MIX
// ═══════════════════════════════════════════════════════════════════════════════
function renderPayerMix() {
  const { payerMix } = S.data

  destroyChart('payer-full')
  charts['payer-full'] = new Chart($('#chart-payer-full'), {
    type: 'doughnut',
    data: {
      labels: payerMix.map(p => p.payerName),
      datasets: [{ data: payerMix.map(p => p.totalCharged), backgroundColor: PALETTE, borderWidth: 2, borderColor: '#0f172a' }],
    },
    options: { responsive: true, cutout: '60%', plugins: { legend: { position: 'right' } } },
  })

  destroyChart('denial-bar')
  charts['denial-bar'] = new Chart($('#chart-denial-bar'), {
    type: 'bar',
    data: {
      labels: payerMix.map(p => p.payerName),
      datasets: [{ label: 'Denial Rate', data: payerMix.map(p => parseFloat((p.denialRate * 100).toFixed(1))), backgroundColor: 'rgba(244,63,94,.5)', borderColor: COLORS.rose, borderRadius: 5, borderWidth: 1.5 }],
    },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: CHART_GRID, ticks: { callback: v => v + '%' }, max: 100 }, y: { grid: { display: false } } } },
  })

  $('#payer-tbody').innerHTML = payerMix.map((p, i) => `
    <tr>
      <td class="font-medium"><span class="tooltip-dot" style="background:${PALETTE[i]};border-radius:50%;display:inline-block;width:8px;height:8px;margin-right:6px;"></span>${esc(p.payerName)}</td>
      <td class="text-right">${fmtNum(p.claimCount)}</td>
      <td class="text-right font-semibold text-white">${fmtUSD(p.totalCharged)}</td>
      <td class="text-right text-emerald-400">${fmtUSD(p.totalPaid)}</td>
      <td class="text-right">${fmtUSD(p.avgPayment)}</td>
      <td class="text-right ${p.denialRate > 0.2 ? 'text-red-400 font-semibold' : ''}">${fmtPct(p.denialRate)}</td>
      <td class="text-right text-blue-400 font-semibold">${p.percentage}%</td>
    </tr>
  `).join('')
}

// ═══════════════════════════════════════════════════════════════════════════════
// AR AGING
// ═══════════════════════════════════════════════════════════════════════════════
function renderArAging() {
  const { arAging } = S.data
  const BUCKET_COLORS = [COLORS.emerald, COLORS.blue, COLORS.amber, COLORS.orange, COLORS.rose]

  $('#aging-buckets').innerHTML = arAging.buckets.map((b, i) => `
    <div class="stat-card">
      <p class="stat-label" style="color:${BUCKET_COLORS[i]}">${esc(b.label)}</p>
      <p class="stat-value" style="color:${BUCKET_COLORS[i]}">${fmtUSD(b.totalBalance)}</p>
      <p class="stat-sub">${fmtNum(b.count)} claims · ${b.percentage}%</p>
    </div>
  `).join('')

  destroyChart('aging-bar')
  charts['aging-bar'] = new Chart($('#chart-aging-bar'), {
    type: 'bar',
    data: {
      labels: arAging.buckets.map(b => b.label),
      datasets: [{ label: 'Balance', data: arAging.buckets.map(b => b.totalBalance), backgroundColor: BUCKET_COLORS.map(c => c + '80'), borderColor: BUCKET_COLORS, borderRadius: 6, borderWidth: 2 }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { grid: CHART_GRID }, y: { grid: CHART_GRID, ticks: { callback: v => '$' + v } } },
    },
  })

  $('#aging-tbody').innerHTML = arAging.buckets.map((b, i) => `
    <tr>
      <td class="font-medium" style="color:${BUCKET_COLORS[i]}">${esc(b.label)}</td>
      <td class="text-right">${fmtNum(b.count)}</td>
      <td class="text-right font-semibold text-white">${fmtUSD(b.totalBalance)}</td>
      <td class="text-right">${b.percentage}%</td>
      <td class="pr-4" style="min-width:120px">
        <div class="prog-bar"><div class="prog-fill" style="width:${b.percentage}%;background:${BUCKET_COLORS[i]}"></div></div>
      </td>
    </tr>
  `).join('')
}

// ═══════════════════════════════════════════════════════════════════════════════
// APPOINTMENTS
// ═══════════════════════════════════════════════════════════════════════════════
function renderAppointments() {
  const { appointments: appts } = S.data

  $('#appt-kpis').innerHTML = [
    kpiCard('fa-calendar-check',    'blue',    'Total Scheduled', fmtNum(appts.totalScheduled),  `Avg ${appts.avgDailyVisits}/day`),
    kpiCard('fa-circle-check',      'emerald', 'Completed',       fmtNum(appts.totalCompleted),  fmtPct(appts.completionRate) + ' rate'),
    kpiCard('fa-person-walking-arrow-right', 'rose', 'No-Shows',  fmtNum(appts.totalNoShow),     fmtPct(appts.noShowRate) + ' rate'),
    kpiCard('fa-calendar-xmark',    'amber',   'Cancelled',       fmtNum(appts.totalCancelled),  fmtPct(appts.cancellationRate) + ' rate'),
  ].join('')

  const series = appts.dailySeries
  destroyChart('appt-full')
  charts['appt-full'] = new Chart($('#chart-appt-full'), {
    type: 'line',
    data: {
      labels: series.map(d => d.date.slice(5)),
      datasets: [
        { label: 'Scheduled', data: series.map(d => d.scheduled), borderColor: COLORS.blue,    backgroundColor: 'rgba(59,130,246,.15)', tension: 0.4, fill: true,  pointRadius: 2 },
        { label: 'Completed', data: series.map(d => d.completed), borderColor: COLORS.emerald, backgroundColor: 'transparent',         tension: 0.4, fill: false, pointRadius: 2 },
        { label: 'No-Show',   data: series.map(d => d.noShow),   borderColor: COLORS.rose,    backgroundColor: 'transparent',         tension: 0.4, fill: false, pointRadius: 2, borderDash: [5,3] },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'top' } },
      scales: { x: { grid: CHART_GRID, ticks: { maxTicksLimit: 14 } }, y: { grid: CHART_GRID, beginAtZero: true } },
    },
  })

  const topTypes = appts.byType.slice(0, 8)
  destroyChart('appt-type')
  charts['appt-type'] = new Chart($('#chart-appt-type'), {
    type: 'doughnut',
    data: {
      labels: topTypes.map(t => t.label),
      datasets: [{ data: topTypes.map(t => t.count), backgroundColor: PALETTE.slice(0, topTypes.length), borderWidth: 2, borderColor: '#0f172a' }],
    },
    options: { responsive: true, cutout: '55%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } },
  })

  $('#appt-type-tbody').innerHTML = appts.byType.map((t, i) => `
    <tr>
      <td><span class="tooltip-dot" style="background:${PALETTE[i % PALETTE.length]}"></span>${esc(t.label)}</td>
      <td class="text-right font-semibold text-white">${fmtNum(t.count)}</td>
      <td class="text-right text-slate-400">${t.percentage}%</td>
    </tr>
  `).join('')
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXAMS
// ═══════════════════════════════════════════════════════════════════════════════
function renderExams() {
  const { exams } = S.data

  $('#exam-kpis').innerHTML = [
    kpiCard('fa-file-medical',    'indigo',  'Total Exams',    fmtNum(exams.totalExams),     ''),
    kpiCard('fa-signature',       'emerald', 'Signed',         fmtNum(exams.signedExams),    fmtPct(exams.totalExams ? exams.signedExams / exams.totalExams : 0) + ' of total'),
    kpiCard('fa-pencil',          'amber',   'Draft',          fmtNum(exams.draftExams),     ''),
    kpiCard('fa-circle-notch',    'blue',    'Avg Completion', exams.avgCompletionPct + '%', ''),
  ].join('')

  const topDx  = exams.topDiagnoses.slice(0, 8)
  const topCpt = exams.topCptCodes.slice(0, 8)

  destroyChart('dx-bar')
  charts['dx-bar'] = new Chart($('#chart-dx-bar'), {
    type: 'bar',
    data: {
      labels: topDx.map(d => d.code),
      datasets: [{ label: 'Count', data: topDx.map(d => d.count), backgroundColor: 'rgba(99,102,241,.5)', borderColor: COLORS.indigo, borderRadius: 5, borderWidth: 1.5 }],
    },
    options: {
      indexAxis: 'y', responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: ctx => topDx[ctx.dataIndex]?.description ?? '' } } },
      scales: { x: { grid: CHART_GRID, beginAtZero: true }, y: { grid: { display: false }, ticks: { font: { family: 'monospace', size: 11 } } } },
    },
  })

  destroyChart('cpt-bar')
  charts['cpt-bar'] = new Chart($('#chart-cpt-bar'), {
    type: 'bar',
    data: {
      labels: topCpt.map(c => c.code),
      datasets: [{ label: 'Count', data: topCpt.map(c => c.count), backgroundColor: 'rgba(14,165,233,.5)', borderColor: COLORS.sky, borderRadius: 5, borderWidth: 1.5 }],
    },
    options: {
      indexAxis: 'y', responsive: true,
      plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: ctx => topCpt[ctx.dataIndex]?.description ?? '' } } },
      scales: { x: { grid: CHART_GRID, beginAtZero: true }, y: { grid: { display: false }, ticks: { font: { family: 'monospace', size: 11 } } } },
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// PATIENTS
// ═══════════════════════════════════════════════════════════════════════════════
function renderPatients() {
  const { patients } = S.data

  $('#patient-kpis').innerHTML = [
    kpiCard('fa-users',             'teal',    'Total Patients',  fmtNum(patients.totalPatients),  ''),
    kpiCard('fa-user-plus',         'emerald', 'New (30d)',        fmtNum(patients.newPatients30d), ''),
    kpiCard('fa-heart-pulse',       'blue',    'Active (90d)',     fmtNum(patients.activePatients), ''),
    kpiCard('fa-cake-candles',      'amber',   'Avg Age',          patients.avgAge + ' yrs',        ''),
  ].join('')

  const insur = patients.insuranceBreakdown.slice(0, 8)
  destroyChart('insur-donut')
  charts['insur-donut'] = new Chart($('#chart-insur-donut'), {
    type: 'doughnut',
    data: {
      labels: insur.map(i => i.payer),
      datasets: [{ data: insur.map(i => i.count), backgroundColor: PALETTE.slice(0, insur.length), borderWidth: 2, borderColor: '#0f172a' }],
    },
    options: { responsive: true, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } } },
  })

  $('#insur-tbody').innerHTML = insur.map((p, i) => `
    <tr>
      <td><span class="tooltip-dot" style="background:${PALETTE[i]}"></span>${esc(p.payer)}</td>
      <td class="text-right font-semibold text-white">${fmtNum(p.count)}</td>
      <td class="text-right text-slate-400">${p.percentage}%</td>
    </tr>
  `).join('')
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT WIRING
// ═══════════════════════════════════════════════════════════════════════════════
function init() {
  // Sidebar nav
  $$('[data-section]').forEach(el => {
    el.addEventListener('click', () => showSection(el.dataset.section))
  })

  // Range picker
  $$('[data-range]').forEach(btn => {
    btn.addEventListener('click', () => {
      S.range = btn.dataset.range
      $$('[data-range]').forEach(b => b.classList.toggle('active', b.dataset.range === S.range))
      loadData()
    })
  })

  // Refresh
  $('#btn-refresh').addEventListener('click', () => {
    // Reset seed flag so billing/scheduling re-seeds
    loadData()
  })

  // Load data
  loadData()
}

document.addEventListener('DOMContentLoaded', init)
