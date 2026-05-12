import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { reportGenerate } from '@/lib/validations';
import { DEFAULT_PROJECT_ID } from '@/lib/project-context';


interface ReportSection {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'table' | 'signature';
  editable: boolean;
}

// ─────────────────────────────────────────────
// Block 5 helpers — fetch Block 4 mission data
// ─────────────────────────────────────────────
interface MissionRollupRow {
  missionId: string;
  missionName: string | null;
  status: string | null;
  completedAt: string | null;
  totalFlightSeconds: number | null;
  capturedWaypoints: number;
  plannedWaypoints: number;
}

interface AiAnalysisRow {
  id: string;
  mission_id: string;
  waypoint_number: number;
  checkpoint_id: string;
  photo_url: string;
  summary: string;
  status: string;
  confidence: number;
  details: unknown;
  cgp_reference: string;
  recommendations: unknown;
  created_at: string;
}

interface QspReviewRow {
  id: string;
  mission_id: string;
  waypoint_number: number;
  checkpoint_id: string;
  decision: string;
  override_status: string | null;
  override_notes: string | null;
  ai_analysis_id: string | null;
  reviewed_at: string;
}

// POST /api/reports/generate - Generate a report from live data
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = reportGenerate.parse(await request.json());
    const projectId = body.projectId || DEFAULT_PROJECT_ID;
    const inspectionId = body.inspectionId;
    const segmentId = body.segmentId as string | undefined;

    // 1. Fetch project data
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      console.error('Error fetching project:', projectError);
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const isLinear = project.project_type === 'linear';

    // Fetch segments for linear projects
    let segments: Array<{ id: string; name: string; start_station: number; end_station: number }> = [];
    if (isLinear) {
      const { data: segmentRows } = await supabase
        .from('project_segments')
        .select('*')
        .eq('project_id', projectId)
        .order('sort_order');
      segments = segmentRows || [];
    }

    // Determine if scoped to a single segment
    const scopedSegment = segmentId && segments.find(s => s.id === segmentId);

    // 2. Fetch latest inspection (or specific one if provided)
    let inspectionQuery = supabase
      .from('inspections')
      .select('*')
      .eq('project_id', projectId)
      .order('date', { ascending: false });

    if (inspectionId) {
      inspectionQuery = inspectionQuery.eq('id', inspectionId);
    }

    const { data: inspections, error: inspectionError } = await inspectionQuery.limit(1);

    if (inspectionError) {
      console.error('Error fetching inspection:', inspectionError);
    }

    const inspection = inspections?.[0] || null;

    // ─────────────────────────────────────────────
    // Block 5 — Block 4 mission roll-up (additive)
    //
    // When the resolved inspection has linked missions, pull the AI
    // analyses + QSP reviews for those missions so we can inject two
    // extra sections into the report. Legacy projectId-only callers
    // skip this entirely and get the same 7 sections as before.
    // ─────────────────────────────────────────────
    let missionRollup: MissionRollupRow[] = [];
    let aiAnalyses: AiAnalysisRow[] = [];
    let qspReviews: QspReviewRow[] = [];
    const checkpointNameById = new Map<string, string>();

    if (inspection) {
      const { data: linkRows } = await supabase
        .from('inspection_missions')
        .select('mission_id')
        .eq('inspection_id', inspection.id);

      const missionIds = (linkRows ?? [])
        .map((r) => r.mission_id as string)
        .filter(Boolean);

      if (missionIds.length > 0) {
        // a) the missions themselves
        const { data: missionRows } = await supabase
          .from('drone_missions')
          .select('id, name, status, completed_at, total_flight_seconds')
          .in('id', missionIds);

        // b) waypoint counts per mission
        const { data: waypointRows } = await supabase
          .from('waypoints')
          .select('mission_id, capture_status')
          .in('mission_id', missionIds);

        const waypointStats = new Map<string, { total: number; captured: number }>();
        for (const wp of waypointRows ?? []) {
          const mid = wp.mission_id as string;
          const stat = waypointStats.get(mid) ?? { total: 0, captured: 0 };
          stat.total += 1;
          if (wp.capture_status === 'captured') stat.captured += 1;
          waypointStats.set(mid, stat);
        }

        missionRollup = (missionRows ?? []).map((row) => {
          const stat = waypointStats.get(row.id as string) ?? { total: 0, captured: 0 };
          return {
            missionId: row.id as string,
            missionName: (row.name as string) ?? null,
            status: (row.status as string) ?? null,
            completedAt: (row.completed_at as string) ?? null,
            totalFlightSeconds: (row.total_flight_seconds as number) ?? null,
            capturedWaypoints: stat.captured,
            plannedWaypoints: stat.total,
          };
        });

        // c) AI analyses for these missions
        const { data: analysisRows } = await supabase
          .from('mission_ai_analyses')
          .select('*')
          .in('mission_id', missionIds)
          .order('mission_id')
          .order('waypoint_number');

        aiAnalyses = (analysisRows ?? []) as AiAnalysisRow[];

        // d) QSP reviews for these missions
        const { data: reviewRows } = await supabase
          .from('mission_qsp_reviews')
          .select('*')
          .in('mission_id', missionIds);

        qspReviews = (reviewRows ?? []) as QspReviewRow[];

        // e) Resolve checkpoint names referenced by the analyses/reviews
        const checkpointIds = Array.from(
          new Set(
            [
              ...aiAnalyses.map((a) => a.checkpoint_id),
              ...qspReviews.map((r) => r.checkpoint_id),
            ].filter(Boolean)
          )
        );
        if (checkpointIds.length > 0) {
          const { data: cpRows } = await supabase
            .from('checkpoints')
            .select('id, name')
            .in('id', checkpointIds);
          for (const cp of cpRows ?? []) {
            checkpointNameById.set(cp.id as string, cp.name as string);
          }
        }
      }
    }

    // 3. Fetch current weather
    const { data: weatherSnapshot, error: weatherError } = await supabase
      .from('weather_snapshots')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (weatherError && weatherError.code !== 'PGRST116') {
      console.error('Error fetching weather:', weatherError);
    }

    // 4. Fetch checkpoints and compute status counts
    let checkpointQuery = supabase
      .from('checkpoints')
      .select('*')
      .eq('project_id', projectId);

    if (scopedSegment) {
      checkpointQuery = checkpointQuery.eq('segment_id', scopedSegment.id);
    }

    const { data: checkpoints, error: checkpointsError } = await checkpointQuery;

    if (checkpointsError) {
      console.error('Error fetching checkpoints:', checkpointsError);
    }

    const checkpointList = checkpoints || [];
    const statusCounts = {
      compliant: checkpointList.filter(c => c.status === 'compliant').length,
      deficient: checkpointList.filter(c => c.status === 'deficient').length,
      needsReview: checkpointList.filter(c => c.status === 'needs-review').length,
      total: checkpointList.length,
    };

    // Group by BMP type
    const bmpTypes = ['erosion-control', 'sediment-control', 'tracking-control', 'wind-erosion', 'materials-management', 'non-storm-water'];
    const bmpStatusSummary = bmpTypes.map(type => {
      const bmps = checkpointList.filter(c => c.bmp_type === type);
      return {
        type,
        total: bmps.length,
        compliant: bmps.filter(c => c.status === 'compliant').length,
        deficient: bmps.filter(c => c.status === 'deficient').length,
        needsReview: bmps.filter(c => c.status === 'needs-review').length,
      };
    }).filter(b => b.total > 0);

    // 5. Fetch active deficiencies
    const { data: deficiencies, error: deficienciesError } = await supabase
      .from('deficiencies')
      .select('*, checkpoints(name)')
      .eq('project_id', projectId)
      .in('status', ['open', 'in-progress'])
      .order('detected_date', { ascending: false });

    if (deficienciesError) {
      console.error('Error fetching deficiencies:', deficienciesError);
    }

    const deficiencyList = deficiencies || [];

    // Build the 7 report sections
    const now = new Date();
    const reportId = `report-${Date.now()}`;

    // Section 1: Project Information (dynamic by project type)
    const corridorMileage = project.linear_mileage
      ? `${Number(project.linear_mileage).toFixed(2)} miles`
      : project.corridor_total_length
        ? `${(Number(project.corridor_total_length) / 5280).toFixed(2)} miles`
        : 'N/A';

    const siteInfoLines = [
      `**Project Name:** ${project.name}`,
      `**Address:** ${project.address}`,
      `**WDID:** ${project.wdid}`,
      `**Permit Number:** ${project.permit_number}`,
      `**Risk Level:** ${project.risk_level}`,
      isLinear
        ? `**Corridor Length:** ${corridorMileage}`
        : `**Total Acreage:** ${project.acreage} acres`,
      isLinear && segments.length > 0
        ? `**Segments:** ${segments.length}${scopedSegment ? ` (Report scoped to: ${scopedSegment.name})` : ''}`
        : null,
      `**Project Status:** ${project.status}`,
      `**Start Date:** ${project.start_date}`,
      `**Estimated Completion:** ${project.estimated_completion}`,
    ].filter(Boolean);
    const siteInfoContent = siteInfoLines.join('\n');

    // Section 2: Inspection Details
    let inspectionContent = inspection ? `
**Inspection Date:** ${new Date(inspection.date).toLocaleDateString()}
**Inspection Type:** ${inspection.type}
**Inspector:** ${inspection.inspector}
**Overall Compliance:** ${inspection.overall_compliance}%
**Mission ID:** ${inspection.mission_id || 'N/A'}
    `.trim() : `
**No recent inspection data available.**

A new inspection should be conducted to generate accurate compliance information.
    `.trim();

    // Block 5 — append rich inspection metadata when present
    if (inspection) {
      const block5Lines: string[] = [];
      if (inspection.trigger && inspection.trigger !== 'manual') {
        block5Lines.push(`**Trigger:** ${inspection.trigger}`);
      }
      if (inspection.status) {
        block5Lines.push(`**Status:** ${inspection.status}`);
      }
      if (inspection.due_by) {
        block5Lines.push(`**Inspection Due By:** ${new Date(inspection.due_by).toLocaleString()}`);
      }
      if (inspection.submitted_at) {
        block5Lines.push(`**Submitted At:** ${new Date(inspection.submitted_at).toLocaleString()}`);
      }
      if (typeof inspection.ai_overall_compliance === 'number') {
        block5Lines.push(`**AI Overall Compliance:** ${inspection.ai_overall_compliance}%`);
      }
      if (typeof inspection.qsp_overall_compliance === 'number') {
        block5Lines.push(`**QSP Overall Compliance:** ${inspection.qsp_overall_compliance}%`);
      }
      if (inspection.narrative) {
        block5Lines.push('');
        block5Lines.push('**QSP Narrative:**');
        block5Lines.push(inspection.narrative);
      }
      if (block5Lines.length > 0) {
        inspectionContent += '\n' + block5Lines.join('\n');
      }

      // Mission roll-up addendum
      if (missionRollup.length > 0) {
        inspectionContent += `\n\n**Mission Roll-up (${missionRollup.length}):**`;
        for (const m of missionRollup) {
          const flightMin = m.totalFlightSeconds
            ? `${(m.totalFlightSeconds / 60).toFixed(1)} min`
            : 'N/A';
          inspectionContent += `\n- ${m.missionName ?? m.missionId} — ${m.status ?? 'unknown'} — ${m.capturedWaypoints}/${m.plannedWaypoints} waypoints captured · ${flightMin}`;
        }
      }
    }

    // Section 3: Weather Conditions
    const weatherContent = weatherSnapshot ? `
**Current Conditions at Time of Inspection:**
- Temperature: ${weatherSnapshot.temperature}F
- Condition: ${weatherSnapshot.condition}
- Wind Speed: ${weatherSnapshot.wind_speed_mph} mph
- Humidity: ${weatherSnapshot.humidity}%

**Weather Data Retrieved:** ${new Date(weatherSnapshot.fetched_at).toLocaleString()}
    `.trim() : `
**Weather data unavailable.**

Weather conditions should be recorded at the time of inspection.
    `.trim();

    // Section 4: BMP Status Summary
    let bmpStatusContent = `
**Overall BMP Status:**
- Total BMPs: ${statusCounts.total}
- Compliant: ${statusCounts.compliant} (${statusCounts.total > 0 ? Math.round((statusCounts.compliant / statusCounts.total) * 100) : 0}%)
- Deficient: ${statusCounts.deficient} (${statusCounts.total > 0 ? Math.round((statusCounts.deficient / statusCounts.total) * 100) : 0}%)
- Needs Review: ${statusCounts.needsReview} (${statusCounts.total > 0 ? Math.round((statusCounts.needsReview / statusCounts.total) * 100) : 0}%)

**Status by BMP Type:**
`;

    for (const bmp of bmpStatusSummary) {
      const typeName = bmp.type.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      bmpStatusContent += `
- **${typeName}:** ${bmp.total} total (${bmp.compliant} compliant, ${bmp.deficient} deficient, ${bmp.needsReview} needs review)`;
    }

    // Per-segment breakdown for linear projects (full report only)
    if (isLinear && !scopedSegment && segments.length > 0) {
      bmpStatusContent += `\n\n**Per-Segment Compliance Breakdown:**\n`;
      for (const seg of segments) {
        const segCheckpoints = checkpointList.filter(c => c.segment_id === seg.id);
        const segCompliant = segCheckpoints.filter(c => c.status === 'compliant').length;
        const segDeficient = segCheckpoints.filter(c => c.status === 'deficient').length;
        const segReview = segCheckpoints.filter(c => c.status === 'needs-review').length;
        const compliancePct = segCheckpoints.length > 0
          ? Math.round((segCompliant / segCheckpoints.length) * 100)
          : 0;
        const stationStart = `STA ${Math.floor(seg.start_station / 100)}+${(seg.start_station % 100).toString().padStart(2, '0')}`;
        const stationEnd = `STA ${Math.floor(seg.end_station / 100)}+${(seg.end_station % 100).toString().padStart(2, '0')}`;
        bmpStatusContent += `
- **${seg.name}** (${stationStart} – ${stationEnd}): ${segCheckpoints.length} BMPs, ${compliancePct}% compliant (${segDeficient} deficient, ${segReview} needs review)`;
      }
    }

    // Section 5: Deficiency Log
    let deficiencyContent = '';
    if (deficiencyList.length === 0) {
      deficiencyContent = `
**No active deficiencies identified.**

All BMPs are currently in compliance with CGP requirements.
      `.trim();
    } else {
      deficiencyContent = `
**Active Deficiencies: ${deficiencyList.length}**

`;
      for (const def of deficiencyList) {
        const checkpointName = (def.checkpoints as { name: string })?.name || 'Unknown';
        deficiencyContent += `
---
**${checkpointName}** (${def.status})
- Detected: ${new Date(def.detected_date).toLocaleDateString()}
- Deadline: ${new Date(def.deadline).toLocaleDateString()}
- CGP Violation: ${def.cgp_violation}
- Description: ${def.description}
- Corrective Action: ${def.corrective_action}
`;
      }
    }

    // Section 6: Certification Statement
    const certificationContent = `
I certify under penalty of law that this document and all attachments were prepared under my direction or supervision in accordance with a system designed to assure that qualified personnel properly gathered and evaluated the information submitted. Based on my inquiry of the person or persons who manage the system, or those persons directly responsible for gathering the information, the information submitted is, to the best of my knowledge and belief, true, accurate, and complete. I am aware that there are significant penalties for submitting false information, including the possibility of fine and imprisonment for knowing violations.

This inspection was conducted in accordance with the requirements of:
- California Construction General Permit (CGP) Order 2022-0057-DWQ
- Site-specific Storm Water Pollution Prevention Plan (SWPPP)
- All applicable local, state, and federal regulations
    `.trim();

    // Section 7: QSP Signature Block
    const signatureContent = `
**Qualified SWPPP Practitioner (QSP) Information:**

- Name: ${project.qsp_name}
- License Number: ${project.qsp_license_number}
- Company: ${project.qsp_company}
- Phone: ${project.qsp_phone}
- Email: ${project.qsp_email}

**Signature:** _________________________

**Date:** _________________________
    `.trim();

    // ─────────────────────────────────────────────
    // Block 5 — AI Findings & QSP Decisions sections
    // (only built when the inspection has linked missions)
    // ─────────────────────────────────────────────
    const reviewByCheckpoint = new Map<string, QspReviewRow>();
    for (const r of qspReviews) {
      reviewByCheckpoint.set(`${r.mission_id}:${r.waypoint_number}`, r);
    }

    let aiFindingsContent = '';
    if (aiAnalyses.length > 0) {
      const compliantCount = aiAnalyses.filter((a) => a.status === 'compliant').length;
      const deficientCount = aiAnalyses.filter((a) => a.status === 'deficient').length;
      const reviewCount = aiAnalyses.filter((a) => a.status === 'needs-review').length;
      const compliancePct = Math.round((compliantCount / aiAnalyses.length) * 100);

      aiFindingsContent = `
**Claude Vision Analysis Summary:**
- Total Waypoints Analyzed: ${aiAnalyses.length}
- Compliant: ${compliantCount} (${compliancePct}%)
- Deficient: ${deficientCount}
- Needs Review: ${reviewCount}

**Per-Waypoint Findings:**
`;
      for (const a of aiAnalyses) {
        const cpName = checkpointNameById.get(a.checkpoint_id) ?? a.checkpoint_id;
        const recs = Array.isArray(a.recommendations) ? a.recommendations : [];
        aiFindingsContent += `
---
**Waypoint ${a.waypoint_number} — ${cpName}** (${a.status} · ${a.confidence}% confidence)
- CGP Reference: ${a.cgp_reference || 'N/A'}
- Summary: ${a.summary}`;
        if (recs.length > 0) {
          aiFindingsContent += `\n- Recommendations: ${(recs as string[]).join('; ')}`;
        }
      }
    } else if (missionRollup.length > 0) {
      aiFindingsContent = '**No AI analyses recorded for the linked missions yet.**\n\nRun the analyzer from the Mission Review panel to populate this section.';
    }

    let qspDecisionsContent = '';
    if (qspReviews.length > 0) {
      const accepted = qspReviews.filter((r) => r.decision === 'accept').length;
      const overridden = qspReviews.filter((r) => r.decision === 'override').length;
      const pending = qspReviews.filter((r) => r.decision === 'pending').length;

      qspDecisionsContent = `
**QSP Review Decisions:**
- Accepted as Reported: ${accepted}
- Overridden: ${overridden}
- Pending Review: ${pending}

**Per-Waypoint Decisions:**
`;
      for (const r of qspReviews) {
        const cpName = checkpointNameById.get(r.checkpoint_id) ?? r.checkpoint_id;
        qspDecisionsContent += `
---
**Waypoint ${r.waypoint_number} — ${cpName}** (${r.decision})`;
        if (r.override_status) {
          qspDecisionsContent += `\n- Override Status: ${r.override_status}`;
        }
        if (r.override_notes) {
          qspDecisionsContent += `\n- QSP Notes: ${r.override_notes}`;
        }
        qspDecisionsContent += `\n- Reviewed At: ${new Date(r.reviewed_at).toLocaleString()}`;
      }
    } else if (missionRollup.length > 0) {
      qspDecisionsContent = '**No QSP decisions recorded yet.**\n\nReview AI findings in the Mission Review panel to populate this section.';
    }

    const sections: ReportSection[] = [
      {
        id: 'site-info',
        title: isLinear ? 'Corridor Information' : 'Site Information',
        content: siteInfoContent,
        type: 'text',
        editable: false,
      },
      {
        id: 'inspection-details',
        title: 'Inspection Details',
        content: inspectionContent,
        type: 'text',
        editable: true,
      },
      {
        id: 'weather-conditions',
        title: 'Weather Conditions',
        content: weatherContent,
        type: 'text',
        editable: true,
      },
      {
        id: 'bmp-status',
        title: 'BMP Status Summary',
        content: bmpStatusContent.trim(),
        type: 'table',
        editable: false,
      },
      // Block 5 — AI Findings (only when there's something to show)
      ...(aiFindingsContent
        ? [{
            id: 'ai-findings',
            title: 'AI Findings (Claude Vision)',
            content: aiFindingsContent.trim(),
            type: 'text' as const,
            editable: true,
          }]
        : []),
      // Block 5 — QSP Decisions (only when there's something to show)
      ...(qspDecisionsContent
        ? [{
            id: 'qsp-decisions',
            title: 'QSP Review Decisions',
            content: qspDecisionsContent.trim(),
            type: 'text' as const,
            editable: true,
          }]
        : []),
      {
        id: 'deficiency-log',
        title: 'Deficiency Log',
        content: deficiencyContent.trim(),
        type: 'text',
        editable: true,
      },
      {
        id: 'certification',
        title: 'Certification Statement',
        content: certificationContent,
        type: 'text',
        editable: false,
      },
      {
        id: 'signature',
        title: 'QSP Signature Block',
        content: signatureContent,
        type: 'signature',
        editable: false,
      },
    ];

    // Insert report into database
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .insert({
        id: reportId,
        project_id: projectId,
        inspection_id: inspection?.id || null,
        generated_date: now.toISOString(),
        sections: sections,
        signed: false,
        signed_by: null,
        signed_date: null,
      })
      .select()
      .single();

    if (reportError) {
      console.error('Error creating report:', reportError);
      return NextResponse.json(
        { error: 'Failed to create report' },
        { status: 500 }
      );
    }

    // Create activity event
    const activityEvent = {
      id: `activity-${Date.now()}`,
      project_id: projectId,
      type: 'document',
      title: 'Report Generated',
      description: `CGP compliance report generated for inspection on ${inspection ? new Date(inspection.date).toLocaleDateString() : 'N/A'}`,
      timestamp: now.toISOString(),
      severity: 'info',
      linked_entity_id: reportId,
      linked_entity_type: 'report',
    };

    const { error: activityError } = await supabase
      .from('activity_events')
      .insert(activityEvent);

    if (activityError) {
      console.error('Error creating activity event:', activityError);
    }

    // Transform and return
    return NextResponse.json({
      id: report.id,
      projectId: report.project_id,
      inspectionId: report.inspection_id,
      generatedDate: report.generated_date,
      sections: report.sections,
      signed: report.signed,
      signedBy: report.signed_by,
      signedDate: report.signed_date,
      createdAt: report.created_at,
      updatedAt: report.updated_at,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Unexpected error in POST /api/reports/generate:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
