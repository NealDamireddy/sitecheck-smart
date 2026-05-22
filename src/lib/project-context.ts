import { NextRequest } from 'next/server';

/**
 * Resolve the project ID from a request's query parameters.
 * Returns null when absent — callers must return 400 in that case.
 */
export function resolveProjectId(request: NextRequest): string | null {
  const { searchParams } = new URL(request.url);
  return searchParams.get('projectId') || null;
}
