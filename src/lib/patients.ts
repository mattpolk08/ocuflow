// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Patient Store (D1-backed)
// ─────────────────────────────────────────────────────────────────────────────

import type { Patient, PatientCreateInput, PatientSearchResult } from '../types/patient'
import { dbGet, dbAll, dbRun, uid as genUid, toJson, fromJson, now } from './db'

export function calcAge(dob: string): number {
  const birth = new Date(dob)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

function generateMrn(): string {
  const year = new Date().getFullYear().toString().slice(-2)
  const rand = Math.floor(10000 + Math.random() * 89999)
  return `OF-${year}-${rand}`
}

function rowToPatient(r: Record<string, unknown>): Patient {
  return {
    id: r.id as string,
    organizationId: r.organization_id as string,
    mrn: r.mrn as string,
    firstName: r.first_name as string,
    lastName: r.last_name as string,
    dateOfBirth: r.date_of_birth as string,
    gender: r.gender as string,
    email: r.email as string,
    phone: r.phone as string,
    cellPhone: r.cell_phone as string,
    homePhone: r.home_phone as string,
    address: {
      street: r.address_street as string,
      city: r.address_city as string,
      state: r.address_state as string,
      zip: r.address_zip as string,
      country: (r.address_country as string) || 'US',
    },
    emergencyContact: (r.emergency_contact_name as string) ? {
      name: r.emergency_contact_name as string,
      relationship: r.emergency_contact_relationship as string,
      phone: r.emergency_contact_phone as string,
    } : undefined,
    preferredLanguage: (r.preferred_language as string) || 'en',
    isNewPatient: Boolean(r.is_new_patient),
    isActive: Boolean(r.is_active),
    portalAccess: Boolean(r.portal_access),
    lastVisitDate: r.last_visit_date as string,
    allergies: fromJson<string[]>(r.allergies_json as string) || [],
    currentMedications: fromJson<string[]>(r.current_medications_json as string) || [],
    insurancePlans: fromJson<import('../types/patient').InsurancePlan[]>(r.insurance_plans_json as string) || [],
    notes: r.notes as string,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

export async function ensureSeedData(kv: KVNamespace, db?: D1Database): Promise<void> {
  if (!db) return
  const count = await dbGet<{ n: number }>(db, 'SELECT COUNT(*) as n FROM patients')
  if (count && count.n > 0) return

  await dbRun(db, `INSERT OR IGNORE INTO organizations (id, name) VALUES ('org-001', 'Advanced Eye Care of Miami')`)

  const ts = now()
  const seedPatients = [
    {
      id: 'pt-001', mrn: 'OF-24-10042', orgId: 'org-001',
      first: 'Margaret', last: 'Sullivan', dob: '1948-03-12',
      gender: 'FEMALE', email: 'msullivan@email.com', phone: '(305) 555-0101',
      street: '1420 Ocean Drive', city: 'Miami Beach', state: 'FL', zip: '33139',
      ecName: 'Thomas Sullivan', ecRel: 'Spouse', ecPhone: '(305) 555-0102',
      isNew: 0, lastVisit: '2025-11-15',
    },
    {
      id: 'pt-002', mrn: 'OF-24-10043', orgId: 'org-001',
      first: 'James', last: 'Rivera', dob: '1985-07-22',
      gender: 'MALE', email: 'jrivera@email.com', phone: '(305) 555-0201',
      street: '850 Brickell Ave', city: 'Miami', state: 'FL', zip: '33131',
      ecName: 'Maria Rivera', ecRel: 'Spouse', ecPhone: '(305) 555-0202',
      isNew: 0, lastVisit: '2025-10-03',
    },
    {
      id: 'pt-003', mrn: 'OF-24-10044', orgId: 'org-001',
      first: 'Aisha', last: 'Thompson', dob: '2012-04-18',
      gender: 'FEMALE', email: 'parent.thompson@email.com', phone: '(305) 555-0301',
      street: '220 Coral Way', city: 'Coral Gables', state: 'FL', zip: '33134',
      ecName: 'Denise Thompson', ecRel: 'Mother', ecPhone: '(305) 555-0302',
      isNew: 1, lastVisit: null,
    },
  ]

  for (const p of seedPatients) {
    await dbRun(db, `INSERT OR IGNORE INTO patients
      (id, organization_id, mrn, first_name, last_name, date_of_birth, gender, email, phone, cell_phone,
       address_street, address_city, address_state, address_zip, address_country,
       emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
       is_new_patient, is_active, portal_access, last_visit_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'US', ?, ?, ?, ?, 1, 0, ?, ?, ?)`,
      [p.id, p.orgId, p.mrn, p.first, p.last, p.dob, p.gender, p.email, p.phone, p.phone,
       p.street, p.city, p.state, p.zip,
       p.ecName, p.ecRel, p.ecPhone,
       p.isNew, p.lastVisit, ts, ts])
  }
}

export async function getPatient(kv: KVNamespace, id: string, db?: D1Database): Promise<Patient | null> {
  if (db) {
    const row = await dbGet<Record<string, unknown>>(db, 'SELECT * FROM patients WHERE id = ?', [id])
    return row ? rowToPatient(row) : null
  }
  return null
}

export async function getPatientByMrn(kv: KVNamespace, mrn: string, db?: D1Database): Promise<Patient | null> {
  if (db) {
    const row = await dbGet<Record<string, unknown>>(db, 'SELECT * FROM patients WHERE mrn = ?', [mrn])
    return row ? rowToPatient(row) : null
  }
  return null
}

export async function listPatients(kv: KVNamespace, options?: { page?: number; limit?: number; orgId?: string }, db?: D1Database): Promise<{ patients: Patient[]; total: number; page: number; limit: number }> {
  const page = options?.page || 1
  const limit = options?.limit || 25
  const offset = (page - 1) * limit

  if (db) {
    const total = await dbGet<{ n: number }>(db, 'SELECT COUNT(*) as n FROM patients WHERE is_active = 1')
    const rows = await dbAll<Record<string, unknown>>(db, 'SELECT * FROM patients WHERE is_active = 1 ORDER BY last_name, first_name LIMIT ? OFFSET ?', [limit, offset])
    return { patients: rows.map(rowToPatient), total: total?.n || 0, page, limit }
  }
  return { patients: [], total: 0, page, limit }
}

export async function searchPatients(kv: KVNamespace, query: string, db?: D1Database): Promise<PatientSearchResult[]> {
  if (db) {
    const q = `%${query}%`
    const rows = await dbAll<Record<string, unknown>>(db,
      `SELECT * FROM patients WHERE is_active = 1 AND (first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR mrn LIKE ? OR phone LIKE ?) ORDER BY last_name, first_name LIMIT 20`,
      [q, q, q, q, q])
    return rows.map(r => ({
      id: r.id as string,
      mrn: r.mrn as string,
      firstName: r.first_name as string,
      lastName: r.last_name as string,
      dateOfBirth: r.date_of_birth as string,
      email: r.email as string,
      phone: r.phone as string,
      isNewPatient: Boolean(r.is_new_patient),
      lastVisitDate: r.last_visit_date as string,
    }))
  }
  return []
}

export async function createPatient(kv: KVNamespace, input: PatientCreateInput, db?: D1Database): Promise<Patient> {
  const id = genUid('pt')
  const mrn = generateMrn()
  const ts = now()
  const patient: Patient = {
    id, mrn,
    organizationId: input.organizationId || 'org-001',
    firstName: input.firstName,
    lastName: input.lastName,
    dateOfBirth: input.dateOfBirth,
    gender: input.gender,
    email: input.email,
    phone: input.phone,
    cellPhone: input.cellPhone,
    homePhone: input.homePhone,
    address: input.address || { street: '', city: '', state: '', zip: '' },
    emergencyContact: input.emergencyContact,
    preferredLanguage: input.preferredLanguage || 'en',
    isNewPatient: true,
    isActive: true,
    portalAccess: false,
    allergies: input.allergies || [],
    currentMedications: input.currentMedications || [],
    insurancePlans: input.insurancePlans || [],
    notes: input.notes,
    createdAt: ts,
    updatedAt: ts,
  }

  if (db) {
    await dbRun(db, `INSERT INTO patients
      (id, organization_id, mrn, first_name, last_name, date_of_birth, gender, email, phone, cell_phone, home_phone,
       address_street, address_city, address_state, address_zip,
       emergency_contact_name, emergency_contact_relationship, emergency_contact_phone,
       preferred_language, is_new_patient, is_active, portal_access,
       allergies_json, current_medications_json, insurance_plans_json, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 0, ?, ?, ?, ?, ?, ?)`,
      [id, patient.organizationId, mrn, patient.firstName, patient.lastName, patient.dateOfBirth,
       patient.gender, patient.email, patient.phone, patient.cellPhone || null, patient.homePhone || null,
       patient.address?.street, patient.address?.city, patient.address?.state, patient.address?.zip,
       patient.emergencyContact?.name || null, patient.emergencyContact?.relationship || null, patient.emergencyContact?.phone || null,
       patient.preferredLanguage,
       toJson(patient.allergies), toJson(patient.currentMedications), toJson(patient.insurancePlans),
       patient.notes || null, ts, ts])
  }
  return patient
}

export async function updatePatient(kv: KVNamespace, id: string, updates: Partial<Patient>, db?: D1Database): Promise<Patient | null> {
  const existing = await getPatient(kv, id, db)
  if (!existing) return null
  const updated = { ...existing, ...updates, id, updatedAt: now() }

  if (db) {
    await dbRun(db, `UPDATE patients SET
      first_name=?, last_name=?, date_of_birth=?, gender=?, email=?, phone=?, cell_phone=?, home_phone=?,
      address_street=?, address_city=?, address_state=?, address_zip=?,
      emergency_contact_name=?, emergency_contact_relationship=?, emergency_contact_phone=?,
      preferred_language=?, is_new_patient=?, is_active=?, portal_access=?, last_visit_date=?,
      allergies_json=?, current_medications_json=?, insurance_plans_json=?, notes=?, updated_at=?
      WHERE id=?`,
      [updated.firstName, updated.lastName, updated.dateOfBirth, updated.gender,
       updated.email, updated.phone, updated.cellPhone || null, updated.homePhone || null,
       updated.address?.street, updated.address?.city, updated.address?.state, updated.address?.zip,
       updated.emergencyContact?.name || null, updated.emergencyContact?.relationship || null, updated.emergencyContact?.phone || null,
       updated.preferredLanguage, updated.isNewPatient ? 1 : 0, updated.isActive ? 1 : 0, updated.portalAccess ? 1 : 0,
       updated.lastVisitDate || null,
       toJson(updated.allergies), toJson(updated.currentMedications), toJson(updated.insurancePlans),
       updated.notes || null, updated.updatedAt, id])
  }
  return updated
}

export async function upsertInsurancePlan(
  kv: KVNamespace,
  patientId: string,
  plan: Omit<import('../types/patient').InsurancePlan, 'id' | 'eligibilityStatus'> & { id?: string },
  db?: D1Database
): Promise<Patient | null> {
  const patient = await getPatient(kv, patientId, db)
  if (!patient) return null

  const planId = plan.id || `ins-${crypto.randomUUID().slice(0, 8)}`
  const existing = patient.insurancePlans.findIndex(p => p.id === planId)
  const newPlan: import('../types/patient').InsurancePlan = { ...plan, id: planId, eligibilityStatus: 'UNKNOWN' }

  if (existing >= 0) {
    patient.insurancePlans[existing] = { ...patient.insurancePlans[existing], ...newPlan }
  } else {
    patient.insurancePlans.push(newPlan)
  }
  return updatePatient(kv, patientId, { insurancePlans: patient.insurancePlans }, db)
}
