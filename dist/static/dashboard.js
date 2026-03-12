// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Command Center Dashboard Controller
// ─────────────────────────────────────────────────────────────────────────────

// ── State ─────────────────────────────────────────────────────────────────────
const DS = {
  schedule: [],
  kpis: null,
  currentView: 'flow',
  filterProvider: 'all',
  selectedAppt: null,
  donutChart: null,
  refreshInterval: null,
}

// ── Status Config (single source of truth) ────────────────────────────────────
const STATUS_CONFIG = {
  SCHEDULED:       { label: 'Scheduled',         color: 'text-slate-400',  bg: 'bg-slate-700/50',   border: 'border-slate-600',   dot: 'bg-slate-500',   icon: 'fa-clock'              },
  CONFIRMED:       { label: 'Confirmed',          color: 'text-sky-400',    bg: 'bg-sky-900/30',     border: 'border-sky-800',     dot: 'bg-sky-400',     icon: 'fa-circle-check'       },
  CHECKED_IN:      { label: 'Checked In',         color: 'text-amber-400',  bg: 'bg-amber-900/30',   border: 'border-amber-800',   dot: 'bg-amber-400',   icon: 'fa-door-open'          },
  IN_PRETESTING:   { label: 'Pre-Testing',        color: 'text-violet-400', bg: 'bg-violet-900/30',  border: 'border-violet-800',  dot: 'bg-violet-400',  icon: 'fa-stethoscope'        },
  READY_FOR_DOCTOR:{ label: 'Ready for Doctor',   color: 'text-brand-400',  bg: 'bg-brand-900/30',   border: 'border-brand-800',   dot: 'bg-brand-400',   icon: 'fa-user-doctor'        },
  WITH_DOCTOR:     { label: 'With Doctor',        color: 'text-emerald-400',bg: 'bg-emerald-900/30', border: 'border-emerald-800', dot: 'bg-emerald-400', icon: 'fa-eye'                },
  CHECKOUT:        { label: 'Checkout',           color: 'text-rose-400',   bg: 'bg-rose-900/30',    border: 'border-rose-800',    dot: 'bg-rose-400',    icon: 'fa-receipt'            },
  COMPLETED:       { label: 'Completed',          color: 'text-slate-500',  bg: 'bg-slate-800/40',   border: 'border-slate-700',   dot: 'bg-slate-600',   icon: 'fa-check-circle'       },
  NO_SHOW:         { label: 'No Show',            color: 'text-rose-600',   bg: 'bg-rose-900/20',    border: 'border-rose-900',    dot: 'bg-rose-700',    icon: 'fa-circle-xmark'       },
  CANCELLED:       { label: 'Cancelled',          color: 'text-slate-600',  bg: 'bg-slate-800/30',   border: 'border-slate-700',   dot: 'bg-slate-700',   icon: 'fa-ban'                },
}

// Flow board columns in patient journey order
const FLOW_COLUMNS = [
  { status: 'SCHEDULED',        label: 'Scheduled',       icon: 'fa-clock',          accent: 'slate'   },
  { status: 'CHECKED_IN',       label: 'Checked In',      icon: 'fa-door-open',      accent: 'amber'   },
  { status: 'IN_PRETESTING',    label: 'Pre-Testing',     icon: 'fa-stethoscope',    accent: 'violet'  },
  { status: 'READY_FOR_DOCTOR', label: 'Ready for MD',    icon: 'fa-user-doctor',    accent: 'blue'    },
  { status: 'WITH_DOCTOR',      label: 'With Doctor',     icon: 'fa-eye',            accent: 'emerald' },
  { status: 'CHECKOUT',         label: 'Checkout',        icon: 'fa-receipt',        accent: 'rose'    },
  { status: 'COMPLETED',        label: 'Completed',       icon: 'fa-check-circle',   accent: 'slate'   },
]

// Next status flow map
const NEXT_STATUS = {
  SCHEDULED:        'CHECKED_IN',
  CHECKED_IN:       'IN_PRETESTING',
  IN_PRETESTING:    'READY_FOR_DOCTOR',
  READY_FOR_DOCTOR: 'WITH_DOCTOR',
  WITH_DOCTOR:      'CHECKOUT',
  CHECKOUT:         'COMPLETED',
}

const NEXT_ACTION_LABEL = {
  SCHEDULED:        '→ Check In',
  CHECKED_IN:       '→ Send to Pre-Test',
  IN_PRETESTING:    '→ Ready for Doctor',
  READY_FOR_DOCTOR: '→ Doctor In Room',
  WITH_DOCTOR:      '→ Send to Checkout',
  CHECKOUT:         '→ Complete Visit',
}

// Accent color maps for Tailwind dynamic classes
const ACCENT = {
  slate:   { bg: 'bg-slate-700/30',   border: 'border-slate-600/50',   text: 'text-slate-400',   dot: 'bg-slate-500'   },
  amber:   { bg: 'bg-amber-900/20',   border: 'border-amber-700/40',   text: 'text-amber-400',   dot: 'bg-amber-400'   },
  violet:  { bg: 'bg-violet-900/20',  border: 'border-violet-700/40',  text: 'text-violet-400',  dot: 'bg-violet-400'  },
  blue:    { bg: 'bg-blue-900/20',    border: 'border-blue-700/40',    text: 'text-blue-400',    dot: 'bg-blue-400'    },
  emerald: { bg: 'bg-emerald-900/20', border: 'border-emerald-700/40', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  rose:    { bg: 'bg-rose-900/20',    border: 'border-rose-700/40',    text: 'text-rose-400',    dot: 'bg-rose-400'    },
}

// Provider color map
const PROVIDER_COLORS = {
  'dr-chen':  { from: 'from-blue-500',   to: 'to-blue-700',   ring: 'ring-blue-500/30',   text: 'text-blue-400',   bg: 'bg-blue-900/30',   border: 'border-blue-700/40'   },
  'dr-patel': { from: 'from-violet-500', to: 'to-violet-700', ring: 'ring-violet-500/30', text: 'text-violet-400', bg: 'bg-violet-900/30', border: 'border-violet-700/40' },
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  startClock()
  loadDashboard()
  setupKeyboardShortcuts()

  // Auto-refresh every 60 seconds
  DS.refreshInterval = setInterval(loadDashboard, 60000)
})

// ── Clock ─────────────────────────────────────────────────────────────────────
function startClock() {
  function tick() {
    const now = new Date()
    const h = String(now.getHours()).padStart(2, '0')
    const m = String(now.getMinutes()).padStart(2, '0')
    document.getElementById('live-clock').textContent = `${h}:${m}`
  }
  tick()
  setInterval(tick, 10000)
}

// ── Load Dashboard Data ───────────────────────────────────────────────────────
async function loadDashboard() {
  const refreshBtn = document.getElementById('refresh-btn')
  refreshBtn.querySelector('i').classList.add('fa-spin')

  try {
    const data = await oFetch('/api/dashboard/today')

    if (data.success) {
      DS.schedule = data.data.schedule
      DS.kpis     = data.data.kpis

      renderKpiBar()
      renderProviderCards()
      renderRoomGrid()
      renderAlerts()
      renderActivityLog()
      renderUpNext()
      renderCurrentView()
      renderDonutChart()
    }
  } catch (err) {
    console.error('Dashboard load error:', err)
    showToast('Could not refresh data', 'error')
  } finally {
    refreshBtn.querySelector('i').classList.remove('fa-spin')
  }
}

function refreshDashboard() { loadDashboard() }

// ── KPI Bar ───────────────────────────────────────────────────────────────────
function renderKpiBar() {
  const k = DS.kpis
  document.getElementById('kpi-date').textContent = k.date

  const kpis = [
    { label: 'Scheduled',   value: k.totalScheduled, icon: 'fa-calendar',      color: 'text-slate-300',  bg: 'bg-slate-700/50'   },
    { label: 'In Office',   value: k.inOffice,        icon: 'fa-person-walking',color: 'text-amber-400',  bg: 'bg-amber-900/20'   },
    { label: 'With Doctor', value: k.withDoctorCount, icon: 'fa-eye',           color: 'text-emerald-400',bg: 'bg-emerald-900/20' },
    { label: 'Completed',   value: k.completed,       icon: 'fa-check',         color: 'text-brand-400',  bg: 'bg-brand-900/20'   },
    { label: 'Avg Wait',    value: `${k.avgWaitTime}m`,icon: 'fa-hourglass-half',color: k.avgWaitTime > 20 ? 'text-rose-400' : 'text-emerald-400', bg: k.avgWaitTime > 20 ? 'bg-rose-900/20' : 'bg-emerald-900/20' },
    { label: 'No Shows',    value: k.noShows,         icon: 'fa-circle-xmark',  color: k.noShows > 0 ? 'text-rose-400' : 'text-slate-500', bg: 'bg-slate-700/50' },
    { label: 'Needs Intake',value: k.intakeIncomplete,icon: 'fa-mobile-screen', color: k.intakeIncomplete > 0 ? 'text-amber-400' : 'text-slate-500', bg: k.intakeIncomplete > 0 ? 'bg-amber-900/20' : 'bg-slate-700/50' },
  ]

  document.getElementById('kpi-bar').innerHTML = kpis.map(kpi => `
    <div class="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg ${kpi.bg} border border-slate-700/40 cursor-default">
      <i class="fas ${kpi.icon} ${kpi.color} text-xs w-3"></i>
      <div>
        <p class="text-xs font-bold ${kpi.color} leading-none">${kpi.value}</p>
        <p class="text-xs text-slate-600 leading-none mt-0.5">${kpi.label}</p>
      </div>
    </div>
  `).join('')

  // Revenue bar
  const pct = Math.min(100, Math.round((k.collectedToday / k.dailyGoalRevenue) * 100))
  document.getElementById('kpi-collected').textContent = `$${k.collectedToday.toLocaleString()}`
  document.getElementById('kpi-goal').textContent = `of $${k.dailyGoalRevenue.toLocaleString()} goal`
  document.getElementById('revenue-progress').style.width = `${pct}%`
}

// ── Provider Cards ────────────────────────────────────────────────────────────
function renderProviderCards() {
  const container = document.getElementById('provider-cards')
  container.innerHTML = DS.kpis.providers.map(p => {
    const colors = PROVIDER_COLORS[p.id] || PROVIDER_COLORS['dr-chen']
    const isActive = p.status === 'WITH_PATIENT'
    return `
    <div class="bg-slate-800/60 rounded-xl border ${colors.border} p-3 cursor-pointer hover:bg-slate-800 transition-colors" onclick="filterByProvider('${p.id}')">
      <div class="flex items-start gap-2.5">
        <div class="relative flex-shrink-0">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br ${colors.from} ${colors.to} flex items-center justify-center text-white text-xs font-bold ring-2 ${colors.ring}">
            ${p.name.split(' ').filter((_,i)=>i>0).map(n=>n[0]).join('').slice(0,2)}
          </div>
          ${isActive ? `<span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900"></span>` : ''}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-xs font-semibold text-white truncate">${p.name}, ${p.credentials}</p>
          <p class="text-xs ${colors.text} font-medium">${isActive ? p.currentPatient : 'Available'}</p>
        </div>
      </div>
      <div class="mt-2.5 flex items-center justify-between">
        <div class="flex items-center gap-1">
          ${isActive ? `<span class="status-pill ${ACCENT['emerald'].bg} ${ACCENT['emerald'].text} border ${ACCENT['emerald'].border}"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>In Room</span>` : `<span class="status-pill bg-slate-700/50 text-slate-400">Available</span>`}
        </div>
        <div class="text-right">
          <p class="text-xs text-slate-500">${p.completedToday}/${p.scheduledToday}</p>
        </div>
      </div>
      ${isActive ? `<p class="text-xs text-slate-500 mt-1.5 truncate">Next: ${p.nextAppt}</p>` : ''}
    </div>
  `}).join('')
}

// ── Room Grid ─────────────────────────────────────────────────────────────────
function renderRoomGrid() {
  const container = document.getElementById('room-grid')
  container.innerHTML = DS.kpis.rooms.map(room => {
    const occupied = room.status === 'OCCUPIED'
    return `
    <div class="flex items-center gap-2 px-2.5 py-2 rounded-lg ${occupied ? 'bg-emerald-900/20 border border-emerald-800/40' : 'bg-slate-800/40 border border-slate-700/40'}">
      <span class="w-2 h-2 rounded-full flex-shrink-0 ${occupied ? 'bg-emerald-400' : 'bg-slate-600'}"></span>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-medium ${occupied ? 'text-white' : 'text-slate-400'} truncate">${room.name}</p>
        ${occupied && room.patient ? `<p class="text-xs text-slate-500 truncate">${room.patient}</p>` : ''}
      </div>
      <span class="text-xs ${occupied ? 'text-emerald-400 font-semibold' : 'text-slate-600'} flex-shrink-0">${occupied ? 'In Use' : 'Free'}</span>
    </div>
  `}).join('')
}

// ── Flow Board (Kanban) ───────────────────────────────────────────────────────
function renderFlowBoard() {
  const board = document.getElementById('kanban-board')
  const filtered = DS.schedule.filter(a =>
    DS.filterProvider === 'all' || a.providerId === DS.filterProvider
  )

  board.innerHTML = FLOW_COLUMNS.map(col => {
    const cards = filtered.filter(a => a.status === col.status)
    const acc   = ACCENT[col.accent]

    return `
    <div class="kanban-col flex flex-col h-full">
      <!-- Column header -->
      <div class="flex items-center justify-between px-3 py-2 mb-2 rounded-xl ${acc.bg} border ${acc.border}">
        <div class="flex items-center gap-2">
          <i class="fas ${col.icon} ${acc.text} text-xs"></i>
          <span class="text-xs font-semibold ${acc.text}">${col.label}</span>
        </div>
        <span class="text-xs font-bold ${acc.text} bg-black/20 px-1.5 py-0.5 rounded-md">${cards.length}</span>
      </div>

      <!-- Cards -->
      <div class="flex-1 space-y-2 overflow-y-auto panel-scroll pr-0.5" style="min-height:120px;">
        ${cards.length === 0 ? `
          <div class="flex items-center justify-center h-20 border border-dashed border-slate-700/50 rounded-xl">
            <p class="text-xs text-slate-700">Empty</p>
          </div>
        ` : cards.map(appt => flowCard(appt)).join('')}
      </div>
    </div>
  `}).join('')
}

function flowCard(appt) {
  const cfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.SCHEDULED
  const initials = appt.patientName.split(' ').map(n=>n[0]).join('').slice(0,2)
  const pColors = PROVIDER_COLORS[appt.providerId] || PROVIDER_COLORS['dr-chen']
  const waitBadge = appt.waitMinutes > 0
    ? `<span class="text-xs ${appt.waitMinutes > 20 ? 'text-rose-400' : 'text-amber-400'}"><i class="fas fa-hourglass-half text-xs mr-0.5"></i>${appt.waitMinutes}m</span>`
    : ''

  return `
  <div
    class="flow-card bg-slate-800 border ${appt.urgent ? `border-red-600 urgent-flash` : 'border-slate-700/60'} rounded-xl p-3 select-none"
    onclick="openPatientModal('${appt.id}')"
    oncontextmenu="showContextMenu(event, '${appt.id}')"
    data-appt-id="${appt.id}"
    data-provider="${appt.providerId}"
  >
    <!-- Time + Provider bar -->
    <div class="flex items-center justify-between mb-2">
      <span class="text-xs font-bold text-white">${appt.time}</span>
      <div class="flex items-center gap-1.5">
        ${waitBadge}
        <span class="text-xs ${pColors.text} font-medium">${appt.providerName.split(' ')[2]}</span>
      </div>
    </div>

    <!-- Patient info -->
    <div class="flex items-center gap-2.5 mb-2.5">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-br ${pColors.from} ${pColors.to} flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        ${initials}
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-white truncate">${appt.patientName}</p>
        <p class="text-xs text-slate-400 truncate">${appt.typeLabel}</p>
      </div>
    </div>

    <!-- Chief complaint -->
    <p class="text-xs text-slate-500 truncate mb-2.5">${appt.chiefComplaint}</p>

    <!-- Badges row -->
    <div class="flex items-center gap-1 flex-wrap">
      ${appt.intakeComplete
        ? `<span class="status-pill bg-emerald-900/30 text-emerald-400 border border-emerald-800/40"><i class="fas fa-check text-xs"></i> Intake</span>`
        : `<span class="status-pill bg-amber-900/30 text-amber-400 border border-amber-800/40"><i class="fas fa-exclamation text-xs"></i> No Intake</span>`
      }
      ${appt.insuranceVerified
        ? `<span class="status-pill bg-emerald-900/20 text-emerald-500 border border-emerald-900/40"><i class="fas fa-shield-check text-xs"></i> Ins.</span>`
        : `<span class="status-pill bg-rose-900/20 text-rose-400 border border-rose-900/40"><i class="fas fa-shield-xmark text-xs"></i> Unverified</span>`
      }
      ${appt.room ? `<span class="status-pill bg-slate-700/50 text-slate-400 border border-slate-600/40"><i class="fas fa-door-open text-xs"></i> ${appt.room}</span>` : ''}
    </div>

    <!-- Quick advance button (visible on hover via group logic) -->
    ${NEXT_STATUS[appt.status] ? `
    <button
      class="mt-2 w-full text-xs font-semibold text-center py-1.5 rounded-lg bg-slate-700/60 hover:bg-brand-600/70 text-slate-300 hover:text-white transition-colors border border-slate-600/50 hover:border-brand-500/50"
      onclick="event.stopPropagation(); advanceStatus('${appt.id}', '${NEXT_STATUS[appt.status]}')"
    >
      ${NEXT_ACTION_LABEL[appt.status]} <i class="fas fa-arrow-right text-xs ml-1"></i>
    </button>
    ` : ''}
  </div>`
}

// ── Schedule List View ────────────────────────────────────────────────────────
function renderScheduleList() {
  const list = document.getElementById('schedule-list')
  const filtered = DS.schedule.filter(a =>
    DS.filterProvider === 'all' || a.providerId === DS.filterProvider
  )

  list.innerHTML = filtered.map(appt => {
    const cfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.SCHEDULED
    const pColors = PROVIDER_COLORS[appt.providerId] || PROVIDER_COLORS['dr-chen']
    const initials = appt.patientName.split(' ').map(n=>n[0]).join('').slice(0,2)

    return `
    <div
      class="flow-card flex items-center gap-3 bg-slate-800 border ${appt.urgent ? 'border-rose-700/60 urgent-flash' : 'border-slate-700/40'} rounded-xl px-4 py-3"
      onclick="openPatientModal('${appt.id}')"
      oncontextmenu="showContextMenu(event, '${appt.id}')"
    >
      <!-- Time -->
      <div class="w-14 flex-shrink-0 text-center">
        <p class="text-sm font-bold text-white">${appt.time}</p>
        <p class="text-xs text-slate-500">${appt.duration}min</p>
      </div>

      <!-- Avatar -->
      <div class="w-10 h-10 rounded-xl bg-gradient-to-br ${pColors.from} ${pColors.to} flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
        ${initials}
      </div>

      <!-- Main info -->
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-0.5">
          <p class="text-sm font-semibold text-white truncate">${appt.patientName}</p>
          ${appt.urgent ? `<span class="status-pill bg-rose-900/40 text-rose-400 border border-rose-800/40">URGENT</span>` : ''}
        </div>
        <p class="text-xs text-slate-400 truncate">${appt.typeLabel} · ${appt.chiefComplaint}</p>
        <div class="flex items-center gap-2 mt-1">
          <span class="text-xs ${pColors.text}">${appt.providerName}</span>
          ${appt.room ? `<span class="text-xs text-slate-500">· ${appt.room}</span>` : ''}
        </div>
      </div>

      <!-- Status + actions -->
      <div class="flex-shrink-0 flex flex-col items-end gap-2">
        <span class="status-pill ${cfg.bg} ${cfg.color} border ${cfg.border}">
          <span class="w-1.5 h-1.5 rounded-full ${cfg.dot}"></span>
          ${cfg.label}
        </span>
        <div class="flex items-center gap-1">
          ${!appt.intakeComplete ? `<span class="w-5 h-5 rounded bg-amber-900/40 flex items-center justify-center" title="Intake incomplete"><i class="fas fa-mobile-screen text-amber-400 text-xs"></i></span>` : ''}
          ${!appt.insuranceVerified ? `<span class="w-5 h-5 rounded bg-rose-900/40 flex items-center justify-center" title="Insurance unverified"><i class="fas fa-shield-xmark text-rose-400 text-xs"></i></span>` : ''}
          ${appt.copay > 0 ? `<span class="text-xs text-slate-500">$${appt.copay}</span>` : ''}
        </div>
      </div>
    </div>`
  }).join('')
}

// ── Timeline View ─────────────────────────────────────────────────────────────
function renderTimeline() {
  const grid = document.getElementById('timeline-grid')
  const startHour = 8
  const endHour = 13
  const HOUR_HEIGHT = 80
  const totalH = (endHour - startHour) * HOUR_HEIGHT

  // Time labels + grid lines
  let timeHtml = `<div class="relative" style="height:${totalH}px; padding-left: 52px;">`

  for (let h = startHour; h <= endHour; h++) {
    const top = (h - startHour) * HOUR_HEIGHT
    timeHtml += `
      <div class="absolute left-0 right-0 flex items-center" style="top:${top}px">
        <span class="text-xs text-slate-600 w-12 flex-shrink-0 text-right pr-2 -mt-2">${h === 12 ? '12:00' : `${h}:00`}</span>
        <div class="flex-1 border-t border-slate-800"></div>
      </div>
    `
    // 30-min line
    if (h < endHour) {
      const top30 = top + HOUR_HEIGHT / 2
      timeHtml += `
        <div class="absolute left-0 right-0 flex items-center" style="top:${top30}px">
          <span class="text-xs text-slate-800 w-12 flex-shrink-0 text-right pr-2 -mt-2">${h}:30</span>
          <div class="flex-1 border-t border-slate-800/50 border-dashed"></div>
        </div>
      `
    }
  }

  // Provider lanes
  const providers = [...new Set(DS.schedule.map(a => a.providerId))]
  const laneWidth = 200
  let x = 0

  providers.forEach(pid => {
    const pColors = PROVIDER_COLORS[pid] || PROVIDER_COLORS['dr-chen']
    const pName = DS.schedule.find(a => a.providerId === pid)?.providerName || pid
    const appts = DS.schedule.filter(a => a.providerId === pid && DS.filterProvider === 'all' || a.providerId === DS.filterProvider)

    timeHtml += `<div class="absolute top-0" style="left:${52 + x}px; width:${laneWidth - 4}px;">`

    appts.forEach(appt => {
      const [h, m] = appt.time.split(':').map(Number)
      const topPx = ((h + m/60) - startHour) * HOUR_HEIGHT
      const heightPx = (appt.duration / 60) * HOUR_HEIGHT - 2

      const cfg = STATUS_CONFIG[appt.status] || STATUS_CONFIG.SCHEDULED
      const initials = appt.patientName.split(' ').map(n=>n[0]).join('').slice(0,2)

      timeHtml += `
        <div
          class="time-slot bg-gradient-to-r ${pColors.from}/80 ${pColors.to}/80 border-l-4 border-l-blue-400 cursor-pointer hover:brightness-110 transition-all rounded-lg overflow-hidden"
          style="top:${topPx}px; height:${Math.max(heightPx, 22)}px;"
          onclick="openPatientModal('${appt.id}')"
          title="${appt.patientName} — ${appt.typeLabel}"
        >
          <p class="text-xs font-semibold text-white leading-tight truncate">${appt.patientName}</p>
          <p class="text-xs text-white/70 truncate">${appt.typeLabel}</p>
          <span class="text-xs text-white/60">${appt.time}–${appt.endTime}</span>
        </div>
      `
    })

    timeHtml += `</div>`
    x += laneWidth
  })

  // Current time indicator
  const now = new Date()
  const currentTopPx = ((now.getHours() + now.getMinutes()/60) - startHour) * HOUR_HEIGHT
  if (currentTopPx >= 0 && currentTopPx <= totalH) {
    timeHtml += `
      <div class="absolute left-10 right-0 flex items-center z-10 pointer-events-none" style="top:${currentTopPx}px">
        <div class="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0"></div>
        <div class="flex-1 border-t-2 border-rose-500"></div>
      </div>
    `
  }

  timeHtml += `</div>`

  // Provider column headers
  let headerHtml = `<div class="flex mb-3" style="padding-left:52px;">`
  providers.forEach(pid => {
    const pColors = PROVIDER_COLORS[pid] || PROVIDER_COLORS['dr-chen']
    const pName = DS.schedule.find(a => a.providerId === pid)?.providerName || pid
    headerHtml += `
      <div style="width:${laneWidth}px" class="flex items-center gap-2 px-2 py-1.5 rounded-lg ${pColors.bg} border ${pColors.border} mr-1">
        <div class="w-6 h-6 rounded-lg bg-gradient-to-br ${pColors.from} ${pColors.to} flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          ${pName.split(' ').filter((_,i)=>i>0).map(n=>n[0]).join('').slice(0,2)}
        </div>
        <span class="text-xs font-semibold ${pColors.text} truncate">${pName}</span>
      </div>
    `
  })
  headerHtml += `</div>`

  grid.innerHTML = headerHtml + timeHtml
}

// ── Advance Status ─────────────────────────────────────────────────────────────
async function advanceStatus(apptId, newStatus) {
  const appt = DS.schedule.find(a => a.id === apptId)
  if (!appt) return

  const prevStatus = appt.status
  appt.status = newStatus

  // Optimistic UI
  renderCurrentView()

  try {
    const data = await oFetch('/api/dashboard/flow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId: apptId, newStatus }),
    })
    if (!data.success) throw new Error(data.error)

    const cfg = STATUS_CONFIG[newStatus]
    addActivityEntry(appt.patientName, cfg.label)
    showToast(`${appt.patientName} → ${cfg.label}`)
  } catch (err) {
    // Rollback
    appt.status = prevStatus
    renderCurrentView()
    showToast('Could not update status', 'error')
  }
}

// ── Patient Modal ─────────────────────────────────────────────────────────────
function openPatientModal(apptId) {
  const appt = DS.schedule.find(a => a.id === apptId)
  if (!appt) return
  DS.selectedAppt = appt

  const modal     = document.getElementById('patient-modal')
  const cfg       = STATUS_CONFIG[appt.status] || STATUS_CONFIG.SCHEDULED
  const pColors   = PROVIDER_COLORS[appt.providerId] || PROVIDER_COLORS['dr-chen']
  const initials  = appt.patientName.split(' ').map(n=>n[0]).join('').slice(0,2)

  // Avatar
  const avatar = document.getElementById('modal-avatar')
  avatar.className = `w-12 h-12 rounded-xl bg-gradient-to-br ${pColors.from} ${pColors.to} flex items-center justify-center text-white font-bold text-lg flex-shrink-0`
  avatar.textContent = initials

  document.getElementById('modal-patient-name').textContent = appt.patientName
  document.getElementById('modal-patient-meta').textContent = `DOB: ${appt.dob} · Age ${appt.age} · ${appt.patientId}`

  // Body
  document.getElementById('modal-body').innerHTML = `
    <!-- Status -->
    <div class="flex items-center justify-between p-3 rounded-xl ${cfg.bg} border ${cfg.border}">
      <div class="flex items-center gap-2">
        <i class="fas ${cfg.icon} ${cfg.color}"></i>
        <span class="text-sm font-semibold ${cfg.color}">${cfg.label}</span>
      </div>
      <span class="text-xs text-slate-400">${appt.waitMinutes > 0 ? `Waiting ${appt.waitMinutes} min` : 'On time'}</span>
    </div>

    <!-- Visit Details -->
    <div class="grid grid-cols-2 gap-3">
      <div class="bg-slate-800/60 rounded-xl p-3">
        <p class="text-xs text-slate-500 mb-0.5">Appointment</p>
        <p class="text-sm font-semibold text-white">${appt.time} – ${appt.endTime}</p>
        <p class="text-xs text-slate-400 mt-0.5">${appt.typeLabel}</p>
      </div>
      <div class="bg-slate-800/60 rounded-xl p-3">
        <p class="text-xs text-slate-500 mb-0.5">Provider</p>
        <p class="text-sm font-semibold ${pColors.text}">${appt.providerName}</p>
        <p class="text-xs text-slate-400 mt-0.5">${appt.room || 'No room assigned'}</p>
      </div>
    </div>

    <!-- Chief Complaint -->
    <div class="bg-slate-800/60 rounded-xl p-3">
      <p class="text-xs text-slate-500 mb-1">Chief Complaint</p>
      <p class="text-sm text-white">${appt.chiefComplaint}</p>
    </div>

    <!-- Checklist -->
    <div class="grid grid-cols-3 gap-2">
      <div class="flex flex-col items-center gap-1.5 bg-slate-800/60 rounded-xl p-3">
        <div class="w-8 h-8 rounded-lg ${appt.intakeComplete ? 'bg-emerald-900/40' : 'bg-amber-900/40'} flex items-center justify-center">
          <i class="fas ${appt.intakeComplete ? 'fa-check text-emerald-400' : 'fa-xmark text-amber-400'} text-sm"></i>
        </div>
        <p class="text-xs text-center ${appt.intakeComplete ? 'text-emerald-400' : 'text-amber-400'} font-medium">Intake</p>
      </div>
      <div class="flex flex-col items-center gap-1.5 bg-slate-800/60 rounded-xl p-3">
        <div class="w-8 h-8 rounded-lg ${appt.insuranceVerified ? 'bg-emerald-900/40' : 'bg-rose-900/40'} flex items-center justify-center">
          <i class="fas ${appt.insuranceVerified ? 'fa-shield-check text-emerald-400' : 'fa-shield-xmark text-rose-400'} text-sm"></i>
        </div>
        <p class="text-xs text-center ${appt.insuranceVerified ? 'text-emerald-400' : 'text-rose-400'} font-medium">Insurance</p>
      </div>
      <div class="flex flex-col items-center gap-1.5 bg-slate-800/60 rounded-xl p-3">
        <div class="w-8 h-8 rounded-lg ${appt.copay > 0 ? 'bg-amber-900/40' : 'bg-emerald-900/40'} flex items-center justify-center">
          <i class="fas fa-dollar-sign ${appt.copay > 0 ? 'text-amber-400' : 'text-emerald-400'} text-sm"></i>
        </div>
        <p class="text-xs text-center ${appt.copay > 0 ? 'text-amber-400' : 'text-emerald-400'} font-medium">${appt.copay > 0 ? `$${appt.copay} copay` : 'Paid'}</p>
      </div>
    </div>

    <!-- Room assignment -->
    <div>
      <p class="text-xs text-slate-500 mb-2">Assign Room</p>
      <div class="flex flex-wrap gap-2">
        ${DS.kpis.rooms.map(room => `
          <button
            onclick="assignRoom('${appt.id}', '${room.name}')"
            class="px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${appt.room === room.name ? 'bg-brand-600/40 border-brand-500/60 text-brand-300' : room.status === 'OCCUPIED' ? 'bg-slate-700/30 border-slate-700/40 text-slate-600 cursor-not-allowed' : 'bg-slate-700/50 border-slate-600/50 text-slate-300 hover:bg-slate-700 hover:text-white'}"
            ${room.status === 'OCCUPIED' && appt.room !== room.name ? 'disabled' : ''}
          >
            ${room.name}${room.status === 'OCCUPIED' && appt.room !== room.name ? ' (Busy)' : ''}
          </button>
        `).join('')}
      </div>
    </div>
  `

  // Actions
  const actions = document.getElementById('modal-actions')
  const nextStatus = NEXT_STATUS[appt.status]

  actions.innerHTML = `
    <button onclick="window.location.href='/exam?appt=${appt.id}'" class="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-xl transition-colors">
      <i class="fas fa-stethoscope text-sm"></i> Open Exam
    </button>
    ${!appt.intakeComplete ? `
    <a href="/intake?demo=true" class="flex items-center justify-center gap-2 px-3 py-2.5 bg-amber-900/40 hover:bg-amber-900/60 text-amber-300 text-sm font-medium rounded-xl transition-colors border border-amber-800/40">
      <i class="fas fa-mobile-screen text-sm"></i> Resend Intake
    </a>` : ''}
    ${nextStatus ? `
    <button onclick="advanceStatus('${appt.id}', '${nextStatus}'); document.getElementById('patient-modal').classList.add('hidden')" class="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-brand-900">
      <i class="fas fa-arrow-right text-sm"></i> ${NEXT_ACTION_LABEL[appt.status]}
    </button>` : `
    <div class="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-900/30 text-emerald-400 text-sm font-semibold rounded-xl border border-emerald-800/40">
      <i class="fas fa-check-circle"></i> Visit Complete
    </div>`}
  `

  modal.classList.remove('hidden')
}

function closeModal(event) {
  if (event.target === document.getElementById('patient-modal')) {
    document.getElementById('patient-modal').classList.add('hidden')
  }
}

function assignRoom(apptId, roomName) {
  const appt = DS.schedule.find(a => a.id === apptId)
  if (!appt) return
  appt.room = roomName
  renderCurrentView()
  showToast(`Room ${roomName} assigned`)
  document.getElementById('patient-modal').classList.add('hidden')
}

// ── Alerts ────────────────────────────────────────────────────────────────────
function renderAlerts() {
  const k = DS.kpis
  const alerts = []

  DS.schedule.forEach(a => {
    if (a.urgent) alerts.push({ type: 'urgent', text: `URGENT: ${a.patientName} — ${a.chiefComplaint}`, time: a.time })
    if (!a.intakeComplete && a.status !== 'SCHEDULED') alerts.push({ type: 'warning', text: `${a.patientName} intake incomplete`, time: a.time })
    if (!a.insuranceVerified && ['CHECKED_IN','IN_PRETESTING'].includes(a.status)) alerts.push({ type: 'warning', text: `${a.patientName} insurance unverified`, time: a.time })
    if (a.waitMinutes > 25) alerts.push({ type: 'error', text: `${a.patientName} waiting ${a.waitMinutes} min`, time: a.time })
  })

  const alertEl = document.getElementById('alert-list')
  const alertPill = document.getElementById('alert-pill')
  const alertCount = document.getElementById('alert-count')

  if (alerts.length > 0) {
    alertPill.classList.remove('hidden')
    alertPill.classList.add('flex')
    alertCount.textContent = `${alerts.length} alerts`
  }

  const alertColors = {
    urgent:  { bg: 'bg-rose-900/40',  border: 'border-rose-800/40',  text: 'text-rose-400',  icon: 'fa-triangle-exclamation' },
    warning: { bg: 'bg-amber-900/30', border: 'border-amber-800/40', text: 'text-amber-400', icon: 'fa-exclamation-circle'    },
    error:   { bg: 'bg-rose-900/30',  border: 'border-rose-800/40',  text: 'text-rose-300',  icon: 'fa-clock'                },
  }

  alertEl.innerHTML = alerts.slice(0, 5).map(a => {
    const c = alertColors[a.type]
    return `
    <div class="flex items-start gap-2.5 p-2.5 rounded-xl ${c.bg} border ${c.border}">
      <i class="fas ${c.icon} ${c.text} text-xs mt-0.5 flex-shrink-0"></i>
      <div>
        <p class="text-xs ${c.text} font-medium leading-tight">${a.text}</p>
        <p class="text-xs text-slate-600 mt-0.5">${a.time}</p>
      </div>
    </div>`
  }).join('')

  // Panel
  document.getElementById('alerts-panel-content').innerHTML = alerts.map(a => {
    const c = alertColors[a.type]
    return `
    <div class="flex items-start gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-700/50 transition-colors">
      <i class="fas ${c.icon} ${c.text} text-sm mt-0.5 flex-shrink-0"></i>
      <div>
        <p class="text-sm ${c.text} font-medium">${a.text}</p>
        <p class="text-xs text-slate-500 mt-0.5">${a.time}</p>
      </div>
    </div>`
  }).join('') || `<p class="text-sm text-slate-500 text-center py-6">No active alerts</p>`
}

// ── Activity Log ──────────────────────────────────────────────────────────────
const ACTIVITY = [
  { text: 'Margaret Sullivan — Completed', time: '8:42am', icon: 'fa-check-circle', color: 'text-emerald-400' },
  { text: 'Priya Nair — Sent to Pre-Test', time: '8:51am', icon: 'fa-stethoscope',  color: 'text-violet-400'  },
  { text: 'Derek Holloway — With Doctor',  time: '9:03am', icon: 'fa-eye',           color: 'text-emerald-400' },
  { text: 'Charles Beaumont — Checked In', time: '9:08am', icon: 'fa-door-open',    color: 'text-amber-400'   },
]

function renderActivityLog() {
  document.getElementById('activity-log').innerHTML = ACTIVITY.map(a => `
    <div class="flex items-start gap-2">
      <i class="fas ${a.icon} ${a.color} text-xs mt-0.5 flex-shrink-0 w-3"></i>
      <div>
        <p class="text-slate-300 leading-tight">${a.text}</p>
        <p class="text-slate-600 text-xs">${a.time}</p>
      </div>
    </div>
  `).join('')
}

function addActivityEntry(patientName, statusLabel) {
  const now = new Date()
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const cfg = Object.values(STATUS_CONFIG).find(c => c.label === statusLabel)
  ACTIVITY.unshift({ text: `${patientName} — ${statusLabel}`, time, icon: cfg?.icon || 'fa-circle', color: cfg?.color || 'text-slate-400' })
  if (ACTIVITY.length > 8) ACTIVITY.pop()
  renderActivityLog()
}

// ── Up Next ───────────────────────────────────────────────────────────────────
function renderUpNext() {
  const upcoming = DS.schedule
    .filter(a => ['SCHEDULED','CONFIRMED'].includes(a.status))
    .slice(0, 3)

  document.getElementById('up-next').innerHTML = upcoming.map(a => {
    const pColors = PROVIDER_COLORS[a.providerId] || PROVIDER_COLORS['dr-chen']
    return `
    <div class="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-800/50 border border-slate-700/40 cursor-pointer hover:bg-slate-800 transition-colors" onclick="openPatientModal('${a.id}')">
      <div class="text-center w-10 flex-shrink-0">
        <p class="text-xs font-bold text-white">${a.time}</p>
        <p class="text-xs text-slate-500">${a.duration}m</p>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-xs font-semibold text-white truncate">${a.patientName}</p>
        <p class="text-xs ${pColors.text} truncate">${a.providerName.split(' ').slice(0,3).join(' ')}</p>
      </div>
    </div>`
  }).join('')
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
function renderDonutChart() {
  const k = DS.kpis
  const ctx = document.getElementById('donut-chart').getContext('2d')

  const data = [
    { label: 'Completed',   value: k.completed,      color: '#3b82f6' },
    { label: 'In Progress', value: k.inOffice,        color: '#8b5cf6' },
    { label: 'Remaining',   value: k.remaining,       color: '#334155' },
    { label: 'No Show',     value: k.noShows,         color: '#ef4444' },
  ].filter(d => d.value > 0)

  if (DS.donutChart) DS.donutChart.destroy()

  DS.donutChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.label),
      datasets: [{
        data: data.map(d => d.value),
        backgroundColor: data.map(d => d.color),
        borderWidth: 0,
        borderRadius: 4,
        hoverOffset: 6,
      }]
    },
    options: {
      cutout: '72%',
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e293b',
          borderColor: '#334155',
          borderWidth: 1,
          titleColor: '#fff',
          bodyColor: '#94a3b8',
          padding: 10,
          cornerRadius: 10,
          callbacks: {
            label: ctx => ` ${ctx.raw} patients`
          }
        }
      }
    }
  })

  // Center text
  const centerPlugin = {
    id: 'centerText',
    afterDraw(chart) {
      const { ctx, chartArea: { left, right, top, bottom } } = chart
      const cx = (left + right) / 2
      const cy = (top + bottom) / 2
      ctx.save()
      ctx.font = 'bold 20px Inter'
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(k.totalScheduled, cx, cy - 6)
      ctx.font = '11px Inter'
      ctx.fillStyle = '#64748b'
      ctx.fillText('Today', cx, cy + 12)
      ctx.restore()
    }
  }
  DS.donutChart.register?.(centerPlugin)

  document.getElementById('chart-legend').innerHTML = data.map(d => `
    <div class="flex items-center gap-1.5">
      <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${d.color}"></span>
      <span class="text-xs text-slate-400">${d.label} <strong class="text-white">${d.value}</strong></span>
    </div>
  `).join('')
}

// ── Context Menu ──────────────────────────────────────────────────────────────
function showContextMenu(event, apptId) {
  event.preventDefault()
  const appt = DS.schedule.find(a => a.id === apptId)
  if (!appt) return

  const menu = document.getElementById('ctx-menu')
  const items = document.getElementById('ctx-items')

  const actions = []
  if (NEXT_STATUS[appt.status]) {
    actions.push({ icon: 'fa-arrow-right', label: NEXT_ACTION_LABEL[appt.status], fn: `advanceStatus('${apptId}', '${NEXT_STATUS[appt.status]}')` })
  }
  actions.push({ icon: 'fa-user', label: 'View Patient Details', fn: `openPatientModal('${apptId}')` })
  if (!appt.intakeComplete) {
    actions.push({ icon: 'fa-mobile-screen', label: 'Resend Intake Link', fn: `showToast('Intake link sent!')` })
  }
  actions.push({ icon: 'fa-calendar-xmark', label: 'Mark No Show', fn: `advanceStatus('${apptId}', 'NO_SHOW')`, cls: 'text-rose-400 hover:text-rose-300' })
  actions.push({ icon: 'fa-print', label: 'Print Visit Summary', fn: `showToast('Printing...')` })

  items.innerHTML = actions.map(a => `
    <div class="ctx-item ${a.cls || ''}" onclick="${a.fn}; hideContextMenu()">
      <i class="fas ${a.icon}"></i>
      <span>${a.label}</span>
    </div>
  `).join('<div class="border-t border-slate-700/50 my-1"></div>'.repeat(0))

  // Position near cursor
  let x = event.clientX
  let y = event.clientY
  if (x + 220 > window.innerWidth)  x = window.innerWidth - 224
  if (y + actions.length * 44 > window.innerHeight) y = window.innerHeight - actions.length * 44 - 20

  menu.style.left = `${x}px`
  menu.style.top  = `${y}px`
  menu.classList.remove('hidden')

  setTimeout(() => document.addEventListener('click', hideContextMenu, { once: true }), 0)
}

function hideContextMenu() {
  document.getElementById('ctx-menu').classList.add('hidden')
}

// ── View Management ───────────────────────────────────────────────────────────
function setView(view) {
  DS.currentView = view
  document.getElementById('view-flow-content').classList.add('hidden')
  document.getElementById('view-schedule-content').classList.add('hidden')
  document.getElementById('view-timeline-content').classList.add('hidden')
  document.getElementById(`view-${view}-content`).classList.remove('hidden')

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.classList.remove('bg-brand-600', 'text-white')
    btn.classList.add('text-slate-400')
  })
  const activeBtn = document.getElementById(`view-${view}`)
  activeBtn.classList.add('bg-brand-600', 'text-white')
  activeBtn.classList.remove('text-slate-400')

  renderCurrentView()
}

function renderCurrentView() {
  if (DS.currentView === 'flow')     renderFlowBoard()
  if (DS.currentView === 'schedule') renderScheduleList()
  if (DS.currentView === 'timeline') renderTimeline()
}

function filterByProvider(pid) {
  DS.filterProvider = pid
  document.getElementById('provider-filter').value = pid
  renderCurrentView()
}

// ── Search ────────────────────────────────────────────────────────────────────
function openSearch() {
  document.getElementById('search-modal').classList.remove('hidden')
  setTimeout(() => document.getElementById('search-input').focus(), 50)
}

function closeSearch(event) {
  if (event.target === document.getElementById('search-modal')) {
    document.getElementById('search-modal').classList.add('hidden')
    document.getElementById('search-input').value = ''
    document.getElementById('search-results').innerHTML = '<p class="text-xs text-slate-500 text-center py-4">Type to search patients...</p>'
  }
}

function handleSearch(query) {
  const results = document.getElementById('search-results')
  if (!query) {
    results.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">Type to search patients...</p>'
    return
  }
  const q = query.toLowerCase()
  const matches = DS.schedule.filter(a =>
    a.patientName.toLowerCase().includes(q) ||
    a.patientId.toLowerCase().includes(q) ||
    a.typeLabel.toLowerCase().includes(q)
  )
  if (!matches.length) {
    results.innerHTML = '<p class="text-xs text-slate-500 text-center py-4">No results found</p>'
    return
  }
  results.innerHTML = matches.map(a => {
    const pColors = PROVIDER_COLORS[a.providerId] || PROVIDER_COLORS['dr-chen']
    const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.SCHEDULED
    return `
    <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800 cursor-pointer transition-colors" onclick="document.getElementById('search-modal').classList.add('hidden'); openPatientModal('${a.id}')">
      <div class="w-9 h-9 rounded-xl bg-gradient-to-br ${pColors.from} ${pColors.to} flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
        ${a.patientName.split(' ').map(n=>n[0]).join('').slice(0,2)}
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-white truncate">${a.patientName}</p>
        <p class="text-xs text-slate-400 truncate">${a.time} · ${a.typeLabel} · ${a.providerName}</p>
      </div>
      <span class="status-pill ${cfg.bg} ${cfg.color} border ${cfg.border}">${cfg.label}</span>
    </div>`
  }).join('')
}

// ── Alerts Panel ──────────────────────────────────────────────────────────────
let alertsOpen = false
function toggleAlerts() {
  alertsOpen = !alertsOpen
  document.getElementById('alerts-panel').classList.toggle('hidden', !alertsOpen)
  if (alertsOpen) setTimeout(() => document.addEventListener('click', closeAlertsOutside, { once: true }), 0)
}

function closeAlertsOutside(e) {
  const panel = document.getElementById('alerts-panel')
  if (!panel.contains(e.target)) { alertsOpen = false; panel.classList.add('hidden') }
}

// ── New Appointment (placeholder) ────────────────────────────────────────────
function openNewAppt() {
  showToast('New appointment scheduler coming in Phase 1C')
}

// ── Keyboard Shortcuts ────────────────────────────────────────────────────────
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault(); openSearch()
    }
    if (e.key === 'Escape') {
      document.getElementById('search-modal').classList.add('hidden')
      document.getElementById('patient-modal').classList.add('hidden')
      document.getElementById('alerts-panel').classList.add('hidden')
      hideContextMenu()
    }
    if (e.key === '1') setView('flow')
    if (e.key === '2') setView('schedule')
    if (e.key === '3') setView('timeline')
  })
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastT = null
function showToast(msg, type = 'success') {
  const toast = document.getElementById('toast')
  const icon  = document.getElementById('toast-icon')
  const text  = document.getElementById('toast-text')
  text.textContent = msg
  icon.className = `fas text-sm ${type === 'error' ? 'fa-circle-xmark text-rose-400' : 'fa-check-circle text-emerald-400'}`
  toast.classList.remove('hidden')
  clearTimeout(toastT)
  toastT = setTimeout(() => toast.classList.add('hidden'), 2500)
}
