import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { analyzeCheckpoint } from '@/lib/validations';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const body = analyzeCheckpoint.parse(await request.json());
    const { checkpointId, checkpointName, bmpCategory, status, description, cgpSection } = body;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: `You are a Qualified SWPPP Practitioner (QSP) reviewing a Best Management Practice (BMP) checkpoint at a California construction site under the 2022 Construction General Permit (Order 2022-0057-DWQ).

Your output is written for inclusion in a regulator-submitted BMP Inspection Report. Match the tone real QSPs use on those reports:

- Terse, factual, and field-observational. No editorializing, no marketing language.
- Cite the relevant CGP 2022 BMP code (e.g. SE-10, EC-7, WM-8, NS-3, TC-1) when one applies; cite the CGP section only when relevant.
- "details" entries are direct visual observations of the BMP condition (what is there, what condition it is in, what is missing).
- "recommendations" entries are concrete, actionable field instructions tied to a specific BMP — name the material or action explicitly (e.g. "install fiber rolls along the southwest perimeter", "replace damaged sandbags at the storm drain inlet", "cover the soil stockpile prior to the next forecasted rain event"). Do not write generic advice.
- When the BMP appears compliant and effective, say so plainly in the summary and return an empty "recommendations" array.

Always respond with valid JSON matching this exact structure:
{
  "summary": "1-2 sentence factual statement of the BMP's observed condition and compliance posture",
  "confidence": <integer 0-100>,
  "details": ["observation 1", "observation 2", ...],
  "cgpReference": "Relevant CGP 2022 section or BMP code (e.g. 'CGP 2022 § XV.A — Sediment Controls (SE-10)') or empty string if none applies",
  "recommendations": ["actionable field instruction 1", ...]
}`,
      messages: [
        {
          role: 'user',
          content: `Analyze this BMP checkpoint for CGP 2022 compliance:

Checkpoint ID: ${checkpointId}
Name: ${checkpointName}
BMP Category: ${bmpCategory}
Current Status: ${status}
CGP Section: ${cgpSection}
Description: ${description}

Return the analysis as JSON.`,
        },
      ],
    });

    // Extract text content
    const textContent = message.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // Parse JSON from response
    const analysis = JSON.parse(textContent.text);

    return NextResponse.json({
      checkpointId,
      ...analysis,
      status, // preserve the original status
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Claude analysis error:', error);
    const message = error instanceof Error ? error.message : 'Analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
