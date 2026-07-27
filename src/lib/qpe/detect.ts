/**
 * QPE detection engine (CMP-01/CMP-02) — pure logic, no I/O.
 *
 * Implements the actual CGP 2022 Qualifying Precipitation Event rule
 * over a series of OBSERVED hourly rainfall totals:
 *
 *   * an event is a run of measurable rain; a dry gap shorter than
 *     QPE_SEPARATION_HOURS (48 h) does NOT split it — rain that resumes
 *     within the window is the same event;
 *   * an event ends only after 48 consecutive dry hours (or the end of
 *     the observation series);
 *   * an event QUALIFIES when its cumulative total is
 *     ≥ QPE_THRESHOLD_INCHES (0.5″).
 *
 * The previous implementation approximated this from OpenWeatherMap
 * *forecast* days bucketed on UTC calendar dates — it could neither see
 * rain that had already fallen nor apply the 48-hour separation, and a
 * California evening storm split across two UTC days could dodge the
 * 0.5″ threshold entirely. This engine works on UTC instants only;
 * calendar days never enter the math.
 *
 * All inputs/outputs are ISO 8601 instants. Callers supply `now` so
 * tests never touch the wall clock.
 */

import {
  QPE_SEPARATION_HOURS,
  QPE_THRESHOLD_INCHES,
  TRACE_PRECIP_INCHES,
} from '@/lib/cgp/constants';

export interface ObservedHour {
  /** ISO 8601 instant for the START of the hour. */
  time: string;
  /** Rainfall during that hour, in inches. Never negative. */
  inches: number;
}

export interface PrecipitationEvent {
  /** First wet hour, ISO 8601. */
  startedAt: string;
  /** Last wet hour (start-of-hour instant), ISO 8601. */
  lastRainAt: string;
  /** Cumulative rainfall across the event, inches (2 dp). */
  totalInches: number;
  /** True when totalInches ≥ QPE_THRESHOLD_INCHES. */
  qualifies: boolean;
  /**
   * True when fewer than QPE_SEPARATION_HOURS dry hours have elapsed
   * since lastRainAt as of `now` — the event may still accumulate.
   */
  ongoing: boolean;
  /** Wet hours observed within the event (data-quality signal). */
  wetHours: number;
}

const HOUR_MS = 3_600_000;

/**
 * Group an hourly series into precipitation events per the CGP rules.
 * The series may be sparse (missing hours are treated as dry) and in
 * any order; it is sorted internally.
 */
export function detectPrecipitationEvents(
  hours: ObservedHour[],
  now: Date
): PrecipitationEvent[] {
  const wet = hours
    .filter((h) => h.inches > TRACE_PRECIP_INCHES)
    .map((h) => ({ t: new Date(h.time).getTime(), inches: h.inches }))
    .filter((h) => Number.isFinite(h.t) && h.t <= now.getTime())
    .sort((a, b) => a.t - b.t);

  if (wet.length === 0) return [];

  const gapMs = QPE_SEPARATION_HOURS * HOUR_MS;
  const events: PrecipitationEvent[] = [];

  let start = wet[0].t;
  let last = wet[0].t;
  let total = wet[0].inches;
  let count = 1;

  const flush = () => {
    events.push({
      startedAt: new Date(start).toISOString(),
      lastRainAt: new Date(last).toISOString(),
      totalInches: Math.round(total * 100) / 100,
      qualifies: total >= QPE_THRESHOLD_INCHES,
      ongoing: now.getTime() - last < gapMs,
      wetHours: count,
    });
  };

  for (let i = 1; i < wet.length; i++) {
    const h = wet[i];
    if (h.t - last >= gapMs) {
      // ≥48 dry hours: the previous event is closed; a new one begins.
      flush();
      start = h.t;
      total = 0;
      count = 0;
    }
    last = h.t;
    total += h.inches;
    count += 1;
  }
  flush();

  return events;
}

/**
 * The most recent QUALIFYING event whose last rainfall falls within
 * `lookbackDays` of `now`, or null. This is what triggers the
 * post-storm inspection workflow.
 */
export function latestQualifyingEvent(
  hours: ObservedHour[],
  now: Date,
  lookbackDays: number
): PrecipitationEvent | null {
  const cutoff = now.getTime() - lookbackDays * 24 * HOUR_MS;
  const qualifying = detectPrecipitationEvents(hours, now).filter(
    (e) => e.qualifies && new Date(e.lastRainAt).getTime() >= cutoff
  );
  return qualifying.length > 0 ? qualifying[qualifying.length - 1] : null;
}
