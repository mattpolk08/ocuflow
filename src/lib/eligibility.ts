// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Insurance Eligibility Checker
// Simulates a 270/271 EDI eligibility transaction via clearinghouse REST API
// In production: Availity, Change Healthcare, or Office Ally
// ─────────────────────────────────────────────────────────────────────────────

import type { EligibilityDetails, InsurancePlan } from '../types/patient'

export interface EligibilityRequest {
  payerId: string
  payerName: string
  memberId: string
  subscriberName: string
  subscriberDob?: string
  providerNpi: string
  serviceDate: string
  serviceTypeCode?: string  // '98' = Vision, '30' = Health Benefit Plan
}

export interface EligibilityResponse {
  success: boolean
  status: 'ACTIVE' | 'INACTIVE' | 'UNKNOWN'
  details?: EligibilityDetails
  error?: string
  rawResponse?: Record<string, unknown>
  checkedAt: string
}

/**
 * Check eligibility via clearinghouse API (or demo simulation)
 * In production: POST to Availity API /eligibility/v3/transactions
 */
export async function checkEligibility(
  req: EligibilityRequest,
  apiKey?: string,
  demoMode = true
): Promise<EligibilityResponse> {
  const checkedAt = new Date().toISOString()

  // Demo / simulation mode — returns realistic fake responses
  if (demoMode || !apiKey) {
    return simulateEligibility(req, checkedAt)
  }

  // Production: real clearinghouse call
  try {
    const response = await fetch('https://api.availity.com/availity/v3/eligibility', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        controlNumber: crypto.randomUUID().slice(0, 9).replace(/-/g, ''),
        tradingPartnerId: req.payerId,
        providers: [{ organizationName: 'OculoFlow Eye Care', npi: req.providerNpi }],
        subscriber: {
          memberId: req.memberId,
          firstName: req.subscriberName.split(' ')[0],
          lastName: req.subscriberName.split(' ').slice(1).join(' '),
          dateOfBirth: req.subscriberDob,
        },
        encounter: {
          serviceTypeCodes: [req.serviceTypeCode || '98'],
          dateRange: { start: req.serviceDate, end: req.serviceDate },
        },
      }),
    })

    if (!response.ok) throw new Error(`Clearinghouse error: ${response.status}`)

    const data = await response.json() as Record<string, unknown>
    return parseAvailityResponse(data, checkedAt)
  } catch (err) {
    return {
      success: false,
      status: 'UNKNOWN',
      error: err instanceof Error ? err.message : 'Eligibility check failed',
      checkedAt,
    }
  }
}

/**
 * Simulates realistic eligibility responses based on payer
 */
function simulateEligibility(
  req: EligibilityRequest,
  checkedAt: string
): EligibilityResponse {
  // Simulate network delay feel (sync, but realistic data)
  const payerUpper = req.payerName.toUpperCase()

  // Simulate inactive/unknown for certain test member IDs
  if (req.memberId === 'INACTIVE') {
    return {
      success: true, status: 'INACTIVE', checkedAt,
      details: { lastVerifiedAt: checkedAt },
    }
  }

  // Medicare simulation
  if (payerUpper.includes('MEDICARE')) {
    return {
      success: true, status: 'ACTIVE', checkedAt,
      details: {
        planName: 'Medicare Part B',
        groupName: 'Centers for Medicare & Medicaid Services',
        coinsurance: 20,
        deductibleMet: 240,
        outOfPocketMet: Math.floor(Math.random() * 3000),
        lastVerifiedAt: checkedAt,
        visionBenefit: true,
        visionCopay: 0,
      },
    }
  }

  // Medicaid simulation
  if (payerUpper.includes('MEDICAID')) {
    return {
      success: true, status: 'ACTIVE', checkedAt,
      details: {
        planName: 'Medicaid Managed Care',
        coinsurance: 0,
        deductibleMet: 0,
        outOfPocketMet: 0,
        copaySpecialist: 3,
        lastVerifiedAt: checkedAt,
        visionBenefit: true,
        visionCopay: 3,
        visionAllowance: 200,
      },
    }
  }

  // VSP / EyeMed / Davis — vision-only
  if (payerUpper.includes('VSP') || payerUpper.includes('EYEMED') || payerUpper.includes('DAVIS')) {
    return {
      success: true, status: 'ACTIVE', checkedAt,
      details: {
        planName: `${req.payerName} Vision Plan`,
        coinsurance: 0,
        deductibleMet: 0,
        outOfPocketMet: 0,
        lastVerifiedAt: checkedAt,
        visionBenefit: true,
        visionCopay: 10,
        visionAllowance: 150,
      },
    }
  }

  // Commercial payers (Aetna, UHC, BCBS, Cigna, Humana)
  const copays: Record<string, number> = {
    AETNA: 45, UNITEDHEALTHCARE: 40, UHC: 40,
    'BLUE CROSS': 30, BCBS: 30, CIGNA: 35,
    HUMANA: 30, ANTHEM: 35, KAISER: 20,
  }
  const matchedKey = Object.keys(copays).find(k => payerUpper.includes(k))
  const copay = matchedKey ? copays[matchedKey] : 40
  const deductible = [500, 1000, 1500, 2000, 2500][Math.floor(Math.random() * 5)]
  const deductibleMet = Math.floor(Math.random() * deductible)

  return {
    success: true, status: 'ACTIVE', checkedAt,
    details: {
      planName: `${req.payerName} PPO`,
      coinsurance: 20,
      deductibleMet,
      outOfPocketMet: Math.floor(deductibleMet * 0.6),
      copaySpecialist: copay,
      copayPCP: Math.floor(copay * 0.6),
      lastVerifiedAt: checkedAt,
      visionBenefit: Math.random() > 0.5,
      visionCopay: 10,
      visionAllowance: 150,
    },
  }
}

/**
 * Parse a real Availity 271 response into our EligibilityDetails format
 */
function parseAvailityResponse(
  data: Record<string, unknown>,
  checkedAt: string
): EligibilityResponse {
  try {
    // Simplified parsing — real responses are deeply nested EDI structures
    const benefit = (data as any)?.benefitsInformation?.[0]
    return {
      success: true,
      status: 'ACTIVE',
      details: {
        planName: (data as any)?.planStatus?.[0]?.planDetails ?? 'Unknown Plan',
        coinsurance: benefit?.coinsurancePct ?? 20,
        deductibleMet: 0,
        outOfPocketMet: 0,
        lastVerifiedAt: checkedAt,
        visionBenefit: false,
        rawResponse: data,
      },
      checkedAt,
    }
  } catch {
    return { success: false, status: 'UNKNOWN', error: 'Response parse error', checkedAt }
  }
}
