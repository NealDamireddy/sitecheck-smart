/**
 * Block 6 — Render an inspection report as a PDF.
 *
 * GET /api/inspections/[id]/pdf
 *
 * Workflow:
 *   1. Look up the inspection (so we can derive a stable filename + verify
 *      it exists).
 *   2. If a `report_id` is already linked, fetch that report row.
 *      Otherwise call `/api/reports/generate` internally to materialize a
 *      fresh one for this inspection.
 *   3. Hand the project + sections off to `InspectionReportPdf` and stream
 *      the resulting buffer back as `application/pdf`.
 *
 * The route is `GET` so the browser can hit it directly via an `<a download>`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import { requireAuth } from '@/lib/auth';
import { InspectionReportPdf } from '@/lib/pdf/inspection-pdf';
import type {
  PdfReportSection,
  PdfProjectInfo,
} from '@/lib/pdf/inspection-pdf';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface ReportRow {
  id: string;
  project_id: string;
  inspection_id: string | null;
  generated_date: string;
  sections: unknown;
  signed: boolean;
  signed_by: string | null;
  signed_date: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function ensureReportForInspection(
  request: NextRequest,
  supabase: any,
  inspectionId: string,
  projectId: string,
  existingReportId: string | null
): Promise<ReportRow | null> {
  // Try the linked report first.
  if (existingReportId) {
    const { data } = await supabase
      .from('reports')
      .select('*')
      .eq('id', existingReportId)
      .single();
    if (data) return data as ReportRow;
  }

  // Otherwise materialize one via the existing generator.
  const origin = new URL(request.url).origin;
  const genRes = await fetch(`${origin}/api/reports/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId, inspectionId }),
  });
  if (!genRes.ok) return null;
  const generated = await genRes.json();

  const { data } = await supabase
    .from('reports')
    .select('*')
    .eq('id', generated.id)
    .single();
  return (data as ReportRow) ?? null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    // 1. Inspection
    const { data: inspection, error: inspectionError } = await supabase
      .from('inspections')
      .select('*')
      .eq('id', id)
      .single();

    if (inspectionError || !inspection) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    // 2. Project
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, address, wdid, permit_number, qsp_name, qsp_license_number, qsp_company')
      .eq('id', inspection.project_id)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // 3. Report (existing or freshly generated)
    const report = await ensureReportForInspection(
      request,
      supabase,
      id,
      inspection.project_id,
      (inspection.report_id as string) ?? null
    );

    if (!report) {
      return NextResponse.json(
        { error: 'Failed to materialize report for PDF' },
        { status: 500 }
      );
    }

    // If we just materialized a fresh report, link it to the inspection
    // so the next call hits the cached row.
    if (!inspection.report_id || inspection.report_id !== report.id) {
      await supabase
        .from('inspections')
        .update({ report_id: report.id })
        .eq('id', id);
    }

    const sections = Array.isArray(report.sections)
      ? (report.sections as PdfReportSection[])
      : [];

    const projectInfo: PdfProjectInfo = {
      name: project.name as string,
      address: (project.address as string) ?? null,
      wdid: (project.wdid as string) ?? null,
      permitNumber: (project.permit_number as string) ?? null,
      qspName: (project.qsp_name as string) ?? null,
      qspLicenseNumber: (project.qsp_license_number as string) ?? null,
      qspCompany: (project.qsp_company as string) ?? null,
    };

    const pdfBuffer = await renderToBuffer(
      InspectionReportPdf({
        reportId: report.id,
        generatedAt: report.generated_date,
        signedBy: report.signed_by,
        signedDate: report.signed_date,
        project: projectInfo,
        sections,
      })
    );

    const safeName = (project.name as string)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    const filename = `cgp-report-${safeName}-${id}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Inspection PDF error:', err);
    return NextResponse.json({ error: 'Failed to render PDF' }, { status: 500 });
  }
}
