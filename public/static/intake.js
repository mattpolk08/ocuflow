// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Patient Intake Wizard
// Mobile-first Step-through Wizard with OTP, OCR, and E-Signature
// ─────────────────────────────────────────────────────────────────────────────

// ── State ─────────────────────────────────────────────────────────────────────
const STATE = {
  sessionToken: null,
  phone: null,
  appointmentToken: null,
  currentStep: 0,
  demoMode: false,
  cardFrontDataUrl: null,
  cardBackDataUrl: null,
  signatureDrawn: false,
  sigCanvas: null,
  sigCtx: null,
  sigDrawing: false,
  sigLastX: 0,
  sigLastY: 0,
}

// Steps in order: 0=verify, 0b=otp, 1=demo, 2=insurance, 3=medical, 4=consents, 5=complete
// We manage panels by ID directly.

const PROGRESS_STEPS = [
  { id: 'step-verify',      progress: 0,   labelIdx: -1 },
  { id: 'step-otp',         progress: 5,   labelIdx: -1 },
  { id: 'step-demographics',progress: 25,  labelIdx: 0  },
  { id: 'step-insurance',   progress: 50,  labelIdx: 1  },
  { id: 'step-medical',     progress: 75,  labelIdx: 2  },
  { id: 'step-consents',    progress: 90,  labelIdx: 3  },
  { id: 'step-complete',    progress: 100, labelIdx: 4  },
]

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Parse URL params
  const params = new URLSearchParams(window.location.search)
  STATE.appointmentToken = params.get('token') || 'DEMO-APPT-001'
  STATE.demoMode = params.get('demo') === 'true' || !params.get('token')

  // Set appointment display
  setAppointmentDisplay()

  // Setup OTP inputs
  setupOtpInputs()

  // Setup signature pad
  setupSignaturePad()

  // Populate condition checklists
  populateConditionGrids()

  // If demo, show with demo token
  showPanel('step-verify')
  updateProgress(0)
})

// ── Appointment Display ───────────────────────────────────────────────────────
function setAppointmentDisplay() {
  const el = document.getElementById('appt-display')
  if (!el) return
  // In production, decode from appointment token JWT/lookup
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const fmt = tomorrow.toLocaleDateString('en-US', {
    weekday: 'short', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
  })
  el.textContent = `${fmt} — Comprehensive Eye Exam`
  document.getElementById('complete-appt').textContent = `${fmt} — Comprehensive Eye Exam`
}

// ── Panel Management ──────────────────────────────────────────────────────────
function showPanel(panelId) {
  document.querySelectorAll('.step-panel').forEach(el => {
    el.classList.add('hidden')
    el.classList.remove('step-enter')
  })
  const target = document.getElementById(panelId)
  if (!target) return
  target.classList.remove('hidden')
  // Trigger animation next frame
  requestAnimationFrame(() => target.classList.add('step-enter'))
  window.scrollTo({ top: 0, behavior: 'smooth' })

  // Show progress bar after OTP step
  const showProgress = ['step-demographics','step-insurance','step-medical','step-consents','step-complete']
  const progressWrap = document.getElementById('progress-bar-wrap')
  const stepCounter  = document.getElementById('step-counter')
  if (showProgress.includes(panelId)) {
    progressWrap.classList.remove('hidden')
    stepCounter.classList.remove('hidden')
  } else {
    progressWrap.classList.add('hidden')
    stepCounter.classList.add('hidden')
  }

  updateProgressForPanel(panelId)
}

function updateProgressForPanel(panelId) {
  const idx = PROGRESS_STEPS.findIndex(s => s.id === panelId)
  if (idx >= 0) updateProgress(PROGRESS_STEPS[idx].progress, PROGRESS_STEPS[idx].labelIdx)
}

function updateProgress(pct, activeLabelIdx = -1) {
  const bar = document.getElementById('progress-bar')
  if (bar) bar.style.width = `${pct}%`

  // Update step num
  const stepPanels = ['step-demographics','step-insurance','step-medical','step-consents','step-complete']
  const panelEl = document.querySelector('.step-panel:not(.hidden)')
  if (panelEl) {
    const idx = stepPanels.indexOf(panelEl.id)
    if (idx >= 0) document.getElementById('step-num').textContent = idx + 1
  }

  // Update label colors
  for (let i = 0; i < 5; i++) {
    const el = document.getElementById(`pl-${i}`)
    if (!el) continue
    if (activeLabelIdx === i) {
      el.className = 'step-label text-xs font-semibold text-brand-600'
    } else if (activeLabelIdx > i) {
      el.className = 'step-label text-xs font-medium text-emerald-500'
    } else {
      el.className = 'step-label text-xs font-medium text-slate-300'
    }
  }
}

// ── Phone Formatting ──────────────────────────────────────────────────────────
function formatPhone(input) {
  let val = input.value.replace(/\D/g, '').slice(0, 10)
  if (val.length >= 7) {
    val = `(${val.slice(0,3)}) ${val.slice(3,6)}-${val.slice(6)}`
  } else if (val.length >= 4) {
    val = `(${val.slice(0,3)}) ${val.slice(3)}`
  } else if (val.length > 0) {
    val = `(${val}`
  }
  input.value = val
}

// ── STEP 0: SEND OTP ──────────────────────────────────────────────────────────
async function handleSendOtp(resend = false) {
  const phoneInput = document.getElementById('phone-input')
  const phoneError = document.getElementById('phone-error')
  const btn        = document.getElementById('send-otp-btn')

  const rawPhone = phoneInput.value.replace(/\D/g, '')
  if (rawPhone.length !== 10) {
    phoneError.textContent = 'Please enter a valid 10-digit US phone number'
    phoneError.classList.remove('hidden')
    phoneInput.classList.add('border-red-300')
    return
  }
  phoneError.classList.add('hidden')
  phoneInput.classList.remove('border-red-300')

  STATE.phone = `+1${rawPhone}`
  setLoading(btn, true)

  try {
    // 1. Start intake session
    if (!STATE.sessionToken || !resend) {
      const startRes = await apiFetch('/api/intake/start', 'POST', {
        appointmentToken: STATE.appointmentToken,
        phone: STATE.phone,
      })
      if (!startRes.success) throw new Error(startRes.error || 'Could not start session')
      STATE.sessionToken = startRes.data.sessionToken
    }

    // 2. Send OTP
    const otpRes = await apiFetch('/api/auth/send-otp', 'POST', {
      phone: STATE.phone,
      sessionToken: STATE.sessionToken,
    })

    if (!otpRes.success) throw new Error(otpRes.error || 'Could not send OTP')

    // Update OTP UI
    document.getElementById('otp-phone-display').textContent =
      `(${rawPhone.slice(0,3)}) ***-**${rawPhone.slice(8)}`

    // Demo mode: show OTP in banner
    if (otpRes.data?.demoOtp) {
      const banner = document.getElementById('demo-banner')
      const display = document.getElementById('demo-otp-display')
      banner.classList.remove('hidden')
      display.textContent = otpRes.data.demoOtp
      STATE.demoMode = true
    }

    showPanel('step-otp')
    setTimeout(() => document.querySelector('.otp-input')?.focus(), 350)

    if (resend) showToast('New code sent!')
  } catch (err) {
    phoneError.textContent = err.message
    phoneError.classList.remove('hidden')
  } finally {
    setLoading(btn, false)
  }
}

// ── OTP Input Logic ───────────────────────────────────────────────────────────
function setupOtpInputs() {
  const inputs = document.querySelectorAll('.otp-input')
  inputs.forEach((inp, idx) => {
    inp.addEventListener('input', e => {
      const val = e.target.value.replace(/\D/g, '').slice(0, 1)
      e.target.value = val
      e.target.classList.toggle('filled', !!val)
      if (val && idx < inputs.length - 1) inputs[idx + 1].focus()
      // Auto-verify if all filled
      if ([...inputs].every(i => i.value)) handleVerifyOtp()
    })

    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !inp.value && idx > 0) {
        inputs[idx - 1].value = ''
        inputs[idx - 1].classList.remove('filled')
        inputs[idx - 1].focus()
      }
    })

    inp.addEventListener('paste', e => {
      e.preventDefault()
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '')
      pasted.split('').slice(0, 6).forEach((ch, i) => {
        if (inputs[i]) {
          inputs[i].value = ch
          inputs[i].classList.add('filled')
        }
      })
      if (pasted.length >= 6) handleVerifyOtp()
      else if (inputs[pasted.length]) inputs[pasted.length].focus()
    })
  })
}

function getOtpValue() {
  return [...document.querySelectorAll('.otp-input')].map(i => i.value).join('')
}

function resetOtpInputs(error = false) {
  document.querySelectorAll('.otp-input').forEach(i => {
    i.value = ''
    i.classList.remove('filled')
    i.classList.toggle('error', error)
  })
  if (error) {
    const wrap = document.getElementById('otp-boxes')
    wrap.classList.add('shake')
    setTimeout(() => wrap.classList.remove('shake'), 500)
    // Clear error class after animation
    setTimeout(() => document.querySelectorAll('.otp-input').forEach(i => i.classList.remove('error')), 1500)
  }
  document.querySelector('.otp-input')?.focus()
}

// ── STEP 0b: VERIFY OTP ──────────────────────────────────────────────────────
async function handleVerifyOtp() {
  const otp = getOtpValue()
  if (otp.length < 6) return

  const btn      = document.getElementById('verify-otp-btn')
  const errEl    = document.getElementById('otp-error')
  errEl.classList.add('hidden')
  setLoading(btn, true)

  try {
    const res = await apiFetch('/api/auth/verify-otp', 'POST', {
      phone: STATE.phone,
      otp,
      sessionToken: STATE.sessionToken,
    })

    if (!res.success) throw new Error(res.error || 'Invalid code')

    showToast('Identity verified! ✓')
    showPanel('step-demographics')
  } catch (err) {
    errEl.textContent = err.message
    errEl.classList.remove('hidden')
    resetOtpInputs(true)
  } finally {
    setLoading(btn, false)
  }
}

// ── STEP 1: DEMOGRAPHICS ─────────────────────────────────────────────────────
async function handleDemographicsSubmit() {
  const fname   = document.getElementById('d-fname').value.trim()
  const lname   = document.getElementById('d-lname').value.trim()
  const dob     = document.getElementById('d-dob').value
  const errEl   = document.getElementById('demo-error')

  if (!fname || !lname || !dob) {
    errEl.textContent = 'First name, last name, and date of birth are required.'
    errEl.classList.remove('hidden')
    return
  }
  errEl.classList.add('hidden')

  const data = {
    firstName: fname,
    lastName: lname,
    dateOfBirth: dob,
    gender: document.getElementById('d-gender').value,
    phone: STATE.phone,
    email: document.getElementById('d-email').value.trim(),
    address: document.getElementById('d-address').value.trim(),
    city: document.getElementById('d-city').value.trim(),
    state: document.getElementById('d-state').value.trim().toUpperCase(),
    zip: document.getElementById('d-zip').value.trim(),
    preferredLanguage: 'en',
  }

  setLoadingById('d-fname', true)
  try {
    const res = await apiFetch('/api/intake/demographics', 'POST', {
      sessionToken: STATE.sessionToken,
      data,
    })
    if (!res.success) throw new Error(res.error)

    document.getElementById('complete-name').textContent = `${fname} ${lname}`
    showPanel('step-insurance')
  } catch (err) {
    errEl.textContent = err.message
    errEl.classList.remove('hidden')
  } finally {
    setLoadingById('d-fname', false)
  }
}

// ── STEP 2: INSURANCE CARD UPLOAD / OCR ──────────────────────────────────────
function handleCardUpload(event, side) {
  const file = event.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = async (e) => {
    const dataUrl = e.target.result

    if (side === 'front') {
      STATE.cardFrontDataUrl = dataUrl
      const zone    = document.getElementById('front-zone')
      const preview = document.getElementById('front-preview')
      const placeholder = document.getElementById('front-placeholder')
      document.getElementById('front-img').src = dataUrl
      preview.classList.remove('hidden')
      placeholder.classList.add('hidden')
      zone.classList.add('has-image')

      // Trigger OCR
      await runInsuranceOcr(dataUrl)
    }
  }
  reader.readAsDataURL(file)
}

async function runInsuranceOcr(imageDataUrl) {
  const scanning = document.getElementById('ocr-scanning')
  scanning.classList.remove('hidden')

  try {
    const res = await apiFetch('/api/intake/ocr', 'POST', {
      sessionToken: STATE.sessionToken,
      imageDataUrl,
    })

    if (res.success && res.data) {
      populateInsuranceFromOcr(res.data)
      showToast('Card read! Please verify the details below ✓')
    }
  } catch (err) {
    console.warn('OCR failed, manual entry enabled', err)
  } finally {
    scanning.classList.add('hidden')
  }
}

function populateInsuranceFromOcr(ocr) {
  const fields = {
    'ins-payer':       { value: ocr.payerName,      badge: 'payer-ocr-badge' },
    'ins-member-id':   { value: ocr.memberId,        badge: 'memberid-ocr-badge' },
    'ins-group':       { value: ocr.groupNumber,     badge: 'group-ocr-badge' },
    'ins-subscriber':  { value: ocr.subscriberName,  badge: null },
  }

  Object.entries(fields).forEach(([id, cfg]) => {
    if (cfg.value) {
      const el = document.getElementById(id)
      if (el) {
        el.value = cfg.value
        el.classList.add('bg-emerald-50', 'border-emerald-200')
        setTimeout(() => el.classList.remove('bg-emerald-50', 'border-emerald-200'), 2000)
      }
      if (cfg.badge) {
        document.getElementById(cfg.badge)?.classList.remove('hidden')
      }
    }
  })
}

function skipInsurance() {
  document.getElementById('ins-payer').value = 'Self-Pay'
  document.getElementById('ins-member-id').value = 'N/A'
  showToast('Self-pay selected')
}

async function handleInsuranceSubmit() {
  const payerName = document.getElementById('ins-payer').value.trim()
  const memberId  = document.getElementById('ins-member-id').value.trim()

  if (!payerName) {
    showToast('Please enter your insurance provider', 'error')
    document.getElementById('ins-payer').focus()
    return
  }
  if (!memberId) {
    showToast('Please enter your Member ID', 'error')
    document.getElementById('ins-member-id').focus()
    return
  }

  const data = {
    payerName,
    memberId,
    groupNumber: document.getElementById('ins-group').value.trim(),
    subscriberName: document.getElementById('ins-subscriber').value.trim(),
    relationship: document.getElementById('ins-relationship').value,
    cardFrontDataUrl: STATE.cardFrontDataUrl,
  }

  try {
    const res = await apiFetch('/api/intake/insurance', 'POST', {
      sessionToken: STATE.sessionToken,
      data,
    })
    if (!res.success) throw new Error(res.error)

    document.getElementById('complete-insurance').textContent =
      `${payerName} — ${memberId}`
    showPanel('step-medical')
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// ── STEP 3: MEDICAL HISTORY ───────────────────────────────────────────────────
const EYE_CONDITIONS = [
  'Glaucoma', 'Cataracts', 'Macular Degeneration',
  'Diabetic Retinopathy', 'Dry Eye', 'Amblyopia (Lazy Eye)',
  'Strabismus', 'Retinal Detachment', 'Keratoconus', 'None',
]

const SYSTEMIC_CONDITIONS = [
  'Diabetes', 'High Blood Pressure', 'Thyroid Disease',
  'Autoimmune Disease', 'Stroke / TIA', 'Heart Disease',
  'Migraines', 'None',
]

function populateConditionGrids() {
  const eyeGrid = document.getElementById('eye-conditions-grid')
  EYE_CONDITIONS.forEach(cond => {
    eyeGrid.innerHTML += conditionChip('eye', cond)
  })

  const sysGrid = document.getElementById('systemic-conditions-grid')
  SYSTEMIC_CONDITIONS.forEach(cond => {
    sysGrid.innerHTML += conditionChip('sys', cond)
  })
}

function conditionChip(prefix, label) {
  const id = `${prefix}-${label.replace(/\W/g, '-').toLowerCase()}`
  return `
    <label for="${id}" class="flex items-center gap-2 bg-slate-50 hover:bg-brand-50 border border-slate-200 hover:border-brand-200 rounded-xl px-3 py-2.5 cursor-pointer transition-all duration-150 group">
      <input type="checkbox" id="${id}" value="${label}" class="w-4 h-4 accent-brand-500 flex-shrink-0" />
      <span class="text-xs font-medium text-slate-700 group-hover:text-brand-700 leading-tight">${label}</span>
    </label>`
}

function getCheckedConditions(prefix) {
  return [...document.querySelectorAll(`input[id^="${prefix}-"]`)]
    .filter(i => i.checked)
    .map(i => i.value)
}

async function handleMedicalSubmit() {
  const complaint = document.getElementById('m-complaint').value.trim()
  if (!complaint) {
    showToast('Please describe your reason for visit', 'error')
    document.getElementById('m-complaint').focus()
    return
  }

  const data = {
    chiefComplaint: complaint,
    currentMedications: document.getElementById('m-meds').value.trim(),
    allergies: document.getElementById('m-allergies').value.trim(),
    eyeConditions: getCheckedConditions('eye'),
    systemicConditions: getCheckedConditions('sys'),
    lastEyeExam: document.getElementById('m-last-exam').value,
    wearingGlasses: document.getElementById('m-glasses').checked,
    wearingContacts: document.getElementById('m-contacts').checked,
    familyHistoryGlaucoma: document.getElementById('m-fam-glaucoma').checked,
    familyHistoryMacularDegeneration: document.getElementById('m-fam-amd').checked,
  }

  try {
    const res = await apiFetch('/api/intake/medical-history', 'POST', {
      sessionToken: STATE.sessionToken,
      data,
    })
    if (!res.success) throw new Error(res.error)
    showPanel('step-consents')
    setTimeout(() => setupSignaturePad(), 100)
  } catch (err) {
    showToast(err.message, 'error')
  }
}

// ── STEP 4: SIGNATURE PAD ─────────────────────────────────────────────────────
function setupSignaturePad() {
  const canvas = document.getElementById('signature-canvas')
  if (!canvas || STATE.sigCtx) return // already initialized

  STATE.sigCanvas = canvas
  STATE.sigCtx    = canvas.getContext('2d')

  // Retina scaling
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width  = rect.width  * dpr
  canvas.height = rect.height * dpr
  STATE.sigCtx.scale(dpr, dpr)
  STATE.sigCtx.strokeStyle = '#1e293b'
  STATE.sigCtx.lineWidth   = 2.5
  STATE.sigCtx.lineCap     = 'round'
  STATE.sigCtx.lineJoin     = 'round'

  // Mouse
  canvas.addEventListener('mousedown',  e => sigStart(e.offsetX, e.offsetY))
  canvas.addEventListener('mousemove',  e => { if (STATE.sigDrawing) sigDraw(e.offsetX, e.offsetY) })
  canvas.addEventListener('mouseup',    sigEnd)
  canvas.addEventListener('mouseleave', sigEnd)

  // Touch
  canvas.addEventListener('touchstart', e => {
    e.preventDefault()
    const t = e.touches[0]
    const r = canvas.getBoundingClientRect()
    sigStart(t.clientX - r.left, t.clientY - r.top)
  }, { passive: false })

  canvas.addEventListener('touchmove', e => {
    e.preventDefault()
    const t = e.touches[0]
    const r = canvas.getBoundingClientRect()
    if (STATE.sigDrawing) sigDraw(t.clientX - r.left, t.clientY - r.top)
  }, { passive: false })

  canvas.addEventListener('touchend', sigEnd)
}

function sigStart(x, y) {
  STATE.sigDrawing = true
  STATE.sigLastX   = x
  STATE.sigLastY   = y
  STATE.sigCtx.beginPath()
  STATE.sigCtx.moveTo(x, y)
  document.getElementById('sig-placeholder')?.style.setProperty('display', 'none')
}

function sigDraw(x, y) {
  STATE.sigCtx.beginPath()
  STATE.sigCtx.moveTo(STATE.sigLastX, STATE.sigLastY)
  STATE.sigCtx.lineTo(x, y)
  STATE.sigCtx.stroke()
  STATE.sigLastX     = x
  STATE.sigLastY     = y
  STATE.signatureDrawn = true
  document.getElementById('sig-error')?.classList.add('hidden')
}

function sigEnd() {
  STATE.sigDrawing = false
  checkConsents()
}

function clearSignature() {
  const canvas = STATE.sigCanvas
  if (!canvas) return
  STATE.sigCtx.clearRect(0, 0, canvas.width, canvas.height)
  STATE.signatureDrawn = false
  document.getElementById('sig-placeholder').style.removeProperty('display')
  checkConsents()
}

// ── STEP 4: CONSENT VALIDATION ────────────────────────────────────────────────
function checkConsents() {
  const hipaa     = document.getElementById('c-hipaa').checked
  const treatment = document.getElementById('c-treatment').checked
  const financial = document.getElementById('c-financial').checked
  const ready     = hipaa && treatment && financial && STATE.signatureDrawn

  const btn = document.getElementById('submit-intake-btn')
  btn.disabled = !ready
  btn.classList.toggle('opacity-50',       !ready)
  btn.classList.toggle('cursor-not-allowed', !ready)
  btn.classList.toggle('shadow-lg',        ready)
  btn.classList.toggle('shadow-brand-200', ready)
  btn.classList.toggle('hover:bg-brand-700', ready)
}

// ── CONSENT MODALS ────────────────────────────────────────────────────────────
const CONSENT_TEXTS = {
  hipaa: {
    title: 'HIPAA Notice of Privacy Practices',
    body: `
      <h4 class="font-semibold text-slate-800 mb-1">How We Use Your Information</h4>
      <p>Your health information may be used and disclosed for treatment, payment, and healthcare operations as permitted by the Health Insurance Portability and Accountability Act of 1996 (HIPAA).</p>
      <h4 class="font-semibold text-slate-800 mt-4 mb-1">Treatment</h4>
      <p>We may use your health information to provide you with medical treatment or services, and to coordinate care with other providers involved in your treatment.</p>
      <h4 class="font-semibold text-slate-800 mt-4 mb-1">Payment</h4>
      <p>We may use and disclose your health information to obtain payment for treatment and services provided to you, including submitting claims to your insurance company.</p>
      <h4 class="font-semibold text-slate-800 mt-4 mb-1">Your Rights</h4>
      <ul class="list-disc list-inside space-y-1">
        <li>Request a copy of your health records</li>
        <li>Request corrections to your records</li>
        <li>Request restrictions on how we use your information</li>
        <li>Receive a list of disclosures we have made</li>
        <li>File a complaint if you believe your privacy rights have been violated</li>
      </ul>
      <h4 class="font-semibold text-slate-800 mt-4 mb-1">Contact Us</h4>
      <p>For questions about this notice, contact our Privacy Officer at <strong>(305) 555-0100</strong> or privacy@oculoflow.com</p>
    `
  }
}

function showConsentModal(type) {
  const modal   = document.getElementById('consent-modal')
  const title   = document.getElementById('modal-title')
  const content = document.getElementById('modal-content')
  const data    = CONSENT_TEXTS[type]
  if (!data) return
  title.textContent   = data.title
  content.innerHTML   = data.body
  modal.classList.remove('hidden')
  document.body.style.overflow = 'hidden'
}

function closeConsentModal() {
  document.getElementById('consent-modal').classList.add('hidden')
  document.body.style.overflow = ''
}

// ── STEP 4 SUBMIT ─────────────────────────────────────────────────────────────
async function handleConsentSubmit() {
  const sigError = document.getElementById('sig-error')

  if (!STATE.signatureDrawn) {
    sigError.classList.remove('hidden')
    STATE.sigCanvas.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }

  const btn = document.getElementById('submit-intake-btn')
  setLoading(btn, true)

  const signatureDataUrl = STATE.sigCanvas.toDataURL('image/png')

  const data = {
    hipaaAcknowledged:      document.getElementById('c-hipaa').checked,
    treatmentConsent:       document.getElementById('c-treatment').checked,
    financialResponsibility:document.getElementById('c-financial').checked,
    telehealth:             document.getElementById('c-telehealth').checked,
    marketingOptIn:         document.getElementById('c-marketing').checked,
    signatureDataUrl,
    signedAt: new Date().toISOString(),
  }

  try {
    const res = await apiFetch('/api/intake/consents', 'POST', {
      sessionToken: STATE.sessionToken,
      data,
    })
    if (!res.success) throw new Error(res.error)
    showPanel('step-complete')
    updateProgress(100, 4)
  } catch (err) {
    showToast(err.message, 'error')
  } finally {
    setLoading(btn, false)
  }
}

// ── API Helper ────────────────────────────────────────────────────────────────
async function apiFetch(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body) opts.body = JSON.stringify(body)

  const res = await fetch(path, opts)
  return res.json()
}

// ── UI Utilities ──────────────────────────────────────────────────────────────
function setLoading(btn, loading) {
  if (!btn) return
  if (loading) {
    btn._label = btn.innerHTML
    btn.innerHTML = `<span class="spinner"></span>`
    btn.disabled  = true
  } else {
    btn.innerHTML = btn._label || btn.innerHTML
    btn.disabled  = false
  }
}

function setLoadingById(inputId, loading) {
  // Disable/enable all inputs in the current step
  const step = document.querySelector('.step-panel:not(.hidden)')
  if (!step) return
  step.querySelectorAll('input, select, textarea, button').forEach(el => {
    el.disabled = loading
  })
}

let toastTimer = null
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast')
  const text  = document.getElementById('toast-text')
  text.textContent = message

  toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-50 text-white text-sm font-medium px-5 py-3 rounded-2xl shadow-xl flex items-center gap-2 max-w-xs text-center transition-all duration-200 ${
    type === 'error'
      ? 'bg-red-600'
      : 'bg-slate-900'
  }`

  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000)
}
