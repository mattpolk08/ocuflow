// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Admin Module Controller  (Phase C1)
// public/static/admin.js
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const API = '/api/admin';

// ── Auth helpers ──────────────────────────────────────────────────────────────
function _authHdr(extra = {}) {
  const tok = sessionStorage.getItem('of_access_token');
  const h = { 'Content-Type': 'application/json', ...extra };
  if (tok) h['Authorization'] = `Bearer ${tok}`;
  return h;
}
async function apiGet(path) {
  const r = await fetch(API + path, { headers: _authHdr() });
  if (r.status === 401) { sessionStorage.clear(); location.href = '/login'; return null; }
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: _authHdr(), body: JSON.stringify(body) });
  if (r.status === 401) { sessionStorage.clear(); location.href = '/login'; return null; }
  return r.json();
}
async function apiPut(path, body) {
  const r = await fetch(API + path, { method: 'PUT', headers: _authHdr(), body: JSON.stringify(body) });
  if (r.status === 401) { sessionStorage.clear(); location.href = '/login'; return null; }
  return r.json();
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  const icon  = document.getElementById('toast-icon');
  const msgEl = document.getElementById('toast-msg');
  msgEl.textContent = msg;
  icon.className = isError
    ? 'fas fa-circle-xmark text-red-400'
    : 'fas fa-check-circle text-emerald-400';
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

// ── Tab navigation ────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.sidebar-tab').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('tab-' + name);
  if (el) el.classList.remove('hidden');
  if (btn) btn.classList.add('active');

  // Lazy-load tab data
  if (name === 'overview')  loadOverview();
  if (name === 'practice')  loadSettings();
  if (name === 'locations') loadLocations();
  if (name === 'users')     loadUsers();
  if (name === 'modules')   loadModules();
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW
// ─────────────────────────────────────────────────────────────────────────────
async function loadOverview() {
  try {
    const res = await apiGet('/dashboard');
    if (!res?.success) return;
    const d = res.data;
    const el = id => document.getElementById(id);
    el('ov-practice-name').textContent = d.practiceName || '—';
    el('ov-locations').textContent = `${d.locations.active}/${d.locations.total}`;
    el('ov-users').textContent = d.users.active;
    el('ov-modules').textContent = `${d.modules.enabled}/${d.modules.total}`;
  } catch (e) {
    console.error('Overview load error', e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PRACTICE SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
let _settings = {};

async function loadSettings() {
  try {
    const res = await apiGet('/settings');
    if (!res?.success) return;
    _settings = res.data;
    Object.entries(_settings).forEach(([key, value]) => {
      const el = document.getElementById('s-' + key);
      if (el) el.value = value;
    });
  } catch (e) {
    showToast('Failed to load settings', true);
  }
}

async function saveSettings() {
  const form = {};
  document.querySelectorAll('[id^="s-"]').forEach(el => {
    const key = el.id.replace('s-', '');
    form[key] = el.value;
  });

  try {
    const res = await apiPut('/settings', form);
    if (res?.success) {
      showToast(`Saved ${res.updated} settings`);
    } else {
      showToast(res?.error || 'Save failed', true);
    }
  } catch (e) {
    showToast('Save failed', true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCATIONS
// ─────────────────────────────────────────────────────────────────────────────
let _locations = [];

async function loadLocations() {
  const container = document.getElementById('locations-list');
  try {
    const res = await apiGet('/locations');
    if (!res?.success) { container.innerHTML = '<p class="text-slate-500 text-sm text-center py-6">Failed to load locations</p>'; return; }
    _locations = res.data || [];
    renderLocations();
  } catch (e) {
    container.innerHTML = '<p class="text-slate-500 text-sm text-center py-6">Error loading locations</p>';
  }
}

function renderLocations() {
  const container = document.getElementById('locations-list');
  if (_locations.length === 0) {
    container.innerHTML = '<div class="card-sm text-center text-slate-500 text-sm py-8"><i class="fas fa-location-dot text-3xl mb-3 text-slate-700"></i><br>No locations yet. Click "Add Location" to create one.</div>';
    return;
  }

  container.innerHTML = _locations.map(loc => `
    <div class="card-sm flex items-start gap-4">
      <div class="w-10 h-10 rounded-xl ${loc.is_active ? 'bg-blue-500/20' : 'bg-slate-700/40'} flex items-center justify-center flex-shrink-0 mt-0.5">
        <i class="fas fa-location-dot ${loc.is_active ? 'text-blue-400' : 'text-slate-600'}"></i>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 mb-1">
          <span class="font-semibold text-white text-sm">${esc(loc.name)}</span>
          <span class="text-xs px-2 py-0.5 rounded-full font-semibold ${loc.is_active ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-700 text-slate-500'}">${loc.is_active ? 'Active' : 'Inactive'}</span>
        </div>
        <p class="text-xs text-slate-400">${[loc.address, loc.city, loc.state, loc.zip].filter(Boolean).join(', ') || '—'}</p>
        <p class="text-xs text-slate-500 mt-0.5">${[loc.phone, loc.fax ? 'Fax: ' + loc.fax : ''].filter(Boolean).join(' · ') || '—'}</p>
      </div>
      <div class="flex gap-2 flex-shrink-0">
        <button class="btn-secondary text-xs px-3 py-1.5" onclick="editLocation('${esc(loc.id)}')">
          <i class="fas fa-pencil"></i> Edit
        </button>
        <button class="${loc.is_active ? 'btn-danger' : 'btn-success'} text-xs px-3 py-1.5" onclick="toggleLocation('${esc(loc.id)}', ${!loc.is_active})">
          ${loc.is_active ? '<i class="fas fa-ban"></i> Deactivate' : '<i class="fas fa-check"></i> Activate'}
        </button>
      </div>
    </div>
  `).join('');
}

function openAddLocation() {
  document.getElementById('loc-modal-title').textContent = 'Add Location';
  document.getElementById('loc-edit-id').value = '';
  ['name','address','city','state','zip','phone','fax'].forEach(f => {
    document.getElementById('loc-' + f).value = '';
  });
  document.getElementById('location-modal').classList.remove('hidden');
}

function editLocation(id) {
  const loc = _locations.find(l => l.id === id);
  if (!loc) return;
  document.getElementById('loc-modal-title').textContent = 'Edit Location';
  document.getElementById('loc-edit-id').value = id;
  document.getElementById('loc-name').value    = loc.name || '';
  document.getElementById('loc-address').value = loc.address || '';
  document.getElementById('loc-city').value    = loc.city || '';
  document.getElementById('loc-state').value   = loc.state || '';
  document.getElementById('loc-zip').value     = loc.zip || '';
  document.getElementById('loc-phone').value   = loc.phone || '';
  document.getElementById('loc-fax').value     = loc.fax || '';
  document.getElementById('location-modal').classList.remove('hidden');
}

function closeLocationModal() {
  document.getElementById('location-modal').classList.add('hidden');
}

async function saveLocation() {
  const editId = document.getElementById('loc-edit-id').value;
  const body = {
    name:    document.getElementById('loc-name').value.trim(),
    address: document.getElementById('loc-address').value.trim(),
    city:    document.getElementById('loc-city').value.trim(),
    state:   document.getElementById('loc-state').value.trim(),
    zip:     document.getElementById('loc-zip').value.trim(),
    phone:   document.getElementById('loc-phone').value.trim(),
    fax:     document.getElementById('loc-fax').value.trim(),
  };
  if (!body.name) { showToast('Location name is required', true); return; }

  try {
    const res = editId
      ? await apiPut(`/locations/${editId}`, body)
      : await apiPost('/locations', body);

    if (res?.success) {
      showToast(editId ? 'Location updated' : 'Location created');
      closeLocationModal();
      loadLocations();
    } else {
      showToast(res?.error || 'Save failed', true);
    }
  } catch (e) {
    showToast('Save failed', true);
  }
}

async function toggleLocation(id, activate) {
  try {
    const res = await apiPut(`/locations/${id}`, { is_active: activate });
    if (res?.success) {
      showToast(activate ? 'Location activated' : 'Location deactivated');
      loadLocations();
    } else {
      showToast(res?.error || 'Failed', true);
    }
  } catch (e) {
    showToast('Failed', true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────
let _users = [];

async function loadUsers() {
  const tbody = document.getElementById('users-tbody');
  try {
    const res = await apiGet('/users');
    if (!res?.success) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-8">Failed to load users</td></tr>'; return; }
    _users = res.data || [];
    renderUsers();
  } catch (e) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-red-400 py-8">Error loading users</td></tr>';
  }
}

function renderUsers() {
  const tbody = document.getElementById('users-tbody');
  if (_users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-500 py-8">No users found</td></tr>';
    return;
  }
  tbody.innerHTML = _users.map(u => `
    <tr>
      <td>
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            ${(u.displayName || '?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
          </div>
          <span class="font-medium text-white">${esc(u.displayName || '—')}</span>
        </div>
      </td>
      <td class="text-slate-400">${esc(u.email || '—')}</td>
      <td><span class="role-badge role-${u.role || 'FRONT_DESK'}">${u.role || '—'}</span></td>
      <td>
        <div class="flex items-center gap-1.5">
          <div class="status-dot ${u.isActive !== false ? 'active' : 'inactive'}"></div>
          <span class="text-xs ${u.isActive !== false ? 'text-emerald-400' : 'text-red-400'}">${u.isActive !== false ? 'Active' : 'Inactive'}</span>
        </div>
      </td>
      <td>
        <div class="flex gap-2">
          <button class="btn-secondary text-xs px-2 py-1" onclick="editUser('${esc(u.id)}')">
            <i class="fas fa-pencil"></i> Edit
          </button>
          <button class="${u.isActive !== false ? 'btn-danger' : 'btn-success'} text-xs px-2 py-1"
                  onclick="toggleUser('${esc(u.id)}', ${u.isActive === false})">
            ${u.isActive !== false ? '<i class="fas fa-ban"></i> Deactivate' : '<i class="fas fa-check"></i> Activate'}
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function openAddUser() {
  document.getElementById('user-modal-title').textContent = 'Add Staff User';
  document.getElementById('u-edit-id').value = '';
  ['name','email','password'].forEach(f => document.getElementById('u-' + f).value = '');
  document.getElementById('u-role').value = 'FRONT_DESK';
  document.getElementById('user-modal').classList.remove('hidden');
}

function editUser(id) {
  const u = _users.find(x => x.id === id);
  if (!u) return;
  document.getElementById('user-modal-title').textContent = 'Edit User';
  document.getElementById('u-edit-id').value = id;
  document.getElementById('u-name').value    = u.displayName || '';
  document.getElementById('u-email').value   = u.email || '';
  document.getElementById('u-role').value    = u.role || 'FRONT_DESK';
  document.getElementById('u-password').value = '';
  document.getElementById('user-modal').classList.remove('hidden');
}

function closeUserModal() {
  document.getElementById('user-modal').classList.add('hidden');
}

async function saveUser() {
  const editId = document.getElementById('u-edit-id').value;
  const name   = document.getElementById('u-name').value.trim();
  const email  = document.getElementById('u-email').value.trim();
  const role   = document.getElementById('u-role').value;
  const pwd    = document.getElementById('u-password').value.trim();

  if (!name || !email) { showToast('Name and email are required', true); return; }

  try {
    const body = { displayName: name, email, role };
    if (pwd) body.password = pwd;

    const res = editId
      ? await apiPut(`/users/${editId}`, { role, displayName: name })
      : await apiPost('/users', body);

    if (res?.success) {
      showToast(editId ? 'User updated' : 'User created');
      closeUserModal();
      loadUsers();
    } else {
      showToast(res?.error || 'Save failed', true);
    }
  } catch (e) {
    showToast('Save failed', true);
  }
}

async function toggleUser(id, activate) {
  try {
    const res = await apiPut(`/users/${id}`, { is_active: activate });
    if (res?.success) {
      showToast(activate ? 'User activated' : 'User deactivated');
      loadUsers();
    } else {
      showToast(res?.error || 'Failed', true);
    }
  } catch (e) {
    showToast('Failed', true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULE SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
let _modules = [];

const MODULE_ICONS = {
  dashboard: 'fa-gauge-high', patients: 'fa-users', scheduling: 'fa-calendar-check',
  exam: 'fa-stethoscope', billing: 'fa-file-invoice-dollar', optical: 'fa-glasses',
  reports: 'fa-chart-bar', portal: 'fa-user-shield', messaging: 'fa-comments',
  reminders: 'fa-bell', scorecards: 'fa-star', telehealth: 'fa-video',
  erx: 'fa-prescription-bottle', ai: 'fa-robot', priorauth: 'fa-clipboard-check',
  rcm: 'fa-circle-dollar-to-slot', engagement: 'fa-heart', analytics: 'fa-chart-line',
  audit: 'fa-shield-halved', documents: 'fa-file-lines', mfa: 'fa-lock',
};

const CORE_MODULES = new Set(['dashboard', 'patients', 'scheduling', 'exam']);

async function loadModules() {
  const grid = document.getElementById('modules-grid');
  try {
    const res = await apiGet('/modules');
    if (!res?.success || !res.data?.length) {
      grid.innerHTML = '<div class="card-sm text-center text-slate-500 col-span-3 py-8">Module settings not yet initialized. Apply migration 0017 first.</div>';
      return;
    }
    _modules = res.data;
    renderModules();
  } catch (e) {
    grid.innerHTML = '<div class="card-sm text-center text-red-400 col-span-3 py-8">Failed to load modules</div>';
  }
}

function renderModules() {
  const grid = document.getElementById('modules-grid');
  const categories = {
    core: 'Core', clinical: 'Clinical', billing: 'Billing', reporting: 'Reporting',
    patient: 'Patient-Facing', admin: 'Admin',
  };

  // Group by category
  const grouped = {};
  _modules.forEach(m => {
    const cat = m.category || 'clinical';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(m);
  });

  let html = '';
  for (const [cat, label] of Object.entries(categories)) {
    const mods = grouped[cat] || [];
    if (!mods.length) continue;
    mods.forEach(m => {
      const isCore = CORE_MODULES.has(m.module_id);
      const icon = MODULE_ICONS[m.module_id] || 'fa-puzzle-piece';
      html += `
        <div class="card-sm flex items-center gap-3" id="mod-card-${m.module_id}">
          <div class="w-9 h-9 rounded-xl ${m.is_enabled ? 'bg-blue-500/20' : 'bg-slate-700/40'} flex items-center justify-center flex-shrink-0">
            <i class="fas ${icon} ${m.is_enabled ? 'text-blue-400' : 'text-slate-600'} text-sm"></i>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-white truncate">${esc(m.label)}</p>
            <span class="cat-pill cat-${m.category || 'clinical'} text-[10px]">${label}</span>
            ${isCore ? ' <span class="text-[10px] text-amber-400 font-semibold ml-1"><i class="fas fa-lock text-[8px]"></i> Core</span>' : ''}
          </div>
          <div class="toggle-track ${m.is_enabled ? 'on' : ''} flex-shrink-0"
               id="toggle-${m.module_id}"
               ${isCore ? 'title="Core modules cannot be disabled"' : `onclick="toggleModule('${m.module_id}', ${!m.is_enabled})"`}
               style="${isCore ? 'opacity:0.5;cursor:not-allowed' : 'cursor:pointer'}">
            <div class="toggle-thumb"></div>
          </div>
        </div>
      `;
    });
  }
  grid.innerHTML = html;
}

async function toggleModule(moduleId, enable) {
  if (CORE_MODULES.has(moduleId)) { showToast('Core modules cannot be disabled', true); return; }
  try {
    const res = await apiPut(`/modules/${moduleId}`, { is_enabled: enable });
    if (res?.success) {
      const m = _modules.find(x => x.module_id === moduleId);
      if (m) m.is_enabled = enable ? 1 : 0;
      // Update toggle UI
      const track = document.getElementById('toggle-' + moduleId);
      const card  = document.getElementById('mod-card-' + moduleId);
      if (track) track.className = `toggle-track ${enable ? 'on' : ''} flex-shrink-0`;
      showToast(`${moduleId} ${enable ? 'enabled' : 'disabled'}`);
    } else {
      showToast(res?.error || 'Failed', true);
    }
  } catch (e) {
    showToast('Failed to toggle module', true);
  }
}

async function setAllModules(enable) {
  const optional = _modules.filter(m => !CORE_MODULES.has(m.module_id));
  for (const m of optional) {
    await apiPut(`/modules/${m.module_id}`, { is_enabled: enable });
    m.is_enabled = enable ? 1 : 0;
  }
  renderModules();
  showToast(`${optional.length} modules ${enable ? 'enabled' : 'disabled'}`);
}

// ── Escape HTML ───────────────────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Initialize ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Redirect if not logged in
  const tok = sessionStorage.getItem('of_access_token');
  if (!tok) { location.href = '/login'; return; }

  // Check ADMIN role
  try {
    const user = JSON.parse(localStorage.getItem('of_user') || '{}');
    if (user.role && user.role !== 'ADMIN') {
      showToast('Admin access requires ADMIN role', true);
    }
  } catch {}

  loadOverview();
});
