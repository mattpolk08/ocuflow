// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 8A: AI Clinical Decision Support — Routes
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import type { RiskCategory, InsightType, InsightPriority } from '../types/ai'
import {
  seedAiData, getAiDashboard,
  suggestIcdCodes, generateClinicalNote, saveNote,
  computeRiskScore, saveRiskScore, listRiskScores,
  listInsights, dismissInsight,
  listNotes, logQuery,
  icd10Catalog, drugInteractions, clinicalGuidelines,
} from '../lib/ai'

type Bindings = { OCULOFLOW_KV: KVNamespace }
type Resp = { success: boolean; data?: unknown; message?: string; error?: string }

const aiRoutes = new Hono<{ Bindings: Bindings }>()

// ── Ping / Seed ───────────────────────────────────────────────────────────────
aiRoutes.get('/ping', async (c) => {
  try {
    await seedAiData(c.env.OCULOFLOW_KV)
    return c.json<Resp>({ success: true, data: { status: 'ok', module: 'ai-cds' } })
  } catch (e: any) {
    return c.json<Resp>({ success: false, error: e.message }, 500)
  }
})

// ── Dashboard ─────────────────────────────────────────────────────────────────
aiRoutes.get('/dashboard', async (c) => {
  try {
    const data = await getAiDashboard(c.env.OCULOFLOW_KV)
    return c.json<Resp>({ success: true, data })
  } catch (e: any) {
    return c.json<Resp>({ success: false, error: e.message }, 500)
  }
})

// ── ICD-10 Catalog ────────────────────────────────────────────────────────────
aiRoutes.get('/icd10', (c) => {
  const { q, category } = c.req.query()
  let codes = icd10Catalog
  if (category) codes = codes.filter(x => x.category === category)
  if (q) {
    const qLower = q.toLowerCase()
    codes = codes.filter(x =>
      x.code.toLowerCase().includes(qLower) ||
      x.description.toLowerCase().includes(qLower) ||
      (x.commonPresentations ?? []).some(p => p.toLowerCase().includes(qLower))
    )
  }
  return c.json<Resp>({ success: true, data: codes })
})

aiRoutes.get('/icd10/categories', (c) => {
  const cats = [...new Set(icd10Catalog.map(c => c.category))].sort()
  return c.json<Resp>({ success: true, data: cats })
})

aiRoutes.get('/icd10/:code', (c) => {
  const code = c.req.param('code')
  const found = icd10Catalog.find(x => x.code === code)
  if (!found) return c.json<Resp>({ success: false, error: 'ICD-10 code not found' }, 404)
  return c.json<Resp>({ success: true, data: found })
})

// ── ICD-10 Suggestion Engine ──────────────────────────────────────────────────
aiRoutes.post('/icd10/suggest', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.symptoms && !body.freeText) {
      return c.json<Resp>({ success: false, error: 'symptoms or freeText is required' }, 400)
    }
    const t0 = Date.now()
    const suggestions = suggestIcdCodes({
      symptoms: body.symptoms ?? [],
      examFindings: body.examFindings ?? [],
      patientAge: body.patientAge,
      patientSex: body.patientSex,
      freeText: body.freeText,
      existingDiagnoses: body.existingDiagnoses ?? [],
      limit: body.limit ?? 8,
    })
    const result = {
      query: body,
      suggestions,
      processingMs: Date.now() - t0,
      model: 'oculoflow-nlp-v1',
      timestamp: new Date().toISOString(),
    }
    await logQuery(c.env.OCULOFLOW_KV, {
      queryType: 'ICD_SUGGESTION',
      input: body,
      outputSummary: `${suggestions.length} suggestions (top: ${suggestions[0]?.icdCode.code ?? 'none'})`,
      userId: 'system', userName: 'System',
      durationMs: result.processingMs,
    })
    return c.json<Resp>({ success: true, data: result })
  } catch (e: any) {
    return c.json<Resp>({ success: false, error: e.message }, 500)
  }
})

// ── Note Generation ────────────────────────────────────────────────────────────
aiRoutes.post('/notes/generate', async (c) => {
  try {
    const body = await c.req.json()
    if (!body.chiefComplaint) {
      return c.json<Resp>({ success: false, error: 'chiefComplaint is required' }, 400)
    }
    const t0 = Date.now()
    const note = generateClinicalNote({
      patientId: body.patientId,
      chiefComplaint: body.chiefComplaint,
      symptoms: body.symptoms ?? [],
      examFindings: body.examFindings ?? {},
      diagnoses: body.diagnoses ?? [],
      existingNote: body.existingNote,
    })
    await saveNote(c.env.OCULOFLOW_KV, note)
    await logQuery(c.env.OCULOFLOW_KV, {
      queryType: 'NOTE_GENERATION',
      input: { patientId: body.patientId, chiefComplaint: body.chiefComplaint },
      outputSummary: `${note.wordCount} words, ${note.sections.length} sections`,
      userId: 'system', userName: 'System',
      durationMs: Date.now() - t0,
    })
    return c.json<Resp>({ success: true, data: note }, 201)
  } catch (e: any) {
    return c.json<Resp>({ success: false, error: e.message }, 500)
  }
})

aiRoutes.get('/notes', async (c) => {
  try {
    const { patientId } = c.req.query()
    const notes = await listNotes(c.env.OCULOFLOW_KV, patientId)
    return c.json<Resp>({ success: true, data: notes })
  } catch (e: any) {
    return c.json<Resp>({ success: false, error: e.message }, 500)
  }
})

// ── Drug Interactions ─────────────────────────────────────────────────────────
aiRoutes.get('/interactions', (c) => {
  const { severity, drug1Id, drug2Id } = c.req.query()
  let results = drugInteractions
  if (severity) results = results.filter(d => d.severity === severity)
  if (drug1Id) results = results.filter(d => d.drug1Id === drug1Id || d.drug2Id === drug1Id)
  if (drug2Id) results = results.filter(d => d.drug1Id === drug2Id || d.drug2Id === drug2Id)
  return c.json<Resp>({ success: true, data: results })
})

aiRoutes.post('/interactions/check', async (c) => {
  try {
    const body = await c.req.json()
    const { drugIds } = body
    if (!drugIds || !Array.isArray(drugIds) || drugIds.length < 2) {
      return c.json<Resp>({ success: false, error: 'drugIds array with at least 2 items is required' }, 400)
    }
    const idSet = new Set<string>(drugIds)
    const found = drugInteractions.filter(d => idSet.has(d.drug1Id) && idSet.has(d.drug2Id))
    const critical = found.filter(d => d.severity === 'CONTRAINDICATED')
    const major = found.filter(d => d.severity === 'MAJOR')
    return c.json<Resp>({
      success: true,
      data: {
        drugIds,
        interactions: found,
        summary: {
          total: found.length,
          contraindicated: critical.length,
          major: major.length,
          moderate: found.filter(d => d.severity === 'MODERATE').length,
          minor: found.filter(d => d.severity === 'MINOR').length,
        },
        hasCritical: critical.length > 0,
      }
    })
  } catch (e: any) {
    return c.json<Resp>({ success: false, error: e.message }, 500)
  }
})

// ── Clinical Guidelines ───────────────────────────────────────────────────────
aiRoutes.get('/guidelines', (c) => {
  const { topic, source, q } = c.req.query()
  let results = clinicalGuidelines
  if (topic) results = results.filter(g => g.topic === topic)
  if (source) results = results.filter(g => g.source === source)
  if (q) {
    const qLower = q.toLowerCase()
    results = results.filter(g =>
      g.title.toLowerCase().includes(qLower) ||
      g.summary.toLowerCase().includes(qLower) ||
      g.keyRecommendations.some(r => r.toLowerCase().includes(qLower))
    )
  }
  return c.json<Resp>({ success: true, data: results })
})

aiRoutes.get('/guidelines/topics', (c) => {
  const topics = [...new Set(clinicalGuidelines.map(g => g.topic))].sort()
  return c.json<Resp>({ success: true, data: topics })
})

aiRoutes.get('/guidelines/:id', (c) => {
  const found = clinicalGuidelines.find(g => g.id === c.req.param('id'))
  if (!found) return c.json<Resp>({ success: false, error: 'Guideline not found' }, 404)
  return c.json<Resp>({ success: true, data: found })
})

// Look up guidelines by ICD-10 code
aiRoutes.get('/guidelines/by-icd/:code', (c) => {
  const code = c.req.param('code')
  const results = clinicalGuidelines.filter(g => g.applicableIcdCodes.includes(code))
  return c.json<Resp>({ success: true, data: results })
})

// ── Risk Scores ───────────────────────────────────────────────────────────────
aiRoutes.get('/risk', async (c) => {
  try {
    const { patientId, category } = c.req.query()
    const scores = await listRiskScores(c.env.OCULOFLOW_KV, patientId, category)
    return c.json<Resp>({ success: true, data: scores })
  } catch (e: any) {
    return c.json<Resp>({ success: false, error: e.message }, 500)
  }
})

aiRoutes.post('/risk/compute', async (c) => {
  try {
    const body = await c.req.json()
    const { patientId, patientName, category } = body
    if (!patientId || !patientName || !category) {
      return c.json<Resp>({ success: false, error: 'patientId, patientName, category are required' }, 400)
    }
    const validCategories: RiskCategory[] = [
      'GLAUCOMA_PROGRESSION', 'DIABETIC_RETINOPATHY_PROGRESSION', 'AMD_PROGRESSION',
      'VISION_LOSS', 'SURGICAL_RISK', 'MEDICATION_ADHERENCE', 'NO_SHOW_RISK', 'READMISSION_RISK',
    ]
    if (!validCategories.includes(category)) {
      return c.json<Resp>({ success: false, error: `Invalid category. Valid: ${validCategories.join(', ')}` }, 400)
    }
    const t0 = Date.now()
    const score = computeRiskScore(patientId, patientName, category as RiskCategory)
    await saveRiskScore(c.env.OCULOFLOW_KV, score)
    await logQuery(c.env.OCULOFLOW_KV, {
      queryType: 'RISK_CALC',
      input: { patientId, category },
      outputSummary: `${score.level} risk, score ${score.score}/100`,
      userId: 'system', userName: 'System',
      durationMs: Date.now() - t0,
    })
    return c.json<Resp>({ success: true, data: score }, 201)
  } catch (e: any) {
    return c.json<Resp>({ success: false, error: e.message }, 500)
  }
})

aiRoutes.get('/risk/categories', (c) => {
  const cats: RiskCategory[] = [
    'GLAUCOMA_PROGRESSION', 'DIABETIC_RETINOPATHY_PROGRESSION', 'AMD_PROGRESSION',
    'VISION_LOSS', 'SURGICAL_RISK', 'MEDICATION_ADHERENCE', 'NO_SHOW_RISK', 'READMISSION_RISK',
  ]
  return c.json<Resp>({ success: true, data: cats })
})

// ── Insights / Alerts ─────────────────────────────────────────────────────────
aiRoutes.get('/insights', async (c) => {
  try {
    const { type, priority, dismissed } = c.req.query()
    const showDismissed = dismissed === 'true' ? true : dismissed === 'false' ? false : undefined
    const insights = await listInsights(c.env.OCULOFLOW_KV, type, priority, showDismissed)
    return c.json<Resp>({ success: true, data: insights })
  } catch (e: any) {
    return c.json<Resp>({ success: false, error: e.message }, 500)
  }
})

aiRoutes.patch('/insights/:id/dismiss', async (c) => {
  try {
    const insight = await dismissInsight(c.env.OCULOFLOW_KV, c.req.param('id'))
    if (!insight) return c.json<Resp>({ success: false, error: 'Insight not found' }, 404)
    return c.json<Resp>({ success: true, data: insight, message: 'Insight dismissed' })
  } catch (e: any) {
    return c.json<Resp>({ success: false, error: e.message }, 500)
  }
})

// ── Guideline Lookup (AI-enhanced search) ────────────────────────────────────
aiRoutes.post('/guidelines/lookup', async (c) => {
  try {
    const body = await c.req.json()
    const { query: q, icdCodes, topic } = body
    if (!q && !icdCodes && !topic) {
      return c.json<Resp>({ success: false, error: 'query, icdCodes, or topic is required' }, 400)
    }
    const t0 = Date.now()
    let results = clinicalGuidelines

    if (topic) results = results.filter(g => g.topic === topic)
    if (icdCodes && Array.isArray(icdCodes)) {
      const codeSet = new Set<string>(icdCodes)
      results = results.filter(g => g.applicableIcdCodes.some(c => codeSet.has(c)))
    }
    if (q) {
      const qLower = q.toLowerCase()
      results = results.filter(g =>
        g.title.toLowerCase().includes(qLower) ||
        g.summary.toLowerCase().includes(qLower) ||
        g.keyRecommendations.some((r: string) => r.toLowerCase().includes(qLower))
      )
    }

    await logQuery(c.env.OCULOFLOW_KV, {
      queryType: 'GUIDELINE_LOOKUP',
      input: body,
      outputSummary: `${results.length} guidelines found`,
      userId: 'system', userName: 'System',
      durationMs: Date.now() - t0,
    })

    return c.json<Resp>({ success: true, data: { results, count: results.length, queryMs: Date.now() - t0 } })
  } catch (e: any) {
    return c.json<Resp>({ success: false, error: e.message }, 500)
  }
})

export default aiRoutes
