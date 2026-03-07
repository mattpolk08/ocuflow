// Phase A2 — Auth & Security Middleware (upgraded from Phase A1)
// • requireAuth     — JWT guard + revocation check + audit log
// • requireRole     — RBAC guard + audit log on DENIED
// • optionalAuth    — soft JWT population (no rejection)
// • rateLimitMiddleware — per-IP sliding-window rate limit (300 req/min)
// • auditMiddleware  — automatic PHI-access audit on every protected route

import { createMiddleware } from 'hono/factory'
import { verifyJWT, isRevoked, getJwtSecret, extractAuthContext } from '../lib/auth'
import { writeAudit, resourceFromPath, auditEventFromMethod } from '../lib/audit'
import { checkApiRateLimit } from '../lib/ratelimit'
import type { StaffRole, AuthContext } from '../types/auth'

type Bindings = { OCULOFLOW_KV: KVNamespace; JWT_SECRET?: string }
type Variables = { auth: AuthContext }

// ─── Helper: get client IP ────────────────────────────────────────────────────
function clientIp(c: { req: { header: (k: string) => string | undefined } }): string {
  return (
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

// ─── Core JWT guard ───────────────────────────────────────────────────────────
export const requireAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      // Write audit for unauthenticated access attempt on protected routes
      await writeAudit(c.env.OCULOFLOW_KV, {
        event:    'AUTH_TOKEN_INVALID',
        resource: resourceFromPath(c.req.path),
        action:   `${c.req.method} ${c.req.path}`,
        outcome:  'FAILURE',
        ip:       clientIp(c),
        userAgent: c.req.header('User-Agent') ?? 'unknown',
        detail:   'No Authorization header',
      });
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }

    const secret = getJwtSecret(c.env);
    const payload = await verifyJWT(token, secret);

    if (!payload) {
      await writeAudit(c.env.OCULOFLOW_KV, {
        event:    'AUTH_TOKEN_INVALID',
        resource: resourceFromPath(c.req.path),
        action:   `${c.req.method} ${c.req.path}`,
        outcome:  'FAILURE',
        ip:       clientIp(c),
        userAgent: c.req.header('User-Agent') ?? 'unknown',
        detail:   'Invalid or expired JWT',
      });
      return c.json({ success: false, error: 'Invalid or expired token' }, 401);
    }

    if (payload.type !== 'ACCESS') {
      return c.json({ success: false, error: 'Access token required' }, 401);
    }

    // Check revocation list
    if (await isRevoked(c.env.OCULOFLOW_KV, payload.jti)) {
      await writeAudit(c.env.OCULOFLOW_KV, {
        event:    'AUTH_TOKEN_INVALID',
        userId:   payload.sub,
        userEmail: payload.email,
        userRole:  payload.role,
        resource: resourceFromPath(c.req.path),
        action:   `${c.req.method} ${c.req.path}`,
        outcome:  'FAILURE',
        ip:       clientIp(c),
        userAgent: c.req.header('User-Agent') ?? 'unknown',
        detail:   'Token revoked',
      });
      return c.json({ success: false, error: 'Token has been revoked' }, 401);
    }

    c.set('auth', extractAuthContext(payload));
    await next();
  }
);

// ─── Role guard factory ───────────────────────────────────────────────────────
export function requireRole(...allowedRoles: StaffRole[]) {
  return createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
    async (c, next) => {
      const auth = c.var.auth;
      if (!auth) {
        return c.json({ success: false, error: 'Authentication required' }, 401);
      }
      // ADMIN always passes
      if (auth.role === 'ADMIN' || allowedRoles.includes(auth.role)) {
        await next();
        return;
      }
      // Write ACCESS_DENIED audit
      await writeAudit(c.env.OCULOFLOW_KV, {
        event:    'ACCESS_DENIED',
        userId:   auth.userId,
        userEmail: auth.email,
        userRole:  auth.role,
        resource: resourceFromPath(c.req.path),
        action:   `${c.req.method} ${c.req.path}`,
        outcome:  'DENIED',
        ip:       clientIp(c),
        userAgent: c.req.header('User-Agent') ?? 'unknown',
        detail:   `Role ${auth.role} not in [${allowedRoles.join(', ')}]`,
      });
      return c.json({ success: false, error: 'Insufficient permissions', required: allowedRoles }, 403);
    }
  );
}

// ─── Optional auth ────────────────────────────────────────────────────────────
export const optionalAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      const secret = getJwtSecret(c.env);
      const payload = await verifyJWT(token, secret);
      if (payload && payload.type === 'ACCESS') {
        if (!(await isRevoked(c.env.OCULOFLOW_KV, payload.jti))) {
          c.set('auth', extractAuthContext(payload));
        }
      }
    }
    await next();
  }
);

// ─── Per-IP API rate limiter ──────────────────────────────────────────────────
// Apply globally: app.use('/api/*', rateLimitMiddleware)
// Skips /api/health (monitoring) and /api/auth/login (has its own lockout)
export const rateLimitMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const path = c.req.path;
    // Skip health check and static assets
    if (path === '/api/health' || path.startsWith('/static/')) {
      await next();
      return;
    }

    const ip = clientIp(c);
    const { allowed, remaining, resetIn } = await checkApiRateLimit(c.env.OCULOFLOW_KV, ip);

    // Always set rate-limit headers
    c.header('X-RateLimit-Limit',     '300');
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset',     String(resetIn));

    if (!allowed) {
      await writeAudit(c.env.OCULOFLOW_KV, {
        event:    'ACCESS_DENIED',
        resource: resourceFromPath(path),
        action:   `${c.req.method} ${path}`,
        outcome:  'DENIED',
        ip,
        userAgent: c.req.header('User-Agent') ?? 'unknown',
        detail:   'Rate limit exceeded',
      });
      return c.json(
        { success: false, error: 'Too many requests. Please slow down.', retryAfter: resetIn },
        429
      );
    }

    await next();
  }
);

// ─── PHI Audit middleware ─────────────────────────────────────────────────────
// Apply after requireAuth on protected API routes to record every PHI access.
// Must come AFTER requireAuth so c.var.auth is populated.
// Records: event type, risk level, duration, resource ID, outcome.
export const auditMiddleware = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const auth      = c.var.auth;
    const path      = c.req.path;
    const method    = c.req.method;
    const resource  = resourceFromPath(path);
    const startMs   = Date.now();

    // Determine event type
    const event = auditEventFromMethod(method, path);

    // Extract resource ID from path (e.g. /api/patients/pat-001 → pat-001)
    const idMatch   = path.match(/\/([a-zA-Z0-9_-]{4,})$/);
    const resourceId = idMatch && !['list','search','all','ping','seed','status','dashboard','export','download'].includes(idMatch[1])
      ? idMatch[1] : undefined;

    await next();

    const durationMs = Date.now() - startMs;
    const status     = c.res.status;
    const outcome: import('../lib/audit').AuditOutcome =
      status < 400 ? 'SUCCESS' : status === 403 ? 'DENIED' : 'FAILURE';

    // Estimate record count for bulk access events (from query params)
    const limitParam = parseInt(c.req.query('limit') ?? '0', 10);
    const recordCount = event === 'PHI_BULK_ACCESS' && limitParam > 0 ? limitParam : undefined;

    await writeAudit(c.env.OCULOFLOW_KV, {
      event,
      userId:    auth?.userId,
      userEmail: auth?.email,
      userRole:  auth?.role,
      sessionId: auth?.tokenId,
      resource,
      resourceId,
      action:    `${method} ${path}`,
      outcome,
      ip:        clientIp(c),
      userAgent: c.req.header('User-Agent') ?? 'unknown',
      durationMs,
      recordCount,
    });
  }
);
