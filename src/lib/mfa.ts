// Phase A4 — Multi-Factor Authentication (TOTP + Trusted Devices + Recovery Codes)
// Uses Web Crypto API — fully compatible with Cloudflare Workers runtime.
// RFC 6238 TOTP, 30-second window, SHA-1 HMAC, 6-digit codes.

// ─── KV helpers ───────────────────────────────────────────────────────────────
async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key, 'text');
  return v ? JSON.parse(v) as T : null;
}
async function kvPut(kv: KVNamespace, key: string, val: unknown, ttlSec?: number): Promise<void> {
  const opts: KVNamespacePutOptions = ttlSec ? { expirationTtl: Math.max(ttlSec, 60) } : {};
  await kv.put(key, JSON.stringify(val), opts);
}

// ─── KV key scheme ────────────────────────────────────────────────────────────
const mfaKey          = (uid: string) => `mfa:config:${uid}`;
const pendingKey      = (uid: string) => `mfa:pending:${uid}`;    // temp secret before confirm
const trustedKey      = (token: string) => `mfa:trusted:${token}`;
const usedOtpKey      = (uid: string, counter: string) => `mfa:used:${uid}:${counter}`;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface MfaConfig {
  userId: string;
  secret: string;           // Base32-encoded TOTP secret
  enabled: boolean;
  enrolledAt?: string;
  recoveryCodes: string[];  // bcrypt-style hashed 8-digit codes
  usedRecoveryCodes: string[];
}

export interface TrustedDevice {
  userId: string;
  deviceId: string;
  label: string;            // e.g. "Chrome on macOS"
  createdAt: string;
  expiresAt: string;
  ip: string;
}

export interface MfaChallengeState {
  userId: string;
  createdAt: string;
  // after password check passes, before TOTP verified
}

// ─── Base32 (RFC 4648) ────────────────────────────────────────────────────────
const B32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += B32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += B32_CHARS[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/=+$/, '');
  let bits = 0, value = 0;
  const output: number[] = [];
  for (const char of clean) {
    const idx = B32_CHARS.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { output.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(output);
}

// ─── TOTP core (RFC 6238) ─────────────────────────────────────────────────────
const TOTP_STEP    = 30;   // seconds per window
const TOTP_DIGITS  = 6;
const TOTP_WINDOW  = 1;    // ±1 window tolerance (covers clock drift)

async function hotp(secret: Uint8Array, counter: bigint): Promise<string> {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  // Write counter as big-endian 64-bit int
  view.setUint32(0, Number(counter >> 32n), false);
  view.setUint32(4, Number(counter & 0xFFFFFFFFn), false);

  const key = await crypto.subtle.importKey(
    'raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));

  const offset = sig[19] & 0xf;
  const code = (
    ((sig[offset]     & 0x7f) << 24) |
    ((sig[offset + 1] & 0xff) << 16) |
    ((sig[offset + 2] & 0xff) <<  8) |
     (sig[offset + 3] & 0xff)
  ) % (10 ** TOTP_DIGITS);

  return code.toString().padStart(TOTP_DIGITS, '0');
}

export async function generateTOTP(secret: string): Promise<string> {
  const counter = BigInt(Math.floor(Date.now() / 1000 / TOTP_STEP));
  return hotp(base32Decode(secret), counter);
}

export async function verifyTOTP(secret: string, code: string): Promise<{ valid: boolean; counter: string }> {
  const t = Math.floor(Date.now() / 1000 / TOTP_STEP);
  const trimmed = code.replace(/\s/g, '');
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const counter = BigInt(t + delta);
    const expected = await hotp(base32Decode(secret), counter);
    if (expected === trimmed) {
      return { valid: true, counter: counter.toString() };
    }
  }
  return { valid: false, counter: '' };
}

// ─── Secret generation ────────────────────────────────────────────────────────
export function generateTotpSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20)); // 160-bit secret
  return base32Encode(bytes);
}

// ─── OTP URI for QR code ──────────────────────────────────────────────────────
export function totpUri(secret: string, email: string, issuer = 'OculoFlow'): string {
  const enc = encodeURIComponent;
  return `otpauth://totp/${enc(issuer)}:${enc(email)}?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ─── Recovery codes ───────────────────────────────────────────────────────────
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(5));
    const hex   = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    // Format as XXXXX-XXXXX (10 hex chars)
    return `${hex.slice(0, 5)}-${hex.slice(5)}`.toUpperCase();
  });
}

// Simple hash for recovery codes (no bcrypt in Workers — use PBKDF2 instead)
async function hashCode(code: string): Promise<string> {
  const km = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(code), 'PBKDF2', false, ['deriveBits']
  );
  const salt = new TextEncoder().encode('oculoflow-rc');
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 10_000, hash: 'SHA-256' }, km, 128
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyCode(code: string, hash: string): Promise<boolean> {
  return (await hashCode(code)) === hash;
}

// ─── MFA config CRUD ─────────────────────────────────────────────────────────

/** Begin enrollment: generate secret, store as pending (not yet enabled). */
export async function beginMfaEnrollment(
  kv: KVNamespace, userId: string
): Promise<{ secret: string; recoveryCodes: string[] }> {
  const secret = generateTotpSecret();
  const rawCodes = generateRecoveryCodes(8);
  const hashedCodes = await Promise.all(rawCodes.map(hashCode));

  await kvPut(kv, pendingKey(userId), { secret, hashedCodes }, 10 * 60); // 10-min to complete enrollment
  return { secret, recoveryCodes: rawCodes };
}

/** Confirm enrollment: verify the first TOTP code, activate MFA. */
export async function confirmMfaEnrollment(
  kv: KVNamespace, userId: string, totpCode: string
): Promise<{ success: boolean; error?: string }> {
  const pending = await kvGet<{ secret: string; hashedCodes: string[] }>(kv, pendingKey(userId));
  if (!pending) return { success: false, error: 'Enrollment session expired. Please restart.' };

  const { valid, counter } = await verifyTOTP(pending.secret, totpCode);
  if (!valid) return { success: false, error: 'Invalid TOTP code. Check your authenticator app.' };

  // Mark this counter used (replay protection)
  await kvPut(kv, usedOtpKey(userId, counter), true, 2 * 60);

  const config: MfaConfig = {
    userId,
    secret: pending.secret,
    enabled: true,
    enrolledAt: new Date().toISOString(),
    recoveryCodes: pending.hashedCodes,
    usedRecoveryCodes: [],
  };
  await kvPut(kv, mfaKey(userId), config);
  await kv.delete(pendingKey(userId));
  return { success: true };
}

/** Get current MFA config (without exposing secret). */
export async function getMfaStatus(
  kv: KVNamespace, userId: string
): Promise<{ enabled: boolean; enrolledAt?: string; recoveryCodesRemaining: number }> {
  const cfg = await kvGet<MfaConfig>(kv, mfaKey(userId));
  if (!cfg) return { enabled: false, recoveryCodesRemaining: 0 };
  const remaining = cfg.recoveryCodes.length - cfg.usedRecoveryCodes.length;
  return { enabled: cfg.enabled, enrolledAt: cfg.enrolledAt, recoveryCodesRemaining: remaining };
}

/** Disable MFA for a user (ADMIN action or self with TOTP confirmation). */
export async function disableMfa(kv: KVNamespace, userId: string): Promise<void> {
  await kv.delete(mfaKey(userId));
  await kv.delete(pendingKey(userId));
  // Also clear any trusted devices for this user
  // (list scan not possible in KV — devices expire naturally after 30d)
}

// ─── MFA verification ─────────────────────────────────────────────────────────

/** Verify a TOTP code during login. Returns true if valid and not replayed. */
export async function verifyMfaCode(
  kv: KVNamespace, userId: string, code: string
): Promise<{ success: boolean; error?: string }> {
  const cfg = await kvGet<MfaConfig>(kv, mfaKey(userId));
  if (!cfg || !cfg.enabled) return { success: false, error: 'MFA not configured' };

  const trimmed = code.replace(/\s/g, '');

  // Try recovery code first (10-char with dash format)
  if (trimmed.includes('-') || trimmed.length === 10) {
    return verifyRecoveryCode(kv, cfg, userId, trimmed);
  }

  // Standard TOTP
  const { valid, counter } = await verifyTOTP(cfg.secret, trimmed);
  if (!valid) return { success: false, error: 'Invalid authenticator code' };

  // Replay protection
  const usedKey = usedOtpKey(userId, counter);
  const alreadyUsed = await kv.get(usedKey);
  if (alreadyUsed) return { success: false, error: 'Code already used. Wait for next code.' };

  await kvPut(kv, usedKey, true, 2 * 60); // block for 2 min (covers the 30-sec window)
  return { success: true };
}

async function verifyRecoveryCode(
  kv: KVNamespace, cfg: MfaConfig, userId: string, code: string
): Promise<{ success: boolean; error?: string }> {
  const normalized = code.toUpperCase().replace(/[^A-F0-9-]/g, '');

  for (let i = 0; i < cfg.recoveryCodes.length; i++) {
    const hash = cfg.recoveryCodes[i];
    if (cfg.usedRecoveryCodes.includes(hash)) continue;
    const matches = await verifyCode(normalized, hash);
    if (matches) {
      cfg.usedRecoveryCodes.push(hash);
      await kvPut(kv, mfaKey(userId), cfg);
      const remaining = cfg.recoveryCodes.length - cfg.usedRecoveryCodes.length;
      if (remaining <= 2) {
        console.warn(`[mfa] User ${userId} has only ${remaining} recovery codes left`);
      }
      return { success: true };
    }
  }
  return { success: false, error: 'Invalid recovery code' };
}

// ─── MFA pending challenge (between password-ok and TOTP-ok) ─────────────────
const MFA_CHALLENGE_TTL = 5 * 60; // 5 minutes to complete TOTP step
const mfaChallengeKey = (token: string) => `mfa:challenge:${token}`;

export async function createMfaChallenge(kv: KVNamespace, userId: string): Promise<string> {
  const token = base32Encode(crypto.getRandomValues(new Uint8Array(16)));
  await kvPut(kv, mfaChallengeKey(token), { userId, createdAt: new Date().toISOString() }, MFA_CHALLENGE_TTL);
  return token;
}

export async function resolveMfaChallenge(
  kv: KVNamespace, token: string
): Promise<string | null> {
  const data = await kvGet<MfaChallengeState>(kv, mfaChallengeKey(token));
  if (!data) return null;
  await kv.delete(mfaChallengeKey(token));
  return data.userId;
}

// ─── Trusted devices ──────────────────────────────────────────────────────────
const TRUSTED_TTL = 30 * 24 * 60 * 60; // 30 days

export async function createTrustedDevice(
  kv: KVNamespace,
  userId: string,
  label: string,
  ip: string
): Promise<string> {
  const deviceId = base32Encode(crypto.getRandomValues(new Uint8Array(20)));
  const device: TrustedDevice = {
    userId,
    deviceId,
    label,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + TRUSTED_TTL * 1000).toISOString(),
    ip,
  };
  await kvPut(kv, trustedKey(deviceId), device, TRUSTED_TTL);
  return deviceId;
}

export async function verifyTrustedDevice(
  kv: KVNamespace, deviceId: string, userId: string
): Promise<boolean> {
  if (!deviceId) return false;
  const device = await kvGet<TrustedDevice>(kv, trustedKey(deviceId));
  if (!device) return false;
  if (device.userId !== userId) return false;
  if (new Date(device.expiresAt) < new Date()) return false;
  return true;
}

export async function revokeTrustedDevice(kv: KVNamespace, deviceId: string): Promise<void> {
  await kv.delete(trustedKey(deviceId));
}

/** Check if user has MFA enabled. */
export async function isMfaEnabled(kv: KVNamespace, userId: string): Promise<boolean> {
  const cfg = await kvGet<MfaConfig>(kv, mfaKey(userId));
  return !!(cfg?.enabled);
}
