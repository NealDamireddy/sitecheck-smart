import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { swpppScanLimiter, rateLimitOrNull } from '@/lib/rate-limit';
import { swpppExtractionOutput } from '@/lib/validations/ai-output';
import Anthropic from '@anthropic-ai/sdk';
// pdf-parse@1.1.1 ships a debug branch in index.js (`if (!module.parent)`)
// that synchronously reads ./test/data/05-versions-space.pdf on import.
// Next.js bundles the import in a way where `module.parent` is undefined,
// so the branch fires and crashes the route with ENOENT before our
// handler runs. Importing the implementation directly from lib/ skips
// index.js entirely and avoids the side-effect.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { log } from '@/lib/logger';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Real SWPPPs run 100–300+ pages, which blow through Anthropic's 100-
// page / 32MB PDF document limit *and* the 32MB request limit (base64
// inflates files ~33%). Instead of sending the PDF to Claude, we
// extract text server-side with pdf-parse and send only the text —
// removing both limits. Claude's 200K-token context easily fits a
// multi-hundred-page SWPPP as text.
const MAX_PDF_BYTES = 50 * 1024 * 1024;

// Cap the extracted text we send to Claude. Sonnet 4's context is ~200K
// tokens; ~3.5 chars/token gives ~700K chars. We stay well under that
// to leave headroom for the system prompt and response, and to keep
// latency predictable for very long SWPPPs.
const MAX_TEXT_CHARS = 500_000;

// Vercel serverless functions time out at 10s on Hobby and 60s on Pro;
// large SWPPPs take ~5–15s to parse plus another ~10–30s for Claude.
// Bumping to 60s covers Pro deploys cleanly.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    // SEC-10: per-user rate limit on a paid/heavy operation.
    const limited = rateLimitOrNull(swpppScanLimiter, auth.user.id, 'SWPPP scan');
    if (limited) return limited;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json({ error: 'File must be a PDF' }, { status: 400 });
    }

    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: 'File too large (max 50MB)' }, { status: 400 });
    }

    const fileSizeMb = file.size / (1024 * 1024);
    // The filename is user-supplied: it goes in context, never in the
    // message, so the sink can index it and redaction can see it.
    log.info('SWPPP upload received', {
      route: '/api/scan-swppp',
      fileName: file.name,
      sizeMb: Number(fileSizeMb.toFixed(1)),
      contentType: file.type,
    });

    // Extract text locally with pdf-parse. This avoids Anthropic's PDF
    // limits entirely — we never send the binary document to Claude, just
    // the extracted text as a regular text message block.
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parseStart = Date.now();
    let parsed;
    try {
      parsed = await pdfParse(buffer);
    } catch (parseError: unknown) {
      const msg = parseError instanceof Error ? parseError.message : String(parseError);
      log.error('[scan-swppp] pdf-parse failed', { msg });
      return NextResponse.json(
        { error: `Could not parse PDF: ${msg}` },
        { status: 400 }
      );
    }
    const parseMs = Date.now() - parseStart;
    const rawText = (parsed.text || '').trim();
    const truncated = rawText.length > MAX_TEXT_CHARS;
    const text = truncated ? rawText.slice(0, MAX_TEXT_CHARS) : rawText;

    log.info('SWPPP text extracted', {
      route: '/api/scan-swppp',
      pages: parsed.numpages,
      kbExtracted: Math.round(rawText.length / 1024),
      parseMs,
      truncated,
    });

    if (text.length < 50) {
      return NextResponse.json(
        {
          error:
            'Could not extract text from this PDF. It looks like a scanned/image-only document that would need OCR before analysis.',
        },
        { status: 400 }
      );
    }

    const claudeStart = Date.now();
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: `You are an expert SWPPP (Storm Water Pollution Prevention Plan) document analyst for construction sites in California. You analyze uploaded SWPPP documents and extract all BMP (Best Management Practice) checkpoint information.

Your task: Extract every BMP checkpoint mentioned in this SWPPP document and return structured JSON.

For each BMP checkpoint, extract:
- id: The BMP identifier (e.g., "SC-1", "EC-3", "TC-2"). Use the prefix convention: SC=Sediment Control, EC=Erosion Control, TC=Tracking Control, WE=Wind Erosion, MM=Materials Management, NS=Non-Storm Water. Number them sequentially within each category.
- name: The descriptive name (e.g., "Silt Fence - North Perimeter")
- bmpType: One of: "erosion-control", "sediment-control", "tracking-control", "wind-erosion", "materials-management", "non-storm-water"
- description: Full description of the BMP measure
- cgpSection: The CGP 2022 section reference (e.g., "Section X.H.1.a")
- zone: Which area of the site: "north", "south", "east", "west", or "central"
- lat: GPS latitude coordinate
- lng: GPS longitude coordinate

COORDINATE HANDLING (this output feeds a legal inspection record — never invent positions):
- If the document states explicit GPS coordinates for a BMP, use them exactly.
- Otherwise set "lat" and "lng" to null. Do NOT estimate, approximate, or generate coordinates under any circumstances. The app places unlocated checkpoints near the project center for the QSP to position on the site map.
- Still extract the "zone" (north/south/east/west/central) from relative descriptions like "north perimeter" when available — that is descriptive text, not a coordinate.

Also extract site-level information:
- projectName: The project name from the document
- address: Site address or location description
- totalAcres: Disturbed area in acres (estimate if not stated)
- riskLevel: CGP risk level if mentioned (default to "Level 2" if not found)
- centerLat / centerLng: the site's coordinates ONLY if explicitly stated in the document; otherwise null.

If the document is not a SWPPP or doesn't contain BMP information, still try to extract any construction site management details and generate reasonable BMP checkpoints based on the project type and size (with null coordinates).

Respond ONLY with valid JSON (no markdown code fences, no commentary) matching this structure:
{
  "siteInfo": { "projectName": "", "address": "", "totalAcres": 0, "riskLevel": "", "centerLat": null, "centerLng": null },
  "checkpoints": [
    { "id": "", "name": "", "bmpType": "", "description": "", "cgpSection": "", "zone": "", "lat": null, "lng": null }
  ]
}`,
      messages: [
        {
          role: 'user',
          content: `Extract all BMP checkpoint locations from the following SWPPP document text. Return structured JSON with site info and all checkpoints. Output ONLY the JSON object, no prose, no markdown fences.

--- SWPPP DOCUMENT TEXT START ---
${text}
--- SWPPP DOCUMENT TEXT END ---`,
        },
        // Prefill the assistant turn with `{` so Claude is forced to
        // continue with valid JSON instead of any preamble or fences.
        // We re-prepend the `{` to the response below before parsing.
        {
          role: 'assistant',
          content: '{',
        },
      ],
    });

    const claudeMs = Date.now() - claudeStart;

    // Extract text content
    const textContent = message.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      log.error('[scan-swppp] no text block in Claude response', { message });
      throw new Error('No text response from Claude');
    }

    // Re-attach the prefilled `{` and try to parse. Fall back to
    // scanning for the largest JSON object if Claude wandered.
    const responseText = '{' + textContent.text;
    let result: { siteInfo?: unknown; checkpoints?: unknown };
    try {
      result = JSON.parse(responseText);
    } catch {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (parseErr) {
          log.error('[scan-swppp] could not parse Claude JSON. Response was', { detail: responseText.slice(0, 500) });
          throw new Error(
            `Could not parse JSON from Claude response: ${parseErr instanceof Error ? parseErr.message : 'unknown'}`
          );
        }
      } else {
        log.error('[scan-swppp] no JSON object found in Claude response. Response was', { detail: responseText.slice(0, 500) });
        throw new Error('Could not parse JSON from Claude response');
      }
    }

    // Validate the full model output shape (SEC-07). A prompt-injected
    // SWPPP can shape the response — anything outside the contract halts
    // here instead of flowing into checkpoint creation.
    const validated = swpppExtractionOutput.safeParse(result);
    if (!validated.success) {
      log.error('[scan-swppp] Claude output failed validation', { detail: validated.error.issues });
      throw new Error('Invalid response structure from Claude');
    }

    log.info(`[scan-swppp] done — ${validated.data.checkpoints.length} checkpoints, claude=${claudeMs}ms`);

    return NextResponse.json(validated.data);
  } catch (error: unknown) {
    // Anthropic SDK errors carry a `status`; log it explicitly so any
    // upstream failure is obvious.
    const anthropicStatus = (error as { status?: number })?.status;
    log.error('SWPPP scan error', { detail: anthropicStatus ?? '', error });
    // SEC-09: never echo internal error text to the client. The status
    // code still distinguishes an upstream AI failure from a local one.
    return NextResponse.json(
      { error: 'SWPPP scan failed. Try again in a moment.' },
      { status: anthropicStatus ?? 500 }
    );
  }
}
