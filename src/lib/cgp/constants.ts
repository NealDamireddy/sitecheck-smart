/**
 * CGP 2022 regulatory constants — SINGLE SOURCE OF TRUTH.
 *
 * Every compliance threshold in the app must import from this module
 * (or from `src/lib/smarts/nal-thresholds.ts`, which re-exports the NAL
 * values below for its existing consumers). Do not redeclare these
 * numbers anywhere else: a stray literal that drifts from the permit is
 * a filing error, not a style problem.
 *
 * Source of authority: California Construction General Permit,
 * Order WQ 2022-0057-DWQ (effective Sept 1, 2023). Citations below name
 * the governing concept; verify section numbers against the adopted
 * order text before quoting them in customer-facing material.
 */

// ──────────────────────────────────────────────────────────────────────
// Qualifying Precipitation Event (QPE)
// CGP 2022, Appendix 1 (Glossary): a precipitation event that produces
// ≥ 0.5 inches of rainfall, separated from the previous qualifying
// event by at least 48 hours of no precipitation.
// ──────────────────────────────────────────────────────────────────────

/** Minimum rainfall, in inches, for an event to qualify. */
export const QPE_THRESHOLD_INCHES = 0.5;

/**
 * Minimum dry gap, in hours, separating two distinct precipitation
 * events. Rain that resumes inside this window is the SAME event.
 */
export const QPE_SEPARATION_HOURS = 48;

/**
 * Hourly rainfall at or below this is treated as gauge noise / trace
 * and does not extend a wet run. NWS convention reports "trace" as
 * < 0.01 in.
 */
export const TRACE_PRECIP_INCHES = 0.005;

// ──────────────────────────────────────────────────────────────────────
// Inspection timing
// CGP 2022, Attachment C/D (monitoring requirements by risk level).
// ──────────────────────────────────────────────────────────────────────

/** Routine site inspections: at least once per this many days. */
export const ROUTINE_INSPECTION_INTERVAL_DAYS = 7;

/**
 * Post-storm inspection window, in hours, after a qualifying event
 * ends — Risk Level 1.
 */
export const POST_STORM_WINDOW_HOURS = 48;

/** Post-storm inspection window for Risk Level 2 and 3 sites. */
export const POST_STORM_WINDOW_HOURS_RL2_3 = 24;

export function postStormWindowHours(riskLevel: 1 | 2 | 3): number {
  return riskLevel === 1 ? POST_STORM_WINDOW_HOURS : POST_STORM_WINDOW_HOURS_RL2_3;
}

/**
 * Pre-storm inspections must occur within this many hours before a
 * forecast qualifying event.
 */
export const PRE_STORM_WINDOW_HOURS = 24;

// ──────────────────────────────────────────────────────────────────────
// Corrective action
// CGP 2022, Section on corrective actions/BMP maintenance: repairs of
// identified BMP deficiencies must BEGIN within 72 hours of
// identification and be completed as soon as possible.
// ──────────────────────────────────────────────────────────────────────

/** Hours after identification by which a BMP repair must begin. */
export const REPAIR_START_HOURS = 72;

// ──────────────────────────────────────────────────────────────────────
// Numeric Action Levels (NAL)
// CGP 2022, Section on Numeric Action Levels: pH NAL is exceeded when
// a sample is BELOW 6.0 or ABOVE 9.0 SU (6.0 and 9.0 exactly are
// compliant). Turbidity NAL is exceeded ABOVE 250 NTU (250 exactly is
// compliant).
// ──────────────────────────────────────────────────────────────────────

export const NAL_PH_MIN_SU = 6.0;
export const NAL_PH_MAX_SU = 9.0;
export const NAL_TURBIDITY_NTU = 250;

// ──────────────────────────────────────────────────────────────────────
// Forecast heuristics (product decisions, not permit text)
// ──────────────────────────────────────────────────────────────────────

/**
 * Probability-of-precipitation at/above which the app treats a coming
 * storm as "likely" for pre-storm workflow nudges. This is a product
 * threshold for anticipating weather — the QPE determination itself is
 * NEVER made from probabilities, only from quantitative precipitation
 * (forecast QPF for anticipation, observed gauge data for the record).
 */
export const PRE_STORM_POP_THRESHOLD = 70;

/** Days ahead the pre-storm detector scans the forecast. */
export const PRE_STORM_LEAD_DAYS = 3;
