// OculoFlow — Shared Auth Helper  (Phase A1)
// Loaded on every staff page via <script src="/static/auth-nav.js">
// Responsibilities:
//   1. Check for access token; redirect to /login if missing
//   2. Inject current user name/role into nav
//   3. Provide global oFetch() wrapper that attaches Bearer + handles 401

(function () {
  'use strict';

  // ── Token keys (keep in sync with login.js) ──────────────────────────────────
  const TOKEN_KEY   = 'of_access_token';
  const REFRESH_KEY = 'of_refresh_token';
  const USER_KEY    = 'of_user';

  // ── Public helpers ────────────────────────────────────────────────────────────
  window.ofAuth = {
    getToken:   () => sessionStorage.getItem(TOKEN_KEY),
    getUser:    () => {
      try { return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null'); }
      catch { return null; }
    },
    saveTokens: (access, refresh, user) => {
      sessionStorage.setItem(TOKEN_KEY, access);
      localStorage.setItem(REFRESH_KEY, refresh);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    },
    clearTokens: () => {
      sessionStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      localStorage.removeItem(USER_KEY);
    },
    logout: async () => {
      try {
        const token = sessionStorage.getItem(TOKEN_KEY);
        if (token) {
          await fetch('/api/auth/logout', {
            method:  'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          });
        }
      } catch { /* ignore network errors on logout */ }
      window.ofAuth.clearTokens();
      window.location.replace('/login?next=' + encodeURIComponent(window.location.pathname));
    },
  };

  // ── Authenticated fetch wrapper ───────────────────────────────────────────────
  // Usage: const data = await oFetch('/api/patients')
  //        const res  = await oFetch('/api/patients', { method: 'POST', body: JSON.stringify({…}) }, true) // rawResponse
  window.oFetch = async function (url, options = {}, rawResponse = false) {
    const token = sessionStorage.getItem(TOKEN_KEY);

    const headers = Object.assign({
      'Content-Type': 'application/json',
    }, options.headers ?? {});

    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401) {
      // Try to refresh once
      const refreshed = await tryRefresh();
      if (refreshed) {
        const newToken = sessionStorage.getItem(TOKEN_KEY);
        if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
        const retry = await fetch(url, { ...options, headers });
        if (retry.status === 401) {
          window.ofAuth.logout();
          return rawResponse ? retry : null;
        }
        return rawResponse ? retry : retry.json();
      } else {
        window.ofAuth.logout();
        return rawResponse ? res : null;
      }
    }

    return rawResponse ? res : res.json();
  };

  // ── Silent token refresh ──────────────────────────────────────────────────────
  async function tryRefresh() {
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (!refreshToken) return false;
    try {
      const res  = await fetch('/api/auth/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const json = await res.json();
      if (!json.success) return false;
      sessionStorage.setItem(TOKEN_KEY, json.data.accessToken);
      return true;
    } catch {
      return false;
    }
  }

  // ── Gate: redirect to login if not authenticated ──────────────────────────────
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (!token) {
    // Try silent refresh before giving up
    const refreshToken = localStorage.getItem(REFRESH_KEY);
    if (refreshToken) {
      // Must be synchronous redirect; do async check then redirect if needed
      tryRefresh().then(ok => {
        if (!ok) {
          window.ofAuth.clearTokens();
          window.location.replace('/login?next=' + encodeURIComponent(window.location.pathname));
        }
        // If ok, the page will re-render with new token on next oFetch call
      });
    } else {
      window.location.replace('/login?next=' + encodeURIComponent(window.location.pathname));
    }
    // Stop further execution until redirect completes
    return;
  }

  // ── Nav injection ─────────────────────────────────────────────────────────────
  // Runs after DOM is ready
  function injectUserNav() {
    const user = window.ofAuth.getUser();
    if (!user) return;

    const ROLE_COLORS = {
      ADMIN:      'bg-red-500/20 text-red-400',
      PROVIDER:   'bg-blue-500/20 text-blue-400',
      BILLING:    'bg-emerald-500/20 text-emerald-400',
      FRONT_DESK: 'bg-amber-500/20 text-amber-400',
      NURSE:      'bg-teal-500/20 text-teal-400',
      OPTICAL:    'bg-violet-500/20 text-violet-400',
    };

    const initials = (
      (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '')
    ).toUpperCase() || user.displayName?.[0]?.toUpperCase() || '?';

    const roleClass = ROLE_COLORS[user.role] ?? 'bg-slate-500/20 text-slate-400';

    // Find user avatar placeholder elements and replace / enhance them
    // Works across pages with different nav structures
    const avatarEls = document.querySelectorAll('[data-auth-avatar], .user-avatar-placeholder');
    avatarEls.forEach(el => {
      el.textContent = initials;
      el.title = `${user.displayName} — ${user.role}`;
    });

    // Inject logout button into nav right-side action groups
    // Look for a <div> that contains the user avatar element, then append logout btn
    const navActionGroups = document.querySelectorAll('[data-nav-actions], .nav-actions');
    navActionGroups.forEach(group => {
      if (group.querySelector('[data-logout-btn]')) return; // already injected

      const roleChip = document.createElement('span');
      roleChip.className = `hidden sm:inline-flex text-xs font-semibold px-2 py-0.5 rounded-lg ${roleClass}`;
      roleChip.textContent = user.role.replace('_', ' ');

      const logoutBtn = document.createElement('button');
      logoutBtn.setAttribute('data-logout-btn', '');
      logoutBtn.className = 'w-8 h-8 rounded-lg bg-slate-700/50 hover:bg-red-900/40 flex items-center justify-center text-slate-400 hover:text-red-400 transition-colors';
      logoutBtn.title = 'Sign out';
      logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt text-xs"></i>';
      logoutBtn.addEventListener('click', () => window.ofAuth.logout());

      group.appendChild(roleChip);
      group.appendChild(logoutBtn);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectUserNav);
  } else {
    injectUserNav();
  }

})();
