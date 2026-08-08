/**
 * Block 5 — Submit an inspection.
 *
 * POST /api/inspections/[id]/submit
 *
 * Legacy compatibility endpoint. New inspections must be finalized by the
 * atomic checklist endpoint first; this route may not bypass the required
 * 22-question QSP checklist. Optionally accepts `{ reportId }`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { inspectionSubmit } from '@/lib/validations';
import { log } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    let rawBody = {};
    try { rawBody = await request.json(); } catch { /* empty body ok */ }
    const body = inspectionSubmit.parse(rawBody);
    const reportId = typeof body?.reportId === 'string' ? body.reportId : null;

    const { data: existing, error: existingError } = await supabase
      .from('inspections')
      .select('id, status, submitted_at, report_id, checklist_template_id')
      .eq('id', id)
      .maybeSingle();

    if (existingError || !existing) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    if (!existing.checklist_template_id) {
      return NextResponse.json(
        { error: 'Complete the CGP checklist before submitting this inspection.' },
        { status: 409 }
      );
    }

    if (existing.status === 'submitted') {
      return NextResponse.json({
        ok: true,
        id,
        status: 'submitted',
        submittedAt: existing.submitted_at,
        reportId: existing.report_id ?? null,
      });
    }

    const submittedAt = new Date().toISOString();

    const updates: Record<string, unknown> = {
      status: 'submitted',
      submitted_at: submittedAt,
    };
    if (reportId) {
      updates.report_id = reportId;
    }

    const { data, error } = await supabase
      .from('inspections')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      log.error('Inspection submit failed', { error });
      return NextResponse.json({ error: 'Submit failed' }, { status: 500 });
    }

    // Activity event
    await supabase.from('activity_events').insert({
      id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      project_id: data.project_id,
      type: 'inspection',
      title: 'Inspection Submitted',
      description: `Inspection ${id} marked as submitted.`,
      timestamp: submittedAt,
      severity: 'info',
      linked_entity_id: id,
      linked_entity_type: 'inspection',
    });

    return NextResponse.json({
      ok: true,
      id,
      status: 'submitted',
      submittedAt,
      reportId: data.report_id ?? null,
    });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    log.error('Inspection submit unexpected error', { err });
    return NextResponse.json({ error: 'Submit failed' }, { status: 500 });
  }
}
