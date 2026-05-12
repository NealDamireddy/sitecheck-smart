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
      system: `You are an expert CGP 2022 (Construction General Permit) stormwater compliance analyst for construction sites in California. You analyze BMP (Best Management Practice) checkpoints and provide structured compliance assessments.

Always respond with valid JSON matching this exact structure:
{
  "summary": "2-3 sentence analysis summary",
  "confidence": <number 0-100>,
  "details": ["observation 1", "observation 2", "observation 3"],
  "cgpReference": "Relevant CGP 2022 section reference and explanation",
  "recommendations": ["recommendation 1", "recommendation 2"]
}

Be specific and technical. Reference actual CGP 2022 sections. Consider the BMP type, current status, and site conditions.`,
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

Provide a detailed compliance analysis as JSON.`,
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
