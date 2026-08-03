/**
 * Server-side client for `swppp-service/` (the Python ingestion pipeline).
 *
 * Only the browser→Next.js hop is public. This module runs on the server and
 * forwards the caller's Supabase JWT to the Python service, which re-verifies
 * it and does all its own database work under RLS as that same user. So the
 * chain is: browser → Next.js (requireAuth) → Python (require_caller) →
 * Postgres (RLS). Three checks, and the last one is the authoritative one —
 * neither Node nor Python holds a credential that can bypass a policy.
 *
 * The service is optional. It converts PDFs with layout-aware tooling that has
 * no JS equivalent, but if it is down the web app must degrade rather than
 * break: `isConfigured()` lets callers fall back to /api/scan-swppp, which is
 * slower and loses table structure but keeps working.
 */

import { log } from '@/lib/logger';

/** Base URL of the Python service, e.g. http://localhost:8000. */
const SERVICE_URL = process.env.SWPPP_SERVICE_URL?.replace(/\/+$/, '') ?? '';

/**
 * Upload is slow by nature: PDF conversion plus a model call, sometimes with
 * a retry when extraction comes back incomplete. The service answers 202
 * immediately and does the work in the background, so this timeout only
 * covers the handshake.
 */
const UPLOAD_TIMEOUT_MS = 30_000;
const STATUS_TIMEOUT_MS = 10_000;

export function isConfigured(): boolean {
  return SERVICE_URL.length > 0;
}

export class SwpppServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when the service is unreachable, as opposed to refusing. */
    readonly unreachable = false
  ) {
    super(message);
    this.name = 'SwpppServiceError';
  }
}

async function call(
  path: string,
  accessToken: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  if (!isConfigured()) {
    throw new SwpppServiceError('SWPPP service is not configured', 503, true);
  }

  const { timeoutMs = STATUS_TIMEOUT_MS, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(`${SERVICE_URL}${path}`, {
      ...rest,
      signal: controller.signal,
      headers: {
        ...rest.headers,
        // The service authenticates as this user; it never gets a key of
        // its own, so everything it reads or writes is RLS-scoped to them.
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });
  } catch (err: unknown) {
    // A dead service and a refused request are different problems: the first
    // is ours to fall back from, the second is the user's to fix.
    log.warn('SWPPP service unreachable', { path, err });
    throw new SwpppServiceError(
      'The document processing service is unavailable.',
      503,
      true
    );
  } finally {
    clearTimeout(timer);
  }
}

export interface IngestAccepted {
  status: string;
  document_id: string;
  message: string;
}

/** Hand a PDF to the pipeline. Returns as soon as it is queued. */
export async function ingestSwppp(
  projectId: string,
  file: File,
  accessToken: string
): Promise<IngestAccepted> {
  const body = new FormData();
  body.append('file', file);

  const response = await call(
    `/api/v1/projects/${encodeURIComponent(projectId)}/swppp`,
    accessToken,
    { method: 'POST', body, timeoutMs: UPLOAD_TIMEOUT_MS }
  );

  if (!response.ok) {
    throw new SwpppServiceError(
      await readError(response, 'Upload was rejected by the processing service.'),
      response.status
    );
  }
  return (await response.json()) as IngestAccepted;
}

export interface DocumentStatus {
  id: string;
  filename: string;
  status: 'processing' | 'completed' | 'failed';
  error_message: string | null;
  bmp_count: number | null;
  page_count: number | null;
  uploaded_at: string;
}

export async function getDocumentStatus(
  projectId: string,
  documentId: string,
  accessToken: string
): Promise<DocumentStatus> {
  const response = await call(
    `/api/v1/projects/${encodeURIComponent(projectId)}/swppp/${encodeURIComponent(documentId)}`,
    accessToken
  );
  if (!response.ok) {
    throw new SwpppServiceError(
      await readError(response, 'Could not read document status.'),
      response.status
    );
  }
  return (await response.json()) as DocumentStatus;
}

/** Never surface the service's raw body — it may carry internal detail. */
async function readError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown; error?: unknown };
    const detail = body.detail ?? body.error;
    if (typeof detail === 'string' && detail.length < 300) return detail;
  } catch {
    /* non-JSON body */
  }
  return fallback;
}
