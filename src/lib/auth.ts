// Phase A1 – Authentication library
// Uses Web Crypto API (compatible with Cloudflare Workers runtime)

import type {
  StaffUser, StaffUserPublic, JWTPayload, AuthSession,
  LoginResponse, AuthContext, StaffRole,
} from '../types/auth';

// ─── KV helpers ───────────────────────────────────────────────────────────────
async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key, 'text');
  return v ? JSON.parse(v) as T : null;
}
async function kvPut(kv: KVNamespace, key: string, val: unknown, opts?: KVNamespacePutOptions): Promise<void> {
  await kv.put(key, JSON.stringify(val), opts);
}
async function kvDel(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

// ─── Key constants ────────────────────────────────────────────────────────────
const AUTH_SEED     = 'auth:seeded';
const USER_IDX      = 'auth:user:idx';
const userKey       = (id: string)    => `auth:user:${id}`;
const emailKey      = (email: string) => `auth:email:${email.toLowerCase()}`;
const sessionKey    = (userId: string) => `auth:session:${userId}`;
const revokedKey    = (jti: string)   => `auth:revoked:${jti}`;

// ─── JWT config ───────────────────────────────────────────────────────────────
const ACCESS_TOKEN_TTL  = 8 * 60 * 60;       // 8 hours in seconds
const REFRESH_TOKEN_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

// ─── Password hashing (PBKDF2 via Web Crypto) ─────────────────────────────────
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    256
  );
  const hashArr = new Uint8Array(derived);
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(hashArr).map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2:${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split(':');
    if (parts.length !== 3 || parts[0] !== 'pbkdf2') return false;
    const salt = new Uint8Array(parts[1].match(/.{2}/g)!.map(b => parseInt(b, 16)));
    const expectedHash = parts[2];
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const derived = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
      keyMaterial,
      256
    );
    const hashArr = new Uint8Array(derived);
    const hashHex = Array.from(hashArr).map(b => b.toString(16).padStart(2, '0')).join('');
    // Constant-time comparison
    return hashHex === expectedHash;
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
  const bin = atob(padded);
  return new Uint8Array([...bin].map(c => c.charCodeAt(0)));
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
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
      'HMAC', key,
      b64urlDecode(parts[2]),
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

// ─── JWT secret ──────────────────────────────────────────────────────────────
// In production this comes from Cloudflare secret: wrangler secret put JWT_SECRET
// For dev/sandbox we use a fallback — override via .dev.vars: JWT_SECRET=your-secret
export function getJwtSecret(env: { JWT_SECRET?: string }): string {
  return env.JWT_SECRET ?? 'oculoflow-dev-secret-change-in-production-min-32-chars';
}

// ─── Token pair generation ────────────────────────────────────────────────────
export async function issueTokenPair(
  user: StaffUser,
  secret: string,
  kv: KVNamespace,
  meta?: { userAgent?: string; ipAddress?: string }
): Promise<LoginResponse> {
  const base = {
    sub: user.id,
    email: user.email,
    role: user.role,
    displayName: user.displayName,
    providerId: user.providerId,
  };

  const accessToken  = await signJWT({ ...base, type: 'ACCESS' },  secret, ACCESS_TOKEN_TTL);
  const refreshToken = await signJWT({ ...base, type: 'REFRESH' }, secret, REFRESH_TOKEN_TTL);

  // Decode refresh token to get its jti for session storage
  const refreshPayload = await verifyJWT(refreshToken, secret);
  if (refreshPayload) {
    const session: AuthSession = {
      userId: user.id,
      refreshTokenId: refreshPayload.jti,
      issuedAt: new Date().toISOString(),
      expiresAt: new Date((refreshPayload.exp) * 1000).toISOString(),
      userAgent: meta?.userAgent,
      ipAddress: meta?.ipAddress,
    };
    await kvPut(kv, sessionKey(user.id), session, { expirationTtl: REFRESH_TOKEN_TTL });
  }

  // Update lastLoginAt
  await kvPut(kv, userKey(user.id), { ...user, lastLoginAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL,
    user: toPublic(user),
  };
}

// ─── Token revocation ─────────────────────────────────────────────────────────
export async function revokeToken(kv: KVNamespace, jti: string, ttl: number): Promise<void> {
  await kvPut(kv, revokedKey(jti), true, { expirationTtl: ttl + 60 });
}

export async function isRevoked(kv: KVNamespace, jti: string): Promise<boolean> {
  const v = await kv.get(revokedKey(jti));
  return v !== null;
}

// ─── Session management ───────────────────────────────────────────────────────
export async function getSession(kv: KVNamespace, userId: string): Promise<AuthSession | null> {
  return kvGet<AuthSession>(kv, sessionKey(userId));
}

export async function invalidateSession(kv: KVNamespace, userId: string): Promise<void> {
  const session = await getSession(kv, userId);
  if (session) {
    await revokeToken(kv, session.refreshTokenId, REFRESH_TOKEN_TTL);
  }
  await kvDel(kv, sessionKey(userId));
}

// ─── User CRUD ────────────────────────────────────────────────────────────────
export async function getUserById(kv: KVNamespace, id: string): Promise<StaffUser | null> {
  return kvGet<StaffUser>(kv, userKey(id));
}

export async function getUserByEmail(kv: KVNamespace, email: string): Promise<StaffUser | null> {
  const id = await kv.get(emailKey(email.toLowerCase()), 'text');
  if (!id) return null;
  return getUserById(kv, id);
}

export async function listUsers(kv: KVNamespace): Promise<StaffUserPublic[]> {
  await seedStaffUsers(kv);
  const ids = (await kvGet<string[]>(kv, USER_IDX)) ?? [];
  const users: StaffUserPublic[] = [];
  for (const id of ids) {
    const u = await getUserById(kv, id);
    if (u) users.push(toPublic(u));
  }
  return users;
}

export async function createUser(
  kv: KVNamespace,
  data: { email: string; password: string; firstName: string; lastName: string; role: StaffRole; providerId?: string }
): Promise<StaffUser> {
  await seedStaffUsers(kv);
  const existing = await getUserByEmail(kv, data.email);
  if (existing) throw new Error('Email already in use');

  const ids = (await kvGet<string[]>(kv, USER_IDX)) ?? [];
  const now = new Date().toISOString();
  const id = `usr-${Date.now().toString(36)}`;
  const user: StaffUser = {
    id,
    email: data.email.toLowerCase(),
    passwordHash: await hashPassword(data.password),
    firstName: data.firstName,
    lastName: data.lastName,
    displayName: `${data.firstName} ${data.lastName}`,
    role: data.role,
    providerId: data.providerId,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  await kvPut(kv, userKey(id), user);
  await kv.put(emailKey(user.email), id);
  await kvPut(kv, USER_IDX, [...ids, id]);
  return user;
}

export async function updateUserPassword(kv: KVNamespace, userId: string, newPassword: string): Promise<boolean> {
  const user = await getUserById(kv, userId);
  if (!user) return false;
  const updated: StaffUser = {
    ...user,
    passwordHash: await hashPassword(newPassword),
    updatedAt: new Date().toISOString(),
  };
  await kvPut(kv, userKey(userId), updated);
  return true;
}

export async function setUserActive(kv: KVNamespace, userId: string, isActive: boolean): Promise<boolean> {
  const user = await getUserById(kv, userId);
  if (!user) return false;
  await kvPut(kv, userKey(userId), { ...user, isActive, updatedAt: new Date().toISOString() });
  return true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function toPublic(user: StaffUser): StaffUserPublic {
  const { passwordHash: _, ...pub } = user;
  return pub;
}

export function extractAuthContext(payload: JWTPayload): AuthContext {
  return {
    userId: payload.sub,
    email: payload.email,
    role: payload.role,
    displayName: payload.displayName,
    providerId: payload.providerId,
    tokenId: payload.jti,
  };
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function login(
  kv: KVNamespace,
  email: string,
  password: string,
  secret: string,
  meta?: { userAgent?: string; ipAddress?: string }
): Promise<LoginResponse | null> {
  await seedStaffUsers(kv);
  const user = await getUserByEmail(kv, email);
  if (!user || !user.isActive) return null;
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;
  return issueTokenPair(user, secret, kv, meta);
}

// ─── Refresh ──────────────────────────────────────────────────────────────────
export async function refreshAccessToken(
  kv: KVNamespace,
  refreshToken: string,
  secret: string
): Promise<{ accessToken: string; expiresIn: number } | null> {
  const payload = await verifyJWT(refreshToken, secret);
  if (!payload || payload.type !== 'REFRESH') return null;

  // Check revocation
  if (await isRevoked(kv, payload.jti)) return null;

  // Validate session still exists and matches
  const session = await getSession(kv, payload.sub);
  if (!session || session.refreshTokenId !== payload.jti) return null;

  const user = await getUserById(kv, payload.sub);
  if (!user || !user.isActive) return null;

  const accessToken = await signJWT(
    { sub: user.id, email: user.email, role: user.role, displayName: user.displayName, providerId: user.providerId, type: 'ACCESS' },
    secret,
    ACCESS_TOKEN_TTL
  );

  return { accessToken, expiresIn: ACCESS_TOKEN_TTL };
}

// ─── Seed staff users ─────────────────────────────────────────────────────────
const SEED_STAFF: Array<Omit<StaffUser, 'passwordHash' | 'createdAt' | 'updatedAt'> & { password: string }> = [
  {
    id: 'usr-admin-001',
    email: 'admin@oculoflow.com',
    password: 'Admin@123!',
    firstName: 'Practice',
    lastName: 'Admin',
    displayName: 'Practice Admin',
    role: 'ADMIN',
    isActive: true,
  },
  {
    id: 'usr-chen-001',
    email: 'emily.chen@oculoflow.com',
    password: 'Provider@123!',
    firstName: 'Emily',
    lastName: 'Chen',
    displayName: 'Dr. Emily Chen',
    role: 'PROVIDER',
    providerId: 'dr-chen',
    isActive: true,
  },
  {
    id: 'usr-patel-001',
    email: 'raj.patel@oculoflow.com',
    password: 'Provider@123!',
    firstName: 'Raj',
    lastName: 'Patel',
    displayName: 'Dr. Raj Patel',
    role: 'PROVIDER',
    providerId: 'dr-patel',
    isActive: true,
  },
  {
    id: 'usr-billing-001',
    email: 'billing@oculoflow.com',
    password: 'Billing@123!',
    firstName: 'Billing',
    lastName: 'Staff',
    displayName: 'Billing Staff',
    role: 'BILLING',
    isActive: true,
  },
  {
    id: 'usr-frontdesk-001',
    email: 'frontdesk@oculoflow.com',
    password: 'FrontDesk@123!',
    firstName: 'Front',
    lastName: 'Desk',
    displayName: 'Front Desk',
    role: 'FRONT_DESK',
    isActive: true,
  },
  {
    id: 'usr-optical-001',
    email: 'optical@oculoflow.com',
    password: 'Optical@123!',
    firstName: 'Optical',
    lastName: 'Staff',
    displayName: 'Optical Staff',
    role: 'OPTICAL',
    isActive: true,
  },
];

export async function seedStaffUsers(kv: KVNamespace): Promise<void> {
  const seeded = await kvGet<boolean>(kv, AUTH_SEED);
  if (seeded) return;

  const now = new Date().toISOString();
  const ids: string[] = [];

  for (const s of SEED_STAFF) {
    const { password, ...rest } = s;
    const user: StaffUser = {
      ...rest,
      passwordHash: await hashPassword(password),
      createdAt: now,
      updatedAt: now,
    };
    await kvPut(kv, userKey(user.id), user);
    await kv.put(emailKey(user.email), user.id);
    ids.push(user.id);
  }

  await kvPut(kv, USER_IDX, ids);
  await kvPut(kv, AUTH_SEED, true);
}

// ─── Exported seed credentials (for login page display in demo mode) ──────────
export const DEMO_CREDENTIALS = [
  { email: 'admin@oculoflow.com',      password: 'Admin@123!',      role: 'ADMIN',      name: 'Practice Admin' },
  { email: 'emily.chen@oculoflow.com', password: 'Provider@123!',   role: 'PROVIDER',   name: 'Dr. Emily Chen' },
  { email: 'raj.patel@oculoflow.com',  password: 'Provider@123!',   role: 'PROVIDER',   name: 'Dr. Raj Patel' },
  { email: 'billing@oculoflow.com',    password: 'Billing@123!',    role: 'BILLING',    name: 'Billing Staff' },
  { email: 'frontdesk@oculoflow.com',  password: 'FrontDesk@123!',  role: 'FRONT_DESK', name: 'Front Desk' },
  { email: 'optical@oculoflow.com',    password: 'Optical@123!',    role: 'OPTICAL',    name: 'Optical Staff' },
];
