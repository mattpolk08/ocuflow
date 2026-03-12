// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Scheduling Engine Controller  (Phase 1C)
// public/static/schedule.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

// ── Constants ──────────────────────────────────────────────────────────────────
const HOURS_START = 7;   // 07:00
const HOURS_END   = 18;  // 18:00
const HOUR_HEIGHT = 60;  // px per hour

const STATUS_CONFIG = {
  SCHEDULED:        { label: 'Scheduled',       cls: 's-scheduled',   icon: 'fa-calendar',             next: 'CONFIRMED'        },
  CONFIRMED:        { label: 'Confirmed',        cls: 's-confirmed',   icon: 'fa-circle-check',         next: 'CHECKED_IN'       },
  CHECKED_IN:       { label: 'Checked In',       cls: 's-checked-in',  icon: 'fa-door-open',            next: 'IN_PRETESTING'    },
  IN_PRETESTING:    { label: 'Pre-Testing',      cls: 's-pretesting',  icon: 'fa-vial',                 next: 'READY_FOR_DOCTOR' },
  READY_FOR_DOCTOR: { label: 'Ready',            cls: 's-ready',       icon: 'fa-user-clock',           next: 'WITH_DOCTOR'      },
  WITH_DOCTOR:      { label: 'With Doctor',      cls: 's-with-doctor', icon: 'fa-stethoscope',          next: 'CHECKOUT'         },
  CHECKOUT:         { label: 'Checkout',         cls: 's-checkout',    icon: 'fa-cash-register',        next: 'COMPLETED'        },
  COMPLETED:        { label: 'Completed',        cls: 's-completed',   icon: 'fa-circle-check',         next: null               },
  NO_SHOW:          { label: 'No Show',          cls: 's-no-show',     icon: 'fa-user-slash',           next: null               },
  CANCELLED:        { label: 'Cancelled',        cls: 's-cancelled',   icon: 'fa-ban',                  next: null               },
};

const APPT_COLORS = {
  blue:'appt-blue', violet:'appt-violet', emerald:'appt-emerald', amber:'appt-amber',
  red:'appt-red', cyan:'appt-cyan', pink:'appt-pink', slate:'appt-slate',
  orange:'appt-orange', sky:'appt-sky', rose:'appt-rose', teal:'appt-teal',
};

// ── State ──────────────────────────────────────────────────────────────────────
const SS = {
  view:            'week',   // 'week' | 'day' | 'list'
  weekStart:       null,     // Date (Monday of current week)
  selectedDate:    null,     // YYYY-MM-DD string (day view)
  weekData:        [],       // ScheduleDay[]
  providerFilter:  'all',
  openAppt:        null,     // Appointment object in drawer
  bookSlot:        null,     // { date, startTime, providerId } pre-fill
  slotDebounce:    null,
  selectedSlot:    null,     // { date, startTime, providerId }
  apptTypes:       [],
  providers:       [],
  waitlist:        [],
};

// ── DOM helpers ────────────────────────────────────────────────────────────────
const $  = (s, ctx=document) => ctx.querySelector(s);
const $$ = (s, ctx=document) => [...ctx.querySelectorAll(s)];
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtTime(t) {
  if (!t) return '';
  const [h,m] = t.split(':').map(Number);
  const ampm  = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`;
}
function fmtDate(iso) {
  if (!iso) return '';
  const [y,mo,d] = iso.split('-');
  const ms = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${ms[+mo-1]} ${+d}, ${y}`;
}
function toDateStr(d) { return d.toISOString().split('T')[0]; }
function timeToMins(t) { const [h,m] = t.split(':').map(Number); return h*60+m; }
function minsToTop(mins) { return (mins - HOURS_START*60) * (HOUR_HEIGHT/60); }

let toastTimer;
function showToast(msg, type='success') {
  const t = $('#toast'), icon = $('#toast-icon'), msgEl = $('#toast-msg');
  icon.className = 'fas ' + (type==='success'?'fa-circle-check text-emerald-400':type==='error'?'fa-circle-xmark text-red-400':'fa-circle-info text-blue-400');
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
async function api(path, opts={}) {
  const res = await fetch(path, { ...opts, headers: _authHdr(opts.headers) });
  if (res.status === 401) { sessionStorage.clear(); location.href = '/login'; return {}; }
  const j   = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || res.statusText);
  return j;
}
async function apiGet(p)   { return api(p); }
async function apiPost(p,b){ return api(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}); }
async function apiDel(p)   { return api(p,{method:'DELETE'}); }

// ─────────────────────────────────────────────────────────────────────────────
// WEEK NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────

function getMonday(d) {
  const dt  = new Date(d);
  const dow = dt.getDay();
  dt.setDate(dt.getDate() - (dow === 0 ? 6 : dow - 1));
  return dt;
}

function updateWeekLabel() {
  const end = new Date(SS.weekStart);
  end.setDate(end.getDate() + 6);
  const ms  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const s   = `${ms[SS.weekStart.getMonth()]} ${SS.weekStart.getDate()}`;
  const e   = `${ms[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
  $('#week-label').textContent = `${s} – ${e}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA LOADING
// ─────────────────────────────────────────────────────────────────────────────

async function loadWeek() {
  try {
    const start = toDateStr(SS.weekStart);
    const res   = await apiGet(`/api/schedule/week?start=${start}&days=7`);
    SS.weekData = res.data.schedule;
    renderWeek();
    loadTodayKpis();
  } catch(e) {
    showToast('Failed to load schedule: ' + e.message, 'error');
  }
}

async function loadTodayKpis() {
  try {
    const today = toDateStr(new Date());
    const res   = await apiGet(`/api/schedule/day?date=${today}`);
    const kpis  = res.data.kpis;
    $('#kpi-total').textContent = kpis.total;
    $('#kpi-done').textContent  = kpis.completed;
    $('#kpi-in').textContent    = kpis.inOffice;
  } catch(e) { /* silent */ }
}

async function loadWaitlist() {
  try {
    const res    = await apiGet('/api/schedule/waitlist');
    SS.waitlist  = res.data.waitlist;
    $('#wl-count').textContent = SS.waitlist.length;
    renderWaitlist();
  } catch(e) { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEK CALENDAR RENDER
// ─────────────────────────────────────────────────────────────────────────────

function renderWeek() {
  renderWeekHeaders();
  renderWeekGrid();
}

function renderWeekHeaders() {
  const el   = $('#week-headers');
  const today = toDateStr(new Date());
  el.innerHTML = SS.weekData.map(day => `
    <div class="day-col-header ${day.isToday?'today':''} ${day.isWeekend?'weekend':''} ${SS.selectedDate===day.date?'selected':''}"
         data-date="${esc(day.date)}">
      <p class="text-xs font-semibold ${day.isToday?'text-blue-400':'text-slate-500'} uppercase tracking-wider">${esc(day.dayLabel)}</p>
      <p class="text-lg font-bold ${day.isToday?'text-blue-300':'text-slate-200'} leading-tight">${new Date(day.date+'T12:00:00').getDate()}</p>
      <p class="text-xs ${day.totalBooked?'text-slate-400':'text-slate-700'} mt-0.5">
        ${day.totalBooked} appt${day.totalBooked===1?'':'s'}
      </p>
    </div>`).join('');

  $$('.day-col-header').forEach(h => {
    h.addEventListener('click', () => switchToDay(h.dataset.date));
  });
}

function renderWeekGrid() {
  const gutter = $('#time-gutter');
  const grid   = $('#week-grid');

  // Build time gutter (07:00 – 18:00)
  gutter.innerHTML = '';
  for (let h = HOURS_START; h <= HOURS_END; h++) {
    const el  = document.createElement('div');
    el.className = 'time-label';
    el.textContent = h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h-12}pm`;
    gutter.appendChild(el);
  }

  // Build day columns
  grid.innerHTML = SS.weekData.map((day, di) => {
    let appts = day.appointments;
    if (SS.providerFilter !== 'all') {
      appts = appts.filter(a => a.providerId === SS.providerFilter);
    }
    const totalHours = HOURS_END - HOURS_START;
    const gridHeight = totalHours * HOUR_HEIGHT;

    const hourRows = Array.from({length: totalHours}, (_,i) => `
      <div class="hour-row" style="top:${i*HOUR_HEIGHT}px; position:absolute; left:0; right:0; height:${HOUR_HEIGHT}px;">
        <div class="half-hour-line"></div>
      </div>`).join('');

    const apptBlocks = appts
      .filter(a => a.status !== 'CANCELLED')
      .map(a => renderApptBlock(a)).join('');

    // Clickable empty slots
    const slotClicks = generateClickableSlots(day.slots, day.date);

    return `<div class="day-column" style="height:${gridHeight}px;" data-date="${esc(day.date)}">
      ${hourRows}
      ${slotClicks}
      ${apptBlocks}
    </div>`;
  }).join('');

  // Today's now-line
  renderNowLine();

  // Wire appointment block clicks
  $$('.appt-block').forEach(b => {
    b.addEventListener('click', e => { e.stopPropagation(); openDrawer(b.dataset.apptId); });
  });

  // Wire empty slot clicks
  $$('.slot-click-zone').forEach(z => {
    z.addEventListener('click', () => {
      openBookModal({ date: z.dataset.date, startTime: z.dataset.time, providerId: null });
    });
  });
}

function generateClickableSlots(slots, date) {
  if (!slots) return '';
  const available = slots.filter(s => s.isAvailable);
  // Build one invisible zone per 20-min slot
  return available.map(s => {
    const top = minsToTop(timeToMins(s.startTime));
    const h   = 20 * (HOUR_HEIGHT/60);
    return `<div class="slot-click-zone absolute left-0 right-0 z-1 cursor-pointer hover:bg-blue-500/5 transition-colors rounded"
       style="top:${top}px; height:${h}px;"
       data-date="${esc(date)}" data-time="${esc(s.startTime)}"></div>`;
  }).join('');
}

function renderApptBlock(a) {
  const startMins = timeToMins(a.startTime);
  const endMins   = timeToMins(a.endTime);
  const top       = minsToTop(startMins);
  const height    = Math.max((endMins - startMins) * (HOUR_HEIGHT/60) - 2, 18);
  const colorCls  = APPT_COLORS[a.color] || 'appt-blue';
  const sc        = STATUS_CONFIG[a.status] || STATUS_CONFIG.SCHEDULED;

  return `<div class="appt-block ${colorCls}" style="top:${top}px; height:${height}px;"
    data-appt-id="${esc(a.id)}">
    <p class="font-semibold leading-tight truncate">${esc(a.patientName)}</p>
    ${height > 30 ? `<p class="opacity-75 truncate">${fmtTime(a.startTime)} · ${esc(a.typeLabel)}</p>` : ''}
    ${height > 46 ? `<span class="status-chip ${sc.cls} mt-1 inline-flex"><i class="fas ${sc.icon}"></i> ${sc.label}</span>` : ''}
    ${a.urgent ? `<span class="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>` : ''}
  </div>`;
}

function renderNowLine() {
  const now    = new Date();
  const today  = toDateStr(now);
  const dayIdx = SS.weekData.findIndex(d => d.date === today);
  if (dayIdx < 0) return;

  const cols = $$('.day-column');
  if (!cols[dayIdx]) return;

  const mins = now.getHours()*60 + now.getMinutes();
  const top  = minsToTop(mins);
  if (top < 0) return;

  const line = document.createElement('div');
  line.id = 'now-line';
  line.style.top = top + 'px';
  cols[dayIdx].appendChild(line);
}

// ─────────────────────────────────────────────────────────────────────────────
// DAY VIEW
// ─────────────────────────────────────────────────────────────────────────────

function switchToDay(date) {
  SS.selectedDate = date;
  SS.view = 'day';
  $$('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === 'day'));
  $('#view-week').classList.add('hidden'); $('#view-week').classList.remove('flex');
  $('#view-day').classList.remove('hidden'); $('#view-day').classList.add('flex');
  $('#view-list').classList.add('hidden');
  renderDayView(date);
}

async function renderDayView(date) {
  const day = SS.weekData.find(d => d.date === date);
  if (!day) return;

  const ms = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dt = new Date(date+'T12:00:00');
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  $('#day-view-title').textContent = `${days[dt.getDay()]}, ${ms[dt.getMonth()]} ${dt.getDate()}, ${dt.getFullYear()}`;

  let appts = day.appointments.filter(a => a.status !== 'CANCELLED');
  if (SS.providerFilter !== 'all') appts = appts.filter(a => a.providerId === SS.providerFilter);

  $('#day-view-kpis').innerHTML = `
    <span class="text-slate-500">${appts.length} appointments</span>
    <span class="text-emerald-400">${appts.filter(a=>a.status==='COMPLETED').length} completed</span>
    <span class="text-blue-400">${appts.filter(a=>['CHECKED_IN','IN_PRETESTING','READY_FOR_DOCTOR','WITH_DOCTOR','CHECKOUT'].includes(a.status)).length} in office</span>
  `;

  // Build grid
  const gutter = $('#day-time-gutter');
  gutter.innerHTML = '';
  for (let h = HOURS_START; h <= HOURS_END; h++) {
    const el = document.createElement('div');
    el.className = 'time-label';
    el.textContent = h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h-12}pm`;
    gutter.appendChild(el);
  }

  const totalHours = HOURS_END - HOURS_START;
  const gridHeight = totalHours * HOUR_HEIGHT;
  const grid = $('#day-grid');
  grid.style.height = gridHeight + 'px';
  grid.style.position = 'relative';

  // Hour rows
  grid.innerHTML = Array.from({length: totalHours}, (_,i) => `
    <div style="position:absolute;left:0;right:0;top:${i*HOUR_HEIGHT}px;height:${HOUR_HEIGHT}px;border-bottom:1px solid rgba(30,41,59,.7);">
      <div style="position:absolute;top:30px;left:0;right:0;border-bottom:1px dashed rgba(30,41,59,.5);"></div>
    </div>`).join('');

  // Appointment blocks (wider for day view)
  for (const a of appts) {
    const startMins = timeToMins(a.startTime);
    const endMins   = timeToMins(a.endTime);
    const top       = minsToTop(startMins);
    const height    = Math.max((endMins - startMins)*(HOUR_HEIGHT/60) - 3, 22);
    const colorCls  = APPT_COLORS[a.color] || 'appt-blue';
    const sc        = STATUS_CONFIG[a.status] || STATUS_CONFIG.SCHEDULED;

    const block = document.createElement('div');
    block.className = `appt-block ${colorCls}`;
    block.style.cssText = `top:${top}px;height:${height}px;left:8px;right:8px;`;
    block.dataset.apptId = a.id;
    block.innerHTML = `
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="font-semibold truncate">${esc(a.patientName)}</p>
          <p class="opacity-75 text-[10px]">${fmtTime(a.startTime)}–${fmtTime(a.endTime)} · ${esc(a.typeLabel)}</p>
          ${height>46?`<p class="opacity-60 text-[10px] truncate">${esc(a.chiefComplaint||'')}</p>`:''}
        </div>
        <div class="flex-shrink-0 flex flex-col items-end gap-1">
          <span class="status-chip ${sc.cls}"><i class="fas ${sc.icon} text-[8px]"></i> ${sc.label}</span>
          ${a.room?`<span class="text-[9px] opacity-60">${esc(a.room)}</span>`:''}
        </div>
      </div>
      ${a.urgent?'<span class="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>':''}
    `;
    block.addEventListener('click', () => openDrawer(a.id));
    grid.appendChild(block);
  }

  // Now line if today
  if (date === toDateStr(new Date())) {
    const now = new Date();
    const top = minsToTop(now.getHours()*60 + now.getMinutes());
    if (top >= 0) {
      const line = document.createElement('div');
      line.id = 'now-line';
      line.style.cssText = `position:absolute;left:0;right:0;top:${top}px;height:2px;background:#ef4444;z-index:10;`;
      grid.appendChild(line);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LIST VIEW
// ─────────────────────────────────────────────────────────────────────────────

function renderListView() {
  const container = $('#list-content');
  if (!SS.weekData.length) { container.innerHTML = '<p class="text-slate-600 text-sm">No data</p>'; return; }

  container.innerHTML = SS.weekData.map(day => {
    let appts = day.appointments;
    if (SS.providerFilter !== 'all') appts = appts.filter(a => a.providerId === SS.providerFilter);
    appts = appts.filter(a => a.status !== 'CANCELLED');
    if (!appts.length) return '';

    return `<div class="mb-4">
      <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
        ${esc(day.dayLabel)}, ${esc(day.dateLabel)}
        ${day.isToday?'<span class="text-blue-400 text-[10px] bg-blue-500/15 px-1.5 py-0.5 rounded-full font-bold">TODAY</span>':''}
        <span class="text-slate-600">${appts.length} appts</span>
      </p>
      ${appts.map(a => {
        const sc = STATUS_CONFIG[a.status] || STATUS_CONFIG.SCHEDULED;
        return `<div class="flex items-center gap-3 p-3 rounded-xl border border-slate-800 bg-slate-900/60 hover:bg-slate-800/60 cursor-pointer transition-colors mb-1.5" data-appt-id="${esc(a.id)}">
          <div class="w-1 self-stretch rounded-full bg-${esc(a.color)}-500 flex-shrink-0"></div>
          <div class="w-16 flex-shrink-0 text-center">
            <p class="text-sm font-bold text-white">${fmtTime(a.startTime)}</p>
            <p class="text-xs text-slate-500">${a.duration}min</p>
          </div>
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-sm text-white truncate">${esc(a.patientName)}</p>
            <p class="text-xs text-slate-400 truncate">${esc(a.typeLabel)}${a.chiefComplaint?' · '+esc(a.chiefComplaint):''}</p>
          </div>
          <div class="text-right flex-shrink-0">
            <span class="status-chip ${sc.cls}"><i class="fas ${sc.icon} text-[8px]"></i> ${sc.label}</span>
            <p class="text-xs text-slate-500 mt-1">${esc(a.providerName.replace('Dr. ','Dr.').split(',')[0])}</p>
          </div>
          ${a.urgent?'<span class="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0"></span>':''}
        </div>`;
      }).join('')}
    </div>`;
  }).join('');

  $$('#list-content [data-appt-id]').forEach(el => {
    el.addEventListener('click', () => openDrawer(el.dataset.apptId));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// APPOINTMENT DRAWER
// ─────────────────────────────────────────────────────────────────────────────

async function openDrawer(apptId) {
  const drawer = $('#appt-drawer');
  drawer.classList.add('open');

  // Find appt in cached week data
  let appt = null;
  for (const day of SS.weekData) {
    appt = day.appointments.find(a => a.id === apptId);
    if (appt) break;
  }
  if (!appt) {
    try { const r = await apiGet(`/api/schedule/appointment/${apptId}`); appt = r.data; } catch(e) {}
  }
  if (!appt) { $('#drawer-content').innerHTML = '<p class="text-slate-500 text-sm">Not found</p>'; return; }
  SS.openAppt = appt;
  renderDrawer(appt);
}

function renderDrawer(a) {
  const sc     = STATUS_CONFIG[a.status] || STATUS_CONFIG.SCHEDULED;
  const nextSt = sc.next;
  const content = $('#drawer-content');

  content.innerHTML = `
    <!-- Patient header -->
    <div class="mb-4">
      <div class="flex items-center gap-2 mb-1 flex-wrap">
        <span class="status-chip ${sc.cls}"><i class="fas ${sc.icon} text-[9px]"></i> ${sc.label}</span>
        ${a.urgent?'<span class="status-chip s-no-show"><i class="fas fa-triangle-exclamation text-[9px]"></i> Urgent</span>':''}
      </div>
      <h3 class="text-base font-bold text-white mt-2">${esc(a.patientName)}</h3>
      <p class="text-xs text-slate-400">${esc(a.typeLabel)}</p>
    </div>

    <!-- Details grid -->
    <div class="space-y-2 text-xs mb-4">
      <div class="flex justify-between p-2 rounded-lg bg-slate-800/50">
        <span class="text-slate-500">Date & Time</span>
        <span class="text-slate-200 font-medium">${fmtDate(a.date)} · ${fmtTime(a.startTime)}</span>
      </div>
      <div class="flex justify-between p-2 rounded-lg bg-slate-800/50">
        <span class="text-slate-500">Provider</span>
        <span class="text-slate-200">${esc(a.providerName)}</span>
      </div>
      ${a.room?`<div class="flex justify-between p-2 rounded-lg bg-slate-800/50"><span class="text-slate-500">Room</span><span class="text-slate-200">${esc(a.room)}</span></div>`:''}
      ${a.chiefComplaint?`<div class="p-2 rounded-lg bg-slate-800/50"><p class="text-slate-500 mb-0.5">Chief Complaint</p><p class="text-slate-200">${esc(a.chiefComplaint)}</p></div>`:''}
      ${a.copay!=null?`<div class="flex justify-between p-2 rounded-lg bg-slate-800/50"><span class="text-slate-500">Copay</span><span class="text-emerald-400 font-semibold">$${a.copay}</span></div>`:''}
      <div class="flex justify-between p-2 rounded-lg bg-slate-800/50">
        <span class="text-slate-500">Confirmation</span>
        <span class="text-slate-300 font-mono">${esc(a.confirmationCode)}</span>
      </div>
      <div class="flex justify-between p-2 rounded-lg bg-slate-800/50">
        <span class="text-slate-500">Insurance</span>
        <span class="${a.insuranceVerified?'text-emerald-400':'text-yellow-400'}">${a.insuranceVerified?'Verified':'Unverified'}</span>
      </div>
      <div class="flex justify-between p-2 rounded-lg bg-slate-800/50">
        <span class="text-slate-500">Intake</span>
        <span class="${a.intakeComplete?'text-emerald-400':'text-yellow-400'}">${a.intakeComplete?'Complete':'Incomplete'}</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="space-y-2">
      ${nextSt ? `
        <button class="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30"
                id="btn-advance-status">
          <i class="fas fa-arrow-right text-xs"></i>
          Advance → ${STATUS_CONFIG[nextSt]?.label}
        </button>` : ''}

      <div class="grid grid-cols-2 gap-2">
        <button class="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                id="btn-mark-noshow">
          <i class="fas fa-user-slash mr-1 text-red-400"></i> No Show
        </button>
        <button class="py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors"
                id="btn-cancel-appt">
          <i class="fas fa-ban mr-1 text-slate-500"></i> Cancel
        </button>
      </div>

      <a href="/patients" class="block w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors text-center">
        <i class="fas fa-user mr-1 text-blue-400"></i> View Patient Record
      </a>
    </div>
  `;

  // Wire action buttons
  $('#btn-advance-status')?.addEventListener('click', () => advanceStatus(a.id, nextSt));
  $('#btn-mark-noshow')?.addEventListener('click',    () => updateStatus(a.id, 'NO_SHOW'));
  $('#btn-cancel-appt')?.addEventListener('click',    () => {
    if (confirm(`Cancel appointment for ${a.patientName}?`)) updateStatus(a.id, 'CANCELLED');
  });
}

async function advanceStatus(id, newStatus) {
  await updateStatus(id, newStatus);
}

async function updateStatus(id, status) {
  try {
    const res = await apiPost(`/api/schedule/appointment/${id}/status`, { status });
    showToast(`${res.data.patientName} → ${STATUS_CONFIG[status]?.label}`, 'success');
    // Update local cache
    for (const day of SS.weekData) {
      const idx = day.appointments.findIndex(a => a.id === id);
      if (idx >= 0) { day.appointments[idx] = res.data; break; }
    }
    renderWeek();
    if (SS.view === 'day' && SS.selectedDate) renderDayView(SS.selectedDate);
    if (SS.view === 'list') renderListView();
    renderDrawer(res.data);
  } catch(e) {
    showToast('Update failed: ' + e.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BOOK APPOINTMENT MODAL
// ─────────────────────────────────────────────────────────────────────────────

function openBookModal(prefill={}) {
  const modal = $('#modal-book');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Set defaults
  SS.selectedSlot = null;
  $('#book-error').classList.add('hidden');
  $('#selected-slot-label').textContent = '';
  $$('.slot-btn').forEach(b => b.classList.remove('selected'));

  // Prefill date
  const today = toDateStr(new Date());
  $('#book-date').value        = prefill.date || today;
  $('#book-date').min          = today;
  $('#book-patient-name').value = '';
  $('#book-patient-dob').value  = '';
  $('#book-patient-phone').value = '';
  $('#book-complaint').value    = '';
  $('#book-copay').value        = '';
  $('#book-urgent').checked     = false;

  if (prefill.providerId) $('#book-provider').value = prefill.providerId;
  else $('#book-provider').value = '';
  $('#book-type').value = '';

  if ((prefill.date || today) && $('#book-provider').value) {
    loadSlots($('#book-date').value, $('#book-provider').value, prefill.startTime);
  } else {
    $('#slot-grid').innerHTML = '<p class="text-xs text-slate-600 col-span-7">Select provider and date to see available slots</p>';
  }
}

function closeBookModal() {
  $('#modal-book').classList.remove('open');
  document.body.style.overflow = '';
  SS.selectedSlot = null;
}

async function loadSlots(date, providerId, preselect) {
  if (!date || !providerId) return;
  const grid  = $('#slot-grid');
  const spnr  = $('#slot-loading');
  spnr.classList.remove('hidden');
  grid.innerHTML = '';

  try {
    const res  = await apiGet(`/api/schedule/slots?date=${date}&providerId=${providerId}`);
    const slots = res.data.slots || [];
    spnr.classList.add('hidden');

    if (!slots.length) {
      grid.innerHTML = '<p class="text-xs text-slate-600 col-span-7">No slots for this day</p>';
      return;
    }

    grid.innerHTML = slots.map(s => `
      <button class="slot-btn ${s.isAvailable ? 'available' : ''}"
              data-time="${esc(s.startTime)}" data-provider="${esc(s.providerId)}" data-date="${esc(date)}"
              ${!s.isAvailable ? 'disabled title="Already booked"' : ''}>
        ${fmtTime(s.startTime)}
      </button>`).join('');

    $$('.slot-btn.available').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        SS.selectedSlot = { date: btn.dataset.date, startTime: btn.dataset.time, providerId: btn.dataset.provider };
        $('#selected-slot-label').textContent = `Selected: ${fmtTime(btn.dataset.time)} on ${fmtDate(date)}`;
      });
    });

    // Auto-select preselected time
    if (preselect) {
      const target = $(`.slot-btn[data-time="${preselect}"]`);
      target?.click();
    }
  } catch(e) {
    spnr.classList.add('hidden');
    grid.innerHTML = '<p class="text-xs text-red-400 col-span-7">Failed to load slots</p>';
  }
}

async function confirmBooking() {
  const btn = $('#btn-confirm-book');
  const patientName = $('#book-patient-name').value.trim();
  const apptType    = $('#book-type').value;
  const providerId  = $('#book-provider').value;

  if (!patientName) { showBookError('Patient name is required'); return; }
  if (!apptType)    { showBookError('Appointment type is required'); return; }
  if (!providerId)  { showBookError('Provider is required'); return; }
  if (!SS.selectedSlot) { showBookError('Please select an available time slot'); return; }

  btn.disabled = true;
  btn.innerHTML = '<span class="spinner w-4 h-4"></span> Booking…';

  try {
    const payload = {
      patientId:        'pt-new',
      patientName,
      patientDob:       $('#book-patient-dob').value || '2000-01-01',
      patientPhone:     $('#book-patient-phone').value || undefined,
      providerId,
      date:             SS.selectedSlot.date,
      startTime:        SS.selectedSlot.startTime,
      appointmentType:  apptType,
      chiefComplaint:   $('#book-complaint').value.trim() || undefined,
      copay:            $('#book-copay').value ? +$('#book-copay').value : undefined,
      urgent:           $('#book-urgent').checked,
    };
    const res = await apiPost('/api/schedule/appointment', payload);
    closeBookModal();
    showToast(`Booked — ${res.data.confirmationCode} · ${fmtTime(res.data.startTime)}`, 'success');
    await loadWeek();
  } catch(e) {
    showBookError(e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-calendar-check text-xs"></i> Confirm Booking';
  }
}

function showBookError(msg) {
  const el = $('#book-error');
  el.classList.remove('hidden');
  el.querySelector('span').textContent = msg;
}

// ─────────────────────────────────────────────────────────────────────────────
// WAITLIST
// ─────────────────────────────────────────────────────────────────────────────

function renderWaitlist() {
  const container = $('#wl-list');
  $('#wl-subtitle').textContent = `${SS.waitlist.length} patient${SS.waitlist.length===1?'':'s'} waiting`;

  if (!SS.waitlist.length) {
    container.innerHTML = '<p class="text-slate-600 text-sm text-center py-6">Waitlist is empty</p>';
    return;
  }

  const priorityMap = {
    URGENT:   { cls:'priority-urgent',   label:'Urgent'   },
    NORMAL:   { cls:'priority-normal',   label:'Normal'   },
    FLEXIBLE: { cls:'priority-flexible', label:'Flexible' },
  };

  container.innerHTML = SS.waitlist.map(w => {
    const pc = priorityMap[w.priority] || priorityMap.NORMAL;
    return `<div class="p-3 rounded-xl border border-slate-700/60 bg-slate-800/40 flex items-start gap-3">
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1 flex-wrap">
          <p class="font-semibold text-sm text-white">${esc(w.patientName)}</p>
          <span class="status-chip ${pc.cls} text-[10px]">${pc.label}</span>
        </div>
        <p class="text-xs text-slate-400">${esc(w.typeLabel)}</p>
        ${w.patientPhone?`<p class="text-xs text-slate-500 mt-0.5"><i class="fas fa-phone text-[9px] mr-1"></i>${esc(w.patientPhone)}</p>`:''}
        ${w.notes?`<p class="text-xs text-slate-500 mt-1 italic">${esc(w.notes)}</p>`:''}
      </div>
      <div class="flex flex-col gap-1 flex-shrink-0">
        <button class="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors btn-book-wl"
                data-name="${esc(w.patientName)}" data-type="${esc(w.appointmentType)}" data-provider="${esc(w.providerId||'')}">
          Book
        </button>
        <button class="px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs transition-colors btn-remove-wl"
                data-id="${esc(w.id)}">
          Remove
        </button>
      </div>
    </div>`;
  }).join('');

  // Wire buttons
  $$('.btn-book-wl').forEach(b => {
    b.addEventListener('click', () => {
      closeWaitlistModal();
      openBookModal({ providerId: b.dataset.provider });
      setTimeout(() => {
        $('#book-patient-name').value = b.dataset.name;
        const opt = $(`#book-type option[value="${b.dataset.type}"]`);
        if (opt) $('#book-type').value = b.dataset.type;
      }, 100);
    });
  });
  $$('.btn-remove-wl').forEach(b => {
    b.addEventListener('click', async () => {
      try {
        await apiDel(`/api/schedule/waitlist/${b.dataset.id}`);
        await loadWaitlist();
        showToast('Removed from waitlist', 'success');
      } catch(e) { showToast(e.message, 'error'); }
    });
  });
}

function openWaitlistModal()  { $('#modal-waitlist').classList.add('open'); document.body.style.overflow='hidden'; loadWaitlist(); }
function closeWaitlistModal() { $('#modal-waitlist').classList.remove('open'); document.body.style.overflow=''; }

// ─────────────────────────────────────────────────────────────────────────────
// ADD TO WAITLIST (from book modal)
// ─────────────────────────────────────────────────────────────────────────────

async function addToWaitlistFromModal() {
  const name = $('#book-patient-name').value.trim();
  const type = $('#book-type').value;
  if (!name) { showBookError('Patient name is required to add to waitlist'); return; }
  if (!type) { showBookError('Appointment type is required'); return; }

  try {
    await apiPost('/api/schedule/waitlist', {
      patientName:     name,
      patientPhone:    $('#book-patient-phone').value.trim() || undefined,
      providerId:      $('#book-provider').value || undefined,
      appointmentType: type,
      preferredTimes:  ['ANY'],
      priority:        $('#book-urgent').checked ? 'URGENT' : 'NORMAL',
      notes:           $('#book-complaint').value.trim() || undefined,
    });
    closeBookModal();
    showToast(`${name} added to waitlist`, 'success');
    loadWaitlist();
  } catch(e) {
    showBookError(e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEW SWITCHING
// ─────────────────────────────────────────────────────────────────────────────

function switchView(view) {
  SS.view = view;
  $$('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));

  $('#view-week').classList.toggle('hidden',  view !== 'week');
  $('#view-week').classList.toggle('flex',    view === 'week');
  $('#view-day').classList.toggle('hidden',   view !== 'day');
  $('#view-day').classList.toggle('flex',     view === 'day');
  $('#view-list').classList.toggle('hidden',  view !== 'list');

  if (view === 'week') renderWeek();
  if (view === 'day')  { SS.selectedDate = SS.selectedDate || toDateStr(new Date()); renderDayView(SS.selectedDate); }
  if (view === 'list') renderListView();
}

// ─────────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────────

async function init() {
  // Load providers and appointment types for dropdowns
  try {
    const pRes = await apiGet('/api/schedule/providers');
    SS.providers = pRes.data.providers;
    const provSel = $('#book-provider');
    SS.providers.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name;
      provSel.appendChild(opt);
    });

    const tRes = await apiGet('/api/schedule/appointment-types');
    SS.apptTypes = tRes.data;
    const typeSel = $('#book-type');
    SS.apptTypes.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.type; opt.textContent = t.label;
      typeSel.appendChild(opt);
    });
  } catch(e) { console.error('Init load failed:', e); }

  // Set week start to this Monday
  SS.weekStart = getMonday(new Date());
  updateWeekLabel();
  await loadWeek();
  await loadWaitlist();

  // Date navigation
  $('#btn-prev-week').addEventListener('click', async () => {
    SS.weekStart = new Date(SS.weekStart);
    SS.weekStart.setDate(SS.weekStart.getDate() - 7);
    updateWeekLabel(); await loadWeek();
  });
  $('#btn-next-week').addEventListener('click', async () => {
    SS.weekStart = new Date(SS.weekStart);
    SS.weekStart.setDate(SS.weekStart.getDate() + 7);
    updateWeekLabel(); await loadWeek();
  });
  $('#btn-today').addEventListener('click', async () => {
    SS.weekStart = getMonday(new Date());
    updateWeekLabel(); await loadWeek();
    if (SS.view === 'day') { SS.selectedDate = toDateStr(new Date()); renderDayView(SS.selectedDate); }
  });

  // View tabs
  $$('.view-tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));

  // Provider filter
  $$('[data-provider-filter]').forEach(el => {
    el.addEventListener('click', () => {
      SS.providerFilter = el.dataset.providerFilter;
      $$('[data-provider-filter]').forEach(e => e.classList.remove('active'));
      el.classList.add('active');
      if (SS.view === 'week') renderWeek();
      if (SS.view === 'day')  renderDayView(SS.selectedDate);
      if (SS.view === 'list') renderListView();
    });
  });

  // New appointment
  $('#btn-new-appt').addEventListener('click', () => openBookModal());

  // Drawer close
  $('#btn-close-drawer').addEventListener('click', () => $('#appt-drawer').classList.remove('open'));

  // Book modal
  $('#btn-close-book').addEventListener('click', closeBookModal);
  $('#modal-book').addEventListener('click', e => { if (e.target===$('#modal-book')) closeBookModal(); });
  $('#btn-confirm-book').addEventListener('click', confirmBooking);
  $('#btn-add-waitlist').addEventListener('click', addToWaitlistFromModal);

  // Slot loader — on provider or date change
  ['book-provider','book-date'].forEach(id => {
    $(`#${id}`).addEventListener('change', () => {
      clearTimeout(SS.slotDebounce);
      SS.slotDebounce = setTimeout(() => {
        const date = $('#book-date').value;
        const prov = $('#book-provider').value;
        if (date && prov) loadSlots(date, prov);
        else $('#slot-grid').innerHTML = '<p class="text-xs text-slate-600 col-span-7">Select provider and date to see available slots</p>';
      }, 200);
    });
  });

  // Waitlist
  $('#btn-show-waitlist').addEventListener('click', openWaitlistModal);
  $('#btn-close-waitlist').addEventListener('click', closeWaitlistModal);
  $('#btn-close-waitlist-2').addEventListener('click', closeWaitlistModal);
  $('#modal-waitlist').addEventListener('click', e => { if (e.target===$('#modal-waitlist')) closeWaitlistModal(); });

  // ESC key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      $('#modal-book').classList.remove('open');
      $('#modal-waitlist').classList.remove('open');
      $('#appt-drawer').classList.remove('open');
      document.body.style.overflow = '';
    }
    // Keyboard: W=week, D=day, L=list, T=today
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    if (e.key === 'w') switchView('week');
    if (e.key === 'd') { SS.selectedDate = toDateStr(new Date()); switchView('day'); }
    if (e.key === 'l') switchView('list');
    if (e.key === 'n') openBookModal();
  });

  // Auto-refresh now-line every minute
  setInterval(() => {
    document.querySelectorAll('#now-line').forEach(el => el.remove());
    if (SS.view === 'week') renderNowLine();
    if (SS.view === 'day' && SS.selectedDate === toDateStr(new Date())) {
      const grid = $('#day-grid');
      const now  = new Date();
      const top  = minsToTop(now.getHours()*60 + now.getMinutes());
      if (top >= 0 && grid) {
        const line = document.createElement('div');
        line.id = 'now-line';
        line.style.cssText = `position:absolute;left:0;right:0;top:${top}px;height:2px;background:#ef4444;z-index:10;`;
        grid.appendChild(line);
      }
    }
  }, 60000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
