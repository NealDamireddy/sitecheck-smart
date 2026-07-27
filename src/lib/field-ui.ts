/**
 * Sizing for controls a QSP operates in the field (UX-01).
 *
 * The primary user is standing on a construction site, on a phone, in
 * sunlight, wearing gloves. WCAG 2.2 (2.5.8, Target Size Minimum) sets
 * 24×24 CSS px as the floor; Apple's HIG and Material both recommend
 * 44×44 for finger targets, and gloves make the effective contact area
 * larger and less precise still. 44px is the number this product uses.
 *
 * These constants exist so the field controls can't silently drift back
 * to desktop-sized paddings — tests/field-ui.test.ts asserts every
 * interactive control in the walkthrough components carries one of them.
 */

/** Minimum touch target for anything tapped in the field, in CSS px. */
export const MIN_TOUCH_TARGET_PX = 44;

/**
 * Primary field action (Mark Compliant / Deficient / Needs Review,
 * capture photo). `min-h-11` is 44px in Tailwind's 4px scale.
 */
export const FIELD_ACTION_CLASS =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50';

/**
 * Secondary field control — still finger-operated, lower frequency
 * (toggles, filter chips). Same 44px floor, lighter visual weight.
 */
export const FIELD_SECONDARY_CLASS =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm transition-colors disabled:opacity-50';

/** Icon-only field control — square, 44×44. */
export const FIELD_ICON_CLASS =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border transition-colors disabled:opacity-50';
