// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 7B: Telehealth / Async Video Visit — KV Library
// ─────────────────────────────────────────────────────────────────────────────

import type {
  TelehealthVisit, VisitStatus, VisitType, Urgency,
  PreVisitQuestionnaire, ProviderReview, InfoRequest,
  VisitMessage, TelehealthDashboard, ReviewPrescription,
} from '../types/telehealth'

// ── KV key helpers ─────────────────────────────────────────────────────────────
const K = {
  seeded:    () => 'th:seeded',
  index:     () => 'th:visit:index',
  visit:  (id: string) => `th:visit:${id}`,
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}
function now(): string { return new Date().toISOString() }
function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86_400_000).toISOString()
}
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString()
}
function hoursFromNow(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString()
}

// ── Seed data ─────────────────────────────────────────────────────────────────
const SEED_VISITS: TelehealthVisit[] = [
  // 1. Async review — intake complete, awaiting provider
  {
    id: 'th-001',
    patientId: 'pt-001',
    patientName: 'Margaret Sullivan',
    patientDob: '1958-04-12',
    patientEmail: 'margaret.sullivan@email.com',
    patientPhone: '(305) 555-0101',
    visitType: 'ASYNC_REVIEW',
    urgency: 'ROUTINE',
    status: 'INTAKE_COMPLETE',
    chiefComplaint: 'Blurry vision in right eye for 2 weeks',
    questionnaire: {
      chiefComplaint: 'Blurry vision in right eye for 2 weeks',
      symptomsOnset: '14 days ago',
      symptomsSeverity: 4,
      symptomsDescription: 'Gradual blurring of central vision in right eye, worse when reading. No sudden onset. Using current glasses prescription from 18 months ago.',
      affectedEye: 'OD',
      currentMedications: 'Timolol 0.5% BID OU, Latanoprost 0.005% QHS OS, Lisinopril 10mg QD',
      allergies: 'Penicillin, Sulfa drugs',
      recentEyeInjury: false,
      visionChanges: true,
      lightSensitivity: false,
      floatersOrFlashes: false,
      painLevel: 1,
      additionalNotes: 'Would prefer to avoid coming in if prescription update can be handled remotely.',
      photoUrls: ['https://placehold.co/400x300/1e293b/94a3b8?text=Fundus+OD', 'https://placehold.co/400x300/1e293b/94a3b8?text=VA+Chart'],
      submittedAt: hoursAgo(3),
      answers: [],
    },
    infoRequests: [],
    messages: [
      { id: 'thm-001a', visitId: 'th-001', senderId: 'pt-001', senderName: 'Margaret Sullivan', senderRole: 'PATIENT', body: 'I submitted my questionnaire. Please let me know if you need anything else.', sentAt: hoursAgo(3), isRead: true },
    ],
    assignedProviderId: 'dr-chen',
    assignedProviderName: 'Dr. Sarah Chen',
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(3),
  },

  // 2. Under review — provider actively reviewing
  {
    id: 'th-002',
    patientId: 'pt-003',
    patientName: 'Derek Holloway',
    patientDob: '1972-09-30',
    patientEmail: 'derek.holloway@email.com',
    patientPhone: '(305) 555-0103',
    visitType: 'ASYNC_REVIEW',
    urgency: 'URGENT',
    status: 'UNDER_REVIEW',
    chiefComplaint: 'Sudden onset floaters and flashing lights OS',
    questionnaire: {
      chiefComplaint: 'Sudden onset floaters and flashing lights OS',
      symptomsOnset: '1 day ago',
      symptomsSeverity: 7,
      symptomsDescription: 'Woke up yesterday morning with a shower of new floaters in left eye. Also noticing peripheral flashing lights, especially in dark environments. No curtain or shadow over vision yet.',
      affectedEye: 'OS',
      currentMedications: 'None',
      allergies: 'NKDA',
      recentEyeInjury: false,
      visionChanges: true,
      lightSensitivity: false,
      floatersOrFlashes: true,
      painLevel: 0,
      additionalNotes: 'Very concerned. Should I go to the ER?',
      photoUrls: [],
      submittedAt: hoursAgo(6),
      answers: [],
    },
    infoRequests: [
      { id: 'ir-001', visitId: 'th-002', requestedBy: 'Dr. Raj Patel', requestedAt: hoursAgo(2), question: 'Is there any dark shadow or curtain affecting your peripheral vision? Please describe what percentage of your visual field is affected.', isResolved: false },
    ],
    messages: [
      { id: 'thm-002a', visitId: 'th-002', senderId: 'pt-003', senderName: 'Derek Holloway', senderRole: 'PATIENT', body: 'This came on very suddenly, really scared. Is this an emergency?', sentAt: hoursAgo(6), isRead: true },
      { id: 'thm-002b', visitId: 'th-002', senderId: 'dr-patel', senderName: 'Dr. Raj Patel', senderRole: 'PROVIDER', body: 'I\'m reviewing your case now. Your symptoms need careful evaluation. I\'ve sent you a follow-up question — please answer ASAP.', sentAt: hoursAgo(2), isRead: true },
    ],
    assignedProviderId: 'dr-patel',
    assignedProviderName: 'Dr. Raj Patel',
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(2),
  },

  // 3. Completed async review
  {
    id: 'th-003',
    patientId: 'pt-005',
    patientName: 'Priya Nair',
    patientDob: '1985-11-03',
    patientEmail: 'priya.nair@email.com',
    patientPhone: '(786) 555-0105',
    visitType: 'MEDICATION_FOLLOWUP',
    urgency: 'ROUTINE',
    status: 'COMPLETED',
    chiefComplaint: 'Routine follow-up for dry eye medications',
    questionnaire: {
      chiefComplaint: 'Routine follow-up for dry eye medications',
      symptomsOnset: 'Ongoing',
      symptomsSeverity: 3,
      symptomsDescription: 'Dry eye symptoms are mostly well-controlled on current regimen. Occasional flare-ups in air-conditioned environments. Requesting refill of cyclosporine drops.',
      affectedEye: 'OU',
      currentMedications: 'Cyclosporine 0.05% BID OU, Preservative-free artificial tears PRN',
      allergies: 'None known',
      recentEyeInjury: false,
      visionChanges: false,
      lightSensitivity: true,
      floatersOrFlashes: false,
      painLevel: 2,
      additionalNotes: 'Also taking Metformin 500mg BID for diabetes.',
      photoUrls: [],
      submittedAt: daysAgo(3),
      answers: [],
    },
    review: {
      providerId: 'dr-chen',
      providerName: 'Dr. Sarah Chen',
      reviewedAt: daysAgo(2),
      clinicalFindings: 'Patient reports stable dry eye disease on current regimen. Symptom severity 3/10 — acceptable for chronic condition. No new ocular symptoms reported.',
      assessment: 'Dry eye disease (H04.123), well-controlled on cyclosporine 0.05% BID OU. Stable.',
      plan: 'Continue current regimen. Refill cyclosporine 0.05% 6-month supply. Continue preservative-free artificial tears PRN. Consider warm compresses BID for meibomian gland support.',
      prescriptions: [
        { medication: 'Cyclosporine ophthalmic 0.05%', dosage: '1 drop each eye', frequency: 'BID', duration: '6 months', refills: 2 },
      ],
      followUpRequired: true,
      followUpInDays: 90,
      referralRequired: false,
      patientInstructions: 'Continue your current eye drop regimen. Apply warm compresses to eyelids for 5 minutes twice daily to help with meibomian gland function. If symptoms worsen significantly, contact us immediately.',
      internalNotes: 'Patient compliance appears good. Diabetic eye exam due in 6 months — schedule reminder.',
      signedAt: daysAgo(2),
    },
    infoRequests: [],
    messages: [
      { id: 'thm-003a', visitId: 'th-003', senderId: 'pt-005', senderName: 'Priya Nair', senderRole: 'PATIENT', body: 'Submitted my follow-up questionnaire. Just need a refill, thank you!', sentAt: daysAgo(3), isRead: true },
      { id: 'thm-003b', visitId: 'th-003', senderId: 'dr-chen', senderName: 'Dr. Sarah Chen', senderRole: 'PROVIDER', body: 'I\'ve completed my review. Your prescription has been renewed for 6 months. Please see the instructions in your care summary. See you in 90 days!', sentAt: daysAgo(2), isRead: true },
    ],
    assignedProviderId: 'dr-chen',
    assignedProviderName: 'Dr. Sarah Chen',
    createdAt: daysAgo(4),
    updatedAt: daysAgo(2),
    completedAt: daysAgo(2),
  },

  // 4. Live video — upcoming
  {
    id: 'th-004',
    patientId: 'pt-007',
    patientName: 'James Reyes',
    patientDob: '1990-06-15',
    patientEmail: 'james.reyes@email.com',
    patientPhone: '(305) 555-0107',
    visitType: 'LIVE_VIDEO',
    urgency: 'ROUTINE',
    status: 'INTAKE_COMPLETE',
    chiefComplaint: 'Post-op check after cataract surgery — right eye',
    scheduledAt: hoursFromNow(2),
    videoRoomUrl: 'https://meet.oculoflow.ai/room/th-004-secure',
    questionnaire: {
      chiefComplaint: 'Post-op check after cataract surgery — right eye',
      symptomsOnset: '1 week post-op',
      symptomsSeverity: 2,
      symptomsDescription: 'One week after cataract surgery right eye. Vision has been clearing nicely. Mild light sensitivity is resolving. Following all post-op instructions. No pain, redness, or discharge.',
      affectedEye: 'OD',
      currentMedications: 'Prednisolone 1% QID OD, Moxifloxacin 0.5% QID OD, Ketorolac 0.5% TID OD',
      allergies: 'None',
      recentEyeInjury: false,
      visionChanges: true,
      lightSensitivity: true,
      floatersOrFlashes: false,
      painLevel: 1,
      additionalNotes: 'Very happy with the result so far! Can we discuss glasses prescription timing?',
      photoUrls: ['https://placehold.co/400x300/1e293b/94a3b8?text=Post-op+OD'],
      submittedAt: hoursAgo(12),
      answers: [],
    },
    infoRequests: [],
    messages: [
      { id: 'thm-004a', visitId: 'th-004', senderId: 'pt-007', senderName: 'James Reyes', senderRole: 'PATIENT', body: 'Looking forward to the video call. Vision is really improving!', sentAt: hoursAgo(12), isRead: false },
    ],
    assignedProviderId: 'dr-chen',
    assignedProviderName: 'Dr. Sarah Chen',
    createdAt: daysAgo(2),
    updatedAt: hoursAgo(12),
  },

  // 5. Photo review — awaiting info
  {
    id: 'th-005',
    patientId: 'pt-009',
    patientName: 'Carlos Rivera',
    patientDob: '1968-02-28',
    patientEmail: 'carlos.rivera@email.com',
    patientPhone: '(786) 555-0109',
    visitType: 'PHOTO_REVIEW',
    urgency: 'URGENT',
    status: 'AWAITING_INFO',
    chiefComplaint: 'Red eye with discharge — possible conjunctivitis',
    questionnaire: {
      chiefComplaint: 'Red eye with discharge — possible conjunctivitis',
      symptomsOnset: '2 days ago',
      symptomsSeverity: 6,
      symptomsDescription: 'Right eye became red 2 days ago. Yellow-green discharge especially in mornings. Eye feels gritty and irritated. No vision changes. Left eye starting to show mild redness today.',
      affectedEye: 'OD',
      currentMedications: 'Metformin 1000mg BID, Atorvastatin 40mg QD',
      allergies: 'Amoxicillin',
      recentEyeInjury: false,
      visionChanges: false,
      lightSensitivity: true,
      floatersOrFlashes: false,
      painLevel: 4,
      additionalNotes: 'I work in a daycare — worried about spreading it.',
      photoUrls: ['https://placehold.co/400x300/1e293b/94a3b8?text=Red+Eye+OD', 'https://placehold.co/400x300/1e293b/94a3b8?text=Discharge+Photo'],
      submittedAt: hoursAgo(8),
      answers: [],
    },
    infoRequests: [
      { id: 'ir-002', visitId: 'th-005', requestedBy: 'Dr. Amy Torres', requestedAt: hoursAgo(5), question: 'Is the discharge watery or thick/purulent? Can you submit a clearer close-up photo of the eye in good natural lighting?', patientResponse: 'The discharge is thick and yellowish-green. Uploading a better photo now.', respondedAt: hoursAgo(4), isResolved: true },
      { id: 'ir-003', visitId: 'th-005', requestedBy: 'Dr. Amy Torres', requestedAt: hoursAgo(4), question: 'Have you been in contact with anyone else diagnosed with pink eye recently? Any recent upper respiratory infection?', isResolved: false },
    ],
    messages: [
      { id: 'thm-005a', visitId: 'th-005', senderId: 'pt-009', senderName: 'Carlos Rivera', senderRole: 'PATIENT', body: 'Submitting photos now. This is really uncomfortable.', sentAt: hoursAgo(8), isRead: true },
      { id: 'thm-005b', visitId: 'th-005', senderId: 'dr-torres', senderName: 'Dr. Amy Torres', senderRole: 'PROVIDER', body: 'Thank you for the photos. I\'ve sent a couple follow-up questions. Please answer when you get a chance.', sentAt: hoursAgo(5), isRead: true },
      { id: 'thm-005c', visitId: 'th-005', senderId: 'pt-009', senderName: 'Carlos Rivera', senderRole: 'PATIENT', body: 'I answered the first question. Uploading a new photo.', sentAt: hoursAgo(4), isRead: false },
    ],
    assignedProviderId: 'dr-torres',
    assignedProviderName: 'Dr. Amy Torres',
    createdAt: daysAgo(1),
    updatedAt: hoursAgo(4),
  },

  // 6. Intake pending — just created
  {
    id: 'th-006',
    patientId: 'pt-002',
    patientName: 'Eleanor Voss',
    patientDob: '1945-07-22',
    patientEmail: 'eleanor.voss@email.com',
    patientPhone: '(954) 555-0102',
    visitType: 'SECOND_OPINION',
    urgency: 'ROUTINE',
    status: 'INTAKE_PENDING',
    chiefComplaint: 'Second opinion on glaucoma diagnosis and treatment plan',
    infoRequests: [],
    messages: [],
    createdAt: hoursAgo(1),
    updatedAt: hoursAgo(1),
  },

  // 7. Completed — retina concern
  {
    id: 'th-007',
    patientId: 'pt-004',
    patientName: 'Sofia Mendez',
    patientDob: '1978-03-19',
    patientEmail: 'sofia.mendez@email.com',
    visitType: 'ASYNC_REVIEW',
    urgency: 'ROUTINE',
    status: 'COMPLETED',
    chiefComplaint: 'Annual diabetic eye screening review',
    questionnaire: {
      chiefComplaint: 'Annual diabetic eye screening review',
      symptomsOnset: 'Annual check',
      symptomsSeverity: 1,
      symptomsDescription: 'No specific eye complaints. Blood sugar has been well-controlled this year (HbA1c 6.8%). Submitting annual screening photos taken at my endocrinologist\'s office.',
      affectedEye: 'OU',
      currentMedications: 'Metformin 1000mg BID, Ozempic 0.5mg weekly',
      allergies: 'None',
      recentEyeInjury: false,
      visionChanges: false,
      lightSensitivity: false,
      floatersOrFlashes: false,
      painLevel: 0,
      additionalNotes: '',
      photoUrls: ['https://placehold.co/400x300/1e293b/94a3b8?text=Fundus+OD+Diabetic', 'https://placehold.co/400x300/1e293b/94a3b8?text=Fundus+OS+Diabetic'],
      submittedAt: daysAgo(5),
      answers: [],
    },
    review: {
      providerId: 'dr-torres',
      providerName: 'Dr. Amy Torres',
      reviewedAt: daysAgo(4),
      clinicalFindings: 'Fundus photos reviewed bilaterally. No diabetic retinopathy changes identified. No macular edema. Optic discs appear healthy. Cup-to-disc ratio 0.3 OU.',
      assessment: 'No diabetic retinopathy (Z01.01). HbA1c 6.8% — excellent glycemic control.',
      plan: 'Continue annual diabetic eye screenings. No treatment required at this time. Maintain current glycemic control.',
      prescriptions: [],
      followUpRequired: true,
      followUpInDays: 365,
      referralRequired: false,
      patientInstructions: 'Great news — no signs of diabetic eye disease! Keep up the excellent blood sugar control. Schedule your next annual diabetic eye screening in 12 months.',
      internalNotes: 'Excellent glycemic control. Low risk for progression. Annual follow-up appropriate.',
      signedAt: daysAgo(4),
    },
    infoRequests: [],
    messages: [
      { id: 'thm-007a', visitId: 'th-007', senderId: 'dr-torres', senderName: 'Dr. Amy Torres', senderRole: 'PROVIDER', body: 'Great news Sofia! I reviewed your fundus photos — no signs of diabetic eye disease. Keep up the great work with your blood sugar management!', sentAt: daysAgo(4), isRead: true },
    ],
    assignedProviderId: 'dr-torres',
    assignedProviderName: 'Dr. Amy Torres',
    createdAt: daysAgo(6),
    updatedAt: daysAgo(4),
    completedAt: daysAgo(4),
  },
]

// ── Seed guard ─────────────────────────────────────────────────────────────────
export async function ensureTelehealthSeed(kv: KVNamespace): Promise<void> {
  const flag = await kv.get(K.seeded())
  if (flag) return
  await kv.put(K.index(), JSON.stringify(SEED_VISITS.map(v => v.id)))
  await Promise.all(SEED_VISITS.map(v => kv.put(K.visit(v.id), JSON.stringify(v))))
  await kv.put(K.seeded(), '1')
}

// ── CRUD helpers ──────────────────────────────────────────────────────────────
export async function listVisits(
  kv: KVNamespace,
  filter?: string,
  providerId?: string,
): Promise<TelehealthVisit[]> {
  await ensureTelehealthSeed(kv)
  const rawIdx = await kv.get(K.index())
  if (!rawIdx) return []
  const ids: string[] = JSON.parse(rawIdx)
  const all = await Promise.all(ids.map(id => kv.get(K.visit(id))))
  let visits = all.filter(Boolean).map(r => JSON.parse(r!) as TelehealthVisit)

  if (filter && filter !== 'ALL') {
    if (filter === 'PENDING') {
      visits = visits.filter(v => v.status === 'INTAKE_COMPLETE' || v.status === 'INTAKE_PENDING')
    } else if (filter === 'MY_QUEUE' && providerId) {
      visits = visits.filter(v => v.assignedProviderId === providerId)
    } else if (filter === 'URGENT') {
      visits = visits.filter(v => v.urgency === 'URGENT' || v.urgency === 'EMERGENT')
    } else if (filter === 'LIVE') {
      visits = visits.filter(v => v.visitType === 'LIVE_VIDEO')
    }
  }

  return visits.sort((a, b) => {
    const urgOrder = { EMERGENT: 0, URGENT: 1, ROUTINE: 2 }
    if (urgOrder[a.urgency] !== urgOrder[b.urgency]) return urgOrder[a.urgency] - urgOrder[b.urgency]
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

export async function getVisit(kv: KVNamespace, id: string): Promise<TelehealthVisit | null> {
  await ensureTelehealthSeed(kv)
  const raw = await kv.get(K.visit(id))
  return raw ? JSON.parse(raw) : null
}

export async function createVisit(
  kv: KVNamespace,
  data: Omit<TelehealthVisit, 'id' | 'createdAt' | 'updatedAt' | 'infoRequests' | 'messages'>,
): Promise<TelehealthVisit> {
  await ensureTelehealthSeed(kv)
  const id = uid('th')
  const n = now()
  const visit: TelehealthVisit = {
    ...data,
    id, infoRequests: [], messages: [],
    createdAt: n, updatedAt: n,
  }
  const rawIdx = await kv.get(K.index())
  const ids: string[] = rawIdx ? JSON.parse(rawIdx) : []
  ids.unshift(id)
  await kv.put(K.index(), JSON.stringify(ids))
  await kv.put(K.visit(id), JSON.stringify(visit))
  return visit
}

export async function updateVisitStatus(
  kv: KVNamespace,
  id: string,
  status: VisitStatus,
): Promise<TelehealthVisit | null> {
  const raw = await kv.get(K.visit(id)); if (!raw) return null
  const visit: TelehealthVisit = { ...JSON.parse(raw), status, updatedAt: now() }
  if (status === 'COMPLETED') visit.completedAt = now()
  await kv.put(K.visit(id), JSON.stringify(visit))
  return visit
}

export async function assignVisit(
  kv: KVNamespace,
  id: string,
  providerId: string,
  providerName: string,
): Promise<TelehealthVisit | null> {
  const raw = await kv.get(K.visit(id)); if (!raw) return null
  const visit: TelehealthVisit = {
    ...JSON.parse(raw),
    assignedProviderId: providerId,
    assignedProviderName: providerName,
    status: 'UNDER_REVIEW',
    updatedAt: now(),
  }
  await kv.put(K.visit(id), JSON.stringify(visit))
  return visit
}

export async function submitQuestionnaire(
  kv: KVNamespace,
  id: string,
  q: PreVisitQuestionnaire,
): Promise<TelehealthVisit | null> {
  const raw = await kv.get(K.visit(id)); if (!raw) return null
  const visit: TelehealthVisit = {
    ...JSON.parse(raw),
    questionnaire: { ...q, submittedAt: now() },
    status: 'INTAKE_COMPLETE',
    updatedAt: now(),
  }
  await kv.put(K.visit(id), JSON.stringify(visit))
  return visit
}

export async function submitReview(
  kv: KVNamespace,
  id: string,
  review: Omit<ProviderReview, 'signedAt'>,
  sign: boolean,
): Promise<TelehealthVisit | null> {
  const raw = await kv.get(K.visit(id)); if (!raw) return null
  const r: ProviderReview = { ...review, reviewedAt: now(), signedAt: sign ? now() : undefined }
  const visit: TelehealthVisit = {
    ...JSON.parse(raw),
    review: r,
    status: sign ? 'COMPLETED' : 'UNDER_REVIEW',
    updatedAt: now(),
    ...(sign ? { completedAt: now() } : {}),
  }
  await kv.put(K.visit(id), JSON.stringify(visit))
  return visit
}

export async function addInfoRequest(
  kv: KVNamespace,
  visitId: string,
  question: string,
  requestedBy: string,
): Promise<TelehealthVisit | null> {
  const raw = await kv.get(K.visit(visitId)); if (!raw) return null
  const parsed: TelehealthVisit = JSON.parse(raw)
  const ir: InfoRequest = {
    id: uid('ir'), visitId, requestedBy,
    requestedAt: now(), question, isResolved: false,
  }
  parsed.infoRequests = [...(parsed.infoRequests || []), ir]
  parsed.status = 'AWAITING_INFO'
  parsed.updatedAt = now()
  await kv.put(K.visit(visitId), JSON.stringify(parsed))
  return parsed
}

export async function respondToInfoRequest(
  kv: KVNamespace,
  visitId: string,
  irId: string,
  response: string,
): Promise<TelehealthVisit | null> {
  const raw = await kv.get(K.visit(visitId)); if (!raw) return null
  const parsed: TelehealthVisit = JSON.parse(raw)
  parsed.infoRequests = (parsed.infoRequests || []).map(ir =>
    ir.id === irId
      ? { ...ir, patientResponse: response, respondedAt: now(), isResolved: true }
      : ir
  )
  // Restore status if all info requests resolved
  const anyOpen = parsed.infoRequests.some(ir => !ir.isResolved)
  if (!anyOpen && parsed.status === 'AWAITING_INFO') parsed.status = 'UNDER_REVIEW'
  parsed.updatedAt = now()
  await kv.put(K.visit(visitId), JSON.stringify(parsed))
  return parsed
}

export async function addMessage(
  kv: KVNamespace,
  visitId: string,
  senderId: string,
  senderName: string,
  senderRole: 'PATIENT' | 'PROVIDER' | 'STAFF',
  body: string,
): Promise<TelehealthVisit | null> {
  const raw = await kv.get(K.visit(visitId)); if (!raw) return null
  const parsed: TelehealthVisit = JSON.parse(raw)
  const msg: VisitMessage = {
    id: uid('thm'), visitId, senderId, senderName, senderRole, body,
    sentAt: now(), isRead: false,
  }
  parsed.messages = [...(parsed.messages || []), msg]
  parsed.updatedAt = now()
  await kv.put(K.visit(visitId), JSON.stringify(parsed))
  return parsed
}

// ── Dashboard aggregation ─────────────────────────────────────────────────────
export async function getTelehealthDashboard(kv: KVNamespace): Promise<TelehealthDashboard> {
  await ensureTelehealthSeed(kv)
  const visits = await listVisits(kv)
  const todayStr = new Date().toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()

  const pendingIntake   = visits.filter(v => v.status === 'INTAKE_PENDING').length
  const awaitingReview  = visits.filter(v => v.status === 'INTAKE_COMPLETE').length
  const underReview     = visits.filter(v => v.status === 'UNDER_REVIEW').length
  const awaitingInfo    = visits.filter(v => v.status === 'AWAITING_INFO').length
  const completedToday  = visits.filter(v => v.completedAt?.startsWith(todayStr)).length
  const totalThisWeek   = visits.filter(v => v.createdAt >= weekAgo).length
  const urgentPending   = visits.filter(v =>
    (v.urgency === 'URGENT' || v.urgency === 'EMERGENT') &&
    v.status !== 'COMPLETED' && v.status !== 'CANCELLED'
  ).length

  const completed = visits.filter(v => v.status === 'COMPLETED' && v.review?.reviewedAt)
  const avgReviewMinutes = completed.length > 0
    ? Math.round(completed.reduce((sum, v) => {
        const created = new Date(v.createdAt).getTime()
        const reviewed = new Date(v.review!.reviewedAt).getTime()
        return sum + (reviewed - created) / 60000
      }, 0) / completed.length)
    : 0

  const recentVisits  = visits.filter(v => v.status !== 'COMPLETED').slice(0, 5)
  const upcomingLive  = visits.filter(v => v.visitType === 'LIVE_VIDEO' && v.scheduledAt)
    .sort((a, b) => (a.scheduledAt || '').localeCompare(b.scheduledAt || ''))

  return {
    pendingIntake, awaitingReview, underReview, awaitingInfo,
    completedToday, totalThisWeek, avgReviewMinutes, urgentPending,
    recentVisits, upcomingLive,
  }
}
