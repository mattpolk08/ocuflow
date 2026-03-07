// ─── Phase 8B – Prior Authorization Routes ───────────────────────────────────
import { Hono } from 'hono';
import type { PAResp, PAStatus, PADecisionReason, PAUrgency, PAServiceType, DocumentType } from '../types/priorauth';
import { requireRole } from '../middleware/auth';
import {
  listPARequests, getPARequest, createPARequest, updatePAStatus,
  addPADocument, addPANote, submitAppeal, schedulePeerToPeer,
  deletePARequest, getPADashboard, lookupPACriteria, paCriteriaCatalog,
  VALID_PA_STATUSES, VALID_SERVICE_TYPES, VALID_URGENCY,
} from '../lib/priorauth';

type Bindings = { OCULOFLOW_KV: KVNamespace };
type Variables = { auth: import('../types/auth').AuthContext };
export const paRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ── Ping ──────────────────────────────────────────────────────────────────────
paRoutes.get('/ping', (c) =>
  c.json<PAResp>({ success: true, data: { status: 'ok', module: 'prior-auth' } })
);

// ── Dashboard ─────────────────────────────────────────────────────────────────
paRoutes.get('/dashboard', async (c) => {
  const stats = await getPADashboard(c.env.OCULOFLOW_KV);
  return c.json<PAResp>({ success: true, data: stats });
});

// ── List PA Requests ──────────────────────────────────────────────────────────
paRoutes.get('/requests', async (c) => {
  const { status, patientId, providerId, serviceType, urgency } = c.req.query();
  const requests = await listPARequests(c.env.OCULOFLOW_KV, {
    status, patientId, providerId, serviceType, urgency,
  });
  return c.json<PAResp>({ success: true, data: { requests, count: requests.length } });
});

// ── Get Single PA Request ─────────────────────────────────────────────────────
paRoutes.get('/requests/:id', async (c) => {
  const req = await getPARequest(c.env.OCULOFLOW_KV, c.req.param('id'));
  if (!req) return c.json<PAResp>({ success: false, error: 'PA request not found' }, 404);
  return c.json<PAResp>({ success: true, data: req });
});

// ── Create PA Request ─────────────────────────────────────────────────────────
paRoutes.post('/requests', requireRole('ADMIN', 'PROVIDER', 'BILLING', 'NURSE'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { patientId, patientName, serviceCode, serviceDescription, payerId, payerName, providerId, providerName } = body;
  if (!patientId || !patientName || !serviceCode || !serviceDescription || !payerId || !payerName || !providerId || !providerName) {
    return c.json<PAResp>({ success: false, error: 'patientId, patientName, serviceCode, serviceDescription, payerId, payerName, providerId, providerName are required' }, 400);
  }
  if (body.urgency && !VALID_URGENCY.includes(body.urgency)) {
    return c.json<PAResp>({ success: false, error: `Invalid urgency. Valid: ${VALID_URGENCY.join(', ')}` }, 400);
  }
  if (body.serviceType && !VALID_SERVICE_TYPES.includes(body.serviceType)) {
    return c.json<PAResp>({ success: false, error: `Invalid serviceType. Valid: ${VALID_SERVICE_TYPES.join(', ')}` }, 400);
  }
  const req = await createPARequest(c.env.OCULOFLOW_KV, body);
  return c.json<PAResp>({ success: true, data: req }, 201);
});

// ── Update PA Status ──────────────────────────────────────────────────────────
paRoutes.patch('/requests/:id/status', requireRole('ADMIN', 'PROVIDER', 'BILLING'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { status, changedBy, reason, notes, authNumber } = body;
  if (!status || !changedBy) {
    return c.json<PAResp>({ success: false, error: 'status and changedBy are required' }, 400);
  }
  if (!VALID_PA_STATUSES.includes(status)) {
    return c.json<PAResp>({ success: false, error: `Invalid status. Valid: ${VALID_PA_STATUSES.join(', ')}` }, 400);
  }
  const req = await updatePAStatus(c.env.OCULOFLOW_KV, c.req.param('id'), status as PAStatus, { changedBy, reason, notes, authNumber });
  if (!req) return c.json<PAResp>({ success: false, error: 'PA request not found' }, 404);
  return c.json<PAResp>({ success: true, data: req });
});

// ── Add Document ──────────────────────────────────────────────────────────────
paRoutes.post('/requests/:id/documents', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { type, name, uploadedBy, sizeKb, url } = body;
  if (!type || !name || !uploadedBy) {
    return c.json<PAResp>({ success: false, error: 'type, name, uploadedBy are required' }, 400);
  }
  const req = await addPADocument(c.env.OCULOFLOW_KV, c.req.param('id'), {
    type: type as DocumentType,
    name,
    uploadedAt: new Date().toISOString(),
    uploadedBy,
    sizeKb: sizeKb ?? 0,
    url: url ?? `/documents/${name}`,
  });
  if (!req) return c.json<PAResp>({ success: false, error: 'PA request not found' }, 404);
  return c.json<PAResp>({ success: true, data: req }, 201);
});

// ── Add Note ──────────────────────────────────────────────────────────────────
paRoutes.post('/requests/:id/notes', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { authorId, authorName, authorRole, content, isInternal } = body;
  if (!authorId || !authorName || !content) {
    return c.json<PAResp>({ success: false, error: 'authorId, authorName, content are required' }, 400);
  }
  const req = await addPANote(c.env.OCULOFLOW_KV, c.req.param('id'), {
    authorId, authorName,
    authorRole: authorRole ?? 'Staff',
    content,
    isInternal: isInternal !== false,
  });
  if (!req) return c.json<PAResp>({ success: false, error: 'PA request not found' }, 404);
  return c.json<PAResp>({ success: true, data: req }, 201);
});

// ── Submit Appeal ─────────────────────────────────────────────────────────────
paRoutes.post('/requests/:id/appeal', requireRole('ADMIN', 'PROVIDER', 'BILLING'), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { appealType, reason, deadline } = body;
  if (!appealType || !reason || !deadline) {
    return c.json<PAResp>({ success: false, error: 'appealType, reason, deadline are required' }, 400);
  }
  const validAppealTypes = ['FIRST_LEVEL','SECOND_LEVEL','EXTERNAL','EXPEDITED'];
  if (!validAppealTypes.includes(appealType)) {
    return c.json<PAResp>({ success: false, error: `Invalid appealType. Valid: ${validAppealTypes.join(', ')}` }, 400);
  }
  const req = await submitAppeal(c.env.OCULOFLOW_KV, c.req.param('id'), {
    deadline,
    appealType,
    reason,
    additionalDocs: body.additionalDocs ?? [],
    outcome: 'PENDING',
  });
  if (!req) return c.json<PAResp>({ success: false, error: 'PA request not found' }, 404);
  return c.json<PAResp>({ success: true, data: req }, 201);
});

// ── Schedule Peer-to-Peer ─────────────────────────────────────────────────────
paRoutes.post('/requests/:id/peer-to-peer', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { physicianName, scheduledAt } = body;
  if (!physicianName) {
    return c.json<PAResp>({ success: false, error: 'physicianName is required' }, 400);
  }
  const req = await schedulePeerToPeer(c.env.OCULOFLOW_KV, c.req.param('id'), {
    physicianName,
    scheduledAt,
    reviewerName: body.reviewerName,
    outcome: 'PENDING',
    notes: body.notes,
  });
  if (!req) return c.json<PAResp>({ success: false, error: 'PA request not found' }, 404);
  return c.json<PAResp>({ success: true, data: req }, 201);
});

// ── Delete PA Request ─────────────────────────────────────────────────────────
paRoutes.delete('/requests/:id', requireRole('ADMIN', 'BILLING'), async (c) => {
  const deleted = await deletePARequest(c.env.OCULOFLOW_KV, c.req.param('id'));
  if (!deleted) return c.json<PAResp>({ success: false, error: 'PA request not found' }, 404);
  return c.json<PAResp>({ success: true, data: { deleted: true } });
});

// ── PA Criteria Lookup ────────────────────────────────────────────────────────
paRoutes.get('/criteria', (c) => {
  const { payerId, serviceCode } = c.req.query();
  const criteria = lookupPACriteria(payerId, serviceCode);
  return c.json<PAResp>({ success: true, data: { criteria, count: criteria.length } });
});

// ── Payer List ────────────────────────────────────────────────────────────────
paRoutes.get('/payers', (c) => {
  const payers = [...new Map(paCriteriaCatalog.map(c => [c.payerId, { id: c.payerId, name: c.payerName }])).values()];
  return c.json<PAResp>({ success: true, data: payers });
});

// ── Status Enum ───────────────────────────────────────────────────────────────
paRoutes.get('/statuses', (c) =>
  c.json<PAResp>({ success: true, data: { statuses: VALID_PA_STATUSES, serviceTypes: VALID_SERVICE_TYPES, urgency: VALID_URGENCY } })
);
