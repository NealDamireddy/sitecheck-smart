import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  buildInspectionReportContract,
  InspectionReportDataError,
  type InspectionReportChecklistResultRow,
  type InspectionReportSnapshotRow,
} from '@/lib/cgp/inspection-report-data';
import { log } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Phase 5B source endpoint for all later PDF/CSV exporters. It reads only the
 * submitted inspection snapshot and immutable checklist-result snapshots.
 */
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

    return NextResponse.json(
      buildInspectionReportContract({
        inspection: inspection as InspectionReportSnapshotRow,
        checklistResults: (checklistResults ?? []) as InspectionReportChecklistResultRow[],
      })
    );
  } catch (error) {
    if (error instanceof InspectionReportDataError) {
      const status = error.code === 'INSPECTION_NOT_SUBMITTED' ? 409 : 422;
      log.warn('Inspection report contract unavailable', {
        inspectionId: id,
        code: error.code,
      });
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status }
      );
    }
    log.error('Inspection report contract failed', { inspectionId: id, error });
    return NextResponse.json(
      { error: 'Failed to build inspection report data' },
      { status: 500 }
    );
  }
}
