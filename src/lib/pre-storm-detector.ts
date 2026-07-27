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
import {
  PRE_STORM_LEAD_DAYS,
  PRE_STORM_POP_THRESHOLD,
  QPE_THRESHOLD_INCHES,
} from '@/lib/cgp/constants';
import type { WeatherDay } from '@/types/weather';

// Thresholds live in src/lib/cgp/constants.ts; re-exported for the
// cron route and any existing consumers.
export { PRE_STORM_LEAD_DAYS, PRE_STORM_POP_THRESHOLD };

export interface PreStormDetection {
  /** First forecast day that triggered detection (YYYY-MM-DD, site-local). */
  forecastDate: string;
  /** Probability of precipitation on that day, 0–100. */
  peakPop: number;
  /** Forecast precipitation in inches for that day (NOAA QPF). */
  expectedPrecipitationInches: number;
  /**
   * What fired: 'qpf' — forecast rainfall alone reaches the QPE
   * threshold (a qualifying event is expected); 'pop' — no qualifying
   * QPF, but precipitation is likely enough to warrant pre-storm prep.
   */
  signal: 'qpf' | 'pop';
}

/**
 * Decide whether the site is in a pre-storm state within the lead
 * window. The primary signal is QUANTITATIVE: a forecast day whose QPF
 * reaches the QPE threshold (0.5″). Probability-of-precipitation is a
 * secondary nudge only — the old implementation used PoP alone, which
 * the review flagged: probabilities cannot stand in for the permit's
 * quantitative rule.
 */
export async function detectPreStormForCoords(
  lat: number,
  lng: number
): Promise<PreStormDetection | null> {
  const forecast: WeatherDay[] = await fetchForecast({ lat, lng });
  const windowDays = forecast.slice(0, PRE_STORM_LEAD_DAYS);

  for (const day of windowDays) {
    if (day.precipitationInches >= QPE_THRESHOLD_INCHES) {
      return {
        forecastDate: day.date,
        peakPop: day.precipitationChance,
        expectedPrecipitationInches: day.precipitationInches,
        signal: 'qpf',
      };
    }
  }
  for (const day of windowDays) {
    if (day.precipitationChance >= PRE_STORM_POP_THRESHOLD) {
      return {
        forecastDate: day.date,
        peakPop: day.precipitationChance,
        expectedPrecipitationInches: day.precipitationInches,
        signal: 'pop',
      };
    }
  }
  return null;
}
