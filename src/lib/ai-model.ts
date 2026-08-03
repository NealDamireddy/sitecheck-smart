/**
 * Anthropic model pin — SINGLE SOURCE OF TRUTH.
 *
 * Same defect class as DRF-01 (see src/lib/cgp/bmp-types.ts): this string was
 * declared independently in four places under src/ plus a fifth in the bot and
 * a sixth as a migration column DEFAULT. When the pinned model was retired,
 * every AI feature returned
 *
 *   404 {"type":"not_found_error","message":"model: claude-sonnet-4-20250514"}
 *
 * and the fix had to be applied in six files that nothing kept in agreement.
 * Everything under src/ now imports from here. The bot keeps its own copy
 * (separate package, separate tsconfig — it cannot import `@/lib`), and
 * tests/model-pin.test.ts fails the build if the two drift apart.
 *
 * Pinned deliberately, never floating: a model swap changes the wording of
 * text that lands in a regulator-submitted report, so it is a reviewed change.
 *
 * ── Upgrade notes, learned the hard way on this migration ──────────────────
 *
 * Moving off a pre-4.6 model is NOT just this string. Three things break:
 *
 *  1. Assistant-turn prefills return 400 on every 4.6+ model. scan-swppp
 *     prefilled `{` to force JSON; that is now a system-prompt instruction.
 *  2. Thinking is ON BY DEFAULT on Opus 5, and `max_tokens` caps thinking
 *     PLUS response text. Budgets sized tightly around the answer (these
 *     routes used 1024) truncate mid-JSON. Hence the headroom below.
 *  3. `temperature` / `top_p` / `top_k` are rejected with a 400. We never
 *     set them, so nothing to remove — do not add them.
 *
 * Read the response with `content.find(b => b.type === 'text')`, never
 * `content[0]`: with thinking on, index 0 is a thinking block. All four call
 * sites already did this, which is the only reason parsing survived.
 */

/** The model every AI feature under src/ uses. */
export const AI_MODEL = 'claude-opus-5';

/**
 * Output budget for the JSON-returning calls.
 *
 * Must cover thinking + the JSON, not just the JSON (see note 2 above).
 * The SWPPP extractor gets more because it emits one object per BMP and a
 * real SWPPP carries dozens.
 */
export const AI_MAX_TOKENS = {
  /** Single-checkpoint analysis and photo vision. */
  analysis: 8192,
  /** Whole-document SWPPP extraction — output scales with BMP count. */
  extraction: 16384,
} as const;

/**
 * Strip a markdown code fence from a model reply before `JSON.parse`.
 *
 * Verified against the live API, not assumed: Opus 5 wraps its JSON in
 * ```json … ``` even when the system prompt says "no markdown code fences".
 * `/api/analyze` previously called `JSON.parse` on the raw text and returned
 * a 502 on every request because of it — a failure the test suite could not
 * see, because Anthropic is mocked at the module boundary and the mocks
 * returned bare JSON.
 *
 * Returns the trimmed input unchanged when there is no fence, so a bare-JSON
 * reply still works.
 */
export function extractJsonBlock(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return trimmed;
}
