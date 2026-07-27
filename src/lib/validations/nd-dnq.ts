/**
 * ND / DNQ cross-field rules (DRF-03) — shared by the standalone
 * parameter-result schemas and the sample-embedded array.
 *
 * SMARTS Ad Hoc Monitoring contract (see the review mandate §3 and the
 * smarts-automation CGP validation):
 *
 *   qualifier '='   → a numeric result is REQUIRED.
 *   qualifier 'ND'  → result must be BLANK (non-detect has no number);
 *                     MDL (method detection limit) is REQUIRED.
 *   qualifier 'DNQ' → result is REQUIRED (detected, not quantified —
 *                     the estimated value); BOTH MDL and RL (reporting
 *                     limit) are REQUIRED.
 *
 * These rules were previously enforced only inside smarts-automation's
 * Zod, which meant the web app happily persisted combinations SMARTS
 * would reject at filing time — or worse, silently mis-file.
 */

export interface NdDnqFields {
  qualifier?: '=' | 'ND' | 'DNQ';
  result?: number | null;
  mdl?: number | null;
  rl?: number | null;
}

/** Returns the violation message, or null when the combination is valid. */
export function ndDnqViolation(fields: NdDnqFields): string | null {
  const qualifier = fields.qualifier ?? '=';
  const hasResult = fields.result != null;
  const hasMdl = fields.mdl != null;
  const hasRl = fields.rl != null;

  switch (qualifier) {
    case '=':
      if (!hasResult) {
        return "qualifier '=' requires a numeric result";
      }
      return null;
    case 'ND':
      if (hasResult) {
        return "qualifier 'ND' (non-detect) must not carry a result value — leave the result blank";
      }
      if (!hasMdl) {
        return "qualifier 'ND' requires the MDL (method detection limit)";
      }
      return null;
    case 'DNQ':
      if (!hasResult) {
        return "qualifier 'DNQ' requires the estimated result value";
      }
      if (!hasMdl || !hasRl) {
        return "qualifier 'DNQ' requires both MDL and RL";
      }
      return null;
  }
}

/**
 * Zod `.superRefine`-compatible check. Usage:
 *   schema.superRefine(refineNdDnq)
 */
export function refineNdDnq(
  fields: NdDnqFields,
  ctx: { addIssue: (issue: { code: 'custom'; message: string; path?: (string | number)[] }) => void }
): void {
  const violation = ndDnqViolation(fields);
  if (violation) {
    ctx.addIssue({ code: 'custom', message: violation, path: ['qualifier'] });
  }
}
