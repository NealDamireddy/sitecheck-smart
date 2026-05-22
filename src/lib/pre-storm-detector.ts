/**
 * Pre-storm detector for the cron job at /api/cron/pre-storm-detector.
 *
 * Distinct from `src/lib/rain-event-detector.ts`, which scans *past*
 * QPE events to auto-draft post-storm inspections. This file looks
 * *forward* at the 7-day forecast and decides whether a site is in a
 * pre-storm state — i.e., a qualifying rain event is probable within
 * the lead window used by CGP 2022 pre-storm inspections.
 */

import { fetchForecast } from './weather-api';
import type { WeatherDay } from '@/types/weather';

/**
 * Threshold for "this storm is likely." 70% matches the dashboard
 * widget's existing copy and the workflow doc's spec.
 */
export const PRE_STORM_POP_THRESHOLD = 70;

/**
 * Lead-time window we scan. Pre-storm inspections under CGP 2022 must
 * happen within 24 h of an expected qualifying event. We look 3 days
 * out so once-daily polling (Vercel Hobby cron) still catches storms
 * that drop into the forecast in the 24 h after our previous run —
 * a 2-day window leaves no margin and can miss late-appearing storms
 * by a few hours.
 */
export const PRE_STORM_LEAD_DAYS = 3;

export interface PreStormDetection {
  /** First forecast day that crossed the PoP threshold (YYYY-MM-DD). */
  forecastDate: string;
  /** Probability of precipitation on that day, 0–100. */
  peakPop: number;
  /** Forecast precipitation in inches for that day. */
  expectedPrecipitationInches: number;
}

/**
 * Pull the forecast for the given coordinates and decide whether any
 * day in the next `PRE_STORM_LEAD_DAYS` exceeds `PRE_STORM_POP_THRESHOLD`.
 * Returns `null` when conditions are clear.
 */
export async function detectPreStormForCoords(
  lat: number,
  lng: number
): Promise<PreStormDetection | null> {
  const forecast: WeatherDay[] = await fetchForecast({ lat, lng });

  // Forecast comes back in chronological order from today onward.
  // Slice to the lead window so a high-PoP day a week out doesn't
  // false-positive the pre-storm flow.
  const windowDays = forecast.slice(0, PRE_STORM_LEAD_DAYS);

  for (const day of windowDays) {
    if (day.precipitationChance >= PRE_STORM_POP_THRESHOLD) {
      return {
        forecastDate: day.date,
        peakPop: day.precipitationChance,
        expectedPrecipitationInches: day.precipitationInches,
      };
    }
  }

  return null;
}
