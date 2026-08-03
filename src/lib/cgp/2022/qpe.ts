import {
  CGP_2022_DRAFT_RULE_VERSION,
  QPE_EXTENSION_QPF_INCHES,
  QPE_INITIAL_POP_PERCENT,
  QPE_INITIAL_QPF_INCHES,
  type ForecastWindow24h,
  type QpeForecastDecision,
  type QpeReasonCode,
} from './types';

function baseDecision(
  status: QpeForecastDecision['status'],
  reasonCodes: QpeReasonCode[]
): QpeForecastDecision {
  return {
    status,
    ruleVersion: CGP_2022_DRAFT_RULE_VERSION,
    startsAt: null,
    predictedEndsAt: null,
    initialWindowId: null,
    eventWindowIds: [],
    evidenceWindowIds: [],
    evidenceSnapshotIds: [],
    reasonCodes,
  };
}

function isValidWindow(window: ForecastWindow24h): boolean {
  const startsAt = Date.parse(window.startsAt);
  const endsAt = Date.parse(window.endsAt);
  return (
    window.id.trim().length > 0 &&
    window.sourceSnapshotId.trim().length > 0 &&
    Number.isFinite(startsAt) &&
    Number.isFinite(endsAt) &&
    startsAt < endsAt &&
    (window.probabilityPercent === null ||
      (Number.isFinite(window.probabilityPercent) &&
        window.probabilityPercent >= 0 &&
        window.probabilityPercent <= 100)) &&
    (window.qpfInches === null ||
      (Number.isFinite(window.qpfInches) && window.qpfInches >= 0))
  );
}

function unique<T extends string>(values: T[]): T[] {
  return [...new Set(values)];
}

/**
 * Evaluate already-normalized, discrete forecast periods using the draft
 * 2022 CGP QPE thresholds. This function does not fetch or aggregate NWS
 * data and has no side effects.
 *
 * Safety behavior:
 * - missing/malformed inputs return `unknown`;
 * - a known qualifying initial period still qualifies when later extension
 *   data is missing, but its predicted end remains unknown;
 * - probability is used for the initial period only, not extensions.
 */
export function evaluateQpeForecast(
  input: readonly ForecastWindow24h[]
): QpeForecastDecision {
  if (input.length === 0) {
    return baseDecision('unknown', ['FORECAST_WINDOWS_EMPTY']);
  }

  if (input.some((window) => !isValidWindow(window))) {
    return baseDecision('unknown', ['FORECAST_WINDOW_INVALID']);
  }

  const windows = [...input].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)
  );

  for (let index = 1; index < windows.length; index += 1) {
    if (Date.parse(windows[index].startsAt) < Date.parse(windows[index - 1].endsAt)) {
      return baseDecision('unknown', ['FORECAST_WINDOW_INVALID']);
    }
  }

  const initialIndex = windows.findIndex(
    (window) =>
      window.probabilityPercent !== null &&
      window.qpfInches !== null &&
      window.probabilityPercent >= QPE_INITIAL_POP_PERCENT &&
      window.qpfInches >= QPE_INITIAL_QPF_INCHES
  );

  if (initialIndex === -1) {
    const hasMissingData = windows.some(
      (window) =>
        window.probabilityPercent === null || window.qpfInches === null
    );
    return {
      ...baseDecision(
        hasMissingData ? 'unknown' : 'does-not-qualify',
        [hasMissingData ? 'FORECAST_DATA_MISSING' : 'INITIAL_THRESHOLDS_NOT_MET']
      ),
      evidenceWindowIds: windows.map((window) => window.id),
      evidenceSnapshotIds: unique(
        windows.map((window) => window.sourceSnapshotId)
      ),
    };
  }

  const initial = windows[initialIndex];
  const evidence = [initial];
  const eventWindows = [initial];
  const reasonCodes: QpeReasonCode[] = ['INITIAL_THRESHOLD_MET'];
  let currentEnd = initial.endsAt;
  let predictedEndsAt: string | null = null;

  for (let index = initialIndex + 1; index < windows.length; index += 1) {
    const next = windows[index];
    if (Date.parse(next.startsAt) !== Date.parse(currentEnd)) {
      reasonCodes.push('EXTENSION_SEQUENCE_INCOMPLETE');
      break;
    }

    evidence.push(next);
    if (next.qpfInches === null) {
      reasonCodes.push('EXTENSION_QPF_MISSING');
      break;
    }

    if (next.qpfInches >= QPE_EXTENSION_QPF_INCHES) {
      currentEnd = next.endsAt;
      eventWindows.push(next);
      reasonCodes.push('EVENT_EXTENDED_QPF_THRESHOLD_MET');
      continue;
    }

    predictedEndsAt = currentEnd;
    reasonCodes.push('EVENT_END_QPF_BELOW_THRESHOLD');
    break;
  }

  if (
    predictedEndsAt === null &&
    !reasonCodes.includes('EXTENSION_QPF_MISSING') &&
    !reasonCodes.includes('EXTENSION_SEQUENCE_INCOMPLETE')
  ) {
    reasonCodes.push('EXTENSION_FORECAST_HORIZON_EXHAUSTED');
  }

  return {
    status: 'qualifies',
    ruleVersion: CGP_2022_DRAFT_RULE_VERSION,
    startsAt: initial.startsAt,
    predictedEndsAt,
    initialWindowId: initial.id,
    eventWindowIds: eventWindows.map((window) => window.id),
    evidenceWindowIds: evidence.map((window) => window.id),
    evidenceSnapshotIds: unique(
      evidence.map((window) => window.sourceSnapshotId)
    ),
    reasonCodes: unique(reasonCodes),
  };
}
