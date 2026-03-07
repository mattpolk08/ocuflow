# OculoFlow — Next-Generation Ophthalmology EHR & Practice Management

## Project Overview
- **Name**: OculoFlow
- **Version**: 1.7.0
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
- "Staff App" back-link in header; portal nav is tab-based (no cross-page navigation)

## API Summary

| Module        | Base Path           | Key Endpoints                                               |
|---------------|---------------------|-------------------------------------------------------------|
| Auth          | /api/auth           | POST /login, /logout, /session                              |
| Intake        | /api/intake         | POST /start, /verify-otp, /insurance, /sign                 |
| Dashboard     | /api/dashboard      | GET /summary, /appointments, /flow                          |
| Patients      | /api/patients       | GET /, /:id, POST /, PUT /:id, POST /:id/insurance          |
| Scheduling    | /api/schedule       | GET /slots, /appointments, POST /appointment, /waitlist     |
| Exams         | /api/exams          | GET /, /:id, POST /, POST /:id/sign, POST /:id/amend        |
| Billing       | /api/billing        | GET /superbills, /ar, /cpt; POST /superbills/:id/status     |
| Reports       | /api/reports        | GET /dashboard, /revenue, /providers, /payer-mix, /ar-aging |
| Optical       | /api/optical        | GET /inventory, /orders, /frames, /lenses, /contact-lenses  |
| Portal        | /api/portal         | POST /auth/demo, GET /auth/session, /dashboard, /appointments, /messages, /rx, /optical-orders, /balance |
| Health        | /api/health         | GET — version, phases, timestamp                            |

## Data Architecture
- **Storage**: Cloudflare Workers KV (`OCULOFLOW_KV` binding)
- **Pattern**: In-memory seed guard + KV index key + individual record keys
- **Key prefixes**: `patient:`, `appt:`, `exam:`, `sb:`, `optical:frame:`, `optical:order:`, `portal:session:`, `portal:appt-req:`, `portal:thread:`, etc.
- **Demo mode**: All data seeded automatically on first KV read

## User Guide
1. **Home** `/` — Phase overview with links to all modules
2. **Intake** `/intake?demo=true` — Start patient intake wizard
3. **Dashboard** `/dashboard` — Command center, today's schedule, flow board
4. **Patients** `/patients` — Search/register patients, verify insurance
5. **Schedule** `/schedule` — Book/manage appointments, view calendar
6. **Exam** `/exam` — Load exam by ID or from schedule; document clinical findings
7. **Billing** `/billing` — Build superbills, manage claims queue, post payments
8. **Reports** `/reports` — Analytics dashboard with date-range picker
9. **Optical** `/optical` — Manage frames/lenses/CL inventory, track lab orders, view Rx
10. **Patient Portal** `/portal` — Patient self-service: hit "Demo Login", then navigate Overview / Appointments / Records / Optical / Billing / Messages tabs

## Keyboard Shortcuts
- `N` — New item (superbill, order depending on page)
- `Esc` — Close modal/drawer
- `Cmd+K` — Global search (patients, schedule pages)

## Deployment
- **Platform**: Cloudflare Pages (Hono SSR Workers)
- **Status**: ✅ Active (sandbox dev server)
- **Build**: `npm run build` → Vite SSR → `dist/_worker.js` (~470 KB, 76 modules)
- **Start**: `pm2 start ecosystem.config.cjs`
- **Last Updated**: 2026-03-07

## Pending / Next Steps
- **Phase 4B** — Clinical Messaging & Task Board: secure inter-staff messages, task assignments, recall lists, priority inbox
- **Phase 4C** — Telehealth / Video Visit: async patient questionnaire + provider review workflow
- **Phase 5A** — Provider Analytics & Benchmarking: individual provider scorecards, patient outcomes tracking
- **Fix**: `isNewPatient` duplicate key warning in `src/lib/patients.ts:36`
- **Fix**: Appointment type enum exposure in schedule UI (show valid types in UI dropdown)
- **Enhancement**: Real login flow for portal (patient account creation / password reset)
