/**
 * Render a submitted inspection from its immutable Phase 5 report contract.
 * No current project, checkpoint, weather, deficiency, or QSP profile data is
 * consulted by this route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { requireAuth } from '@/lib/auth';
import {
  buildInspectionReportContract,
  InspectionReportDataError,
  type InspectionReportChecklistResultRow,
  type InspectionReportSnapshotRow,
} from '@/lib/cgp/inspection-report-data';
import { InspectionContractPdf } from '@/lib/pdf/inspection-contract-pdf';
import { log } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const { data: inspection, error: inspectionError } = await auth.supabase
      .from('inspections')
      .select('*')
      .eq('id', id)
      .single();
    if (inspectionError) {
      if (inspectionError.code === 'PGRST116') {
        return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
      }
      throw new Error('Inspection snapshot query failed');
    }

    const { data: checklistResults, error: checklistError } = await auth.supabase
      .from('inspection_checklist_results')
      .select('*')
      .eq('inspection_id', id)
      .order('category_number', { ascending: true })
      .order('item_number', { ascending: true });
    if (checklistError) throw new Error('Checklist snapshot query failed');

    const contract = buildInspectionReportContract({
      inspection: inspection as InspectionReportSnapshotRow,
      checklistResults: (checklistResults ?? []) as InspectionReportChecklistResultRow[],
    });
    const pdfBuffer = await renderToBuffer(InspectionContractPdf({ contract }));
    const safeSiteName = contract.part1.site.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const filename = `sitecheck-inspection-${safeSiteName}-${id}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'private, no-store',
        'X-SiteCheck-Contract-Version': contract.contractVersion,
        'X-SiteCheck-Submission-SHA256': contract.sourceSubmissionSha256,
      },
    });
  } catch (error) {
    if (error instanceof InspectionReportDataError) {
      const status = error.code === 'INSPECTION_NOT_SUBMITTED' ? 409 : 422;
      log.warn('Inspection PDF contract unavailable', {
        inspectionId: id,
        code: error.code,
      });
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status }
      );
    }
    log.error('Inspection PDF error', { inspectionId: id, error });
    return NextResponse.json({ error: 'Failed to render PDF' }, { status: 500 });
  }
}
