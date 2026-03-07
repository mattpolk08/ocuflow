// ─── Phase 8B – Prior Authorization Types ───────────────────────────────────

export type PAStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_INFO'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'DENIED'
  | 'APPEALED'
  | 'APPEAL_APPROVED'
  | 'APPEAL_DENIED'
  | 'EXPIRED'
  | 'WITHDRAWN';

export type PAUrgency = 'ROUTINE' | 'URGENT' | 'EXPEDITED';

export type PAServiceType =
  | 'DRUG'
  | 'PROCEDURE'
  | 'EQUIPMENT'
  | 'LAB'
  | 'REFERRAL'
  | 'IMAGING';

export type PADecisionReason =
  | 'MEDICALLY_NECESSARY'
  | 'NOT_MEDICALLY_NECESSARY'
  | 'STEP_THERAPY_REQUIRED'
  | 'FORMULARY_EXCEPTION'
  | 'DUPLICATE_REQUEST'
  | 'MISSING_DOCUMENTATION'
  | 'CRITERIA_MET'
  | 'CRITERIA_NOT_MET'
  | 'PEER_TO_PEER_REQUIRED'
  | 'ADMINISTRATIVE_DENIAL';

export type DocumentType =
  | 'CLINICAL_NOTES'
  | 'LAB_RESULTS'
  | 'IMAGING'
  | 'LETTER_OF_MEDICAL_NECESSITY'
  | 'PRIOR_TREATMENT_HISTORY'
  | 'DIAGNOSIS_SUPPORTING'
  | 'INSURANCE_CARD'
  | 'REFERRAL_LETTER';

export interface PADocument {
  id: string;
  type: DocumentType;
  name: string;
  uploadedAt: string;
  uploadedBy: string;
  sizeKb: number;
  url: string;
}

export interface PANote {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
}

export interface PAStatusHistory {
  status: PAStatus;
  changedAt: string;
  changedBy: string;
  reason?: string;
  note?: string;
}

export interface PeerToPeerRequest {
  id: string;
  requestedAt: string;
  scheduledAt?: string;
  completedAt?: string;
  physicianName: string;
  reviewerName?: string;
  outcome?: 'APPROVED' | 'DENIED' | 'PENDING';
  notes?: string;
}

export interface AppealRecord {
  id: string;
  submittedAt: string;
  deadline: string;
  appealType: 'FIRST_LEVEL' | 'SECOND_LEVEL' | 'EXTERNAL' | 'EXPEDITED';
  reason: string;
  additionalDocs: string[];
  outcome?: 'APPROVED' | 'DENIED' | 'PENDING';
  outcomeDate?: string;
  outcomeNotes?: string;
}

export interface PriorAuthRequest {
  id: string;
  patientId: string;
  patientName: string;
  patientDob: string;
  insurancePlan: string;
  memberId: string;
  groupNumber: string;
  payerId: string;
  payerName: string;
  providerId: string;
  providerName: string;
  providerNpi: string;
  serviceType: PAServiceType;
  serviceCode: string;           // CPT, HCPCS, NDC, or drug name
  serviceDescription: string;
  icdCodes: string[];
  quantity?: number;
  unit?: string;
  startDate?: string;
  endDate?: string;
  urgency: PAUrgency;
  status: PAStatus;
  submittedAt?: string;
  decisionDate?: string;
  expiresAt?: string;
  authNumber?: string;           // Payer-assigned auth number when approved
  decisionReason?: PADecisionReason;
  decisionNotes?: string;
  documents: PADocument[];
  notes: PANote[];
  statusHistory: PAStatusHistory[];
  peerToPeer?: PeerToPeerRequest;
  appeal?: AppealRecord;
  linkedRxId?: string;           // Link to erx prescription
  linkedOrderId?: string;        // Link to optical order
  createdAt: string;
  updatedAt: string;
}

export interface PACriteria {
  payerId: string;
  payerName: string;
  serviceCode: string;
  serviceDescription: string;
  requiresPA: boolean;
  stepTherapyRequired: boolean;
  stepTherapyDrugs?: string[];
  documentationRequired: DocumentType[];
  typicalTurnaround: string;     // e.g. "3-5 business days"
  urgentTurnaround: string;      // e.g. "72 hours"
  notes?: string;
}

export interface PADashboardStats {
  totalActive: number;
  pendingSubmission: number;
  awaitingDecision: number;
  approved: number;
  denied: number;
  appealed: number;
  expiringSoon: number;          // within 30 days
  avgTurnaroundDays: number;
  approvalRate: number;          // 0–1
  recentRequests: PriorAuthRequest[];
}

export interface PAResp<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
