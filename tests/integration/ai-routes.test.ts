/**
 * AI route integration: happy path, malformed model output, and
 * upstream failure. Anthropic is mocked at the module boundary — no
 * test in this repo may call a paid API.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeSupabase, type FakeSupabase } from '../support/fake-supabase';

let fake: FakeSupabase;
let messageResponse: unknown;
let messageError: Error | null = null;

const createMessage = vi.fn(async () => {
  if (messageError) throw messageError;
  return messageResponse;
});

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: createMessage };
  },
}));

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireAuth: (...a: unknown[]) => requireAuth(...a),
}));
vi.mock('@/lib/supabase/server', () => ({
  createAuthClient: async () => fake.client,
  createAdminClient: () => fake.client,
}));

/** Shape Anthropic returns: content blocks with a text block. */
function textResponse(text: string) {
  return { content: [{ type: 'text', text }] };
}

const VALID_ANALYSIS = {
  summary: 'Silt fence intact along the north perimeter.',
  confidence: 88,
  details: ['Fabric taut', 'No undermining'],
  cgpReference: 'CGP 2022 § XV.A (SE-10)',
  recommendations: [],
};

beforeEach(() => {
  fake = makeFakeSupabase();
  messageError = null;
  vi.clearAllMocks();
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  requireAuth.mockResolvedValue({ user: { id: 'user-a' }, supabase: fake.client });
});

async function postAnalyze() {
  const { POST } = await import('@/app/api/analyze/route');
  return POST(
    new NextRequest('http://localhost:3000/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkpointId: 'cp-1',
        checkpointName: 'Silt Fence North',
        bmpCategory: 'sediment-control',
        status: 'needs-review',
        description: 'Silt fence along the north property line',
        cgpSection: 'X.H.1',
      }),
    })
  );
}

describe('POST /api/analyze', () => {
  it('happy path returns the validated analysis and preserves the caller status', async () => {
    messageResponse = textResponse(JSON.stringify(VALID_ANALYSIS));
    const res = await postAnalyze();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBe(VALID_ANALYSIS.summary);
    expect(body.confidence).toBe(88);
    expect(body.status).toBe('needs-review');
  });

  it('malformed body → 400 before Anthropic is called', async () => {
    const { POST } = await import('@/app/api/analyze/route');
    const res = await POST(
      new NextRequest('http://localhost:3000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checkpointId: 'cp-1' }), // missing required fields
      })
    );
    expect(res.status).toBe(400);
    expect(createMessage).not.toHaveBeenCalled();
  });

  it('prose preamble around the JSON → 502, nothing fabricated', async () => {
    messageResponse = textResponse(
      `Here is the analysis you asked for:\n${JSON.stringify(VALID_ANALYSIS)}`
    );
    const res = await postAnalyze();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/unreadable|invalid/i);
    expect(body).not.toHaveProperty('summary');
  });

  it('truncated JSON → 502', async () => {
    messageResponse = textResponse('{"summary":"Silt fence inta');
    expect((await postAnalyze()).status).toBe(502);
  });

  it('markdown-fenced JSON → 502 (this route requests raw JSON)', async () => {
    messageResponse = textResponse(
      '```json\n' + JSON.stringify(VALID_ANALYSIS) + '\n```'
    );
    expect((await postAnalyze()).status).toBe(502);
  });

  it('schema-valid JSON with an out-of-range confidence → 502', async () => {
    messageResponse = textResponse(
      JSON.stringify({ ...VALID_ANALYSIS, confidence: 900 })
    );
    expect((await postAnalyze()).status).toBe(502);
  });

  it('injected oversized summary → 502', async () => {
    messageResponse = textResponse(
      JSON.stringify({ ...VALID_ANALYSIS, summary: 'x'.repeat(5000) })
    );
    expect((await postAnalyze()).status).toBe(502);
  });

  it('Anthropic 500 → 500, degrades without crashing', async () => {
    messageError = new Error('Anthropic upstream failure');
    const res = await postAnalyze();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    // SEC-09: the upstream message must not be echoed verbatim.
    expect(JSON.stringify(body)).not.toContain('Anthropic upstream failure');
  });

  it('rate limit returns 429 with Retry-After once the window is spent', async () => {
    messageResponse = textResponse(JSON.stringify(VALID_ANALYSIS));
    // The limiter allows 20/min per user; drain it.
    let last: Response | undefined;
    for (let i = 0; i < 25; i++) last = await postAnalyze();
    expect(last!.status).toBe(429);
    expect(last!.headers.get('Retry-After')).toBeTruthy();
  });
});
