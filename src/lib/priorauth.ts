// ─── Phase 8B – Prior Authorization Library ──────────────────────────────────
import type {
  PriorAuthRequest, PAStatus, PAServiceType, PAUrgency, PADecisionReason,
  PADocument, PANote, PAStatusHistory, PeerToPeerRequest, AppealRecord,
  PACriteria, PADashboardStats, DocumentType,
} from '../types/priorauth';

// ── helpers ──────────────────────────────────────────────────────────────────
function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
function iso(offset = 0): string {
  return new Date(Date.now() + offset).toISOString();
}
function daysFromNow(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString();
}
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString();
}

// ── KV helpers ────────────────────────────────────────────────────────────────
async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key, 'text');
  return v ? (JSON.parse(v) as T) : null;
}
async function kvPut(kv: KVNamespace, key: string, val: unknown): Promise<void> {
  await kv.put(key, JSON.stringify(val));
}
async function kvDel(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

const PA_IDX  = 'pa:idx';
const PA_SEED = 'pa:seeded';
const paKey   = (id: string) => `pa:req:${id}`;

// ── PA Criteria catalog ───────────────────────────────────────────────────────
export const paCriteriaCatalog: PACriteria[] = [
  {
    payerId: 'payer-medicare',
    payerName: 'Medicare Part B',
    serviceCode: 'J0178',
    serviceDescription: 'Injection, aflibercept (Eylea), 1 mg',
    requiresPA: true,
    stepTherapyRequired: false,
    documentationRequired: ['CLINICAL_NOTES', 'DIAGNOSIS_SUPPORTING', 'LAB_RESULTS'],
    typicalTurnaround: '3-5 business days',
    urgentTurnaround: '72 hours',
    notes: 'Diagnosis of wet AMD, CRVO, BRVO, or diabetic macular edema required.',
  },
  {
    payerId: 'payer-medicare',
    payerName: 'Medicare Part B',
    serviceCode: 'J2778',
    serviceDescription: 'Injection, ranibizumab (Lucentis), 0.1 mg',
    requiresPA: true,
    stepTherapyRequired: false,
    documentationRequired: ['CLINICAL_NOTES', 'DIAGNOSIS_SUPPORTING'],
    typicalTurnaround: '3-5 business days',
    urgentTurnaround: '72 hours',
  },
  {
    payerId: 'payer-bcbs',
    payerName: 'Blue Cross Blue Shield',
    serviceCode: 'S0093',
    serviceDescription: 'Cyclosporine ophthalmic emulsion (Restasis), 0.05%, per 1 mL',
    requiresPA: true,
    stepTherapyRequired: true,
    stepTherapyDrugs: ['Artificial tears (OTC)', 'Punctal plugs'],
    documentationRequired: ['CLINICAL_NOTES', 'PRIOR_TREATMENT_HISTORY', 'LETTER_OF_MEDICAL_NECESSITY'],
    typicalTurnaround: '5-7 business days',
    urgentTurnaround: '72 hours',
    notes: 'Must document failure of 2 OTC lubricants for ≥3 months.',
  },
  {
    payerId: 'payer-bcbs',
    payerName: 'Blue Cross Blue Shield',
    serviceCode: 'J0178',
    serviceDescription: 'Injection, aflibercept (Eylea), 1 mg',
    requiresPA: true,
    stepTherapyRequired: true,
    stepTherapyDrugs: ['Bevacizumab (Avastin) off-label'],
    documentationRequired: ['CLINICAL_NOTES', 'DIAGNOSIS_SUPPORTING', 'LETTER_OF_MEDICAL_NECESSITY'],
    typicalTurnaround: '5-7 business days',
    urgentTurnaround: '72 hours',
    notes: 'BCBS requires trial of bevacizumab (Avastin) unless medically contraindicated.',
  },
  {
    payerId: 'payer-aetna',
    payerName: 'Aetna',
    serviceCode: 'S0093',
    serviceDescription: 'Cyclosporine ophthalmic emulsion (Restasis)',
    requiresPA: true,
    stepTherapyRequired: true,
    stepTherapyDrugs: ['Artificial tears (OTC) x 3 months'],
    documentationRequired: ['CLINICAL_NOTES', 'PRIOR_TREATMENT_HISTORY'],
    typicalTurnaround: '3 business days',
    urgentTurnaround: '24 hours',
  },
  {
    payerId: 'payer-united',
    payerName: 'UnitedHealthcare',
    serviceCode: 'J0178',
    serviceDescription: 'Injection, aflibercept (Eylea)',
    requiresPA: true,
    stepTherapyRequired: false,
    documentationRequired: ['CLINICAL_NOTES', 'DIAGNOSIS_SUPPORTING'],
    typicalTurnaround: '2-3 business days',
    urgentTurnaround: '24 hours',
  },
  {
    payerId: 'payer-united',
    payerName: 'UnitedHealthcare',
    serviceCode: '92132',
    serviceDescription: 'Scanning computerized ophthalmic diagnostic imaging, anterior segment',
    requiresPA: false,
    stepTherapyRequired: false,
    documentationRequired: [],
    typicalTurnaround: 'N/A – no PA required',
    urgentTurnaround: 'N/A',
  },
  {
    payerId: 'payer-cigna',
    payerName: 'Cigna',
    serviceCode: 'J0178',
    serviceDescription: 'Injection, aflibercept (Eylea)',
    requiresPA: true,
    stepTherapyRequired: false,
    documentationRequired: ['CLINICAL_NOTES', 'DIAGNOSIS_SUPPORTING', 'IMAGING'],
    typicalTurnaround: '3 business days',
    urgentTurnaround: '72 hours',
    notes: 'OCT imaging demonstrating subretinal fluid or macular edema required.',
  },
];

// ── Seed PA Requests ──────────────────────────────────────────────────────────
function buildSeedRequests(): PriorAuthRequest[] {
  const now = Date.now();

  const makeHistory = (steps: Array<{status: PAStatus; daysAgo: number; by: string; note?: string}>): PAStatusHistory[] =>
    steps.map(s => ({
      status: s.status,
      changedAt: new Date(now - s.daysAgo * 86_400_000).toISOString(),
      changedBy: s.by,
      note: s.note,
    }));

  const doc = (type: DocumentType, name: string, kb = 245): PADocument => ({
    id: uid('doc'),
    type,
    name,
    uploadedAt: daysAgo(5),
    uploadedBy: 'Dr. Emily Chen',
    sizeKb: kb,
    url: `/documents/${name.replace(/\s/g, '_').toLowerCase()}`,
  });

  const note = (content: string, internal = true): PANote => ({
    id: uid('pn'),
    authorId: 'dr-chen',
    authorName: 'Dr. Emily Chen',
    authorRole: 'Attending Ophthalmologist',
    content,
    isInternal: internal,
    createdAt: daysAgo(3),
  });

  return [
    // 1 – APPROVED Eylea for wet AMD
    {
      id: 'pa-001',
      patientId: 'pt-001',
      patientName: 'Margaret Sullivan',
      patientDob: '1948-03-12',
      insurancePlan: 'Medicare Part B',
      memberId: '1EG4-TE5-MK72',
      groupNumber: 'N/A',
      payerId: 'payer-medicare',
      payerName: 'Medicare Part B',
      providerId: 'dr-chen',
      providerName: 'Dr. Emily Chen',
      providerNpi: '1234567890',
      serviceType: 'DRUG',
      serviceCode: 'J0178',
      serviceDescription: 'Injection, aflibercept (Eylea), 1 mg — bilateral wet AMD',
      icdCodes: ['H35.31', 'H35.3190'],
      quantity: 1,
      unit: 'injection',
      startDate: daysAgo(20),
      endDate: daysFromNow(345),
      urgency: 'ROUTINE',
      status: 'APPROVED',
      submittedAt: daysAgo(18),
      decisionDate: daysAgo(13),
      expiresAt: daysFromNow(345),
      authNumber: 'MCR-2026-04471',
      decisionReason: 'MEDICALLY_NECESSARY',
      decisionNotes: 'Approved for 12 monthly injections. Diagnosis confirmed by OCT.',
      documents: [
        doc('CLINICAL_NOTES', 'Clinical Notes 2026-02-15.pdf', 312),
        doc('DIAGNOSIS_SUPPORTING', 'OCT Imaging Report.pdf', 890),
        doc('LAB_RESULTS', 'VA Testing Results.pdf', 145),
      ],
      notes: [note('Submitted urgent given patient vision loss. OCT shows active CNV OD.')],
      statusHistory: makeHistory([
        { status: 'DRAFT', daysAgo: 20, by: 'Maria Gonzalez' },
        { status: 'SUBMITTED', daysAgo: 18, by: 'Maria Gonzalez' },
        { status: 'UNDER_REVIEW', daysAgo: 16, by: 'System', note: 'Received by Medicare' },
        { status: 'APPROVED', daysAgo: 13, by: 'Medicare Reviewer', note: 'Auth MCR-2026-04471 issued' },
      ]),
      linkedRxId: 'rx-aflibercept-001',
      createdAt: daysAgo(20),
      updatedAt: daysAgo(13),
    },

    // 2 – PENDING_INFO Restasis for dry eye
    {
      id: 'pa-002',
      patientId: 'pt-003',
      patientName: 'Priya Nair',
      patientDob: '1975-08-22',
      insurancePlan: 'Blue Cross Blue Shield PPO',
      memberId: 'XYZ-98765-4',
      groupNumber: 'GRP-4455',
      payerId: 'payer-bcbs',
      payerName: 'Blue Cross Blue Shield',
      providerId: 'dr-patel',
      providerName: 'Dr. Raj Patel',
      providerNpi: '0987654321',
      serviceType: 'DRUG',
      serviceCode: 'S0093',
      serviceDescription: 'Cyclosporine ophthalmic 0.05% (Restasis) — severe dry eye disease',
      icdCodes: ['H04.129', 'H16.019'],
      quantity: 60,
      unit: 'single-use vials',
      urgency: 'ROUTINE',
      status: 'PENDING_INFO',
      submittedAt: daysAgo(7),
      decisionReason: 'MISSING_DOCUMENTATION',
      decisionNotes: 'BCBS requires documentation of prior OTC lubricant trials (≥3 months each for 2 agents) and punctal plug evaluation.',
      documents: [
        doc('CLINICAL_NOTES', 'Dry Eye Evaluation Notes.pdf', 278),
      ],
      notes: [
        note('BCBS requesting step therapy documentation. Will gather OTC trial records from patient.'),
        note('Patient confirms she used Systane and Refresh Tears for 4+ months each. Sending records.', false),
      ],
      statusHistory: makeHistory([
        { status: 'DRAFT', daysAgo: 8, by: 'Dr. Raj Patel' },
        { status: 'SUBMITTED', daysAgo: 7, by: 'Dr. Raj Patel' },
        { status: 'PENDING_INFO', daysAgo: 4, by: 'BCBS', note: 'Additional documentation required: step therapy history' },
      ]),
      createdAt: daysAgo(8),
      updatedAt: daysAgo(4),
    },

    // 3 – DENIED + APPEALED Eylea for BCBS
    {
      id: 'pa-003',
      patientId: 'pt-002',
      patientName: 'Derek Holloway',
      patientDob: '1962-11-05',
      insurancePlan: 'Blue Cross Blue Shield HMO',
      memberId: 'BCB-112233-7',
      groupNumber: 'GRP-1122',
      payerId: 'payer-bcbs',
      payerName: 'Blue Cross Blue Shield',
      providerId: 'dr-torres',
      providerName: 'Dr. Amy Torres',
      providerNpi: '1122334455',
      serviceType: 'DRUG',
      serviceCode: 'J0178',
      serviceDescription: 'Injection, aflibercept (Eylea), 1 mg — CRVO with macular edema',
      icdCodes: ['H34.832', 'H35.81'],
      quantity: 1,
      unit: 'injection',
      urgency: 'URGENT',
      status: 'APPEALED',
      submittedAt: daysAgo(25),
      decisionDate: daysAgo(18),
      decisionReason: 'STEP_THERAPY_REQUIRED',
      decisionNotes: 'BCBS requires trial of bevacizumab (Avastin) prior to Eylea unless contraindicated.',
      documents: [
        doc('CLINICAL_NOTES', 'CRVO Clinical Notes.pdf', 445),
        doc('IMAGING', 'OCT Macula Report CRVO.pdf', 1240),
        doc('LETTER_OF_MEDICAL_NECESSITY', 'Letter of Medical Necessity - Eylea.pdf', 85),
      ],
      notes: [
        note('Patient has CRVO with significant macular edema (CRT 480 µm). Avastin step therapy inappropriate given severity and potential for permanent vision loss.'),
        note('Filing appeal with peer-to-peer request. Clinical urgency documented.'),
      ],
      statusHistory: makeHistory([
        { status: 'DRAFT', daysAgo: 26, by: 'Dr. Amy Torres' },
        { status: 'SUBMITTED', daysAgo: 25, by: 'Dr. Amy Torres' },
        { status: 'UNDER_REVIEW', daysAgo: 22, by: 'System' },
        { status: 'DENIED', daysAgo: 18, by: 'BCBS Reviewer', note: 'Step therapy not documented' },
        { status: 'APPEALED', daysAgo: 14, by: 'Dr. Amy Torres', note: 'First-level appeal filed' },
      ]),
      appeal: {
        id: uid('appeal'),
        submittedAt: daysAgo(14),
        deadline: daysFromNow(16),
        appealType: 'FIRST_LEVEL',
        reason: 'Patient presents with acute CRVO and severe macular edema (CRT >450µm). Bevacizumab step therapy is medically contraindicated given the risk of rapid, permanent vision loss within the treatment window. AAO guidelines support immediate anti-VEGF therapy for CRVO.',
        additionalDocs: ['OCT Macula Report CRVO.pdf', 'AAO CRVO Treatment Guidelines 2022.pdf'],
        outcome: 'PENDING',
      },
      peerToPeer: {
        id: uid('p2p'),
        requestedAt: daysAgo(15),
        scheduledAt: daysFromNow(2),
        physicianName: 'Dr. Amy Torres',
        outcome: 'PENDING',
        notes: 'Scheduled peer-to-peer with BCBS medical director.',
      },
      createdAt: daysAgo(26),
      updatedAt: daysAgo(14),
    },

    // 4 – SUBMITTED Restasis for Aetna
    {
      id: 'pa-004',
      patientId: 'pt-004',
      patientName: 'James Kowalski',
      patientDob: '1950-06-18',
      insurancePlan: 'Aetna PPO',
      memberId: 'AET-556677-2',
      groupNumber: 'GRP-AETNA-99',
      payerId: 'payer-aetna',
      payerName: 'Aetna',
      providerId: 'dr-chen',
      providerName: 'Dr. Emily Chen',
      providerNpi: '1234567890',
      serviceType: 'DRUG',
      serviceCode: 'S0093',
      serviceDescription: 'Cyclosporine 0.05% (Restasis) — Sjögren\'s-related dry eye',
      icdCodes: ['H04.129', 'M35.0'],
      quantity: 60,
      unit: 'vials',
      urgency: 'ROUTINE',
      status: 'SUBMITTED',
      submittedAt: daysAgo(2),
      documents: [
        doc('CLINICAL_NOTES', 'Sjogrens Dry Eye Notes.pdf', 310),
        doc('PRIOR_TREATMENT_HISTORY', 'OTC Lubricant Trial History.pdf', 120),
      ],
      notes: [note('Submitted with 3-month OTC trial documentation. Aetna typically decides within 3 business days.')],
      statusHistory: makeHistory([
        { status: 'DRAFT', daysAgo: 3, by: 'Dr. Emily Chen' },
        { status: 'SUBMITTED', daysAgo: 2, by: 'Dr. Emily Chen' },
      ]),
      createdAt: daysAgo(3),
      updatedAt: daysAgo(2),
    },

    // 5 – APPROVED Eylea UnitedHealthcare
    {
      id: 'pa-005',
      patientId: 'pt-005',
      patientName: 'Rosa Delgado',
      patientDob: '1944-09-30',
      insurancePlan: 'UnitedHealthcare Advantage',
      memberId: 'UHC-334455-8',
      groupNumber: 'GRP-UHC-MA',
      payerId: 'payer-united',
      payerName: 'UnitedHealthcare',
      providerId: 'dr-patel',
      providerName: 'Dr. Raj Patel',
      providerNpi: '0987654321',
      serviceType: 'DRUG',
      serviceCode: 'J0178',
      serviceDescription: 'Injection, aflibercept (Eylea) — diabetic macular edema',
      icdCodes: ['E11.311', 'H36.0'],
      quantity: 1,
      unit: 'injection',
      urgency: 'ROUTINE',
      status: 'APPROVED',
      submittedAt: daysAgo(12),
      decisionDate: daysAgo(9),
      expiresAt: daysFromNow(180),
      authNumber: 'UHC-2026-88991',
      decisionReason: 'MEDICALLY_NECESSARY',
      decisionNotes: 'Approved. Criteria met for diabetic macular edema.',
      documents: [
        doc('CLINICAL_NOTES', 'DME Clinical Notes.pdf', 298),
        doc('DIAGNOSIS_SUPPORTING', 'OCT Macula DME.pdf', 1050),
      ],
      notes: [note('Quick approval — UHC typically approves within 2-3 days for DME.')],
      statusHistory: makeHistory([
        { status: 'DRAFT', daysAgo: 13, by: 'Dr. Raj Patel' },
        { status: 'SUBMITTED', daysAgo: 12, by: 'Dr. Raj Patel' },
        { status: 'UNDER_REVIEW', daysAgo: 11, by: 'System' },
        { status: 'APPROVED', daysAgo: 9, by: 'UHC Reviewer', note: 'Auth UHC-2026-88991 issued' },
      ]),
      createdAt: daysAgo(13),
      updatedAt: daysAgo(9),
    },

    // 6 – DRAFT (not yet submitted)
    {
      id: 'pa-006',
      patientId: 'pt-006',
      patientName: 'Arthur Kim',
      patientDob: '1938-12-01',
      insurancePlan: 'Cigna Open Access Plus',
      memberId: 'CIG-778899-1',
      groupNumber: 'GRP-CIGNA-45',
      payerId: 'payer-cigna',
      payerName: 'Cigna',
      providerId: 'dr-chen',
      providerName: 'Dr. Emily Chen',
      providerNpi: '1234567890',
      serviceType: 'DRUG',
      serviceCode: 'J0178',
      serviceDescription: 'Injection, aflibercept (Eylea) — neovascular AMD',
      icdCodes: ['H35.3190'],
      quantity: 1,
      unit: 'injection',
      urgency: 'URGENT',
      status: 'DRAFT',
      documents: [],
      notes: [note('Need to attach OCT imaging before submission.')],
      statusHistory: makeHistory([
        { status: 'DRAFT', daysAgo: 1, by: 'Dr. Emily Chen' },
      ]),
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    },

    // 7 – EXPIRED
    {
      id: 'pa-007',
      patientId: 'pt-007',
      patientName: 'Barbara Tran',
      patientDob: '1955-04-14',
      insurancePlan: 'Medicare Part B',
      memberId: '2TG7-XK9-PL44',
      groupNumber: 'N/A',
      payerId: 'payer-medicare',
      payerName: 'Medicare Part B',
      providerId: 'dr-patel',
      providerName: 'Dr. Raj Patel',
      providerNpi: '0987654321',
      serviceType: 'DRUG',
      serviceCode: 'J2778',
      serviceDescription: 'Injection, ranibizumab (Lucentis) — wet AMD',
      icdCodes: ['H35.31'],
      quantity: 1,
      unit: 'injection',
      urgency: 'ROUTINE',
      status: 'EXPIRED',
      submittedAt: daysAgo(370),
      decisionDate: daysAgo(362),
      expiresAt: daysAgo(5),
      authNumber: 'MCR-2025-11042',
      decisionReason: 'MEDICALLY_NECESSARY',
      decisionNotes: 'Auth expired. Renewal required for continued treatment.',
      documents: [
        doc('CLINICAL_NOTES', 'Lucentis Auth 2025 Notes.pdf', 265),
      ],
      notes: [note('Auth expired. Need to renew for 2026 treatment cycle.')],
      statusHistory: makeHistory([
        { status: 'DRAFT', daysAgo: 372, by: 'Staff' },
        { status: 'SUBMITTED', daysAgo: 370, by: 'Staff' },
        { status: 'APPROVED', daysAgo: 362, by: 'Medicare', note: 'Auth MCR-2025-11042' },
        { status: 'EXPIRED', daysAgo: 5, by: 'System', note: 'Authorization expired after 12 months' },
      ]),
      createdAt: daysAgo(372),
      updatedAt: daysAgo(5),
    },
  ];
}

// ── KV seed / load ────────────────────────────────────────────────────────────
export async function seedPARequests(kv: KVNamespace): Promise<void> {
  const seeded = await kvGet<boolean>(kv, PA_SEED);
  if (seeded) return;

  const requests = buildSeedRequests();
  const ids: string[] = [];

  for (const req of requests) {
    await kvPut(kv, paKey(req.id), req);
    ids.push(req.id);
  }
  await kvPut(kv, PA_IDX, ids);
  await kvPut(kv, PA_SEED, true);
}

export async function listPARequests(
  kv: KVNamespace,
  filters: { status?: string; patientId?: string; providerId?: string; serviceType?: string; urgency?: string } = {}
): Promise<PriorAuthRequest[]> {
  await seedPARequests(kv);
  const ids = (await kvGet<string[]>(kv, PA_IDX)) ?? [];
  const requests: PriorAuthRequest[] = [];

  for (const id of ids) {
    const r = await kvGet<PriorAuthRequest>(kv, paKey(id));
    if (!r) continue;
    if (filters.status && r.status !== filters.status) continue;
    if (filters.patientId && r.patientId !== filters.patientId) continue;
    if (filters.providerId && r.providerId !== filters.providerId) continue;
    if (filters.serviceType && r.serviceType !== filters.serviceType) continue;
    if (filters.urgency && r.urgency !== filters.urgency) continue;
    requests.push(r);
  }

  return requests.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPARequest(kv: KVNamespace, id: string): Promise<PriorAuthRequest | null> {
  await seedPARequests(kv);
  return kvGet<PriorAuthRequest>(kv, paKey(id));
}

export async function createPARequest(
  kv: KVNamespace,
  input: Partial<PriorAuthRequest>
): Promise<PriorAuthRequest> {
  await seedPARequests(kv);
  const now = iso();
  const id = uid('pa');

  const req: PriorAuthRequest = {
    id,
    patientId: input.patientId ?? '',
    patientName: input.patientName ?? '',
    patientDob: input.patientDob ?? '',
    insurancePlan: input.insurancePlan ?? '',
    memberId: input.memberId ?? '',
    groupNumber: input.groupNumber ?? '',
    payerId: input.payerId ?? '',
    payerName: input.payerName ?? '',
    providerId: input.providerId ?? '',
    providerName: input.providerName ?? '',
    providerNpi: input.providerNpi ?? '',
    serviceType: (input.serviceType as PAServiceType) ?? 'DRUG',
    serviceCode: input.serviceCode ?? '',
    serviceDescription: input.serviceDescription ?? '',
    icdCodes: input.icdCodes ?? [],
    quantity: input.quantity,
    unit: input.unit,
    startDate: input.startDate,
    endDate: input.endDate,
    urgency: (input.urgency as PAUrgency) ?? 'ROUTINE',
    status: 'DRAFT',
    documents: [],
    notes: [],
    statusHistory: [{ status: 'DRAFT', changedAt: now, changedBy: input.providerId ?? 'unknown' }],
    createdAt: now,
    updatedAt: now,
  };

  await kvPut(kv, paKey(id), req);
  const ids = (await kvGet<string[]>(kv, PA_IDX)) ?? [];
  await kvPut(kv, PA_IDX, [...ids, id]);
  return req;
}

export async function updatePAStatus(
  kv: KVNamespace,
  id: string,
  status: PAStatus,
  meta: { changedBy: string; reason?: PADecisionReason; notes?: string; authNumber?: string }
): Promise<PriorAuthRequest | null> {
  const req = await getPARequest(kv, id);
  if (!req) return null;

  const now = iso();
  req.status = status;
  req.updatedAt = now;

  if (meta.authNumber) req.authNumber = meta.authNumber;
  if (meta.reason) req.decisionReason = meta.reason;
  if (meta.notes) req.decisionNotes = meta.notes;

  if (status === 'SUBMITTED') req.submittedAt = now;
  if (['APPROVED','DENIED','APPEAL_APPROVED','APPEAL_DENIED'].includes(status)) req.decisionDate = now;

  req.statusHistory.push({
    status,
    changedAt: now,
    changedBy: meta.changedBy,
    reason: meta.reason,
    note: meta.notes,
  });

  await kvPut(kv, paKey(id), req);
  return req;
}

export async function addPADocument(
  kv: KVNamespace,
  id: string,
  doc: Omit<PADocument, 'id'>
): Promise<PriorAuthRequest | null> {
  const req = await getPARequest(kv, id);
  if (!req) return null;
  req.documents.push({ ...doc, id: uid('doc') });
  req.updatedAt = iso();
  await kvPut(kv, paKey(id), req);
  return req;
}

export async function addPANote(
  kv: KVNamespace,
  id: string,
  note: Omit<PANote, 'id' | 'createdAt'>
): Promise<PriorAuthRequest | null> {
  const req = await getPARequest(kv, id);
  if (!req) return null;
  req.notes.push({ ...note, id: uid('pn'), createdAt: iso() });
  req.updatedAt = iso();
  await kvPut(kv, paKey(id), req);
  return req;
}

export async function submitAppeal(
  kv: KVNamespace,
  id: string,
  appeal: Omit<AppealRecord, 'id' | 'submittedAt'>
): Promise<PriorAuthRequest | null> {
  const req = await getPARequest(kv, id);
  if (!req) return null;

  req.appeal = { ...appeal, id: uid('appeal'), submittedAt: iso() };
  req.status = 'APPEALED';
  req.updatedAt = iso();
  req.statusHistory.push({
    status: 'APPEALED',
    changedAt: iso(),
    changedBy: 'provider',
    note: `Appeal filed: ${appeal.appealType}`,
  });

  await kvPut(kv, paKey(id), req);
  return req;
}

export async function schedulePeerToPeer(
  kv: KVNamespace,
  id: string,
  p2p: Omit<PeerToPeerRequest, 'id' | 'requestedAt'>
): Promise<PriorAuthRequest | null> {
  const req = await getPARequest(kv, id);
  if (!req) return null;

  req.peerToPeer = { ...p2p, id: uid('p2p'), requestedAt: iso() };
  req.updatedAt = iso();
  await kvPut(kv, paKey(id), req);
  return req;
}

export async function deletePARequest(kv: KVNamespace, id: string): Promise<boolean> {
  const req = await getPARequest(kv, id);
  if (!req) return false;
  await kvDel(kv, paKey(id));
  const ids = (await kvGet<string[]>(kv, PA_IDX)) ?? [];
  await kvPut(kv, PA_IDX, ids.filter(x => x !== id));
  return true;
}

export async function getPADashboard(kv: KVNamespace): Promise<PADashboardStats> {
  const all = await listPARequests(kv);

  const active: PAStatus[] = ['SUBMITTED','PENDING_INFO','UNDER_REVIEW','APPEALED'];
  const totalActive = all.filter(r => active.includes(r.status)).length;
  const pendingSubmission = all.filter(r => r.status === 'DRAFT').length;
  const awaitingDecision = all.filter(r => ['SUBMITTED','UNDER_REVIEW'].includes(r.status)).length;
  const approved = all.filter(r => ['APPROVED','APPEAL_APPROVED'].includes(r.status)).length;
  const denied = all.filter(r => ['DENIED','APPEAL_DENIED'].includes(r.status)).length;
  const appealed = all.filter(r => r.status === 'APPEALED').length;
  const expiringSoon = all.filter(r => {
    if (!r.expiresAt || r.status !== 'APPROVED') return false;
    return new Date(r.expiresAt).getTime() - Date.now() < 30 * 86_400_000;
  }).length;

  const decided = all.filter(r => ['APPROVED','APPEAL_APPROVED','DENIED','APPEAL_DENIED'].includes(r.status));
  const approvalRate = decided.length > 0
    ? decided.filter(r => ['APPROVED','APPEAL_APPROVED'].includes(r.status)).length / decided.length
    : 0;

  // avg turnaround for decided requests (submitted → decision)
  const turnarounds = decided
    .filter(r => r.submittedAt && r.decisionDate)
    .map(r => (new Date(r.decisionDate!).getTime() - new Date(r.submittedAt!).getTime()) / 86_400_000);
  const avgTurnaroundDays = turnarounds.length > 0
    ? Math.round(turnarounds.reduce((s, t) => s + t, 0) / turnarounds.length)
    : 0;

  return {
    totalActive,
    pendingSubmission,
    awaitingDecision,
    approved,
    denied,
    appealed,
    expiringSoon,
    avgTurnaroundDays,
    approvalRate,
    recentRequests: all.slice(0, 5),
  };
}

export function lookupPACriteria(payerId?: string, serviceCode?: string): PACriteria[] {
  let results = paCriteriaCatalog;
  if (payerId) results = results.filter(c => c.payerId === payerId);
  if (serviceCode) results = results.filter(c => c.serviceCode === serviceCode);
  return results;
}

export const VALID_PA_STATUSES: PAStatus[] = [
  'DRAFT','SUBMITTED','PENDING_INFO','UNDER_REVIEW',
  'APPROVED','DENIED','APPEALED','APPEAL_APPROVED','APPEAL_DENIED','EXPIRED','WITHDRAWN',
];

export const VALID_SERVICE_TYPES: PAServiceType[] = [
  'DRUG','PROCEDURE','EQUIPMENT','LAB','REFERRAL','IMAGING',
];

export const VALID_URGENCY: PAUrgency[] = ['ROUTINE','URGENT','EXPEDITED'];
