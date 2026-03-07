// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Insurance Card OCR Parser
// Uses OpenAI Vision API (gpt-4o) to extract insurance card data
// ─────────────────────────────────────────────────────────────────────────────

import type { OcrResult } from '../types/intake'

const OCR_PROMPT = `You are an insurance card data extractor. Analyze this insurance card image and extract the following fields as JSON. Return ONLY valid JSON, no markdown.

Fields to extract:
- memberId: The member/subscriber ID number
- groupNumber: The group number
- payerName: The insurance company name (e.g. "Aetna", "UnitedHealthcare", "Blue Cross Blue Shield")
- subscriberName: The name of the subscriber/cardholder
- planName: The plan or product name
- confidence: A score from 0-100 indicating how confident you are in the extraction

If a field is not visible or readable, set it to null.
Return format: { "memberId": "...", "groupNumber": "...", "payerName": "...", "subscriberName": "...", "planName": "...", "confidence": 85 }`

/**
 * Extracts insurance data from a base64-encoded image using OpenAI Vision
 */
export async function extractInsuranceOcr(
  imageDataUrl: string,
  openaiApiKey: string
): Promise<OcrResult> {
  try {
    // Validate it's a data URL with an image
    if (!imageDataUrl.startsWith('data:image/')) {
      return { success: false, error: 'Invalid image format', confidence: 0 }
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: OCR_PROMPT,
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl,
                  detail: 'high',
                },
              },
            ],
          },
        ],
      }),
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('OpenAI OCR error:', err)
      return { success: false, error: 'OCR service unavailable', confidence: 0 }
    }

    const result = await response.json() as {
      choices: Array<{ message: { content: string } }>
    }

    const content = result.choices?.[0]?.message?.content?.trim()
    if (!content) {
      return { success: false, error: 'No content returned from OCR', confidence: 0 }
    }

    // Strip any accidental markdown fences
    const cleaned = content.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(cleaned) as {
      memberId?: string
      groupNumber?: string
      payerName?: string
      subscriberName?: string
      planName?: string
      confidence?: number
    }

    return {
      success: true,
      memberId: parsed.memberId ?? undefined,
      groupNumber: parsed.groupNumber ?? undefined,
      payerName: parsed.payerName ?? undefined,
      subscriberName: parsed.subscriberName ?? undefined,
      planName: parsed.planName ?? undefined,
      confidence: parsed.confidence ?? 70,
    }
  } catch (err) {
    console.error('OCR parse error:', err)
    return {
      success: false,
      error: 'Could not read card. Please enter details manually.',
      confidence: 0,
    }
  }
}

/**
 * Validates that an image data URL is within acceptable size limits
 * Max 5MB for the base64 payload
 */
export function validateImageSize(dataUrl: string): { valid: boolean; error?: string } {
  // Rough byte size estimate from base64 string length
  const base64 = dataUrl.split(',')[1] ?? ''
  const bytes = (base64.length * 3) / 4
  const mb = bytes / (1024 * 1024)

  if (mb > 5) {
    return { valid: false, error: `Image too large (${mb.toFixed(1)}MB). Max 5MB.` }
  }
  return { valid: true }
}
