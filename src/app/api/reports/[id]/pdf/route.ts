/**
 * Render a persisted report reference through its submitted inspection.
 * Legacy report sections and current project state are intentionally ignored;
 * a report without a submitted inspection fails closed.
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

    const { data: report, error: reportError } = await auth.supabase
      .from('reports')
      .select('id, inspection_id')
      .eq('id', id)
      .single();
    if (reportError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }
    if (!report.inspection_id) {
      return NextResponse.json(
        {
          error: 'This report is not backed by a submitted inspection.',
          code: 'REPORT_NOT_INSPECTION_BACKED',
        },
        { status: 422 }
      );
    }

    const inspectionId = String(report.inspection_id);
    const { data: inspection, error: inspectionError } = await auth.supabase
      .from('inspections')
      .select('*')
      .eq('id', inspectionId)
      .single();
    if (inspectionError || !inspection) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    const { data: checklistResults, error: checklistError } = await auth.supabase
      .from('inspection_checklist_results')
      .select('*')
      .eq('inspection_id', inspectionId)
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

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="sitecheck-inspection-${safeSiteName}-${inspectionId}.pdf"`,
        'Cache-Control': 'private, no-store',
        'X-SiteCheck-Contract-Version': contract.contractVersion,
        'X-SiteCheck-Submission-SHA256': contract.sourceSubmissionSha256,
      },
    });
  } catch (error) {
    if (error instanceof InspectionReportDataError) {
      const status = error.code === 'INSPECTION_NOT_SUBMITTED' ? 409 : 422;
      log.warn('Report PDF contract unavailable', { reportId: id, code: error.code });
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status }
      );
    }
    log.error('Report PDF error', { reportId: id, error });
    return NextResponse.json({ error: 'Failed to render PDF' }, { status: 500 });
  }
}
