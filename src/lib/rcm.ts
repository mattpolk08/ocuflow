// Phase 9A – Revenue Cycle Management library (KV-backed, seed data, business logic)

import type {
  RCMClaim, ClaimStatus, ClaimLine, ClaimPayment, ClaimDenial, ClaimNote,
  RemittanceAdvice, PatientStatement, PaymentPlan,
  RCMDashboardStats, AgingBucket, DenialReason, PayerType, PaymentMethod,
} from '../types/rcm';

// ─── KV helpers ───────────────────────────────────────────────────────────────
async function kvGet<T>(kv: KVNamespace, key: string): Promise<T | null> {
  const v = await kv.get(key, 'text');
  return v ? JSON.parse(v) as T : null;
}
async function kvPut(kv: KVNamespace, key: string, val: unknown): Promise<void> {
  await kv.put(key, JSON.stringify(val));
}
async function kvDel(kv: KVNamespace, key: string): Promise<void> {
  await kv.delete(key);
}

// ─── Key constants ────────────────────────────────────────────────────────────
const RCM_SEED = 'rcm:seeded';
const CLAIM_IDX = 'rcm:claim:idx';
const ERA_IDX   = 'rcm:era:idx';
const STMT_IDX  = 'rcm:stmt:idx';
const PP_IDX    = 'rcm:pp:idx';

const claimKey = (id: string) => `rcm:claim:${id}`;
const eraKey   = (id: string) => `rcm:era:${id}`;
const stmtKey  = (id: string) => `rcm:stmt:${id}`;
const ppKey    = (id: string) => `rcm:pp:${id}`;

// ─── Seed data ────────────────────────────────────────────────────────────────
const now = () => new Date().toISOString();

function makeLines(serviceDate: string): ClaimLine[] {
  return [
    {
      id: `ln-${Math.random().toString(36).slice(2,8)}`,
      cptCode: '92004',
      description: 'Comprehensive eye exam, new patient',
      units: 1,
      chargedAmount: 220,
      allowedAmount: 165,
      paidAmount: 132,
      adjustmentAmount: 55,
      patientResponsibility: 33,
      diagnosisCodes: ['H52.4'],
      serviceDate,
    },
  ];
}

const SEED_CLAIMS: Omit<RCMClaim, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'rcm-001', claimNumber: 'CLM-2026-001',
    patientId: 'pt-001', patientName: 'Margaret Sullivan',
    payerId: 'pyr-001', payerName: 'BlueCross BlueShield', payerType: 'COMMERCIAL',
    insurancePlan: 'PPO Gold', memberId: 'BCB-102938475', groupNumber: 'GRP-5550',
    providerId: 'dr-chen', providerName: 'Dr. Emily Chen', providerNpi: '1234567890',
    serviceDate: '2026-02-15', submittedDate: '2026-02-16',
    status: 'PAID',
    totalCharged: 220, totalAllowed: 165, totalPaid: 132,
    totalAdjustment: 55, totalPatientResponsibility: 33,
    outstandingBalance: 0,
    agingBucket: 'CURRENT',
    claimLines: makeLines('2026-02-15'),
    payments: [{ id: 'pay-001', paymentDate: '2026-03-01', amount: 132, method: 'EFT', referenceNumber: 'EFT-88221', postedBy: 'admin', claimLines: [] }],
    denials: [],
    notes: [],
    diagnosisCodes: ['H52.4'],
    placeOfService: '11',
    examId: 'exam-001',
    priorAuthNumber: undefined,
  },
  {
    id: 'rcm-002', claimNumber: 'CLM-2026-002',
    patientId: 'pt-002', patientName: 'Derek Holloway',
    payerId: 'pyr-002', payerName: 'Aetna', payerType: 'COMMERCIAL',
    insurancePlan: 'HMO Select', memberId: 'AET-773829104',
    providerId: 'dr-chen', providerName: 'Dr. Emily Chen',
    serviceDate: '2026-02-18', submittedDate: '2026-02-19',
    status: 'PENDING',
    totalCharged: 350, totalAllowed: 280, totalPaid: 0,
    totalAdjustment: 0, totalPatientResponsibility: 0,
    outstandingBalance: 350,
    agingBucket: '1_30',
    claimLines: [
      { id: 'ln-02a', cptCode: '92004', description: 'Comprehensive eye exam, new', units: 1, chargedAmount: 220, allowedAmount: 165, diagnosisCodes: ['H40.1130'], serviceDate: '2026-02-18' },
      { id: 'ln-02b', cptCode: '92020', description: 'Gonioscopy', units: 1, chargedAmount: 130, allowedAmount: 115, diagnosisCodes: ['H40.1130'], serviceDate: '2026-02-18' },
    ],
    payments: [],
    denials: [],
    notes: [{ id: 'nt-01', authorId: 'admin', authorName: 'Billing Admin', content: 'Awaiting payer acknowledgment', createdAt: '2026-02-20T10:00:00Z', isInternal: true }],
    diagnosisCodes: ['H40.1130'],
    placeOfService: '11',
  },
  {
    id: 'rcm-003', claimNumber: 'CLM-2026-003',
    patientId: 'pt-003', patientName: 'Linda Tran',
    payerId: 'pyr-003', payerName: 'Medicare Part B', payerType: 'MEDICARE',
    insurancePlan: 'Medicare B', memberId: 'MED-4A8827693B',
    providerId: 'dr-patel', providerName: 'Dr. Raj Patel',
    serviceDate: '2026-02-10', submittedDate: '2026-02-11',
    status: 'DENIED',
    totalCharged: 185, totalAllowed: 0, totalPaid: 0,
    totalAdjustment: 0, totalPatientResponsibility: 0,
    outstandingBalance: 185,
    agingBucket: '31_60',
    claimLines: [{ id: 'ln-03a', cptCode: '92250', description: 'Fundus photography', units: 1, chargedAmount: 185, diagnosisCodes: ['E11.3511'], serviceDate: '2026-02-10' }],
    payments: [],
    denials: [{
      id: 'den-001', deniedDate: '2026-02-25', reason: 'MEDICAL_NECESSITY',
      reasonDescription: 'No documentation of medical necessity for fundus photography',
      claimLineIds: ['ln-03a'],
      appealDeadline: '2026-04-25',
    }],
    notes: [],
    diagnosisCodes: ['E11.3511'],
    placeOfService: '11',
  },
  {
    id: 'rcm-004', claimNumber: 'CLM-2026-004',
    patientId: 'pt-004', patientName: 'James Okoye',
    payerId: 'pyr-001', payerName: 'BlueCross BlueShield', payerType: 'COMMERCIAL',
    insurancePlan: 'PPO Silver', memberId: 'BCB-209384755',
    providerId: 'dr-chen', providerName: 'Dr. Emily Chen',
    serviceDate: '2026-01-28',
    status: 'DRAFT',
    totalCharged: 0, outstandingBalance: 0,
    agingBucket: 'CURRENT',
    claimLines: [],
    payments: [],
    denials: [],
    notes: [],
    diagnosisCodes: ['H26.9'],
    placeOfService: '11',
  },
  {
    id: 'rcm-005', claimNumber: 'CLM-2026-005',
    patientId: 'pt-005', patientName: 'Sarah Nguyen',
    payerId: 'pyr-004', payerName: 'Cigna', payerType: 'COMMERCIAL',
    insurancePlan: 'Open Access Plus', memberId: 'CIG-338847201',
    providerId: 'dr-patel', providerName: 'Dr. Raj Patel',
    serviceDate: '2026-01-15', submittedDate: '2026-01-16',
    status: 'PARTIAL_PAYMENT',
    totalCharged: 480, totalAllowed: 380, totalPaid: 200,
    totalAdjustment: 100, totalPatientResponsibility: 80,
    outstandingBalance: 180,
    agingBucket: '31_60',
    claimLines: [
      { id: 'ln-05a', cptCode: '92004', description: 'Comprehensive exam', units: 1, chargedAmount: 220, allowedAmount: 165, paidAmount: 132, adjustmentAmount: 55, patientResponsibility: 33, diagnosisCodes: ['H52.4'], serviceDate: '2026-01-15' },
      { id: 'ln-05b', cptCode: '92310', description: 'Contact lens fitting, monofocal', units: 1, chargedAmount: 260, allowedAmount: 215, paidAmount: 68, adjustmentAmount: 45, patientResponsibility: 47, diagnosisCodes: ['H52.4'], serviceDate: '2026-01-15' },
    ],
    payments: [{ id: 'pay-005', paymentDate: '2026-02-10', amount: 200, method: 'EFT', postedBy: 'admin', claimLines: [] }],
    denials: [],
    notes: [],
    diagnosisCodes: ['H52.4'],
    placeOfService: '11',
  },
  {
    id: 'rcm-006', claimNumber: 'CLM-2026-006',
    patientId: 'pt-006', patientName: 'Robert Kim',
    payerId: 'pyr-003', payerName: 'Medicare Part B', payerType: 'MEDICARE',
    insurancePlan: 'Medicare B', memberId: 'MED-7D9283810C',
    providerId: 'dr-chen', providerName: 'Dr. Emily Chen',
    serviceDate: '2026-01-05', submittedDate: '2026-01-06',
    status: 'APPEALED',
    totalCharged: 310, totalAllowed: 0, totalPaid: 0,
    outstandingBalance: 310,
    agingBucket: '61_90',
    claimLines: [{ id: 'ln-06a', cptCode: '67210', description: 'Laser photocoagulation, retinal detachment', units: 1, chargedAmount: 310, diagnosisCodes: ['H33.3210'], serviceDate: '2026-01-05' }],
    payments: [],
    denials: [{
      id: 'den-002', deniedDate: '2026-01-25', reason: 'AUTHORIZATION_REQUIRED',
      reasonDescription: 'Prior authorization not obtained for laser procedure',
      claimLineIds: ['ln-06a'],
      appealDeadline: '2026-03-25',
      appealedDate: '2026-02-10',
    }],
    notes: [{ id: 'nt-06', authorId: 'admin', authorName: 'Billing Admin', content: 'Appeal submitted with clinical documentation', createdAt: '2026-02-10T14:00:00Z', isInternal: true }],
    diagnosisCodes: ['H33.3210'],
    placeOfService: '11',
  },
  {
    id: 'rcm-007', claimNumber: 'CLM-2025-087',
    patientId: 'pt-007', patientName: 'Emma Vasquez',
    payerId: 'pyr-005', payerName: 'Medicaid', payerType: 'MEDICAID',
    insurancePlan: 'State Medicaid', memberId: 'MCD-882930011',
    providerId: 'dr-patel', providerName: 'Dr. Raj Patel',
    serviceDate: '2025-11-20', submittedDate: '2025-11-21',
    status: 'WRITTEN_OFF',
    totalCharged: 150, totalAllowed: 0, totalPaid: 0,
    totalAdjustment: 150,
    outstandingBalance: 0,
    agingBucket: 'OVER_120',
    claimLines: [{ id: 'ln-07a', cptCode: '99213', description: 'Office visit, established', units: 1, chargedAmount: 150, adjustmentAmount: 150, diagnosisCodes: ['H57.9'], serviceDate: '2025-11-20' }],
    payments: [],
    denials: [{ id: 'den-003', deniedDate: '2025-12-15', reason: 'ELIGIBILITY', reasonDescription: 'Patient not eligible on date of service', claimLineIds: ['ln-07a'] }],
    notes: [],
    diagnosisCodes: ['H57.9'],
    placeOfService: '11',
  },
  {
    id: 'rcm-008', claimNumber: 'CLM-2026-008',
    patientId: 'pt-002', patientName: 'Derek Holloway',
    payerId: 'pyr-001', payerName: 'BlueCross BlueShield', payerType: 'COMMERCIAL',
    insurancePlan: 'PPO Gold', memberId: 'BCB-102938475',
    providerId: 'dr-chen', providerName: 'Dr. Emily Chen',
    serviceDate: '2026-03-01',
    status: 'READY_TO_SUBMIT',
    totalCharged: 520, outstandingBalance: 520,
    agingBucket: 'CURRENT',
    claimLines: [
      { id: 'ln-08a', cptCode: '66984', description: 'Cataract removal with IOL insertion', units: 1, chargedAmount: 520, diagnosisCodes: ['H26.9'], serviceDate: '2026-03-01' },
    ],
    payments: [],
    denials: [],
    notes: [],
    diagnosisCodes: ['H26.9'],
    placeOfService: '21',
    priorAuthNumber: 'PA-2026-0045',
  },
];

const SEED_ERAS: RemittanceAdvice[] = [
  {
    id: 'era-001', payerId: 'pyr-001', payerName: 'BlueCross BlueShield',
    checkDate: '2026-03-01', eftTraceNumber: 'EFT-88221',
    totalPayment: 132, claimsCount: 1, claimIds: ['rcm-001'],
    status: 'POSTED', receivedDate: '2026-03-02', postedBy: 'admin', postedDate: '2026-03-02T09:00:00Z',
  },
  {
    id: 'era-002', payerId: 'pyr-004', payerName: 'Cigna',
    checkDate: '2026-02-10', eftTraceNumber: 'EFT-77341',
    totalPayment: 200, claimsCount: 1, claimIds: ['rcm-005'],
    status: 'POSTED', receivedDate: '2026-02-11', postedBy: 'admin', postedDate: '2026-02-11T10:30:00Z',
  },
  {
    id: 'era-003', payerId: 'pyr-002', payerName: 'Aetna',
    checkDate: '2026-03-05', eftTraceNumber: 'EFT-90112',
    totalPayment: 0, claimsCount: 1, claimIds: ['rcm-002'],
    status: 'RECEIVED', receivedDate: '2026-03-06',
  },
];

const SEED_STATEMENTS: PatientStatement[] = [
  {
    id: 'stmt-001', patientId: 'pt-001', patientName: 'Margaret Sullivan',
    patientEmail: 'margaret.sullivan@email.com',
    statementDate: '2026-03-05', dueDate: '2026-04-04',
    totalDue: 33, claimIds: ['rcm-001'],
    status: 'SENT', sentDate: '2026-03-05',
  },
  {
    id: 'stmt-002', patientId: 'pt-005', patientName: 'Sarah Nguyen',
    statementDate: '2026-02-15', dueDate: '2026-03-17',
    totalDue: 80, claimIds: ['rcm-005'],
    status: 'OVERDUE',
  },
  {
    id: 'stmt-003', patientId: 'pt-002', patientName: 'Derek Holloway',
    statementDate: '2026-03-06', dueDate: '2026-04-05',
    totalDue: 0, claimIds: ['rcm-002'],
    status: 'DRAFT',
  },
];

const SEED_PLANS: PaymentPlan[] = [
  {
    id: 'pp-001', patientId: 'pt-005', patientName: 'Sarah Nguyen',
    totalBalance: 180, monthlyPayment: 60,
    startDate: '2026-03-01', endDate: '2026-06-01',
    status: 'ACTIVE',
    payments: [
      { date: '2026-03-01', amount: 60, status: 'PAID' },
      { date: '2026-04-01', amount: 60, status: 'SCHEDULED' },
      { date: '2026-05-01', amount: 60, status: 'SCHEDULED' },
    ],
    claimIds: ['rcm-005'],
    createdAt: '2026-02-28T11:00:00Z',
  },
];

// ─── Seed function ────────────────────────────────────────────────────────────
export async function seedRCM(kv: KVNamespace): Promise<void> {
  const seeded = await kvGet<boolean>(kv, RCM_SEED);
  if (seeded) return;

  const ts = now();
  const claimIds: string[] = [];
  for (const c of SEED_CLAIMS) {
    const full: RCMClaim = { ...c, createdAt: ts, updatedAt: ts };
    await kvPut(kv, claimKey(c.id), full);
    claimIds.push(c.id);
  }
  await kvPut(kv, CLAIM_IDX, claimIds);

  const eraIds: string[] = [];
  for (const e of SEED_ERAS) {
    await kvPut(kv, eraKey(e.id), e);
    eraIds.push(e.id);
  }
  await kvPut(kv, ERA_IDX, eraIds);

  const stmtIds: string[] = [];
  for (const s of SEED_STATEMENTS) {
    await kvPut(kv, stmtKey(s.id), s);
    stmtIds.push(s.id);
  }
  await kvPut(kv, STMT_IDX, stmtIds);

  const ppIds: string[] = [];
  for (const p of SEED_PLANS) {
    await kvPut(kv, ppKey(p.id), p);
    ppIds.push(p.id);
  }
  await kvPut(kv, PP_IDX, ppIds);

  await kvPut(kv, RCM_SEED, true);
}

// ─── Claim CRUD ───────────────────────────────────────────────────────────────
export async function listClaims(kv: KVNamespace, filters?: { status?: string; patientId?: string; payerId?: string }): Promise<RCMClaim[]> {
  await seedRCM(kv);
  const ids = (await kvGet<string[]>(kv, CLAIM_IDX)) ?? [];
  const claims: RCMClaim[] = [];
  for (const id of ids) {
    const c = await kvGet<RCMClaim>(kv, claimKey(id));
    if (c) claims.push(c);
  }
  let result = claims;
  if (filters?.status) result = result.filter(c => c.status === filters.status);
  if (filters?.patientId) result = result.filter(c => c.patientId === filters.patientId);
  if (filters?.payerId) result = result.filter(c => c.payerId === filters.payerId);
  return result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function getClaim(kv: KVNamespace, id: string): Promise<RCMClaim | null> {
  await seedRCM(kv);
  return kvGet<RCMClaim>(kv, claimKey(id));
}

export async function createClaim(kv: KVNamespace, data: Partial<RCMClaim>): Promise<RCMClaim> {
  await seedRCM(kv);
  const ids = (await kvGet<string[]>(kv, CLAIM_IDX)) ?? [];
  const nextNum = String(ids.length + 1).padStart(3, '0');
  const ts = now();
  const id = `rcm-${Date.now().toString(36)}`;
  const claimNumber = `CLM-${new Date().getFullYear()}-${nextNum}`;

  const claim: RCMClaim = {
    id, claimNumber,
    patientId: data.patientId ?? '',
    patientName: data.patientName ?? '',
    payerId: data.payerId ?? '',
    payerName: data.payerName ?? '',
    payerType: data.payerType ?? 'COMMERCIAL',
    insurancePlan: data.insurancePlan ?? '',
    memberId: data.memberId ?? '',
    groupNumber: data.groupNumber,
    providerId: data.providerId ?? '',
    providerName: data.providerName ?? '',
    providerNpi: data.providerNpi,
    serviceDate: data.serviceDate ?? ts.slice(0, 10),
    status: 'DRAFT',
    totalCharged: data.totalCharged ?? 0,
    outstandingBalance: data.totalCharged ?? 0,
    agingBucket: 'CURRENT',
    claimLines: data.claimLines ?? [],
    payments: [],
    denials: [],
    notes: [],
    diagnosisCodes: data.diagnosisCodes ?? [],
    placeOfService: data.placeOfService ?? '11',
    priorAuthNumber: data.priorAuthNumber,
    examId: data.examId,
    createdAt: ts,
    updatedAt: ts,
  };

  await kvPut(kv, claimKey(id), claim);
  await kvPut(kv, CLAIM_IDX, [...ids, id]);
  return claim;
}

export async function updateClaimStatus(kv: KVNamespace, id: string, status: ClaimStatus, userId: string): Promise<RCMClaim | null> {
  const claim = await getClaim(kv, id);
  if (!claim) return null;
  const valid: ClaimStatus[] = ['DRAFT','READY_TO_SUBMIT','SUBMITTED','ACKNOWLEDGED','PENDING','UNDER_REVIEW','PARTIAL_PAYMENT','PAID','DENIED','APPEALED','APPEAL_APPROVED','APPEAL_DENIED','VOIDED','WRITTEN_OFF'];
  if (!valid.includes(status)) return null;
  const updated: RCMClaim = { ...claim, status, updatedAt: now() };
  if (status === 'SUBMITTED' && !claim.submittedDate) updated.submittedDate = now().slice(0, 10);
  await kvPut(kv, claimKey(id), updated);
  return updated;
}

export async function postPayment(kv: KVNamespace, claimId: string, payment: Omit<ClaimPayment, 'id'>): Promise<RCMClaim | null> {
  const claim = await getClaim(kv, claimId);
  if (!claim) return null;
  const pmt: ClaimPayment = { ...payment, id: `pay-${Date.now().toString(36)}` };
  const payments = [...claim.payments, pmt];
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const updated: RCMClaim = {
    ...claim,
    payments,
    totalPaid,
    outstandingBalance: Math.max(0, claim.totalCharged - totalPaid),
    status: totalPaid >= claim.totalCharged ? 'PAID' : 'PARTIAL_PAYMENT',
    updatedAt: now(),
  };
  await kvPut(kv, claimKey(claimId), updated);
  return updated;
}

export async function addDenial(kv: KVNamespace, claimId: string, denial: Omit<ClaimDenial, 'id'>): Promise<RCMClaim | null> {
  const claim = await getClaim(kv, claimId);
  if (!claim) return null;
  const d: ClaimDenial = { ...denial, id: `den-${Date.now().toString(36)}` };
  const updated: RCMClaim = { ...claim, denials: [...claim.denials, d], status: 'DENIED', updatedAt: now() };
  await kvPut(kv, claimKey(claimId), updated);
  return updated;
}

export async function addClaimNote(kv: KVNamespace, claimId: string, note: Omit<ClaimNote, 'id' | 'createdAt'>): Promise<RCMClaim | null> {
  const claim = await getClaim(kv, claimId);
  if (!claim) return null;
  const n: ClaimNote = { ...note, id: `nt-${Date.now().toString(36)}`, createdAt: now() };
  const updated: RCMClaim = { ...claim, notes: [...claim.notes, n], updatedAt: now() };
  await kvPut(kv, claimKey(claimId), updated);
  return updated;
}

export async function deleteClaim(kv: KVNamespace, id: string): Promise<boolean> {
  const c = await getClaim(kv, id);
  if (!c) return false;
  await kvDel(kv, claimKey(id));
  const ids = (await kvGet<string[]>(kv, CLAIM_IDX)) ?? [];
  await kvPut(kv, CLAIM_IDX, ids.filter(x => x !== id));
  return true;
}

// ─── ERA / Remittance ─────────────────────────────────────────────────────────
export async function listERAs(kv: KVNamespace): Promise<RemittanceAdvice[]> {
  await seedRCM(kv);
  const ids = (await kvGet<string[]>(kv, ERA_IDX)) ?? [];
  const eras: RemittanceAdvice[] = [];
  for (const id of ids) {
    const e = await kvGet<RemittanceAdvice>(kv, eraKey(id));
    if (e) eras.push(e);
  }
  return eras.sort((a, b) => new Date(b.checkDate).getTime() - new Date(a.checkDate).getTime());
}

export async function getERA(kv: KVNamespace, id: string): Promise<RemittanceAdvice | null> {
  await seedRCM(kv);
  return kvGet<RemittanceAdvice>(kv, eraKey(id));
}

export async function createERA(kv: KVNamespace, data: Partial<RemittanceAdvice>): Promise<RemittanceAdvice> {
  await seedRCM(kv);
  const ids = (await kvGet<string[]>(kv, ERA_IDX)) ?? [];
  const id = `era-${Date.now().toString(36)}`;
  const era: RemittanceAdvice = {
    id,
    payerId: data.payerId ?? '',
    payerName: data.payerName ?? '',
    checkDate: data.checkDate ?? now().slice(0, 10),
    checkNumber: data.checkNumber,
    eftTraceNumber: data.eftTraceNumber,
    totalPayment: data.totalPayment ?? 0,
    claimsCount: data.claimIds?.length ?? 0,
    claimIds: data.claimIds ?? [],
    status: 'RECEIVED',
    receivedDate: now().slice(0, 10),
  };
  await kvPut(kv, eraKey(id), era);
  await kvPut(kv, ERA_IDX, [...ids, id]);
  return era;
}

// ─── Patient Statements ───────────────────────────────────────────────────────
export async function listStatements(kv: KVNamespace, patientId?: string): Promise<PatientStatement[]> {
  await seedRCM(kv);
  const ids = (await kvGet<string[]>(kv, STMT_IDX)) ?? [];
  const stmts: PatientStatement[] = [];
  for (const id of ids) {
    const s = await kvGet<PatientStatement>(kv, stmtKey(id));
    if (s) stmts.push(s);
  }
  if (patientId) return stmts.filter(s => s.patientId === patientId);
  return stmts.sort((a, b) => new Date(b.statementDate).getTime() - new Date(a.statementDate).getTime());
}

export async function getStatement(kv: KVNamespace, id: string): Promise<PatientStatement | null> {
  await seedRCM(kv);
  return kvGet<PatientStatement>(kv, stmtKey(id));
}

export async function createStatement(kv: KVNamespace, data: Partial<PatientStatement>): Promise<PatientStatement> {
  await seedRCM(kv);
  const ids = (await kvGet<string[]>(kv, STMT_IDX)) ?? [];
  const id = `stmt-${Date.now().toString(36)}`;
  const stmt: PatientStatement = {
    id,
    patientId: data.patientId ?? '',
    patientName: data.patientName ?? '',
    patientEmail: data.patientEmail,
    statementDate: data.statementDate ?? now().slice(0, 10),
    dueDate: data.dueDate ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    totalDue: data.totalDue ?? 0,
    claimIds: data.claimIds ?? [],
    status: 'DRAFT',
  };
  await kvPut(kv, stmtKey(id), stmt);
  await kvPut(kv, STMT_IDX, [...ids, id]);
  return stmt;
}

// ─── Payment Plans ────────────────────────────────────────────────────────────
export async function listPaymentPlans(kv: KVNamespace, patientId?: string): Promise<PaymentPlan[]> {
  await seedRCM(kv);
  const ids = (await kvGet<string[]>(kv, PP_IDX)) ?? [];
  const plans: PaymentPlan[] = [];
  for (const id of ids) {
    const p = await kvGet<PaymentPlan>(kv, ppKey(id));
    if (p) plans.push(p);
  }
  if (patientId) return plans.filter(p => p.patientId === patientId);
  return plans;
}

export async function getPaymentPlan(kv: KVNamespace, id: string): Promise<PaymentPlan | null> {
  await seedRCM(kv);
  return kvGet<PaymentPlan>(kv, ppKey(id));
}

export async function createPaymentPlan(kv: KVNamespace, data: Partial<PaymentPlan>): Promise<PaymentPlan> {
  await seedRCM(kv);
  const ids = (await kvGet<string[]>(kv, PP_IDX)) ?? [];
  const id = `pp-${Date.now().toString(36)}`;
  const monthlyPayment = data.monthlyPayment ?? Math.ceil((data.totalBalance ?? 0) / 3);
  const months = monthlyPayment > 0 ? Math.ceil((data.totalBalance ?? 0) / monthlyPayment) : 1;
  const startDate = data.startDate ?? now().slice(0, 10);
  const endDate = data.endDate ?? new Date(new Date(startDate).getTime() + months * 30 * 86400000).toISOString().slice(0, 10);
  const plan: PaymentPlan = {
    id,
    patientId: data.patientId ?? '',
    patientName: data.patientName ?? '',
    totalBalance: data.totalBalance ?? 0,
    monthlyPayment,
    startDate, endDate,
    status: 'ACTIVE',
    payments: Array.from({ length: months }, (_, i) => ({
      date: new Date(new Date(startDate).getTime() + i * 30 * 86400000).toISOString().slice(0, 10),
      amount: i === months - 1 ? (data.totalBalance ?? 0) - monthlyPayment * (months - 1) : monthlyPayment,
      status: 'SCHEDULED' as const,
    })),
    claimIds: data.claimIds ?? [],
    createdAt: now(),
  };
  await kvPut(kv, ppKey(id), plan);
  await kvPut(kv, PP_IDX, [...ids, id]);
  return plan;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export async function getRCMDashboard(kv: KVNamespace): Promise<RCMDashboardStats> {
  const all = await listClaims(kv);

  const totalCharges = all.reduce((s, c) => s + c.totalCharged, 0);
  const totalCollected = all.reduce((s, c) => s + (c.totalPaid ?? 0), 0);
  const totalOutstanding = all.reduce((s, c) => s + c.outstandingBalance, 0);
  const collectionRate = totalCharges > 0 ? Math.round((totalCollected / totalCharges) * 100) : 0;

  const submitted = all.filter(c => c.submittedDate);
  const cleanClaims = submitted.filter(c => c.denials.length === 0).length;
  const cleanClaimRate = submitted.length > 0 ? Math.round((cleanClaims / submitted.length) * 100) : 0;

  const denied = all.filter(c => ['DENIED','APPEAL_DENIED'].includes(c.status)).length;
  const denialRate = submitted.length > 0 ? Math.round((denied / submitted.length) * 100) : 0;

  // Avg days to payment (for paid claims)
  const paidClaims = all.filter(c => c.status === 'PAID' && c.submittedDate && c.payments.length > 0);
  const avgDays = paidClaims.length > 0
    ? Math.round(paidClaims.reduce((s, c) => {
        const submitDate = new Date(c.submittedDate!).getTime();
        const payDate = new Date(c.payments[c.payments.length - 1].paymentDate).getTime();
        return s + (payDate - submitDate) / 86400000;
      }, 0) / paidClaims.length)
    : 0;

  const buckets: AgingBucket[] = ['CURRENT', '1_30', '31_60', '61_90', '91_120', 'OVER_120'];
  const agingBuckets = buckets.map(bucket => ({
    bucket,
    count: all.filter(c => c.agingBucket === bucket).length,
    amount: all.filter(c => c.agingBucket === bucket).reduce((s, c) => s + c.outstandingBalance, 0),
  }));

  const denialMap = new Map<DenialReason, { count: number; amount: number }>();
  for (const claim of all) {
    for (const d of claim.denials) {
      const existing = denialMap.get(d.reason) ?? { count: 0, amount: 0 };
      denialMap.set(d.reason, {
        count: existing.count + 1,
        amount: existing.amount + claim.totalCharged,
      });
    }
  }
  const topDenialReasons = [...denialMap.entries()]
    .map(([reason, v]) => ({ reason, ...v }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const payerMap = new Map<PayerType, { collected: number; total: number }>();
  for (const c of all) {
    const existing = payerMap.get(c.payerType) ?? { collected: 0, total: 0 };
    payerMap.set(c.payerType, {
      collected: existing.collected + (c.totalPaid ?? 0),
      total: existing.total + c.totalCharged,
    });
  }
  const payerMix = [...payerMap.entries()].map(([payerType, v]) => ({
    payerType,
    percentage: totalCharges > 0 ? Math.round((v.total / totalCharges) * 100) : 0,
    collected: v.collected,
  }));

  return {
    totalCharges,
    totalCollected,
    totalOutstanding,
    collectionRate,
    cleanClaimRate,
    denialRate,
    avgDaysToPayment: avgDays,
    claimsInFlight: all.filter(c => ['SUBMITTED','ACKNOWLEDGED','PENDING','UNDER_REVIEW','APPEALED'].includes(c.status)).length,
    pendingClaims: all.filter(c => c.status === 'PENDING').length,
    deniedClaims: denied,
    readyToSubmit: all.filter(c => c.status === 'READY_TO_SUBMIT').length,
    draftClaims: all.filter(c => c.status === 'DRAFT').length,
    recentActivity: all.slice(0, 5),
    agingBuckets,
    topDenialReasons,
    payerMix,
  };
}

// ─── Meta ─────────────────────────────────────────────────────────────────────
export const VALID_CLAIM_STATUSES: ClaimStatus[] = [
  'DRAFT','READY_TO_SUBMIT','SUBMITTED','ACKNOWLEDGED','PENDING',
  'UNDER_REVIEW','PARTIAL_PAYMENT','PAID','DENIED','APPEALED',
  'APPEAL_APPROVED','APPEAL_DENIED','VOIDED','WRITTEN_OFF',
];

export const DENIAL_REASONS: DenialReason[] = [
  'NOT_COVERED','AUTHORIZATION_REQUIRED','MEDICAL_NECESSITY','DUPLICATE_CLAIM',
  'TIMELY_FILING','ELIGIBILITY','COORDINATION_OF_BENEFITS','CODING_ERROR',
  'MISSING_INFORMATION','BUNDLING','FREQUENCY_LIMITATION','OTHER',
];

export const PAYER_TYPES: PayerType[] = [
  'COMMERCIAL','MEDICARE','MEDICAID','TRICARE','WORKERS_COMP','SELF_PAY','OTHER',
];

export const PAYMENT_METHODS: PaymentMethod[] = [
  'CHECK','EFT','CREDIT_CARD','CASH','PATIENT_PORTAL','ADJUSTMENT','WRITE_OFF',
];
