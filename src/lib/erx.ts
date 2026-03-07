// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 7C: E-Prescribing & PDMP — KV Library
// ─────────────────────────────────────────────────────────────────────────────

import type {
  Prescription, RxStatus, DrugEntry, Pharmacy, PdmpReport,
  DrugInteraction, PatientAllergy, RefillEvent, RxDashboard,
  ControlledSchedule, DosageForm,
} from '../types/erx'

// ── KV Key Helpers ────────────────────────────────────────────────────────────
const K = {
  seeded:   'erx:seeded',
  rxIdx:    'erx:idx',
  rx:       (id: string) => `erx:rx:${id}`,
  refillIdx:(id: string) => `erx:refill:idx:${id}`,  // per-rx refill list
  refill:   (id: string) => `erx:refill:${id}`,
  pdmpIdx:  'erx:pdmp:idx',
  pdmp:     (id: string) => `erx:pdmp:${id}`,
  allergyIdx:(pid: string) => `erx:allergy:idx:${pid}`,
  allergy:  (id: string) => `erx:allergy:${id}`,
}

// ── Utilities ─────────────────────────────────────────────────────────────────
const now   = () => new Date().toISOString()
const today = () => now().slice(0,10)
function uid(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10)
  const ts   = Date.now().toString(36).slice(-4)
  return `${prefix}-${ts}${rand}`
}
function daysFromNow(days: number): string {
  const d = new Date(); d.setDate(d.getDate() + days)
  return d.toISOString()
}
function daysAgo(days: number): string {
  const d = new Date(); d.setDate(d.getDate() - days)
  return d.toISOString()
}

// ── Ophthalmic Drug Formulary (static, no KV) ─────────────────────────────────
export const DRUG_FORMULARY: DrugEntry[] = [
  // ── Glaucoma ──────────────────────────────────────────────────────────────
  { id:'drug-001', name:'Lumigan',       genericName:'bimatoprost 0.01%',  ndc:'00023-9187-10', rxcui:'372656',  form:'EYE_DROPS',    strength:'0.01%', unit:'mL', schedule:'NON_CONTROLLED', category:'Glaucoma',        commonDosing:'1 drop OU QHS',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:185 },
  { id:'drug-002', name:'Xalatan',       genericName:'latanoprost 0.005%', ndc:'00069-3140-03', rxcui:'203457',  form:'EYE_DROPS',    strength:'0.005%',unit:'mL', schedule:'NON_CONTROLLED', category:'Glaucoma',        commonDosing:'1 drop OU QHS',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:95  },
  { id:'drug-003', name:'Timoptic',      genericName:'timolol 0.5%',       ndc:'00006-3528-03', rxcui:'10600',   form:'EYE_DROPS',    strength:'0.5%',  unit:'mL', schedule:'NON_CONTROLLED', category:'Glaucoma',        commonDosing:'1 drop OU BID',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:45  },
  { id:'drug-004', name:'Alphagan P',    genericName:'brimonidine 0.1%',   ndc:'00023-9197-05', rxcui:'172525',  form:'EYE_DROPS',    strength:'0.1%',  unit:'mL', schedule:'NON_CONTROLLED', category:'Glaucoma',        commonDosing:'1 drop OU TID',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:70  },
  { id:'drug-005', name:'Azopt',         genericName:'brinzolamide 1%',    ndc:'00065-0271-10', rxcui:'73914',   form:'EYE_DROPS',    strength:'1%',    unit:'mL', schedule:'NON_CONTROLLED', category:'Glaucoma',        commonDosing:'1 drop OU TID',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:false, avgCost:140 },
  { id:'drug-006', name:'Rocklatan',     genericName:'netarsudil/latanoprost',ndc:'65162-455-04',rxcui:'2375678',form:'EYE_DROPS',    strength:'0.02%/0.005%',unit:'mL',schedule:'NON_CONTROLLED',category:'Glaucoma', commonDosing:'1 drop OU QHS',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:false, avgCost:320 },
  // ── Anti-infective ────────────────────────────────────────────────────────
  { id:'drug-007', name:'Vigamox',       genericName:'moxifloxacin 0.5%',  ndc:'00065-4013-03', rxcui:'351357',  form:'EYE_DROPS',    strength:'0.5%',  unit:'mL', schedule:'NON_CONTROLLED', category:'Anti-infective',   commonDosing:'1 drop OU TID x 7d', maxRefills:0, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:65  },
  { id:'drug-008', name:'Zymar',         genericName:'gatifloxacin 0.3%',  ndc:'00065-4013-08', rxcui:'283921',  form:'EYE_DROPS',    strength:'0.3%',  unit:'mL', schedule:'NON_CONTROLLED', category:'Anti-infective',   commonDosing:'1 drop OU QID x 7d', maxRefills:0, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:55  },
  { id:'drug-009', name:'Erythromycin',  genericName:'erythromycin 0.5%',  ndc:'00574-0085-35', rxcui:'4053',    form:'EYE_OINTMENT', strength:'0.5%',  unit:'g',  schedule:'NON_CONTROLLED', category:'Anti-infective',   commonDosing:'Apply OU QID x 7d',  maxRefills:0, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:20  },
  // ── Anti-inflammatory / Steroids ──────────────────────────────────────────
  { id:'drug-010', name:'Pred Forte',    genericName:'prednisolone 1%',    ndc:'00023-0351-05', rxcui:'8638',    form:'EYE_DROPS',    strength:'1%',    unit:'mL', schedule:'NON_CONTROLLED', category:'Corticosteroid',   commonDosing:'1 drop OU QID',      maxRefills:2, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:40  },
  { id:'drug-011', name:'Lotemax',       genericName:'loteprednol 0.5%',   ndc:'00065-0011-05', rxcui:'203892',  form:'EYE_DROPS',    strength:'0.5%',  unit:'mL', schedule:'NON_CONTROLLED', category:'Corticosteroid',   commonDosing:'1 drop OU QID',      maxRefills:2, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:165 },
  { id:'drug-012', name:'Nevanac',       genericName:'nepafenac 0.1%',     ndc:'00065-0036-03', rxcui:'327361',  form:'EYE_DROPS',    strength:'0.1%',  unit:'mL', schedule:'NON_CONTROLLED', category:'NSAID',            commonDosing:'1 drop OU TID',      maxRefills:0, isOphthalmic:true,  requiresPdmp:false, genericAvailable:false, avgCost:180 },
  { id:'drug-013', name:'Acular',        genericName:'ketorolac 0.5%',     ndc:'00023-8892-05', rxcui:'35827',   form:'EYE_DROPS',    strength:'0.5%',  unit:'mL', schedule:'NON_CONTROLLED', category:'NSAID',            commonDosing:'1 drop OU QID',      maxRefills:0, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:50  },
  // ── Dry Eye / Allergy ─────────────────────────────────────────────────────
  { id:'drug-014', name:'Restasis',      genericName:'cyclosporine 0.05%', ndc:'00023-9163-30', rxcui:'227956',  form:'EYE_DROPS',    strength:'0.05%', unit:'mL', schedule:'NON_CONTROLLED', category:'Dry Eye',          commonDosing:'1 drop OU BID',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:false, avgCost:470 },
  { id:'drug-015', name:'Xiidra',        genericName:'lifitegrast 5%',     ndc:'00078-0709-15', rxcui:'1860489', form:'EYE_DROPS',    strength:'5%',    unit:'mL', schedule:'NON_CONTROLLED', category:'Dry Eye',          commonDosing:'1 drop OU BID',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:false, avgCost:550 },
  { id:'drug-016', name:'Pataday',       genericName:'olopatadine 0.2%',   ndc:'00065-0090-25', rxcui:'311918',  form:'EYE_DROPS',    strength:'0.2%',  unit:'mL', schedule:'NON_CONTROLLED', category:'Anti-allergy',     commonDosing:'1 drop OU QD',       maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:80  },
  { id:'drug-017', name:'Zaditor',       genericName:'ketotifen 0.035%',   ndc:'00067-6271-03', rxcui:'253547',  form:'EYE_DROPS',    strength:'0.035%',unit:'mL', schedule:'NON_CONTROLLED', category:'Anti-allergy',     commonDosing:'1 drop OU BID',      maxRefills:5, isOphthalmic:true,  requiresPdmp:false, genericAvailable:true,  avgCost:15  },
  // ── Mydriatics / Cycloplegics ─────────────────────────────────────────────
  { id:'drug-018', name:'Mydriacyl',     genericName:'tropicamide 1%',     ndc:'00065-0433-10', rxcui:'11106',   form:'EYE_DROPS',    strength:'1%',    unit:'mL', schedule:'NON_CONTROLLED', category:'Mydriatic',        commonDosing:'1-2 drops OU 15-20m before exam',maxRefills:0,isOphthalmic:true,requiresPdmp:false,genericAvailable:true,avgCost:25},
  { id:'drug-019', name:'Cyclogyl',      genericName:'cyclopentolate 1%',  ndc:'00065-0425-10', rxcui:'2838',    form:'EYE_DROPS',    strength:'1%',    unit:'mL', schedule:'NON_CONTROLLED', category:'Cycloplegic',      commonDosing:'1-2 drops OU 40-50m before exam',maxRefills:0,isOphthalmic:true,requiresPdmp:false,genericAvailable:true,avgCost:30},
  // ── Controlled (ophthalmology context) ───────────────────────────────────
  { id:'drug-020', name:'Ativan',        genericName:'lorazepam 0.5mg',    ndc:'00187-5000-01', rxcui:'28137',   form:'ORAL_TABLET',  strength:'0.5mg', unit:'tablet',schedule:'CIV',         category:'Anxiolytic',       commonDosing:'0.5mg PO PRN anxiety',maxRefills:0,isOphthalmic:false,requiresPdmp:true,genericAvailable:true,avgCost:15},
  { id:'drug-021', name:'Valium',        genericName:'diazepam 5mg',       ndc:'00140-0005-01', rxcui:'3322',    form:'ORAL_TABLET',  strength:'5mg',   unit:'tablet',schedule:'CIV',         category:'Anxiolytic',       commonDosing:'5mg PO PRN anxiety',  maxRefills:0,isOphthalmic:false,requiresPdmp:true,genericAvailable:true,avgCost:20},
]

// Drug lookup map
export const DRUG_MAP: Record<string, DrugEntry> = Object.fromEntries(DRUG_FORMULARY.map(d => [d.id, d]))

// ── Known Drug Interactions ───────────────────────────────────────────────────
const INTERACTIONS: DrugInteraction[] = [
  { id:'int-001', drug1Id:'drug-003', drug1Name:'Timoptic (timolol)', drug2Id:'drug-021', drug2Name:'Valium (diazepam)',  severity:'MODERATE', description:'Beta-blockers may mask hypoglycemia symptoms when combined with CNS depressants', clinicalEffect:'Enhanced bradycardia, hypotension', mechanism:'Additive CNS/cardiovascular depression', management:'Monitor heart rate and blood pressure closely', evidenceLevel:'B' },
  { id:'int-002', drug1Id:'drug-004', drug1Name:'Alphagan P (brimonidine)', drug2Id:'drug-020', drug2Name:'Ativan (lorazepam)', severity:'MODERATE', description:'Additive CNS depression with concomitant use', clinicalEffect:'Enhanced sedation, respiratory depression risk', mechanism:'Both agents depress CNS via alpha-2 and GABA pathways', management:'Use lowest effective doses; monitor sedation', evidenceLevel:'B' },
  { id:'int-003', drug1Id:'drug-010', drug1Name:'Pred Forte (prednisolone)', drug2Id:'drug-013', drug2Name:'Acular (ketorolac)', severity:'MINOR', description:'Corticosteroids and NSAIDs together may reduce additive anti-inflammatory benefit but increase GI risk if systemic absorption occurs', clinicalEffect:'Possible reduced wound healing', mechanism:'Opposing prostaglandin pathways', management:'Monitor IOP; separate by at least 5 minutes', evidenceLevel:'C' },
  { id:'int-004', drug1Id:'drug-001', drug1Name:'Lumigan (bimatoprost)', drug2Id:'drug-002', drug2Name:'Xalatan (latanoprost)', severity:'MODERATE', description:'Two prostaglandin analogues together do not provide additive IOP lowering and may increase adverse effects', clinicalEffect:'No added IOP benefit; increased conjunctival hyperemia', mechanism:'Same receptor class, competitive binding', management:'Avoid concurrent use; choose one agent', evidenceLevel:'A' },
]

// ── Pharmacy Seed Data ────────────────────────────────────────────────────────
export const PHARMACIES: Pharmacy[] = [
  { id:'pharm-001', name:'CVS Pharmacy #7891', type:'RETAIL', npi:'1234567890', ncpdpId:'7891234', address:'450 Ocean Drive', city:'Miami Beach', state:'FL', zip:'33139', phone:'(305) 555-0101', fax:'(305) 555-0102', acceptsEPrescribe:true, acceptsControlled:false, hours:'Mon-Sun 8am-10pm', isPreferred:true },
  { id:'pharm-002', name:'Walgreens #5423', type:'RETAIL', npi:'1234567891', ncpdpId:'5423876', address:'1200 Lincoln Road', city:'Miami Beach', state:'FL', zip:'33139', phone:'(305) 555-0201', fax:'(305) 555-0202', acceptsEPrescribe:true, acceptsControlled:true, hours:'Mon-Sun 24hrs', isPreferred:true },
  { id:'pharm-003', name:'Express Scripts Mail Order', type:'MAIL_ORDER', npi:'1234567892', ncpdpId:'1111222', address:'1 Express Way', city:'St. Louis', state:'MO', zip:'63121', phone:'(800) 555-0301', fax:'(800) 555-0302', acceptsEPrescribe:true, acceptsControlled:false, hours:'Mon-Fri 8am-6pm', isPreferred:false },
  { id:'pharm-004', name:'Ocular Specialty Pharmacy', type:'SPECIALTY', npi:'1234567893', ncpdpId:'9993210', address:'600 Brickell Ave', city:'Miami', state:'FL', zip:'33131', phone:'(305) 555-0401', fax:'(305) 555-0402', acceptsEPrescribe:true, acceptsControlled:false, hours:'Mon-Fri 9am-5pm', isPreferred:false },
  { id:'pharm-005', name:'Compounding Center of FL', type:'COMPOUNDING', npi:'1234567894', ncpdpId:'8882345', address:'200 Coral Way', city:'Coral Gables', state:'FL', zip:'33134', phone:'(305) 555-0501', fax:'(305) 555-0502', acceptsEPrescribe:false, acceptsControlled:false, hours:'Mon-Fri 9am-5pm', isPreferred:false },
]
export const PHARMACY_MAP = Object.fromEntries(PHARMACIES.map(p => [p.id, p]))

// ── Helpers ───────────────────────────────────────────────────────────────────
function checkInteractions(drugId: string, currentDrugIds: string[]): DrugInteraction[] {
  const result: DrugInteraction[] = []
  for (const otherId of currentDrugIds) {
    const hit = INTERACTIONS.find(i =>
      (i.drug1Id === drugId && i.drug2Id === otherId) ||
      (i.drug2Id === drugId && i.drug1Id === otherId)
    )
    if (hit) result.push(hit)
  }
  return result
}

// ── Seed Data ─────────────────────────────────────────────────────────────────
function seedPrescriptions(): Prescription[] {
  const d = today()
  return [
    {
      id: 'rx-001',
      patientId: 'pt-001', patientName: 'Margaret Sullivan', patientDob: '1958-03-22',
      providerId: 'dr-chen', providerName: 'Dr. Sarah Chen', providerNpi: '1234567001',
      drugId: 'drug-002', drugName: 'Xalatan', genericName: 'latanoprost 0.005%',
      strength: '0.005%', form: 'EYE_DROPS',
      sig: { quantity: 2.5, unit: 'mL', daysSupply: 30, refills: 5, dosageInstructions: 'Instill 1 drop in each eye every night at bedtime', frequencyCode: 'QHS', route: 'OU', prn: false },
      rxType: 'NEW', status: 'FILLED',
      pharmacyId: 'pharm-001', pharmacyName: 'CVS Pharmacy #7891',
      daw: false, clinicalNote: 'Primary open-angle glaucoma management.',
      pdmpChecked: false, pdmpStatus: 'NOT_CHECKED', drugInteractions: [], allergyAlerts: [],
      diagnosisCodes: ['H40.1131'], isControlled: false, schedule: 'NON_CONTROLLED',
      writtenDate: daysAgo(45).slice(0,10), signedAt: daysAgo(45), sentAt: daysAgo(45), filledAt: daysAgo(44),
      expiresAt: new Date(new Date().setFullYear(new Date().getFullYear()+1)).toISOString(),
      refillHistory: [], createdAt: daysAgo(45), updatedAt: daysAgo(44),
    },
    {
      id: 'rx-002',
      patientId: 'pt-001', patientName: 'Margaret Sullivan', patientDob: '1958-03-22',
      providerId: 'dr-chen', providerName: 'Dr. Sarah Chen', providerNpi: '1234567001',
      drugId: 'drug-003', drugName: 'Timoptic', genericName: 'timolol 0.5%',
      strength: '0.5%', form: 'EYE_DROPS',
      sig: { quantity: 5, unit: 'mL', daysSupply: 30, refills: 5, dosageInstructions: 'Instill 1 drop in each eye twice daily', frequencyCode: 'BID', route: 'OU', prn: false },
      rxType: 'NEW', status: 'FILLED',
      pharmacyId: 'pharm-001', pharmacyName: 'CVS Pharmacy #7891',
      daw: false, clinicalNote: 'Adjunct therapy for IOP reduction.',
      pdmpChecked: false, pdmpStatus: 'NOT_CHECKED', drugInteractions: [], allergyAlerts: [],
      diagnosisCodes: ['H40.1131'], isControlled: false, schedule: 'NON_CONTROLLED',
      writtenDate: daysAgo(45).slice(0,10), signedAt: daysAgo(45), sentAt: daysAgo(45), filledAt: daysAgo(44),
      expiresAt: new Date(new Date().setFullYear(new Date().getFullYear()+1)).toISOString(),
      refillHistory: [], createdAt: daysAgo(45), updatedAt: daysAgo(44),
    },
    {
      id: 'rx-003',
      patientId: 'pt-002', patientName: 'Derek Holloway', patientDob: '1972-09-30',
      providerId: 'dr-patel', providerName: 'Dr. Raj Patel', providerNpi: '1234567002',
      drugId: 'drug-007', drugName: 'Vigamox', genericName: 'moxifloxacin 0.5%',
      strength: '0.5%', form: 'EYE_DROPS',
      sig: { quantity: 3, unit: 'mL', daysSupply: 7, refills: 0, dosageInstructions: 'Instill 1 drop in the right eye three times daily for 7 days', frequencyCode: 'TID', route: 'OD', prn: false },
      rxType: 'NEW', status: 'SENT',
      pharmacyId: 'pharm-002', pharmacyName: 'Walgreens #5423',
      daw: false, clinicalNote: 'Post-operative prophylaxis — cataract surgery OD.',
      pdmpChecked: false, pdmpStatus: 'NOT_CHECKED', drugInteractions: [], allergyAlerts: [],
      diagnosisCodes: ['Z96.641'], isControlled: false, schedule: 'NON_CONTROLLED',
      writtenDate: d, signedAt: daysAgo(1), sentAt: daysAgo(1), filledAt: undefined,
      expiresAt: daysFromNow(7),
      refillHistory: [], createdAt: daysAgo(1), updatedAt: daysAgo(1),
    },
    {
      id: 'rx-004',
      patientId: 'pt-002', patientName: 'Derek Holloway', patientDob: '1972-09-30',
      providerId: 'dr-patel', providerName: 'Dr. Raj Patel', providerNpi: '1234567002',
      drugId: 'drug-010', drugName: 'Pred Forte', genericName: 'prednisolone 1%',
      strength: '1%', form: 'EYE_DROPS',
      sig: { quantity: 5, unit: 'mL', daysSupply: 30, refills: 2, dosageInstructions: 'Instill 1 drop OD four times daily, taper as directed', frequencyCode: 'QID', route: 'OD', prn: false },
      rxType: 'NEW', status: 'SENT',
      pharmacyId: 'pharm-002', pharmacyName: 'Walgreens #5423',
      daw: false, clinicalNote: 'Post-operative anti-inflammatory — cataract surgery OD.',
      pdmpChecked: false, pdmpStatus: 'NOT_CHECKED',
      drugInteractions: checkInteractions('drug-010', ['drug-007']),
      allergyAlerts: [],
      diagnosisCodes: ['Z96.641'], isControlled: false, schedule: 'NON_CONTROLLED',
      writtenDate: d, signedAt: daysAgo(1), sentAt: daysAgo(1), filledAt: undefined,
      expiresAt: daysFromNow(30),
      refillHistory: [], createdAt: daysAgo(1), updatedAt: daysAgo(1),
    },
    {
      id: 'rx-005',
      patientId: 'pt-003', patientName: 'Priya Nair', patientDob: '1990-06-15',
      providerId: 'dr-torres', providerName: 'Dr. Amy Torres', providerNpi: '1234567003',
      drugId: 'drug-017', drugName: 'Zaditor', genericName: 'ketotifen 0.035%',
      strength: '0.035%', form: 'EYE_DROPS',
      sig: { quantity: 5, unit: 'mL', daysSupply: 30, refills: 5, dosageInstructions: 'Instill 1 drop in each eye twice daily', frequencyCode: 'BID', route: 'OU', prn: false },
      rxType: 'NEW', status: 'PENDING_REVIEW',
      pharmacyId: undefined, pharmacyName: undefined,
      daw: false, clinicalNote: 'Seasonal allergic conjunctivitis.',
      pdmpChecked: false, pdmpStatus: 'NOT_CHECKED', drugInteractions: [], allergyAlerts: [],
      diagnosisCodes: ['H10.13'], isControlled: false, schedule: 'NON_CONTROLLED',
      writtenDate: d, signedAt: undefined, sentAt: undefined, filledAt: undefined,
      expiresAt: daysFromNow(365),
      refillHistory: [], createdAt: now(), updatedAt: now(),
    },
    {
      id: 'rx-006',
      patientId: 'pt-004', patientName: 'Samuel Osei', patientDob: '1965-11-08',
      providerId: 'dr-chen', providerName: 'Dr. Sarah Chen', providerNpi: '1234567001',
      drugId: 'drug-014', drugName: 'Restasis', genericName: 'cyclosporine 0.05%',
      strength: '0.05%', form: 'EYE_DROPS',
      sig: { quantity: 30, unit: 'vials', daysSupply: 30, refills: 5, dosageInstructions: 'Instill 1 vial in each eye twice daily; discard remaining after use', frequencyCode: 'BID', route: 'OU', prn: false },
      rxType: 'REFILL', status: 'DRAFT',
      pharmacyId: 'pharm-004', pharmacyName: 'Ocular Specialty Pharmacy',
      daw: true, clinicalNote: 'Moderate dry eye disease — chronic therapy.',
      pdmpChecked: false, pdmpStatus: 'NOT_CHECKED', drugInteractions: [], allergyAlerts: [],
      diagnosisCodes: ['H04.123'], isControlled: false, schedule: 'NON_CONTROLLED',
      writtenDate: d, signedAt: undefined, sentAt: undefined, filledAt: undefined,
      expiresAt: daysFromNow(365),
      refillHistory: [], createdAt: now(), updatedAt: now(),
    },
    {
      id: 'rx-007',
      patientId: 'pt-005', patientName: 'Isabella Torres', patientDob: '1948-02-14',
      providerId: 'dr-patel', providerName: 'Dr. Raj Patel', providerNpi: '1234567002',
      drugId: 'drug-001', drugName: 'Lumigan', genericName: 'bimatoprost 0.01%',
      strength: '0.01%', form: 'EYE_DROPS',
      sig: { quantity: 2.5, unit: 'mL', daysSupply: 30, refills: 5, dosageInstructions: 'Instill 1 drop in each eye once nightly at bedtime', frequencyCode: 'QHS', route: 'OU', prn: false },
      rxType: 'NEW', status: 'SIGNED',
      pharmacyId: 'pharm-001', pharmacyName: 'CVS Pharmacy #7891',
      daw: false, clinicalNote: 'Normal-tension glaucoma; IOP goal < 12 mmHg.',
      pdmpChecked: false, pdmpStatus: 'NOT_CHECKED', drugInteractions: [], allergyAlerts: [],
      diagnosisCodes: ['H40.1110'], isControlled: false, schedule: 'NON_CONTROLLED',
      writtenDate: d, signedAt: now(), sentAt: undefined, filledAt: undefined,
      expiresAt: daysFromNow(365),
      refillHistory: [], createdAt: now(), updatedAt: now(),
    },
  ]
}

function seedPdmpReports(): PdmpReport[] {
  return [
    {
      id: 'pdmp-001',
      patientId: 'pt-006', patientName: 'James Thornton', requestedBy: 'Dr. Raj Patel',
      requestedAt: daysAgo(3), status: 'ALERT',
      riskScore: 72,
      riskFactors: ['Multiple prescribers (4) in past 90 days', 'Opioid + benzodiazepine overlap', 'High MME per day'],
      prescriptions: [
        { drug:'Oxycodone 10mg', schedule:'CII', quantity:90, daysSupply:30, prescriber:'Dr. Williams (Pain)', pharmacy:'CVS #1234', dispensedDate:daysAgo(10).slice(0,10), refillsRemaining:0 },
        { drug:'Lorazepam 1mg', schedule:'CIV', quantity:60, daysSupply:30, prescriber:'Dr. Patel (Ophtho)', pharmacy:'Walgreens #5423', dispensedDate:daysAgo(8).slice(0,10), refillsRemaining:0 },
        { drug:'Alprazolam 0.5mg', schedule:'CIV', quantity:30, daysSupply:15, prescriber:'Dr. Martinez (Psych)', pharmacy:'Rite Aid #992', dispensedDate:daysAgo(15).slice(0,10), refillsRemaining:1 },
      ],
      reportNotes: 'Patient has concurrent opioid and benzodiazepine use from multiple prescribers. Recommend consultation and care coordination.',
      expiresAt: daysFromNow(1),
    },
    {
      id: 'pdmp-002',
      patientId: 'pt-007', patientName: 'Carol Jennings', requestedBy: 'Dr. Amy Torres',
      requestedAt: daysAgo(7), status: 'CLEAR',
      riskScore: 8,
      riskFactors: [],
      prescriptions: [
        { drug:'Diazepam 5mg', schedule:'CIV', quantity:30, daysSupply:30, prescriber:'Dr. Torres (Ophtho)', pharmacy:'CVS #7891', dispensedDate:daysAgo(30).slice(0,10), refillsRemaining:0 },
      ],
      reportNotes: 'No concerning patterns identified. Single prescriber, single pharmacy.',
      expiresAt: daysFromNow(0),
    },
  ]
}

function seedAllergies(): PatientAllergy[] {
  return [
    { id:'alg-001', patientId:'pt-001', allergen:'Penicillin', allergenType:'DRUG', reaction:'ANAPHYLAXIS', severity:'LIFE_THREATENING', onsetDate:'1995-06-01', notes:'Anaphylaxis requiring ER visit in 1995. EpiPen prescribed.', isActive:true, recordedBy:'Dr. Sarah Chen', recordedAt:daysAgo(400) },
    { id:'alg-002', patientId:'pt-001', allergen:'Sulfonamides', allergenType:'DRUG', reaction:'RASH', severity:'MODERATE', onsetDate:'2003-01-15', notes:'Diffuse maculopapular rash with sulfa drugs.', isActive:true, recordedBy:'Dr. Sarah Chen', recordedAt:daysAgo(400) },
    { id:'alg-003', patientId:'pt-002', allergen:'Aspirin', allergenType:'DRUG', reaction:'HIVES', severity:'MODERATE', onsetDate:'2010-03-20', notes:'Urticaria with aspirin and NSAIDs.', isActive:true, recordedBy:'Dr. Raj Patel', recordedAt:daysAgo(200) },
    { id:'alg-004', patientId:'pt-003', allergen:'Pollen', allergenType:'ENVIRONMENTAL', reaction:'OTHER', severity:'MILD', onsetDate:'2015-04-01', notes:'Seasonal allergic rhinoconjunctivitis. Relevant to eye drops.', isActive:true, recordedBy:'Dr. Amy Torres', recordedAt:daysAgo(100) },
    { id:'alg-005', patientId:'pt-005', allergen:'Latex', allergenType:'LATEX', reaction:'HIVES', severity:'MODERATE', notes:'Contact urticaria with latex gloves.', isActive:true, recordedBy:'Dr. Raj Patel', recordedAt:daysAgo(300) },
  ]
}

// ── Seed / Init ───────────────────────────────────────────────────────────────
export async function ensureErxSeed(kv: KVNamespace): Promise<void> {
  if (await kv.get(K.seeded)) return

  const rxList = seedPrescriptions()
  const rxIds: string[] = []
  for (const rx of rxList) {
    await kv.put(K.rx(rx.id), JSON.stringify(rx))
    rxIds.push(rx.id)
  }
  await kv.put(K.rxIdx, JSON.stringify(rxIds))

  const pdmpList = seedPdmpReports()
  const pdmpIds: string[] = []
  for (const p of pdmpList) {
    await kv.put(K.pdmp(p.id), JSON.stringify(p))
    pdmpIds.push(p.id)
  }
  await kv.put(K.pdmpIdx, JSON.stringify(pdmpIds))

  const allergies = seedAllergies()
  for (const alg of allergies) {
    await kv.put(K.allergy(alg.id), JSON.stringify(alg))
    const idxRaw = await kv.get(K.allergyIdx(alg.patientId))
    const ids: string[] = idxRaw ? JSON.parse(idxRaw) : []
    ids.push(alg.id)
    await kv.put(K.allergyIdx(alg.patientId), JSON.stringify(ids))
  }

  await kv.put(K.seeded, '1')
}

// ── Prescription CRUD ─────────────────────────────────────────────────────────
export async function listPrescriptions(
  kv: KVNamespace,
  patientId?: string,
  status?: string,
  providerId?: string,
): Promise<Prescription[]> {
  await ensureErxSeed(kv)
  const idxRaw = await kv.get(K.rxIdx)
  if (!idxRaw) return []
  const ids: string[] = JSON.parse(idxRaw)
  const raws = await Promise.all(ids.map(id => kv.get(K.rx(id))))
  let list = raws.filter(Boolean).map(r => JSON.parse(r!) as Prescription)
  if (patientId) list = list.filter(r => r.patientId === patientId)
  if (status)    list = list.filter(r => r.status === status.toUpperCase())
  if (providerId) list = list.filter(r => r.providerId === providerId)
  return list.sort((a,b) => b.createdAt.localeCompare(a.createdAt))
}

export async function getPrescription(kv: KVNamespace, id: string): Promise<Prescription | null> {
  await ensureErxSeed(kv)
  const raw = await kv.get(K.rx(id))
  return raw ? JSON.parse(raw) : null
}

export async function createPrescription(
  kv: KVNamespace,
  data: Partial<Prescription> & { patientId: string; drugId: string; providerId: string }
): Promise<Prescription> {
  await ensureErxSeed(kv)
  const drug = DRUG_MAP[data.drugId]
  if (!drug) throw new Error(`Unknown drugId: ${data.drugId}`)

  // Get patient's existing prescriptions for interaction check
  const existing = await listPrescriptions(kv, data.patientId)
  const currentDrugIds = existing.filter(r => r.status === 'FILLED' || r.status === 'SENT').map(r => r.drugId)
  const interactions = checkInteractions(data.drugId, currentDrugIds)

  const rx: Prescription = {
    id: uid('rx'),
    patientId: data.patientId,
    patientName: data.patientName || '',
    patientDob: data.patientDob || '',
    providerId: data.providerId,
    providerName: data.providerName || '',
    providerNpi: data.providerNpi || '1234567001',
    drugId: data.drugId,
    drugName: drug.name,
    genericName: drug.genericName,
    strength: drug.strength,
    form: drug.form,
    sig: data.sig || { quantity: 1, unit: drug.unit, daysSupply: 30, refills: drug.maxRefills, dosageInstructions: drug.commonDosing, frequencyCode: 'QD', route: drug.isOphthalmic ? 'OU' : 'PO', prn: false },
    rxType: data.rxType || 'NEW',
    status: 'DRAFT',
    pharmacyId: data.pharmacyId,
    pharmacyName: data.pharmacyName || (data.pharmacyId ? PHARMACY_MAP[data.pharmacyId]?.name : undefined),
    daw: data.daw ?? false,
    substitutionNote: data.substitutionNote,
    clinicalNote: data.clinicalNote || '',
    pdmpChecked: false,
    pdmpStatus: 'NOT_CHECKED',
    drugInteractions: interactions,
    allergyAlerts: [],
    diagnosisCodes: data.diagnosisCodes || [],
    isControlled: drug.schedule !== 'NON_CONTROLLED',
    schedule: drug.schedule,
    writtenDate: today(),
    signedAt: undefined,
    sentAt: undefined,
    filledAt: undefined,
    expiresAt: daysFromNow(365),
    refillHistory: [],
    createdAt: now(),
    updatedAt: now(),
  }

  await kv.put(K.rx(rx.id), JSON.stringify(rx))
  const idxRaw = await kv.get(K.rxIdx)
  const ids: string[] = idxRaw ? JSON.parse(idxRaw) : []
  ids.unshift(rx.id)
  await kv.put(K.rxIdx, JSON.stringify(ids))
  return rx
}

export async function updateRxStatus(
  kv: KVNamespace,
  id: string,
  status: RxStatus,
  note?: string,
): Promise<Prescription | null> {
  const raw = await kv.get(K.rx(id))
  if (!raw) return null
  const rx: Prescription = JSON.parse(raw)
  rx.status = status
  rx.updatedAt = now()
  if (status === 'SIGNED')    rx.signedAt = now()
  if (status === 'SENT')      rx.sentAt = now()
  if (status === 'FILLED')    rx.filledAt = now()
  if (status === 'CANCELLED') rx.cancelledAt = now()
  if (note) rx.clinicalNote = note
  await kv.put(K.rx(id), JSON.stringify(rx))
  return rx
}

export async function updatePrescription(
  kv: KVNamespace,
  id: string,
  updates: Partial<Prescription>,
): Promise<Prescription | null> {
  const raw = await kv.get(K.rx(id))
  if (!raw) return null
  const rx: Prescription = { ...JSON.parse(raw), ...updates, updatedAt: now() }
  await kv.put(K.rx(id), JSON.stringify(rx))
  return rx
}

// ── Formulary / Drug Lookup ───────────────────────────────────────────────────
export function searchFormulary(query: string, category?: string): DrugEntry[] {
  const q = query.toLowerCase()
  return DRUG_FORMULARY.filter(d => {
    const matchesQuery = !q || d.name.toLowerCase().includes(q) || d.genericName.toLowerCase().includes(q) || d.ndc.includes(q) || d.rxcui.includes(q)
    const matchesCat   = !category || d.category === category
    return matchesQuery && matchesCat
  })
}

export function getDrugInteractionCheck(drugId: string, currentDrugIds: string[]): DrugInteraction[] {
  return checkInteractions(drugId, currentDrugIds)
}

// ── PDMP ──────────────────────────────────────────────────────────────────────
export async function listPdmpReports(kv: KVNamespace, patientId?: string): Promise<PdmpReport[]> {
  await ensureErxSeed(kv)
  const idxRaw = await kv.get(K.pdmpIdx)
  if (!idxRaw) return []
  const ids: string[] = JSON.parse(idxRaw)
  const raws = await Promise.all(ids.map(id => kv.get(K.pdmp(id))))
  let list = raws.filter(Boolean).map(r => JSON.parse(r!) as PdmpReport)
  if (patientId) list = list.filter(r => r.patientId === patientId)
  return list
}

export async function requestPdmpCheck(
  kv: KVNamespace,
  patientId: string,
  patientName: string,
  requestedBy: string,
): Promise<PdmpReport> {
  await ensureErxSeed(kv)
  // Simulate PDMP lookup — in production this would call state PDMP API
  const hasHistory = Math.random() > 0.5
  const riskScore = hasHistory ? Math.floor(Math.random() * 40) + 20 : Math.floor(Math.random() * 15)
  const report: PdmpReport = {
    id: uid('pdmp'),
    patientId, patientName, requestedBy,
    requestedAt: now(),
    status: riskScore > 50 ? 'ALERT' : riskScore > 30 ? 'HIGH_RISK' : 'CLEAR',
    riskScore,
    riskFactors: riskScore > 50
      ? ['Multiple prescribers in past 90 days', 'Controlled substance overlap']
      : riskScore > 30 ? ['Single controlled substance history'] : [],
    prescriptions: hasHistory ? [{
      drug: 'Lorazepam 0.5mg', schedule: 'CIV' as ControlledSchedule,
      quantity: 30, daysSupply: 30, prescriber: requestedBy,
      pharmacy: 'CVS Pharmacy', dispensedDate: daysAgo(30).slice(0,10), refillsRemaining: 0,
    }] : [],
    reportNotes: riskScore > 50 ? 'Concurrent controlled substance use detected. Review before prescribing.' : 'No high-risk patterns identified.',
    expiresAt: daysFromNow(3),
  }
  await kv.put(K.pdmp(report.id), JSON.stringify(report))
  const idxRaw = await kv.get(K.pdmpIdx)
  const ids: string[] = idxRaw ? JSON.parse(idxRaw) : []
  ids.unshift(report.id)
  await kv.put(K.pdmpIdx, JSON.stringify(ids))
  return report
}

// ── Allergies ─────────────────────────────────────────────────────────────────
export async function getPatientAllergies(kv: KVNamespace, patientId: string): Promise<PatientAllergy[]> {
  await ensureErxSeed(kv)
  const idxRaw = await kv.get(K.allergyIdx(patientId))
  if (!idxRaw) return []
  const ids: string[] = JSON.parse(idxRaw)
  const raws = await Promise.all(ids.map(id => kv.get(K.allergy(id))))
  return raws.filter(Boolean).map(r => JSON.parse(r!) as PatientAllergy)
}

export async function addPatientAllergy(
  kv: KVNamespace,
  patientId: string,
  data: Omit<PatientAllergy, 'id' | 'recordedAt'>,
): Promise<PatientAllergy> {
  const allergy: PatientAllergy = { ...data, id: uid('alg'), patientId, recordedAt: now() }
  await kv.put(K.allergy(allergy.id), JSON.stringify(allergy))
  const idxRaw = await kv.get(K.allergyIdx(patientId))
  const ids: string[] = idxRaw ? JSON.parse(idxRaw) : []
  ids.push(allergy.id)
  await kv.put(K.allergyIdx(patientId), JSON.stringify(ids))
  return allergy
}

// ── Refill Requests ───────────────────────────────────────────────────────────
export async function requestRefill(
  kv: KVNamespace,
  rxId: string,
  pharmacyId: string,
  pharmacyName: string,
): Promise<{ prescription: Prescription; refill: RefillEvent } | null> {
  const raw = await kv.get(K.rx(rxId))
  if (!raw) return null
  const rx: Prescription = JSON.parse(raw)
  const pharmacy = PHARMACY_MAP[pharmacyId]
  const refill: RefillEvent = {
    id: uid('rfll'),
    prescriptionId: rxId,
    requestedAt: now(),
    pharmacyId,
    pharmacyName: pharmacyName || pharmacy?.name || '',
    refillNumber: rx.refillHistory.length + 1,
    providerId: rx.providerId,
    providerName: rx.providerName,
  }
  rx.refillHistory.push(refill)
  rx.status = 'PENDING_REVIEW'
  rx.updatedAt = now()
  await kv.put(K.rx(rxId), JSON.stringify(rx))
  return { prescription: rx, refill }
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export async function getErxDashboard(kv: KVNamespace): Promise<RxDashboard> {
  await ensureErxSeed(kv)
  const all = await listPrescriptions(kv)
  const todayStr = today()
  const pdmpReports = await listPdmpReports(kv)

  const pendingReview = all.filter(r => r.status === 'PENDING_REVIEW').length
  const signedToday   = all.filter(r => r.signedAt?.startsWith(todayStr)).length
  const sentToday     = all.filter(r => r.sentAt?.startsWith(todayStr)).length
  const refillRequests = all.reduce((sum, r) => sum + r.refillHistory.filter(e => !e.approvedAt && !e.deniedAt).length, 0)
  const pdmpAlerts    = pdmpReports.filter(p => p.status === 'ALERT' || p.status === 'HIGH_RISK').length
  const drugInteractionAlerts = all.filter(r => r.drugInteractions.length > 0).length

  const recentPrescriptions = all.slice(0, 8)
  const pendingRefills = all.flatMap(r => r.refillHistory.filter(e => !e.approvedAt && !e.deniedAt))
  const pdmpAlertList = pdmpReports.filter(p => p.status === 'ALERT' || p.status === 'HIGH_RISK')

  return { pendingReview, signedToday, sentToday, refillRequests, pdmpAlerts, drugInteractionAlerts, recentPrescriptions, pendingRefills, pdmpAlertList }
}
