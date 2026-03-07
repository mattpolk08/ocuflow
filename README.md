# OculoFlow — Next-Generation Ophthalmology EHR & Practice Management

## Project Overview
- **Name**: OculoFlow
- **Version**: 2.0.0
- **Goal**: Full-stack ophthalmology EHR and practice management system built on Cloudflare Pages + Hono
- **Stack**: TypeScript · Hono · Cloudflare Workers · KV Storage · Vite · Tailwind CSS (CDN) · Chart.js

## Live URLs (Sandbox)
- **Home**: https://3000-iifn0r2yzm6jt3tc1fv0q-5634da27.sandbox.novita.ai/
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

## API Summary

| Module        | Base Path              | Key Endpoints                                                                         |
|---------------|------------------------|---------------------------------------------------------------------------------------|
| Auth          | /api/auth              | POST /login, /logout, /session                                                        |
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
| Health        | /api/health            | GET — version, phases, timestamp                                                      |

## Data Architecture
- **Storage**: Cloudflare Workers KV (`OCULOFLOW_KV` binding)
- **Pattern**: In-memory seed guard + KV index key + individual record keys
- **Key prefixes**: `patient:`, `appt:`, `exam:`, `sb:`, `optical:frame:`, `optical:order:`, `portal:session:`, `portal:appt-req:`, `portal:thread:`, `msg:thread:`, `msg:task:`, `msg:recall:`, `msg:staff:`, `comms:template:`, `comms:msg:`, `comms:rule:`, `comms:noshow:`, `comms:campaign:`, `sc:goal:`, `sc:seeded`
- **Demo mode**: All data seeded automatically on first KV read
- **Scorecards**: KPIs computed deterministically on-the-fly (no KV writes); only goals use KV

## User Guide
1. **Home** `/` — Phase overview with links to all 12 modules
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

## Keyboard Shortcuts
- `N` — New item (superbill, order depending on page)
- `Esc` — Close modal/drawer
- `Cmd+K` — Global search (patients, schedule pages)
- `Ctrl+Enter` — Send reply (messaging page)

## Deployment
- **Platform**: Cloudflare Pages (Hono SSR Workers)
- **Status**: ✅ Active (sandbox dev server)
- **Build**: `npm run build` → Vite SSR → `dist/_worker.js` (~628 KB, 85 modules)
- **Start**: `pm2 start ecosystem.config.cjs`
- **Last Updated**: 2026-03-07

## Pending / Next Steps
- **Phase 7B** — Telehealth / Async Video Visit: patient pre-visit questionnaire + provider async review workflow
- **Phase 7C** — E-Prescribing & PDMP: electronic prescription creation, controlled substance PDMP lookup, pharmacy routing
- **Fix**: `isNewPatient` duplicate key warning in `src/lib/patients.ts:36`
- **Enhancement**: Real login flow for portal (patient account creation / password reset)
- **Enhancement**: File attachment support in clinical messaging threads
- **Enhancement**: Webhooks / real Twilio/SendGrid integration for outbound reminders
- **Enhancement**: Real provider data feed to scorecards (currently computed from deterministic simulation)
