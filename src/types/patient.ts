// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Patient & Insurance Types (Phase 1B)
// ─────────────────────────────────────────────────────────────────────────────

export interface Address {
  street: string
  city: string
  state: string
  zip: string
}

export interface EmergencyContact {
  name: string
  relationship: string
  phone: string
}

export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN'
export type InsurancePriority = 'PRIMARY' | 'SECONDARY' | 'TERTIARY'
export type EligibilityStatus = 'ACTIVE' | 'INACTIVE' | 'UNKNOWN' | 'PENDING'

export interface InsurancePlan {
  id: string
  priority: InsurancePriority
  payerName: string
  payerId: string        // EDI payer ID
  planName?: string
  groupNumber?: string
  memberId: string
  subscriberName?: string
  subscriberDob?: string
  relationship: string   // SELF | SPOUSE | CHILD | OTHER
  copay?: number
  deductible?: number
  outOfPocketMax?: number
  eligibilityStatus: EligibilityStatus
  eligibilityCheckedAt?: string
  effectiveDate?: string
  terminationDate?: string
  cardFrontUrl?: string
  cardBackUrl?: string
  isActive: boolean
  // Eligibility response details
  eligibilityDetails?: EligibilityDetails
}

export interface EligibilityDetails {
  planName?: string
  groupName?: string
  coinsurance?: number       // Percentage (e.g. 20 = 20%)
  deductibleMet?: number
  outOfPocketMet?: number
  copaySpecialist?: number
  copayPCP?: number
  visionBenefit?: boolean
  visionCopay?: number
  visionAllowance?: number
  lastVerifiedAt: string
  rawResponse?: Record<string, unknown>
}

export interface Patient {
  id: string
  mrn: string
  organizationId: string
  firstName: string
  lastName: string
  middleName?: string
  dateOfBirth: string       // ISO date string
  gender: Gender
  genderIdentity?: string
  race?: string
  ethnicity?: string
  preferredLanguage: string
  email?: string
  phone?: string
  cellPhone?: string
  address: Address
  emergencyContact?: EmergencyContact
  portalAccess: boolean
  referralSource?: string
  isActive: boolean
  // Clinical flags
  allergies?: string
  currentMedications?: string
  preferredPharmacy?: string
  // Flags
  isNewPatient: boolean
  lastVisitDate?: string
  nextAppointment?: string
  // Insurance
  insurancePlans: InsurancePlan[]
  // Metadata
  createdAt: string
  updatedAt: string
  // Computed
  fullName?: string
  age?: number
}

export interface PatientSearchResult {
  id: string
  mrn: string
  fullName: string
  dateOfBirth: string
  age: number
  phone?: string
  email?: string
  lastVisitDate?: string
  primaryInsurance?: string
  isNewPatient: boolean
  isActive: boolean
}

export interface PatientCreateInput {
  firstName: string
  lastName: string
  middleName?: string
  dateOfBirth: string
  gender: Gender
  preferredLanguage: string
  email?: string
  phone?: string
  cellPhone?: string
  address: Address
  emergencyContact?: EmergencyContact
  referralSource?: string
  allergies?: string
  currentMedications?: string
  insurancePlans?: Omit<InsurancePlan, 'id' | 'eligibilityStatus' | 'eligibilityCheckedAt'>[]
}

// Common US insurance payers for autocomplete
export const COMMON_PAYERS = [
  { id: '60054', name: 'Aetna' },
  { id: 'BCBSF', name: 'Blue Cross Blue Shield of Florida' },
  { id: 'BCBSIL', name: 'Blue Cross Blue Shield of Illinois' },
  { id: 'CIGNA', name: 'Cigna' },
  { id: 'HUMANA', name: 'Humana' },
  { id: '00901', name: 'Medicare' },
  { id: 'MDCD',  name: 'Medicaid' },
  { id: 'UHC',   name: 'UnitedHealthcare' },
  { id: 'MVPHP', name: 'MVP Health Plan' },
  { id: 'OXHP',  name: 'Oxford Health Plans' },
  { id: 'WPS',   name: 'WPS Health Insurance' },
  { id: 'TRICARE',name: 'TRICARE' },
  { id: 'VSP',   name: 'VSP Vision Care' },
  { id: 'EYE',   name: 'EyeMed Vision Care' },
  { id: 'DAVIS', name: 'Davis Vision' },
  { id: 'NUVISION', name: 'NVA (National Vision Administrators)' },
  { id: 'CAREFIRST', name: 'CareFirst BlueCross BlueShield' },
  { id: 'KAISER', name: 'Kaiser Permanente' },
  { id: 'ANTHEM', name: 'Anthem Blue Cross' },
  { id: 'MOLINA', name: 'Molina Healthcare' },
]

export const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA',
  'HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC',
]
