import {
  QPE_EXTENSION_QPF_INCHES,
  QPE_INITIAL_POP_PERCENT,
  QPE_INITIAL_QPF_INCHES,
  type ForecastIntervalQuality,
  type ForecastWindow24h,
  type NormalizedNwsSixHourInterval,
  type NwsForecastNormalizationResult,
  type NwsGridSeries,
  type NwsNormalizationReasonCode,
  type QpeForecastSequence,
  type QpeSequenceBuildResult,
  type QpeSequenceReasonCode,
} from './types';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const MILLIMETERS_PER_INCH = 25.4;

interface ParsedGridValue {
  startsAtMs: number;
  endsAtMs: number;
  value: number | null;
}

export interface NormalizeNwsGridForecastInput {
  snapshotId: string;
  /** Retrieval time used to discard source periods that had already ended. */
  notBefore?: string;
  probabilityOfPrecipitation: NwsGridSeries;
  quantitativePrecipitation: NwsGridSeries;
}

function parseDurationMs(value: string): number | null {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(
    value
  );
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  const durationMs =
    days * 24 * 60 * 60 * 1000 +
    hours * 60 * 60 * 1000 +
    minutes * 60 * 1000 +
    seconds * 1000;
  return Number.isFinite(durationMs) && durationMs > 0 ? durationMs : null;
}

function parseGridSeries(
  series: NwsGridSeries
): { values: ParsedGridValue[]; error: NwsNormalizationReasonCode | null } {
  const parsed: ParsedGridValue[] = [];
  for (const item of series.values) {
    const [startsAtRaw, durationRaw] = item.validTime.split('/');
    const startsAtMs = Date.parse(startsAtRaw);
    const durationMs = parseDurationMs(durationRaw ?? '');
    if (
      !Number.isFinite(startsAtMs) ||
      durationMs === null ||
      (item.value !== null && !Number.isFinite(item.value))
    ) {
      return { values: [], error: 'NWS_INTERVAL_INVALID' };
    }
    parsed.push({
      startsAtMs,
      endsAtMs: startsAtMs + durationMs,
      value: item.value,
    });
  }

  parsed.sort((a, b) => a.startsAtMs - b.startsAtMs);
  for (let index = 1; index < parsed.length; index += 1) {
    if (parsed[index].startsAtMs < parsed[index - 1].endsAtMs) {
      return { values: [], error: 'NWS_INTERVAL_OVERLAP' };
    }
  }
  return { values: parsed, error: null };
}

function isQpfMillimeters(uom: string): boolean {
  return /(^|:)mm$/i.test(uom.trim());
}

function isPercent(uom: string): boolean {
  return /(^|:)percent$/i.test(uom.trim()) || uom.trim() === '%';
}

function quality(
  probabilityPercent: number | null,
  qpfInches: number | null
): ForecastIntervalQuality {
  if (probabilityPercent === null && qpfInches === null) return 'missing-both';
  if (probabilityPercent === null) return 'missing-pop';
  if (qpfInches === null) return 'missing-qpf';
  return 'complete';
}

/**
 * Normalize raw NWS gridpoint series into the six-hour rows used by the
 * Water Boards QPE guidance. QPF values must be NWS six-hour millimeter
 * totals. Longer or shorter QPF periods fail closed rather than being
 * guessed or proportionally redistributed for a compliance decision.
 */
export function normalizeNwsGridForecast(
  input: NormalizeNwsGridForecastInput
): NwsForecastNormalizationResult {
  if (input.snapshotId.trim().length === 0) {
    return { status: 'unknown', intervals: [], reasonCodes: ['SNAPSHOT_ID_MISSING'] };
  }
  if (!isQpfMillimeters(input.quantitativePrecipitation.uom)) {
    return { status: 'unknown', intervals: [], reasonCodes: ['QPF_UNIT_UNSUPPORTED'] };
  }
  if (!isPercent(input.probabilityOfPrecipitation.uom)) {
    return { status: 'unknown', intervals: [], reasonCodes: ['POP_UNIT_UNSUPPORTED'] };
  }
  if (input.quantitativePrecipitation.values.length === 0) {
    return { status: 'unknown', intervals: [], reasonCodes: ['QPF_SERIES_EMPTY'] };
  }

  const qpf = parseGridSeries(input.quantitativePrecipitation);
  if (qpf.error) {
    return { status: 'unknown', intervals: [], reasonCodes: [qpf.error] };
  }
  const pop = parseGridSeries(input.probabilityOfPrecipitation);
  if (pop.error) {
    return { status: 'unknown', intervals: [], reasonCodes: [pop.error] };
  }
  const notBeforeMs = input.notBefore === undefined ? null : Date.parse(input.notBefore);
  if (notBeforeMs !== null && !Number.isFinite(notBeforeMs)) {
    return { status: 'unknown', intervals: [], reasonCodes: ['NWS_INTERVAL_INVALID'] };
  }

  // NWS grid series can retain a shortened boundary period that ended before
  // the payload was retrieved. It cannot affect a forward-looking decision,
  // so remove it before enforcing the six-hour Weather Table interval. A
  // current or future shortened period still fails closed below.
  const activeQpf =
    notBeforeMs === null
      ? qpf.values
      : qpf.values.filter((item) => item.endsAtMs > notBeforeMs);
  if (activeQpf.length === 0) {
    return { status: 'unknown', intervals: [], reasonCodes: ['QPF_SERIES_EMPTY'] };
  }
  if (activeQpf.some((item) => item.endsAtMs - item.startsAtMs !== SIX_HOURS_MS)) {
    return {
      status: 'unknown',
      intervals: [],
      reasonCodes: ['QPF_INTERVAL_NOT_SIX_HOURS'],
    };
  }
  if (
    activeQpf.some(
      (item) => item.value !== null && item.value < 0
    ) ||
    pop.values.some(
      (item) => item.value !== null && (item.value < 0 || item.value > 100)
    )
  ) {
    return { status: 'unknown', intervals: [], reasonCodes: ['NWS_INTERVAL_INVALID'] };
  }

  const firstStart = activeQpf[0].startsAtMs;
  const finalEnd = activeQpf[activeQpf.length - 1].endsAtMs;
  if (
    activeQpf.some((item) => (item.startsAtMs - firstStart) % SIX_HOURS_MS !== 0)
  ) {
    return { status: 'unknown', intervals: [], reasonCodes: ['NWS_INTERVAL_INVALID'] };
  }

  const qpfByStart = new Map(activeQpf.map((item) => [item.startsAtMs, item]));
  const intervals: NormalizedNwsSixHourInterval[] = [];
  let sequenceIndex = 0;
  for (let startsAtMs = firstStart; startsAtMs < finalEnd; startsAtMs += SIX_HOURS_MS) {
    const endsAtMs = startsAtMs + SIX_HOURS_MS;
    const qpfItem = qpfByStart.get(startsAtMs);
    const popMatches = pop.values.filter(
      (item) => item.startsAtMs <= startsAtMs && item.endsAtMs >= endsAtMs
    );
    if (popMatches.length > 1) {
      return { status: 'unknown', intervals: [], reasonCodes: ['NWS_INTERVAL_OVERLAP'] };
    }

    const probabilityPercent = popMatches[0]?.value ?? null;
    const qpfInches =
      qpfItem?.value === null || qpfItem?.value === undefined
        ? null
        : Math.round((qpfItem.value / MILLIMETERS_PER_INCH) * 10_000) / 10_000;
    const startsAt = new Date(startsAtMs).toISOString();
    const endsAt = new Date(endsAtMs).toISOString();
    intervals.push({
      id: `${input.snapshotId}:six-hour:${sequenceIndex}`,
      sourceSnapshotId: input.snapshotId,
      startsAt,
      endsAt,
      probabilityPercent,
      qpfInches,
      qualityStatus: quality(probabilityPercent, qpfInches),
    });
    sequenceIndex += 1;
  }

  return { status: 'normalized', intervals, reasonCodes: [] };
}

function validateSixHourIntervals(
  input: readonly NormalizedNwsSixHourInterval[]
): QpeSequenceReasonCode | null {
  if (input.length === 0) return 'SIX_HOUR_INTERVALS_EMPTY';
  const ids = new Set<string>();
  for (let index = 0; index < input.length; index += 1) {
    const item = input[index];
    const start = Date.parse(item.startsAt);
    const end = Date.parse(item.endsAt);
    if (
      ids.has(item.id) ||
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end - start !== SIX_HOURS_MS ||
      (index > 0 && start !== Date.parse(input[index - 1].endsAt))
    ) {
      return 'SIX_HOUR_INTERVALS_INVALID';
    }
    ids.add(item.id);
  }
  return null;
}

function sumQpf(
  intervals: readonly NormalizedNwsSixHourInterval[]
): number | null {
  if (intervals.length !== 4 || intervals.some((item) => item.qpfInches === null)) {
    return null;
  }
  return Math.round(
    intervals.reduce((sum, item) => sum + (item.qpfInches ?? 0), 0) * 10_000
  ) / 10_000;
}

function makeWindow(
  sequenceId: string,
  kind: 'initial' | 'extension',
  index: number,
  intervals: readonly NormalizedNwsSixHourInterval[],
  probabilityPercent: number | null
): ForecastWindow24h {
  return {
    id: `${sequenceId}:${kind}:${index}`,
    sourceSnapshotId: intervals[0].sourceSnapshotId,
    startsAt: intervals[0].startsAt,
    endsAt: intervals[3].endsAt,
    probabilityPercent,
    qpfInches: sumQpf(intervals),
  };
}

/**
 * Apply the Water Boards six-hour Weather Table method to normalized NWS
 * rows and build non-overlapping 24-hour sequences for the existing pure
 * QPE evaluator. A candidate starts at a six-hour row whose PoP is at
 * least 50%; its QPF is that row plus the following three rows.
 */
export function buildQpeForecastSequences(
  input: readonly NormalizedNwsSixHourInterval[]
): QpeSequenceBuildResult {
  const intervals = [...input].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)
  );
  const invalid = validateSixHourIntervals(intervals);
  if (invalid) return { status: 'unknown', sequences: [], reasonCodes: [invalid] };

  const sequences: QpeForecastSequence[] = [];
  const reasons: QpeSequenceReasonCode[] = [];
  let scanIndex = 0;
  while (scanIndex <= intervals.length - 4) {
    const start = intervals[scanIndex];
    if (start.probabilityPercent === null) {
      if (!reasons.includes('SIX_HOUR_FORECAST_DATA_MISSING')) {
        reasons.push('SIX_HOUR_FORECAST_DATA_MISSING');
      }
      scanIndex += 1;
      continue;
    }
    if (start.probabilityPercent < QPE_INITIAL_POP_PERCENT) {
      scanIndex += 1;
      continue;
    }

    const initialParts = intervals.slice(scanIndex, scanIndex + 4);
    const initialQpf = sumQpf(initialParts);
    if (initialQpf === null) {
      if (!reasons.includes('SIX_HOUR_FORECAST_DATA_MISSING')) {
        reasons.push('SIX_HOUR_FORECAST_DATA_MISSING');
      }
      scanIndex += 1;
      continue;
    }
    if (initialQpf < QPE_INITIAL_QPF_INCHES) {
      scanIndex += 1;
      continue;
    }

    const sequenceId = `qpe-sequence:${start.id}`;
    const windows: ForecastWindow24h[] = [
      makeWindow(sequenceId, 'initial', 0, initialParts, start.probabilityPercent),
    ];
    let extensionStart = scanIndex + 4;
    let endingPeriodStart: number | null = null;
    let extensionIndex = 1;
    while (extensionStart <= intervals.length - 4) {
      const extensionParts = intervals.slice(extensionStart, extensionStart + 4);
      const extensionWindow = makeWindow(
        sequenceId,
        'extension',
        extensionIndex,
        extensionParts,
        extensionParts[0].probabilityPercent
      );
      windows.push(extensionWindow);
      if (extensionWindow.qpfInches === null) {
        if (!reasons.includes('SIX_HOUR_FORECAST_DATA_MISSING')) {
          reasons.push('SIX_HOUR_FORECAST_DATA_MISSING');
        }
        endingPeriodStart = extensionStart;
        break;
      }
      if (extensionWindow.qpfInches < QPE_EXTENSION_QPF_INCHES) {
        endingPeriodStart = extensionStart;
        break;
      }
      extensionStart += 4;
      extensionIndex += 1;
    }

    if (
      endingPeriodStart === null &&
      extensionStart < intervals.length &&
      !reasons.includes('SIX_HOUR_FORECAST_HORIZON_INCOMPLETE')
    ) {
      reasons.push('SIX_HOUR_FORECAST_HORIZON_INCOMPLETE');
    }

    sequences.push({
      id: sequenceId,
      sourceSnapshotId: start.sourceSnapshotId,
      initialSixHourIntervalId: start.id,
      windows,
    });

    if (endingPeriodStart === null) break;
    scanIndex = endingPeriodStart;
  }

  if (sequences.length === 0) {
    const incompleteTail = intervals.slice(Math.max(0, intervals.length - 3));
    if (
      incompleteTail.some(
        (item) =>
          item.probabilityPercent === null ||
          item.probabilityPercent >= QPE_INITIAL_POP_PERCENT
      ) &&
      !reasons.includes('SIX_HOUR_FORECAST_HORIZON_INCOMPLETE')
    ) {
      reasons.push('SIX_HOUR_FORECAST_HORIZON_INCOMPLETE');
    }
  }

  return {
    status: reasons.length > 0 ? 'partial' : 'complete',
    sequences,
    reasonCodes: reasons,
  };
}
