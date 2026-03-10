// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — eRx E-Prescribing (Phase D1-7) — D1-backed
// erx_prescriptions, erx_pdmp_reports, erx_allergies → D1
// Static data (DRUG_FORMULARY, PHARMACIES, INTERACTIONS) stay in-memory.
// KV param kept for backward-compat but NOT used for data.
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Prescription, RxStatus, DrugEntry, Pharmacy, PdmpReport,
  DrugInteraction, PatientAllergy, RefillEvent, RxDashboard,
  ControlledSchedule, DosageForm,
} from '../types/erx'
import { dbGet, dbAll, dbRun, now as dbNow } from './db'

// ── Ophthalmic Drug Formulary (static, in-memory) ─────────────────────────────
export const DRUG_FORMULARY: DrugEntry[] = [
  { id:'drug-001', name:'Lumigan',       genericName:'bimatoprost 0.01%',  ndc:'00023-9187-10', rxcui:'372656',  form:'EYE_DROPS',    strength:'0.01%',  unit:'mL', schedule:'NON_CONTROLLED', category:'Glaucoma',       commonDosing:'1 drop OU QHS',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:185 },
  { id:'drug-002', name:'Xalatan',       genericName:'latanoprost 0.005%', ndc:'00069-3140-03', rxcui:'203457',  form:'EYE_DROPS',    strength:'0.005%', unit:'mL', schedule:'NON_CONTROLLED', category:'Glaucoma',       commonDosing:'1 drop OU QHS',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:95  },
  { id:'drug-003', name:'Timoptic',      genericName:'timolol 0.5%',       ndc:'00006-3528-03', rxcui:'10600',   form:'EYE_DROPS',    strength:'0.5%',   unit:'mL', schedule:'NON_CONTROLLED', category:'Glaucoma',       commonDosing:'1 drop OU BID',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:45  },
  { id:'drug-004', name:'Alphagan P',    genericName:'brimonidine 0.1%',   ndc:'00023-9197-05', rxcui:'172525',  form:'EYE_DROPS',    strength:'0.1%',   unit:'mL', schedule:'NON_CONTROLLED', category:'Glaucoma',       commonDosing:'1 drop OU TID',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:70  },
  { id:'drug-005', name:'Azopt',         genericName:'brinzolamide 1%',    ndc:'00065-0271-10', rxcui:'73914',   form:'EYE_DROPS',    strength:'1%',     unit:'mL', schedule:'NON_CONTROLLED', category:'Glaucoma',       commonDosing:'1 drop OU TID',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:false, avgCost:140 },
  { id:'drug-006', name:'Rocklatan',     genericName:'netarsudil/latanoprost', ndc:'65162-455-04', rxcui:'2375678', form:'EYE_DROPS', strength:'0.02%/0.005%', unit:'mL', schedule:'NON_CONTROLLED', category:'Glaucoma', commonDosing:'1 drop OU QHS', maxRefills:5, isOphthalmic:true, requiresPdmp:false, genericAvailable:false, avgCost:320 },
  { id:'drug-007', name:'Vigamox',       genericName:'moxifloxacin 0.5%',  ndc:'00065-4013-03', rxcui:'351357',  form:'EYE_DROPS',    strength:'0.5%',   unit:'mL', schedule:'NON_CONTROLLED', category:'Anti-infective', commonDosing:'1 drop OU TID x 7d', maxRefills:0, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:65  },
  { id:'drug-008', name:'Zymar',         genericName:'gatifloxacin 0.3%',  ndc:'00065-4013-08', rxcui:'283921',  form:'EYE_DROPS',    strength:'0.3%',   unit:'mL', schedule:'NON_CONTROLLED', category:'Anti-infective', commonDosing:'1 drop OU QID x 7d', maxRefills:0, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:55  },
  { id:'drug-009', name:'Erythromycin',  genericName:'erythromycin 0.5%',  ndc:'00574-0085-35', rxcui:'4053',    form:'EYE_OINTMENT', strength:'0.5%',   unit:'g',  schedule:'NON_CONTROLLED', category:'Anti-infective', commonDosing:'Apply OU QID x 7d',  maxRefills:0, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:20  },
  { id:'drug-010', name:'Pred Forte',    genericName:'prednisolone 1%',    ndc:'00023-0351-05', rxcui:'8638',    form:'EYE_DROPS',    strength:'1%',     unit:'mL', schedule:'NON_CONTROLLED', category:'Corticosteroid', commonDosing:'1 drop OU QID',      maxRefills:2, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:40  },
  { id:'drug-011', name:'Lotemax',       genericName:'loteprednol 0.5%',   ndc:'00065-0011-05', rxcui:'203892',  form:'EYE_DROPS',    strength:'0.5%',   unit:'mL', schedule:'NON_CONTROLLED', category:'Corticosteroid', commonDosing:'1 drop OU QID',      maxRefills:2, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:165 },
  { id:'drug-012', name:'Nevanac',       genericName:'nepafenac 0.1%',     ndc:'00065-0036-03', rxcui:'327361',  form:'EYE_DROPS',    strength:'0.1%',   unit:'mL', schedule:'NON_CONTROLLED', category:'NSAID',          commonDosing:'1 drop OU TID',      maxRefills:0, isOphthalmic:true,  requiresPdmp:false, genericAvailable:false, avgCost:180 },
  { id:'drug-013', name:'Acular',        genericName:'ketorolac 0.5%',     ndc:'00023-8892-05', rxcui:'35827',   form:'EYE_DROPS',    strength:'0.5%',   unit:'mL', schedule:'NON_CONTROLLED', category:'NSAID',          commonDosing:'1 drop OU QID',      maxRefills:0, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:50  },
  { id:'drug-014', name:'Restasis',      genericName:'cyclosporine 0.05%', ndc:'00023-9163-30', rxcui:'227956',  form:'EYE_DROPS',    strength:'0.05%',  unit:'mL', schedule:'NON_CONTROLLED', category:'Dry Eye',        commonDosing:'1 drop OU BID',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:false, avgCost:470 },
  { id:'drug-015', name:'Xiidra',        genericName:'lifitegrast 5%',     ndc:'00078-0709-15', rxcui:'1860489', form:'EYE_DROPS',    strength:'5%',     unit:'mL', schedule:'NON_CONTROLLED', category:'Dry Eye',        commonDosing:'1 drop OU BID',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:false, avgCost:550 },
  { id:'drug-016', name:'Pataday',       genericName:'olopatadine 0.2%',   ndc:'00065-0090-25', rxcui:'311918',  form:'EYE_DROPS',    strength:'0.2%',   unit:'mL', schedule:'NON_CONTROLLED', category:'Anti-allergy',   commonDosing:'1 drop OU QD',       maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:80  },
  { id:'drug-017', name:'Zaditor',       genericName:'ketotifen 0.035%',   ndc:'00067-6271-03', rxcui:'253547',  form:'EYE_DROPS',    strength:'0.035%', unit:'mL', schedule:'NON_CONTROLLED', category:'Anti-allergy',   commonDosing:'1 drop OU BID',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:15  },
  { id:'drug-018', name:'Mydriacyl',     genericName:'tropicamide 1%',     ndc:'00065-0433-10', rxcui:'11106',   form:'EYE_DROPS',    strength:'1%',     unit:'mL', schedule:'NON_CONTROLLED', category:'Mydriatic',      commonDosing:'1-2 drops OU 15-20m before exam', maxRefills:0, isOphthalmic:true, requiresPdmp:false, genericAvailable:true,  avgCost:25  },
  { id:'drug-019', name:'Cyclogyl',      genericName:'cyclopentolate 1%',  ndc:'00065-0425-10', rxcui:'2838',    form:'EYE_DROPS',    strength:'1%',     unit:'mL', schedule:'NON_CONTROLLED', category:'Cycloplegic',    commonDosing:'1-2 drops OU 40-50m before exam', maxRefills:0, isOphthalmic:true, requiresPdmp:false, genericAvailable:true,  avgCost:30  },
  { id:'drug-020', name:'Ativan',        genericName:'lorazepam 0.5mg',    ndc:'00187-5000-01', rxcui:'28137',   form:'ORAL_TABLET',  strength:'0.5mg',  unit:'tablet', schedule:'CIV',        category:'Anxiolytic',     commonDosing:'0.5mg PO PRN anxiety', maxRefills:0, isOphthalmic:false, requiresPdmp:true,  genericAvailable:true,  avgCost:15  },
  { id:'drug-021', name:'Valium',        genericName:'diazepam 5mg',       ndc:'00140-0005-01', rxcui:'3322',    form:'ORAL_TABLET',  strength:'5mg',    unit:'tablet', schedule:'CIV',        category:'Anxiolytic',     commonDosing:'5mg PO PRN anxiety',   maxRefills:0, isOphthalmic:false, requiresPdmp:true,  genericAvailable:true,  avgCost:20  },
]

export const DRUG_MAP: Record<string, DrugEntry> = Object.fromEntries(DRUG_FORMULARY.map(d => [d.id, d]))

const INTERACTIONS: DrugInteraction[] = [
  { id:'int-001', drug1Id:'drug-003', drug1Name:'Timoptic (timolol)', drug2Id:'drug-021', drug2Name:'Valium (diazepam)', severity:'MODERATE', description:'Beta-blockers may mask hypoglycemia symptoms when combined with CNS depressants', clinicalEffect:'Enhanced bradycardia, hypotension', mechanism:'Additive CNS/cardiovascular depression', management:'Monitor heart rate and blood pressure closely', evidenceLevel:'B' },
  { id:'int-002', drug1Id:'drug-004', drug1Name:'Alphagan P (brimonidine)', drug2Id:'drug-020', drug2Name:'Ativan (lorazepam)', severity:'MODERATE', description:'Additive CNS depression with concomitant use', clinicalEffect:'Enhanced sedation, respiratory depression risk', mechanism:'Both agents depress CNS via alpha-2 and GABA pathways', management:'Use lowest effective doses; monitor sedation', evidenceLevel:'B' },
  { id:'int-003', drug1Id:'drug-010', drug1Name:'Pred Forte (prednisolone)', drug2Id:'drug-013', drug2Name:'Acular (ketorolac)', severity:'MINOR', description:'Corticosteroids and NSAIDs together may reduce additive anti-inflammatory benefit', clinicalEffect:'Possible reduced wound healing', mechanism:'Opposing prostaglandin pathways', management:'Monitor IOP; separate by at least 5 minutes', evidenceLevel:'C' },
  { id:'int-004', drug1Id:'drug-001', drug1Name:'Lumigan (bimatoprost)', drug2Id:'drug-002', drug2Name:'Xalatan (latanoprost)', severity:'MODERATE', description:'Two prostaglandin analogues together do not provide additive IOP lowering', clinicalEffect:'No added IOP benefit; increased conjunctival hyperemia', mechanism:'Same receptor class, competitive binding', management:'Avoid concurrent use; choose one agent', evidenceLevel:'A' },
]

export const PHARMACIES: Pharmacy[] = [
  { id:'pharm-001', name:'CVS Pharmacy #7891',         type:'RETAIL',      npi:'1234567890', ncpdpId:'7891234', address:'450 Ocean Drive',     city:'Miami Beach', state:'FL', zip:'33139', phone:'(305) 555-0101', fax:'(305) 555-0102', acceptsEPrescribe:true,  acceptsControlled:false, hours:'Mon-Sun 8am-10pm',  isPreferred:true  },
  { id:'pharm-002', name:'Walgreens #5423',             type:'RETAIL',      npi:'1234567891', ncpdpId:'5423876', address:'1200 Lincoln Road',    city:'Miami Beach', state:'FL', zip:'33139', phone:'(305) 555-0201', fax:'(305) 555-0202', acceptsEPrescribe:true,  acceptsControlled:true,  hours:'Mon-Sun 24hrs',     isPreferred:true  },
  { id:'pharm-003', name:'Express Scripts Mail Order',  type:'MAIL_ORDER',  npi:'1234567892', ncpdpId:'1111222', address:'1 Express Way',        city:'St. Louis',   state:'MO', zip:'63121', phone:'(800) 555-0301', fax:'(800) 555-0302', acceptsEPrescribe:true,  acceptsControlled:false, hours:'Mon-Fri 8am-6pm',   isPreferred:false },
  { id:'pharm-004', name:'Ocular Specialty Pharmacy',   type:'SPECIALTY',   npi:'1234567893', ncpdpId:'9993210', address:'600 Brickell Ave',     city:'Miami',       state:'FL', zip:'33131', phone:'(305) 555-0401', fax:'(305) 555-0402', acceptsEPrescribe:true,  acceptsControlled:false, hours:'Mon-Fri 9am-5pm',   isPreferred:false },
  { id:'pharm-005', name:'Compounding Center of FL',    type:'COMPOUNDING', npi:'1234567894', ncpdpId:'8882345', address:'200 Coral Way',        city:'Coral Gables',state:'FL', zip:'33134', phone:'(305) 555-0501', fax:'(305) 555-0502', acceptsEPrescribe:false, acceptsControlled:false, hours:'Mon-Fri 9am-5pm',   isPreferred:false },
]
export const PHARMACY_MAP = Object.fromEntries(PHARMACIES.map(p => [p.id, p]))

// ── Row mapper ────────────────────────────────────────────────────────────────
function rowToRx(r: Record<string, unknown>): Prescription {
  const parse = (v: unknown) => v ? JSON.parse(v as string) : [];
  const drug  = DRUG_MAP[r.drug_id as string];
  return {
    id:             r.id as string,
    patientId:      r.patient_id as string,
    patientName:    r.patient_name as string,
    patientDob:     '',
    providerId:     r.provider_id as string,
    providerName:   r.provider_name as string,
    providerNpi:    '',
    drugId:         r.drug_id as string,
    drugName:       r.drug_name as string,
    genericName:    drug?.genericName ?? '',
    strength:       drug?.strength ?? '',
    form:           (drug?.form ?? 'EYE_DROPS') as DosageForm,
    sig: {
      quantity:            r.quantity as number,
      unit:                'mL',
      daysSupply:          r.days_supply as number,
      refills:             r.refills as number,
      dosageInstructions:  r.sig as string,
      frequencyCode:       '',
      route:               'OU',
      prn:                 false,
    },
    rxType:         'NEW',
    status:         r.status as RxStatus,
    pharmacyId:     r.pharmacy_id as string | undefined,
    pharmacyName:   r.pharmacy_name as string | undefined,
    daw:            Boolean(r.daw),
    clinicalNote:   r.notes as string | undefined,
    pdmpChecked:    false,
    pdmpStatus:     'NOT_CHECKED',
    drugInteractions: [],
    allergyAlerts:  [],
    diagnosisCodes: parse(r.diagnosis_codes),
    isControlled:   Boolean(r.is_controlled),
    schedule:       (r.controlled_schedule ?? 'NON_CONTROLLED') as ControlledSchedule,
    writtenDate:    r.prescribed_date as string,
    signedAt:       r.sent_date as string | undefined,
    sentAt:         r.sent_date as string | undefined,
    filledAt:       r.filled_date as string | undefined,
    expiresAt:      '',
    refillHistory:  parse(r.refill_history),
    createdAt:      r.created_at as string,
    updatedAt:      r.updated_at as string,
  };
}

// ── ensureErxSeed ─────────────────────────────────────────────────────────────
// Seeding done via SQL migration 0013; no-op kept for backward-compat.
export async function ensureErxSeed(kv: KVNamespace, db?: D1Database): Promise<void> { /* migration */ }

// ── listPrescriptions ─────────────────────────────────────────────────────────
export async function listPrescriptions(
  kv: KVNamespace,
  filters?: { patientId?: string; providerId?: string; status?: string },
  db?: D1Database
): Promise<Prescription[]> {
  if (!db) return [];
  const conditions: string[] = [];
  const params: unknown[]    = [];
  if (filters?.patientId)  { conditions.push('patient_id=?');  params.push(filters.patientId); }
  if (filters?.providerId) { conditions.push('provider_id=?'); params.push(filters.providerId); }
  if (filters?.status)     { conditions.push('status=?');      params.push(filters.status); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM erx_prescriptions ${where} ORDER BY prescribed_date DESC`, params
  );
  return rows.map(rowToRx);
}

// ── getPrescription ───────────────────────────────────────────────────────────
export async function getPrescription(kv: KVNamespace, id: string, db?: D1Database): Promise<Prescription | null> {
  if (!db) return null;
  const row = await dbGet<Record<string, unknown>>(db,
    `SELECT * FROM erx_prescriptions WHERE id=?`, [id]
  );
  return row ? rowToRx(row) : null;
}

// ── createPrescription ────────────────────────────────────────────────────────
export async function createPrescription(
  kv: KVNamespace,
  data: Partial<Prescription> & { patientId: string; providerId: string; drugId: string },
  db?: D1Database
): Promise<Prescription> {
  if (!db) throw new Error('D1 required');
  const now = dbNow();
  const id  = data.id ?? `rx-${Date.now().toString(36)}`;
  const drug = DRUG_MAP[data.drugId];
  await dbRun(db,
    `INSERT INTO erx_prescriptions
       (id, patient_id, patient_name, provider_id, provider_name,
        drug_id, drug_name, sig, quantity, days_supply, refills, refills_remaining,
        daw, status, pharmacy_id, pharmacy_name,
        prescribed_date, is_controlled, requires_prior_auth,
        diagnosis_codes, notes, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, data.patientId, data.patientName ?? '',
      data.providerId, data.providerName ?? '',
      data.drugId, data.drugName ?? drug?.name ?? '',
      data.sig?.dosageInstructions ?? '',
      data.sig?.quantity ?? 0, data.sig?.daysSupply ?? 30,
      data.sig?.refills ?? 0, data.sig?.refills ?? 0,
      data.daw ? 1 : 0,
      data.status ?? 'DRAFT',
      data.pharmacyId ?? null, data.pharmacyName ?? null,
      data.writtenDate ?? now.slice(0, 10),
      data.isControlled ? 1 : 0,
      drug?.requiresPdmp ? 1 : 0,
      JSON.stringify(data.diagnosisCodes ?? []),
      data.clinicalNote ?? null,
      now, now,
    ]
  );
  return (await getPrescription(kv, id, db))!;
}

// ── updateRxStatus ────────────────────────────────────────────────────────────
export async function updateRxStatus(
  kv: KVNamespace, id: string, status: RxStatus, userId: string, db?: D1Database
): Promise<Prescription | null> {
  if (!db) return null;
  const now = dbNow();
  if (status === 'SENT') {
    await dbRun(db, `UPDATE erx_prescriptions SET status=?, sent_date=?, updated_at=? WHERE id=?`, [status, now, now, id]);
  } else if (status === 'FILLED') {
    await dbRun(db, `UPDATE erx_prescriptions SET status=?, filled_date=?, updated_at=? WHERE id=?`, [status, now, now, id]);
  } else {
    await dbRun(db, `UPDATE erx_prescriptions SET status=?, updated_at=? WHERE id=?`, [status, now, id]);
  }
  return getPrescription(kv, id, db);
}

// ── updatePrescription ────────────────────────────────────────────────────────
export async function updatePrescription(
  kv: KVNamespace, id: string, updates: Partial<Prescription>, db?: D1Database
): Promise<Prescription | null> {
  if (!db) return null;
  const sets: string[]  = ['updated_at=?'];
  const vals: unknown[] = [dbNow()];
  if (updates.pharmacyId   !== undefined) { sets.push('pharmacy_id=?');   vals.push(updates.pharmacyId); }
  if (updates.pharmacyName !== undefined) { sets.push('pharmacy_name=?'); vals.push(updates.pharmacyName); }
  if (updates.status       !== undefined) { sets.push('status=?');        vals.push(updates.status); }
  if (updates.clinicalNote !== undefined) { sets.push('notes=?');         vals.push(updates.clinicalNote); }
  vals.push(id);
  await dbRun(db, `UPDATE erx_prescriptions SET ${sets.join(', ')} WHERE id=?`, vals);
  return getPrescription(kv, id, db);
}

// ── Static utilities ─────────────────────────────────────────────────────────
export function searchFormulary(query: string, category?: string): DrugEntry[] {
  const q = query.toLowerCase();
  return DRUG_FORMULARY.filter(d =>
    (!category || d.category.toLowerCase() === category.toLowerCase()) &&
    (d.name.toLowerCase().includes(q) || d.genericName.toLowerCase().includes(q))
  ).slice(0, 20);
}

export function getDrugInteractionCheck(drugId: string, currentDrugIds: string[]): DrugInteraction[] {
  return INTERACTIONS.filter(i =>
    (i.drug1Id === drugId && currentDrugIds.includes(i.drug2Id)) ||
    (i.drug2Id === drugId && currentDrugIds.includes(i.drug1Id))
  );
}

// ── PDMP ──────────────────────────────────────────────────────────────────────
export async function listPdmpReports(kv: KVNamespace, patientId?: string, db?: D1Database): Promise<PdmpReport[]> {
  if (!db) return [];
  const rows = patientId
    ? await dbAll<Record<string, unknown>>(db,
        `SELECT * FROM erx_pdmp_reports WHERE patient_id=? ORDER BY requested_at DESC`, [patientId])
    : await dbAll<Record<string, unknown>>(db,
        `SELECT * FROM erx_pdmp_reports ORDER BY requested_at DESC`);
  return rows.map(r => ({
    ...JSON.parse((r.report_data as string) || '{}'),
    id: r.id as string,
    patientId: r.patient_id as string,
    patientName: r.patient_name as string,
    requestedBy: r.requested_by as string,
    requestedAt: r.requested_at as string,
  }));
}

export async function requestPdmpCheck(
  kv: KVNamespace,
  patientId: string,
  patientName: string,
  requestedBy: string,
  db?: D1Database
): Promise<PdmpReport> {
  if (!db) throw new Error('D1 required');
  const now = dbNow();
  const id  = `pdmp-${Date.now().toString(36)}`;
  const report: PdmpReport = {
    id, patientId, patientName, requestedBy,
    requestedAt: now, status: 'CLEAR',
    riskScore: 0, riskFactors: [], prescriptions: [],
    reportNotes: 'No controlled substance history found in PDMP.',
    expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  };
  await dbRun(db,
    `INSERT INTO erx_pdmp_reports (id, patient_id, patient_name, requested_by, requested_at, report_data, created_at)
     VALUES (?,?,?,?,?,?,?)`,
    [id, patientId, patientName, requestedBy, now, JSON.stringify(report), now]
  );
  return report;
}

// ── Allergies ─────────────────────────────────────────────────────────────────
export async function getPatientAllergies(kv: KVNamespace, patientId: string, db?: D1Database): Promise<PatientAllergy[]> {
  if (!db) return [];
  const rows = await dbAll<Record<string, unknown>>(db,
    `SELECT * FROM erx_allergies WHERE patient_id=? AND is_active=1`, [patientId]
  );
  return rows.map(r => ({
    id:           r.id as string,
    patientId:    r.patient_id as string,
    allergen:     r.allergen as string,
    allergenType: 'DRUG' as PatientAllergy['allergenType'],
    reaction:     (r.reaction as string | undefined) ?? 'OTHER',
    severity:     (r.severity as PatientAllergy['severity']) ?? 'MODERATE',
    onsetDate:    r.onset_date as string | undefined,
    notes:        r.verified_by as string | undefined,
    isActive:     Boolean(r.is_active),
    recordedBy:   r.verified_by as string | undefined,
    recordedAt:   r.created_at as string,
  }));
}

export async function addPatientAllergy(
  kv: KVNamespace,
  patientId: string,
  allergyData: Omit<PatientAllergy, 'id' | 'patientId' | 'recordedAt'>,
  db?: D1Database
): Promise<PatientAllergy> {
  if (!db) throw new Error('D1 required');
  const now = dbNow();
  const id  = `alg-${Date.now().toString(36)}`;
  await dbRun(db,
    `INSERT INTO erx_allergies
       (id, patient_id, allergen, reaction, severity, onset_date, verified_by, is_active, created_at)
     VALUES (?,?,?,?,?,?,?,1,?)`,
    [id, patientId, allergyData.allergen, allergyData.reaction ?? 'OTHER',
     allergyData.severity ?? 'MODERATE', allergyData.onsetDate ?? null,
     allergyData.recordedBy ?? null, now]
  );
  return { id, patientId, recordedAt: now, ...allergyData };
}

// ── Refill request ────────────────────────────────────────────────────────────
export async function requestRefill(
  kv: KVNamespace, rxId: string, requestedBy: string, db?: D1Database
): Promise<Prescription | null> {
  if (!db) return null;
  const rx = await getPrescription(kv, rxId, db);
  if (!rx || rx.refillHistory === undefined) return null;
  if ((rx.sig.refills ?? 0) <= 0) return null;

  const event: RefillEvent = {
    id:            `ref-${Date.now().toString(36)}`,
    requestedAt:   dbNow(),
    requestedBy,
    status:        'PENDING',
    pharmacyId:    rx.pharmacyId,
    pharmacyName:  rx.pharmacyName,
  };

  const history = [...(rx.refillHistory ?? []), event];
  await dbRun(db,
    `UPDATE erx_prescriptions
       SET refill_history=?, refills_remaining=MAX(0, refills_remaining-1), updated_at=?
     WHERE id=?`,
    [JSON.stringify(history), dbNow(), rxId]
  );
  return getPrescription(kv, rxId, db);
}

// ── eRx Dashboard ─────────────────────────────────────────────────────────────
export async function getErxDashboard(kv: KVNamespace, db?: D1Database): Promise<RxDashboard> {
  if (!db) return {
    pendingReview: 0, pendingSign: 0, pendingSend: 0,
    refillRequests: 0, drugInteractionAlerts: 0, priorAuthRequired: 0,
    totalActive: 0, totalControlled: 0,
    recentPrescriptions: [], refillQueue: [],
  };

  const rows  = await dbAll<Record<string, unknown>>(db, `SELECT * FROM erx_prescriptions ORDER BY prescribed_date DESC`);
  const all   = rows.map(rowToRx);

  return {
    pendingReview:         all.filter(r => r.status === 'PENDING_REVIEW').length,
    pendingSign:           all.filter(r => r.status === 'DRAFT').length,
    pendingSend:           all.filter(r => r.status === 'SIGNED').length,
    refillRequests:        all.filter(r => r.refillHistory?.some(h => h.status === 'PENDING')).length,
    drugInteractionAlerts: 0,
    priorAuthRequired:     all.filter(r => r.status === 'PENDING_PA').length,
    totalActive:           all.filter(r => ['ACTIVE','FILLED','SENT'].includes(r.status)).length,
    totalControlled:       all.filter(r => r.isControlled).length,
    recentPrescriptions:   all.slice(0, 10),
    refillQueue:           all.filter(r => r.refillHistory?.some(h => h.status === 'PENDING')).slice(0, 5),
  };
}
