import type {
  Part1Data,
  Part2Data,
  Part3Data,
} from '@/lib/cgp/report-data';

/**
 * Tagged union — sections carry both a markdown `content` fallback
 * (used for editing + legacy rendering) and an optional structured
 * `data` payload that drives the new table-based layout. When `data`
 * is present, renderers should prefer it.
 */
export type ReportSectionData =
  | { kind: 'part1'; payload: Part1Data }
  | { kind: 'part2'; payload: Part2Data }
  | { kind: 'part3'; payload: Part3Data };

export interface ReportSection {
  id: string;
  number: number;
  title: string;
  content: string;
  editable: boolean;
  edited?: boolean;
  /** Rendered as a table when present; otherwise the markdown `content` is used. */
  data?: ReportSectionData;
}

export interface Report {
  id: string;
  inspectionId: string;
  generatedDate: string;
  sections: ReportSection[];
  signed: boolean;
  signedBy?: string;
  signedDate?: string;
}
