/**
 * Rain-event detection — OBSERVED rainfall, CGP-correct rules (CMP-02).
 *
 * Rebuilt in the Stage 3 hardening pass. The previous implementation
 * read the OpenWeatherMap *forecast* and treated it as history — it
 * could not see rain that had already fallen, never applied the CGP's
 * 48-hour event-separation rule, and bucketed precipitation on UTC
 * calendar days (splitting California evening storms). Net effect: real
 * qualifying events were never detected, so the QSP was never notified.
 *
 * Now:
 *   * data source: NOAA station observations (src/lib/qpe/observed.ts)
 *     — the official public record of rain that fell at the site;
 *   * event rules: src/lib/qpe/detect.ts — ≥ 0.5″ cumulative, events
 *     separated by ≥ 48 dry hours, pure UTC instants;
 *   * deadline: the post-storm inspection window runs from when the
 *     rain ENDED (last observed rainfall), per risk level — not from
 *     when the storm started, as the old code had it (a 3-day storm's
 *     deadline could pass before the rain stopped).
 *
 * The `DetectedRainEvent` shape is kept compatible with its consumers
 * (check-rain-events route, rain-event-store); new fields are additive.
 */

import {
  postStormWindowHours,
  QPE_THRESHOLD_INCHES,
} from '@/lib/cgp/constants';
import { latestQualifyingEvent } from '@/lib/qpe/detect';
import { fetchObservedPrecip } from '@/lib/qpe/observed';
import { log } from '@/lib/logger';

export interface DetectedRainEvent {
  /** ISO 8601 — first observed rainfall of the event. */
  startedAt: string;
  /** ISO 8601 — last observed rainfall. Absent while rain is ongoing. */
  endedAt?: string;
  /** Cumulative observed rainfall for the event, inches. */
  totalPrecipitationInches: number;
  /** True when the total is ≥ QPE_THRESHOLD_INCHES (0.5″). */
  isQpe: boolean;
  /** ISO 8601 — post-storm inspection deadline (rain end + window). */
  inspectionDueBy: string;
  /** Stable id derived from startedAt — used for inspection idempotency. */
  id: string;
  /** True while the 48 h separation window hasn't closed — still raining
   *  or recently stopped; the deadline can still move later. */
  ongoing?: boolean;
  /** NOAA station the observations came from (e.g. "KFAT"). */
  stationId?: string | null;
  /** 'good' | 'sparse' — how complete the gauge record was. A null
   *  return with sparse data means "could not determine", not "no rain". */
  dataQuality?: 'good' | 'sparse';
}

const LOOKBACK_DAYS = 7;

/**
 * Most recent qualifying precipitation event for a project site within
 * the last 7 days, from observed NOAA gauge data. Pure read — never
 * writes; the caller (check-rain-events) owns inspection creation.
 *
 * Returns null when: no qualifying event, or no usable gauge data
 * (`fetchObservedPrecip` quality 'none'). Sparse-but-present data is
 * used and flagged via `dataQuality`.
 */
export async function detectRainEventForProject(
  _projectId: string,
  coords?: { lat: number; lng: number },
  riskLevel: 1 | 2 | 3 = 1
): Promise<DetectedRainEvent | null> {
  if (!coords) {
    // Without site coordinates there is nothing defensible to observe.
    // The old code silently fell back to Fresno — one city's weather
    // shown for every project was Neal's "inconsistent by location" bug.
    return null;
  }

  const now = new Date();
  const observed = await fetchObservedPrecip(
    coords.lat,
    coords.lng,
    LOOKBACK_DAYS,
    now
  );

  if (observed.quality === 'none') {
    if (observed.error) {
      log.warn('rain-event-detector: no usable gauge data —', { detail: observed.error });
    }
    return null;
  }

  const event = latestQualifyingEvent(observed.hours, now, LOOKBACK_DAYS);
  if (!event) return null;

  const windowHours = postStormWindowHours(riskLevel);
  const rainEndMs = new Date(event.lastRainAt).getTime();
  const inspectionDueBy = new Date(
    rainEndMs + windowHours * 3_600_000
  ).toISOString();

  return {
    startedAt: event.startedAt,
    endedAt: event.ongoing ? undefined : event.lastRainAt,
    totalPrecipitationInches: event.totalInches,
    isQpe: event.totalInches >= QPE_THRESHOLD_INCHES,
    inspectionDueBy,
    id: `rain-${event.startedAt.slice(0, 10)}`,
    ongoing: event.ongoing,
    stationId: observed.stationId,
    dataQuality: observed.quality === 'good' ? 'good' : 'sparse',
  };
}
