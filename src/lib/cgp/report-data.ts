/**
 * Structured data shapes that drive the table-based inspection report.
 *
 * `/api/reports/generate` attaches one of these payloads to each section
 * via `ReportSection.data` so both the in-app preview and the PDF
 * renderer can lay out proper tables instead of free-form markdown.
 */

import type { BMPCategory, CheckpointStatus } from '@/types/checkpoint';
import {
  getBmpCategoriesForRiskLevel,
  type BmpCategory,
  type CgpRiskLevel,
} from './risk-level-bmps';

// ─────────────────────────────────────────────
// Part 1: General Information (key/value table)
// ─────────────────────────────────────────────
export interface Part1Cell {
  label: string;
  value: string;
}

export interface Part1Group {
  heading: string;
  /** Each item is either a single full-width cell or a two-column row. */
  rows: Array<
    | { kind: 'kv'; cells: Part1Cell[] /* length 1 or 2 */ }
    | { kind: 'note'; label: string; value: string }
  >;
}

export interface Part1Data {
  date: string;
  inspectionType: string;
  groups: Part1Group[];
}

// ─────────────────────────────────────────────
// Part 2: BMP Observations (3-column checklist)
// ─────────────────────────────────────────────
export type BmpAnswer = 'Yes' | 'No' | '—';

export interface Part2Question {
  id: string;
  number: number;
  prompt: string;
  answer: BmpAnswer;
  /** Date string when the action was recommended/implemented, or '—'. */
  actionDate: string;
}

export interface Part2Category {
  number: number;
  title: string;
  questions: Part2Question[];
}

export interface Part2Data {
  riskLevel: CgpRiskLevel;
  categories: Part2Category[];
}

// ─────────────────────────────────────────────
// Part 3: Descriptions of BMP deficiencies (2-column)
// ─────────────────────────────────────────────
export interface Part3Row {
  deficiency: string;
  recommendation: string;
}

export interface Part3Data {
  rows: Part3Row[];
}

// ─────────────────────────────────────────────
// Mapping: BMPCategory → CGP category number (1-8)
// ─────────────────────────────────────────────
/**
 * A given checkpoint BMP type rolls up to one or more CGP categories.
 * Categories with no matching checkpoints are answered "Yes" by default
 * (the QSP can override at sign-time once per-question persistence
 * lands).
 */
const BMP_TO_CGP_CATEGORIES: Record<BMPCategory, number[]> = {
  // Erosion & wind erosion → CGP 6 (Erosion Controls)
  'erosion-control': [6],
  'wind-erosion': [6],
  'slope-breaker': [6],
  'water-bar': [6],

  // Sediment, tracking, trench → CGP 7 (Sediment Controls)
  'sediment-control': [7],
  'tracking-control': [7],
  'trench-plug': [7],
  'stream-crossing-erosion': [7],

  // Materials management → CGP 1 (Construction Materials) and 4 (Landscape)
  'materials-management': [1, 4],

  // Non-stormwater → CGP 5
  'non-storm-water': [5],

  // HDD containment is run-on/run-off mitigation → CGP 8
  'hdd-containment': [8],
};

interface CheckpointLike {
  bmpType: BMPCategory;
  status: CheckpointStatus;
}

/**
 * For each CGP category (1-8) decide a single Yes/No based on whether
 * any checkpoint in that category is currently flagged as deficient or
 * needs-review. Categories with no checkpoints stay "Yes".
 */
function categoryAnswers(checkpoints: CheckpointLike[]): Map<number, BmpAnswer> {
  const result = new Map<number, BmpAnswer>();
  for (let n = 1; n <= 8; n++) result.set(n, 'Yes');
  for (const cp of checkpoints) {
    const cats = BMP_TO_CGP_CATEGORIES[cp.bmpType];
    if (!cats) continue;
    if (cp.status === 'deficient' || cp.status === 'needs-review') {
      for (const c of cats) result.set(c, 'No');
    }
  }
  return result;
}

export function buildPart2Data(
  riskLevel: CgpRiskLevel,
  checkpoints: CheckpointLike[],
  recommendedOn: string
): Part2Data {
  const answersByCategory = categoryAnswers(checkpoints);
  const categories: Part2Category[] = getBmpCategoriesForRiskLevel(riskLevel).map(
    (cat: BmpCategory): Part2Category => {
      const answer = answersByCategory.get(cat.number) ?? 'Yes';
      return {
        number: cat.number,
        title: cat.title,
        questions: cat.questions.map((q, idx) => ({
          id: q.id,
          number: idx + 1,
          prompt: q.prompt,
          answer,
          actionDate: answer === 'No' ? `Recommended on ${recommendedOn}` : '—',
        })),
      };
    }
  );
  return { riskLevel, categories };
}

/**
 * Build Part 3 directly from Part 2's "No" rows so the deficiency table
 * stays consistent with the BMP checklist. Existing rows from the
 * `deficiencies` table can be appended by the caller if available.
 */
export function buildPart3DataFromPart2(part2: Part2Data): Part3Data {
  const rows: Part3Row[] = [];
  for (const cat of part2.categories) {
    for (const q of cat.questions) {
      if (q.answer === 'No') {
        rows.push({
          deficiency: q.prompt,
          recommendation: `Address the deficient ${cat.title.toLowerCase()} controls flagged during this inspection.`,
        });
      }
    }
  }
  return { rows };
}
