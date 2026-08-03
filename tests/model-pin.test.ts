/**
 * The model pin must be declared in exactly one place per package, and the
 * two packages must agree.
 *
 * This exists because the pinned model was hardcoded in six files. When it
 * was retired, every AI feature failed with
 *
 *   404 {"type":"not_found_error","message":"model: claude-sonnet-4-20250514"}
 *
 * and nothing in the build noticed that five of the six copies were still
 * wrong. Same pattern as tests/schema-drift.test.ts for bmp_type (DRF-01).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AI_MAX_TOKENS, AI_MODEL, extractJsonBlock } from '@/lib/ai-model';

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/** Every file under src/ that talks to Anthropic. */
const APP_CALL_SITES = [
  'src/lib/ai-vision.ts',
  'src/app/api/analyze/route.ts',
  'src/app/api/scan-swppp/route.ts',
];

describe('model pin: single source of truth', () => {
  it('names a current model, with no date suffix', () => {
    // Date-suffixed IDs are what rotted last time. Current aliases carry none.
    expect(AI_MODEL).not.toMatch(/-\d{8}$/);
    expect(AI_MODEL).toMatch(/^claude-[a-z0-9-]+$/);
  });

  it('the retired model appears in no source file', () => {
    for (const f of [...APP_CALL_SITES, 'smarts-automation/src/vision/llm.ts']) {
      expect(read(f), `${f} still pins a retired model`).not.toContain(
        'claude-sonnet-4-20250514'
      );
    }
  });

  it('no call site hardcodes a model string — all import AI_MODEL', () => {
    for (const f of APP_CALL_SITES) {
      const src = read(f);
      // A literal 'claude-…' anywhere in a call site means a new copy of the
      // pin was introduced instead of importing the constant.
      expect(src.match(/['"`]claude-[a-z0-9.-]+['"`]/), `${f} hardcodes a model`).toBeNull();
      expect(src).toContain("from '@/lib/ai-model'");
    }
  });

  it('the bot copy matches AI_MODEL exactly', () => {
    const bot = read('smarts-automation/src/vision/llm.ts');
    const match = bot.match(/VISION_MODEL\s*=\s*["']([^"']+)["']/);
    expect(match, 'could not find VISION_MODEL in the bot').not.toBeNull();
    expect(match![1]).toBe(AI_MODEL);
  });
});

describe('output budgets leave room for thinking', () => {
  // From Opus 5 onward thinking is on by default and max_tokens caps
  // thinking + response text together. The old 1024 truncated mid-JSON.
  it('every budget clears the pre-migration 1024', () => {
    for (const [name, budget] of Object.entries(AI_MAX_TOKENS)) {
      expect(budget, `${name} has no thinking headroom`).toBeGreaterThan(1024);
    }
  });

  it('extraction gets more headroom than single-item analysis', () => {
    // A real SWPPP emits dozens of checkpoint objects.
    expect(AI_MAX_TOKENS.extraction).toBeGreaterThan(AI_MAX_TOKENS.analysis);
  });

  it('no call site passes a bare numeric max_tokens', () => {
    for (const f of APP_CALL_SITES) {
      expect(read(f), `${f} hardcodes max_tokens`).not.toMatch(/max_tokens:\s*\d/);
    }
  });
});

describe('no 4.6+ breaking parameters', () => {
  const forbidden = [
    // 400 on Opus 5 / Fable 5 / Sonnet 5 / 4.8 / 4.7.
    { pattern: /^\s*temperature:/m, why: 'temperature is rejected with a 400' },
    { pattern: /^\s*top_p:/m, why: 'top_p is rejected with a 400' },
    { pattern: /^\s*top_k:/m, why: 'top_k is rejected with a 400' },
    { pattern: /budget_tokens/, why: 'budget_tokens is rejected; use effort' },
  ];

  for (const f of APP_CALL_SITES) {
    for (const { pattern, why } of forbidden) {
      it(`${f}: ${why}`, () => {
        expect(read(f)).not.toMatch(pattern);
      });
    }
  }

  it('no call site prefills the assistant turn', () => {
    // scan-swppp prefilled `{` to force JSON; that is a 400 from 4.6 on.
    for (const f of APP_CALL_SITES) {
      expect(read(f), `${f} appears to prefill an assistant turn`).not.toMatch(
        /role:\s*['"]assistant['"]/
      );
    }
  });
});

describe('responses are read in a thinking-safe way', () => {
  it('call sites find the text block rather than indexing content[0]', () => {
    // With thinking on, content[0] is a thinking block, not the answer.
    for (const f of APP_CALL_SITES) {
      const src = read(f);
      expect(src, `${f} indexes content[0]`).not.toMatch(/\.content\[0\]/);
      expect(src, `${f} does not search for a text block`).toMatch(
        /content\.find\(/
      );
    }
  });
});

describe('fenced JSON is handled on the happy path', () => {
  // Verified against the live API: Opus 5 wraps its JSON in ```json … ```
  // even when told not to. The mocked suite could not catch this because the
  // mocks returned bare JSON, so /api/analyze 502'd on every real request.
  const payload = '{"summary":"ok","status":"compliant","confidence":90}';

  it('strips a ```json fence', () => {
    expect(extractJsonBlock('```json\n' + payload + '\n```')).toBe(payload);
  });

  it('strips a bare ``` fence', () => {
    expect(extractJsonBlock('```\n' + payload + '\n```')).toBe(payload);
  });

  it('leaves bare JSON untouched', () => {
    expect(extractJsonBlock(payload)).toBe(payload);
    expect(extractJsonBlock('  ' + payload + '\n')).toBe(payload);
  });

  it('the output of each form actually parses', () => {
    for (const raw of ['```json\n' + payload + '\n```', '```\n' + payload + '\n```', payload]) {
      expect(() => JSON.parse(extractJsonBlock(raw))).not.toThrow();
    }
  });

  it('every JSON-parsing call site routes through extractJsonBlock', () => {
    // A bare JSON.parse on the raw text is the regression this guards.
    for (const f of APP_CALL_SITES) {
      const src = read(f);
      expect(src, `${f} does not use extractJsonBlock`).toContain('extractJsonBlock');
      expect(src, `${f} still bare-parses the model text`).not.toMatch(
        /JSON\.parse\(\s*(textContent|responseText)\.text\s*\)/
      );
    }
  });
});

describe('prompt length limits stay inside the schema caps', () => {
  /**
   * The vision prompt used to ask for a "section reference and explanation"
   * for cgpReference. Sonnet 4 stayed terse; Opus 5 follows instructions more
   * literally and wrote an essay, so every real photo analysis failed Zod
   * with `cgpReference: Too big` — surfacing to the QSP as "analysis failed,
   * nothing was saved". Verified against the live API.
   *
   * The caps are a SEC-07 defense against prompt-injected oversized strings
   * and must NOT be raised to accommodate a chatty model. Instead the prompt
   * declares tighter limits, and this test fails if the two ever cross.
   */
  const prompt = read('src/lib/ai-vision.ts');
  const schema = read('src/lib/validations/ai-output.ts');

  /** Pull `max(N)` for a named field out of the Zod schema. */
  function schemaCap(field: string): number {
    const m = schema.match(new RegExp(`${field}:\\s*z\\.string\\(\\)[^,]*?\\.max\\((\\d[\\d_]*)\\)`));
    if (!m) throw new Error(`no max() found for ${field}`);
    return Number(m[1].replace(/_/g, ''));
  }

  /** Pull the character limit the prompt states for a field. */
  function promptLimit(field: string): number {
    const m = prompt.match(new RegExp(`"${field}"[^\\n]*?under (\\d[\\d,]*) characters`));
    if (!m) throw new Error(`prompt states no character limit for ${field}`);
    return Number(m[1].replace(/,/g, ''));
  }

  it('the prompt states a limit for cgpReference and summary', () => {
    expect(() => promptLimit('cgpReference')).not.toThrow();
    expect(() => promptLimit('summary')).not.toThrow();
  });

  for (const field of ['cgpReference', 'summary']) {
    it(`${field}: prompt limit is below the schema cap`, () => {
      expect(promptLimit(field)).toBeLessThan(schemaCap(field));
    });
  }

  it('the prompt no longer requests an explanation in cgpReference', () => {
    // This exact wording is what produced the oversized field.
    expect(prompt).not.toMatch(/cgpReference"?:\s*"[^"]*explanation/i);
  });

  it('the prompt warns that over-long fields are rejected', () => {
    expect(prompt).toMatch(/rejected|limits/i);
  });
});
