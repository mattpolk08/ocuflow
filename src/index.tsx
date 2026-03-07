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
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { serveStatic } from 'hono/cloudflare-workers'
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
// Import HTML as raw string (Vite ?raw import)
import intakeHtml    from '../public/intake.html?raw'
import dashboardHtml from '../public/dashboard.html?raw'
import patientsHtml  from '../public/patients.html?raw'
import scheduleHtml  from '../public/schedule.html?raw'
import examHtml      from '../public/exam.html?raw'
import billingHtml   from '../public/billing.html?raw'
import reportsHtml   from '../public/reports.html?raw'
import opticalHtml   from '../public/optical.html?raw'
import portalHtml      from '../public/portal.html?raw'
import messagingHtml   from '../public/messaging.html?raw'

type Bindings = {
  OCULOFLOW_KV: KVNamespace
  OPENAI_API_KEY: string
  TWILIO_ACCOUNT_SID: string
  TWILIO_AUTH_TOKEN: string
  TWILIO_FROM_NUMBER: string
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

// ── Static Assets ─────────────────────────────────────────────────────────────
app.use('/static/*', serveStatic({ root: './' }))

// ── Patient Intake Page ───────────────────────────────────────────────────────
app.get('/intake', (c) => c.html(intakeHtml))

// ── Command Center Dashboard ──────────────────────────────────────────────────
app.get('/dashboard', (c) => c.html(dashboardHtml))

// ── Patient Registration & Insurance Verification ─────────────────────────────
app.get('/patients', (c) => c.html(patientsHtml))

// ── Scheduling Engine ─────────────────────────────────────────────────────────
app.get('/schedule', (c) => c.html(scheduleHtml))

// ── Exam Record ───────────────────────────────────────────────────────────────
app.get('/exam', (c) => c.html(examHtml))
app.get('/exam/:id', (c) => c.html(examHtml))

// ── Billing & Claims ─────────────────────────────────────────────────────────
app.get('/billing', (c) => c.html(billingHtml))

// ── Reports & Analytics ───────────────────────────────────────────────────
app.get('/reports', (c) => c.html(reportsHtml))

// ── Optical Dispensary ───────────────────────────────────────────────────────
app.get('/optical', (c) => c.html(opticalHtml))

// ── Patient Portal ────────────────────────────────────────────────────────────
app.get('/portal', (c) => c.html(portalHtml))

// ── Clinical Messaging & Task Board ──────────────────────────────────────────
app.get('/messaging', (c) => c.html(messagingHtml))

// ── API Routes ────────────────────────────────────────────────────────────────
app.route('/api/auth',      authRoutes)
app.route('/api/intake',    intakeRoutes)
app.route('/api/dashboard', dashboardRoutes)
app.route('/api/patients',  patientRoutes)
app.route('/api/schedule',  scheduleRoutes)
app.route('/api/exams',     examRoutes)
app.route('/api/billing',   billingRoutes)
app.route('/api/reports',   reportsRoutes)
app.route('/api/optical',   opticalRoutes)
app.route('/api/portal',     portalRoutes)
app.route('/api/messaging',  messagingRoutes)

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    service: 'OculoFlow',
    phases: ['1-intake', '1a-dashboard', '1b-patients', '1c-scheduling', '1d-exam', '2a-billing', '2b-reports', '3a-optical', '4a-portal', '5a-messaging'],
    timestamp: new Date().toISOString(),
    version: '1.8.0',
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
