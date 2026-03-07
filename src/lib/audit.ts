// Phase A2 — Audit Logging (HIPAA §164.312(b))
// Writes immutable audit events to KV with TTL.
// Every PHI read / write / auth event is recorded as:
//   { id, timestamp, event, userId, userEmail, userRole,
//     resource, resourceId, action, outcome, ip, userAgent, detail }

export type AuditOutcome = 'SUCCESS' | 'FAILURE' | 'DENIED';

export type AuditEvent =
  // Auth
  | 'AUTH_LOGIN'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_LOGOUT'
  | 'AUTH_TOKEN_REFRESH'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_LOCKED_OUT'
  | 'AUTH_PASSWORD_CHANGED'
  | 'AUTH_USER_CREATED'
  | 'AUTH_USER_DEACTIVATED'
  | 'AUTH_USER_ACTIVATED'
  // PHI access
  | 'PHI_READ'
  | 'PHI_CREATE'
  | 'PHI_UPDATE'
  | 'PHI_DELETE'
  // Access denied
  | 'ACCESS_DENIED';

export interface AuditRecord {
  id: string;
  timestamp: string;
  event: AuditEvent;
  userId?: string;
  userEmail?: string;
  userRole?: string;
  resource: string;        // e.g. 'patient', 'exam', 'prescription'
  resourceId?: string;
  action: string;          // e.g. 'GET /api/patients/pat-001'
  outcome: AuditOutcome;
  ip: string;
  userAgent: string;
  detail?: string;         // sanitised — no raw PHI values
}

// ─── KV helpers ──────────────────────────────────────────────────────────────
const AUDIT_IDX  = 'audit:idx';
const AUDIT_TTL  = 6 * 365 * 24 * 60 * 60; // 6 years (HIPAA requires 6 years)
const MAX_IDX    = 5000;                      // keep last 5000 IDs in index

function auditKey(id: string) { return `audit:log:${id}`; }

async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key, 'text');
  return v ? JSON.parse(v) as T : null;
}
async function kvPut(kv: KVNamespace, key: string, val: unknown, ttl?: number): Promise<void> {
  const opts: KVNamespacePutOptions = ttl ? { expirationTtl: ttl } : {};
  await kv.put(key, JSON.stringify(val), opts);
}

// ─── Write a single audit record ─────────────────────────────────────────────
export async function writeAudit(
  kv: KVNamespace,
  record: Omit<AuditRecord, 'id' | 'timestamp'>
): Promise<void> {
  try {
    const id  = `aud-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const full: AuditRecord = { id, timestamp: now, ...record };

    // Write the record with 6-year TTL
    await kvPut(kv, auditKey(id), full, AUDIT_TTL);

    // Update rolling index (append + trim)
    const idx = (await kvGet<string[]>(kv, AUDIT_IDX)) ?? [];
    idx.push(id);
    if (idx.length > MAX_IDX) idx.splice(0, idx.length - MAX_IDX);
    await kvPut(kv, AUDIT_IDX, idx);
  } catch {
    // Audit failures must NEVER crash the request — log to console only
    console.error('[audit] Failed to write audit record');
  }
}

// ─── Query audit log ──────────────────────────────────────────────────────────
export async function queryAuditLog(
  kv: KVNamespace,
  opts: { limit?: number; userId?: string; event?: AuditEvent; resource?: string }
): Promise<AuditRecord[]> {
  const idx = (await kvGet<string[]>(kv, AUDIT_IDX)) ?? [];
  const limit = Math.min(opts.limit ?? 100, 500);

  // Scan from newest → oldest
  const results: AuditRecord[] = [];
  for (let i = idx.length - 1; i >= 0 && results.length < limit; i--) {
    const rec = await kvGet<AuditRecord>(kv, auditKey(idx[i]));
    if (!rec) continue;
    if (opts.userId   && rec.userId   !== opts.userId)   continue;
    if (opts.event    && rec.event    !== opts.event)     continue;
    if (opts.resource && rec.resource !== opts.resource)  continue;
    results.push(rec);
  }
  return results;
}

// ─── Helper: extract resource name from path ─────────────────────────────────
export function resourceFromPath(path: string): string {
  // /api/patients/pat-001  → 'patient'
  // /api/billing/superbills → 'billing'
  const m = path.match(/^\/api\/([^\/]+)/);
  if (!m) return 'unknown';
  const seg = m[1];
  const MAP: Record<string, string> = {
    patients: 'patient', exams: 'exam', billing: 'billing', erx: 'prescription',
    portal: 'portal', messaging: 'message', telehealth: 'telehealth',
    priorauth: 'prior-auth', rcm: 'claim', ai: 'ai-cds', optical: 'optical',
    schedule: 'schedule', reports: 'report', reminders: 'reminder',
    scorecards: 'scorecard', dashboard: 'dashboard', auth: 'auth',
  };
  return MAP[seg] ?? seg;
}

// ─── Helper: derive AuditEvent from HTTP method ───────────────────────────────
export function auditEventFromMethod(method: string, path: string): AuditEvent {
  const isAuth = path.startsWith('/api/auth');
  if (isAuth) return 'AUTH_LOGIN'; // caller overrides when needed
  switch (method.toUpperCase()) {
    case 'GET':    return 'PHI_READ';
    case 'POST':   return 'PHI_CREATE';
    case 'PUT':
    case 'PATCH':  return 'PHI_UPDATE';
    case 'DELETE': return 'PHI_DELETE';
    default:       return 'PHI_READ';
  }
}
