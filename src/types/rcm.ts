// Phase 9A – Revenue Cycle Management Types

export type ClaimStatus =
  | 'DRAFT'
  | 'READY_TO_SUBMIT'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'PENDING'
  | 'UNDER_REVIEW'
  | 'PARTIAL_PAYMENT'
  | 'PAID'
  | 'DENIED'
  | 'APPEALED'
  | 'APPEAL_APPROVED'
  | 'APPEAL_DENIED'
  | 'VOIDED'
  | 'WRITTEN_OFF';

export type PaymentMethod =
  | 'CHECK'
  | 'EFT'
  | 'CREDIT_CARD'
  | 'CASH'
  | 'PATIENT_PORTAL'
  | 'ADJUSTMENT'
  | 'WRITE_OFF';

export type DenialReason =
  | 'NOT_COVERED'
  | 'AUTHORIZATION_REQUIRED'
  | 'MEDICAL_NECESSITY'
  | 'DUPLICATE_CLAIM'
  | 'TIMELY_FILING'
  | 'ELIGIBILITY'
  | 'COORDINATION_OF_BENEFITS'
  | 'CODING_ERROR'
  | 'MISSING_INFORMATION'
  | 'BUNDLING'
  | 'FREQUENCY_LIMITATION'
  | 'OTHER';

export type AgingBucket =
  | 'CURRENT'
  | '1_30'
  | '31_60'
  | '61_90'
  | '91_120'
  | 'OVER_120';

export type PayerType =
  | 'COMMERCIAL'
  | 'MEDICARE'
  | 'MEDICAID'
  | 'TRICARE'
  | 'WORKERS_COMP'
  | 'SELF_PAY'
  | 'OTHER';

export interface ClaimLine {
  id: string;
  cptCode: string;
  description: string;
  modifier?: string;
  units: number;
  chargedAmount: number;
  allowedAmount?: number;
  paidAmount?: number;
  adjustmentAmount?: number;
  patientResponsibility?: number;
  diagnosisCodes: string[];
  serviceDate: string;
}

export interface ClaimPayment {
  id: string;
  paymentDate: string;
  amount: number;
  method: PaymentMethod;
  referenceNumber?: string;
  checkNumber?: string;
  eftTraceNumber?: string;
  postedBy: string;
  notes?: string;
  claimLines?: { lineId: string; paid: number; adjustment: number }[];
}

export interface ClaimDenial {
  id: string;
  deniedDate: string;
  reason: DenialReason;
  reasonDescription: string;
  claimLineIds?: string[];
  appealDeadline?: string;
  appealedDate?: string;
  resolution?: string;
}

export interface ClaimNote {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
  isInternal: boolean;
}

export interface RCMClaim {
  id: string;
  claimNumber: string;
  patientId: string;
  patientName: string;
  dateOfBirth?: string;
  examId?: string;
  payerId: string;
  payerName: string;
  payerType: PayerType;
  insurancePlan: string;
  memberId: string;
  groupNumber?: string;
  providerId: string;
  providerName: string;
  providerNpi?: string;
  renderingProvider?: string;
  facilityName?: string;
  serviceDate: string;
  submittedDate?: string;
  status: ClaimStatus;
  totalCharged: number;
  totalAllowed?: number;
  totalPaid?: number;
  totalAdjustment?: number;
  totalPatientResponsibility?: number;
  outstandingBalance: number;
  agingBucket: AgingBucket;
  claimLines: ClaimLine[];
  payments: ClaimPayment[];
  denials: ClaimDenial[];
  notes: ClaimNote[];
  priorAuthNumber?: string;
  referralNumber?: string;
  diagnosisCodes: string[];
  placeOfService?: string;
  billingCode?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RemittanceAdvice {
  id: string;
  payerId: string;
  payerName: string;
  checkDate: string;
  checkNumber?: string;
  eftTraceNumber?: string;
  totalPayment: number;
  claimsCount: number;
  claimIds: string[];
  status: 'RECEIVED' | 'POSTED' | 'EXCEPTIONS';
  receivedDate: string;
  postedBy?: string;
  postedDate?: string;
}

export interface PatientStatement {
  id: string;
  patientId: string;
  patientName: string;
  patientEmail?: string;
  statementDate: string;
  dueDate: string;
  totalDue: number;
  claimIds: string[];
  status: 'DRAFT' | 'SENT' | 'VIEWED' | 'PAID' | 'OVERDUE';
  sentDate?: string;
  paidDate?: string;
  paymentPlanId?: string;
}

export interface PaymentPlan {
  id: string;
  patientId: string;
  patientName: string;
  totalBalance: number;
  monthlyPayment: number;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'COMPLETED' | 'DEFAULTED' | 'CANCELLED';
  payments: { date: string; amount: number; status: 'SCHEDULED' | 'PAID' | 'MISSED' }[];
  claimIds: string[];
  createdAt: string;
}

export interface RCMDashboardStats {
  totalCharges: number;
  totalCollected: number;
  totalOutstanding: number;
  collectionRate: number;
  cleanClaimRate: number;
  denialRate: number;
  avgDaysToPayment: number;
  claimsInFlight: number;
  pendingClaims: number;
  deniedClaims: number;
  readyToSubmit: number;
  draftClaims: number;
  recentActivity: RCMClaim[];
  agingBuckets: { bucket: AgingBucket; count: number; amount: number }[];
  topDenialReasons: { reason: DenialReason; count: number; amount: number }[];
  payerMix: { payerType: PayerType; percentage: number; collected: number }[];
}

export interface RCMResp<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  total?: number;
  page?: number;
  pageSize?: number;
}
