// Phase A1 – Authentication library (D1-backed)
// staff_users  → D1 (persistent, queryable)
// auth_sessions → D1 (persistent, queryable)
// revoked JTIs → KV (ephemeral TTL — intentionally stays KV)
// KV is still accepted by all public functions for backward-compat
// but user/session reads & writes go to D1 first.

import type {
  StaffUser, StaffUserPublic, JWTPayload, AuthSession,
  LoginResponse, AuthContext, StaffRole,
} from '../types/auth';
import { dbGet, dbAll, dbRun, now as dbNow } from './db';

// ─── KV helpers (revoked-token store only) ────────────────────────────────────
async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key, 'text');
  return v ? JSON.parse(v) as T : null;
}
async function kvPut(kv: KVNamespace, key: string, val: unknown, opts?: KVNamespacePutOptions): Promise<void> {
  await kv.put(key, JSON.stringify(val), opts);
}

// ─── KV key constants (revocation only) ──────────────────────────────────────
const revokedKey = (jti: string) => `auth:revoked:${jti}`;

// ─── JWT config ───────────────────────────────────────────────────────────────
const ACCESS_TOKEN_TTL  = 8 * 60 * 60;       // 8 hours in seconds
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

// ─── Password hashing (PBKDF2 via Web Crypto) ─────────────────────────────────
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split(':');
    if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;
    const salt = new Uint8Array(parts[1].match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const keyMaterial = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
      keyMaterial, 256
    );
    const hashHex = Array.from(new Uint8Array(derived)).map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex === parts[2];
  } catch {
    return false;
  }
}

// ─── JWT (HS256 via Web Crypto HMAC) ─────────────────────────────────────────
function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  return new Uint8Array([...atob(padded)].map(c => c.charCodeAt(0)));
}
async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']
  );
}

export async function signJWT(payload: Omit<JWTPayload, 'iat' | 'exp' | 'jti'>, secret: string, ttl: number): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const jti = crypto.randomUUID();
  const full: JWTPayload = { ...payload, iat: now, exp: now + ttl, jti };
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body   = b64url(new TextEncoder().encode(JSON.stringify(full)));
  const key    = await getHmacKey(secret);
  const sig    = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${header}.${body}`));
  return `${header}.${body}.${b64url(sig)}`;
}

export async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const key = await getHmacKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC', key, b64urlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1]))) as JWTPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getJwtSecret(env: { JWT_SECRET?: string }): string {
  return env.JWT_SECRET ?? 'oculoflow-dev-secret-change-in-production-min-32-chars';
}

// ─── Row mapper ───────────────────────────────────────────────────────────────
function rowToUser(r: Record<string, unknown>): StaffUser {
  return {
    id:           r.id as string,
    email:        r.email as string,
    passwordHash: r.password_hash as string,
    firstName:    r.first_name as string,
    lastName:     r.last_name as string,
    displayName:  (r.display_name ?? `${r.first_name} ${r.last_name}`) as string,
    role:         r.role as StaffRole,
    providerId:   r.provider_id as string | undefined,
    isActive:     Boolean(r.is_active ?? 1),
    lastLoginAt:  r.last_login_at as string | undefined,
    createdAt:    r.created_at as string,
    updatedAt:    r.updated_at as string,
  };
}

// ─── Token pair generation ────────────────────────────────────────────────────
export async function issueTokenPair(
  user: StaffUser,
  secret: string,
  kv: KVNamespace,
  meta?: { userAgent?: string; ipAddress?: string },
  db?: D1Database
): Promise<LoginResponse> {
  const base = {
    sub: user.id, email: user.email, role: user.role,
    displayName: user.displayName, providerId: user.providerId,
  };
  const accessToken  = await signJWT({ ...base, type: 'ACCESS' },  secret, ACCESS_TOKEN_TTL);
  const refreshToken = await signJWT({ ...base, type: 'REFRESH' }, secret, REFRESH_TOKEN_TTL);

  const refreshPayload = await verifyJWT(refreshToken, secret);
  if (refreshPayload && db) {
    const exp = new Date(refreshPayload.exp * 1000).toISOString();
    const ts  = dbNow();
    // Upsert session in D1 — one active session per user
    await dbRun(db,
      `INSERT INTO auth_sessions (id, user_id, issued_at, expires_at, user_agent, ip_address)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at`,
      [refreshPayload.jti, user.id, ts, exp,
       meta?.userAgent ?? null, meta?.ipAddress ?? null]
    );
    // Update lastLoginAt in staff_users
    await dbRun(db,
      `UPDATE staff_users SET last_login_at=?, updated_at=? WHERE id=?`,
      [ts, ts, user.id]
    );
  }

  return {
    accessToken, refreshToken, expiresIn: ACCESS_TOKEN_TTL,
    user: toPublic(user),
  };
}

// ─── Token revocation (stays KV — ephemeral TTL) ──────────────────────────────
export async function revokeToken(kv: KVNamespace, jti: string, ttl: number): Promise<void> {
  await kvPut(kv, revokedKey(jti), true, { expirationTtl: ttl + 60 });
}
export async function isRevoked(kv: KVNamespace, jti: string): Promise<boolean> {
  return (await kv.get(revokedKey(jti))) !== null;
}

// ─── Session management ───────────────────────────────────────────────────────
export async function getSession(kv: KVNamespace, userId: string, db?: D1Database): Promise<AuthSession | null> {
  if (db) {
    const row = await dbGet<Record<string, unknown>>(db,
      `SELECT * FROM auth_sessions
       WHERE user_id=? AND revoked_at IS NULL AND expires_at > datetime('now')
       ORDER BY issued_at DESC LIMIT 1`,
      [userId]
    );
    if (!row) return null;
    return {
      userId:         row.user_id as string,
      refreshTokenId: row.id as string,
      issuedAt:       row.issued_at as string,
      expiresAt:      row.expires_at as string,
      userAgent:      row.user_agent as string | undefined,
      ipAddress:      row.ip_address as string | undefined,
    };
  }
  return null;
}

export async function invalidateSession(kv: KVNamespace, userId: string, db?: D1Database): Promise<void> {
  if (db) {
    // Revoke all active sessions for user in D1
    const sessions = await dbAll<Record<string, unknown>>(db,
      `SELECT id FROM auth_sessions WHERE user_id=? AND revoked_at IS NULL`, [userId]
    );
    const ts = dbNow();
    for (const s of sessions) {
      await dbRun(db, `UPDATE auth_sessions SET revoked_at=? WHERE id=?`, [ts, s.id]);
      // Also put in KV revocation list so in-flight tokens are instantly blocked
      await revokeToken(kv, s.id as string, REFRESH_TOKEN_TTL);
    }
  }
}

// ─── User CRUD (D1) ──────────────────────────────────────────────────────────
export async function getUserById(kv: KVNamespace, id: string, db?: D1Database): Promise<StaffUser | null> {
  if (db) {
    const row = await dbGet<Record<string, unknown>>(db,
      `SELECT * FROM staff_users WHERE id=?`, [id]
    );
    return row ? rowToUser(row) : null;
  }
  return null;
}

export async function getUserByEmail(kv: KVNamespace, email: string, db?: D1Database): Promise<StaffUser | null> {
  if (db) {
    const row = await dbGet<Record<string, unknown>>(db,
      `SELECT * FROM staff_users WHERE lower(email)=lower(?)`, [email]
    );
    return row ? rowToUser(row) : null;
  }
  return null;
}

export async function listUsers(kv: KVNamespace, db?: D1Database): Promise<StaffUserPublic[]> {
  await seedStaffUsers(kv, db);
  if (db) {
    const rows = await dbAll<Record<string, unknown>>(db,
      `SELECT * FROM staff_users ORDER BY created_at ASC`
    );
    return rows.map(r => toPublic(rowToUser(r)));
  }
  return [];
}

export async function createUser(
  kv: KVNamespace,
  data: { email: string; password: string; firstName: string; lastName: string; role: StaffRole; providerId?: string },
  db?: D1Database
): Promise<StaffUser> {
  const existing = await getUserByEmail(kv, data.email, db);
  if (existing) throw new Error('Email already in use');

  const ts = dbNow();
  const id = `usr-${Date.now().toString(36)}`;
  const passwordHash = await hashPassword(data.password);
  const displayName  = `${data.firstName} ${data.lastName}`;

  if (db) {
    await dbRun(db,
      `INSERT INTO staff_users
         (id, organization_id, email, password_hash, first_name, last_name, display_name, role, provider_id, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`,
      [id, 'org-001', data.email.toLowerCase(), passwordHash,
       data.firstName, data.lastName, displayName, data.role,
       data.providerId ?? null, ts, ts]
    );
  }

  return {
    id, email: data.email.toLowerCase(), passwordHash,
    firstName: data.firstName, lastName: data.lastName,
    displayName, role: data.role,
    providerId: data.providerId,
    isActive: true, createdAt: ts, updatedAt: ts,
  };
}

export async function updateUserPassword(kv: KVNamespace, userId: string, newPassword: string, db?: D1Database): Promise<boolean> {
  const ts = dbNow();
  const hash = await hashPassword(newPassword);
  if (db) {
    await dbRun(db,
      `UPDATE staff_users SET password_hash=?, updated_at=? WHERE id=?`,
      [hash, ts, userId]
    );
    return true;
  }
  return false;
}

export async function setUserActive(kv: KVNamespace, userId: string, isActive: boolean, db?: D1Database): Promise<boolean> {
  const ts = dbNow();
  if (db) {
    await dbRun(db,
      `UPDATE staff_users SET is_active=?, updated_at=? WHERE id=?`,
      [isActive ? 1 : 0, ts, userId]
    );
    return true;
  }
  return false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function toPublic(user: StaffUser): StaffUserPublic {
  const { passwordHash: _, ...pub } = user;
  return pub;
}

export function extractAuthContext(payload: JWTPayload): AuthContext {
  return {
    userId:      payload.sub,
    email:       payload.email,
    role:        payload.role,
    displayName: payload.displayName,
    providerId:  payload.providerId,
    tokenId:     payload.jti,
  };
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function login(
  kv: KVNamespace,
  email: string,
  password: string,
  secret: string,
  meta?: { userAgent?: string; ipAddress?: string },
  db?: D1Database
): Promise<LoginResponse | null> {
  await seedStaffUsers(kv, db);
  const user = await getUserByEmail(kv, email, db);
  if (!user || !user.isActive) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;
  return issueTokenPair(user, secret, kv, meta, db);
}

// ─── Refresh ──────────────────────────────────────────────────────────────────
export async function refreshAccessToken(
  kv: KVNamespace,
  refreshToken: string,
  secret: string,
  db?: D1Database
): Promise<{ accessToken: string; expiresIn: number } | null> {
  const payload = await verifyJWT(refreshToken, secret);
  if (!payload || payload.type !== 'REFRESH') return null;
  if (await isRevoked(kv, payload.jti)) return null;

  // Validate session in D1
  if (db) {
    const row = await dbGet<Record<string, unknown>>(db,
      `SELECT * FROM auth_sessions WHERE id=? AND revoked_at IS NULL AND expires_at > datetime('now')`,
      [payload.jti]
    );
    if (!row) return null;
  }

  const user = await getUserById(kv, payload.sub, db);
  if (!user || !user.isActive) return null;

  const accessToken = await signJWT(
    { sub: user.id, email: user.email, role: user.role,
      displayName: user.displayName, providerId: user.providerId, type: 'ACCESS' },
    secret, ACCESS_TOKEN_TTL
  );
  return { accessToken, expiresIn: ACCESS_TOKEN_TTL };
}

// ─── Seed staff users ─────────────────────────────────────────────────────────
const SEED_STAFF: Array<Omit<StaffUser, 'passwordHash' | 'createdAt' | 'updatedAt'> & { password: string }> = [
  { id: 'usr-admin-001',     email: 'admin@oculoflow.com',      password: 'Admin@123!',     firstName: 'Practice', lastName: 'Admin',    displayName: 'Practice Admin',  role: 'ADMIN',      isActive: true },
  { id: 'usr-chen-001',      email: 'emily.chen@oculoflow.com', password: 'Provider@123!',  firstName: 'Emily',    lastName: 'Chen',     displayName: 'Dr. Emily Chen',  role: 'PROVIDER',   providerId: 'dr-chen',  isActive: true },
  { id: 'usr-patel-001',     email: 'raj.patel@oculoflow.com',  password: 'Provider@123!',  firstName: 'Raj',      lastName: 'Patel',    displayName: 'Dr. Raj Patel',   role: 'PROVIDER',   providerId: 'dr-patel', isActive: true },
  { id: 'usr-billing-001',   email: 'billing@oculoflow.com',    password: 'Billing@123!',   firstName: 'Billing',  lastName: 'Staff',    displayName: 'Billing Staff',   role: 'BILLING',    isActive: true },
  { id: 'usr-frontdesk-001', email: 'frontdesk@oculoflow.com',  password: 'FrontDesk@123!', firstName: 'Front',    lastName: 'Desk',     displayName: 'Front Desk',      role: 'FRONT_DESK', isActive: true },
  { id: 'usr-optical-001',   email: 'optical@oculoflow.com',    password: 'Optical@123!',   firstName: 'Optical',  lastName: 'Staff',    displayName: 'Optical Staff',   role: 'OPTICAL',    isActive: true },
];

export async function seedStaffUsers(kv: KVNamespace, db?: D1Database): Promise<void> {
  if (!db) return;

  // Check if already seeded in D1
  const existing = await dbGet<{ c: number }>(db,
    `SELECT COUNT(*) as c FROM staff_users WHERE id='usr-admin-001'`
  );
  if (existing && existing.c > 0) return;

  const ts = dbNow();
  for (const s of SEED_STAFF) {
    const { password, ...rest } = s;
    const passwordHash = await hashPassword(password);
    await dbRun(db,
      `INSERT OR IGNORE INTO staff_users
         (id, organization_id, email, password_hash, first_name, last_name, display_name, role, provider_id, is_active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`,
      [rest.id, 'org-001', rest.email.toLowerCase(), passwordHash,
       rest.firstName, rest.lastName, rest.displayName, rest.role,
       rest.providerId ?? null, ts, ts]
    );
  }
}

// ─── Exported seed credentials (for login page display in demo mode) ──────────
export const DEMO_CREDENTIALS = [
  { email: 'admin@oculoflow.com',      password: 'Admin@123!',     role: 'ADMIN',      name: 'Practice Admin' },
  { email: 'emily.chen@oculoflow.com', password: 'Provider@123!',  role: 'PROVIDER',   name: 'Dr. Emily Chen' },
  { email: 'raj.patel@oculoflow.com',  password: 'Provider@123!',  role: 'PROVIDER',   name: 'Dr. Raj Patel' },
  { email: 'billing@oculoflow.com',    password: 'Billing@123!',   role: 'BILLING',    name: 'Billing Staff' },
  { email: 'frontdesk@oculoflow.com',  password: 'FrontDesk@123!', role: 'FRONT_DESK', name: 'Front Desk' },
  { email: 'optical@oculoflow.com',    password: 'Optical@123!',   role: 'OPTICAL',    name: 'Optical Staff' },
];
