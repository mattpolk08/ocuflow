// Phase 10A — Analytics & BI Frontend
'use strict';

let dashData = null;
let charts = {};

// ── Auth ─────────────────────────────────────────────────────────────────────
function token()  { return sessionStorage.getItem('accessToken'); }
function logout() { sessionStorage.clear(); location.href = '/login'; }

async function api(path) {
  const r = await fetch(path, { headers: { Authorization: `Bearer ${token()}` } });
  if (r.status === 401) { logout(); return null; }
  const j = await r.json();
  return j.success ? j.data : null;
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const u = JSON.parse(sessionStorage.getItem('user') || '{}');
  if (!token()) { location.href = '/login'; return; }
  document.getElementById('nav-user').textContent = u.displayName || u.email || '';
  document.getElementById('nav-period').textContent = 'March 2026';
  refreshAll();
});

async function refreshAll() {
  const icon = document.getElementById('refresh-icon');
  icon.classList.add('fa-spin');
  document.getElementById('loading').classList.remove('hidden');
  document.getElementById('dash').classList.add('hidden');

  dashData = await api('/api/analytics/dashboard');
  if (!dashData) {
    icon.classList.remove('fa-spin');
    document.getElementById('loading').innerHTML =
      '<p class="text-red-400"><i class="fas fa-exclamation-triangle mr-2"></i>Failed to load — ensure you are logged in as ADMIN or BILLING role.</p>';
    return;
  }

  renderKpiRow();
  renderOverview();
  renderPayers();
  renderProviders();
  renderPopulation();
  renderRecall();
  renderForecast();

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('dash').classList.remove('hidden');
  icon.classList.remove('fa-spin');
}

// ── Tab switching ─────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.classList.add('bg-slate-800','text-slate-400'); });
  document.getElementById(`tab-${name}`).classList.remove('hidden');
  btn.classList.add('active');
  btn.classList.remove('bg-slate-800','text-slate-400');
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt$ = v => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
const fmtPct = v => Number(v).toFixed(1) + '%';
const fmtNum = v => Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
const deltaClass = d => d.direction === 'up' ? 'kpi-up' : d.direction === 'down' ? 'kpi-down' : 'kpi-flat';
const deltaArrow = d => d.direction === 'up' ? '▲' : d.direction === 'down' ? '▼' : '—';

function buildDelta(cur, pri) {
  const diff = cur - pri;
  const pct  = pri ? (diff / pri) * 100 : 0;
  return { value: diff, pct: Math.round(pct * 10) / 10, direction: diff > 0.01 ? 'up' : diff < -0.01 ? 'down' : 'flat' };
}

// ── KPI Row ───────────────────────────────────────────────────────────────────
function renderKpiRow() {
  const cur = dashData.currentKpi;
  const pri = dashData.priorKpi;

  const kpis = [
    { label: 'Net Revenue',      val: fmt$(cur.netRevenue),        delta: buildDelta(cur.netRevenue,          pri.netRevenue), icon: 'fa-dollar-sign', color: 'text-green-400' },
    { label: 'Total Visits',     val: fmtNum(cur.totalVisits),     delta: buildDelta(cur.totalVisits,         pri.totalVisits), icon: 'fa-calendar-check', color: 'text-blue-400' },
    { label: 'New Patients',     val: fmtNum(cur.newPatients),     delta: buildDelta(cur.newPatients,         pri.newPatients), icon: 'fa-user-plus', color: 'text-cyan-400' },
    { label: 'Collection Rate',  val: fmtPct(cur.collectionRate),  delta: buildDelta(cur.collectionRate,      pri.collectionRate), icon: 'fa-percent', color: 'text-emerald-400' },
    { label: 'Denial Rate',      val: fmtPct(cur.denialRate),      delta: buildDelta(-cur.denialRate,         -pri.denialRate), icon: 'fa-ban', color: 'text-orange-400' },
    { label: 'NPS Score',        val: cur.npsScore,                delta: buildDelta(cur.npsScore,            pri.npsScore), icon: 'fa-star', color: 'text-yellow-400' },
  ];

  document.getElementById('kpi-row').innerHTML = kpis.map(k => `
    <div class="card p-4">
      <div class="flex items-center justify-between mb-2">
        <i class="fas ${k.icon} ${k.color} text-lg"></i>
        <span class="text-xs ${deltaClass(k.delta)} font-medium">${deltaArrow(k.delta)} ${Math.abs(k.delta.pct)}%</span>
      </div>
      <div class="text-xl font-bold text-white">${k.val}</div>
      <div class="text-xs text-slate-400 mt-1">${k.label}</div>
      <div class="text-xs ${deltaClass(k.delta)} mt-0.5">vs prior month</div>
    </div>
  `).join('');
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function renderOverview() {
  // Revenue trend chart using KPI data
  destroyChart('revChart');
  const rc = document.getElementById('revChart').getContext('2d');
  charts.revChart = new Chart(rc, {
    type: 'bar',
    data: {
      labels: ['Jan 2026', 'Feb 2026', 'Mar 2026'],
      datasets: [
        { label: 'Gross Revenue', data: [265300, 271800, 284500], backgroundColor: '#1d4ed8aa', borderRadius: 6 },
        { label: 'Net Collected', data: [228100, 234200, 247650], backgroundColor: '#10b981aa', borderRadius: 6 },
      ]
    },
    options: {
      responsive: true, plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 12 } } },
      scales: {
        x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', callback: v => '$' + (v/1000).toFixed(0) + 'k' } }
      }
    }
  });

  destroyChart('visitChart');
  const vc = document.getElementById('visitChart').getContext('2d');
  charts.visitChart = new Chart(vc, {
    type: 'line',
    data: {
      labels: ['Jan 2026', 'Feb 2026', 'Mar 2026'],
      datasets: [
        { label: 'Total Visits', data: [823, 851, 892], borderColor: '#3b82f6', backgroundColor: '#3b82f620', fill: true, tension: 0.4, pointBackgroundColor: '#3b82f6' },
        { label: 'New Patients', data: [109, 118, 134], borderColor: '#06b6d4', backgroundColor: '#06b6d420', fill: true, tension: 0.4, pointBackgroundColor: '#06b6d4' },
      ]
    },
    options: {
      responsive: true, plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 12 } } },
      scales: {
        x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } }
      }
    }
  });

  // AR summary
  const cur = dashData.currentKpi;
  document.getElementById('ar-summary').innerHTML = `
    <div class="flex justify-between text-xs"><span class="text-slate-400">Outstanding AR</span><span class="text-white font-semibold">${fmt$(cur.outstandingAR)}</span></div>
    <div class="flex justify-between text-xs"><span class="text-slate-400">AR > 90 Days</span><span class="text-red-400 font-semibold">${fmt$(cur.arOver90)}</span></div>
    <div class="flex justify-between text-xs"><span class="text-slate-400">Avg Days to Pay</span><span class="text-white">${cur.avgDaysToPayment} days</span></div>
    <div class="flex justify-between text-xs"><span class="text-slate-400">1st Pass Rate</span><span class="text-emerald-400">${fmtPct(cur.firstPassRate)}</span></div>
    <div class="flex justify-between text-xs"><span class="text-slate-400">Total Claims</span><span class="text-white">${fmtNum(cur.totalClaims)}</span></div>
  `;

  document.getElementById('quality-metrics').innerHTML = `
    <div class="flex justify-between text-xs"><span class="text-slate-400">No-Show Rate</span><span class="${cur.noShowRate > 10 ? 'text-red-400' : 'text-emerald-400'}">${fmtPct(cur.noShowRate)}</span></div>
    <div class="flex justify-between text-xs"><span class="text-slate-400">Cancellation Rate</span><span class="text-white">${fmtPct(cur.cancellationRate)}</span></div>
    <div class="flex justify-between text-xs"><span class="text-slate-400">Avg Wait (days)</span><span class="text-white">${cur.avgWaitTimeDays}</span></div>
    <div class="flex justify-between text-xs"><span class="text-slate-400">Care Gaps Open</span><span class="text-orange-400">${cur.careGapsOpen}</span></div>
    <div class="flex justify-between text-xs"><span class="text-slate-400">Gaps Closed (mo.)</span><span class="text-emerald-400">${cur.careGapsClosedThisPeriod}</span></div>
    <div class="flex justify-between text-xs"><span class="text-slate-400">Recall Compliance</span><span class="${cur.recallComplianceRate > 70 ? 'text-emerald-400' : 'text-yellow-400'}">${fmtPct(cur.recallComplianceRate)}</span></div>
  `;

  document.getElementById('patient-exp').innerHTML = `
    <div class="flex justify-between items-center text-xs">
      <span class="text-slate-400">Avg Satisfaction</span>
      <span class="text-yellow-400 font-semibold text-sm">${cur.avgSatisfactionScore} / 5.0 ⭐</span>
    </div>
    <div class="flex justify-between text-xs"><span class="text-slate-400">NPS Score</span>
      <span class="${cur.npsScore >= 70 ? 'text-emerald-400' : cur.npsScore >= 50 ? 'text-yellow-400' : 'text-red-400'} font-semibold">${cur.npsScore}</span>
    </div>
    <div class="text-xs text-slate-500 mt-2">
      <div class="w-full bg-slate-800 rounded-full h-2 mt-1">
        <div class="h-2 rounded-full bg-emerald-500" style="width:${Math.min(100, (cur.npsScore + 100) / 2)}%"></div>
      </div>
    </div>
  `;
}

// ── Payer Contracts Tab ───────────────────────────────────────────────────────
function renderPayers() {
  const payers = dashData.topPayers;
  const statusBadge = s => {
    const m = { ACTIVE:'badge-active', EXPIRING_SOON:'badge-expiring', EXPIRED:'badge-expired', RENEGOTIATING:'badge-renegotiating' };
    const labels = { ACTIVE:'Active', EXPIRING_SOON:'Expiring Soon', EXPIRED:'Expired', RENEGOTIATING:'Renegotiating' };
    return `<span class="px-2 py-0.5 rounded-full text-xs font-medium ${m[s]||''}">${labels[s]||s}</span>`;
  };

  document.getElementById('payer-table-body').innerHTML = payers.map(p => {
    const varCls = p.variantPct < -10 ? 'text-red-400' : p.variantPct < -5 ? 'text-yellow-400' : 'text-emerald-400';
    const denCls = p.denialRate > 10 ? 'text-red-400' : p.denialRate > 7 ? 'text-yellow-400' : 'text-emerald-400';
    return `<tr>
      <td class="px-4 py-3 font-medium">${p.payerName}</td>
      <td class="px-4 py-3 text-slate-400">${p.planType}</td>
      <td class="px-4 py-3 text-right">${fmtNum(p.volume)}</td>
      <td class="px-4 py-3 text-right">${fmt$(p.allowableAmount)}</td>
      <td class="px-4 py-3 text-right">${fmt$(p.actualCollected)}</td>
      <td class="px-4 py-3 text-right ${varCls}">${p.variantPct.toFixed(1)}%</td>
      <td class="px-4 py-3 text-right ${denCls}">${fmtPct(p.denialRate)}</td>
      <td class="px-4 py-3 text-right">${p.avgDaysToPayment}</td>
      <td class="px-4 py-3 text-slate-400">${p.contractExpiry.slice(0,10)}</td>
      <td class="px-4 py-3">${statusBadge(p.status)}</td>
    </tr>`;
  }).join('');

  destroyChart('payerChart');
  const pc = document.getElementById('payerChart').getContext('2d');
  charts.payerChart = new Chart(pc, {
    type: 'bar',
    data: {
      labels: payers.map(p => p.payerName),
      datasets: [
        { label: 'Allowable $/visit', data: payers.map(p => p.allowableAmount), backgroundColor: '#1d4ed8aa', borderRadius: 4 },
        { label: 'Collected $/visit', data: payers.map(p => p.actualCollected), backgroundColor: '#10b981aa', borderRadius: 4 },
      ]
    },
    options: {
      responsive: true, plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 12 } } },
      scales: {
        x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', callback: v => '$' + v } }
      }
    }
  });
}

// ── Provider Productivity Tab ─────────────────────────────────────────────────
function renderProviders() {
  const providers = dashData.providerLeaderboard;

  document.getElementById('provider-rvu').innerHTML = providers.map(p => {
    const pct = Math.min(100, Math.round(p.rvuProduced / Math.max(p.targetRvu, 1) * 100));
    const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 90 ? 'bg-blue-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-red-500';
    const rvuSign  = p.rvuVariancePct >= 0 ? `+${p.rvuVariancePct.toFixed(1)}%` : `${p.rvuVariancePct.toFixed(1)}%`;
    const rvuCls   = p.rvuVariancePct >= 0 ? 'text-emerald-400' : 'text-red-400';
    return `
      <div>
        <div class="flex justify-between text-xs mb-1">
          <span class="font-medium text-white">${p.providerName}</span>
          <span class="${rvuCls} font-medium">${fmtNum(p.rvuProduced)} RVU (${rvuSign} vs target)</span>
        </div>
        <div class="w-full bg-slate-800 rounded-full h-2">
          <div class="bar-fill ${barColor}" style="width:${pct}%"></div>
        </div>
        <div class="flex justify-between text-xs text-slate-500 mt-1">
          <span>Target: ${fmtNum(p.targetRvu)} RVU</span>
          <span>${pct}% of target</span>
        </div>
      </div>`;
  }).join('');

  document.getElementById('provider-table-body').innerHTML = providers.map(p => {
    const utilizationCls = p.utilizationPct >= 90 ? 'text-emerald-400' : p.utilizationPct >= 80 ? 'text-yellow-400' : 'text-red-400';
    const denCls = p.denialRate > 8 ? 'text-red-400' : p.denialRate > 6 ? 'text-yellow-400' : 'text-emerald-400';
    const stars = '★'.repeat(Math.round(p.satisfactionScore)) + '☆'.repeat(5 - Math.round(p.satisfactionScore));
    return `<tr>
      <td class="px-4 py-3 font-medium">${p.providerName}</td>
      <td class="px-4 py-3 text-right">${fmtNum(p.totalVisits)}</td>
      <td class="px-4 py-3 text-right ${utilizationCls}">${fmtPct(p.utilizationPct)}</td>
      <td class="px-4 py-3 text-right">${fmt$(p.avgRevenuePerVisit)}</td>
      <td class="px-4 py-3 text-right ${denCls}">${fmtPct(p.denialRate)}</td>
      <td class="px-4 py-3 text-right text-yellow-400 text-xs">${stars} ${p.satisfactionScore.toFixed(1)}</td>
    </tr>`;
  }).join('');
}

// ── Population Health Tab ─────────────────────────────────────────────────────
function renderPopulation() {
  const trends = dashData.populationTrends;

  destroyChart('popChart');
  const pc = document.getElementById('popChart').getContext('2d');
  charts.popChart = new Chart(pc, {
    type: 'doughnut',
    data: {
      labels: trends.map(t => t.condition),
      datasets: [{ data: trends.map(t => t.activePatients), backgroundColor: ['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'], hoverOffset: 8 }]
    },
    options: { responsive: true, plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 12 } } } }
  });

  destroyChart('popRevChart');
  const pr = document.getElementById('popRevChart').getContext('2d');
  charts.popRevChart = new Chart(pr, {
    type: 'bar',
    data: {
      labels: trends.map(t => t.condition.length > 18 ? t.condition.slice(0,18)+'…' : t.condition),
      datasets: [{ label: 'Revenue Potential', data: trends.map(t => t.revenuePotential), backgroundColor: '#10b98188', borderRadius: 4 }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', callback: v => '$' + (v/1000).toFixed(0) + 'k' } },
        y: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } }
      }
    }
  });

  document.getElementById('pop-table-body').innerHTML = trends.map(t => {
    const ctrlCls = t.controlledPct > 70 ? 'text-emerald-400' : t.controlledPct > 55 ? 'text-yellow-400' : 'text-red-400';
    const adhrCls = t.treatmentAdherence > 80 ? 'text-emerald-400' : t.treatmentAdherence > 65 ? 'text-yellow-400' : 'text-red-400';
    return `<tr>
      <td class="px-4 py-3 font-medium">${t.condition}</td>
      <td class="px-4 py-3 text-right text-white">${fmtNum(t.activePatients)}</td>
      <td class="px-4 py-3 text-right text-cyan-400">+${t.newDiagnoses}</td>
      <td class="px-4 py-3 text-right ${ctrlCls}">${fmtPct(t.controlledPct)}</td>
      <td class="px-4 py-3 text-right ${adhrCls}">${fmtPct(t.treatmentAdherence)}</td>
      <td class="px-4 py-3 text-right text-orange-400">${t.careGapCount}</td>
      <td class="px-4 py-3 text-right text-green-400">${fmt$(t.revenuePotential)}</td>
    </tr>`;
  }).join('');
}

// ── Recall Tab ────────────────────────────────────────────────────────────────
function renderRecall() {
  const metrics = dashData.recallMetrics;
  const cur = metrics[0] || {};

  document.getElementById('recall-kpis').innerHTML = `
    <div class="card p-5 text-center">
      <div class="text-3xl font-bold text-emerald-400">${fmtPct(cur.complianceRate||0)}</div>
      <div class="text-xs text-slate-400 mt-1">Recall Compliance Rate</div>
      <div class="text-xs text-slate-500 mt-1">${fmtNum(cur.scheduledCount||0)} / ${fmtNum(cur.totalPatientsDue||0)} scheduled</div>
    </div>
    <div class="card p-5 text-center">
      <div class="text-3xl font-bold text-blue-400">${fmtPct(cur.smsResponseRate||0)}</div>
      <div class="text-xs text-slate-400 mt-1">SMS Response Rate</div>
      <div class="text-xs text-slate-500 mt-1">Email: ${fmtPct(cur.emailResponseRate||0)}</div>
    </div>
    <div class="card p-5 text-center">
      <div class="text-3xl font-bold text-green-400">${fmt$(cur.revenueRecovered||0)}</div>
      <div class="text-xs text-slate-400 mt-1">Revenue Recovered (mo.)</div>
      <div class="text-xs text-slate-500 mt-1">Avg ${cur.avgDaysToSchedule||0} days to schedule</div>
    </div>
  `;

  document.getElementById('recall-table-body').innerHTML = metrics.map(r => {
    const compCls = r.complianceRate > 70 ? 'text-emerald-400' : r.complianceRate > 60 ? 'text-yellow-400' : 'text-red-400';
    return `<tr>
      <td class="px-4 py-3 font-medium">${r.period}</td>
      <td class="px-4 py-3 text-right">${fmtNum(r.totalPatientsDue)}</td>
      <td class="px-4 py-3 text-right">${fmtNum(r.contactedCount)}</td>
      <td class="px-4 py-3 text-right">${fmtNum(r.scheduledCount)}</td>
      <td class="px-4 py-3 text-right">${fmtNum(r.completedCount)}</td>
      <td class="px-4 py-3 text-right ${compCls}">${fmtPct(r.complianceRate)}</td>
      <td class="px-4 py-3 text-right">${fmtPct(r.smsResponseRate)}</td>
      <td class="px-4 py-3 text-right text-green-400">${fmt$(r.revenueRecovered)}</td>
    </tr>`;
  }).join('');
}

// ── Forecast Tab ──────────────────────────────────────────────────────────────
function renderForecast() {
  const fc = dashData.forecast;
  if (!fc) return;

  destroyChart('forecastChart');
  const ctx = document.getElementById('forecastChart').getContext('2d');
  charts.forecastChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: fc.months.map(m => m.period),
      datasets: [
        { label: 'Projected Revenue', data: fc.months.map(m => m.projectedRevenue), borderColor: '#3b82f6', backgroundColor: '#3b82f630', fill: true, tension: 0.4, pointBackgroundColor: '#3b82f6' },
        { label: 'Upper Bound', data: fc.months.map(m => m.upperBound), borderColor: '#10b981', borderDash: [4,4], backgroundColor: 'transparent', tension: 0.4 },
        { label: 'Lower Bound', data: fc.months.map(m => m.lowerBound), borderColor: '#f59e0b', borderDash: [4,4], backgroundColor: 'transparent', tension: 0.4 },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { labels: { color: '#94a3b8', boxWidth: 12 } } },
      scales: {
        x: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8' } },
        y: { grid: { color: '#1e293b' }, ticks: { color: '#94a3b8', callback: v => '$' + (v/1000).toFixed(0) + 'k' } }
      }
    }
  });

  document.getElementById('forecast-meta').innerHTML = `
    <div class="flex justify-between"><span class="text-slate-500">Model</span><span>${fc.model}</span></div>
    <div class="flex justify-between"><span class="text-slate-500">Confidence</span><span class="text-emerald-400">${fc.confidence}%</span></div>
    <div class="flex justify-between"><span class="text-slate-500">Period</span><span>${fc.forecastPeriod}</span></div>
    <div class="flex justify-between"><span class="text-slate-500">Generated</span><span class="text-xs text-slate-400">${new Date(fc.generatedAt).toLocaleDateString()}</span></div>
  `;

  document.getElementById('forecast-risks').innerHTML = fc.risks.map(r =>
    `<li class="flex gap-2"><i class="fas fa-exclamation-triangle text-red-400 mt-0.5 flex-shrink-0"></i><span>${r}</span></li>`
  ).join('');

  document.getElementById('forecast-opps').innerHTML = fc.opportunities.map(o =>
    `<li class="flex gap-2"><i class="fas fa-lightbulb text-green-400 mt-0.5 flex-shrink-0"></i><span>${o}</span></li>`
  ).join('');

  document.getElementById('forecast-table-body').innerHTML = fc.months.map(m => {
    const sf = m.seasonalFactor;
    const sfCls = sf > 1 ? 'text-emerald-400' : sf < 1 ? 'text-red-400' : 'text-slate-400';
    return `<tr>
      <td class="px-4 py-3 font-medium">${m.period}</td>
      <td class="px-4 py-3 text-right text-white font-semibold">${fmt$(m.projectedRevenue)}</td>
      <td class="px-4 py-3 text-right text-slate-400">${fmt$(m.lowerBound)}</td>
      <td class="px-4 py-3 text-right text-slate-400">${fmt$(m.upperBound)}</td>
      <td class="px-4 py-3 text-right">${fmtNum(m.projectedVisits)}</td>
      <td class="px-4 py-3 text-right ${sfCls}">${m.seasonalFactor.toFixed(2)}x</td>
      <td class="px-4 py-3 text-slate-400">${m.notes}</td>
    </tr>`;
  }).join('');
}
