/**
 * SMARTS Ad Hoc Monitoring Report — walkthrough generator.
 *
 * Renders the QSP's event + samples as a multi-section text block that
 * mirrors the SMARTS web-portal data-entry sequence (qsp-smarts-prep
 * SKILL.md Steps 1–7). Copy-to-clipboard from the review page; the
 * data-entry person reads each section while typing into the SMARTS
 * portal in another tab.
 *
 * Why text, not the Excel? Construction projects cannot SPET-upload to
 * SMARTS — all data is manual web entry. The walkthrough is the most
 * direct artifact: it's organized in the order SMARTS asks for things,
 * and includes inline reminders / qualifier-handling / NAL-exceedance
 * call-outs that a flat spreadsheet doesn't.
 *
 * Render-time normalization matches the Excel export (see ./normalize).
 */

import type { SmartsExportInput } from './types';
import { isNalExceedance, isParameterNal } from './nal-thresholds';
import {
  normalizeMethod,
  normalizeQualifier,
  normalizeUnits,
  splitIsoDate,
} from './normalize';
import type { ParameterResult, Sample } from '@/types';

// ──────────────────────────────────────────────────────
// Small formatters
// ──────────────────────────────────────────────────────

const SECTION_BREAK = '\n---\n';

function sectionHeader(label: string): string {
  return `${label}\n${'-'.repeat(label.length)}`;
}

function safe(value: string | null | undefined, fallback = '—'): string {
  if (value == null) return fallback;
  const trimmed = String(value).trim();
  return trimmed.length === 0 ? fallback : trimmed;
}

function numberOrDash(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return String(value);
}

function eventYear(input: SmartsExportInput): number {
  const isoCandidates = [
    input.event.startedAt,
    input.event.forecastDetectedAt,
    input.event.endedAt,
  ];
  for (const iso of isoCandidates) {
    if (!iso) continue;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d.getFullYear();
  }
  return new Date().getFullYear();
}

// ──────────────────────────────────────────────────────
// Section builders
// ──────────────────────────────────────────────────────

function buildHeader(input: SmartsExportInput): string {
  const lines = [
    'SMARTS Ad Hoc Monitoring Report — Filing Walkthrough',
    '====================================================',
    '',
    `Project:      ${safe(input.projectName)}`,
    `WDID:         ${safe(input.wdid)}`,
    `Event ID:     ${input.event.id}`,
    `Event Status: ${input.event.status}`,
    `Event Source: ${input.event.source}`,
  ];
  if (input.event.notes && input.event.notes.trim().length > 0) {
    lines.push(`QSP Notes:    ${input.event.notes.trim()}`);
  }
  return lines.join('\n');
}

function buildStep1(input: SmartsExportInput): string {
  const year = eventYear(input);
  const locCount = input.monitoringLocations.filter((l) => l.status === 'active').length;
  return [
    sectionHeader('STEP 1 — Pre-Submission Checklist'),
    'Before opening SMARTS, verify you have:',
    `  [ ] WDID number: ${safe(input.wdid)}`,
    `  [ ] Reporting year: ${year}`,
    `  [ ] Event Type: Qualifying Storm Event (QSE)`,
    `  [ ] Sample Date/Time captured (24-hour format)`,
    `  [ ] Monitoring locations created in SMARTS (${locCount} active)`,
    `  [ ] Lab results in hand (or self-reported for pH field measurements)`,
    `  [ ] Lab report PDF ready (≤100MB, filename ≤30 chars, no special characters)`,
    `  [ ] LRP/DAR credentials available for certification`,
    '',
    'Submit within 30 days of receiving lab results.',
  ].join('\n');
}

function buildStep2(input: SmartsExportInput): string {
  const precip =
    input.event.precipitationInches != null
      ? `${input.event.precipitationInches.toFixed(2)} inches/hour`
      : '(fill in from rain-gauge records)';
  return [
    sectionHeader('STEP 2 — Event Information Setup'),
    'Log into SMARTS, then navigate to:',
    '  Reports → File Reports → Ad Hoc Monitoring Report',
    '',
    'On the General Info tab, enter:',
    `  Event Type:                Qualifying Storm Event`,
    `  Owner Name:                (auto-populated from NOI)`,
    `  Site Information:          (auto-populated from NOI)`,
    `  Rainfall Amount:           ${precip}`,
    `  Discharge Volume Estimate: (fill in by hand — schema doesn't capture this yet)`,
  ].join('\n');
}

function buildStep3(input: SmartsExportInput): string {
  const active = input.monitoringLocations.filter((l) => l.status === 'active');
  const lines: string[] = [
    sectionHeader('STEP 3 — Monitoring Location Setup'),
    `Verify the following ${active.length} monitoring location(s) exist in SMARTS.`,
    'If any are missing, create them via Add/Edit Monitoring Locations with these values:',
    '',
  ];
  active.forEach((loc, idx) => {
    lines.push(`LOCATION ${idx + 1}: ${safe(loc.name)}`);
    lines.push(`  Discharge Point Type: ${safe(loc.dischargePointType)}`);
    lines.push(`  Drainage Area:        ${safe(loc.drainageArea)}`);
    lines.push(`  Description:          ${safe(loc.description)}`);
    lines.push(
      `  Latitude:             ${
        loc.latitude != null ? loc.latitude : '(set via SMARTS view-map, WGS84 datum)'
      }`
    );
    lines.push(
      `  Longitude:            ${
        loc.longitude != null ? loc.longitude : '(set via SMARTS view-map, WGS84 datum)'
      }`
    );
    lines.push(`  Status:               Active`);
    lines.push('');
  });
  if (active.length === 0) {
    lines.push('  (No active monitoring locations on file. Configure at least one before filing.)');
  }
  return lines.join('\n').trimEnd();
}

function buildStep4(input: SmartsExportInput): string {
  const sampleCount = input.samples.length;
  const locsSampled = new Set(input.samples.map((s) => s.monitoringLocationId)).size;
  return [
    sectionHeader('STEP 4 — Sample Parameters'),
    'For construction Risk Level 2 & 3, required parameters: pH and Turbidity.',
    `This event has ${sampleCount} sample(s) covering ${locsSampled} location(s).`,
    'Optional additional parameters (Copper, Zinc, Oil & Grease, TSS) are not captured by this build.',
  ].join('\n');
}

function renderParameterRow(p: ParameterResult): string[] {
  const isNd = p.qualifier === 'ND';
  const isDnq = p.qualifier === 'DNQ';
  const qualOut = normalizeQualifier(p.qualifier);
  const unitsOut = normalizeUnits(p.units);
  const methodOut = normalizeMethod(p.analyticalMethod);

  // ND: blank result + MDL. DNQ: result + MDL + RL.
  let resultLine: string;
  if (isNd) {
    resultLine = `    Result:            (leave blank — non-detect)`;
  } else if (isDnq) {
    resultLine = `    Result:            ${numberOrDash(p.result)} (detected, not quantified)`;
  } else {
    resultLine = `    Result:            ${numberOrDash(p.result)}`;
  }

  const qualLine = qualOut
    ? `    Qualifier:         ${qualOut}`
    : `    Qualifier:         (leave blank)`;

  const exceed = isParameterNal(p);
  const heading = exceed
    ? `  ${p.parameter} Reading  ⚠ NAL Exceedance`
    : `  ${p.parameter} Reading`;

  return [
    heading,
    resultLine,
    `    Units:             ${unitsOut}`,
    qualLine,
    `    Analytical Method: ${methodOut}`,
    `    MDL:               ${numberOrDash(p.mdl)}`,
    `    RL:                ${isDnq ? numberOrDash(p.rl) : p.rl != null ? numberOrDash(p.rl) : '(blank)'}`,
    `    Analyzed By:       ${safe(p.analyzedBy)}`,
  ];
}

function buildStep5(input: SmartsExportInput): string {
  const lines: string[] = [
    sectionHeader('STEP 5 — Entering Results'),
    'For each sample below, enter values EXACTLY as shown into SMARTS.',
    'Date/time format: MM/DD/YYYY HH:MM (24-hour, local time).',
    '',
  ];

  if (input.samples.length === 0) {
    lines.push('(No samples recorded yet. Return to field capture before filing.)');
    return lines.join('\n');
  }

  // Index by location name for stable ordering by location
  const locById = new Map(input.monitoringLocations.map((l) => [l.id, l]));
  const sorted = [...input.samples].sort((a, b) => {
    const an = locById.get(a.monitoringLocationId)?.name ?? '';
    const bn = locById.get(b.monitoringLocationId)?.name ?? '';
    if (an !== bn) return an.localeCompare(bn);
    return a.sampleDatetime.localeCompare(b.sampleDatetime);
  });

  sorted.forEach((sample, idx) => {
    const loc = locById.get(sample.monitoringLocationId);
    const { date, time } = splitIsoDate(sample.sampleDatetime);
    lines.push(`SAMPLE ${idx + 1} — ${safe(loc?.name)}`);
    lines.push(`  Sample Date:   ${date}`);
    lines.push(`  Sample Time:   ${time}`);
    lines.push(`  Sampled by:    ${safe(sample.qspName)}`);
    lines.push('');

    const prs = sample.parameterResults ?? [];
    if (prs.length === 0) {
      lines.push('  (No parameter readings recorded for this sample.)');
    } else {
      // Stable parameter ordering: pH first, Turbidity second
      const orderedPrs = [...prs].sort((a, b) => a.parameter.localeCompare(b.parameter));
      orderedPrs.forEach((p) => {
        renderParameterRow(p).forEach((l) => lines.push(l));
        lines.push('');
      });
    }
  });

  return lines.join('\n').trimEnd();
}

function buildNalSection(input: SmartsExportInput): string {
  const lines: string[] = [sectionHeader('NAL Exceedance Actions')];
  const offending: Array<{ sample: Sample; locName: string; offenders: ParameterResult[] }> = [];
  const locById = new Map(input.monitoringLocations.map((l) => [l.id, l]));
  for (const sample of input.samples) {
    if (!isNalExceedance(sample.parameterResults)) continue;
    const offenders = (sample.parameterResults ?? []).filter(isParameterNal);
    offending.push({
      sample,
      locName: locById.get(sample.monitoringLocationId)?.name ?? sample.monitoringLocationId,
      offenders,
    });
  }
  if (offending.length === 0) {
    lines.push('No NAL exceedances detected. Proceed to Step 6.');
    return lines.join('\n');
  }
  lines.push('The following readings exceed CGP 2022 Numeric Action Levels:');
  lines.push('  pH:        <6.0 or >9.0 SU');
  lines.push('  Turbidity: >250 NTU (instantaneous)');
  lines.push('');
  offending.forEach((row, idx) => {
    lines.push(`  ${idx + 1}. ${row.locName} on ${splitIsoDate(row.sample.sampleDatetime).date}`);
    row.offenders.forEach((p) => {
      lines.push(
        `       ${p.parameter} = ${numberOrDash(p.result)} ${normalizeUnits(p.units)}`
      );
    });
  });
  lines.push('');
  lines.push('For each exceedance, file a separate NAL Exceedance Response Action Report');
  lines.push('in SMARTS describing the corrective actions taken on site.');
  return lines.join('\n');
}

function buildStep6(): string {
  return [
    sectionHeader('STEP 6 — Attachments'),
    'Upload your lab report PDF:',
    '  Attachment File Type: "Laboratory Results"',
    '  File name:            ≤30 characters, no special characters or symbols',
    '  File size:            ≤100MB',
  ].join('\n');
}

function buildStep7(): string {
  return [
    sectionHeader('STEP 7 — Completion Check & Certification'),
    '  1. Click "Perform Completion Check" in SMARTS.',
    '  2. Resolve any flagged errors before continuing.',
    '  3. Click "Notify LRP/DAR" so the Licensed Responsible Person can certify.',
    '  4. LRP/DAR opens "Documents Ready for Certification" and signs.',
    '',
    '⚠ Certification is a legal signature under penalty of perjury. Do not certify',
    '  on behalf of another person.',
  ].join('\n');
}

function buildFooter(): string {
  return [
    sectionHeader('Filing Notes'),
    '  - Submit within 30 days of receiving lab results.',
    '  - Construction projects must enter all data manually; SMARTS does not',
    '    accept SPET Excel uploads from construction.',
    '  - Recommended browsers: Google Chrome or Microsoft Edge.',
    '  - SMARTS portal: https://smarts.waterboards.ca.gov',
  ].join('\n');
}

// ──────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────

export function buildSmartsWalkthrough(input: SmartsExportInput): string {
  return [
    buildHeader(input),
    SECTION_BREAK,
    buildStep1(input),
    SECTION_BREAK,
    buildStep2(input),
    SECTION_BREAK,
    buildStep3(input),
    SECTION_BREAK,
    buildStep4(input),
    SECTION_BREAK,
    buildStep5(input),
    SECTION_BREAK,
    buildNalSection(input),
    SECTION_BREAK,
    buildStep6(),
    SECTION_BREAK,
    buildStep7(),
    SECTION_BREAK,
    buildFooter(),
  ].join('\n');
}
