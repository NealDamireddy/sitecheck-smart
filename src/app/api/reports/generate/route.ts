import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { resolveQspIdentity } from '@/lib/qsp-identity';
import { reportGenerate } from '@/lib/validations';
import {
  getBmpCategoriesForRiskLevel,
  SITE_OBSERVATION_CHECKS,
  type CgpRiskLevel,
} from '@/lib/cgp/risk-level-bmps';
import {
  buildPart2Data,
  buildPart3DataFromPart2,
  type Part1Data,
  type Part1Group,
  type Part3Data,
} from '@/lib/cgp/report-data';
import type { ReportSectionData } from '@/types/report';
import type { BMPCategory, CheckpointStatus } from '@/types/checkpoint';
import { log } from '@/lib/logger';


interface ReportSection {
  id: string;
  title: string;
  content: string;
  type: 'text' | 'table' | 'signature';
  editable: boolean;
  data?: ReportSectionData;
}

/**
 * Map the internal inspection.type enum onto the human-readable label
 * QSPs (and the state regulator) use on submitted reports.
 */
function inspectionTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case 'routine':
      return 'Weekly';
    case 'pre-storm':
      return 'Pre Precipitation';
    case 'post-storm':
      return 'Post Precipitation';
    case 'qpe':
      return 'Daily Precipitation';
    default:
      return type ?? 'Routine';
  }
}

function formatInspectionDateTime(dateIso: string | null | undefined): string {
  if (!dateIso) return 'N/A';
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return dateIso;
  return `${d.toISOString().slice(0, 10)} at ${d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).toLowerCase()}`;
}

// POST /api/reports/generate - Generate a report from live data
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { supabase } = auth;
    const body = reportGenerate.parse(await request.json());
    if (!body.projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }
    const projectId = body.projectId;
    const inspectionId = body.inspectionId;
    const segmentId = body.segmentId as string | undefined;

    // 1. Fetch project data
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      log.error('Error fetching project', { projectError });
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    // ACC-02: the practitioner block on a regulator-facing report must
    // reflect the QSP's current credentials, not the copy snapshotted
    // into the project at creation. Profile wins field by field, project
    // copy fills any gap.
    const qspIdentity = await resolveQspIdentity(supabase, auth.user.id, project);

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
      log.error('Error fetching inspection', { inspectionError });
    }

    const inspection = inspections?.[0] || null;

    // The regulator-submitted report does not include drone-mission
    // roll-ups, AI vision findings, or QSP review decisions — those are
    // internal workflow artifacts. We intentionally drop the mission
    // join here; if you need that data in a different surface, fetch it
    // there rather than back in this endpoint.

    // 3. Fetch current weather
    const { data: weatherSnapshot, error: weatherError } = await supabase
      .from('weather_snapshots')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (weatherError && weatherError.code !== 'PGRST116') {
      log.error('Error fetching weather', { weatherError });
    }

    // Part 2 (BMP Observations) Yes/No answers are driven by per-checkpoint
    // statuses, rolled up by CGP category. Any deficient or needs-review
    // checkpoint flips its CGP category to "No"; everything else stays
    // "Yes". Categories with no checkpoints default to "Yes".
    const { data: checkpointRows } = await supabase
      .from('checkpoints')
      .select('id, bmp_type, status')
      .eq('project_id', projectId);
    const checkpoints: { bmpType: BMPCategory; status: CheckpointStatus }[] =
      (checkpointRows ?? []).map((row: { bmp_type: string; status: string }) => ({
        bmpType: row.bmp_type as BMPCategory,
        status: row.status as CheckpointStatus,
      }));

    // 5. Fetch active deficiencies
    const { data: deficiencies, error: deficienciesError } = await supabase
      .from('deficiencies')
      .select('*, checkpoints(name)')
      .eq('project_id', projectId)
      .in('status', ['open', 'in-progress'])
      .order('detected_date', { ascending: false });

    if (deficienciesError) {
      log.error('Error fetching deficiencies', { deficienciesError });
    }

    const deficiencyList = deficiencies || [];

    // 5b. Fetch outstanding corrective actions — the data behind Part 7.
    // CGP 2022 requires an "Additional Corrective Actions Required"
    // section on EVERY inspection type (Weekly I/II/III/VII, Pre-Storm
    // I-IV/VII, During I/II/III/V/VII, Post-Storm I/II/III/VI/VII), and
    // the generator was omitting it entirely (CMP-08, caught by
    // e2e/golden-path.spec.ts).
    const { data: correctiveActionRows, error: correctiveActionsError } =
      await supabase
        .from('corrective_actions')
        .select('*')
        .eq('project_id', projectId)
        .not('status', 'in', '("resolved","verified")')
        .order('due_date', { ascending: true });

    if (correctiveActionsError) {
      log.error('Error fetching corrective actions', { correctiveActionsError });
    }
    const correctiveActionList = correctiveActionRows || [];

    // 6. Daily-Precipitation reports need pH/turbidity sample results
    // attached as Part 4. We pull samples + parameter_results for the
    // most recent SMARTS event on this project. If the inspection isn't
    // a during-storm type (qpe), or no event/samples exist, Part 4 is
    // omitted from the rendered report.
    interface DbParamResultRow {
      parameter: string;
      qualifier: string;
      result: number | null;
      units: string;
    }
    interface DbSampleRow {
      id: string;
      sample_datetime: string;
      qsp_name: string;
      monitoring_location_id: string;
      parameter_results: DbParamResultRow[];
    }
    interface DbMonitoringLocationRow {
      id: string;
      name: string;
      drainage_area: string | null;
    }

    let storySamples: DbSampleRow[] = [];
    let monitoringLocsById = new Map<string, DbMonitoringLocationRow>();
    const isDailyPrecipReport = inspection?.type === 'qpe';

    if (isDailyPrecipReport) {
      const { data: latestEvent } = await supabase
        .from('smarts_events')
        .select('id')
        .eq('project_id', projectId)
        .in('status', ['active', 'forecast', 'ended'])
        .order('forecast_detected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (latestEvent?.id) {
        const { data: sampleRows } = await supabase
          .from('samples')
          .select(
            'id, sample_datetime, qsp_name, monitoring_location_id, parameter_results!parameter_results_sample_id_fkey(*)'
          )
          .eq('smarts_event_id', latestEvent.id);
        storySamples = (sampleRows ?? []) as DbSampleRow[];

        const locIds = Array.from(new Set(storySamples.map((s) => s.monitoring_location_id)));
        if (locIds.length > 0) {
          const { data: locs } = await supabase
            .from('monitoring_locations')
            .select('id, name, drainage_area')
            .in('id', locIds);
          monitoringLocsById = new Map(
            ((locs ?? []) as DbMonitoringLocationRow[]).map((l) => [l.id, l])
          );
        }
      }
    }

    const now = new Date();
    const reportId = `report-${Date.now()}`;

    // ─────────────────────────────────────────────
    // Part 1: General Information
    // Mirrors the "Part 1" block from the state-mandated QSP report
    // form: site info, weather, the 7 yes/no observation checks, and
    // inspector identity.
    // ─────────────────────────────────────────────
    const riskLevel: CgpRiskLevel = (Number(project.risk_level) as CgpRiskLevel) || 2;
    const constructionStage = project.construction_stage || 'N/A';
    const currentWeatherLabel = weatherSnapshot?.condition || 'N/A';

    const inspectionDateLabel = inspection
      ? formatInspectionDateTime(inspection.date)
      : formatInspectionDateTime(now.toISOString());
    const inspectionType = inspectionTypeLabel(inspection?.type);

    const corridorMileage = project.linear_mileage
      ? `${Number(project.linear_mileage).toFixed(2)} miles`
      : project.corridor_total_length
        ? `${(Number(project.corridor_total_length) / 5280).toFixed(2)} miles`
        : 'N/A';

    const siteInfoLines: string[] = [
      `**Construction Site Name & WDID No.:** ${project.name} ${project.wdid ? `· ${project.wdid}` : ''}`,
      `**Address:** ${project.address || 'N/A'}`,
      `**Permit Number:** ${project.permit_number || 'N/A'}`,
      `**Project Risk Level:** ${riskLevel}`,
      `**Construction Stage:** ${constructionStage}`,
      `**Current Weather:** ${currentWeatherLabel}`,
      `**Photos Taken:** Yes`,
      isLinear ? `**Corridor Length:** ${corridorMileage}` : `**Total Acreage:** ${project.acreage ?? 'N/A'} acres`,
      isLinear && segments.length > 0
        ? `**Segments:** ${segments.length}${scopedSegment ? ` (Report scoped to: ${scopedSegment.name})` : ''}`
        : null,
    ].filter(Boolean) as string[];

    const isStormRelevant =
      inspection?.type === 'pre-storm' ||
      inspection?.type === 'post-storm' ||
      inspection?.type === 'qpe';

    const weatherLines: string[] = [
      `**Estimated QPE Beginning:** ${isStormRelevant ? (inspection?.qpe_start ?? 'N/A') : 'N/A'}`,
      `**Estimated QPE Duration:** ${isStormRelevant ? (inspection?.qpe_duration_hours ?? 'N/A') : 'N/A'}`,
      `**End Date of QPE:** ${isStormRelevant ? (inspection?.qpe_end ?? 'N/A') : 'N/A'}`,
      `**Rain Gauge reading (inches):** ${inspection?.rain_gauge_inches ?? 'N/A'}`,
    ];

    const observationsLines = SITE_OBSERVATION_CHECKS.map(
      (check) => `- ${check.label} ${inspection?.[`obs_${check.id}`] ?? 'No'}`
    );

    const generalInfoContent = [
      `**Date:** ${inspectionDateLabel}`,
      `**Inspection Type:** ${inspectionType}`,
      '',
      '**Site Information**',
      ...siteInfoLines,
      '',
      '**Weather**',
      ...weatherLines,
      '',
      '**Exemption Documentation**',
      'Visual inspections are not required outside of business hours or during dangerous weather conditions such as flooding or electrical storms.',
      '',
      '**Site Observations**',
      ...observationsLines,
      inspection?.observation_comments
        ? `\n**Comments on presence:** ${inspection.observation_comments}`
        : '',
      '',
      '**Inspector Information**',
      `- Inspector Name: ${inspection?.inspector || qspIdentity.name || 'N/A'}`,
      `- Inspector Title: QSP`,
      `- Signature Date: ${inspection ? new Date(inspection.date).toISOString().slice(0, 10) : now.toISOString().slice(0, 10)}`,
      inspection?.narrative ? `\n**QSP Narrative:**\n${inspection.narrative}` : '',
    ]
      .filter((line) => line !== '')
      .join('\n');

    // ─────────────────────────────────────────────
    // Part 2: BMP Observations
    // Canonical 22-question checklist for the project's risk level.
    // Without per-question persistence (a future migration), every
    // answer renders as "—" so the section visibly mirrors the real
    // QSP form while making it obvious the field is awaiting input.
    // ─────────────────────────────────────────────
    const bmpCategories = getBmpCategoriesForRiskLevel(riskLevel);
    const bmpSectionLines: string[] = [
      `_Minimum BMPs for Risk Level ${riskLevel} Sites._`,
      '',
    ];
    for (const cat of bmpCategories) {
      bmpSectionLines.push(`**${cat.number} - ${cat.title}**`);
      for (const q of cat.questions) {
        bmpSectionLines.push(`- ${q.prompt} → —`);
      }
      bmpSectionLines.push('');
    }
    bmpSectionLines.push(
      '_Yes / No answers and Action / Implementation dates are captured per-question during the inspection visit; pending entries are shown as "—"._'
    );
    const bmpObservationsContent = bmpSectionLines.join('\n').trim();

    // ─────────────────────────────────────────────
    // Part 7: Additional Corrective Actions Required
    // Required on every inspection type under CGP 2022.
    // ─────────────────────────────────────────────
    let correctiveActionContent =
      '_Corrective actions identified during this inspection that are not ' +
      'BMP repairs covered in Part 3. Repairs of BMP deficiencies must ' +
      'begin within 72 hours of identification._\n\n';
    if (correctiveActionList.length === 0) {
      correctiveActionContent +=
        'No additional corrective actions required at the time of this inspection.';
    } else {
      for (const action of correctiveActionList) {
        const due = action.due_date
          ? new Date(action.due_date as string).toISOString().slice(0, 10)
          : 'TBD';
        correctiveActionContent += `---\n`;
        correctiveActionContent += `**${action.description}**\n`;
        if (action.cgp_reference) {
          correctiveActionContent += `- CGP reference: ${action.cgp_reference}\n`;
        }
        correctiveActionContent += `- Severity: ${action.severity ?? 'medium'}\n`;
        correctiveActionContent += `- Status: ${action.status ?? 'open'}\n`;
        correctiveActionContent += `- Action required by: ${due}\n`;
        if (action.checkpoint_id) {
          correctiveActionContent += `- Checkpoint: ${action.checkpoint_id}\n`;
        }
        correctiveActionContent += `\n`;
      }
    }

    // ─────────────────────────────────────────────
    // Part 3: Descriptions of BMP deficiencies
    // ─────────────────────────────────────────────
    let deficiencyContent = '_Repairs must begin within 72 hours of identification; complete repairs as soon as possible._\n\n';
    if (deficiencyList.length === 0) {
      deficiencyContent += 'No active deficiencies identified during this inspection.';
    } else {
      for (const def of deficiencyList) {
        const checkpointName = (def.checkpoints as { name: string })?.name || 'Unknown checkpoint';
        deficiencyContent += `---\n`;
        deficiencyContent += `**${def.description}**\n`;
        deficiencyContent += `- Checkpoint: ${checkpointName}\n`;
        if (def.cgp_violation) deficiencyContent += `- CGP Violation: ${def.cgp_violation}\n`;
        deficiencyContent += `- Detected: ${new Date(def.detected_date).toLocaleDateString()}\n`;
        if (def.deadline) deficiencyContent += `- Deadline: ${new Date(def.deadline).toLocaleDateString()}\n`;
        if (def.corrective_action) {
          deficiencyContent += `- Corrective Action: ${def.corrective_action}\n`;
        }
        deficiencyContent += '\n';
      }
    }

    // ─────────────────────────────────────────────
    // Part 4: Additional During Storm Observations (Daily Precip only)
    // Pulls sample + parameter results captured during the active
    // SMARTS event. Each monitoring location renders its measured pH
    // and turbidity with the standard "outfall / discharge point"
    // framing used on the regulator form.
    // ─────────────────────────────────────────────
    let stormObservationsContent = '';
    if (isDailyPrecipReport) {
      if (storySamples.length === 0) {
        stormObservationsContent =
          '_If BMPs cannot be inspected during inclement weather, list the results of visual inspections at all relevant outfalls, discharge points, and downstream locations._\n\n' +
          'No sample data available for this inspection.';
      } else {
        const lines: string[] = [
          '_If BMPs cannot be inspected during inclement weather, list the results of visual inspections at all relevant outfalls, discharge points, and downstream locations._',
          '',
        ];
        for (const sample of storySamples) {
          const loc = monitoringLocsById.get(sample.monitoring_location_id);
          lines.push(`**Outfall / Discharge Point: ${loc?.name ?? sample.monitoring_location_id}**`);
          if (loc?.drainage_area) lines.push(`- Drainage Area: ${loc.drainage_area}`);
          lines.push(`- Sample Taken: ${new Date(sample.sample_datetime).toLocaleString()} by ${sample.qsp_name || 'QSP'}`);
          for (const pr of sample.parameter_results ?? []) {
            const value = pr.qualifier && pr.qualifier !== 'measured'
              ? `${pr.qualifier}${pr.result != null ? ` ${pr.result}` : ''}`
              : pr.result != null
                ? `${pr.result}`
                : 'N/A';
            const units = pr.units ? ` ${pr.units}` : '';
            lines.push(`- ${pr.parameter}: ${value}${units}`);
          }
          lines.push('');
        }
        stormObservationsContent = lines.join('\n').trim();
      }
    }

    // ─────────────────────────────────────────────
    // Certification + QSP Signature Block (kept; these also appear on
    // the regulator-submitted form, just under the "Inspector
    // Information" header rather than as separate sections).
    // ─────────────────────────────────────────────
    const certificationContent = `
I certify under penalty of law that this document and all attachments were prepared under my direction or supervision in accordance with a system designed to assure that qualified personnel properly gathered and evaluated the information submitted. Based on my inquiry of the person or persons who manage the system, or those persons directly responsible for gathering the information, the information submitted is, to the best of my knowledge and belief, true, accurate, and complete. I am aware that there are significant penalties for submitting false information, including the possibility of fine and imprisonment for knowing violations.

This inspection was conducted in accordance with the requirements of:
- California Construction General Permit (CGP) Order 2022-0057-DWQ
- Site-specific Storm Water Pollution Prevention Plan (SWPPP)
- All applicable local, state, and federal regulations
    `.trim();

    const signatureContent = `
**Qualified SWPPP Practitioner (QSP) Information:**

- Name: ${qspIdentity.name || 'N/A'}
- License Number: ${qspIdentity.licenseNumber || 'N/A'}
- Company: ${qspIdentity.company || 'N/A'}
- Phone: ${qspIdentity.phone || 'N/A'}
- Email: ${qspIdentity.email || 'N/A'}

**Signature:** _________________________

**Date:** _________________________
    `.trim();

    // ─────────────────────────────────────────────
    // Structured table payloads (rendered by both the in-app preview
    // and the @react-pdf/renderer PDF). The markdown `content` strings
    // built above are kept as a fallback so anyone editing the report
    // still has the same text to work from.
    // ─────────────────────────────────────────────
    const todayShort = now.toLocaleDateString();
    const inspectorName = inspection?.inspector || qspIdentity.name || 'N/A';
    const signatureDate = inspection
      ? new Date(inspection.date).toISOString().slice(0, 10)
      : now.toISOString().slice(0, 10);

    const part1Groups: Part1Group[] = [
      {
        heading: 'Site Information',
        rows: [
          {
            kind: 'kv',
            cells: [
              {
                label: 'Construction Site Name & WDID No.',
                value: `${project.name}${project.wdid ? ` · ${project.wdid}` : ''}`,
              },
            ],
          },
          {
            kind: 'kv',
            cells: [
              { label: 'Project Risk Level', value: String(riskLevel) },
              { label: 'Photos Taken', value: 'Yes' },
            ],
          },
          {
            kind: 'kv',
            cells: [
              { label: 'Construction Stage', value: String(constructionStage) },
              { label: 'Current Weather', value: String(currentWeatherLabel) },
            ],
          },
          {
            kind: 'kv',
            cells: [
              { label: 'Address', value: project.address || 'N/A' },
              { label: 'Permit Number', value: project.permit_number || 'N/A' },
            ],
          },
          {
            kind: 'kv',
            cells: [
              isLinear
                ? { label: 'Corridor Length', value: corridorMileage }
                : {
                    label: 'Total Acreage',
                    value:
                      project.acreage != null
                        ? `${project.acreage} acres`
                        : 'N/A',
                  },
            ],
          },
        ],
      },
      {
        heading: 'Weather',
        rows: [
          {
            kind: 'kv',
            cells: [
              {
                label: 'Estimated QPE Beginning',
                value: isStormRelevant
                  ? String(inspection?.qpe_start ?? 'N/A')
                  : 'N/A',
              },
              {
                label: 'Estimated QPE Duration',
                value: isStormRelevant
                  ? String(inspection?.qpe_duration_hours ?? 'N/A')
                  : 'N/A',
              },
            ],
          },
          {
            kind: 'kv',
            cells: [
              {
                label: 'End Date of QPE',
                value: isStormRelevant
                  ? String(inspection?.qpe_end ?? 'N/A')
                  : 'N/A',
              },
              {
                label: 'Rain Gauge reading (inches)',
                value: String(inspection?.rain_gauge_inches ?? 'N/A'),
              },
            ],
          },
        ],
      },
      {
        heading: 'Exemption Documentation',
        rows: [
          {
            kind: 'note',
            label:
              'Exemption Documentation (explanation required if inspection could not be conducted)',
            value:
              'Visual inspections are not required outside of business hours or during dangerous weather conditions such as flooding or electrical storms.',
          },
        ],
      },
      {
        heading: 'Site Observations',
        rows: (() => {
          const checks = SITE_OBSERVATION_CHECKS;
          const rows: Part1Group['rows'] = [];
          for (let i = 0; i < checks.length; i += 2) {
            const a = checks[i];
            const b = checks[i + 1];
            rows.push({
              kind: 'kv',
              cells: [
                {
                  label: a.label,
                  value: String(inspection?.[`obs_${a.id}`] ?? 'No'),
                },
                ...(b
                  ? [
                      {
                        label: b.label,
                        value: String(inspection?.[`obs_${b.id}`] ?? 'No'),
                      },
                    ]
                  : []),
              ],
            });
          }
          rows.push({
            kind: 'kv',
            cells: [
              {
                label: 'Comments on presence',
                value: inspection?.observation_comments || '',
              },
            ],
          });
          return rows;
        })(),
      },
      {
        heading: 'Inspector Information',
        rows: [
          {
            kind: 'kv',
            cells: [
              { label: 'Inspector Name', value: inspectorName },
              { label: 'Inspector Title', value: 'QSP' },
            ],
          },
          {
            kind: 'kv',
            cells: [
              { label: 'Signature', value: inspectorName },
              { label: 'Date', value: signatureDate },
            ],
          },
        ],
      },
    ];

    const part1Data: Part1Data = {
      date: inspectionDateLabel,
      inspectionType,
      groups: part1Groups,
    };

    const part2Data = buildPart2Data(riskLevel, checkpoints, todayShort);

    const part3FromChecklist = buildPart3DataFromPart2(part2Data);
    const part3Data: Part3Data = {
      rows: [
        ...part3FromChecklist.rows,
        ...deficiencyList.map((def) => ({
          deficiency:
            (def.description as string) ||
            ((def.checkpoints as { name?: string })?.name ?? 'Open deficiency'),
          recommendation:
            (def.corrective_action as string) ||
            'Repairs must begin within 72 hours of identification.',
        })),
      ],
    };

    const sections: ReportSection[] = [
      {
        id: 'part-1-general-info',
        title: 'Part 1: General Information',
        content: generalInfoContent,
        type: 'table',
        editable: false,
        data: { kind: 'part1', payload: part1Data },
      },
      {
        id: 'part-2-bmp-observations',
        title: 'Part 2: BMP Observations',
        content: bmpObservationsContent,
        type: 'table',
        editable: false,
        data: { kind: 'part2', payload: part2Data },
      },
      {
        id: 'part-3-deficiencies',
        title: 'Part 3: Descriptions of BMP deficiencies',
        content: deficiencyContent.trim(),
        type: 'table',
        editable: false,
        data: { kind: 'part3', payload: part3Data },
      },
      ...(stormObservationsContent
        ? [{
            id: 'part-4-storm-observations',
            title: 'Part 4: Additional During Storm Observations',
            content: stormObservationsContent,
            type: 'text' as const,
            editable: true,
          }]
        : []),
      {
        id: 'part-7-corrective-actions',
        title: 'Part 7: Additional Corrective Actions Required',
        content: correctiveActionContent.trim(),
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
      log.error('Error creating report', { reportError });
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
      log.error('Error creating activity event', { activityError });
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
    log.error('Unexpected error in POST /api/reports/generate', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
