// OculoFlow — Staff Login  (Phase A1)
// Handles login form, token storage, demo credentials panel

(function () {
  'use strict';

  // ── Token storage ────────────────────────────────────────────────────────────
  const TOKEN_KEY   = 'of_access_token';
  const REFRESH_KEY = 'of_refresh_token';
  const USER_KEY    = 'of_user';

  function saveTokens(accessToken, refreshToken, user) {
    sessionStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(REFRESH_KEY, refreshToken);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  // ── Redirect target ──────────────────────────────────────────────────────────
  function getRedirectTarget() {
    const params = new URLSearchParams(window.location.search);
    const next   = params.get('next');
    // Whitelist internal paths only
    if (next && next.startsWith('/') && !next.startsWith('//')) return next;
    return '/dashboard';
  }

  // ── If already logged in, skip to target ────────────────────────────────────
  const existingToken = sessionStorage.getItem(TOKEN_KEY);
  if (existingToken) {
    window.location.replace(getRedirectTarget());
    // stop executing
  }

  // ── DOM refs ─────────────────────────────────────────────────────────────────
  const form        = document.getElementById('loginForm');
  const emailInput  = document.getElementById('email');
  const pwdInput    = document.getElementById('password');
  const submitBtn   = document.getElementById('submitBtn');
  const submitIcon  = document.getElementById('submitIcon');
  const submitLabel = document.getElementById('submitLabel');
  const errorBanner = document.getElementById('errorBanner');
  const errorMsg    = document.getElementById('errorMsg');
  const togglePwd   = document.getElementById('togglePwd');
  const toggleIcon  = document.getElementById('togglePwdIcon');
  const demoPanel   = document.getElementById('demoPanel');
  const credList    = document.getElementById('credList');

  // ── Password visibility toggle ───────────────────────────────────────────────
  togglePwd.addEventListener('click', () => {
    const isText = pwdInput.type === 'text';
    pwdInput.type = isText ? 'password' : 'text';
    toggleIcon.className = isText ? 'fas fa-eye' : 'fas fa-eye-slash';
  });

  // ── Show error ───────────────────────────────────────────────────────────────
  function showError(msg) {
    errorMsg.textContent = msg;
    errorBanner.classList.remove('hidden');
    form.classList.add('shake');
    setTimeout(() => form.classList.remove('shake'), 500);
  }

  function hideError() {
    errorBanner.classList.add('hidden');
  }

  // ── Loading state ─────────────────────────────────────────────────────────────
  function setLoading(loading) {
    submitBtn.disabled = loading;
    submitIcon.className = loading ? 'fas fa-spinner fa-spin' : 'fas fa-sign-in-alt';
    submitLabel.textContent = loading ? 'Signing in…' : 'Sign in';
  }

  // ── Submit handler ───────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const email    = emailInput.value.trim();
    const password = pwdInput.value;

    if (!email || !password) {
      showError('Please enter your email and password.');
      return;
    }

    setLoading(true);

    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        showError(json.error ?? 'Invalid email or password.');
        setLoading(false);
        return;
      }

      const { accessToken, refreshToken, user } = json.data;
      saveTokens(accessToken, refreshToken, user);
      window.location.replace(getRedirectTarget());

    } catch (err) {
      console.error('Login error:', err);
      showError('Network error — please try again.');
      setLoading(false);
    }
  });

  // ── Demo credentials panel ───────────────────────────────────────────────────
  const ROLE_COLORS = {
    ADMIN:      'bg-red-500/20 text-red-400',
    PROVIDER:   'bg-blue-500/20 text-blue-400',
    BILLING:    'bg-emerald-500/20 text-emerald-400',
    FRONT_DESK: 'bg-amber-500/20 text-amber-400',
    NURSE:      'bg-teal-500/20 text-teal-400',
    OPTICAL:    'bg-violet-500/20 text-violet-400',
  };

  async function loadDemoCredentials() {
    try {
      const res  = await fetch('/api/auth/demo-credentials');
      if (!res.ok) return; // not demo mode
      const json = await res.json();
      if (!json.success || !json.data?.length) return;

      demoPanel.classList.remove('hidden');

      json.data.forEach((cred) => {
        const roleClass = ROLE_COLORS[cred.role] ?? 'bg-slate-500/20 text-slate-400';
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'w-full flex items-center justify-between bg-slate-800/60 hover:bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-left transition-colors group';
        row.innerHTML = `
          <div class="min-w-0">
            <p class="text-sm font-medium text-white truncate">${escHtml(cred.name)}</p>
            <p class="text-xs text-slate-400 truncate">${escHtml(cred.email)}</p>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0 ml-3">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-lg ${roleClass}">${escHtml(cred.role)}</span>
            <i class="fas fa-arrow-right text-xs text-slate-600 group-hover:text-slate-400 transition-colors"></i>
          </div>
        `;
        row.addEventListener('click', () => {
          emailInput.value    = cred.email;
          pwdInput.value      = cred.password;
          hideError();
          emailInput.focus();
        });
        credList.appendChild(row);
      });

    } catch {
      // silently ignore — not demo mode or network issue
    }
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  loadDemoCredentials();

})();
