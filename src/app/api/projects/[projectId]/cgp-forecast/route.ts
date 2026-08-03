import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { log } from '@/lib/logger';

interface SnapshotRow {
  id: string;
  provider: string;
  retrieved_at: string;
  issued_at: string | null;
  payload_sha256: string;
  parser_version: string;
  normalization_status: 'normalized' | 'unknown';
  normalization_reason_codes: string[];
}

/** Return the newest immutable NWS forecast snapshot visible to this user. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const { projectId } = await params;

  const { data: project, error: projectError } = await auth.supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle();
  if (projectError || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const { data, error } = await auth.supabase
    .from('cgp_forecast_snapshots')
    .select(
      'id, provider, retrieved_at, issued_at, payload_sha256, parser_version, normalization_status, normalization_reason_codes'
    )
    .eq('project_id', projectId)
    .order('retrieved_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    log.error('CGP forecast evidence lookup failed', {
      projectId,
      errorCode: error.code,
    });
    return NextResponse.json(
      {
        error:
          error.code === 'PGRST205'
            ? 'Forecast evidence storage is not configured.'
            : 'Could not load forecast evidence.',
      },
      { status: error.code === 'PGRST205' ? 503 : 500 }
    );
  }

  if (!data) {
    return NextResponse.json({ snapshot: null });
  }

  const snapshot = data as SnapshotRow;
  const { count, error: countError } = await auth.supabase
    .from('cgp_forecast_intervals')
    .select('id', { count: 'exact', head: true })
    .eq('snapshot_id', snapshot.id);
  if (countError) {
    log.error('CGP forecast interval count failed', {
      projectId,
      snapshotId: snapshot.id,
      errorCode: countError.code,
    });
    return NextResponse.json(
      { error: 'Could not load forecast evidence.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    snapshot: {
      id: snapshot.id,
      provider: snapshot.provider,
      retrievedAt: snapshot.retrieved_at,
      issuedAt: snapshot.issued_at,
      payloadSha256: snapshot.payload_sha256,
      parserVersion: snapshot.parser_version,
      normalization: {
        status: snapshot.normalization_status,
        reasonCodes: snapshot.normalization_reason_codes,
        intervalCount: count ?? 0,
      },
    },
  });
}
