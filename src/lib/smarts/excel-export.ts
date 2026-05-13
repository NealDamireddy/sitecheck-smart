/**
 * Excel export for SMARTS Ad Hoc Monitoring Reports.
 *
 * ────────────────────────────────────────────────────────────────────
 *   IMPORTANT — this is a DATA-ENTRY AID, not an upload artifact.
 * ────────────────────────────────────────────────────────────────────
 * Construction projects CANNOT use the SMARTS SPET Excel upload path —
 * confirmed by the State Water Board. All data MUST be manually entered
 * through the SMARTS web portal. (See `qsp-smarts-prep` SKILL.md.)
 *
 * This file's purpose is to produce a workbook the data-entry person
 * can read while typing each row into SMARTS. Nothing here is intended
 * to be machine-ingested by SMARTS. Don't add upload-formatting
 * conventions that aren't in the skill — they're not required and would
 * just confuse the QSP staring at the file.
 *
 * ────────────────────────────────────────────────────────────────────
 *   Sheet layout
 * ────────────────────────────────────────────────────────────────────
 *   Sheet 1 — "Ad Hoc Monitoring Report"
 *     The skill's 8-column "Data Formatting Helper" parameter shape
 *     (Parameter, Result, Units, Qualifier, Analytical Method, MDL,
 *     RL, Analyzed By), prefixed with Location / Sample Date / Sample
 *     Time so that multiple samples render as one flat scannable
 *     table. One row per parameter reading. NO highlighting on this
 *     sheet — it stays vanilla so a QSP reading at speed isn't
 *     distracted, and so a future "tighten for SMARTS web rendering"
 *     pass doesn't have to strip formatting first.
 *
 *   Sheet 2 — "Project Summary"
 *     Human-readable name/value pairs (Project, WDID, Event ID, event
 *     timestamps, Rainfall Amount, Discharge Volume Estimate, NAL
 *     Exceedance Count). Red fill on the NAL Exceedance Count row
 *     when that value is > 0.
 *
 * ────────────────────────────────────────────────────────────────────
 *   Render-time normalization
 * ────────────────────────────────────────────────────────────────────
 * Capture-page defaults today still store the pre-normalization values
 * ('su', 'pH field', 'Hach 2100Q', qualifier '='). The Excel cells get
 * the SMARTS-shaped strings via the normalize* helpers below so the
 * existing demo data renders cleanly without churning capture. The
 * underlying capture-default drift is a separate cleanup task — see
 * the step-11 commit message for the full KNOWN DRIFT list.
 */

import ExcelJS from 'exceljs';
import type { MonitoringLocation, Sample, SmartsEvent } from '@/types';
import { isNalExceedance } from './nal-thresholds';

// ──────────────────────────────────────────────────────
// Normalization — stored value → SMARTS dropdown string
// ──────────────────────────────────────────────────────

function normalizeUnits(units: string): string {
  if (units === 'su') return 'SU';
  return units;
}

function normalizeMethod(method: string): string {
  if (method === 'pH field') return 'pH_field';
  if (method === 'Hach 2100Q') return 'EPA 180.1';
  return method;
}

function normalizeQualifier(qualifier: string): string {
  // SMARTS expects qualifier blank for normal measurements.
  if (qualifier === '=') return '';
  return qualifier;
}

function splitIsoDate(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  return {
    date: `${mm}/${dd}/${yyyy}`,
    time: `${HH}:${MM}`,
  };
}

function formatLong(iso: string): string {
  const { date, time } = splitIsoDate(iso);
  return `${date} ${time}`;
}

// ──────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────

export interface SmartsExcelInput {
  event: Pick<
    SmartsEvent,
    | 'id'
    | 'projectId'
    | 'status'
    | 'source'
    | 'forecastDetectedAt'
    | 'startedAt'
    | 'endedAt'
    | 'precipitationInches'
  >;
  projectName: string;
  wdid: string | null;
  monitoringLocations: MonitoringLocation[];
  samples: Sample[];
}

/**
 * Build the workbook and return its byte content as an ArrayBuffer.
 * Pass directly to NextResponse — no Node Buffer adapter required.
 */
export async function buildSmartsExcelWorkbook(
  input: SmartsExcelInput
): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SiteCheck';
  workbook.created = new Date();

  const locById: Record<string, MonitoringLocation> = {};
  for (const l of input.monitoringLocations) locById[l.id] = l;

  // ──── Sheet 1: Ad Hoc Monitoring Report ────
  const sheet1 = workbook.addWorksheet('Ad Hoc Monitoring Report');

  sheet1.columns = [
    { header: 'Location', key: 'location', width: 22 },
    { header: 'Sample Date', key: 'sampleDate', width: 14 },
    { header: 'Sample Time', key: 'sampleTime', width: 12 },
    { header: 'Parameter', key: 'parameter', width: 14 },
    { header: 'Result', key: 'result', width: 12 },
    { header: 'Units', key: 'units', width: 8 },
    { header: 'Qualifier', key: 'qualifier', width: 10 },
    { header: 'Analytical Method', key: 'method', width: 20 },
    { header: 'MDL', key: 'mdl', width: 8 },
    { header: 'RL', key: 'rl', width: 8 },
    { header: 'Analyzed By', key: 'analyzedBy', width: 14 },
  ];
  sheet1.getRow(1).font = { bold: true };

  // Stable ordering: by location name then by datetime.
  const sortedSamples = [...input.samples].sort((a, b) => {
    const locA = locById[a.monitoringLocationId]?.name ?? '';
    const locB = locById[b.monitoringLocationId]?.name ?? '';
    if (locA !== locB) return locA.localeCompare(locB);
    return a.sampleDatetime.localeCompare(b.sampleDatetime);
  });

  for (const sample of sortedSamples) {
    const location = locById[sample.monitoringLocationId];
    const { date, time } = splitIsoDate(sample.sampleDatetime);
    const prs = sample.parameterResults ?? [];
    for (const p of prs) {
      sheet1.addRow({
        location: location?.name ?? '',
        sampleDate: date,
        sampleTime: time,
        parameter: p.parameter,
        // Blank cell rather than literal "null" / 0 when no reading.
        result: p.result == null ? '' : p.result,
        units: normalizeUnits(p.units),
        qualifier: normalizeQualifier(p.qualifier),
        method: normalizeMethod(p.analyticalMethod),
        mdl: p.mdl == null ? '' : p.mdl,
        rl: p.rl == null ? '' : p.rl,
        analyzedBy: p.analyzedBy,
      });
    }
  }

  // ──── Sheet 2: Project Summary ────
  const sheet2 = workbook.addWorksheet('Project Summary');
  sheet2.columns = [
    { header: 'Field', key: 'field', width: 30 },
    { header: 'Value', key: 'value', width: 44 },
  ];
  sheet2.getRow(1).font = { bold: true };

  const summaryRows: Array<{ field: string; value: string }> = [
    { field: 'Project', value: input.projectName },
    { field: 'WDID', value: input.wdid ?? '' },
    { field: 'Event ID', value: input.event.id },
    { field: 'Event Status', value: input.event.status },
    { field: 'Event Source', value: input.event.source },
    {
      field: 'Forecast Detected',
      value: input.event.forecastDetectedAt
        ? formatLong(input.event.forecastDetectedAt)
        : '',
    },
    {
      field: 'Started',
      value: input.event.startedAt ? formatLong(input.event.startedAt) : '',
    },
    {
      field: 'Ended',
      value: input.event.endedAt ? formatLong(input.event.endedAt) : '',
    },
    {
      field: 'Rainfall Amount (inches)',
      value:
        input.event.precipitationInches != null
          ? input.event.precipitationInches.toFixed(2)
          : '',
    },
    // SMARTS asks for a Discharge Volume Estimate (gallons, XXXX.XX
    // format). Our schema doesn't capture this yet — leave the cell
    // blank so the QSP knows to fill it in by hand when typing into
    // the SMARTS web portal. Adding the column to smarts_events would
    // be a future migration.
    { field: 'Discharge Volume Estimate (gal)', value: '' },
  ];

  let nalCount = 0;
  for (const sample of input.samples) {
    if (isNalExceedance(sample.parameterResults)) nalCount += 1;
  }
  summaryRows.push({
    field: 'NAL Exceedance Count',
    value: String(nalCount),
  });

  for (const row of summaryRows) sheet2.addRow(row);

  // Red fill on the NAL row when count > 0. Sheet 2 only — Sheet 1
  // stays vanilla per the header docblock.
  if (nalCount > 0) {
    const nalRowIndex = summaryRows.length + 1; // +1 for header row
    const row = sheet2.getRow(nalRowIndex);
    row.eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEF4444' }, // matches --color-status-deficient
      };
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    });
  }

  // exceljs v4 returns an ArrayBuffer-shaped value from writeBuffer().
  // The library types declare it as `Buffer` for legacy reasons but the
  // runtime value is an ArrayBuffer in browser-target builds. Cast
  // narrows the type for the Next.js NextResponse consumer.
  const buf = (await workbook.xlsx.writeBuffer()) as unknown as ArrayBuffer;
  return buf;
}
