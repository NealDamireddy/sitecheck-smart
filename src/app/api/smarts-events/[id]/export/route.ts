/**
 * GET /api/smarts-events/[id]/export[?format=csv]
 *
 * Default (no format / format=xlsx): streams an .xlsx of the event's
 * samples + parameter results. The workbook is a SMARTS data-entry aid,
 * not an upload artifact — see src/lib/smarts/excel-export.ts.
 *
 * format=csv: streams the bot-format monitoring CSV — the exact file
 * the Sync-to-SMARTS bot consumes (smarts-automation CSV schema). Useful
 * as a portable export and for running the bot by hand.
 *
 * Data assembly is shared with the sync routes via fetchSmartsExportInput
 * (RLS-scoped). Returns 404 when the event row isn't reachable, 500 on
 * any other read or build failure.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { buildSmartsExcelWorkbook } from '@/lib/smarts/excel-export';
import { buildSyncPayload } from '@/lib/smarts/bot-bridge';
import { fetchSmartsExportInput } from '@/lib/smarts/fetch-export-input';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function buildFilename(
  wdid: string | null,
  eventId: string,
  ext: 'xlsx' | 'csv'
): string {
  const slug = wdid && wdid.trim() ? wdid.trim() : eventId;
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `smarts-ad-hoc-${slug}-${yyyy}-${mm}-${dd}.${ext}`;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const fetched = await fetchSmartsExportInput(auth.supabase, id);
    if (!fetched.ok) {
      return NextResponse.json({ error: fetched.error }, { status: fetched.status });
    }
    const { input, event } = fetched;

    const format = request.nextUrl.searchParams.get('format') ?? 'xlsx';

    if (format === 'csv') {
      const payload = buildSyncPayload(input);
      return new NextResponse(payload.csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${buildFilename(input.wdid, event.id, 'csv')}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const buffer = await buildSmartsExcelWorkbook(input);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${buildFilename(input.wdid, event.id, 'xlsx')}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: unknown) {
    console.error('Smarts export error:', err);
    const message =
      err instanceof Error ? err.message : 'Failed to build SMARTS export';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
