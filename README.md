# OculoFlow — Next-Generation Ophthalmology EHR & Practice Management

## Project Overview
- **Name**: OculoFlow
- **Version**: 3.2.0
- **Goal**: Full-stack ophthalmology EHR and practice management system built on Cloudflare Pages + Hono
- **Stack**: TypeScript · Hono · Cloudflare Workers · D1 SQLite · KV Storage · Vite · Tailwind CSS (CDN) · Chart.js

## Live URLs
- **Production**: https://oculoflow.pages.dev
- **GitHub**: https://github.com/mattpolk08/ocuflow
- **Login**: https://oculoflow.pages.dev/login
- **Analytics BI**: https://oculoflow.pages.dev/analytics
- **Engagement**: https://oculoflow.pages.dev/engagement
- **MFA Setup**: https://oculoflow.pages.dev/mfa-setup
- **API Health**: https://oculoflow.pages.dev/api/health

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

### Phase 9A — Revenue Cycle Management *(v2.5.0)*
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

### Phase A2 — Audit Logging & HIPAA Controls *(v2.7.0)*
- **HIPAA §164.312(b) Audit Log**: every PHI read/write and auth event recorded in KV (6-year TTL); events: `AUTH_LOGIN`, `AUTH_LOGIN_FAILED`, `AUTH_LOCKED_OUT`, `AUTH_LOGOUT`, `AUTH_TOKEN_REFRESH`, `PHI_READ`, `PHI_CREATE`, `PHI_UPDATE`, `PHI_DELETE`, `ACCESS_DENIED`
- **Audit record fields**: `id`, `timestamp`, `event`, `userId`, `userEmail`, `userRole`, `resource`, `resourceId`, `action`, `outcome`, `ip`, `userAgent`, `detail` (no raw PHI in detail)
- **Login lockout**: 5 failed attempts per email in 15-min window → 15-min lockout (stored in KV); automatic unlock after window expires
- **API Rate limiting**: per-IP sliding-window counter (300 req/min); `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on all API responses; 429 + `retryAfter` on violation; `/api/health` excluded for monitoring bypass
- **KV minimum TTL compliance**: all rate-limit KV writes enforce ≥60s TTL (Cloudflare requirement)
- **`GET /api/auth/audit`** (ADMIN only): query audit log with filters `?event=`, `?resource=`, `?userId=`, `?limit=` (max 500); returns last 5,000 records newest-first
- **`auditMiddleware`**: auto-records PHI access on every protected route (event determined by HTTP method); writes AFTER handler completes to capture HTTP status as outcome
- **`rateLimitMiddleware`**: applied globally to `/api/*`; skips health + static endpoints
- Key prefixes: `audit:log:`, `audit:idx`, `ratelimit:login:`, `ratelimit:api:`
- Tests: **Smoke 21/21** ✅

### Phase A3 — Live Cloudflare Deployment *(v2.7.0)*
- **Production KV namespace** `OCULOFLOW_KV` created (`id: 3de6133cdd914fa7b9b6eea4142322e0`); bound to Pages project for both production and preview environments
- **`JWT_SECRET`** stored as Cloudflare Pages encrypted secret (`wrangler pages secret put`)
- **`DEMO_MODE=true`** and `PRACTICE_NAME` set as `vars` in `wrangler.jsonc`
- **Deployed** to Cloudflare Pages at **https://oculoflow.pages.dev** (global edge network)
- All 19 pages return HTTP 200 on live; JWT auth, KV session storage, audit logging all verified on live production

### Phase A4 — Multi-Factor Authentication *(v2.8.0)*
- **RFC 6238 TOTP** using Web Crypto API (SHA-1 HMAC, 30-second window, 6-digit codes) — fully Cloudflare Workers compatible
- **Enrollment flow**: `POST /api/mfa/enroll/begin` returns Base32 secret + provisioning URI for QR code; `POST /api/mfa/enroll/confirm` activates with first valid TOTP code
- **Recovery codes**: 8 single-use 8-digit recovery codes generated at enrollment; stored as hashed values; `POST /api/mfa/recovery/regenerate` requires TOTP verification
- **Trusted devices**: 30-day device tokens stored in KV; `POST /api/mfa/trusted-device` registers after successful TOTP; `DELETE /api/mfa/trusted-device` revokes
- **Login challenge**: on login, if MFA enabled and no trusted device → returns `mfaRequired: true` + short-lived `mfaToken`; frontend redirects to `/mfa-verify`
- **MFA pages**: `/mfa-setup` (TOTP enrollment with QR code display + recovery codes) and `/mfa-verify` (challenge input with recovery code fallback)
- Routes: `GET /api/mfa/status`, `POST /api/mfa/enroll/begin|confirm|verify`, `POST /api/mfa/trusted-device`, `DELETE /api/mfa/trusted-device|disable`, `POST /api/mfa/recovery/regenerate`
- Key prefixes: `mfa:config:`, `mfa:pending:`, `mfa:trusted:`, `mfa:used:`

### Phase 9B — Patient Engagement & Loyalty *(v2.8.0)*
- **Care Gaps**: automated detection for 8 ophthalmology gap types (annual exam, glaucoma follow-up, diabetic eye exam, contact lens renewal, expired Rx, macular degeneration monitoring, dry eye follow-up, post-surgical check); status workflow OPEN → OUTREACH_SENT → SCHEDULED → CLOSED
- **Recall Management**: patient recall campaigns with status tracking, SMS outreach, scheduling links; 5 recall statuses (PENDING → CONTACTED → SCHEDULED → COMPLETED / DECLINED)
- **Satisfaction Surveys**: configurable survey templates (post-visit, annual, NPS) with Likert + free-text questions; patient survey response collection; score aggregation
- **Loyalty Program**: point accrual for visits/referrals/survey completion; tier tracking (BRONZE/SILVER/GOLD/PLATINUM); loyalty account per patient
- **Dashboard**: care gap summary, recall funnel metrics, survey response stats, loyalty program overview
- Routes: `GET /api/engagement/ping|dashboard`, `GET|POST|PATCH /api/engagement/care-gaps|recalls|surveys|survey-responses|loyalty`
- Key prefixes: `eng:caregap:`, `eng:recall:`, `eng:survey:`, `eng:survey-resp:`, `eng:loyalty:`
- Seed: 5 care gaps, 4 recalls, 3 surveys, 3 loyalty accounts

### Phase 10A — Analytics & Business Intelligence *(v2.8.0)*
- **Executive KPI Dashboard**: monthly KPI snapshots with MoM delta — net revenue, visits, new patients, collection rate, denial rate, NPS score, no-show rate, care gap closure, recall compliance
- **Payer Contract Analysis**: 6 seeded payer contracts (BCBS FL, Aetna, UHC, Medicare, Humana, Medicaid) with allowable vs. collected variance, denial rates, contract expiry alerts, status badges (ACTIVE/EXPIRING_SOON/RENEGOTIATING)
- **Provider Productivity**: per-provider RVU produced vs. target, utilization %, avg revenue/visit, denial rate, documentation time, satisfaction score; RVU progress bars
- **Population Health Trends**: 5 condition cohorts (Glaucoma, Diabetic Retinopathy, Dry Eye, Macular Degeneration, Myopia) with controlled %, treatment adherence, care gap counts, revenue potential
- **Recall Compliance Metrics**: 3-month funnel (due → contacted → scheduled → completed), SMS/email response rates, revenue recovered
- **6-Month Revenue Forecast**: seasonal model (Apr–Sep 2026) with confidence intervals, risk factors, and growth opportunities; Chart.js area chart with upper/lower bounds
- **Role Access**: ADMIN + BILLING only; front-desk/nurse/optical denied with 403
- **HIPAA Audit**: every dashboard access logged with `PHI_READ` audit event
- Routes: `GET /api/analytics/ping|dashboard|kpi|kpi/:period|kpi-compare|payers|providers|population|recall|forecast`; `PATCH /api/analytics/payers/:id`
- Key prefixes: `anl:kpi:`, `anl:payer:`, `anl:provprod:`, `anl:poptrend:`, `anl:recall:`, `anl:forecast:`
- Seed: 4 KPI periods (Jan/Feb/Mar/Q1 2026), 6 payers, 4 providers, 5 conditions, 3 recall months, 1 forecast
- Tests: **15/15 production verification** ✅

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

### Primary Storage — Cloudflare D1 (SQLite)
All clinical and operational data is persisted in the `oculoflow-production` D1 database.

| Table Group | Tables |
|---|---|
| **Core** | `organizations`, `staff_users`, `auth_sessions`, `providers`, `rooms` |
| **Patients** | `patients`, `patient_insurance` |
| **Scheduling** | `appointments`, `waitlist` |
| **Clinical** | `exams`, `exam_diagnoses`, `exam_plan_entries`, `care_gaps` |
| **Billing** | `superbills`, `superbill_line_items`, `superbill_diagnoses`, `payments` |
| **Optical** | `optical_orders`, `optical_order_line_items`, `optical_rx`, `frames`, `lenses`, `contact_lenses` |
| **Portal** | `portal_accounts`, `portal_sessions`, `portal_appointment_requests`, `portal_message_threads`, `portal_messages`, `portal_notification_prefs`, `portal_activity_log` |
| **Messaging** | `msg_threads`, `msg_messages`, `msg_tasks`, `msg_recalls` |
| **Reminders** | `reminder_templates`, `reminder_messages`, `reminder_rules`, `outreach_campaigns` |
| **Telehealth** | `telehealth_visits` |
| **eRx** | `erx_prescriptions`, `erx_pdmp_reports`, `erx_allergies` |
| **Prior Auth** | `prior_auth_requests` |
| **RCM** | `rcm_claims`, `rcm_eras`, `rcm_statements`, `rcm_payment_plans` |
| **AI / Analytics** | `ai_insights`, `ai_risk_scores`, `ai_generated_notes`, `care_gaps`, `provider_goals` |
| **Scorecards** | `provider_goals` |
| **Admin** | `practice_settings`, `locations`, `module_settings` |
| **Audit** | `audit_log`, `notification_logs` |

**Migrations applied**: 0001 → 0018 (all applied to remote production)

### Secondary Storage — Cloudflare KV
KV is used exclusively for ephemeral and session data that does not belong in a relational table:

| Prefix | Purpose |
|---|---|
| `auth:session:` | JWT refresh-token session records (30-day TTL) |
| `auth:revoked:` | Revoked JWT `jti` list |
| `mfa:config:` | TOTP secrets and recovery codes |
| `mfa:pending:` | In-progress MFA enrollment state |
| `mfa:trusted:` | Trusted-device tokens (30-day TTL) |
| `mfa:used:` | Used TOTP codes (replay prevention, 30s TTL) |
| `ratelimit:api:` | Per-IP request counters (sliding window) |
| `ratelimit:login:` | Failed-login counters per email |
| `audit:log:` | HIPAA audit event records (6-year TTL) |
| `audit:idx` | Audit log index |
| `portal:session:` | Patient portal session tokens |

**Note**: All clinical record seed data lives in D1. KV holds only auth/session/audit state.

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
10. **Patient Portal** `/portal` — Click "Demo Login" → navigate Overview / Appointments (create, cancel) / Records / Optical / Billing / Messages tabs; or log in via magic-link (OTP) or password account (self-register with last name + DOB)
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
- **Platform**: Cloudflare Pages (Hono SSR Workers + KV Storage)
- **Status**: ✅ Live at **https://oculoflow.pages.dev**
- **Build**: `npm run build` → Vite SSR → `dist/_worker.js` (~1.16 MB, 121 modules)
- **Start (local)**: `pm2 start ecosystem.config.cjs`
- **Deploy**: `npm run build && npx wrangler pages deploy dist --project-name oculoflow`
- **KV Namespace**: `OCULOFLOW_KV` (id: 3de6133cdd914fa7b9b6eea4142322e0)
- **Secrets**: `JWT_SECRET` (set via `wrangler pages secret put`)
- **Last Updated**: 2026-03-14
- **Version**: 3.2.0

## Recent Additions

### v3.2.0 — Admin Module + Full D1 Migration *(2026-03-14)*

#### Phase ADM-1 — Practice Administration Module
- **Module Settings**: toggle enable/disable for all 21 platform modules; stored in `module_settings` D1 table
- **Practice Settings**: name, NPI, address, phone, fax, timezone, billing info; stored in `practice_settings` D1 table
- **Location Management**: multi-location CRUD with active/inactive toggle; stored in `locations` D1 table
- **User Management**: list, create, update role/status for all staff users; backed by `staff_users` D1 table
- **Admin Dashboard**: practice overview — total/active locations, total/enabled modules, active user count
- Routes: `GET /admin`, `GET|PUT /api/admin/settings`, `GET|POST|PUT|DELETE /api/admin/locations`, `GET|POST|PUT /api/admin/users`, `GET /api/admin/modules`, `PUT /api/admin/modules/:id`, `GET /api/admin/dashboard`
- Auth: ADMIN role required for all write operations; any authenticated user can read module states
- **Seed**: 21 modules (all enabled), 15 practice settings, 1 location (Advanced Eye Care of Miami — Main), 7 staff users

#### Full KV → D1 Migration Complete
- All 6 remaining lib files confirmed D1-backed: `rcm.ts`, `messaging.ts`, `priorauth.ts`, `telehealth.ts`, `erx.ts`, `reminders.ts`
- Production D1 seeded with sprint 2–4 data (rcm_claims, erx_prescriptions, msg_threads/messages/tasks, reminder_templates/rules, prior_auth_requests, care_gaps, provider_goals)
- Migration **0018** added to align `rcm_claims` table column names with lib expectations
- All migrations 0001–0018 applied to remote production via `--remote` flag

#### D1 Production Data Summary
| Table | Rows |
|---|---|
| patients | 16 |
| appointments | 6 |
| staff_users | 7 |
| module_settings | 21 |
| practice_settings | 15 |
| locations | 1 |
| rcm_claims | 2 |
| erx_prescriptions | 3 |
| msg_threads | 1 |
| msg_messages | 2 |
| msg_tasks | 1 |
| reminder_templates | 4 |
| reminder_rules | 4 |
| prior_auth_requests | 2 |
| care_gaps | 4 |
| provider_goals | 5 |

#### Routing Fix — /admin Clean URL
- `admin.html` and `/admin` added to `public/_routes.json` exclude list so Cloudflare Pages serves the static file instead of routing through the Hono worker
- Static `public/_routes.json` committed to repo — prevents the `@hono/vite-build` plugin from overwriting the exclude list during rebuilds
- All 24 page routes now have both clean URL and `.html` variants in the exclude list

---

### Phase B3 — Patient Portal Full Auth Suite *(v3.1.0)*
- **Magic-link**: email OTP/token; demo mode returns OTP directly; real sends via SendGrid
- **Self-service registration**: `POST /api/portal/auth/register` — lastName+dob lookup (no patientId needed)
- **Password login**: `POST /api/portal/auth/password-login` after account creation
- **Appointment cancel**: `POST /api/portal/appointments/:id/cancel` — PENDING requests only
- **Exam history**: `GET /api/portal/exams` and `GET /api/portal/exams/:id`
- **Notification prefs**: `GET|PATCH /api/portal/notifications/prefs`
- **Account management**: `GET|PATCH /api/portal/auth/account`
- **Portal status**: `GET /api/portal/status`
- Tests: **40/40** ✅

### Phase A2+ — HIPAA Audit & Compliance *(v3.1.0)*
- 18 AuditEvent types, enhanced audit middleware (durationMs, recordCount, sessionId, risk)
- HIPAA Compliance Report endpoint: 10 compliance checks, 6-year retention policy
- Audit Dashboard at `/audit` (admin-only)
- Session timeout: 15-min warning, auto-logout after 8h, AUTH_SESSION_EXPIRED event
- Tests: **25/25** ✅ — 10/10 compliance checks PASS

### Test Results Summary
| Phase | Tests | Result |
|-------|-------|--------|
| Phase 10A Analytics | 23/23 | ✅ PASS |
| RBAC (all 23 route modules) | enforced | ✅ PASS |
| HIPAA Audit & Compliance | 25/25 | ✅ PASS |
| Phase B3 Portal Auth | 40/40 | ✅ PASS |

## Pending / Next Steps

### Enhancements
- **Real Twilio/SendGrid credentials** — replace demo simulation with live send for reminders/portal messages
- **Real insurance eligibility API** — wire `src/lib/eligibility.ts` to Change Healthcare / Availity
- **File attachment support** — clinical messaging threads; documents module (currently R2 stub)
- **Real provider data feed** — scorecards KPIs currently computed from deterministic simulation
- **Telehealth schema alignment** — remote `telehealth_visits` table uses video-call schema (from older migration); the async-review lib expects different columns; needs migration to unify

### Roadmap Features (Sprint 5)
- **Phase 11A** — Referral Management (outbound/inbound referrals, status tracking, fax integration)
- **Phase 11B** — Document Templates (consent forms, letters, patient education PDFs)
- **Phase 11C** — Staff Scheduling (provider schedule builder, PTO/block time, template weeks)
- **Phase 11D** — Insurance Contract Fee Schedules (allowed amount lookup by CPT + payer)
- **Phase 11E** — Multi-Location Routing (location-aware scheduling, location-specific settings)
- **Phase 11F** — Patient Self-Scheduling (public booking widget linked to scheduling engine)
