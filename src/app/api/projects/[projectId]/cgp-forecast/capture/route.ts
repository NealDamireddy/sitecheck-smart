import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  captureNwsForecast,
  NwsForecastCaptureError,
} from '@/lib/cgp/2022/nws-capture';
import { log } from '@/lib/logger';
import { forecastCaptureLimiter, rateLimitOrNull } from '@/lib/rate-limit';

const SITE_TIMEZONE = 'America/Los_Angeles';

interface ProjectRow {
  id: string;
  center_lat: number | string | null;
  center_lng: number | string | null;
}

function validProjectCoordinates(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    !(latitude === 0 && longitude === 0)
  );
}

/**
 * Capture official NWS forecast evidence for a project. This endpoint only
 * stores evidence; it does not create QPE events, requirements, inspections,
 * notifications, or SMARTS records.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { projectId } = await params;

  const limited = rateLimitOrNull(
    forecastCaptureLimiter,
    auth.user.id,
    'NWS forecast capture'
  );
  if (limited) return limited;

  const { data, error: projectError } = await auth.supabase
    .from('projects')
    .select('id, center_lat, center_lng')
    .eq('id', projectId)
    .maybeSingle();
  const project = data as ProjectRow | null;
  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const latitude = Number(project.center_lat);
  const longitude = Number(project.center_lng);
  if (!validProjectCoordinates(latitude, longitude)) {
    return NextResponse.json(
      { error: 'Project coordinates must be confirmed before capturing a forecast.' },
      { status: 422 }
    );
  }

  const userAgent = process.env.NOAA_USER_AGENT?.trim();
  if (!userAgent) {
    return NextResponse.json(
      { error: 'NWS forecast capture is not configured.' },
      { status: 503 }
    );
  }

  try {
    const captured = await captureNwsForecast({
      projectId,
      latitude,
      longitude,
      siteTimezone: SITE_TIMEZONE,
      userAgent,
    });

    const { data: persistedId, error: persistError } = await auth.supabase.rpc(
      'capture_cgp_forecast_evidence',
      {
        p_snapshot: captured.snapshot,
        p_intervals: captured.intervals,
      }
    );
    if (persistError) {
      log.error('CGP forecast evidence persistence failed', {
        projectId,
        errorCode: persistError.code,
      });
      const migrationMissing = persistError.code === 'PGRST202';
      return NextResponse.json(
        {
          error: migrationMissing
            ? 'Forecast evidence storage is not configured.'
            : 'Could not store forecast evidence.',
        },
        { status: migrationMissing ? 503 : 500 }
      );
    }

    log.info('CGP forecast evidence captured', {
      projectId,
      snapshotId: captured.snapshot.id,
      normalizationStatus: captured.snapshot.normalization_status,
      intervalCount: captured.intervals.length,
    });

    return NextResponse.json(
      {
        id: String(persistedId ?? captured.snapshot.id),
        provider: 'nws',
        retrievedAt: captured.snapshot.retrieved_at,
        issuedAt: captured.snapshot.issued_at,
        payloadSha256: captured.snapshot.payload_sha256,
        parserVersion: captured.snapshot.parser_version,
        normalization: {
          status: captured.snapshot.normalization_status,
          reasonCodes: captured.snapshot.normalization_reason_codes,
          intervalCount: captured.intervals.length,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof NwsForecastCaptureError) {
      log.warn('NWS forecast capture failed', { projectId, kind: error.kind });
      return NextResponse.json(
        { error: 'Could not capture the official NWS forecast.' },
        { status: error.kind === 'configuration' ? 503 : 502 }
      );
    }
    log.error('CGP forecast capture failed unexpectedly', { projectId, error });
    return NextResponse.json(
      { error: 'Could not capture forecast evidence.' },
      { status: 500 }
    );
  }
}
