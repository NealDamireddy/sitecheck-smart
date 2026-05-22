/**
 * Canonical BMP inspection checklist for California CGP 2022 sites.
 *
 * Mirrors the "Part 2: BMP Observations" table that appears verbatim
 * on every regulator-submitted QSP inspection report. The 22 questions
 * for Risk Level 2 are grouped into 8 numbered categories and are the
 * minimum BMPs the state requires the QSP to check on every weekly /
 * monthly / pre-storm / during-storm / post-storm visit.
 *
 * IDs are stable so a future migration can persist per-question answers
 * (Yes / No / Recommended on <date> / Action taken on <date>) in the
 * database without rewriting historical inspections.
 *
 * Levels 1 and 3 share the structure but currently re-use the Level 2
 * checklist — future work is to fill in the level-specific question
 * variants. The helper `getBmpCategoriesForRiskLevel` is the only
 * supported way to read this so the future split is a one-line change.
 */

export type CgpRiskLevel = 1 | 2 | 3;

export interface BmpQuestion {
  /** Stable ID for storing answers in the DB. */
  id: string;
  /** Question text shown to the QSP and printed in the report. */
  prompt: string;
}

export interface BmpCategory {
  /** Sequential number shown in the report (1-8). */
  number: number;
  /** Category title, e.g. "Good Housekeeping for Construction Materials". */
  title: string;
  questions: BmpQuestion[];
}

/**
 * Yes/No site observation block from "Part 1: General Information".
 * Order matches the regulator-submitted report layout exactly.
 */
export const SITE_OBSERVATION_CHECKS = [
  { id: 'precipitation', label: 'Presence of Precipitation?' },
  { id: 'discolorations', label: 'Presence of Discolorations?' },
  { id: 'odors', label: 'Presence of Odors?' },
  { id: 'turbidity', label: 'Presence of Turbidity?' },
  { id: 'sheen', label: 'Presence of Sheen?' },
  { id: 'floating_material', label: 'Presence of Floating Material?' },
  { id: 'suspended_material', label: 'Presence of Suspended Material?' },
] as const;

export type SiteObservationId = (typeof SITE_OBSERVATION_CHECKS)[number]['id'];

const RISK_LEVEL_2_BMP_CATEGORIES: BmpCategory[] = [
  {
    number: 1,
    title: 'Good Housekeeping for Construction Materials',
    questions: [
      {
        id: 'gh-cm-1',
        prompt:
          'Are stockpiled construction materials not actively in use (not scheduled to be disturbed for 14 days) covered or bermed?',
      },
      {
        id: 'gh-cm-2',
        prompt:
          'Are all chemicals stored in watertight containers with appropriate secondary containment, or in a completely enclosed storage shed?',
      },
    ],
  },
  {
    number: 2,
    title: 'Good Housekeeping for Waste Management',
    questions: [
      {
        id: 'gh-wm-1',
        prompt:
          'Are concrete wash/rinse water and materials prevented from being disposed into the storm drain system?',
      },
      {
        id: 'gh-wm-2',
        prompt:
          'Are portable toilets & handwash stations equipped with secondary containment to prevent discharges of waste?',
      },
      {
        id: 'gh-wm-3',
        prompt:
          'Is equipment in place to cover waste disposal containers at the end of the business day?',
      },
      {
        id: 'gh-wm-4',
        prompt:
          'Is the site free from litter/rubbish/debris from food and construction waste materials?',
      },
      {
        id: 'gh-wm-5',
        prompt:
          'Is equipment and materials in place for cleanup of hazardous and non-hazardous spills on-site?',
      },
      {
        id: 'gh-wm-6',
        prompt:
          'Are washout areas (i.e. concrete) contained appropriately to prevent discharge or infiltration into underlying soil?',
      },
    ],
  },
  {
    number: 3,
    title: 'Good Housekeeping for Vehicle Storage and Maintenance',
    questions: [
      {
        id: 'gh-vs-1',
        prompt:
          'Are measures in place to prevent oil, grease, or fuel from leaking into the ground, storm drains or surface waters?',
      },
      {
        id: 'gh-vs-2',
        prompt:
          'Is all equipment or vehicles fueled, maintained, and stored in a designated area with appropriate BMPs?',
      },
      {
        id: 'gh-vs-3',
        prompt:
          'Are vehicle and equipment leaks cleaned immediately and disposed of properly?',
      },
    ],
  },
  {
    number: 4,
    title: 'Good Housekeeping for Landscape Materials',
    questions: [
      {
        id: 'gh-lm-1',
        prompt:
          'Are stockpiled landscape materials such mulches and topsoil contained and covered when not actively in use?',
      },
      {
        id: 'gh-lm-2',
        prompt:
          'Are bagged erodible landscape materials stored on pallets and covered?',
      },
    ],
  },
  {
    number: 5,
    title: 'Non-Stormwater Management',
    questions: [
      {
        id: 'nsw-1',
        prompt: 'Are Non-stormwater discharges properly controlled?',
      },
      {
        id: 'nsw-2',
        prompt:
          'Are vehicles washed in a manner to prevent non-stormwater discharges to surface waters or storm drainage systems?',
      },
      {
        id: 'nsw-3',
        prompt:
          'Are streets cleaned in a manner to prevent unauthorized non-stormwater discharges to surface waters or storm drainage systems?',
      },
    ],
  },
  {
    number: 6,
    title: 'Erosion Controls',
    questions: [
      {
        id: 'ec-1',
        prompt: 'Are wind erosion controls effectively implemented?',
      },
      {
        id: 'ec-2',
        prompt:
          'Is effective soil cover provided for disturbed inactive areas (not scheduled to be disturbed for 14 days) as well as finished slopes, open space, utility backfill, and completed lots?',
      },
    ],
  },
  {
    number: 7,
    title: 'Sediment Controls',
    questions: [
      {
        id: 'sc-1',
        prompt:
          'Are perimeter and slope controls established and effective at controlling erosion and sediment discharges from the site?',
      },
      {
        id: 'sc-2',
        prompt:
          'Are entrances and exits stabilized to control erosion and sediment discharges from the site?',
      },
      {
        id: 'sc-3',
        prompt: "Are all storm drain inlets BMP's maintained and protected?",
      },
    ],
  },
  {
    number: 8,
    title: 'Run-On and Run-Off Controls',
    questions: [
      {
        id: 'ror-1',
        prompt:
          'Is run-on to the site effectively managed and directed away from all disturbed areas?',
      },
    ],
  },
];

/**
 * The state-mandated minimum BMP checklist for a given Risk Level.
 *
 * Levels 1 and 3 currently re-use the Risk Level 2 question set. The
 * regulator-issued forms for those levels differ slightly (Level 3 adds
 * effluent monitoring prompts; Level 1 omits a couple of housekeeping
 * questions) — those variants will be plugged in when this app starts
 * onboarding sites at those risk levels.
 */
export function getBmpCategoriesForRiskLevel(
  riskLevel: CgpRiskLevel
): BmpCategory[] {
  // Risk Level 2 is the only fully-populated checklist today; 1 and 3
  // fall back to it intentionally so a misconfigured project still gets
  // a usable, defensible inspection form.
  void riskLevel;
  return RISK_LEVEL_2_BMP_CATEGORIES;
}

/**
 * Flat iterator over every question for a risk level — useful when a
 * report needs to enumerate Yes/No answers without nesting categories.
 */
export function getAllBmpQuestions(riskLevel: CgpRiskLevel): BmpQuestion[] {
  return getBmpCategoriesForRiskLevel(riskLevel).flatMap((c) => c.questions);
}
