// Phase A1 – Auth middleware for Hono
// Validates JWT on every protected route; injects AuthContext into Hono variables

import { createMiddleware } from 'hono/factory'
import { verifyJWT, isRevoked, getJwtSecret, extractAuthContext } from '../lib/auth'
import type { StaffRole } from '../types/auth'

type Bindings = { OCULOFLOW_KV: KVNamespace; JWT_SECRET?: string }
type Variables = {
  auth: import('../types/auth').AuthContext
}

// ─── Core JWT guard ───────────────────────────────────────────────────────────
// Attach to any route group that requires authentication.
// Injects c.var.auth = AuthContext on success; returns 401 on failure.
export const requireAuth = createMiddleware<{ Bindings: Bindings; Variables: Variables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      return c.json({ success: false, error: 'Authentication required' }, 401);
    }

    const secret = getJwtSecret(c.env);
    const payload = await verifyJWT(token, secret);

    if (!payload) {
      return c.json({ success: false, error: 'Invalid or expired token' }, 401);
    }

    if (payload.type !== 'ACCESS') {
      return c.json({ success: false, error: 'Access token required' }, 401);
    }

    // Check revocation list
    if (await isRevoked(c.env.OCULOFLOW_KV, payload.jti)) {
      return c.json({ success: false, error: 'Token has been revoked' }, 401);
    }

    c.set('auth', extractAuthContext(payload));
    await next();
  }
);

// ─── Role guard factory ───────────────────────────────────────────────────────
// Usage: app.use('/api/billing/*', requireAuth, requireRole('BILLING', 'ADMIN'))
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
      return c.json({ success: false, error: 'Insufficient permissions', required: allowedRoles }, 403);
    }
  );
}

// ─── Optional auth ────────────────────────────────────────────────────────────
// Does NOT reject unauthenticated requests — just populates c.var.auth if token present.
// Useful for routes that behave differently for logged-in vs anonymous users.
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
