/**
 * Block 4 — Claude vision wrapper for BMP photo compliance analysis.
 *
 * Mirrors the prompt and parsing convention from `src/app/api/analyze/route.ts`
 * but extends the user message to include an image content block so Claude
 * actually looks at the captured photo.
 *
 * Falls back to a deterministic seeded mock when `ANTHROPIC_API_KEY` is not
 * set so the demo and CI runs work without consuming API credits.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { CheckpointStatus } from '@/types/checkpoint';

const VISION_MODEL = 'claude-sonnet-4-20250514';
const MOCK_MODEL = 'mock-deterministic';

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export interface AnalyzeBmpPhotoInput {
  photoUrl: string;
  checkpointId: string;
  checkpointName: string;
  bmpCategory: string;
  cgpSection: string;
  currentStatus: CheckpointStatus;
  /** Optional one-line hint from a QSP, prepended to the user prompt. */
  hint?: string;
}

export interface AnalyzeBmpPhotoResult {
  summary: string;
  status: CheckpointStatus;
  confidence: number;
  details: string[];
  cgpReference: string;
  recommendations: string[];
  model: string;
  rawResponse: unknown;
}

const SYSTEM_PROMPT = `You are an expert CGP 2022 (Construction General Permit) stormwater compliance analyst for construction sites in California. You analyze BMP (Best Management Practice) checkpoint photos and provide structured compliance assessments.

You will be shown a photograph of a BMP installation along with metadata about the checkpoint. Look at the photo carefully and assess whether the BMP is properly installed, maintained, and functioning.

Always respond with valid JSON matching this exact structure:
{
  "summary": "2-3 sentence analysis grounded in what you see in the photo",
  "status": "compliant" | "deficient" | "needs-review",
  "confidence": <number 0-100>,
  "details": ["observation 1", "observation 2", "observation 3"],
  "cgpReference": "Relevant CGP 2022 section reference and explanation",
  "recommendations": ["recommendation 1", "recommendation 2"]
}

Be specific and technical. Reference actual CGP 2022 sections. Ground every observation in what is visible in the photo.`;

/**
 * Analyze a single BMP photo with Claude vision. Throws on failure so the
 * caller can decide whether to fall back to the deterministic mock.
 */
export async function analyzeBmpPhoto(
  input: AnalyzeBmpPhotoInput
): Promise<AnalyzeBmpPhotoResult> {
  if (!anthropic) {
    return mockAnalyzeBmpPhoto(input);
  }

  const userText = `${input.hint ? `QSP hint: ${input.hint}\n\n` : ''}Analyze this BMP checkpoint photo for CGP 2022 compliance:

Checkpoint ID: ${input.checkpointId}
Name: ${input.checkpointName}
BMP Category: ${input.bmpCategory}
Current Status: ${input.currentStatus}
CGP Section: ${input.cgpSection}

Provide a detailed compliance analysis as JSON.`;

  const message = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'url',
              url: input.photoUrl,
            },
          },
          { type: 'text', text: userText },
        ],
      },
    ],
  });

  const textContent = message.content.find((b) => b.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude vision');
  }

  let parsed: Partial<AnalyzeBmpPhotoResult>;
  try {
    parsed = JSON.parse(extractJsonBlock(textContent.text));
  } catch (err) {
    throw new Error(
      `Claude vision returned non-JSON response: ${err instanceof Error ? err.message : 'parse failed'}`
    );
  }

  return {
    summary: parsed.summary ?? 'Photo analyzed by Claude vision.',
    status: (parsed.status as CheckpointStatus) ?? input.currentStatus,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 75,
    details: Array.isArray(parsed.details) ? parsed.details : [],
    cgpReference: parsed.cgpReference ?? '',
    recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    model: VISION_MODEL,
    rawResponse: textContent.text,
  };
}

/**
 * Strip markdown code fences from Claude responses (Claude sometimes wraps
 * JSON in ```json ... ```).
 */
function extractJsonBlock(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}

/**
 * Deterministic seeded mock used when ANTHROPIC_API_KEY is missing. Outputs
 * BMP-category-specific narrative so the demo still feels real without
 * consuming API credits.
 */
export function mockAnalyzeBmpPhoto(
  input: AnalyzeBmpPhotoInput
): AnalyzeBmpPhotoResult {
  const cat = input.bmpCategory.toLowerCase();
  const seed = hash(input.checkpointId + input.photoUrl);
  const compliantBias = seed % 4 === 0 ? 'deficient' : seed % 7 === 0 ? 'needs-review' : 'compliant';
  const status = (input.currentStatus === 'deficient' ? 'deficient' : compliantBias) as CheckpointStatus;
  const confidence = 70 + (seed % 25);

  const summaries: Record<string, string> = {
    'sediment control': `${input.checkpointName} silt fence appears installed along the perimeter. Geotextile is intact with minor sediment accumulation visible at the base.`,
    'erosion control': `${input.checkpointName} straw wattle is in place along the slope contour. No visible undercutting observed in the photo.`,
    'storm drain': `${input.checkpointName} inlet protection is positioned around the grate. Filter fabric appears properly secured.`,
    'stabilization': `${input.checkpointName} stabilized construction entrance shows aggregate coverage with some tracking observed at the gate.`,
    'housekeeping': `${input.checkpointName} material storage area is photographed showing covered stockpiles and labeled containers.`,
  };
  const summary = summaries[cat] ?? `${input.checkpointName} (${input.bmpCategory}) checkpoint photographed and assessed.`;

  return {
    summary,
    status,
    confidence,
    details: [
      `BMP category: ${input.bmpCategory}`,
      `Status assessment: ${status}`,
      'Photo metadata indicates normal lighting and clear sightlines',
    ],
    cgpReference: input.cgpSection || 'CGP 2022 Section X.H — BMP installation and maintenance',
    recommendations:
      status === 'compliant'
        ? ['Continue routine inspection schedule']
        : ['Schedule maintenance within 72 hours', 'Document corrective action'],
    model: MOCK_MODEL,
    rawResponse: { mock: true, seed },
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
