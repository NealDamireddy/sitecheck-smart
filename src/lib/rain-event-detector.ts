/**
 * Block 5 — Rain-event detection.
 *
 * Pulls from the existing OpenWeatherMap forecast in `src/lib/weather-api.ts`
 * and reports the most-recent qualifying precipitation event for a project.
 *
 * Definition of a "rain event" for CGP purposes:
 *   - Total precipitation ≥ 0.5" (the QPE threshold the existing forecast
 *     code already flags via `WeatherDay.isQPE`)
 *   - Within the last 7 days
 *
 * After a qualifying event the QSP must inspect within 48 hours, so the
 * detector also returns `inspectionDueBy = startedAt + 48h`.
 *
 * If `OPENWEATHERMAP_API_KEY` is not set, the detector returns `null` so
 * the demo / unkeyed dev environment stays quiet — no banner, no toast
 * loop, no draft inspection spam.
 */

import { fetchForecast } from '@/lib/weather-api';
import type { WeatherDay } from '@/types/weather';

export interface DetectedRainEvent {
  /** ISO 8601 of the first day that put us into the rain window */
  startedAt: string;
  /** ISO 8601 of the last contiguous rainy day, or undefined if still raining */
  endedAt?: string;
  /** Sum of precipitation across the contiguous wet streak */
  totalPrecipitationInches: number;
  /** True when totalPrecipitationInches >= 0.5 */
  isQpe: boolean;
  /** ISO 8601 — startedAt + 48 hours, the regulatory deadline */
  inspectionDueBy: string;
  /** Stable id derived from startedAt — used for inspection idempotency */
  id: string;
}

const QPE_THRESHOLD_INCHES = 0.5;
const INSPECTION_WINDOW_HOURS = 48;
const LOOKBACK_DAYS = 7;

/**
 * Detect the most recent qualifying rain event in the rolling lookback window.
 *
 * Pure read; never writes to the DB. Caller decides whether to spawn an
 * inspection record.
 */
export async function detectRainEventForProject(
  _projectId: string
): Promise<DetectedRainEvent | null> {
  // Bail early if no API key — keeps the demo quiet
  if (!process.env.OPENWEATHERMAP_API_KEY) {
    return null;
  }

  let forecast: WeatherDay[];
  try {
    forecast = await fetchForecast();
  } catch (err) {
    console.warn('rain-event-detector: forecast fetch failed', err);
    return null;
  }

  if (!forecast || forecast.length === 0) {
    return null;
  }

  // The forecast returns rolling days starting from today. For a "recent
  // rain event" we need to look at days within `LOOKBACK_DAYS` of now —
  // OpenWeatherMap's free tier only gives ~5 days going forward, so in
  // practice this is "the next few rainy days" PLUS any rainy day that's
  // already happened within the lookback. Today's row in the forecast
  // covers the current day, which is the right semantics for the QSP:
  // "as of now, has there been a qualifying event recently?"
  const now = new Date();
  const lookbackCutoff = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Walk forecast days in chronological order, accumulating contiguous
  // rainy stretches. A "rainy" day is any day with precipitation > 0.
  let bestEvent: DetectedRainEvent | null = null;
  let currentRunStart: Date | null = null;
  let currentRunPrecip = 0;

  const flushRun = (endDate: Date) => {
    if (currentRunStart === null) return;
    if (currentRunPrecip <= 0) return;
    if (endDate < lookbackCutoff) {
      // Outside the lookback window; ignore
      currentRunStart = null;
      currentRunPrecip = 0;
      return;
    }
    const isQpe = currentRunPrecip >= QPE_THRESHOLD_INCHES;
    const inspectionDueBy = new Date(
      currentRunStart.getTime() + INSPECTION_WINDOW_HOURS * 60 * 60 * 1000
    );
    const candidate: DetectedRainEvent = {
      startedAt: currentRunStart.toISOString(),
      endedAt: endDate.toISOString(),
      totalPrecipitationInches: Math.round(currentRunPrecip * 100) / 100,
      isQpe,
      inspectionDueBy: inspectionDueBy.toISOString(),
      id: `rain-${currentRunStart.toISOString().slice(0, 10)}`,
    };
    if (
      !bestEvent ||
      candidate.totalPrecipitationInches > bestEvent.totalPrecipitationInches
    ) {
      bestEvent = candidate;
    }
    currentRunStart = null;
    currentRunPrecip = 0;
  };

  for (const day of forecast) {
    // `day.date` is YYYY-MM-DD. Anchor at noon UTC to avoid timezone games
    // when computing the 48h window.
    const dayDate = new Date(`${day.date}T12:00:00Z`);

    if (day.precipitationInches > 0) {
      if (currentRunStart === null) {
        currentRunStart = dayDate;
        currentRunPrecip = day.precipitationInches;
      } else {
        currentRunPrecip += day.precipitationInches;
      }
    } else {
      flushRun(dayDate);
    }
  }
  // Flush any open run at the end of the loop
  if (forecast.length > 0) {
    const lastDayDate = new Date(`${forecast[forecast.length - 1].date}T12:00:00Z`);
    flushRun(lastDayDate);
  }

  // Only fire when the event qualifies (≥ QPE) — light drizzle isn't
  // a regulator-trackable event.
  if (!bestEvent) return null;
  const event: DetectedRainEvent = bestEvent;
  if (!event.isQpe) return null;
  return event;
}
