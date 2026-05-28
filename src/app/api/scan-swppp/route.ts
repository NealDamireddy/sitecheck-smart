import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import Anthropic from '@anthropic-ai/sdk';
// Note: pdf-parse's index.js has a debug branch (`if (!module.parent)`)
// that reads a bundled test PDF when run directly via node. When
// imported as a module from Next.js, module.parent is defined, so the
// branch is skipped — safe to import from the package root.
import pdfParse from 'pdf-parse';

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

// Vercel serverless functions time out at 10s on Hobby and 60s on Pro;
// large SWPPPs take ~5–15s to parse plus another ~10–30s for Claude.
// Bumping to 60s covers Pro deploys cleanly.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
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
    console.log(
      `[scan-swppp] received "${file.name}" — ${fileSizeMb.toFixed(1)}MB, ${file.type}`
    );

    // Extract text locally with pdf-parse. This avoids Anthropic's PDF
    // limits entirely — we never send the binary document to Claude, just
    // the extracted text as a regular text message block.
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parseStart = Date.now();
    const parsed = await pdfParse(buffer);
    const parseMs = Date.now() - parseStart;
    const text = (parsed.text || '').trim();

    console.log(
      `[scan-swppp] extracted ${parsed.numpages} pages, ${(text.length / 1024).toFixed(1)}KB of text in ${parseMs}ms`
    );

    if (text.length < 50) {
      return NextResponse.json(
        {
          error:
            'Could not extract text from this PDF. It looks like a scanned/image-only document that would need OCR before analysis.',
        },
        { status: 400 }
      );
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
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

COORDINATE HANDLING:
- If the document contains explicit GPS coordinates, use them.
- If the document only describes relative positions (e.g., "north perimeter", "southwest outfall"), generate plausible coordinates within the site boundary:
  - Latitude: 36.7780 to 36.7825
  - Longitude: -119.4192 to -119.4140
  - North zone: lat ~36.7818-36.7825
  - South zone: lat ~36.7780-36.7788
  - East zone: lng ~-119.4140 to -119.4155
  - West zone: lng ~-119.4180 to -119.4192
  - Central zone: lat ~36.7795-36.7810, lng ~-119.4155 to -119.4170
  - Spread checkpoints within each zone so they don't overlap.

Also extract site-level information:
- projectName: The project name from the document
- address: Site address or location description
- totalAcres: Disturbed area in acres (estimate if not stated)
- riskLevel: CGP risk level if mentioned (default to "Level 2" if not found)
- centerLat: 36.7801 (site center)
- centerLng: -119.4161 (site center)

If the document is not a SWPPP or doesn't contain BMP information, still try to extract any construction site management details and generate reasonable BMP checkpoints based on the project type and size.

Respond ONLY with valid JSON (no markdown code fences, no commentary) matching this structure:
{
  "siteInfo": { "projectName": "", "address": "", "totalAcres": 0, "riskLevel": "", "centerLat": 36.7801, "centerLng": -119.4161 },
  "checkpoints": [
    { "id": "", "name": "", "bmpType": "", "description": "", "cgpSection": "", "zone": "", "lat": 0, "lng": 0 }
  ]
}`,
      messages: [
        {
          role: 'user',
          content: `Extract all BMP checkpoint locations from the following SWPPP document text. Return structured JSON with site info and all checkpoints.

--- SWPPP DOCUMENT TEXT START ---
${text}
--- SWPPP DOCUMENT TEXT END ---`,
        },
      ],
    });

    // Extract text content
    const textContent = message.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // Parse JSON from response - try direct parse first, then extract from markdown
    let result;
    try {
      result = JSON.parse(textContent.text);
    } catch {
      // Try extracting JSON from markdown code block
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse JSON from Claude response');
      }
    }

    // Validate response shape
    if (!result.siteInfo || !Array.isArray(result.checkpoints)) {
      throw new Error('Invalid response structure from Claude');
    }

    return NextResponse.json(result);
  } catch (error: unknown) {
    // Anthropic SDK errors carry a `status`; log it explicitly so any
    // upstream failure is obvious.
    const anthropicStatus = (error as { status?: number })?.status;
    console.error('SWPPP scan error:', anthropicStatus ?? '', error);
    const errorMessage = error instanceof Error ? error.message : 'Scan failed';
    return NextResponse.json({ error: errorMessage }, { status: anthropicStatus ?? 500 });
  }
}
