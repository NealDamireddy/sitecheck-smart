import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { normalizeNwsGridForecast } from './nws-forecast';

export const NWS_COMPLIANCE_PARSER_VERSION = 'nws-grid-six-hour-v2';
const NWS_BASE_URL = 'https://api.weather.gov';
const REQUEST_TIMEOUT_MS = 15_000;

const gridValueSchema = z.object({
  validTime: z.string().min(1),
  value: z.number().nullable(),
});

const gridSeriesSchema = z.object({
  uom: z.string().min(1),
  values: z.array(gridValueSchema),
});

const pointsSchema = z.object({
  properties: z.object({
    forecastGridData: z.string().url(),
  }),
});

const gridSchema = z.object({
  properties: z.object({
    updateTime: z.string().optional(),
    probabilityOfPrecipitation: gridSeriesSchema,
    quantitativePrecipitation: gridSeriesSchema,
  }),
});

export class NwsForecastCaptureError extends Error {
  constructor(
    message: string,
    readonly kind: 'configuration' | 'upstream' | 'invalid-response'
  ) {
    super(message);
    this.name = 'NwsForecastCaptureError';
  }
}

export interface CapturedNwsForecast {
  snapshot: {
    id: string;
    project_id: string;
    provider: 'nws';
    source_url: string;
    retrieved_at: string;
    issued_at: string | null;
    latitude: number;
    longitude: number;
    site_timezone: string;
    raw_payload: unknown;
    payload_sha256: string;
    parser_version: typeof NWS_COMPLIANCE_PARSER_VERSION;
    normalization_status: 'normalized' | 'unknown';
    normalization_reason_codes: string[];
  };
  intervals: Array<{
    id: string;
    snapshot_id: string;
    project_id: string;
    sequence_index: number;
    starts_at: string;
    ends_at: string;
    probability_percent: number | null;
    qpf_inches: number | null;
    quality_status: string;
  }>;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

export function hashForecastPayload(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

async function fetchNwsJson(url: string, userAgent: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: 'application/geo+json',
        'User-Agent': userAgent,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new NwsForecastCaptureError('NWS request failed', 'upstream');
  }
  if (!response.ok) {
    throw new NwsForecastCaptureError(
      `NWS request returned ${response.status}`,
      'upstream'
    );
  }
  try {
    return await response.json();
  } catch {
    throw new NwsForecastCaptureError('NWS returned invalid JSON', 'invalid-response');
  }
}

function validIssuedAt(value: string | undefined): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export async function captureNwsForecast(input: {
  projectId: string;
  latitude: number;
  longitude: number;
  siteTimezone: string;
  userAgent: string;
}): Promise<CapturedNwsForecast> {
  if (input.userAgent.trim().length === 0) {
    throw new NwsForecastCaptureError(
      'NOAA_USER_AGENT is not configured',
      'configuration'
    );
  }

  const pointsUrl = `${NWS_BASE_URL}/points/${input.latitude.toFixed(4)},${input.longitude.toFixed(4)}`;
  const rawPoints = await fetchNwsJson(pointsUrl, input.userAgent);
  const parsedPoints = pointsSchema.safeParse(rawPoints);
  if (!parsedPoints.success) {
    throw new NwsForecastCaptureError(
      'NWS points response is missing forecastGridData',
      'invalid-response'
    );
  }

  const gridUrl = parsedPoints.data.properties.forecastGridData;
  const rawGrid = await fetchNwsJson(gridUrl, input.userAgent);
  const parsedGrid = gridSchema.safeParse(rawGrid);
  if (!parsedGrid.success) {
    throw new NwsForecastCaptureError(
      'NWS grid response is missing required precipitation series',
      'invalid-response'
    );
  }

  const snapshotId = `cgp-forecast-${randomUUID()}`;
  const retrievedAt = new Date().toISOString();
  const rawPayload = { points: rawPoints, grid: rawGrid };
  const normalized = normalizeNwsGridForecast({
    snapshotId,
    notBefore: retrievedAt,
    probabilityOfPrecipitation:
      parsedGrid.data.properties.probabilityOfPrecipitation,
    quantitativePrecipitation:
      parsedGrid.data.properties.quantitativePrecipitation,
  });

  return {
    snapshot: {
      id: snapshotId,
      project_id: input.projectId,
      provider: 'nws',
      source_url: gridUrl,
      retrieved_at: retrievedAt,
      issued_at: validIssuedAt(parsedGrid.data.properties.updateTime),
      latitude: input.latitude,
      longitude: input.longitude,
      site_timezone: input.siteTimezone,
      raw_payload: rawPayload,
      payload_sha256: hashForecastPayload(rawPayload),
      parser_version: NWS_COMPLIANCE_PARSER_VERSION,
      normalization_status: normalized.status,
      normalization_reason_codes: normalized.reasonCodes,
    },
    intervals: normalized.intervals.map((interval, sequenceIndex) => ({
      id: interval.id,
      snapshot_id: snapshotId,
      project_id: input.projectId,
      sequence_index: sequenceIndex,
      starts_at: interval.startsAt,
      ends_at: interval.endsAt,
      probability_percent: interval.probabilityPercent,
      qpf_inches: interval.qpfInches,
      quality_status: interval.qualityStatus,
    })),
  };
}
