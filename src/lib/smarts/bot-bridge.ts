/**
 * Bridge between the app's smarts-event data model and the Playwright
 * SMARTS bot in smarts-automation/.
 *
 * The bot consumes a CSV (one row per monitoring-location sample, event
 * info repeated on every row — see smarts-automation/src/csv/
 * monitoring-record.schema.ts). This module builds that CSV from a
 * SmartsExportInput plus a human-readable preview of every value the
 * bot will type, and the list of blockers that must be resolved before
 * a sync can launch.
 *
 * The preview is the contract behind the review-and-confirm page: what
 * the user sees there is rendered from the same SyncPayload the sync
 * route turns into the bot's CSV, so "what you reviewed" and "what gets
 * filled" cannot drift.
 *
 * NOTE: the bot NEVER certifies the report in SMARTS. The in-app
 * confirmation is consent to auto-FILL only; the legal certification
 * still happens in SMARTS, by a human, after the bot stops.
 */

import type { ParameterResult, Sample } from '@/types';
import type { SmartsExportInput } from '@/lib/smarts/types';
import { isParameterNal } from '@/lib/smarts/nal-thresholds';

/** Mirrors EVENT_TYPE_OPTION in smarts-automation (the only type filled today). */
export const SMARTS_EVENT_TYPE = 'Precipitation Event';

export interface SyncParameterPreview {
  /** Numeric reading exactly as it will be typed into the Result cell. */
  result: number;
  analyticalMethod: string;
  mdl?: number;
  rl?: number;
  analyzedBy: 'Self' | 'Lab';
  units: string;
  nalExceedance: boolean;
}

export interface SyncRowPreview {
  locationId: string;
  /** Must match the SMARTS Monitoring Location dropdown option text exactly. */
  locationName: string;
  dischargePointType: string;
  sampleDatetimeIso: string;
  /** MM/DD/YYYY HH:MM — exactly what lands in the Sample Date & Time field. */
  sampleDatetimeSmarts: string;
  qspName: string;
  ph: SyncParameterPreview | null;
  turbidity: SyncParameterPreview | null;
}

export interface SyncEventInfoPreview {
  eventType: string;
  startDate: string; // MM/DD/YYYY
  startTime: string; // HH:MM
  endDate: string; // MM/DD/YYYY
  endTime: string; // HH:MM
  precipitationInches: string;
}

export interface SyncPayload {
  eventId: string;
  projectId: string;
  /** Project name — must match the SMARTS Facility/Site Name for the draft-resume guard. */
  siteName: string;
  wdid: string | null;
  eventInfo: SyncEventInfoPreview;
  rows: SyncRowPreview[];
  /** Hard problems — sync cannot launch until these are resolved. */
  blockers: string[];
  /** Soft notices the user should see before confirming (NALs, unsampled locations). */
  warnings: string[];
  /** The exact CSV handed to the bot (also served by the CSV export). */
  csv: string;
}

// ──────────────────────────────────────────────────────
// Formatting — SMARTS expects California wall-clock times. DB timestamps
// are real instants (UTC), so every value is converted through an
// explicit America/Los_Angeles clock, never the server's local zone.
//
// The bot's formatForSmarts() renders sample_datetime with getUTC*
// getters — i.e. it treats the ISO string's digits as the literal
// wall-clock to type. So the CSV encodes the LA wall-clock AS fake UTC
// ("…T09:15:00.000Z" meaning 09:15 in California): the bot then types
// exactly the time previewed here.
// ──────────────────────────────────────────────────────

const SMARTS_TZ = 'America/Los_Angeles';

interface WallClock {
  y: string;
  m: string;
  d: string;
  h: string;
  min: string;
}

function laWallClock(date: Date): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SMARTS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string): string =>
    parts.find((p) => p.type === type)?.value ?? '';
  // Some ICU versions render midnight as "24" with hour12: false.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return { y: get('year'), m: get('month'), d: get('day'), h: hour, min: get('minute') };
}

function smartsDate(date: Date): string {
  const w = laWallClock(date);
  return `${w.m}/${w.d}/${w.y}`;
}

function smartsTime(date: Date): string {
  const w = laWallClock(date);
  return `${w.h}:${w.min}`;
}

function smartsDateTime(date: Date): string {
  return `${smartsDate(date)} ${smartsTime(date)}`;
}

/** LA wall-clock encoded as a fake-UTC ISO string (see header comment). */
function wallClockIsoForBot(date: Date): string {
  const w = laWallClock(date);
  return `${w.y}-${w.m}-${w.d}T${w.h}:${w.min}:00.000Z`;
}

// ──────────────────────────────────────────────────────
// CSV serialization (RFC 4180 — the bot parses with csv-parse)
// ──────────────────────────────────────────────────────

const CSV_COLUMNS = [
  'monitoring_location_id',
  'monitoring_location_name',
  'sample_datetime',
  'ph_value',
  'turbidity_ntu',
  'analytical_method',
  'ph_analytical_method',
  'turbidity_analytical_method',
  'mdl_ph',
  'rl_ph',
  'mdl_turbidity',
  'rl_turbidity',
  'lab_name',
  'qualifier_code',
  'discharge_point',
  'event_start_date',
  'event_start_time',
  'event_end_date',
  'event_end_time',
  'precipitation_inches',
  'qsp_name',
] as const;

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// ──────────────────────────────────────────────────────
// Payload assembly
// ──────────────────────────────────────────────────────

function pickParameter(
  sample: Sample,
  name: ParameterResult['parameter']
): ParameterResult | null {
  return (
    (sample.parameterResults ?? []).find((p) => p.parameter === name) ?? null
  );
}

function toParameterPreview(p: ParameterResult): SyncParameterPreview | null {
  if (p.result == null) return null;
  return {
    result: p.result,
    analyticalMethod: p.analyticalMethod,
    mdl: p.mdl,
    rl: p.rl,
    analyzedBy: p.analyzedBy,
    units: p.units,
    nalExceedance: isParameterNal(p),
  };
}

/**
 * Build the full sync payload (preview + CSV + blockers/warnings) from
 * the same joined view the Excel export uses. Pure — no I/O — so it is
 * identical between the preview route and the launch route.
 */
export function buildSyncPayload(input: SmartsExportInput): SyncPayload {
  const { event, projectName, wdid, monitoringLocations, samples } = input;
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (!wdid || !wdid.trim()) {
    blockers.push(
      'Project has no WDID — the bot needs it to find the site in SMARTS. Add it in project settings.'
    );
  }
  if (!event.startedAt || !event.endedAt) {
    blockers.push(
      'Event start/end not recorded — mark the rain event ended before syncing (the SMARTS Event Information form requires the full window).'
    );
  }
  if (event.precipitationInches == null) {
    warnings.push(
      'Total precipitation is not recorded — the SMARTS precipitation field will be left blank.'
    );
  }

  const start = event.startedAt ? new Date(event.startedAt) : null;
  const end = event.endedAt ? new Date(event.endedAt) : null;
  const eventInfo: SyncEventInfoPreview = {
    eventType: SMARTS_EVENT_TYPE,
    startDate: start ? smartsDate(start) : '',
    startTime: start ? smartsTime(start) : '',
    endDate: end ? smartsDate(end) : '',
    endTime: end ? smartsTime(end) : '',
    precipitationInches:
      event.precipitationInches != null ? String(event.precipitationInches) : '',
  };

  const locationsById = new Map(monitoringLocations.map((l) => [l.id, l]));
  const rows: SyncRowPreview[] = [];
  const csvLines: string[] = [CSV_COLUMNS.join(',')];

  if (samples.length === 0) {
    blockers.push('No samples recorded for this event — nothing to sync.');
  }

  for (const sample of samples) {
    const location = locationsById.get(sample.monitoringLocationId);
    if (!location) {
      warnings.push(
        `A sample references a monitoring location that no longer exists (sample ${sample.id.slice(0, 8)}…) — it will be skipped.`
      );
      continue;
    }
    const label = location.name;

    const phRaw = pickParameter(sample, 'pH');
    const turbidityRaw = pickParameter(sample, 'Turbidity');

    // The bot fills both parameter rows on every SMARTS sample form and
    // halts if either Result is missing, so both readings are required.
    if (!phRaw) {
      blockers.push(`${label}: no pH reading recorded.`);
    }
    if (!turbidityRaw) {
      blockers.push(`${label}: no turbidity reading recorded.`);
    }
    // ND / DNQ leave Result empty and need a Result Qualifier change the
    // bot doesn't support yet (it leaves the qualifier at '='). Blocked
    // rather than silently mistranslated — file these manually.
    for (const p of [phRaw, turbidityRaw]) {
      if (p && p.qualifier !== '=') {
        blockers.push(
          `${label}: ${p.parameter} qualifier "${p.qualifier}" is not supported by auto-sync (only "=" readings). File this event manually.`
        );
      }
      if (p && p.qualifier === '=' && p.result == null) {
        blockers.push(`${label}: ${p.parameter} has no numeric result.`);
      }
    }
    // One Analyzed By per SMARTS sample form fill (the bot derives
    // Lab/Self per record from lab_name) — mixed parameters can't be
    // represented yet.
    if (
      phRaw &&
      turbidityRaw &&
      phRaw.analyzedBy !== turbidityRaw.analyzedBy
    ) {
      blockers.push(
        `${label}: pH is analyzed by "${phRaw.analyzedBy}" but turbidity by "${turbidityRaw.analyzedBy}" — auto-sync supports one Analyzed By per sample. File manually.`
      );
    }

    const ph = phRaw ? toParameterPreview(phRaw) : null;
    const turbidity = turbidityRaw ? toParameterPreview(turbidityRaw) : null;
    if (ph?.nalExceedance) {
      warnings.push(
        `${label}: pH ${ph.result} is an NAL exceedance — it will be reported to SMARTS as-is.`
      );
    }
    if (turbidity?.nalExceedance) {
      warnings.push(
        `${label}: turbidity ${turbidity.result} NTU is an NAL exceedance — it will be reported to SMARTS as-is.`
      );
    }

    const sampleDate = new Date(sample.sampleDatetime);
    rows.push({
      locationId: location.id,
      locationName: location.name,
      dischargePointType: location.dischargePointType,
      sampleDatetimeIso: sample.sampleDatetime,
      sampleDatetimeSmarts: smartsDateTime(sampleDate),
      qspName: sample.qspName,
      ph,
      turbidity,
    });

    const analyzedBy = ph?.analyzedBy ?? turbidity?.analyzedBy ?? 'Self';
    const record: Record<(typeof CSV_COLUMNS)[number], string> = {
      monitoring_location_id: location.id,
      monitoring_location_name: location.name,
      sample_datetime: wallClockIsoForBot(sampleDate),
      ph_value: ph != null ? String(ph.result) : '',
      turbidity_ntu: turbidity != null ? String(turbidity.result) : '',
      analytical_method: ph?.analyticalMethod ?? '',
      ph_analytical_method: ph?.analyticalMethod ?? '',
      turbidity_analytical_method: turbidity?.analyticalMethod ?? '',
      mdl_ph: ph?.mdl != null ? String(ph.mdl) : '',
      rl_ph: ph?.rl != null ? String(ph.rl) : '',
      mdl_turbidity: turbidity?.mdl != null ? String(turbidity.mdl) : '',
      rl_turbidity: turbidity?.rl != null ? String(turbidity.rl) : '',
      // The bot only uses lab_name to pick Lab vs Self on the Analyzed By
      // dropdown; the app stores the choice directly, so a marker value
      // is enough.
      lab_name: analyzedBy === 'Lab' ? 'Lab' : '',
      qualifier_code: '',
      discharge_point: location.dischargePointType,
      event_start_date: eventInfo.startDate,
      event_start_time: eventInfo.startTime,
      event_end_date: eventInfo.endDate,
      event_end_time: eventInfo.endTime,
      precipitation_inches: eventInfo.precipitationInches,
      qsp_name: sample.qspName,
    };
    csvLines.push(CSV_COLUMNS.map((c) => csvField(record[c])).join(','));
  }

  const activeUnsampled = monitoringLocations.filter(
    (l) =>
      l.status === 'active' &&
      !samples.some((s) => s.monitoringLocationId === l.id)
  );
  if (activeUnsampled.length > 0) {
    warnings.push(
      `${activeUnsampled.length} active monitoring location(s) have no sample for this event: ${activeUnsampled
        .map((l) => l.name)
        .join(', ')}.`
    );
  }

  return {
    eventId: event.id,
    projectId: event.projectId,
    siteName: projectName,
    wdid,
    eventInfo,
    rows,
    blockers,
    warnings,
    csv: csvLines.join('\n') + '\n',
  };
}
