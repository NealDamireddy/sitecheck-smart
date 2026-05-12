/**
 * Block 6 — Render any persisted report row as a PDF.
 *
 * GET /api/reports/[id]/pdf
 *
 * Used by `<ExportControls />` on /reports — the report store knows the
 * `reportId` after `generateReport()` runs, so the client can hit this
 * route directly and stream the PDF straight to disk.
 *
 * Companion route: `/api/inspections/[id]/pdf` materializes a fresh
 * report on the fly when one doesn't yet exist for an inspection.
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

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;

    // 1. Report
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('*')
      .eq('id', id)
      .single();

    if (reportError || !report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    // 2. Project
    const { data: project } = await supabase
      .from('projects')
      .select('id, name, address, wdid, permit_number, qsp_name, qsp_license_number, qsp_company')
      .eq('id', report.project_id)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
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
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Report PDF error:', err);
    return NextResponse.json({ error: 'Failed to render PDF' }, { status: 500 });
  }
}
