import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Resolve the project ID from a request's query parameters.
 * Returns null when absent — callers must return 400 in that case.
 */
export function resolveProjectId(request: NextRequest): string | null {
  const { searchParams } = new URL(request.url);
  return searchParams.get('projectId') || null;
}

/**
 * Look up a project's site coordinates (RLS-scoped). Returns undefined
 * when the project has none recorded — callers fall back to their
 * default location.
 */
export async function resolveProjectCoords(
  supabase: SupabaseClient,
  projectId: string
): Promise<{ lat: number; lng: number } | undefined> {
  const { data } = await supabase
    .from('projects')
    .select('center_lat, center_lng')
    .eq('id', projectId)
    .maybeSingle();
  if (data?.center_lat != null && data?.center_lng != null) {
    return { lat: Number(data.center_lat), lng: Number(data.center_lng) };
  }
  return undefined;
}
