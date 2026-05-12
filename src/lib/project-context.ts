import { NextRequest } from 'next/server';

export const DEFAULT_PROJECT_ID = 'riverside-phase2';

/**
 * Resolve the project ID from a request's query parameters.
 * Falls back to DEFAULT_PROJECT_ID when none is provided.
 */
export function resolveProjectId(request: NextRequest): string {
  const { searchParams } = new URL(request.url);
  return searchParams.get('projectId') || DEFAULT_PROJECT_ID;
}
