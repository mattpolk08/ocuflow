// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Patient Store (KV-backed for demo / edge deployment)
// In production this would be Prisma → PostgreSQL / Supabase
// ─────────────────────────────────────────────────────────────────────────────

import type { Patient, PatientCreateInput, PatientSearchResult } from '../types/patient'

// ── MRN Generator ─────────────────────────────────────────────────────────────
function generateMrn(): string {
  const year = new Date().getFullYear().toString().slice(-2)
  const rand = Math.floor(10000 + Math.random() * 89999)
  return `OF-${year}-${rand}`
}

// ── Age from DOB ───────────────────────────────────────────────────────────────
export function calcAge(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// ── Seed Data (demo patients for development) ─────────────────────────────────
export function getSeedPatients(): Patient[] {
  const now = new Date().toISOString()
  return [
    {
      id: 'pt-001', mrn: 'OF-24-10042', organizationId: 'org-001',
      firstName: 'Margaret', lastName: 'Sullivan', dateOfBirth: '1948-03-12',
      gender: 'FEMALE', preferredLanguage: 'en', isNewPatient: false, isActive: true,
      email: 'msullivan@email.com', phone: '(305) 555-0101', cellPhone: '(305) 555-0101',
      address: { street: '1420 Ocean Drive', city: 'Miami Beach', state: 'FL', zip: '33139' },
      emergencyContact: { name: 'Thomas Sullivan', relationship: 'Spouse', phone: '(305) 555-0102' },
      portalAccess: true, lastVisitDate: '2025-03-07',
      allergies: 'Penicillin, Sulfa drugs',
      currentMedications: 'Timolol 0.5% BID OU, Latanoprost 0.005% QHS OS',
      insurancePlans: [{
        id: 'ins-001', priority: 'PRIMARY', payerName: 'Medicare', payerId: '00901',
        planName: 'Medicare Part B', memberId: '1EG4-TE5-MK72', groupNumber: '',
        subscriberName: 'MARGARET SULLIVAN', relationship: 'SELF',
        copay: 0, deductible: 240, outOfPocketMax: 8700,
        eligibilityStatus: 'ACTIVE', eligibilityCheckedAt: now,
        isActive: true,
        eligibilityDetails: {
          planName: 'Medicare Part B', coinsurance: 20, deductibleMet: 240,
          outOfPocketMet: 120, lastVerifiedAt: now, visionBenefit: true,
        }
      }],
      createdAt: '2019-06-14T10:00:00Z', updatedAt: now,
    },
    {
      id: 'pt-002', mrn: 'OF-24-10089', organizationId: 'org-001',
      firstName: 'Derek', lastName: 'Holloway', dateOfBirth: '1976-09-22',
      gender: 'MALE', preferredLanguage: 'en', isNewPatient: false, isActive: true,
      email: 'derek.h@gmail.com', phone: '(786) 555-0203',
      address: { street: '850 Brickell Ave', city: 'Miami', state: 'FL', zip: '33131' },
      emergencyContact: { name: 'Angela Holloway', relationship: 'Wife', phone: '(786) 555-0204' },
      portalAccess: true, lastVisitDate: '2024-12-15',
      allergies: 'NKDA',
      currentMedications: 'Brimonidine 0.2% BID OU, Dorzolamide/Timolol BID OU',
      insurancePlans: [{
        id: 'ins-002', priority: 'PRIMARY', payerName: 'Aetna', payerId: '60054',
        planName: 'Aetna Choice POS II', memberId: 'W234567890', groupNumber: '0123456',
        subscriberName: 'DEREK HOLLOWAY', relationship: 'SELF',
        copay: 45, deductible: 1500, outOfPocketMax: 6000,
        eligibilityStatus: 'ACTIVE', eligibilityCheckedAt: now,
        isActive: true,
        eligibilityDetails: {
          planName: 'Aetna Choice POS II', coinsurance: 20, deductibleMet: 450,
          outOfPocketMet: 225, copaySpecialist: 45, lastVerifiedAt: now,
          visionBenefit: false,
        }
      }],
      createdAt: '2021-02-08T09:00:00Z', updatedAt: now,
    },
    {
      id: 'pt-003', mrn: 'OF-24-10103', organizationId: 'org-001',
      firstName: 'Priya', lastName: 'Nair', dateOfBirth: '1990-07-04',
      gender: 'FEMALE', preferredLanguage: 'en', isNewPatient: false, isActive: true,
      email: 'priya.nair@outlook.com', phone: '(954) 555-0305',
      address: { street: '3200 N Federal Hwy', city: 'Fort Lauderdale', state: 'FL', zip: '33306' },
      portalAccess: false, lastVisitDate: '2024-09-20',
      allergies: 'NKDA', currentMedications: 'None',
      insurancePlans: [{
        id: 'ins-003', priority: 'PRIMARY', payerName: 'UnitedHealthcare', payerId: 'UHC',
        planName: 'Choice Plus PPO', memberId: 'U987654321', groupNumber: '789012',
        subscriberName: 'PRIYA NAIR', relationship: 'SELF',
        copay: 20, deductible: 1000, outOfPocketMax: 4000,
        eligibilityStatus: 'ACTIVE', eligibilityCheckedAt: now,
        isActive: true,
        eligibilityDetails: {
          planName: 'UHC Choice Plus', coinsurance: 20, deductibleMet: 200,
          outOfPocketMet: 100, copaySpecialist: 20, lastVerifiedAt: now,
          visionBenefit: true, visionCopay: 10, visionAllowance: 150,
        }
      }],
      createdAt: '2022-09-14T14:00:00Z', updatedAt: now,
    },
    {
      id: 'pt-004', mrn: 'OF-24-10067', organizationId: 'org-001',
      firstName: 'Charles', lastName: 'Beaumont', dateOfBirth: '1955-12-30',
      gender: 'MALE', preferredLanguage: 'en', isNewPatient: false, isActive: true,
      email: 'cbeaumont@yahoo.com', phone: '(305) 555-0407',
      address: { street: '7200 SW 8th St', city: 'Miami', state: 'FL', zip: '33144' },
      emergencyContact: { name: 'Louise Beaumont', relationship: 'Wife', phone: '(305) 555-0408' },
      portalAccess: true, lastVisitDate: '2024-03-22',
      allergies: 'Aspirin, Ibuprofen',
      currentMedications: 'Metformin 1000mg BID, Lisinopril 10mg QD, Atorvastatin 40mg QHS',
      insurancePlans: [
        {
          id: 'ins-004a', priority: 'PRIMARY', payerName: 'Humana', payerId: 'HUMANA',
          planName: 'Humana Gold Plus HMO', memberId: 'H112233445', groupNumber: '9900123',
          subscriberName: 'CHARLES BEAUMONT', relationship: 'SELF',
          copay: 30, deductible: 0, outOfPocketMax: 3400,
          eligibilityStatus: 'ACTIVE', eligibilityCheckedAt: now, isActive: true,
          eligibilityDetails: {
            planName: 'Humana Gold Plus HMO', coinsurance: 0, deductibleMet: 0,
            outOfPocketMet: 90, copaySpecialist: 30, lastVerifiedAt: now,
            visionBenefit: true, visionCopay: 0, visionAllowance: 200,
          }
        },
        {
          id: 'ins-004b', priority: 'SECONDARY', payerName: 'Medicare', payerId: '00901',
          planName: 'Medicare Part B', memberId: '2AB5-TF6-NK88',
          subscriberName: 'CHARLES BEAUMONT', relationship: 'SELF',
          copay: 0, eligibilityStatus: 'ACTIVE', isActive: true,
          eligibilityCheckedAt: now,
          eligibilityDetails: {
            planName: 'Medicare Part B', coinsurance: 20, deductibleMet: 240,
            outOfPocketMet: 0, lastVerifiedAt: now, visionBenefit: true,
          }
        }
      ],
      createdAt: '2020-01-15T11:00:00Z', updatedAt: now,
    },
    {
      id: 'pt-005', mrn: 'OF-24-10211', organizationId: 'org-001',
      firstName: 'Amelia', lastName: 'Torres', dateOfBirth: '2001-05-17',
      gender: 'FEMALE', preferredLanguage: 'en', isNewPatient: true, isActive: true,
      email: 'amelia.torres@gmail.com', phone: '(786) 555-0509',
      address: { street: '11200 Pines Blvd', city: 'Pembroke Pines', state: 'FL', zip: '33026' },
      portalAccess: false, lastVisitDate: undefined,
      allergies: '', currentMedications: 'None',
      insurancePlans: [{
        id: 'ins-005', priority: 'PRIMARY', payerName: 'Cigna', payerId: 'CIGNA',
        planName: 'Cigna OAP', memberId: 'C445566778', groupNumber: '3344556',
        subscriberName: 'CARLOS TORRES', relationship: 'CHILD',
        subscriberDob: '1975-03-22',
        copay: 30, deductible: 2000, outOfPocketMax: 8000,
        eligibilityStatus: 'UNKNOWN', isActive: true,
      }],
      createdAt: now, updatedAt: now,
    },
    {
      id: 'pt-006', mrn: 'OF-24-10055', organizationId: 'org-001',
      firstName: 'Robert', lastName: 'Kim', dateOfBirth: '1968-02-14',
      gender: 'MALE', preferredLanguage: 'en', isNewPatient: false, isActive: true,
      email: 'rkim@hotmail.com', phone: '(305) 555-0611',
      address: { street: '999 Brickell Bay Dr', city: 'Miami', state: 'FL', zip: '33131' },
      portalAccess: true, lastVisitDate: '2025-02-28',
      allergies: 'Codeine', currentMedications: 'Prednisolone 1% QID OS',
      insurancePlans: [{
        id: 'ins-006', priority: 'PRIMARY', payerName: 'Blue Cross Blue Shield of Florida',
        payerId: 'BCBSF', planName: 'Blue Options PPO', memberId: 'XYZ998877665',
        groupNumber: '7654321', subscriberName: 'ROBERT KIM', relationship: 'SELF',
        copay: 0, deductible: 1000, outOfPocketMax: 5000,
        eligibilityStatus: 'ACTIVE', eligibilityCheckedAt: now, isActive: true,
        eligibilityDetails: {
          planName: 'BCBS Blue Options PPO', coinsurance: 20, deductibleMet: 1000,
          outOfPocketMet: 800, lastVerifiedAt: now, visionBenefit: false,
        }
      }],
      createdAt: '2018-11-03T08:00:00Z', updatedAt: now,
    },
    {
      id: 'pt-007', mrn: 'OF-24-10298', organizationId: 'org-001',
      firstName: 'Vivian', lastName: 'Okonkwo', dateOfBirth: '1972-11-08',
      gender: 'FEMALE', preferredLanguage: 'en', isNewPatient: true, isActive: true,
      email: 'vivian.okonkwo@work.com', phone: '(954) 555-0712',
      address: { street: '500 E Broward Blvd', city: 'Fort Lauderdale', state: 'FL', zip: '33394' },
      portalAccess: false, lastVisitDate: undefined,
      allergies: 'NKDA', currentMedications: 'Amlodipine 5mg QD',
      referralSource: 'Dr. Lopez (Internal Medicine)',
      insurancePlans: [{
        id: 'ins-007', priority: 'PRIMARY', payerName: 'Cigna', payerId: 'CIGNA',
        planName: 'Cigna LocalPlus', memberId: 'C778899001', groupNumber: '8833221',
        subscriberName: 'VIVIAN OKONKWO', relationship: 'SELF',
        copay: 50, deductible: 3000, outOfPocketMax: 9000,
        eligibilityStatus: 'PENDING', isActive: true,
      }],
      createdAt: now, updatedAt: now,
    },
    {
      id: 'pt-008', mrn: 'OF-24-10134', organizationId: 'org-001',
      firstName: 'James', lastName: 'Whitfield', dateOfBirth: '1943-06-25',
      gender: 'MALE', preferredLanguage: 'en', isNewPatient: false, isActive: true,
      email: '', phone: '(305) 555-0813',
      address: { street: '100 Lincoln Rd', city: 'Miami Beach', state: 'FL', zip: '33139' },
      emergencyContact: { name: 'Patricia Whitfield', relationship: 'Daughter', phone: '(305) 555-0814' },
      portalAccess: false, lastVisitDate: '2024-12-01',
      allergies: 'Aspirin', currentMedications: 'Eylea (aflibercept) 2mg OS monthly, Lisinopril 5mg QD',
      insurancePlans: [
        {
          id: 'ins-008a', priority: 'PRIMARY', payerName: 'Medicare', payerId: '00901',
          planName: 'Medicare Part B', memberId: '3CD7-GH8-PQ44',
          subscriberName: 'JAMES WHITFIELD', relationship: 'SELF',
          copay: 0, deductible: 240, outOfPocketMax: 8700,
          eligibilityStatus: 'ACTIVE', eligibilityCheckedAt: now, isActive: true,
          eligibilityDetails: {
            planName: 'Medicare Part B', coinsurance: 20, deductibleMet: 240,
            outOfPocketMet: 3450, lastVerifiedAt: now, visionBenefit: true,
          }
        },
        {
          id: 'ins-008b', priority: 'SECONDARY', payerName: 'Humana', payerId: 'HUMANA',
          planName: 'Humana Medigap Plan G', memberId: 'H445566778',
          subscriberName: 'JAMES WHITFIELD', relationship: 'SELF',
          copay: 0, eligibilityStatus: 'ACTIVE', isActive: true,
          eligibilityCheckedAt: now,
        }
      ],
      createdAt: '2017-04-22T09:00:00Z', updatedAt: now,
    },
  ]
}

// ── KV Patient Store ──────────────────────────────────────────────────────────
const KV_PATIENT_INDEX = 'patients:index'   // Set of all patient IDs
const KV_PREFIX        = 'patient:'

/**
 * Initialize KV with seed data if empty
 */
export async function ensureSeedData(kv: KVNamespace): Promise<void> {
  const index = await kv.get(KV_PATIENT_INDEX)
  if (index) return  // already seeded

  const patients = getSeedPatients()
  const ids: string[] = []

  await Promise.all(patients.map(async (p) => {
    p.fullName = `${p.firstName} ${p.lastName}`
    p.age      = calcAge(p.dateOfBirth)
    await kv.put(`${KV_PREFIX}${p.id}`, JSON.stringify(p))
    ids.push(p.id)
  }))

  await kv.put(KV_PATIENT_INDEX, JSON.stringify(ids))
}

/**
 * Get all patient IDs
 */
async function getAllIds(kv: KVNamespace): Promise<string[]> {
  const raw = await kv.get(KV_PATIENT_INDEX)
  return raw ? JSON.parse(raw) : []
}

/**
 * Get a single patient by ID
 */
export async function getPatient(kv: KVNamespace, id: string): Promise<Patient | null> {
  const raw = await kv.get(`${KV_PREFIX}${id}`)
  if (!raw) return null
  const p = JSON.parse(raw) as Patient
  p.fullName = `${p.firstName} ${p.lastName}`
  p.age      = calcAge(p.dateOfBirth)
  return p
}

/**
 * Search patients by name, MRN, phone, or DOB
 */
export async function searchPatients(
  kv: KVNamespace,
  query: string,
  limit = 20
): Promise<PatientSearchResult[]> {
  await ensureSeedData(kv)

  const ids    = await getAllIds(kv)
  const q      = query.toLowerCase().trim()
  // Multi-token AND matching: every space-separated token must appear somewhere
  const tokens = q.split(/\s+/).filter(Boolean)
  const results: PatientSearchResult[] = []

  for (const id of ids) {
    const raw = await kv.get(`${KV_PREFIX}${id}`)
    if (!raw) continue
    const p = JSON.parse(raw) as Patient

    const searchable = [
      `${p.firstName} ${p.lastName}`,
      p.mrn,
      p.phone || '',
      p.cellPhone || '',
      p.email || '',
      p.dateOfBirth,
      p.dateOfBirth.replace(/-/g, '/'),
      ...p.insurancePlans.map(i => i.memberId),
    ].join(' ').toLowerCase()

    const phoneDigits = (p.phone || p.cellPhone || '').replace(/\D/g, '')
    const qDigits     = q.replace(/\D/g, '')

    const matches = tokens.every(token =>
      searchable.includes(token) ||
      (qDigits.length >= 4 && phoneDigits.includes(qDigits))
    )

    if (matches) {
      results.push({
        id: p.id,
        mrn: p.mrn,
        fullName: `${p.firstName} ${p.lastName}`,
        dateOfBirth: p.dateOfBirth,
        age: calcAge(p.dateOfBirth),
        phone: p.phone || p.cellPhone,
        email: p.email,
        lastVisitDate: p.lastVisitDate,
        primaryInsurance: p.insurancePlans.find(i => i.priority === 'PRIMARY')?.payerName,
        isNewPatient: p.isNewPatient,
        isActive: p.isActive,
      })
    }
    if (results.length >= limit) break
  }

  return results
}

/**
 * List all patients (paginated)
 */
export async function listPatients(
  kv: KVNamespace,
  page = 1,
  pageSize = 25
): Promise<{ patients: PatientSearchResult[], total: number }> {
  await ensureSeedData(kv)
  const ids    = await getAllIds(kv)
  const total  = ids.length
  const sliced = ids.slice((page - 1) * pageSize, page * pageSize)
  const patients: PatientSearchResult[] = []

  for (const id of sliced) {
    const raw = await kv.get(`${KV_PREFIX}${id}`)
    if (!raw) continue
    const p = JSON.parse(raw) as Patient
    patients.push({
      id: p.id,
      mrn: p.mrn,
      fullName: `${p.firstName} ${p.lastName}`,
      dateOfBirth: p.dateOfBirth,
      age: calcAge(p.dateOfBirth),
      phone: p.phone || p.cellPhone,
      email: p.email,
      lastVisitDate: p.lastVisitDate,
      primaryInsurance: p.insurancePlans.find(i => i.priority === 'PRIMARY')?.payerName,
      isNewPatient: p.isNewPatient,
      isActive: p.isActive,
    })
  }

  return { patients, total }
}

/**
 * Create a new patient
 */
export async function createPatient(
  kv: KVNamespace,
  input: PatientCreateInput
): Promise<Patient> {
  const now = new Date().toISOString()
  const id  = `pt-${crypto.randomUUID().slice(0, 8)}`
  const mrn = generateMrn()

  const patient: Patient = {
    id,
    mrn,
    organizationId: 'org-001',
    ...input,
    isNewPatient: true,
    isActive: true,
    portalAccess: false,
    insurancePlans: (input.insurancePlans || []).map((ins, idx) => ({
      ...ins,
      id: `ins-${id}-${idx}`,
      eligibilityStatus: 'UNKNOWN' as const,
    })),
    fullName: `${input.firstName} ${input.lastName}`,
    age: calcAge(input.dateOfBirth),
    createdAt: now,
    updatedAt: now,
  }

  await kv.put(`${KV_PREFIX}${id}`, JSON.stringify(patient))

  // Update index
  const ids = await getAllIds(kv)
  ids.unshift(id)  // newest first
  await kv.put(KV_PATIENT_INDEX, JSON.stringify(ids))

  return patient
}

/**
 * Update patient fields
 */
export async function updatePatient(
  kv: KVNamespace,
  id: string,
  updates: Partial<Patient>
): Promise<Patient | null> {
  const existing = await getPatient(kv, id)
  if (!existing) return null

  const updated: Patient = {
    ...existing,
    ...updates,
    id,
    updatedAt: new Date().toISOString(),
  }

  await kv.put(`${KV_PREFIX}${id}`, JSON.stringify(updated))
  return updated
}

/**
 * Add or update insurance plan on a patient
 */
export async function upsertInsurancePlan(
  kv: KVNamespace,
  patientId: string,
  plan: Omit<import('../types/patient').InsurancePlan, 'id' | 'eligibilityStatus'> & { id?: string }
): Promise<Patient | null> {
  const patient = await getPatient(kv, patientId)
  if (!patient) return null

  const planId   = plan.id || `ins-${crypto.randomUUID().slice(0, 8)}`
  const existing = patient.insurancePlans.findIndex(p => p.id === planId)

  const newPlan: import('../types/patient').InsurancePlan = {
    ...plan,
    id: planId,
    eligibilityStatus: 'UNKNOWN',
  }

  if (existing >= 0) {
    patient.insurancePlans[existing] = { ...patient.insurancePlans[existing], ...newPlan }
  } else {
    patient.insurancePlans.push(newPlan)
  }

  return updatePatient(kv, patientId, { insurancePlans: patient.insurancePlans })
}
