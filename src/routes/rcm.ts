// Phase 9A – Revenue Cycle Management routes

import { Hono } from 'hono';
import type { RCMResp, ClaimStatus, DenialReason, PaymentMethod, PayerType } from '../types/rcm';
import { requireRole } from '../middleware/auth';
import {
  listClaims, getClaim, createClaim, updateClaimStatus, postPayment,
  addDenial, addClaimNote, deleteClaim,
  listERAs, getERA, createERA,
  listStatements, getStatement, createStatement,
  listPaymentPlans, getPaymentPlan, createPaymentPlan,
  getRCMDashboard,
  VALID_CLAIM_STATUSES, DENIAL_REASONS, PAYER_TYPES, PAYMENT_METHODS,
} from '../lib/rcm';

type Bindings = { OCULOFLOW_KV: KVNamespace };
type Variables = { auth: import('../types/auth').AuthContext };
const rcmRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ─── Ping ─────────────────────────────────────────────────────────────────────
rcmRoutes.get('/ping', (c) => c.json<RCMResp>({ success: true, data: { pong: true, module: 'rcm' } }));

// ─── Dashboard ────────────────────────────────────────────────────────────────
rcmRoutes.get('/dashboard', async (c) => {
  const stats = await getRCMDashboard(c.env.OCULOFLOW_KV);
  return c.json<RCMResp>({ success: true, data: stats });
});

// ─── Claims ───────────────────────────────────────────────────────────────────
rcmRoutes.get('/claims', async (c) => {
  const { status, patientId, payerId } = c.req.query() as Record<string, string>;
  const claims = await listClaims(c.env.OCULOFLOW_KV, {
    status: status || undefined,
    patientId: patientId || undefined,
    payerId: payerId || undefined,
  });
  return c.json<RCMResp>({ success: true, data: claims, total: claims.length });
});

rcmRoutes.post('/claims', requireRole('ADMIN', 'BILLING', 'PROVIDER'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { patientId, patientName, payerId, payerName, serviceDate } = body;
  if (!patientId || !patientName || !payerId || !payerName || !serviceDate) {
    return c.json<RCMResp>({ success: false, error: 'patientId, patientName, payerId, payerName, serviceDate are required' }, 400);
  }
  const claim = await createClaim(c.env.OCULOFLOW_KV, body);
  return c.json<RCMResp>({ success: true, data: claim }, 201);
});

rcmRoutes.get('/claims/:id', async (c) => {
  const claim = await getClaim(c.env.OCULOFLOW_KV, c.req.param('id'));
  if (!claim) return c.json<RCMResp>({ success: false, error: 'Claim not found' }, 404);
  return c.json<RCMResp>({ success: true, data: claim });
});

rcmRoutes.delete('/claims/:id', requireRole('ADMIN', 'BILLING'), async (c) => {
  const deleted = await deleteClaim(c.env.OCULOFLOW_KV, c.req.param('id'));
  if (!deleted) return c.json<RCMResp>({ success: false, error: 'Claim not found' }, 404);
  return c.json<RCMResp>({ success: true, data: { deleted: true } });
});

// ─── Claim Status ─────────────────────────────────────────────────────────────
rcmRoutes.patch('/claims/:id/status', requireRole('ADMIN', 'BILLING'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { status, userId } = body as { status: ClaimStatus; userId: string };
  if (!status) return c.json<RCMResp>({ success: false, error: 'status is required' }, 400);
  if (!userId) return c.json<RCMResp>({ success: false, error: 'userId is required' }, 400);
  if (!VALID_CLAIM_STATUSES.includes(status)) {
    return c.json<RCMResp>({ success: false, error: `Invalid status. Valid: ${VALID_CLAIM_STATUSES.join(', ')}` }, 400);
  }
  const claim = await updateClaimStatus(c.env.OCULOFLOW_KV, c.req.param('id'), status, userId);
  if (!claim) return c.json<RCMResp>({ success: false, error: 'Claim not found' }, 404);
  return c.json<RCMResp>({ success: true, data: claim });
});

// ─── Payments ─────────────────────────────────────────────────────────────────
rcmRoutes.post('/claims/:id/payments', requireRole('ADMIN', 'BILLING'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { amount, method, postedBy, paymentDate } = body;
  if (!amount || !method || !postedBy) {
    return c.json<RCMResp>({ success: false, error: 'amount, method, postedBy are required' }, 400);
  }
  if (!PAYMENT_METHODS.includes(method as PaymentMethod)) {
    return c.json<RCMResp>({ success: false, error: `Invalid payment method` }, 400);
  }
  const claim = await postPayment(c.env.OCULOFLOW_KV, c.req.param('id'), {
    amount: Number(amount),
    method: method as PaymentMethod,
    postedBy,
    paymentDate: paymentDate ?? new Date().toISOString().slice(0, 10),
    referenceNumber: body.referenceNumber,
    checkNumber: body.checkNumber,
    eftTraceNumber: body.eftTraceNumber,
    notes: body.notes,
    claimLines: body.claimLines ?? [],
  });
  if (!claim) return c.json<RCMResp>({ success: false, error: 'Claim not found' }, 404);
  return c.json<RCMResp>({ success: true, data: claim }, 201);
});

// ─── Denials ──────────────────────────────────────────────────────────────────
rcmRoutes.post('/claims/:id/denials', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { reason, reasonDescription, deniedDate } = body;
  if (!reason || !reasonDescription) {
    return c.json<RCMResp>({ success: false, error: 'reason, reasonDescription are required' }, 400);
  }
  if (!DENIAL_REASONS.includes(reason as DenialReason)) {
    return c.json<RCMResp>({ success: false, error: `Invalid denial reason` }, 400);
  }
  const claim = await addDenial(c.env.OCULOFLOW_KV, c.req.param('id'), {
    reason: reason as DenialReason,
    reasonDescription,
    deniedDate: deniedDate ?? new Date().toISOString().slice(0, 10),
    claimLineIds: body.claimLineIds,
    appealDeadline: body.appealDeadline,
  });
  if (!claim) return c.json<RCMResp>({ success: false, error: 'Claim not found' }, 404);
  return c.json<RCMResp>({ success: true, data: claim }, 201);
});

// ─── Claim Notes ──────────────────────────────────────────────────────────────
rcmRoutes.post('/claims/:id/notes', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { authorId, authorName, content } = body;
  if (!authorId || !authorName || !content) {
    return c.json<RCMResp>({ success: false, error: 'authorId, authorName, content are required' }, 400);
  }
  const claim = await addClaimNote(c.env.OCULOFLOW_KV, c.req.param('id'), {
    authorId, authorName, content,
    isInternal: body.isInternal ?? true,
  });
  if (!claim) return c.json<RCMResp>({ success: false, error: 'Claim not found' }, 404);
  return c.json<RCMResp>({ success: true, data: claim }, 201);
});

// ─── ERAs / Remittance ────────────────────────────────────────────────────────
rcmRoutes.get('/eras', async (c) => {
  const eras = await listERAs(c.env.OCULOFLOW_KV);
  return c.json<RCMResp>({ success: true, data: eras, total: eras.length });
});

rcmRoutes.post('/eras', requireRole('ADMIN', 'BILLING'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { payerId, payerName, totalPayment, claimIds } = body;
  if (!payerId || !payerName || totalPayment === undefined) {
    return c.json<RCMResp>({ success: false, error: 'payerId, payerName, totalPayment are required' }, 400);
  }
  const era = await createERA(c.env.OCULOFLOW_KV, { ...body, claimIds: claimIds ?? [] });
  return c.json<RCMResp>({ success: true, data: era }, 201);
});

rcmRoutes.get('/eras/:id', async (c) => {
  const era = await getERA(c.env.OCULOFLOW_KV, c.req.param('id'));
  if (!era) return c.json<RCMResp>({ success: false, error: 'ERA not found' }, 404);
  return c.json<RCMResp>({ success: true, data: era });
});

// ─── Patient Statements ───────────────────────────────────────────────────────
rcmRoutes.get('/statements', async (c) => {
  const { patientId } = c.req.query() as Record<string, string>;
  const stmts = await listStatements(c.env.OCULOFLOW_KV, patientId || undefined);
  return c.json<RCMResp>({ success: true, data: stmts, total: stmts.length });
});

rcmRoutes.post('/statements', requireRole('ADMIN', 'BILLING'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { patientId, patientName, totalDue, dueDate } = body;
  if (!patientId || !patientName || totalDue === undefined || !dueDate) {
    return c.json<RCMResp>({ success: false, error: 'patientId, patientName, totalDue, dueDate are required' }, 400);
  }
  const stmt = await createStatement(c.env.OCULOFLOW_KV, body);
  return c.json<RCMResp>({ success: true, data: stmt }, 201);
});

rcmRoutes.get('/statements/:id', async (c) => {
  const stmt = await getStatement(c.env.OCULOFLOW_KV, c.req.param('id'));
  if (!stmt) return c.json<RCMResp>({ success: false, error: 'Statement not found' }, 404);
  return c.json<RCMResp>({ success: true, data: stmt });
});

// ─── Payment Plans ────────────────────────────────────────────────────────────
rcmRoutes.get('/payment-plans', async (c) => {
  const { patientId } = c.req.query() as Record<string, string>;
  const plans = await listPaymentPlans(c.env.OCULOFLOW_KV, patientId || undefined);
  return c.json<RCMResp>({ success: true, data: plans, total: plans.length });
});

rcmRoutes.post('/payment-plans', requireRole('ADMIN', 'BILLING', 'FRONT_DESK'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { patientId, patientName, totalBalance, monthlyPayment } = body;
  if (!patientId || !patientName || totalBalance === undefined || !monthlyPayment) {
    return c.json<RCMResp>({ success: false, error: 'patientId, patientName, totalBalance, monthlyPayment are required' }, 400);
  }
  const plan = await createPaymentPlan(c.env.OCULOFLOW_KV, body);
  return c.json<RCMResp>({ success: true, data: plan }, 201);
});

rcmRoutes.get('/payment-plans/:id', async (c) => {
  const plan = await getPaymentPlan(c.env.OCULOFLOW_KV, c.req.param('id'));
  if (!plan) return c.json<RCMResp>({ success: false, error: 'Payment plan not found' }, 404);
  return c.json<RCMResp>({ success: true, data: plan });
});

// ─── Meta ─────────────────────────────────────────────────────────────────────
rcmRoutes.get('/statuses', (c) => c.json<RCMResp>({
  success: true,
  data: {
    claimStatuses: VALID_CLAIM_STATUSES,
    denialReasons: DENIAL_REASONS,
    payerTypes: PAYER_TYPES,
    paymentMethods: PAYMENT_METHODS,
  },
}));

export default rcmRoutes;
