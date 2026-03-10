// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Main Hono Application Entry Point
// Phase 1 : Digital Front Door — Patient Intake
// Phase 1A: Command Center Dashboard
// Phase 1B: Patient Registration & Insurance Verification
// Phase 1C: Scheduling Engine
// Phase 1D: Exam Record
// Phase 2A: Billing & Claims
// Phase 2B: Reporting & Analytics
// Phase 3A: Optical Dispensary
// Phase 4A: Patient Portal
// Phase 5A: Clinical Messaging & Task Board
// Phase 6A: Appointment Reminders & Communications
// Phase 7A: Provider Scorecards & Benchmarking
// Phase 7B: Telehealth / Async Video Visit
// Phase 7C: E-Prescribing & PDMP
// Phase 8A: AI Clinical Decision Support
// Phase 8B: Automated Prior Authorization
// Phase 9A: Revenue Cycle Management
// Phase 9B: Patient Engagement & Loyalty
// Phase 10A: Analytics & Business Intelligence
// Phase A1: Authentication & Authorization
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { serveStatic } from 'hono/cloudflare-workers'
import { requireAuth, requireRole, rateLimitMiddleware, auditMiddleware } from './middleware/auth'
import authRoutes      from './routes/auth'
import intakeRoutes    from './routes/intake'
import dashboardRoutes from './routes/dashboard'
import patientRoutes   from './routes/patients'
import scheduleRoutes  from './routes/scheduling'
import examRoutes      from './routes/exams'
import billingRoutes   from './routes/billing'
import reportsRoutes   from './routes/reports'
import opticalRoutes   from './routes/optical'
import portalRoutes      from './routes/portal'
import messagingRoutes   from './routes/messaging'
import remindersRoutes   from './routes/reminders'
import scorecardsRoutes  from './routes/scorecards'
import telehealthRoutes  from './routes/telehealth'
import erxRoutes         from './routes/erx'
import aiRoutes          from './routes/ai'
import { paRoutes }      from './routes/priorauth'
import rcmRoutes         from './routes/rcm'
import mfaRoutes         from './routes/mfa'
import engagementRoutes  from './routes/engagement'
import analyticsRoutes   from './routes/analytics'
import notificationsRoutes from './routes/notifications'
import docRoutes         from './routes/documents'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  DB: D1Database
  OCULOFLOW_R2?: R2Bucket
  JWT_SECRET?: string
  OPENAI_API_KEY: string
  TWILIO_ACCOUNT_SID: string
  TWILIO_AUTH_TOKEN: string
  TWILIO_FROM_NUMBER: string
  SENDGRID_API_KEY?: string
  SENDGRID_FROM_EMAIL?: string
  ELIGIBILITY_API_KEY: string
  PRACTICE_NAME: string
  DEMO_MODE: string
}

const app = new Hono<{ Bindings: Bindings }>()

// ── Global Middleware ─────────────────────────────────────────────────────────
app.use('*', logger())
app.use('*', secureHeaders())
app.use('/api/*', cors({
  origin: ['*'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}))
// Per-IP rate limiting (300 req/min) — Phase A2
app.use('/api/*', rateLimitMiddleware)

// ── Static Assets ─────────────────────────────────────────────────────────────
app.use('/static/*', serveStatic({ root: './' }))

// 25002500 Page routes via ASSETS binding 2500 resolves clean-URL 308/302 loop 2500250025002500250025002500250025002500250025002500250025002500

// ── Patient Intake Page ───────────────────────────────────────────────────────

// ── Command Center Dashboard ──────────────────────────────────────────────────

// ── Patient Registration & Insurance Verification ─────────────────────────────

// ── Scheduling Engine ─────────────────────────────────────────────────────────

// ── Exam Record ───────────────────────────────────────────────────────────────

// ── Billing & Claims ─────────────────────────────────────────────────────────

// ── Reports & Analytics ───────────────────────────────────────────────────

// ── Optical Dispensary ───────────────────────────────────────────────────────

// ── Patient Portal ────────────────────────────────────────────────────────────

// ── Clinical Messaging & Task Board ──────────────────────────────────────────

// ── Reminders & Communications ────────────────────────────────────────────────

// ── Provider Scorecards & Benchmarking ───────────────────────────────────────

// ── Telehealth / Async Video Visit ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── ───────────────────────────────────────────

// ── E-Prescribing & PDMP ─────────────────────────────────────────────────────

// ── AI Clinical Decision Support ─────────────────────────────────────────────

// ── Prior Authorization ───────────────────────────────────────────────────────

// ── Revenue Cycle Management ─────────────────────────────────────────────────

// ── Staff Login ───────────────────────────────────────────────────────────────

// ── API Routes ────────────────────────────────────────────────────────────────
// Auth routes — public (login/logout/refresh) + self-protected (/me, /users)
app.route('/api/auth',      authRoutes)

// Patient intake — public (patient-facing)
app.route('/api/intake',    intakeRoutes)

// Staff-only API routes — protected by JWT + PHI audit logging
app.use('/api/dashboard/*', requireAuth, auditMiddleware)
app.route('/api/dashboard', dashboardRoutes)

app.use('/api/patients/*',  requireAuth, requireRole('ADMIN','PROVIDER','NURSE','FRONT_DESK','BILLING'), auditMiddleware)
app.route('/api/patients',  patientRoutes)

app.use('/api/schedule/*',  requireAuth, requireRole('ADMIN','PROVIDER','NURSE','FRONT_DESK'), auditMiddleware)
app.route('/api/schedule',  scheduleRoutes)

app.use('/api/exams/*',     requireAuth, requireRole('ADMIN','PROVIDER','NURSE'), auditMiddleware)
app.route('/api/exams',     examRoutes)

app.use('/api/billing/*',   requireAuth, requireRole('BILLING', 'ADMIN', 'PROVIDER'), auditMiddleware)
app.route('/api/billing',   billingRoutes)

app.use('/api/reports/*',   requireAuth, requireRole('BILLING', 'ADMIN', 'PROVIDER'), auditMiddleware)
app.route('/api/reports',   reportsRoutes)

app.use('/api/optical/*',   requireAuth, requireRole('OPTICAL', 'ADMIN', 'FRONT_DESK', 'PROVIDER'), auditMiddleware)
app.route('/api/optical',   opticalRoutes)

// Portal: /auth/* endpoints are public (magic-link, registration, login, password reset)
// Other portal endpoints use portal session (X-Portal-Session header), not JWT
app.use('/api/portal/*', async (c, next) => {
  const path = c.req.path
  // Allow portal auth endpoints without staff JWT
  if (path.startsWith('/api/portal/auth/')) return next()
  // For other portal paths, use auditMiddleware without requireAuth (portal uses own sessions)
  return auditMiddleware(c, next)
})
app.route('/api/portal', portalRoutes)

app.use('/api/messaging/*', requireAuth, requireRole('ADMIN','PROVIDER','NURSE','FRONT_DESK'), auditMiddleware)
app.route('/api/messaging',  messagingRoutes)

app.use('/api/reminders/*', requireAuth, requireRole('ADMIN','PROVIDER','NURSE','FRONT_DESK'), auditMiddleware)
app.route('/api/reminders',  remindersRoutes)

app.use('/api/scorecards/*', requireAuth, requireRole('ADMIN','PROVIDER','BILLING'), auditMiddleware)
app.route('/api/scorecards', scorecardsRoutes)

app.use('/api/telehealth/*', requireAuth, requireRole('ADMIN','PROVIDER','NURSE'), auditMiddleware)
app.route('/api/telehealth', telehealthRoutes)

app.use('/api/erx/*',        requireAuth, requireRole('PROVIDER', 'ADMIN', 'NURSE'), auditMiddleware)
app.route('/api/erx',        erxRoutes)

app.use('/api/ai/*',         requireAuth, requireRole('ADMIN','PROVIDER','NURSE'), auditMiddleware)
app.route('/api/ai',         aiRoutes)

app.use('/api/pa/*',         requireAuth, requireRole('ADMIN','PROVIDER','BILLING','NURSE'), auditMiddleware)
app.route('/api/pa',         paRoutes)

app.use('/api/rcm/*',        requireAuth, requireRole('BILLING', 'ADMIN', 'PROVIDER'), auditMiddleware)
app.route('/api/rcm',        rcmRoutes)

// ── MFA ──────────────────────────────────────────────────────────────────────
app.use('/api/mfa/*', requireAuth, auditMiddleware)
app.route('/api/mfa',        mfaRoutes)

// ── Patient Engagement & Loyalty ─────────────────────────────────────────────────────────────────
app.use('/api/engagement/*', async (c, next) => {
  // /ping is public — skip auth
  if (c.req.path === '/api/engagement/ping') return next()
  return requireAuth(c, next)
})
app.use('/api/engagement/*', async (c, next) => {
  if (c.req.path === '/api/engagement/ping') return next()
  return auditMiddleware(c, next)
})
app.route('/api/engagement', engagementRoutes)

// ── Analytics & BI ───────────────────────────────────────────────────────────
app.use('/api/analytics/*',  requireAuth, requireRole('BILLING', 'ADMIN'), auditMiddleware)
app.route('/api/analytics',  analyticsRoutes)

// ── Phase B1 — Notifications (Twilio SMS + SendGrid Email + Eligibility) ─────
app.use('/api/notifications/*', requireAuth, requireRole('ADMIN','PROVIDER','NURSE','FRONT_DESK','BILLING'), auditMiddleware)
app.route('/api/notifications', notificationsRoutes)

// ── Phase B2 — Documents & PDF Generation ────────────────────────────────────
app.use('/api/documents/*',  requireAuth, requireRole('ADMIN','PROVIDER','NURSE','FRONT_DESK','BILLING'), auditMiddleware)
app.route('/api/documents',  docRoutes)

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'OculoFlow',
    phases: ['1-intake', '1a-dashboard', '1b-patients', '1c-scheduling', '1d-exam', '2a-billing', '2b-reports', '3a-optical', '4a-portal', '5a-messaging', '6a-reminders', '7a-scorecards', '7b-telehealth', '7c-erx', '8a-ai-cds', '8b-prior-auth', '9a-rcm', '9b-engagement', 'a1-auth', 'a2-audit-hipaa', 'a3-live-deploy', 'a4-mfa', '10a-analytics', 'b1-notifications', 'b2-documents', 'b3-portal-auth'],
    timestamp: new Date().toISOString(),
    version: '3.1.0',
  })
})

// ── Root — Command Center (Phase 2 placeholder) ───────────────────────────────
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OculoFlow — Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.0/css/all.min.css" />
  <style>body { font-family: 'Inter', sans-serif; }</style>
</head>
<body class="bg-slate-950 text-white min-h-screen flex flex-col items-center justify-center p-6">

  <div class="w-full max-w-2xl text-center">

    <!-- Logo -->
    <div class="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center mb-6 shadow-2xl shadow-blue-900">
      <i class="fas fa-eye text-white text-3xl"></i>
    </div>
    <h1 class="text-4xl font-bold mb-2 tracking-tight">OculoFlow</h1>
    <p class="text-slate-400 text-lg mb-10">Next-Generation Ophthalmology EHR & Practice Management</p>

    <!-- Phase Status Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-10 text-left">

      <a href="/intake?demo=true" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
            <i class="fas fa-mobile-screen text-blue-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-blue-400 uppercase tracking-wider">Phase 1 — Live</span>
            <p class="text-sm font-semibold text-white">Digital Front Door</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Patient intake wizard with 2FA authentication, insurance card OCR, and HIPAA e-signature.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-blue-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Try the Patient Intake →
        </div>
      </a>

      <a href="/dashboard" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
            <i class="fas fa-gauge-high text-blue-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-blue-400 uppercase tracking-wider">Phase 1A — Live</span>
            <p class="text-sm font-semibold text-white">Command Center</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Daily schedule, Kanban flow board, provider tracking, timeline view, and patient detail modal.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-blue-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Command Center →
        </div>
      </a>

      <a href="/patients" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
            <i class="fas fa-users text-blue-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-blue-400 uppercase tracking-wider">Phase 1B — Live</span>
            <p class="text-sm font-semibold text-white">Patient Registry</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Patient search, registration wizard, insurance plans, and real-time eligibility verification.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-blue-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Patient Registry →
        </div>
      </a>

      <a href="/schedule" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
            <i class="fas fa-calendar-days text-blue-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-blue-400 uppercase tracking-wider">Phase 1C — Live</span>
            <p class="text-sm font-semibold text-white">Scheduling Engine</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Day/week calendar, slot booking, appointment management, and patient waitlist.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-blue-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Scheduler →
        </div>
      </a>

      <a href="/exam" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
            <i class="fas fa-eye text-blue-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-blue-400 uppercase tracking-wider">Phase 1D — Live</span>
            <p class="text-sm font-semibold text-white">Exam Record</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">VA, IOP, Slit Lamp, Fundus, Refraction, A&amp;P with ICD-10 — sign &amp; lock.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-blue-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Exam Record →
        </div>
      </a>

      <a href="/reports" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
            <i class="fas fa-chart-line text-blue-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-blue-400 uppercase tracking-wider">Phase 2B — Live</span>
            <p class="text-sm font-semibold text-white">Reports & Analytics</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Provider productivity, AR aging, payer mix, appointment trends, revenue charts, and exam analytics.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-blue-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Reports →
        </div>
      </a>

      <a href="/billing" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
            <i class="fas fa-file-invoice-dollar text-blue-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-blue-400 uppercase tracking-wider">Phase 2A — Live</span>
            <p class="text-sm font-semibold text-white">Billing & Claims</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Superbill builder, CPT/ICD-10 coding, claims queue, copay collection, and AR management.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-blue-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Billing →
        </div>
      </a>

      <a href="/optical" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
            <i class="fas fa-glasses text-blue-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-blue-400 uppercase tracking-wider">Phase 3A — Live</span>
            <p class="text-sm font-semibold text-white">Optical Dispensary</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Frame & lens inventory, contact lens catalog, lab order tracking, Rx-to-dispense workflow, and pickup log.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-blue-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Optical →
        </div>
      </a>

      <a href="/portal" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
            <i class="fas fa-user-circle text-blue-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-blue-400 uppercase tracking-wider">Phase 4A — Live</span>
            <p class="text-sm font-semibold text-white">Patient Portal</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Self-service appointments, Rx & exam records, glasses order status, balance & payment, secure messaging.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-blue-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Patient Portal →
        </div>
      </a>

      <a href="/messaging" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500/30 transition-colors">
            <i class="fas fa-comment-medical text-indigo-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Phase 5A — Live</span>
            <p class="text-sm font-semibold text-white">Clinical Messaging</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Secure staff inbox with STAT/Urgent priority, task board with kanban-style status, patient recall list management.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-indigo-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Messaging →
        </div>
      </a>

      <a href="/reminders" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500/30 transition-colors">
            <i class="fas fa-bell text-indigo-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Phase 6A — Live</span>
            <p class="text-sm font-semibold text-white">Reminders & Comms</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Automated SMS/email reminders, 2-way patient confirmation, no-show tracking, outreach campaigns, and message templates.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-indigo-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Comms Hub →
        </div>
      </a>

      <a href="/scorecards" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-violet-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/30 transition-colors">
            <i class="fas fa-chart-bar text-violet-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-violet-400 uppercase tracking-wider">Phase 7A — Live</span>
            <p class="text-sm font-semibold text-white">Provider Scorecards</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Per-provider KPIs, benchmark comparisons vs. practice &amp; national averages, weekly trends, goals tracking, and practice leaderboard.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-violet-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Scorecards →
        </div>
      </a>

      <a href="/telehealth" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-teal-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center group-hover:bg-teal-500/30 transition-colors">
            <i class="fas fa-video text-teal-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-teal-400 uppercase tracking-wider">Phase 7B — Live</span>
            <p class="text-sm font-semibold text-white">Telehealth</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Async video visit queue, pre-visit questionnaire, provider review &amp; sign, patient messaging, info requests, and live session room.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-teal-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Telehealth →
        </div>
      </a>

      <a href="/erx" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
            <i class="fas fa-prescription-bottle text-emerald-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Phase 7C — Live</span>
            <p class="text-sm font-semibold text-white">E-Prescribing</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Electronic prescriptions with 21-drug formulary, SIG builder, drug interaction checks, PDMP monitoring, allergy records, and pharmacy routing.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-emerald-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open eRx →
        </div>
      </a>

      <a href="/ai" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500/30 transition-colors">
            <i class="fas fa-brain text-indigo-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Phase 8A — Live</span>
            <p class="text-sm font-semibold text-white">AI Clinical Decision Support</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">ICD-10 code suggestions, drug interaction alerts, clinical guideline lookup, AI-assisted note generation, and patient risk stratification.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-indigo-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open AI CDS →
        </div>
      </a>

      <a href="/priorauth" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-violet-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center group-hover:bg-violet-500/30 transition-colors">
            <i class="fas fa-clipboard-check text-violet-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-violet-400 uppercase tracking-wider">Phase 8B — Live</span>
            <p class="text-sm font-semibold text-white">Prior Authorization</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Submit PA requests to payers, track approval status, manage appeals, schedule peer-to-peer reviews, and monitor expiring authorizations.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-violet-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Prior Auth →
        </div>
      </a>

      <a href="/rcm" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-sky-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center group-hover:bg-sky-500/30 transition-colors">
            <i class="fas fa-dollar-sign text-sky-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-sky-400 uppercase tracking-wider">Phase 9A — Live</span>
            <p class="text-sm font-semibold text-white">Revenue Cycle Management</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Claims lifecycle management, payment posting, ERA/remittance processing, patient statements, payment plans, and AR aging dashboard.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-sky-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open RCM →
        </div>
      </a>

      <a href="/engagement" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-pink-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center group-hover:bg-pink-500/30 transition-colors">
            <i class="fas fa-heart text-pink-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-pink-400 uppercase tracking-wider">Phase 9B — Live</span>
            <p class="text-sm font-semibold text-white">Patient Engagement & Loyalty</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Care gap detection, automated recall campaigns, satisfaction surveys, loyalty points, and population health outreach.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-pink-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Engagement →
        </div>
      </a>

      <a href="/analytics" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-amber-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
            <i class="fas fa-chart-line text-amber-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-amber-400 uppercase tracking-wider">Phase 10A — Live</span>
            <p class="text-sm font-semibold text-white">Analytics & Business Intelligence</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Executive KPI dashboard, payer contract analysis, provider productivity, population health trends, recall compliance, and 6-month revenue forecast.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-amber-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Analytics →
        </div>
      </a>

      <!-- Phase A2 — HIPAA Audit -->
      <a href="/audit" class="group bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-green-500 rounded-2xl p-5 transition-all duration-200 cursor-pointer">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center group-hover:bg-green-500/30 transition-colors">
            <i class="fas fa-shield-alt text-green-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-green-400 uppercase tracking-wider">Phase A2 — Live</span>
            <p class="text-sm font-semibold text-white">HIPAA Audit & Compliance</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Immutable PHI access log, 6-year retention, compliance dashboard with 10 HIPAA §164.312(b) checks, risk event alerting, and auth failure tracking.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-green-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Audit Dashboard →
        </div>
      </a>

      <!-- Phase B1 -->
      <a href="/api/notifications/status" class="group block bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50 hover:border-sky-500/50 hover:bg-slate-800 transition-all">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center group-hover:bg-sky-500/30 transition-colors">
            <i class="fas fa-bell text-sky-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-sky-400 uppercase tracking-wider">Phase B1 — Live</span>
            <p class="text-sm font-semibold text-white">Real Notifications</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Twilio SMS, SendGrid email, and Availity insurance eligibility integrations. Appointment reminders, recall outreach, OTP delivery, and survey invites.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-sky-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          View Status →
        </div>
      </a>

      <!-- Phase B2 -->
      <a href="/api/documents/storage/status" class="group block bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50 hover:border-teal-500/50 hover:bg-slate-800 transition-all">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center group-hover:bg-teal-500/30 transition-colors">
            <i class="fas fa-file-pdf text-teal-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-teal-400 uppercase tracking-wider">Phase B2 — Live</span>
            <p class="text-sm font-semibold text-white">Documents & PDF Generation</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Superbill, patient statement, and referral letter PDF generation. Clinical photo uploads with R2 (or KV fallback). Attach files to exams, PA, and messaging.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-teal-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Storage Status →
        </div>
      </a>

      <!-- Phase B3 -->
      <a href="/portal" class="group block bg-slate-800/50 rounded-2xl p-5 border border-slate-700/50 hover:border-purple-500/50 hover:bg-slate-800 transition-all">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
            <i class="fas fa-user-lock text-purple-400"></i>
          </div>
          <div>
            <span class="text-xs font-semibold text-purple-400 uppercase tracking-wider">Phase B3 — Live</span>
            <p class="text-sm font-semibold text-white">Portal Real Auth</p>
          </div>
        </div>
        <p class="text-xs text-slate-400 leading-relaxed">Email magic-link + 6-digit OTP login, patient account creation, PBKDF2 password auth, and self-service password reset via SendGrid.</p>
        <div class="flex items-center gap-1.5 mt-3 text-xs text-purple-400 font-medium">
          <i class="fas fa-arrow-right text-xs group-hover:translate-x-1 transition-transform"></i>
          Open Portal →
        </div>
      </a>
    </div>

    <!-- API health indicator -->
    <div class="flex items-center justify-center gap-2 text-sm text-slate-500">
      <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
      API healthy — <a href="/api/health" class="text-slate-400 hover:text-white underline ml-1">/api/health</a>
    </div>
  </div>

</body>
</html>`)
})

// ── 404 Fallback ──────────────────────────────────────────────────────────────
app.notFound((c) => {
  return c.json({ error: 'Not found', path: c.req.path }, 404)
})

// ── Error Handler ─────────────────────────────────────────────────────────────
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json({ error: 'Internal server error' }, 500)
})

export default app
