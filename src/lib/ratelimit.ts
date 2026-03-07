// Phase A2 — Rate Limiting & Login Lockout
// Uses KV sliding-window counters.
//
// Login lockout:  max 5 failed attempts per email in 15 minutes → 15-min lockout
// API rate limit: max 300 requests per IP in 1 minute (generous for legitimate use)

// ─── KV helpers ──────────────────────────────────────────────────────────────
async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key, 'text');
  return v ? JSON.parse(v) as T : null;
}
// KV minimum TTL is 60 seconds — always enforce this
const KV_MIN_TTL = 60;
async function kvPut(kv: KVNamespace, key: string, val: unknown, ttl: number): Promise<void> {
  await kv.put(key, JSON.stringify(val), { expirationTtl: Math.max(ttl, KV_MIN_TTL) });
}

// ─── Login lockout ────────────────────────────────────────────────────────────
const LOGIN_WINDOW_SEC  = 15 * 60;  // 15-minute window
const LOGIN_MAX_FAILS   = 5;        // attempts before lockout
const LOCKOUT_SEC       = 15 * 60;  // 15-minute lockout duration

interface LoginAttempts {
  count: number;
  lockedUntil?: number;  // unix timestamp (ms)
}

function loginKey(email: string) {
  return `ratelimit:login:${email.toLowerCase()}`;
}

export async function checkLoginAllowed(
  kv: KVNamespace,
  email: string
): Promise<{ allowed: boolean; remainingSeconds?: number }> {
  const data = await kvGet<LoginAttempts>(kv, loginKey(email));
  if (!data) return { allowed: true };

  if (data.lockedUntil && Date.now() < data.lockedUntil) {
    const remaining = Math.ceil((data.lockedUntil - Date.now()) / 1000);
    return { allowed: false, remainingSeconds: remaining };
  }
  return { allowed: true };
}

export async function recordLoginFailure(kv: KVNamespace, email: string): Promise<{ locked: boolean }> {
  const key  = loginKey(email);
  const data = (await kvGet<LoginAttempts>(kv, key)) ?? { count: 0 };

  // Clear expired lockout
  if (data.lockedUntil && Date.now() >= data.lockedUntil) {
    data.count = 0;
    data.lockedUntil = undefined;
  }

  data.count++;

  if (data.count >= LOGIN_MAX_FAILS) {
    data.lockedUntil = Date.now() + LOCKOUT_SEC * 1000;
    await kvPut(kv, key, data, LOCKOUT_SEC + 60);
    return { locked: true };
  }

  await kvPut(kv, key, data, LOGIN_WINDOW_SEC);
  return { locked: false };
}

export async function clearLoginFailures(kv: KVNamespace, email: string): Promise<void> {
  await kv.delete(loginKey(email));
}

// ─── API rate limiting (per-IP sliding window) ────────────────────────────────
const API_WINDOW_SEC  = 60;   // 1-minute window
const API_MAX_REQ     = 300;  // requests per window per IP

interface RateWindow {
  count: number;
  windowStart: number;  // unix timestamp ms
}

function rateLimitKey(ip: string) {
  return `ratelimit:api:${ip}`;
}

export async function checkApiRateLimit(
  kv: KVNamespace,
  ip: string
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const key  = rateLimitKey(ip);
  const now  = Date.now();
  const data = await kvGet<RateWindow>(kv, key);

  if (!data || now - data.windowStart > API_WINDOW_SEC * 1000) {
    // Start new window
    await kvPut(kv, key, { count: 1, windowStart: now }, API_WINDOW_SEC + 5);
    return { allowed: true, remaining: API_MAX_REQ - 1, resetIn: API_WINDOW_SEC };
  }

  const elapsed   = now - data.windowStart;
  const resetIn   = Math.ceil((API_WINDOW_SEC * 1000 - elapsed) / 1000);

  if (data.count >= API_MAX_REQ) {
    return { allowed: false, remaining: 0, resetIn };
  }

  data.count++;
  await kvPut(kv, key, data, Math.ceil(resetIn) + 5);
  return { allowed: true, remaining: API_MAX_REQ - data.count, resetIn };
}
