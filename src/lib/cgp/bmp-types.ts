/**
 * BMP category — SINGLE SOURCE OF TRUTH (DRF-01).
 *
 * These values were previously declared three times, in three different
 * shapes, and all three disagreed:
 *
 *   src/types/checkpoint.ts        11 values (6 core + 5 linear)
 *   migration 001 CHECK constraint  6 values
 *   src/lib/validations/checkpoint  z.string().max(200) — ANY string
 *
 * The Zod layer was the dangerous one: it accepted arbitrary text, so a
 * typo'd or hostile `bmpType` passed validation and only failed later at
 * the database — or, for the five linear values, failed at the database
 * while looking perfectly valid in TypeScript.
 *
 * Everything now derives from the arrays below.
 */

/**
 * The six categories the `checkpoints.bmp_type` CHECK constraint accepts
 * (migration 001). Writes MUST use one of these.
 */
export const DB_BMP_TYPES = [
  'erosion-control',
  'sediment-control',
  'tracking-control',
  'wind-erosion',
  'materials-management',
  'non-storm-water',
] as const;

/**
 * Linear-infrastructure categories. Display-only today: they have labels
 * and colors in src/lib/constants.ts, but the CHECK constraint rejects
 * them, so nothing can persist one. They are deliberately NOT accepted by
 * the write schema — a request carrying one now gets a clear 400 instead
 * of a confusing database error.
 *
 * Enabling them needs a migration widening the constraint:
 *
 *   ALTER TABLE checkpoints DROP CONSTRAINT checkpoints_bmp_type_check;
 *   ALTER TABLE checkpoints ADD CONSTRAINT checkpoints_bmp_type_check
 *     CHECK (bmp_type IN ( … all eleven … ));
 *
 * Migrations are review-gated, so that SQL is written up in
 * docs/FOLLOW_UP.md rather than added here as a file that `db:migrate`
 * would apply unreviewed.
 */
export const LINEAR_BMP_TYPES = [
  'trench-plug',
  'slope-breaker',
  'water-bar',
  'hdd-containment',
  'stream-crossing-erosion',
] as const;

/** Every category the UI may need to render a label or color for. */
export const ALL_BMP_TYPES = [...DB_BMP_TYPES, ...LINEAR_BMP_TYPES] as const;

export type DbBmpType = (typeof DB_BMP_TYPES)[number];
export type LinearBmpType = (typeof LINEAR_BMP_TYPES)[number];
export type AnyBmpType = (typeof ALL_BMP_TYPES)[number];

/** True when the value can actually be written to `checkpoints`. */
export function isPersistableBmpType(value: string): value is DbBmpType {
  return (DB_BMP_TYPES as readonly string[]).includes(value);
}
