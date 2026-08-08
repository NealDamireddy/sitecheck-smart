import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import {
  ChecklistExpansionError,
  expandChecklist,
} from '@/lib/cgp/checklist-expansion';
import { inspectionChecklistSubmit } from '@/lib/validations';
import { log } from '@/lib/logger';

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface RpcError {
  code?: string;
  message?: string;
}

function rpcErrorResponse(error: RpcError) {
  const message = error.message ?? '';
  if (error.code === 'PGRST202') {
    return NextResponse.json(
      { error: 'Checklist submission storage is not configured.' },
      { status: 503 }
    );
  }
  if (message.includes('INSPECTION_NOT_FOUND') || message.includes('PROJECT_NOT_FOUND')) {
    return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
  }
  if (
    message.includes('INSPECTION_ALREADY_SUBMITTED') ||
    message.includes('INSPECTION_NOT_SUBMITTABLE') ||
    error.code === '23505'
  ) {
    return NextResponse.json(
      { error: 'Inspection has already been submitted.' },
      { status: 409 }
    );
  }
  if (error.code === 'P0001') {
    return NextResponse.json(
      { error: 'Checklist submission failed validation.' },
      { status: 422 }
    );
  }
  return NextResponse.json({ error: 'Checklist submission failed.' }, { status: 500 });
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = inspectionChecklistSubmit.parse(await request.json());

    const { data: inspection, error: inspectionError } = await supabase
      .from('inspections')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (inspectionError || !inspection) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    // Fast idempotent retry path. The RPC repeats this check under a row lock
    // to cover concurrent requests safely.
    if (inspection.status === 'submitted') {
      if (inspection.checklist_submission_key === body.idempotencyKey) {
        return NextResponse.json({
          id,
          status: 'submitted',
          created: false,
          submittedAt: inspection.submitted_at,
          resultCount:
            (inspection.checklist_compliant_count ?? 0) +
            (inspection.checklist_deficient_count ?? 0),
          compliantCount: inspection.checklist_compliant_count ?? 0,
          deficientCount: inspection.checklist_deficient_count ?? 0,
        });
      }
      return NextResponse.json(
        { error: 'Inspection has already been submitted.' },
        { status: 409 }
      );
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, project_type, risk_level')
      .eq('id', inspection.project_id)
      .maybeSingle();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Inspection not found' }, { status: 404 });
    }

    const projectType = project.project_type === 'linear' ? 'linear' : 'traditional';
    const expansion = expandChecklist({
      projectType,
      riskLevel: Number(project.risk_level) as 1 | 2 | 3,
      checklistVersion: body.checklistVersion,
      observedAt: body.observedAt,
      unflaggedItemsConfirmed: body.unflaggedItemsConfirmed,
      exceptions: body.exceptions,
    });

    const qpeStart = body.qpe?.start
      ? new Date(body.qpe.start).toISOString()
      : '';
    const qpeEnd = body.qpe?.end ? new Date(body.qpe.end).toISOString() : '';

    const submission = {
      submission_key: body.idempotencyKey,
      checklist_template_id: expansion.checklistVersion,
      observed_at: expansion.observedAt,
      unflagged_items_confirmed: true,
      construction_stage: body.constructionStage,
      photos_taken: body.photosTaken,
      qpe_start: qpeStart,
      qpe_end: qpeEnd,
      qpe_duration_hours: body.qpe?.durationHours ?? '',
      rain_gauge_inches: body.qpe?.rainGaugeInches ?? '',
      obs_precipitation: body.siteObservations.precipitation,
      obs_discolorations: body.siteObservations.discolorations,
      obs_odors: body.siteObservations.odors,
      obs_turbidity: body.siteObservations.turbidity,
      obs_sheen: body.siteObservations.sheen,
      obs_floating_material: body.siteObservations.floatingMaterial,
      obs_suspended_material: body.siteObservations.suspendedMaterial,
      observation_comments: body.siteObservations.comments ?? '',
      exemption_documentation: body.exemptionDocumentation ?? '',
      report_id: body.reportId ?? '',
    };

    const exceptionById = new Map(
      expansion.deficiencies.map((deficiency) => [
        deficiency.checklistItemId,
        deficiency,
      ])
    );
    const results = expansion.items.map((item) => {
      const deficiency = exceptionById.get(item.itemId);
      return {
        checklist_item_id: item.itemId,
        category_number: item.categoryNumber,
        category_title: item.categoryTitle,
        item_number: item.itemNumber,
        prompt: item.prompt,
        answer: item.answer.toLowerCase(),
        answer_source: item.answerSource,
        exception_description: deficiency?.description ?? '',
        recommendation: deficiency?.recommendation ?? '',
        identified_at: deficiency?.identifiedAt ?? '',
        repair_start_due_at: deficiency?.repairStartDueAt ?? '',
        action_implemented_at: '',
        checkpoint_id_snapshot: deficiency?.checkpointId ?? '',
        location_snapshot: deficiency?.location ?? '',
        photo_urls: deficiency?.photoUrls ?? [],
      };
    });

    const submissionSha256 = createHash('sha256')
      .update(JSON.stringify({ inspectionId: id, submission, results }))
      .digest('hex');

    const { data, error } = await supabase.rpc('submit_inspection_checklist', {
      p_inspection_id: id,
      p_submission: {
        ...submission,
        submission_sha256: submissionSha256,
      },
      p_results: results,
    });

    if (error) {
      log.error('Atomic checklist submission failed', {
        inspectionId: id,
        code: error.code,
      });
      return rpcErrorResponse(error);
    }

    const result = (data ?? {}) as Record<string, unknown>;
    return NextResponse.json(
      {
        id,
        status: 'submitted',
        created: result.created ?? true,
        submittedAt: result.submitted_at ?? null,
        resultCount: result.result_count ?? expansion.items.length,
        compliantCount: result.compliant_count ?? expansion.compliantCount,
        deficientCount: result.deficient_count ?? expansion.deficientCount,
      },
      { status: result.created === false ? 200 : 201 }
    );
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    if (error instanceof ChecklistExpansionError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 422 }
      );
    }
    log.error('Checklist submission unexpected error', { error });
    return NextResponse.json({ error: 'Checklist submission failed.' }, { status: 500 });
  }
}
