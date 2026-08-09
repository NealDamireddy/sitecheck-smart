/**
 * Phase 3 — make an unverifiable determination a visible task.
 *
 * Phase 1 built the ladder and the evidence tables. This is what actually
 * consults every source, writes down what each one said, and records which one
 * decided. Without it the provenance columns stay null and the ladder is
 * unreachable code.
 *
 * The compliance case this exists for: a NOAA station with a dead gauge
 * reports 0.00", which reads as "no qualifying event", which means no
 * post-storm inspection, which is a violation nobody knows they incurred. The
 * old behaviour was to trust that zero silently. The new behaviour is to
 * consult a second source, keep both answers, and raise a task when the
 * winning answer is not a good measurement.
 *
 * Every snapshot id is derived from its content, so re-running over the same
 * window is idempotent rather than piling up duplicate evidence rows.
 */
import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchObservedPrecip } from './observed';
import {
  OPEN_METEO_PARSER_VERSION,
  fetchOpenMeteoObserved,
} from './open-meteo-observed';
import { detectPrecipitationEvents } from './detect';
import {
  determineQpe,
  type PrecipProvider,
  type PrecipReading,
  type QpeDetermination,
} from './ladder';

export const NOAA_PARSER_VERSION = 'noaa-station-hourly-v1';

interface SnapshotDraft {
  provider: PrecipProvider;
  sourceUrl: string | null;
  stationId: string | null;
  totalInches: number;
  coverage: number;
  quality: 'good' | 'sparse' | 'none';
  raw: unknown;
  parserVersion: string;
}

export interface ResolvedPrecipitation {
  determination: QpeDetermination | null;
  /** Every source consulted, including ones that could not answer. */
  snapshots: SnapshotDraft[];
  windowStart: string;
  windowEnd: string;
  /**
   * Why a QSP is being asked to confirm. Null when the determination rests on
   * a good measurement that nothing contradicts.
   */
  corroborationReason: string | null;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex');
}

function totalOf(hours: Array<{ inches: number }>): number {
  return Math.round(hours.reduce((sum, h) => sum + h.inches, 0) * 100) / 100;
}

/**
 * Consult every source for one window and resolve them through the ladder.
 *
 * Sources are queried in parallel and neither can fail the other — a source
 * that throws simply does not get a vote. Returning a determination of null is
 * a legitimate outcome meaning "nothing could answer", which is a task in
 * itself and must never be read as "no rain".
 */
export async function resolvePrecipitation(
  lat: number,
  lng: number,
  lookbackDays = 3,
  now: Date = new Date()
): Promise<ResolvedPrecipitation> {
  const windowEnd = now.toISOString();
  const windowStart = new Date(
    now.getTime() - lookbackDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const [noaa, openMeteo] = await Promise.all([
    fetchObservedPrecip(lat, lng, lookbackDays, now).catch(() => null),
    fetchOpenMeteoObserved(lat, lng, lookbackDays, now).catch(() => null),
  ]);

  const snapshots: SnapshotDraft[] = [];
  const readings: PrecipReading[] = [];

  if (noaa) {
    const total = totalOf(noaa.hours);
    snapshots.push({
      provider: 'noaa_station',
      sourceUrl: noaa.stationId
        ? `https://api.weather.gov/stations/${noaa.stationId}/observations`
        : null,
      stationId: noaa.stationId,
      totalInches: total,
      coverage: noaa.coverage,
      quality: noaa.quality,
      raw: { hours: noaa.hours, stationId: noaa.stationId, coverage: noaa.coverage },
      parserVersion: NOAA_PARSER_VERSION,
    });
    readings.push({
      provider: 'noaa_station',
      totalInches: total,
      quality: noaa.quality,
      coverage: noaa.coverage,
      detail: noaa.stationId,
    });
  }

  if (openMeteo && !openMeteo.error) {
    const total = totalOf(openMeteo.hours);
    snapshots.push({
      provider: 'open_meteo',
      sourceUrl: openMeteo.sourceUrl,
      stationId: null,
      totalInches: total,
      // A gridded model answers for every hour by construction. That is a
      // statement about availability, not accuracy — the ladder already ranks
      // it below both real gauges.
      coverage: 1,
      quality: 'good',
      raw: openMeteo.raw,
      parserVersion: OPEN_METEO_PARSER_VERSION,
    });
    readings.push({
      provider: 'open_meteo',
      totalInches: total,
      quality: 'good',
      coverage: 1,
      detail: openMeteo.model,
    });
  }

  const determination = determineQpe(readings);

  return {
    determination,
    snapshots,
    windowStart,
    windowEnd,
    corroborationReason: corroborationReason(determination, readings),
  };
}

/**
 * Plain-language reason a QSP is being asked to confirm.
 *
 * Deliberately says what happened rather than "data quality issue" — the
 * person reading this has to decide whether to walk the site, so the message
 * has to carry the actual stake.
 */
function corroborationReason(
  determination: QpeDetermination | null,
  readings: PrecipReading[]
): string | null {
  if (!determination) {
    return readings.length === 0
      ? 'No precipitation source could be reached for this site. Rainfall is unverified — enter your on-site rain gauge reading.'
      : 'Every precipitation source reported unusable data. Rainfall is unverified — enter your on-site rain gauge reading.';
  }

  if (determination.disagreement.length > 0) {
    const worst = determination.disagreement
      .slice()
      .sort((a, b) => b.deltaInches - a.deltaInches)[0];
    return (
      `Sources disagree by ${worst.deltaInches.toFixed(2)}" — ` +
      `${labelFor(determination.decidedBy.provider)} reported ` +
      `${determination.totalInches.toFixed(2)}" and ${labelFor(worst.provider)} reported ` +
      `${worst.totalInches.toFixed(2)}". Confirm with your on-site rain gauge.`
    );
  }

  if (determination.decidedBy.provider === 'open_meteo') {
    return (
      `Rainfall of ${determination.totalInches.toFixed(2)}" is a model estimate — ` +
      `no working rain gauge was available near this site. Confirm with your on-site gauge.`
    );
  }

  if (determination.decidedBy.quality === 'sparse') {
    const pct = Math.round(determination.decidedBy.coverage * 100);
    return (
      `The nearest gauge only reported for ${pct}% of this period, so ` +
      `${determination.totalInches.toFixed(2)}" may under-report the true rainfall. ` +
      `Confirm with your on-site gauge.`
    );
  }

  return null;
}

function labelFor(provider: PrecipProvider): string {
  switch (provider) {
    case 'site_gauge':
      return 'your on-site gauge';
    case 'noaa_station':
      return 'the NOAA gauge';
    case 'open_meteo':
      return 'the model estimate';
  }
}

/**
 * Persist the consulted sources as evidence.
 *
 * Ids are content-derived, so a repeated run over the same window upserts onto
 * the same rows instead of accumulating near-duplicate evidence. Failures are
 * reported, never thrown — losing an evidence write must not take down the
 * workflow surface that triggered it.
 */
export async function persistSnapshots(
  supabase: SupabaseClient,
  projectId: string,
  lat: number,
  lng: number,
  resolved: ResolvedPrecipitation
): Promise<{ written: number; ids: string[]; error?: string }> {
  if (resolved.snapshots.length === 0) return { written: 0, ids: [] };

  const retrievedAt = new Date().toISOString();
  const rows = resolved.snapshots.map((snapshot) => {
    const payloadSha256 = sha256(snapshot.raw);
    const id = `obs-${snapshot.provider}-${sha256([
      projectId,
      snapshot.provider,
      resolved.windowStart,
      resolved.windowEnd,
      payloadSha256,
    ]).slice(0, 24)}`;
    return {
      id,
      project_id: projectId,
      provider: snapshot.provider,
      source_url: snapshot.sourceUrl,
      retrieved_at: retrievedAt,
      latitude: lat,
      longitude: lng,
      station_id: snapshot.stationId,
      window_start: resolved.windowStart,
      window_end: resolved.windowEnd,
      total_inches: snapshot.totalInches,
      coverage: snapshot.coverage,
      quality: snapshot.quality,
      raw_payload: snapshot.raw ?? {},
      payload_sha256: payloadSha256,
      parser_version: snapshot.parserVersion,
      recorded_by: null,
    };
  });

  const { error } = await supabase
    .from('cgp_observation_snapshots')
    .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });

  if (error) return { written: 0, ids: [], error: error.message };
  return { written: rows.length, ids: rows.map((r) => r.id) };
}

/**
 * Detect events from whichever source won, so callers get the same
 * PrecipitationEvent[] shape the existing engine produces.
 */
export async function eventsFromWinningSource(
  lat: number,
  lng: number,
  lookbackDays = 3,
  now: Date = new Date()
) {
  const resolved = await resolvePrecipitation(lat, lng, lookbackDays, now);
  const winner = resolved.determination?.decidedBy.provider;

  if (winner === 'open_meteo') {
    const om = await fetchOpenMeteoObserved(lat, lng, lookbackDays, now);
    return { resolved, events: detectPrecipitationEvents(om.hours, now) };
  }
  if (winner === 'noaa_station') {
    const noaa = await fetchObservedPrecip(lat, lng, lookbackDays, now);
    return { resolved, events: detectPrecipitationEvents(noaa.hours, now) };
  }
  return { resolved, events: [] };
}
