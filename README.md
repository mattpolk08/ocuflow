# OculoFlow — Next-Generation Ophthalmology EHR & Practice Management

## Project Overview
- **Name**: OculoFlow
- **Version**: 2.6.0
- **Goal**: Full-stack ophthalmology EHR and practice management system built on Cloudflare Pages + Hono
- **Stack**: TypeScript · Hono · Cloudflare Workers · KV Storage · Vite · Tailwind CSS (CDN) · Chart.js

## Live URLs (Sandbox)
- **Home**: https://3000-iifn0r2yzm6jt3tc1fv0q-5634da27.sandbox.novita.ai/
- **Login**: …/login
- **Dashboard**: …/dashboard
- **Patients**: …/patients
- **Schedule**: …/schedule
- **Exam**: …/exam
- **Billing**: …/billing
- **Reports**: …/reports
- **Optical**: …/optical
- **Patient Portal**: …/portal
- **Clinical Messaging**: …/messaging
- **Reminders & Comms**: …/reminders
- **Provider Scorecards**: …/scorecards
- **Telehealth**: …/telehealth
- **eRx (E-Prescribing)**: …/erx
- **AI Clinical Decision Support**: …/ai
- **Prior Authorization**: …/priorauth
- **Revenue Cycle Management**: …/rcm
- **API Health**: …/api/health
- **GitHub**: https://github.com/mattpolk08/ocuflow

## Completed Phases

### Phase 1 — Digital Front Door (Intake)
- Patient intake wizard with 2FA, insurance card OCR, HIPAA e-signature
- Routes: `GET /intake`, `POST /api/intake/*`

### Phase 1A — Command Center Dashboard
- Daily schedule, Kanban flow board, provider tracking, timeline view, patient detail modal
- Routes: `GET /dashboard`, `GET /api/dashboard/*`

### Phase 1B — Patient Registry & Insurance Verification
- Patient search, registration wizard, insurance plans, real-time eligibility verification
- Routes: `GET /patients`, `GET|POST|PUT /api/patients/*`
- Seed: 9 patients (Margaret Sullivan, Derek Holloway, Priya Nair, etc.)

### Phase 1C — Scheduling Engine
- Day/week calendar, slot booking, appointment management, waitlist
- Routes: `GET /schedule`, `GET|POST|PUT /api/schedule/*`
- Providers: Dr. Emily Chen (dr-chen), Dr. Raj Patel (dr-patel)
- **Note**: Appointment creation requires `startTime` (not `time`); alias supported as of v1.6.0
- Valid appointment types: `COMPREHENSIVE_EYE_EXAM`, `CONTACT_LENS_FITTING`, `GLAUCOMA_FOLLOWUP`, etc.

### Phase 1D — Exam Record
- VA, IOP, Slit Lamp, Fundus, Refraction, A&P with ICD-10, sign & lock
- Routes: `GET /exam`, `GET|POST /api/exams/*`
- Seed: exam-001 (Margaret Sullivan, SIGNED, completionPct 100)

### Phase 2A — Billing & Claims
- Superbill builder, CPT/ICD-10 coding, claims queue, copay collection, AR management
- Routes: `GET /billing`, `GET|POST /api/billing/*`
- 35 ophthalmology CPT codes; 5 seed superbills; AR $1,893 charged, $115 collected
- Endpoints: superbills, payments, ar-summary, cpt catalog/search/suggest

### Phase 2B — Reports & Analytics
- Revenue, provider productivity, payer mix, AR aging, appointment trends, exam analytics
- Routes: `GET /reports`, `GET /api/reports/*` (8 endpoints, `?range=7d|30d|90d|ytd|all`)
- Charts: Chart.js bar/line/doughnut; range picker

### Phase 3A — Optical Dispensary
- Frame & lens inventory, contact lens catalog, lab order lifecycle tracking, Rx viewer
- Routes: `GET /optical`, `GET|POST|PATCH /api/optical/*` (14 endpoints)
- Seed: 6 frames, 5 lenses, 3 contact lenses, 2 Rx, 3 orders
- Order workflow: DRAFT → APPROVED → SENT_TO_LAB → IN_PRODUCTION → QC → RECEIVED → READY_FOR_PICKUP → DISPENSED

### Phase 4A — Patient Portal
- Patient-facing self-service portal with session-based authentication
- Login modes: demo (any patient by ID) and real (last name + DOB)
- **6 tabs**: Overview (dashboard), Appointments (request/view), Records (Rx/exam history), Optical (order tracker), Billing (balance), Messages (secure threads)
- Routes: `GET /portal`, `GET|POST /api/portal/*` (12 endpoints)
- Auth: `POST /api/portal/auth/demo` → `sessionId` → pass as `X-Portal-Session` header
- Seed data: 3 message threads, linked to existing patients/Rx/optical orders

### Phase 5A — Clinical Messaging & Task Board
- 3-pane staff inbox with priority-coded threads (STAT/URGENT/Normal)
- **Views**: Inbox, STAT messages, Patient Care, Referrals, Billing, Archived
- **Task Board**: All tasks, My tasks, Overdue — with status transitions, comments, due dates
- **Recall List**: Patient recall tracking with status workflow (PENDING→CONTACTED→SCHEDULED)
- Routes: `GET /messaging`, `GET|POST|PATCH /api/messaging/*` (18 endpoints)
- Staff: 6 seeded (Dr. Chen, Dr. Patel, Dr. Torres, Maria Gonzalez, James Okafor, Lisa Park)
- Seed: 5 threads (19 messages), 8 tasks, 5 recalls
- Features: reply (Ctrl+Enter), mark-read, pin/archive, task comments, recall contact logging, live search/filter

### Phase 6A — Appointment Reminders & Communications
- Automated SMS/email reminder engine with 2-way patient confirmation
- **6 tabs**: Overview (dashboard + upcoming), Message Log (filterable), No-Shows, Campaigns, Templates, Automation Rules
- **Overview**: pending reminders counter, sent/confirmed/no-show stats, response rate %, upcoming reminder queue, active campaigns, open no-shows
- **Message Log**: all outbound messages with status (DELIVERED/SENT/FAILED/PENDING/OPTED_OUT), patient responses (CONFIRMED/CANCELLED/RESCHEDULE), inline confirm/cancel buttons
- **No-Shows**: record missed appointments, send follow-up SMS with one click, status workflow (UNCONTACTED→FOLLOWUP_SENT→RESCHEDULED→DISMISSED)
- **Campaigns**: bulk outreach with progress bars, launch/pause controls, delivered/confirmed metrics
- **Templates**: 7 seeded templates (24h SMS, 48h Email, 1h SMS, Confirmation, No-Show F/U, Recall, Cancellation) with live variable preview (`{{patient_name}}`, `{{date}}`, `{{time}}`, `{{provider}}`, `{{location}}`, `{{reason}}`)
- **Automation Rules**: 4 seeded rules (48h email, 24h SMS, 1h SMS, no-show check) with toggle enable/disable
- Routes: `GET /reminders`, `GET|POST|PATCH /api/reminders/*` (18 endpoints)
- Modals: Send Message, New Campaign, New Template (all with validation)
- Seed: 7 templates, 4 rules, 8 messages, 3 no-shows (Marcus Webb, Carlos Rivera, Linda Park), 3 campaigns

### Phase 7A — Provider Scorecards & Benchmarking *(v2.0.0)*

- Per-provider KPI dashboards with deterministic simulation for 3 providers: Dr. Sarah Chen, Dr. Raj Patel, Dr. Amy Torres
- **5 tabs**: Practice Overview, Provider Scorecard, Benchmarks, Trends, Goals
- **Practice Overview**: provider leaderboard ranked by overall score, practice daily visit chart, visit-type breakdown (bar), revenue-by-payer (doughnut)
- **Provider Scorecard**: score ring (0–100 composite), 9-cell KPI grid (visits, new patients, revenue, collection rate, avg exam time, utilization, satisfaction, return-visit rate, coding accuracy), daily volume & revenue line charts, appointment-type & payer doughnut charts
- **Benchmarks**: per-metric bar rows comparing provider vs. practice avg vs. national avg (8 benchmarks: visits/day, exam duration, collection rate, satisfaction, no-show rate, coding accuracy, utilization, return-visit rate) + radar chart
- **Trends**: weekly performance snapshot table + bar/line charts for visits & revenue across 8 weeks
- **Goals**: filter by provider/status, progress bars, status chips (ON_TRACK/AT_RISK/ACHIEVED/MISSED), full CRUD modal (create, edit, delete)
- Date range selector: 7d / 30d / 90d / YTD across all views
- Routes: `GET /scorecards`, `GET|POST|PATCH|DELETE /api/scorecards/*` (14 endpoints)
- Seed: 8 goals across 3 providers; 8 benchmarks per provider; 8 weekly period snapshots
- KPIs: Volume (visits, new/return patients, no-shows, daily series), Efficiency (avg exam min, doc time, completion %, on-time %, utilization %), Revenue (charged, collected, collection rate, AR, by-payer), Quality (satisfaction score, return-visit rate, referral rate, preventive care, coding accuracy, composite quality score)
- Tests: 28/28 smoke, 36/36 functional

### Phase 7B — Telehealth / Async Video Visit *(v2.1.0)*
- Async video visit queue with pre-visit questionnaire + provider review & sign workflow
- **5 tabs**: Overview (dashboard stats), Visit Queue (filterable sidebar + detail pane), Live Sessions, Completed, Settings
- **Overview tab**: KPI cards (pending intake, awaiting review, under review, awaiting info, completed today, total this week, urgent pending, avg review time), recent visits list, upcoming live sessions panel
- **Visit Queue tab**: filterable sidebar (ALL / PENDING / URGENT / LIVE / MY_QUEUE) + detail pane with full visit info — questionnaire viewer, review form, info-request thread, patient messages, status control, provider assignment
- **Questionnaire viewer**: color-coded symptom severity bar, affected-eye badge, boolean flags (injury, vision changes, photophobia, floaters), pain scale
- **Review form**: clinical findings, assessment, ICD-10 plan, Rx items (drug + sig), follow-up scheduling, referral field, patient instructions, internal notes, "Save Draft" + "Sign & Complete"
- **Info requests**: provider → patient request thread; patient response recorded with `patientResponse` + `respondedAt`; auto-resolves visit back to UNDER_REVIEW when all answered
- **Patient messages**: live message thread between provider/staff and patient
- **New Visit wizard**: 3-step modal (Patient Info → Symptoms → Confirm) with field validation
- Visit urgency indicators: ROUTINE / URGENT (amber glow) / EMERGENT (red pulse animation)
- Status chips: INTAKE_PENDING · INTAKE_COMPLETE · UNDER_REVIEW · AWAITING_INFO · COMPLETED · CANCELLED
- Routes: `GET /telehealth`, `GET|POST|PATCH /api/telehealth/*` (12 endpoints)
- Seed: 7 visits with questionnaires, reviews, info-requests, messages across all status states
- API: `GET /visits?filter=PENDING|URGENT|LIVE|MY_QUEUE&providerId=`, `POST /visits`, `PATCH /:id/status|assign`, `POST /:id/questionnaire|review|info-request|messages`, `PATCH /:id/info-request/:irId`
- Tests: 19/19 smoke tests passed

### Phase 7C — E-Prescribing & PDMP *(v2.2.0)*
- Full electronic prescription lifecycle with 21-drug ophthalmology formulary and SIG builder
- **5 tabs**: Dashboard (KPI cards), Prescriptions (list + detail/write), Formulary (drug catalog), PDMP (monitoring), Settings (preferences)
- **Dashboard tab**: pending review count, signed today, sent today, refill requests, PDMP alerts, drug interaction alerts, recent prescriptions list, pending refills queue, PDMP alert summary
- **Prescriptions tab**: filterable prescription queue (All / Pending / Active / Signed / Refills) + write Rx panel with full SIG builder — drug search, dosage form, strength, directions, quantity, supply days, refills, pharmacy routing, allergy check, interaction check
- **Formulary tab**: 21-drug catalog organized by category (Glaucoma, Anti-VEGF, Anti-Infective, Anti-Inflammatory, Dry Eye, Decongestant/Antihistamine, Pupil Dilation, Anesthesia, Diagnostic), drug detail cards with contraindications and interactions
- **PDMP tab**: controlled substance monitoring reports, state query simulation, patient history view, risk score indicators
- **Prescription lifecycle**: DRAFT → PENDING_REVIEW → SIGNED → SENT → FILLED / CANCELLED / EXPIRED / DENIED
- **Drug interactions**: `POST /api/erx/interactions/check` — check a drug against a patient's current regimen
- **Patient allergies**: per-patient allergy record with severity classification (MILD / MODERATE / SEVERE / LIFE_THREATENING), allergen type (MEDICATION / ENVIRONMENTAL / FOOD), allergy notes
- **PDMP checks**: on-demand state PDMP query per patient + requestedBy audit trail
- **Refill workflow**: patients or pharmacy request refills → provider review queue → approve/deny
- Routes: `GET /erx`, `GET|POST|PATCH /api/erx/*` (19 endpoints)
- Seed: 7 sample prescriptions (Timolol, Latanoprost, Cyclosporine, Moxifloxacin, Prednisolone, Ketorolac, Aflibercept); 3 pharmacies; 21-drug formulary; 2 seeded PDMP reports; 2 allergy records
- API valid statuses: `DRAFT`, `PENDING_REVIEW`, `SIGNED`, `SENT`, `FILLED`, `CANCELLED`, `EXPIRED`, `DENIED`
- Tests: 26/26 smoke, 59/61 functional (2 test-data edge cases: `ACTIVE` not a valid eRx status → proper 400 validation)

### Phase 8A — AI Clinical Decision Support *(v2.3.0)*
- AI-powered clinical insights engine with ICD-10 smart suggest, drug interaction checker, guideline lookup, patient risk scoring, and auto-generated SOAP notes
- **5 tabs**: Dashboard (AI activity overview), ICD-10 (catalog + suggest), Guidelines (library + lookup), Risk Scoring (patient risk matrix), Notes (AI note generation)
- **Dashboard tab**: `pendingInsights`, `criticalAlerts`, `icdSuggestionsToday`, `notesGeneratedToday`, `riskScoresComputed`, `interactionAlertsActive`, seeded `recentInsights` cards with dismiss workflow
- **ICD-10 tab**: full ophthalmology ICD-10 catalog (GLAUCOMA, CATARACT, CORNEA, RETINA, OCULOMOTOR, NEURO_OPHTHALMIC, EYELID, LACRIMAL, CORNEA categories); category filter; smart suggest from symptom text; code detail view with `commonPresentations` and `relatedCodes`
- **Guidelines tab**: AAO/AGS/AOA clinical guidelines organized by topic; full-text lookup via `query`, `icdCodes`, or `topic`; by-ICD lookup; evidence-level badges (I / II / III); `keyRecommendations` list
- **Risk Scoring tab**: compute patient risk by category (`GLAUCOMA_PROGRESSION`, `DIABETIC_RETINOPATHY_PROGRESSION`, `AMD_PROGRESSION`, `VISION_LOSS`, `SURGICAL_RISK`, `MEDICATION_ADHERENCE`, `NO_SHOW_RISK`, `READMISSION_RISK`); returns `level` (LOW/MODERATE/HIGH/CRITICAL), `score` (0–100), `riskFactors` array; list all risk scores; filter by patientId / category
- **Notes tab**: AI SOAP note generator — input `chiefComplaint`, `diagnoses`, `medications`, `findings` → structured output with sections: `CHIEF_COMPLAINT`, `HPI`, `EXAM_FINDINGS`, `ASSESSMENT`, `PLAN`; note list with filter; requires `chiefComplaint` + `patientId`
- **Insights**: 5 seeded clinical insights (ICD_SUGGESTION, DRUG_INTERACTION, RISK_ALERT, GUIDELINE_ALERT, CARE_GAP); dismiss workflow with reason; filter by `type`, `priority`, `dismissed`
- Routes: `GET /ai`, `GET|POST|PATCH /api/ai/*` (18 endpoints)
- API structure: all responses wrapped in `{ success, data }` envelope; create endpoints return HTTP 201
- Seed: 5 clinical insights, 3 risk scores, 2 saved notes (auto-generated on first KV access)
- Key prefix: `ai:insight:`, `ai:risk:`, `ai:note:`, `ai:seeded`
- Tests: 31/31 smoke, **60/60 functional** ✅

### Phase 8B — Automated Prior Authorization *(v2.4.0)*
- End-to-end prior authorization lifecycle management from submission through appeal
- **5 tabs**: Dashboard (PA activity overview), Requests (list + detail), Criteria (clinical criteria catalog), Payers, Settings
- **Dashboard tab**: `totalActive`, `pendingSubmission`, `awaitingDecision`, `approved`, `denied`, `appealed`, `expiringSoon`, `avgDecisionDays`, `approvalRate`; recent activity list; urgency/status breakdown
- **Requests tab**: filterable PA queue by status/payer/urgency + full detail pane with documents, notes, appeal workflow, peer-to-peer scheduling
- **PA lifecycle**: `DRAFT` → `SUBMITTED` → `PENDING_INFO` → `UNDER_REVIEW` → `APPROVED` / `DENIED` → `APPEALED` → `APPEAL_APPROVED` / `APPEAL_DENIED`
- **Document management**: attach clinical notes, operative reports, imaging, labs per request; `type`, `name`, `uploadedBy`, `sizeKb`
- **Notes**: internal/external notes per request with `authorId`, `authorName`, `authorRole`, `isInternal`
- **Appeals**: first/second level + external review; `appealType`, `reason`, `supportingDocuments`, `requestedBy`
- **Peer-to-peer scheduling**: schedule clinician-to-payer review call; `scheduledDate`, `physicianName`, `physicianNpi`, `insuranceRepName`, `conferenceNumber`
- **Criteria catalog**: payer-specific and universal PA criteria lookup; filter by `payerId` or `serviceCode`
- Routes: `GET /priorauth`, `GET|POST|PATCH|DELETE /api/pa/*` (16 endpoints)
- Seed: 6 PA requests across all status states; 8 criteria entries; 5 payers
- Key prefix: `pa:req:`, `pa:idx`, `pa:seeded`
- Tests: 27/27 smoke, **62/62 functional** ✅

### Phase 9A — Revenue Cycle Management *(v2.6.0)*
- Full claims lifecycle management with payment posting, ERA/remittance processing, patient statements, and payment plans
- **5 tabs**: Overview (AR dashboard), Claims (list + detail), Remittance/ERA, Statements, Payment Plans
- **Overview tab**: `totalCharges`, `totalCollected`, `totalOutstanding`, `collectionRate`, `cleanClaimRate`, `denialRate`, `avgDaysToPayment`, `claimsInFlight`; AR aging buckets (CURRENT/1-30/31-60/61-90/91-120/120+); top denial reasons with counts and amounts; payer mix breakdown; recent activity table
- **Claims tab**: searchable/filterable claim queue (by patient, claim #, payer, status); full claim detail pane with claim lines, payments, denials, notes; inline payment posting and denial management; status update workflow
- **Claim lifecycle**: `DRAFT` → `READY_TO_SUBMIT` → `SUBMITTED` → `ACKNOWLEDGED` → `PENDING` / `UNDER_REVIEW` → `PARTIAL_PAYMENT` → `PAID` / `DENIED` → `APPEALED` → `APPEAL_APPROVED` / `APPEAL_DENIED` / `VOIDED` / `WRITTEN_OFF`
- **Payment posting**: amount, method (EFT/CHECK/CREDIT_CARD/CASH/PATIENT_PORTAL/ADJUSTMENT/WRITE_OFF), reference #, trace #, auto-calculates totalPaid and outstanding balance
- **Denial management**: reason codes (12 denial types: NOT_COVERED, AUTHORIZATION_REQUIRED, MEDICAL_NECESSITY, etc.), description, appeal deadline tracking
- **ERA/Remittance**: Electronic Remittance Advice records (RECEIVED → POSTED), EFT trace, check #, claims count
- **Patient Statements**: generate/track statements (DRAFT → SENT → VIEWED → PAID / OVERDUE)
- **Payment Plans**: installment plans with auto-generated payment schedule, SCHEDULED/PAID/MISSED per-payment tracking, ACTIVE/COMPLETED/DEFAULTED status
- Routes: `GET /rcm`, `GET|POST|PATCH|DELETE /api/rcm/*` (20 endpoints)
- Seed: 8 claims (PAID, PENDING, DENIED, DRAFT, PARTIAL_PAYMENT, APPEALED, WRITTEN_OFF, READY_TO_SUBMIT); 3 ERAs; 3 patient statements; 1 payment plan
- Key prefix: `rcm:claim:`, `rcm:era:`, `rcm:stmt:`, `rcm:pp:`, `rcm:seeded`
- Tests: 28/28 smoke, **87/87 functional** ✅

### Phase A1 — Authentication & Authorization *(v2.6.0)*
- Full staff authentication system with JWT (HS256), PBKDF2 password hashing, KV session store, and role-based access control
- **Staff roles**: ADMIN · PROVIDER · BILLING · FRONT_DESK · NURSE · OPTICAL (with permission matrix)
- **Login page** (`/login`): email/password form, password visibility toggle, demo credentials panel (auto-fills form), redirect-after-login, shake animation on error
- **Token pair**: 8-hour access token + 30-day refresh token (both HS256 JWTs with unique `jti` for revocation)
- **Token refresh**: silent `POST /api/auth/refresh` with session validation; access token renewed without re-login
- **Logout**: revokes refresh token via KV revocation list + invalidates KV session
- **PBKDF2**: 100,000 iterations, SHA-256, 16-byte random salt; constant-time hash comparison
- **`requireAuth` middleware**: validates Bearer JWT, checks revocation list, injects `c.var.auth` (AuthContext)
- **`requireRole(…roles)` factory**: ADMIN always passes; role mismatch → 403
- **Route protection**: all 17 staff API route groups (`/api/dashboard`, `/api/patients`, … `/api/rcm`) require JWT; role guards on billing/reports/optical/erx/rcm
- **`/api/auth/users`** CRUD: list (ADMIN), create (ADMIN), password change (self or ADMIN), activate/deactivate (ADMIN)
- **Seed users** (6): admin@oculoflow.com / Admin@123!, emily.chen@… / Provider@123!, raj.patel@… / Provider@123!, billing@… / Billing@123!, frontdesk@… / FrontDesk@123!, optical@… / Optical@123!
- **`/api/auth/demo-credentials`**: returns seed credentials when `DEMO_MODE=true` (never exposed in production)
- **`auth-nav.js`** shared frontend script: injected into all 16 staff pages — redirects unauthenticated users to `/login?next=…`, wraps all API calls with `oFetch()` (adds Bearer header, handles 401 → silent refresh → redirect), injects user role chip and logout button into page nav
- Routes: `GET /login`, `POST /api/auth/login|logout|refresh`, `GET /api/auth/me|users|demo-credentials|seed`, `POST /api/auth/users`, `PATCH /api/auth/users/:id/password|active`
- Key prefixes: `auth:user:`, `auth:email:`, `auth:session:`, `auth:revoked:`, `auth:user:idx`, `auth:seeded`
- Tests: **Smoke 26/26**, **Functional 37/37** ✅

| Module        | Base Path              | Key Endpoints                                                                         |
|---------------|------------------------|---------------------------------------------------------------------------------------|
| **Auth**      | /api/auth              | POST /login, /logout, /refresh; GET /me, /users, /demo-credentials; POST /users; PATCH /users/:id/password\|active |
| Intake        | /api/intake            | POST /start, /verify-otp, /insurance, /sign                                           |
| Dashboard     | /api/dashboard         | GET /summary, /appointments, /flow                                                    |
| Patients      | /api/patients          | GET /, /:id, POST /, PUT /:id, POST /:id/insurance                                    |
| Scheduling    | /api/schedule          | GET /slots, /appointments, POST /appointment, /waitlist                               |
| Exams         | /api/exams             | GET /, /:id, POST /, POST /:id/sign, POST /:id/amend                                  |
| Billing       | /api/billing           | GET /superbills, /ar, /cpt; POST /superbills/:id/status                               |
| Reports       | /api/reports           | GET /dashboard, /revenue, /providers, /payer-mix, /ar-aging                           |
| Optical       | /api/optical           | GET /inventory, /orders, /frames, /lenses, /contact-lenses                            |
| Portal        | /api/portal            | POST /auth/demo, GET /auth/session, /dashboard, /appointments, /messages, /rx, /optical-orders, /balance |
| Messaging     | /api/messaging         | GET /dashboard, /staff, /threads; POST /threads, /threads/:id/reply; PATCH archive/pin; GET|POST|PATCH /tasks, /recalls |
| Reminders     | /api/reminders         | GET /dashboard, /templates, /messages, /rules, /no-shows, /campaigns; POST /messages/send, /messages/reminder, /messages/:id/response, /no-shows, /no-shows/:id/followup, /campaigns, /campaigns/:id/launch; PATCH /templates/:id, /rules/:id, /no-shows/:id, /campaigns/:id/status |
| Scorecards    | /api/scorecards        | GET /providers, /summary(?range=), /providers/:id(?range=), /providers/:id/volume|efficiency|revenue|quality|benchmarks|snapshots, /goals(?providerId=); POST /goals; PATCH /goals/:id; DELETE /goals/:id |
| Telehealth    | /api/telehealth        | GET /dashboard, /visits(?filter=&providerId=), /visits/:id, /visits/:id/messages; POST /visits, /visits/:id/questionnaire, /visits/:id/review, /visits/:id/info-request, /visits/:id/messages; PATCH /visits/:id/status, /visits/:id/assign, /visits/:id/info-request/:irId |
| eRx           | /api/erx               | GET /ping, /dashboard, /prescriptions(?patientId=&status=&providerId=), /prescriptions/:id, /formulary, /formulary/:id, /formulary/categories/list, /pharmacies, /pharmacies/:id, /pdmp(?patientId=), /allergies/:patientId; POST /prescriptions, /prescriptions/:id/sign, /prescriptions/:id/refill, /interactions/check, /pdmp/check, /allergies/:patientId; PATCH /prescriptions/:id, /prescriptions/:id/status |
| AI CDS        | /api/ai                | GET /ping, /dashboard, /icd10(?category=), /icd10/categories, /icd10/:code, /interactions, /guidelines(?topic=&source=&q=), /guidelines/topics, /guidelines/:id, /guidelines/by-icd/:code, /risk(?patientId=&category=), /risk/categories, /insights(?type=&priority=&dismissed=), /notes; POST /icd10/suggest, /interactions/check, /guidelines/lookup, /risk/compute, /notes/generate; PATCH /insights/:id/dismiss |
| Prior Auth    | /api/pa                | GET /ping, /dashboard, /requests(?status=&payerId=&urgency=), /requests/:id, /criteria(?payerId=&serviceCode=), /payers, /statuses; POST /requests, /requests/:id/documents, /requests/:id/notes, /requests/:id/appeal, /requests/:id/peer-to-peer; PATCH /requests/:id/status; DELETE /requests/:id |
| RCM           | /api/rcm               | GET /ping, /dashboard, /claims(?status=&patientId=&payerId=), /claims/:id, /eras, /eras/:id, /statements(?patientId=), /statements/:id, /payment-plans(?patientId=), /payment-plans/:id, /statuses; POST /claims, /eras, /statements, /payment-plans, /claims/:id/payments, /claims/:id/denials, /claims/:id/notes; PATCH /claims/:id/status; DELETE /claims/:id |
| Health        | /api/health            | GET — version, phases, timestamp                                                      |

## Data Architecture
- **Storage**: Cloudflare Workers KV (`OCULOFLOW_KV` binding)
- **Pattern**: In-memory seed guard + KV index key + individual record keys
- **Key prefixes**: `auth:user:`, `auth:email:`, `auth:session:`, `auth:revoked:`, `auth:user:idx`, `auth:seeded`, `patient:`, `appt:`, `exam:`, `sb:`, `optical:frame:`, `optical:order:`, `portal:session:`, `portal:appt-req:`, `portal:thread:`, `msg:thread:`, `msg:task:`, `msg:recall:`, `msg:staff:`, `comms:template:`, `comms:msg:`, `comms:rule:`, `comms:noshow:`, `comms:campaign:`, `sc:goal:`, `sc:seeded`, `th:visit:`, `th:idx`, `th:seeded`, `erx:rx:`, `erx:idx`, `erx:allergy:`, `erx:pdmp:`, `erx:seeded`, `ai:insight:`, `ai:risk:`, `ai:note:`, `ai:seeded`, `pa:req:`, `pa:idx`, `pa:seeded`, `rcm:claim:`, `rcm:era:`, `rcm:stmt:`, `rcm:pp:`, `rcm:seeded`
- **Demo mode**: All data seeded automatically on first KV read
- **Scorecards**: KPIs computed deterministically on-the-fly (no KV writes); only goals use KV

## User Guide
1. **Home** `/` — Phase overview with links to all 17 modules
2. **Intake** `/intake?demo=true` — Start patient intake wizard
3. **Dashboard** `/dashboard` — Command center, today's schedule, flow board
4. **Patients** `/patients` — Search/register patients, verify insurance
5. **Schedule** `/schedule` — Book/manage appointments, view calendar
6. **Exam** `/exam` — Load exam by ID or from schedule; document clinical findings
7. **Billing** `/billing` — Build superbills, manage claims queue, post payments
8. **Reports** `/reports` — Analytics dashboard with date-range picker
9. **Optical** `/optical` — Manage frames/lenses/CL inventory, track lab orders, view Rx
10. **Patient Portal** `/portal` — Click "Demo Login" → navigate Overview / Appointments / Records / Optical / Billing / Messages tabs
11. **Clinical Messaging** `/messaging` — Staff inbox: browse threads, reply, manage tasks and recall list
12. **Reminders & Comms** `/reminders` — Overview dashboard → Message Log (filter by status/type) → No-Shows (send follow-ups) → Campaigns (launch) → Templates (edit/preview) → Automation Rules (toggle)
13. **Provider Scorecards** `/scorecards` — Select provider from sidebar → view scorecard, benchmarks, trends, goals; use date-range pills (7d/30d/90d/YTD); switch to Practice tab for leaderboard
14. **Telehealth** `/telehealth` — Click "New Visit" or select from sidebar → view queue → open detail pane → questionnaire / review / messages; filter queue by PENDING / URGENT / LIVE
15. **eRx** `/erx` — Dashboard → Prescriptions (write Rx, sign, manage refills) → Formulary (drug catalog) → PDMP (monitoring); use interaction-check before signing
16. **AI CDS** `/ai` — Dashboard → ICD-10 (catalog + smart suggest) → Guidelines (lookup) → Risk Scoring (compute by category) → Notes (AI SOAP generation)
17. **Prior Auth** `/priorauth` — Dashboard → Requests (submit/manage PAs, upload docs, add notes, file appeals, schedule P2P) → Criteria (lookup) → Payers
18. **RCM** `/rcm` — Overview (AR dashboard, aging buckets) → Claims (post payments, add denials, update status) → Remittance (ERA records) → Statements → Payment Plans

## Keyboard Shortcuts
- `N` — New item (superbill, order depending on page)
- `Esc` — Close modal/drawer
- `Cmd+K` — Global search (patients, schedule pages)
- `Ctrl+Enter` — Send reply (messaging page)

## Deployment
- **Platform**: Cloudflare Pages (Hono SSR Workers)
- **Status**: ✅ Active (sandbox dev server)
- **Build**: `npm run build` → Vite SSR → `dist/_worker.js` (~919 KB, 100 modules)
- **Start**: `pm2 start ecosystem.config.cjs`
- **Last Updated**: 2026-03-07

## Pending / Next Steps
- **Phase 9B** — Patient Engagement & Loyalty (care gap detection, recall campaigns, satisfaction surveys)
- **Phase 10A** — Analytics & Business Intelligence (payer contract analysis, provider productivity benchmarks, population health dashboards)
- **Enhancement**: Real login flow for portal (patient account creation / password reset)
- **Enhancement**: File attachment support in clinical messaging threads
- **Enhancement**: Webhooks / real Twilio/SendGrid integration for outbound reminders
- **Enhancement**: Real provider data feed to scorecards (currently computed from deterministic simulation)
