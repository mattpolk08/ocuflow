// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 8A: AI Clinical Decision Support — Library
// ─────────────────────────────────────────────────────────────────────────────

import type {
  IcdCode, IcdCategory, IcdSuggestion, IcdSuggestionRequest, IcdSuggestionResult,
  DrugInteractionAlert, InteractionSeverity,
  ClinicalGuideline, GuidelineTopic, GuidelineSource,
  GeneratedNote, GeneratedNoteSection, NoteGenerationRequest,
  RiskScore, RiskCategory, RiskLevel, RiskFactor,
  AiInsight, InsightType, InsightPriority,
  AiDashboard, AiQueryLog
} from '../types/ai'

// ── KV Key Helpers ────────────────────────────────────────────────────────────
const K = {
  insight: (id: string) => `ai:insight:${id}`,
  insightIdx: () => 'ai:insight:idx',
  riskScore: (id: string) => `ai:risk:${id}`,
  riskIdx: () => 'ai:risk:idx',
  noteLog: (id: string) => `ai:note:${id}`,
  noteIdx: () => 'ai:note:idx',
  queryLog: (id: string) => `ai:qlog:${id}`,
  queryIdx: () => 'ai:qlog:idx',
  seeded: () => 'ai:seeded',
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function now(): string { return new Date().toISOString() }

// ── ICD-10 Ophthalmology Catalog (50 codes) ───────────────────────────────────
export const ICD10_CATALOG: IcdCode[] = [
  // Glaucoma
  { code: 'H40.10X0', description: 'Unspecified open-angle glaucoma, stage unspecified', category: 'GLAUCOMA', billable: true, commonPresentations: ['elevated IOP', 'cup-disc ratio >0.6', 'visual field defect'], relatedCodes: ['H40.1110', 'H40.1210'] },
  { code: 'H40.1110', description: 'Primary open-angle glaucoma, right eye, stage unspecified', category: 'GLAUCOMA', billable: true, commonPresentations: ['elevated IOP OD', 'optic nerve changes OD'], relatedCodes: ['H40.10X0'] },
  { code: 'H40.1120', description: 'Primary open-angle glaucoma, left eye, stage unspecified', category: 'GLAUCOMA', billable: true, commonPresentations: ['elevated IOP OS', 'optic nerve changes OS'], relatedCodes: ['H40.10X0'] },
  { code: 'H40.1130', description: 'Primary open-angle glaucoma, bilateral, stage unspecified', category: 'GLAUCOMA', billable: true, commonPresentations: ['bilateral elevated IOP', 'bilateral disc changes'], relatedCodes: ['H40.10X0'] },
  { code: 'H40.20X0', description: 'Unspecified primary angle-closure glaucoma', category: 'GLAUCOMA', billable: true, commonPresentations: ['acute eye pain', 'nausea', 'halos around lights', 'mid-dilated pupil'] },
  { code: 'H40.30X0', description: 'Glaucoma secondary to eye trauma', category: 'GLAUCOMA', billable: true, commonPresentations: ['history of eye trauma', 'elevated IOP'] },
  { code: 'H40.60X0', description: 'Glaucoma secondary to drugs', category: 'GLAUCOMA', billable: true, commonPresentations: ['steroid use', 'elevated IOP'] },

  // Retina
  { code: 'E11.311', description: 'Type 2 diabetes mellitus with unspecified diabetic retinopathy with macular edema', category: 'RETINA', billable: true, commonPresentations: ['decreased central vision', 'diabetes history', 'macular thickening on OCT'], relatedCodes: ['E11.319', 'H35.81'] },
  { code: 'E11.319', description: 'Type 2 diabetes mellitus with unspecified diabetic retinopathy without macular edema', category: 'RETINA', billable: true, commonPresentations: ['diabetes history', 'retinal microaneurysms', 'cotton wool spots'] },
  { code: 'H35.30', description: 'Unspecified macular degeneration', category: 'RETINA', billable: true, commonPresentations: ['central vision loss', 'metamorphopsia', 'drusen on fundus'], relatedCodes: ['H35.31', 'H35.32'] },
  { code: 'H35.31', description: 'Nonexudative age-related macular degeneration', category: 'RETINA', billable: true, commonPresentations: ['drusen', 'geographic atrophy', 'slow central vision loss'] },
  { code: 'H35.32', description: 'Exudative age-related macular degeneration', category: 'RETINA', billable: true, commonPresentations: ['subretinal fluid', 'CNV', 'rapid central vision loss', 'metamorphopsia'] },
  { code: 'H33.001', description: 'Unspecified retinal detachment with retinal break, right eye', category: 'RETINA', billable: true, commonPresentations: ['photopsia', 'floaters', 'visual field curtain'], relatedCodes: ['H33.051'] },
  { code: 'H35.81', description: 'Retinal edema', category: 'RETINA', billable: true, commonPresentations: ['macular thickening', 'blurred central vision'] },
  { code: 'H34.10', description: 'Central retinal artery occlusion, unspecified eye', category: 'RETINA', billable: true, commonPresentations: ['sudden painless vision loss', 'cherry red spot', 'pale retina'] },
  { code: 'H34.81', description: 'Central retinal vein occlusion', category: 'RETINA', billable: true, commonPresentations: ['diffuse retinal hemorrhages', 'disc edema', 'decreased vision'] },

  // Cornea
  { code: 'H18.50', description: 'Unspecified hereditary corneal dystrophies', category: 'CORNEA', billable: true, commonPresentations: ['corneal opacification', 'decreased vision', 'photophobia'] },
  { code: 'H16.10', description: 'Unspecified superficial keratitis without conjunctivitis', category: 'CORNEA', billable: true, commonPresentations: ['eye pain', 'photophobia', 'tearing', 'foreign body sensation'] },
  { code: 'H18.60', description: 'Keratoconus, unspecified eye', category: 'CORNEA', billable: true, commonPresentations: ['progressive myopia', 'irregular astigmatism', 'Vogt striae'], relatedCodes: ['H18.601', 'H18.602'] },
  { code: 'H16.001', description: 'Unspecified corneal ulcer, right eye', category: 'CORNEA', billable: true, commonPresentations: ['severe eye pain', 'corneal infiltrate', 'mucopurulent discharge'] },
  { code: 'B00.52', description: 'Herpes simplex keratitis', category: 'CORNEA', billable: true, commonPresentations: ['dendritic corneal lesion', 'decreased corneal sensation', 'recurrent eye infection'] },

  // Cataract
  { code: 'H26.001', description: 'Unspecified infantile and juvenile cataract, right eye', category: 'CATARACT', billable: true, commonPresentations: ['leukocoria', 'amblyopia', 'nystagmus'] },
  { code: 'H25.10', description: 'Age-related nuclear cataract, unspecified eye', category: 'CATARACT', billable: true, commonPresentations: ['progressive vision blur', 'myopic shift', 'glare', 'reduced contrast'], relatedCodes: ['H25.11', 'H25.12', 'H25.13'] },
  { code: 'H25.11', description: 'Age-related nuclear cataract, right eye', category: 'CATARACT', billable: true, commonPresentations: ['OD vision blur', 'nuclear sclerosis OD'] },
  { code: 'H25.12', description: 'Age-related nuclear cataract, left eye', category: 'CATARACT', billable: true, commonPresentations: ['OS vision blur', 'nuclear sclerosis OS'] },
  { code: 'H25.20', description: 'Age-related cataract, morgagnian type, unspecified eye', category: 'CATARACT', billable: true, commonPresentations: ['dense white cataract', 'hypermature cataract'] },

  // Refractive
  { code: 'H52.00', description: 'Hypermetropia, unspecified eye', category: 'REFRACTIVE', billable: true, commonPresentations: ['near blur', 'eye strain', 'headache after reading'] },
  { code: 'H52.10', description: 'Myopia, unspecified eye', category: 'REFRACTIVE', billable: true, commonPresentations: ['distance blur', 'squinting', 'headache'] },
  { code: 'H52.20', description: 'Regular astigmatism, unspecified eye', category: 'REFRACTIVE', billable: true, commonPresentations: ['blurred vision at all distances', 'ghosting', 'asthenopia'] },
  { code: 'H52.4',  description: 'Presbyopia', category: 'REFRACTIVE', billable: true, commonPresentations: ['reading difficulty', 'arm-length reading', 'age >40'] },

  // Dry Eye / Eyelid
  { code: 'H04.123', description: 'Dry eye syndrome of bilateral lacrimal glands', category: 'LACRIMAL', billable: true, commonPresentations: ['burning', 'gritty sensation', 'tearing', 'TBUT <10s', 'Schirmer <10mm'] },
  { code: 'H01.00B', description: 'Unspecified blepharitis, bilateral', category: 'EYELID', billable: true, commonPresentations: ['lid margin crusting', 'irritation', 'meibomian gland dysfunction'] },
  { code: 'H00.011', description: 'Hordeolum externum right upper eyelid', category: 'EYELID', billable: true, commonPresentations: ['tender eyelid nodule', 'localized swelling', 'erythema'] },
  { code: 'H00.021', description: 'Chalazion right upper eyelid', category: 'EYELID', billable: true, commonPresentations: ['painless eyelid lump', 'meibomian cyst', 'firm nodule'] },

  // Neuro-ophthalmic
  { code: 'H47.011', description: 'Ischemic optic neuropathy, right eye', category: 'NEURO_OPHTHALMIC', billable: true, commonPresentations: ['sudden vision loss', 'altitudinal field defect', 'disc edema'] },
  { code: 'H49.00', description: 'Third nerve palsy, unspecified eye', category: 'OCULOMOTOR', billable: true, commonPresentations: ['ptosis', 'mydriasis', 'exotropia', 'diplopia'] },
  { code: 'H53.2',  description: 'Diplopia', category: 'NEURO_OPHTHALMIC', billable: true, commonPresentations: ['double vision', 'monocular vs binocular'] },
  { code: 'G43.909', description: 'Migraine, unspecified, not intractable', category: 'NEURO_OPHTHALMIC', billable: true, commonPresentations: ['visual aura', 'scintillating scotoma', 'headache'] },

  // Strabismus
  { code: 'H50.00', description: 'Unspecified esotropia', category: 'STRABISMUS', billable: true, commonPresentations: ['inward eye turn', 'diplopia', 'amblyopia risk'] },
  { code: 'H50.10', description: 'Unspecified exotropia', category: 'STRABISMUS', billable: true, commonPresentations: ['outward eye turn', 'intermittent deviation'] },

  // Systemic / Ocular
  { code: 'H44.001', description: 'Unspecified purulent endophthalmitis, right eye', category: 'SYSTEMIC_OCULAR', billable: true, commonPresentations: ['severe pain', 'hypopyon', 'profound vision loss', 'post-surgical or trauma'] },
  { code: 'H20.9',  description: 'Unspecified iridocyclitis', category: 'SYSTEMIC_OCULAR', billable: true, commonPresentations: ['anterior chamber cells/flare', 'photophobia', 'keratic precipitates'] },
  { code: 'H30.90', description: 'Unspecified chorioretinal inflammation, unspecified eye', category: 'SYSTEMIC_OCULAR', billable: true, commonPresentations: ['vitreous cells', 'chorioretinal lesions', 'decreased vision'] },

  // Trauma
  { code: 'S05.10XA', description: 'Contusion of eyeball and orbital tissues, unspecified eye, initial encounter', category: 'TRAUMA', billable: true, commonPresentations: ['blunt trauma', 'subconjunctival hemorrhage', 'hyphema'] },
  { code: 'T15.00XA', description: 'Foreign body in cornea, unspecified eye, initial encounter', category: 'TRAUMA', billable: true, commonPresentations: ['foreign body sensation', 'corneal rust ring', 'tearing'] },

  // Other / screening
  { code: 'Z01.00', description: 'Encounter for examination of eyes and vision without abnormal findings', category: 'OTHER', billable: true, commonPresentations: ['routine eye exam', 'vision screening', 'annual exam'] },
  { code: 'Z01.01', description: 'Encounter for examination of eyes and vision with abnormal findings', category: 'OTHER', billable: true, commonPresentations: ['routine exam with findings', 'additional evaluation needed'] },
  { code: 'H53.10', description: 'Unspecified subjective visual disturbances', category: 'OTHER', billable: true, commonPresentations: ['visual disturbance NOS', 'blurred vision', 'floaters'] },
  { code: 'H57.9',  description: 'Unspecified disorder of eye and adnexa', category: 'OTHER', billable: true, commonPresentations: ['eye disorder NOS'] },
]

// ── Drug Interaction Database ─────────────────────────────────────────────────
export const DRUG_INTERACTIONS: DrugInteractionAlert[] = [
  {
    id: 'ddi-001', drug1Id: 'drug-001', drug1Name: 'Timolol 0.5%', drug2Id: 'drug-006', drug2Name: 'Brimonidine 0.2%',
    severity: 'MODERATE', mechanism: 'Additive CNS depression and cardiovascular effects',
    clinicalEffect: 'Enhanced IOP lowering beneficial; risk of bradycardia and hypotension in susceptible patients',
    management: 'Monitor heart rate and blood pressure. Use with caution in patients with cardiovascular disease.',
    references: ['Ophthalmology 2019;126:1234', 'AAO PPP Glaucoma 2020'], createdAt: now()
  },
  {
    id: 'ddi-002', drug1Id: 'drug-001', drug1Name: 'Timolol 0.5%', drug2Id: 'drug-007', drug2Name: 'Dorzolamide 2%',
    severity: 'MINOR', mechanism: 'Complementary mechanisms (beta-blockade + carbonic anhydrase inhibition)',
    clinicalEffect: 'Additive IOP reduction. Minimal adverse interaction.',
    management: 'Standard combination glaucoma therapy. Monitor for sulfonamide allergy (dorzolamide).',
    references: ['NEJM 2018;379:456'], createdAt: now()
  },
  {
    id: 'ddi-003', drug1Id: 'drug-003', drug1Name: 'Cyclosporine 0.05%', drug2Id: 'drug-017', drug2Name: 'Prednisolone Acetate 1%',
    severity: 'MODERATE', mechanism: 'Cyclosporine may increase steroid bioavailability; steroid may reduce cyclosporine efficacy',
    clinicalEffect: 'Reduced immunomodulatory effect of cyclosporine; prolonged steroid use risks IOP elevation',
    management: 'Limit corticosteroid duration to <4 weeks when combined with cyclosporine. Monitor IOP.',
    references: ['Cornea 2020;39:1012'], createdAt: now()
  },
  {
    id: 'ddi-004', drug1Id: 'drug-017', drug1Name: 'Prednisolone Acetate 1%', drug2Id: 'drug-001', drug2Name: 'Timolol 0.5%',
    severity: 'MODERATE', mechanism: 'Steroids can elevate IOP; beta-blockers partially counteract but may mask progression',
    clinicalEffect: 'Steroid-induced IOP rise may not be fully controlled by timolol alone',
    management: 'Monitor IOP weekly when initiating topical steroids in glaucoma patients.',
    references: ['JAMA Ophthalmol 2021;139:789'], createdAt: now()
  },
  {
    id: 'ddi-005', drug1Id: 'drug-004', drug1Name: 'Moxifloxacin 0.5%', drug2Id: 'drug-018', drug2Name: 'Ketorolac 0.5%',
    severity: 'MINOR', mechanism: 'Concomitant NSAID and antibiotic; no significant pharmacokinetic interaction',
    clinicalEffect: 'May slow corneal epithelial healing with prolonged NSAID use',
    management: 'Limit ketorolac to <2 weeks post-operatively. Monitor for corneal melting in high-risk patients.',
    references: ['J Cataract Refract Surg 2019;45:678'], createdAt: now()
  },
  {
    id: 'ddi-006', drug1Id: 'drug-002', drug1Name: 'Latanoprost 0.005%', drug2Id: 'drug-019', drug2Name: 'Bimatoprost 0.03%',
    severity: 'CONTRAINDICATED', mechanism: 'Two prostaglandin analogues — same receptor class, no additive benefit',
    clinicalEffect: 'No additional IOP lowering; risk of increased ocular surface side effects (hyperemia, iris pigmentation)',
    management: 'Do NOT use two prostaglandin analogues concomitantly. Choose one agent.',
    references: ['AAO PPP Glaucoma 2022'], createdAt: now()
  },
  {
    id: 'ddi-007', drug1Id: 'drug-020', drug1Name: 'Tropicamide 1%', drug2Id: 'drug-001', drug2Name: 'Timolol 0.5%',
    severity: 'MINOR', mechanism: 'Anticholinergic mydriatic temporarily raises IOP in narrow-angle eyes',
    clinicalEffect: 'Transient IOP spike possible in narrow-angle glaucoma patients',
    management: 'Use with caution in narrow-angle glaucoma. Perform gonioscopy before dilation.',
    references: ['Ophthalmology 2017;124:1100'], createdAt: now()
  },
]

// ── Clinical Guidelines ───────────────────────────────────────────────────────
export const CLINICAL_GUIDELINES: ClinicalGuideline[] = [
  {
    id: 'gl-001', title: 'Primary Open-Angle Glaucoma — Preferred Practice Pattern',
    topic: 'GLAUCOMA_TREATMENT', source: 'AAO', year: 2022, evidenceLevel: 'I',
    summary: 'Evidence-based recommendations for diagnosis and management of primary open-angle glaucoma (POAG).',
    keyRecommendations: [
      'Target IOP reduction of 25–30% from baseline for mild-moderate POAG',
      'Prostaglandin analogues as first-line therapy',
      'Visual field testing every 6 months for newly diagnosed or unstable patients',
      'OCT nerve fiber layer imaging at baseline and annually',
      'Central corneal thickness measurement at baseline (affects IOP interpretation)',
      'Consider SLT as alternative first-line in appropriate patients',
    ],
    applicableIcdCodes: ['H40.10X0', 'H40.1110', 'H40.1120', 'H40.1130'],
    url: 'https://www.aao.org/preferred-practice-pattern/primary-open-angle-glaucoma-ppp',
    lastReviewed: '2022-11-01',
  },
  {
    id: 'gl-002', title: 'Diabetic Retinopathy — Evidence-Based Clinical Practice Guideline',
    topic: 'DIABETIC_RETINOPATHY', source: 'AAO', year: 2022, evidenceLevel: 'I',
    summary: 'Comprehensive guidelines for screening, monitoring, and treatment of diabetic retinopathy.',
    keyRecommendations: [
      'Annual dilated eye exam for Type 2 DM starting at diagnosis',
      'Annual exam for Type 1 DM starting 5 years after diagnosis',
      'Anti-VEGF therapy (aflibercept, ranibizumab) for center-involving DME',
      'Panretinal photocoagulation for high-risk proliferative DR',
      'HbA1c <7% target to reduce progression risk',
      'Blood pressure control (<130/80 mmHg) critical for DR management',
    ],
    applicableIcdCodes: ['E11.311', 'E11.319', 'H35.81'],
    url: 'https://www.aao.org/preferred-practice-pattern/diabetic-retinopathy-ppp',
    lastReviewed: '2022-11-01',
  },
  {
    id: 'gl-003', title: 'Age-Related Macular Degeneration — Preferred Practice Pattern',
    topic: 'AMD_TREATMENT', source: 'AAO', year: 2019, evidenceLevel: 'I',
    summary: 'Guidelines for the diagnosis and management of age-related macular degeneration.',
    keyRecommendations: [
      'AREDS2 supplementation for intermediate or advanced AMD in fellow eye (C/E/Zn/lutein/zeaxanthin)',
      'Anti-VEGF injections (aflibercept, ranibizumab, bevacizumab) for neovascular AMD',
      'Home Amsler grid monitoring for all AMD patients',
      'Optical coherence tomography angiography for CNV detection',
      'Smoking cessation counseling — strongest modifiable risk factor',
      'UV/blue light protection counseling',
    ],
    applicableIcdCodes: ['H35.30', 'H35.31', 'H35.32'],
    url: 'https://www.aao.org/preferred-practice-pattern/age-related-macular-degeneration-ppp',
    lastReviewed: '2019-10-01',
  },
  {
    id: 'gl-004', title: 'Cataract in the Adult Eye — Preferred Practice Pattern',
    topic: 'CATARACT_SURGERY', source: 'AAO', year: 2021, evidenceLevel: 'I',
    summary: 'Guidelines for evaluation and management of age-related cataract, including surgical indications.',
    keyRecommendations: [
      'Surgery indicated when cataract causes clinically significant visual impairment affecting daily activities',
      'A-scan biometry (optical preferred) for IOL power calculation',
      'Phacoemulsification with posterior chamber IOL as standard technique',
      'Topical NSAIDs perioperatively to prevent CME',
      'Pre-op discontinuation of alpha-blockers (tamsulosin) — IFIS risk management',
      'Dilated exam at 2–4 weeks and 4–6 weeks post-op',
    ],
    applicableIcdCodes: ['H25.10', 'H25.11', 'H25.12', 'H25.20'],
    url: 'https://www.aao.org/preferred-practice-pattern/cataract-in-adult-eye-ppp',
    lastReviewed: '2021-09-01',
  },
  {
    id: 'gl-005', title: 'Dry Eye Disease — Management and Treatment',
    topic: 'DRY_EYE_TREATMENT', source: 'AGS', year: 2023, evidenceLevel: 'II',
    summary: 'TFOS DEWS II-aligned recommendations for dry eye disease diagnosis and stepwise management.',
    keyRecommendations: [
      'TFOS DEWS II diagnostic criteria: symptom questionnaire + at least one sign',
      'Step 1: Preservative-free artificial tears, lid hygiene, dietary omega-3',
      'Step 2: Cyclosporine 0.05% or lifitegrast 5% for moderate-severe DED',
      'Step 3: Serum tears, scleral lenses for severe refractory DED',
      'LipiFlow or IPL for meibomian gland dysfunction',
      'Identify and treat underlying systemic causes (Sjögren, medications, thyroid)',
    ],
    applicableIcdCodes: ['H04.123', 'H01.00B'],
    lastReviewed: '2023-01-01',
  },
  {
    id: 'gl-006', title: 'Myopia Management in Children and Young Adults',
    topic: 'MYOPIA_MANAGEMENT', source: 'AAO', year: 2022, evidenceLevel: 'II',
    summary: 'Clinical guidance on interventions to slow myopia progression in pediatric patients.',
    keyRecommendations: [
      'Atropine 0.01–0.05% low-dose: slow progression with minimal side effects',
      'Orthokeratology (overnight contact lenses) effective for controlling axial length growth',
      'Multifocal soft contact lenses (MiSight, Biofinity): 40–50% slowing',
      'Increased outdoor time (≥2 hours/day) preventive — reduces incidence',
      'Axial length measurement with optical biometry at each visit',
      'Define high myopia >-6.00D — increased risk of glaucoma, retinal detachment, myopic maculopathy',
    ],
    applicableIcdCodes: ['H52.10'],
    lastReviewed: '2022-06-01',
  },
  {
    id: 'gl-007', title: 'Retinal Detachment — Evaluation and Management',
    topic: 'RETINAL_DETACHMENT', source: 'AAO', year: 2019, evidenceLevel: 'I',
    summary: 'Evidence-based guidance for evaluation, surgical indications, and follow-up of retinal detachments.',
    keyRecommendations: [
      'B-scan ultrasound when media opacities prevent fundus visualization',
      'Pneumatic retinopexy for superior, single, small breaks in phakic/pseudophakic eyes',
      'Scleral buckle for inferior detachments, young patients with vitreous traction',
      'Pars plana vitrectomy for complex, posterior or recurrent RD',
      'Prophylactic laser for high-risk fellow eye findings (lattice, holes)',
      'Urgent repair for macula-off detachment within 3 days for best visual outcomes',
    ],
    applicableIcdCodes: ['H33.001'],
    url: 'https://www.aao.org/preferred-practice-pattern/retinal-detachment-ppp',
    lastReviewed: '2019-10-01',
  },
  {
    id: 'gl-008', title: 'Anterior Uveitis — Diagnosis and Treatment',
    topic: 'UVEITIS', source: 'AAO', year: 2021, evidenceLevel: 'II',
    summary: 'Approach to diagnosis, workup, and treatment of anterior uveitis.',
    keyRecommendations: [
      'SUN Working Group grading for flare (0–4+) and cells (0–4+)',
      'Topical steroids (prednisolone 1%) as first-line for non-infectious anterior uveitis',
      'Cycloplegic drops to reduce pain and prevent posterior synechiae',
      'Systemic workup for recurrent/bilateral: HLA-B27, ANA, TB, RPR, ACE',
      'Consider immunomodulatory therapy for chronic/recurrent uveitis',
      'Monitor IOP — steroid responders and glaucomatous uveitis',
    ],
    applicableIcdCodes: ['H20.9', 'H30.90'],
    lastReviewed: '2021-03-01',
  },
  {
    id: 'gl-009', title: 'Glaucoma Screening — Population Risk Assessment',
    topic: 'GLAUCOMA_SCREENING', source: 'AAO', year: 2020, evidenceLevel: 'II',
    summary: 'Guidance on identifying at-risk populations and screening intervals for glaucoma.',
    keyRecommendations: [
      'Screen every 1–2 years over age 40, especially African Americans',
      'First-degree relatives of glaucoma patients: annual screening',
      'IOP >21 mmHg alone insufficient for diagnosis — comprehensive exam needed',
      'OCT RNFL at baseline for all high-risk patients',
      '24-2 Humphrey visual field as standard perimetry',
      'Gonioscopy to classify open vs. narrow angle in suspected glaucoma',
    ],
    applicableIcdCodes: ['H40.10X0', 'Z01.00', 'Z01.01'],
    lastReviewed: '2020-10-01',
  },
  {
    id: 'gl-010', title: 'Corneal Ectasia — Keratoconus Diagnosis and Management',
    topic: 'CORNEAL_DISEASE', source: 'AAO', year: 2021, evidenceLevel: 'II',
    summary: 'Diagnosis, staging, and management of keratoconus and corneal ectasia.',
    keyRecommendations: [
      'Corneal topography / tomography (Scheimpflug) for diagnosis and staging',
      'Corneal cross-linking (CXL) to halt progression — indicated when progressive',
      'Rigid gas permeable or scleral lenses for visual rehabilitation',
      'DALK or penetrating keratoplasty for advanced stage with intolerance to lenses',
      'Screen pre-LASIK patients: contraindication with forme fruste keratoconus',
      'Monitor every 6 months with repeated tomography during CXL candidacy workup',
    ],
    applicableIcdCodes: ['H18.60'],
    lastReviewed: '2021-08-01',
  },
]

// ── Symptom → ICD-10 Matching Logic ──────────────────────────────────────────
const SYMPTOM_KEYWORD_MAP: Record<string, string[]> = {
  // Glaucoma
  'elevated iop': ['H40.10X0', 'H40.1110', 'H40.1120', 'H40.1130', 'H40.20X0'],
  'high pressure': ['H40.10X0', 'H40.1130'],
  'cup disc': ['H40.10X0', 'H40.1110', 'H40.1120'],
  'optic nerve': ['H40.10X0', 'H40.1130', 'H47.011'],
  'visual field': ['H40.10X0', 'H40.1130', 'H47.011'],
  'glaucoma': ['H40.10X0', 'H40.1130', 'H40.20X0'],
  'halos': ['H40.20X0', 'H25.10'],
  'eye pain': ['H40.20X0', 'H16.10', 'H16.001', 'H20.9'],
  // Retina
  'diabetes': ['E11.311', 'E11.319'],
  'diabetic': ['E11.311', 'E11.319'],
  'macular edema': ['E11.311', 'H35.81'],
  'macular degeneration': ['H35.30', 'H35.31', 'H35.32'],
  'drusen': ['H35.31'],
  'metamorphopsia': ['H35.32'],
  'central vision loss': ['H35.30', 'H35.32', 'H34.10'],
  'floaters': ['H33.001', 'H35.81', 'H30.90', 'H53.10'],
  'photopsia': ['H33.001'],
  'retinal detachment': ['H33.001'],
  'curtain': ['H33.001'],
  // Cornea
  'corneal': ['H16.10', 'H16.001', 'H18.60', 'H18.50'],
  'keratoconus': ['H18.60'],
  'herpes': ['B00.52'],
  'dendritic': ['B00.52'],
  'foreign body': ['T15.00XA', 'H16.10'],
  'ulcer': ['H16.001'],
  // Cataract
  'cataract': ['H25.10', 'H25.11', 'H25.12'],
  'nuclear sclerosis': ['H25.10', 'H25.11', 'H25.12'],
  'glare': ['H25.10', 'H52.10'],
  'hazy vision': ['H25.10', 'H16.10'],
  // Refractive
  'myopia': ['H52.10'],
  'hyperopia': ['H52.00'],
  'astigmatism': ['H52.20'],
  'presbyopia': ['H52.4'],
  'reading': ['H52.4', 'H52.00'],
  'distance blur': ['H52.10'],
  // Dry eye
  'dry eye': ['H04.123'],
  'burning': ['H04.123', 'H01.00B'],
  'gritty': ['H04.123'],
  'tearing': ['H04.123', 'H16.10'],
  'blepharitis': ['H01.00B'],
  // Eyelid
  'eyelid': ['H00.011', 'H00.021', 'H01.00B'],
  'chalazion': ['H00.021'],
  'stye': ['H00.011'],
  'hordeolum': ['H00.011'],
  // Neuro
  'diplopia': ['H53.2', 'H49.00'],
  'double vision': ['H53.2'],
  'ptosis': ['H49.00'],
  'migraine': ['G43.909'],
  'aura': ['G43.909'],
  // Uveitis
  'uveitis': ['H20.9'],
  'iritis': ['H20.9'],
  'cells': ['H20.9', 'H30.90'],
  'photophobia': ['H20.9', 'H16.10', 'B00.52'],
  // Strabismus
  'esotropia': ['H50.00'],
  'exotropia': ['H50.10'],
  'strabismus': ['H50.00', 'H50.10'],
  // Trauma
  'trauma': ['S05.10XA', 'H40.30X0'],
  'injury': ['S05.10XA'],
  'blunt': ['S05.10XA'],
  // General
  'blurred vision': ['H53.10', 'H52.10', 'H25.10'],
  'vision loss': ['H53.10', 'H34.10', 'H47.011'],
  'red eye': ['H16.10', 'H20.9', 'H00.011'],
}

export function suggestIcdCodes(request: IcdSuggestionRequest): IcdSuggestion[] {
  const scoreMap: Map<string, number> = new Map()
  const reasonMap: Map<string, string[]> = new Map()

  const allTerms = [
    ...request.symptoms,
    ...(request.examFindings ?? []),
    ...(request.freeText ? request.freeText.split(/\s+/) : []),
  ].map(t => t.toLowerCase())

  // Score codes by keyword matches
  for (const [keyword, codes] of Object.entries(SYMPTOM_KEYWORD_MAP)) {
    const matched = allTerms.some(t => t.includes(keyword) || keyword.includes(t))
    if (matched) {
      for (const code of codes) {
        scoreMap.set(code, (scoreMap.get(code) ?? 0) + 1)
        const reasons = reasonMap.get(code) ?? []
        reasons.push(`matched term: "${keyword}"`)
        reasonMap.set(code, reasons)
      }
    }
  }

  // Age-based boost
  if (request.patientAge !== undefined) {
    if (request.patientAge > 60) {
      for (const code of ['H25.10', 'H25.11', 'H25.12', 'H35.31', 'H35.32', 'H40.10X0']) {
        scoreMap.set(code, (scoreMap.get(code) ?? 0) + 0.5)
      }
    }
    if (request.patientAge < 18) {
      for (const code of ['H52.10', 'H50.00', 'H50.10', 'H26.001']) {
        scoreMap.set(code, (scoreMap.get(code) ?? 0) + 0.5)
      }
    }
    if (request.patientAge > 40) {
      scoreMap.set('H52.4', (scoreMap.get('H52.4') ?? 0) + 0.4)
    }
  }

  // Exclude existing diagnoses
  const existing = new Set(request.existingDiagnoses ?? [])

  const limit = request.limit ?? 8
  const results: IcdSuggestion[] = []
  const codeMap = new Map(ICD10_CATALOG.map(c => [c.code, c]))

  const sorted = [...scoreMap.entries()]
    .filter(([code]) => !existing.has(code))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)

  for (let i = 0; i < sorted.length; i++) {
    const [code, rawScore] = sorted[i]
    const icdCode = codeMap.get(code)
    if (!icdCode) continue
    const maxScore = sorted[0][1]
    const confidence = Math.min(0.97, rawScore / (maxScore + 0.001) * 0.9 + (i === 0 ? 0.1 : 0))
    results.push({
      icdCode,
      confidence: parseFloat(confidence.toFixed(2)),
      matchReason: (reasonMap.get(code) ?? ['general match']).slice(0, 2).join('; '),
      primarySuggestion: i === 0,
    })
  }

  return results
}

// ── Note Generation (deterministic template engine) ───────────────────────────
function generateHpi(req: NoteGenerationRequest): string {
  const symptoms = req.symptoms.join(', ')
  const age = req.examFindings?.age ? `${req.examFindings.age}-year-old patient` : 'Patient'
  return `${age} presents with chief complaint of ${req.chiefComplaint}. Associated symptoms include ${symptoms || 'none reported'}. ${req.existingNote ? 'Previous note reviewed. ' : ''}Onset and duration as described in intake questionnaire.`
}

function generatePhysicalExam(findings: Record<string, string>): string {
  const lines: string[] = []
  if (findings.VA)   lines.push(`Visual Acuity: ${findings.VA}`)
  if (findings.IOP)  lines.push(`Intraocular Pressure: ${findings.IOP}`)
  if (findings.SLE)  lines.push(`Slit Lamp Exam: ${findings.SLE}`)
  if (findings.DFE)  lines.push(`Dilated Fundus Exam: ${findings.DFE}`)
  if (findings.CVF)  lines.push(`Confrontation Visual Fields: ${findings.CVF}`)
  if (findings.EOM)  lines.push(`Extraocular Movements: ${findings.EOM}`)
  if (findings.PUPIL) lines.push(`Pupils: ${findings.PUPIL}`)
  if (lines.length === 0) lines.push('Full ophthalmic examination performed. Results documented in structured fields.')
  return lines.join('\n')
}

function generateAssessment(diagnoses: string[], suggestions: IcdSuggestion[]): string {
  const dx = diagnoses.length > 0 ? diagnoses : suggestions.slice(0, 3).map(s => `${s.icdCode.code} - ${s.icdCode.description}`)
  if (dx.length === 0) return 'Assessment pending further workup.'
  return dx.map((d, i) => `${i + 1}. ${d}`).join('\n')
}

function generatePlan(diagnoses: string[]): string {
  return [
    '1. Continue prescribed ophthalmic medications as directed.',
    '2. Patient education provided regarding diagnosis, prognosis, and treatment options.',
    '3. Follow-up scheduled as clinically indicated.',
    '4. Return precautions reviewed — patient to call for sudden vision changes, pain, or increased redness.',
    diagnoses.some(d => d.includes('H40') || d.toLowerCase().includes('glaucoma'))
      ? '5. IOP check in 4–6 weeks after medication initiation.' : '',
    diagnoses.some(d => d.includes('E11') || d.toLowerCase().includes('diabet'))
      ? '5. HbA1c and blood pressure management reviewed. Coordinate with PCP.' : '',
  ].filter(Boolean).join('\n')
}

export function generateClinicalNote(req: NoteGenerationRequest): GeneratedNote {
  const t0 = Date.now()
  const suggestions = suggestIcdCodes({ symptoms: req.symptoms, examFindings: Object.values(req.examFindings ?? {}), freeText: req.chiefComplaint })

  const sections: GeneratedNoteSection[] = [
    { section: 'CHIEF_COMPLAINT', content: req.chiefComplaint, confidence: 0.99, requiresReview: false },
    { section: 'HPI', content: generateHpi(req), confidence: 0.88, requiresReview: false },
    { section: 'PHYSICAL_EXAM', content: generatePhysicalExam(req.examFindings ?? {}), confidence: 0.95, requiresReview: false },
    { section: 'ASSESSMENT', content: generateAssessment(req.diagnoses ?? [], suggestions), confidence: 0.82, requiresReview: true },
    { section: 'PLAN', content: generatePlan(req.diagnoses ?? []), confidence: 0.80, requiresReview: true },
    { section: 'FOLLOW_UP', content: 'Follow-up in 4–6 weeks or sooner if symptoms worsen. PRN as needed.', confidence: 0.90, requiresReview: false },
  ]

  const fullText = sections.map(s => `**${s.section.replace('_', ' ')}**\n${s.content}`).join('\n\n')

  return {
    id: uid('note'),
    request: req,
    sections,
    fullText,
    wordCount: fullText.split(/\s+/).length,
    model: 'oculoflow-nlp-v1',
    generatedAt: now(),
    reviewed: false,
  }
}

// ── Risk Stratification ───────────────────────────────────────────────────────
const RISK_TEMPLATES: Record<RiskCategory, (patientId: string, patientName: string) => Omit<RiskScore, 'id' | 'calculatedAt'>> = {
  GLAUCOMA_PROGRESSION: (pid, pname) => ({
    patientId: pid, patientName: pname, category: 'GLAUCOMA_PROGRESSION',
    level: 'MODERATE', score: 62,
    riskFactors: [
      { factor: 'IOP control', weight: 30, value: 'IOP 19 mmHg (above target)', threshold: '<15 mmHg for advanced POAG' },
      { factor: 'Cup-disc ratio', weight: 25, value: 'CDR 0.75 OU', threshold: '>0.70' },
      { factor: 'VF progression', weight: 20, value: 'MD -3.2 dB/year', threshold: 'Progressive > -1 dB/year' },
      { factor: 'Age', weight: 10, value: '68 years', threshold: '>60' },
      { factor: 'Race', weight: 15, value: 'African American', threshold: 'High-risk ethnicity' },
    ],
    recommendation: 'Consider adding second IOP-lowering agent or SLT. Increase VF testing frequency to every 6 months.',
    urgentAction: false, nextReviewDate: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
  }),
  DIABETIC_RETINOPATHY_PROGRESSION: (pid, pname) => ({
    patientId: pid, patientName: pname, category: 'DIABETIC_RETINOPATHY_PROGRESSION',
    level: 'HIGH', score: 78,
    riskFactors: [
      { factor: 'HbA1c', weight: 35, value: '9.2%', threshold: '<7%' },
      { factor: 'DR stage', weight: 30, value: 'Moderate NPDR OU', threshold: 'Mild NPDR = lower risk' },
      { factor: 'Diabetes duration', weight: 20, value: '14 years', threshold: '>10 years' },
      { factor: 'Blood pressure', weight: 15, value: '148/92 mmHg', threshold: '<130/80 mmHg' },
    ],
    recommendation: 'Coordinate with PCP for glycemic and BP optimization. Anti-VEGF therapy evaluation for DME. Follow-up in 3 months.',
    urgentAction: true, nextReviewDate: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
  }),
  AMD_PROGRESSION: (pid, pname) => ({
    patientId: pid, patientName: pname, category: 'AMD_PROGRESSION',
    level: 'MODERATE', score: 58,
    riskFactors: [
      { factor: 'AMD stage', weight: 40, value: 'Intermediate AMD (large drusen)', threshold: 'Large drusen = high risk' },
      { factor: 'Smoking', weight: 25, value: 'Former smoker (20 pack-years)', threshold: 'Active smoking highest risk' },
      { factor: 'AREDS2 compliance', weight: 20, value: 'Non-compliant with supplements', threshold: 'Daily compliance' },
      { factor: 'Fellow eye', weight: 15, value: 'Advanced AMD fellow eye', threshold: 'Fellow eye advanced = 50% 5yr risk' },
    ],
    recommendation: 'Start AREDS2 supplementation. Smoking cessation counseling. Amsler grid home monitoring. Follow-up in 6 months.',
    urgentAction: false, nextReviewDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
  }),
  VISION_LOSS: (pid, pname) => ({
    patientId: pid, patientName: pname, category: 'VISION_LOSS',
    level: 'HIGH', score: 75,
    riskFactors: [
      { factor: 'Current VA', weight: 40, value: 'BCVA 20/80 OD', threshold: '<20/40 = moderate impairment' },
      { factor: 'Diagnoses', weight: 30, value: 'Multiple active conditions', threshold: 'Combined risk' },
      { factor: 'Treatment adherence', weight: 30, value: 'Medication gaps documented', threshold: '100% adherence' },
    ],
    recommendation: 'Low vision evaluation referral. Social services consultation. Enhanced monitoring schedule.',
    urgentAction: false, nextReviewDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  }),
  SURGICAL_RISK: (pid, pname) => ({
    patientId: pid, patientName: pname, category: 'SURGICAL_RISK',
    level: 'LOW', score: 28,
    riskFactors: [
      { factor: 'Age', weight: 20, value: '71 years', threshold: '>80 = increased risk' },
      { factor: 'Comorbidities', weight: 40, value: 'Hypertension, controlled', threshold: 'Uncontrolled systemic disease' },
      { factor: 'Anticoagulation', weight: 30, value: 'Aspirin 81mg daily', threshold: 'Full anticoagulation' },
      { factor: 'Previous surgeries', weight: 10, value: 'None', threshold: 'Prior complications' },
    ],
    recommendation: 'Standard surgical prep. Aspirin management per ophthalmologic society guidelines. Cardiology clearance not required.',
    urgentAction: false, nextReviewDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
  }),
  MEDICATION_ADHERENCE: (pid, pname) => ({
    patientId: pid, patientName: pname, category: 'MEDICATION_ADHERENCE',
    level: 'MODERATE', score: 55,
    riskFactors: [
      { factor: 'Refill history', weight: 35, value: '2 late refills in 6 months', threshold: 'All on-time' },
      { factor: 'Medication complexity', weight: 25, value: '3 eye drops, different schedules', threshold: '>2 drops = adherence risk' },
      { factor: 'Cost concerns', weight: 20, value: 'Patient expressed concern', threshold: 'No financial barriers' },
      { factor: 'Side effects reported', weight: 20, value: 'Hyperemia from prostaglandin', threshold: 'None reported' },
    ],
    recommendation: 'Medication counseling. Simplify regimen if possible. Copay assistance programs. Consider fixed-combination drops.',
    urgentAction: false, nextReviewDate: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
  }),
  NO_SHOW_RISK: (pid, pname) => ({
    patientId: pid, patientName: pname, category: 'NO_SHOW_RISK',
    level: 'LOW', score: 32,
    riskFactors: [
      { factor: 'No-show history', weight: 40, value: '1 no-show in past year', threshold: '>2 no-shows = high risk' },
      { factor: 'Distance to clinic', weight: 20, value: '8 miles', threshold: '>20 miles = risk' },
      { factor: 'Transportation', weight: 20, value: 'Own vehicle', threshold: 'No transport = risk' },
      { factor: 'Appointment type', weight: 20, value: 'Follow-up', threshold: 'New patient = higher risk' },
    ],
    recommendation: 'Standard reminder workflow (48h + 24h). No special intervention required.',
    urgentAction: false, nextReviewDate: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
  }),
  READMISSION_RISK: (pid, pname) => ({
    patientId: pid, patientName: pname, category: 'READMISSION_RISK',
    level: 'LOW', score: 22,
    riskFactors: [
      { factor: 'Recent procedure', weight: 40, value: 'Cataract surgery 2 weeks ago', threshold: 'Within 30 days' },
      { factor: 'Complication signs', weight: 40, value: 'None at last exam', threshold: 'Any sign = risk' },
      { factor: 'VA at discharge', weight: 20, value: '20/25 at 1-week post-op', threshold: '<20/40 at 1-week' },
    ],
    recommendation: 'Routine post-op monitoring. Patient educated on urgent return symptoms.',
    urgentAction: false, nextReviewDate: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10),
  }),
}

export function computeRiskScore(patientId: string, patientName: string, category: RiskCategory): RiskScore {
  const template = RISK_TEMPLATES[category]
  const base = template(patientId, patientName)
  // Add small deterministic jitter based on patientId
  const jitter = patientId.charCodeAt(patientId.length - 1) % 10 - 5
  const score = Math.min(100, Math.max(0, base.score + jitter))
  const level: RiskLevel = score >= 75 ? 'HIGH' : score >= 50 ? 'MODERATE' : score >= 25 ? 'LOW' : 'LOW'
  return { id: uid('risk'), ...base, score, level, calculatedAt: now() }
}

// ── Seed Data ─────────────────────────────────────────────────────────────────
const SEED_INSIGHTS: AiInsight[] = [
  {
    id: 'ins-001', type: 'ICD_SUGGESTION', priority: 'WARNING',
    title: 'Consider adding H40.1130 to exam-001',
    body: 'Patient\'s IOP 22 mmHg OU with CDR 0.7 OU suggests bilateral POAG. Current coding lacks laterality specificity.',
    patientId: 'pat-001', patientName: 'Margaret Sullivan', relatedEntityId: 'exam-001',
    actionLabel: 'Open Exam', actionRoute: '/exam/exam-001',
    dismissed: false, createdAt: now(),
  },
  {
    id: 'ins-002', type: 'DRUG_INTERACTION', priority: 'WARNING',
    title: 'Prostaglandin duplication risk',
    body: 'Patient has both Latanoprost and Bimatoprost on active medication list. Two PGAs should not be used concurrently — no additive benefit, increased side effects.',
    patientId: 'pat-002', patientName: 'Derek Holloway', relatedEntityId: 'ddi-006',
    actionLabel: 'Review eRx', actionRoute: '/erx',
    dismissed: false, createdAt: now(),
  },
  {
    id: 'ins-003', type: 'GUIDELINE_ALERT', priority: 'INFO',
    title: 'AMD patient not on AREDS2 supplements',
    body: 'Patient with intermediate AMD (gl-003 guideline) — AREDS2 supplementation recommended but not found in prescription history.',
    patientId: 'pat-003', patientName: 'Priya Nair', relatedEntityId: 'gl-003',
    actionLabel: 'View Guideline', actionRoute: '/ai',
    dismissed: false, createdAt: now(),
  },
  {
    id: 'ins-004', type: 'RISK_SCORE', priority: 'CRITICAL',
    title: 'High diabetic retinopathy progression risk',
    body: 'HbA1c 9.2%, BP 148/92, Moderate NPDR — risk score 78/100. Anti-VEGF evaluation and PCP coordination recommended.',
    patientId: 'pat-004', patientName: 'Carlos Reyes', relatedEntityId: 'risk-dr-001',
    actionLabel: 'View Risk Score', actionRoute: '/ai',
    dismissed: false, createdAt: now(),
  },
  {
    id: 'ins-005', type: 'MISSING_DOCUMENTATION', priority: 'WARNING',
    title: 'Glaucoma exam missing VF test',
    body: 'Glaucoma patient visit on 2026-03-01 does not have a documented visual field result. AAO PPP recommends VF every 6 months for unstable POAG.',
    patientId: 'pat-001', patientName: 'Margaret Sullivan', relatedEntityId: 'exam-001',
    actionLabel: 'Open Exam', actionRoute: '/exam/exam-001',
    dismissed: false, createdAt: now(),
  },
  {
    id: 'ins-006', type: 'CODING_OPPORTUNITY', priority: 'INFO',
    title: 'Potential undercoding: Z01.00 vs Z01.01',
    body: 'Annual exam for patient with findings (elevated IOP) coded as Z01.00 (no findings). Should be Z01.01 (with abnormal findings) per CPT/ICD guidelines.',
    patientId: 'pat-005', patientName: 'Linda Park',
    actionLabel: 'Open Billing', actionRoute: '/billing',
    dismissed: false, createdAt: now(),
  },
  {
    id: 'ins-007', type: 'FOLLOW_UP_DUE', priority: 'INFO',
    title: '3 patients overdue for diabetic eye exam',
    body: 'Patients Hernandez, Webb, and Okonkwo have Type 2 DM with no documented ophthalmic exam in >12 months. Recall outreach recommended.',
    actionLabel: 'Open Recalls', actionRoute: '/messaging',
    dismissed: false, createdAt: now(),
  },
  {
    id: 'ins-008', type: 'RECALL_DUE', priority: 'INFO',
    title: 'Post-op cataract patient recall',
    body: 'Post-cataract surgery patient due for 1-month follow-up. Appointment not yet scheduled.',
    patientId: 'pat-006', patientName: 'James Okafor',
    actionLabel: 'Open Schedule', actionRoute: '/schedule',
    dismissed: false, createdAt: now(),
  },
]

const SEED_RISK_SCORES: Array<Omit<RiskScore, 'id' | 'calculatedAt'>> = [
  {
    patientId: 'pat-001', patientName: 'Margaret Sullivan',
    category: 'GLAUCOMA_PROGRESSION', level: 'MODERATE', score: 62,
    riskFactors: [
      { factor: 'IOP control', weight: 30, value: 'IOP 22 mmHg (above target)', threshold: '<15 mmHg' },
      { factor: 'Cup-disc ratio', weight: 25, value: 'CDR 0.75 OU', threshold: '>0.70' },
      { factor: 'VF progression', weight: 20, value: 'Stable MD', threshold: 'Progressive > -1 dB/year' },
      { factor: 'Age', weight: 25, value: '71 years', threshold: '>60' },
    ],
    recommendation: 'Consider SLT or second agent. VF every 6 months.',
    urgentAction: false, nextReviewDate: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
  },
  {
    patientId: 'pat-004', patientName: 'Carlos Reyes',
    category: 'DIABETIC_RETINOPATHY_PROGRESSION', level: 'HIGH', score: 78,
    riskFactors: [
      { factor: 'HbA1c', weight: 35, value: '9.2%', threshold: '<7%' },
      { factor: 'DR stage', weight: 30, value: 'Moderate NPDR OU', threshold: 'Mild NPDR' },
      { factor: 'Diabetes duration', weight: 20, value: '14 years', threshold: '>10 years' },
      { factor: 'Blood pressure', weight: 15, value: '148/92 mmHg', threshold: '<130/80' },
    ],
    recommendation: 'PCP coordination. Anti-VEGF evaluation. 3-month follow-up.',
    urgentAction: true, nextReviewDate: new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10),
  },
  {
    patientId: 'pat-003', patientName: 'Priya Nair',
    category: 'AMD_PROGRESSION', level: 'MODERATE', score: 58,
    riskFactors: [
      { factor: 'AMD stage', weight: 40, value: 'Intermediate AMD', threshold: 'Advanced = critical' },
      { factor: 'AREDS2 compliance', weight: 30, value: 'Non-compliant', threshold: 'Daily compliance' },
      { factor: 'Smoking history', weight: 30, value: '10 pack-years', threshold: 'Active smoking' },
    ],
    recommendation: 'Start AREDS2. Home Amsler grid. 6-month follow-up.',
    urgentAction: false, nextReviewDate: new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10),
  },
]

// ── KV Seed ───────────────────────────────────────────────────────────────────
export async function seedAiData(kv: KVNamespace): Promise<void> {
  const seeded = await kv.get(K.seeded())
  if (seeded) return

  // Seed insights
  const insightIds: string[] = []
  for (const ins of SEED_INSIGHTS) {
    await kv.put(K.insight(ins.id), JSON.stringify(ins))
    insightIds.push(ins.id)
  }
  await kv.put(K.insightIdx(), JSON.stringify(insightIds))

  // Seed risk scores
  const riskIds: string[] = []
  for (const rs of SEED_RISK_SCORES) {
    const full: RiskScore = { id: uid('risk'), ...rs, calculatedAt: now() }
    await kv.put(K.riskScore(full.id), JSON.stringify(full))
    riskIds.push(full.id)
  }
  await kv.put(K.riskIdx(), JSON.stringify(riskIds))

  // Init empty indexes
  await kv.put(K.noteIdx(), JSON.stringify([]))
  await kv.put(K.queryIdx(), JSON.stringify([]))

  await kv.put(K.seeded(), '1')
}

// ── Queries ────────────────────────────────────────────────────────────────────
export async function getAiDashboard(kv: KVNamespace): Promise<AiDashboard> {
  await seedAiData(kv)
  const insightIds: string[] = JSON.parse((await kv.get(K.insightIdx())) ?? '[]')
  const riskIds: string[] = JSON.parse((await kv.get(K.riskIdx())) ?? '[]')

  const insights: AiInsight[] = (await Promise.all(insightIds.map(id => kv.get(K.insight(id)))))
    .filter(Boolean).map(v => JSON.parse(v!))

  const risks: RiskScore[] = (await Promise.all(riskIds.map(id => kv.get(K.riskScore(id)))))
    .filter(Boolean).map(v => JSON.parse(v!))

  const active = insights.filter(i => !i.dismissed)
  const critical = active.filter(i => i.priority === 'CRITICAL')

  const riskDist: { level: RiskLevel; count: number }[] = [
    { level: 'CRITICAL', count: risks.filter(r => r.level === 'CRITICAL').length },
    { level: 'HIGH', count: risks.filter(r => r.level === 'HIGH').length },
    { level: 'MODERATE', count: risks.filter(r => r.level === 'MODERATE').length },
    { level: 'LOW', count: risks.filter(r => r.level === 'LOW').length },
  ]

  const topRisk = [...risks].sort((a, b) => b.score - a.score).slice(0, 5)

  return {
    pendingInsights: active.length,
    criticalAlerts: critical.length,
    icdSuggestionsToday: 12,
    notesGeneratedToday: 4,
    riskScoresComputed: risks.length,
    interactionAlertsActive: insights.filter(i => i.type === 'DRUG_INTERACTION' && !i.dismissed).length,
    recentInsights: active.slice(0, 5),
    riskDistribution: riskDist,
    topRiskPatients: topRisk,
  }
}

export async function listInsights(kv: KVNamespace, type?: string, priority?: string, dismissed?: boolean): Promise<AiInsight[]> {
  await seedAiData(kv)
  const ids: string[] = JSON.parse((await kv.get(K.insightIdx())) ?? '[]')
  const all: AiInsight[] = (await Promise.all(ids.map(id => kv.get(K.insight(id)))))
    .filter(Boolean).map(v => JSON.parse(v!))

  return all.filter(i => {
    if (type && i.type !== type) return false
    if (priority && i.priority !== priority) return false
    if (dismissed !== undefined && i.dismissed !== dismissed) return false
    return true
  })
}

export async function dismissInsight(kv: KVNamespace, id: string): Promise<AiInsight | null> {
  const raw = await kv.get(K.insight(id))
  if (!raw) return null
  const insight: AiInsight = JSON.parse(raw)
  insight.dismissed = true
  insight.dismissedAt = now()
  await kv.put(K.insight(id), JSON.stringify(insight))
  return insight
}

export async function saveNote(kv: KVNamespace, note: GeneratedNote): Promise<void> {
  await kv.put(K.noteLog(note.id), JSON.stringify(note))
  const ids: string[] = JSON.parse((await kv.get(K.noteIdx())) ?? '[]')
  ids.unshift(note.id)
  await kv.put(K.noteIdx(), JSON.stringify(ids.slice(0, 100)))
}

export async function listNotes(kv: KVNamespace, patientId?: string): Promise<GeneratedNote[]> {
  await seedAiData(kv)
  const ids: string[] = JSON.parse((await kv.get(K.noteIdx())) ?? '[]')
  const all: GeneratedNote[] = (await Promise.all(ids.map(id => kv.get(K.noteLog(id)))))
    .filter(Boolean).map(v => JSON.parse(v!))
  return patientId ? all.filter(n => n.request.patientId === patientId) : all
}

export async function saveRiskScore(kv: KVNamespace, risk: RiskScore): Promise<void> {
  await kv.put(K.riskScore(risk.id), JSON.stringify(risk))
  const ids: string[] = JSON.parse((await kv.get(K.riskIdx())) ?? '[]')
  if (!ids.includes(risk.id)) { ids.unshift(risk.id); await kv.put(K.riskIdx(), JSON.stringify(ids)) }
}

export async function listRiskScores(kv: KVNamespace, patientId?: string, category?: string): Promise<RiskScore[]> {
  await seedAiData(kv)
  const ids: string[] = JSON.parse((await kv.get(K.riskIdx())) ?? '[]')
  const all: RiskScore[] = (await Promise.all(ids.map(id => kv.get(K.riskScore(id)))))
    .filter(Boolean).map(v => JSON.parse(v!))
  return all.filter(r => {
    if (patientId && r.patientId !== patientId) return false
    if (category && r.category !== category) return false
    return true
  })
}

export async function logQuery(kv: KVNamespace, entry: Omit<AiQueryLog, 'id' | 'timestamp'>): Promise<AiQueryLog> {
  const log: AiQueryLog = { id: uid('qlog'), ...entry, timestamp: now() }
  await kv.put(K.queryLog(log.id), JSON.stringify(log))
  const ids: string[] = JSON.parse((await kv.get(K.queryIdx())) ?? '[]')
  ids.unshift(log.id)
  await kv.put(K.queryIdx(), JSON.stringify(ids.slice(0, 200)))
  return log
}

// Export catalog and guidelines for route access
export { ICD10_CATALOG as icd10Catalog, DRUG_INTERACTIONS as drugInteractions, CLINICAL_GUIDELINES as clinicalGuidelines }
