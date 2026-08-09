/**
 * Which precipitation source decides a QPE, and what the others said.
 *
 * A QPE determination triggers a legally required inspection, so the number is
 * only half the answer — "according to what" is the other half. This module
 * picks a winner from the available readings, records the losers, and flags
 * material disagreement instead of silently preferring one.
 *
 * The ordering encodes a claim about evidence, not about data quality:
 *
 *   1. site_gauge          a measurement AT the site, entered by the QSP.
 *                          What the CGP actually contemplates.
 *   2. noaa_station good   a measurement near the site, official public
 *                          record, defensible if challenged.
 *   3. open_meteo          a model ESTIMATE. Always available, never a
 *                          measurement.
 *   4. noaa_station sparse a partial measurement — a gauge that reported for
 *                          some of the window.
 *
 * Tiers 3 and 4 are the debatable pair, and the choice is isolated to
 * TIER_ORDER below so it is one line to reverse. A sparse gauge is ranked
 * last because its failure mode is silent under-reporting: a gauge that read
 * for 30% of a storm reports ~30% of the rain and looks like a confident
 * small number. A model that is wrong is usually wrong in either direction and
 * is labelled an estimate. Under-reporting is the dangerous direction here,
 * because it is what turns a qualifying event into a missed inspection.
 *
 * A forecast is never a tier. Anticipation is not a statement about rain that
 * fell, and `weather-api.ts` already documents forecast `isQPE` as
 * anticipation only.
 */
import { QPE_THRESHOLD_INCHES } from '@/lib/cgp/constants';

export type PrecipProvider = 'site_gauge' | 'noaa_station' | 'open_meteo';
export type PrecipQuality = 'good' | 'sparse' | 'none';

/** One source's answer for one window. */
export interface PrecipReading {
  provider: PrecipProvider;
  totalInches: number;
  quality: PrecipQuality;
  /** Fraction of the window backed by real readings. Models are 1. */
  coverage: number;
  /** Station id, model name — whatever identifies this particular source. */
  detail?: string | null;
}

/** A reading paired with the tier it occupies. */
interface RankedReading extends PrecipReading {
  tier: number;
}

/**
 * Difference at which two sources are treated as telling different stories.
 *
 * 0.15" is well inside the 0.5" threshold, so a disagreement can flip a
 * determination without either source being obviously broken. That is exactly
 * the case a human should look at.
 */
export const DISAGREEMENT_THRESHOLD_INCHES = 0.15;

/**
 * Tier assignment. The one place the precedence decision lives.
 * Lower number wins. `null` means the reading is not usable at all.
 */
function tierOf(reading: PrecipReading): number | null {
  // A source that knows it has nothing must never decide anything. This is
  // the confident-zero failure: a dead gauge reporting 0.00" reads as "no
  // event" and silently cancels a required inspection.
  if (reading.quality === 'none') return null;

  switch (reading.provider) {
    case 'site_gauge':
      return 1;
    case 'noaa_station':
      return reading.quality === 'good' ? 2 : 4;
    case 'open_meteo':
      return 3;
    default:
      return null;
  }
}

export interface QpeDetermination {
  /** True when the winning reading is at or above the CGP threshold. */
  qualifies: boolean;
  totalInches: number;
  /** The reading that decided it. */
  decidedBy: PrecipReading;
  /** Readings that did not decide it, nearest tier first. */
  otherReadings: PrecipReading[];
  /**
   * Sources that differ from the winner by more than the threshold.
   * Empty when everything agrees. Non-empty means a human should look.
   */
  disagreement: Array<{
    provider: PrecipProvider;
    totalInches: number;
    deltaInches: number;
  }>;
  /**
   * True when the determination rests on an estimate or a partial gauge
   * rather than a good measurement — the signal Phase 3 turns into a task.
   */
  needsCorroboration: boolean;
}

/**
 * Resolve the available readings into one determination.
 *
 * Returns null when nothing usable was supplied — which is itself a reportable
 * state, not a zero. Callers must not treat "no answer" as "no rain".
 */
export function determineQpe(readings: PrecipReading[]): QpeDetermination | null {
  const ranked: RankedReading[] = [];
  for (const reading of readings) {
    if (!Number.isFinite(reading.totalInches) || reading.totalInches < 0) continue;
    const tier = tierOf(reading);
    if (tier == null) continue;
    ranked.push({ ...reading, tier });
  }

  if (ranked.length === 0) return null;

  ranked.sort((a, b) => a.tier - b.tier);
  const [winner, ...others] = ranked;

  const disagreement = others
    .map((other) => ({
      provider: other.provider,
      totalInches: other.totalInches,
      deltaInches:
        Math.round(Math.abs(other.totalInches - winner.totalInches) * 100) / 100,
    }))
    .filter((d) => d.deltaInches > DISAGREEMENT_THRESHOLD_INCHES);

  return {
    qualifies: winner.totalInches >= QPE_THRESHOLD_INCHES,
    totalInches: winner.totalInches,
    decidedBy: stripTier(winner),
    otherReadings: others.map(stripTier),
    disagreement,
    // Tier 1 and 2 are measurements and stand on their own. Anything else, or
    // any material disagreement, wants a human to confirm.
    needsCorroboration: winner.tier > 2 || disagreement.length > 0,
  };
}

function stripTier(reading: RankedReading): PrecipReading {
  const { tier: _tier, ...rest } = reading;
  void _tier;
  return rest;
}
