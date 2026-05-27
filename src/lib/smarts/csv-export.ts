/**
 * CSV export for SMARTS Ad Hoc Monitoring Reports.
 *
 * Companion to excel-export.ts — same input shape, same row
 * granularity (one row per sample-parameter result), but a flat plain
 * CSV that QSPs can review or edit in any tool before syncing.
 *
 * Columns are tuned for laptop review (datetime + location + reading +
 * NAL threshold + exceedance flag), not for re-typing into the SMARTS
 * web portal — the Excel workbook is the data-entry aid. NAL threshold
 * and exceedance values come straight from nal-thresholds.ts so the
 * CSV stays in sync with the capture-page card flags and review-page
 * detection.
 */

import {
  NAL_PH_MAX,
  NAL_PH_MIN,
  NAL_TURBIDITY_NTU,
  isParameterNal,
} from './nal-thresholds';
import { normalizeQualifier, normalizeUnits } from './normalize';
import type { SmartsExportInput } from './types';
import type { MonitoringLocation, ParameterName } from '@/types';

const CSV_HEADERS = [
  'Sample Datetime',
  'Monitoring Location',
  'Parameter',
  'Result',
  'Units',
  'Qualifier',
  'NAL Threshold',
  'Exceedance',
] as const;

function nalThreshold(parameter: ParameterName): string {
  if (parameter === 'pH') return `${NAL_PH_MIN}-${NAL_PH_MAX}`;
  if (parameter === 'Turbidity') return String(NAL_TURBIDITY_NTU);
  return '';
}

/**
 * RFC 4180 escaping: wrap any field containing comma, double-quote,
 * CR, or LF in double quotes; double any embedded double-quotes.
 */
function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvRow(fields: readonly string[]): string {
  return fields.map(escapeCsvField).join(',');
}

/**
 * Build the CSV body as a string. Always emits the header row, even
 * when the dataset is empty. Lines are CRLF-terminated per RFC 4180.
 */
export function buildSmartsCsv(input: SmartsExportInput): string {
  const locById: Record<string, MonitoringLocation> = {};
  for (const l of input.monitoringLocations) locById[l.id] = l;

  const sortedSamples = [...input.samples].sort((a, b) => {
    const locA = locById[a.monitoringLocationId]?.name ?? '';
    const locB = locById[b.monitoringLocationId]?.name ?? '';
    if (locA !== locB) return locA.localeCompare(locB);
    return a.sampleDatetime.localeCompare(b.sampleDatetime);
  });

  const lines: string[] = [toCsvRow(CSV_HEADERS)];

  for (const sample of sortedSamples) {
    const location = locById[sample.monitoringLocationId];
    const prs = sample.parameterResults ?? [];
    for (const p of prs) {
      const exceedance = isParameterNal(p) ? 'Yes' : 'No';
      lines.push(
        toCsvRow([
          sample.sampleDatetime,
          location?.name ?? '',
          p.parameter,
          p.result == null ? '' : String(p.result),
          normalizeUnits(p.units),
          normalizeQualifier(p.qualifier),
          nalThreshold(p.parameter),
          exceedance,
        ])
      );
    }
  }

  return lines.join('\r\n') + '\r\n';
}

/**
 * Slug a project name for the export filename.
 * Lowercases, collapses non-alphanumerics to '-', trims leading/
 * trailing dashes. Falls back to 'project' when the result is empty.
 */
export function slugifyProjectName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'project';
}

/**
 * Build the CSV filename: smarts-export-<project-name>-<YYYY-MM-DD>.csv
 */
export function buildSmartsCsvFilename(
  projectName: string,
  date: Date = new Date()
): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `smarts-export-${slugifyProjectName(projectName)}-${yyyy}-${mm}-${dd}.csv`;
}
