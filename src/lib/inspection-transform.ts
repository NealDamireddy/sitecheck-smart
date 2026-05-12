/**
 * Block 5 — Snake_case ↔ camelCase transformer for the inspections row.
 *
 * Mirrors the pattern used by the Block 4 mission/review/analysis routes:
 * Supabase rows live in snake_case, the React/Zustand world lives in
 * camelCase, and every API route boundary runs through one of these
 * transformers so the rest of the app never sees a snake_case key.
 */

import type { Inspection } from '@/types/inspection';

type DbInspectionRow = Record<string, unknown>;

interface TransformOptions {
  /** Optional list of mission ids resolved from `inspection_missions`. */
  missionIds?: string[];
}

export function transformInspectionRow(
  row: DbInspectionRow,
  options: TransformOptions = {}
): Inspection {
  return {
    id: row.id as string,
    date: row.date as string,
    type: (row.type as Inspection['type']) ?? 'routine',
    inspector: (row.inspector as string) ?? '',
    weather: {
      temperature: (row.weather_temperature as number) ?? 0,
      condition: (row.weather_condition as Inspection['weather']['condition']) ?? 'clear',
      windSpeedMph: (row.weather_wind_speed_mph as number) ?? 0,
      humidity: (row.weather_humidity as number) ?? 0,
    },
    findings: [], // findings live in inspection_findings; populated by callers that need them
    overallCompliance: (row.overall_compliance as number) ?? 0,
    missionId: (row.mission_id as string | null) ?? undefined,
    segmentId: (row.segment_id as string | null) ?? undefined,
    stationRangeStart: (row.station_range_start as number | null) ?? undefined,
    stationRangeEnd: (row.station_range_end as number | null) ?? undefined,
    // Block 5 additions
    trigger: (row.trigger as Inspection['trigger']) ?? 'manual',
    triggerEventId: (row.trigger_event_id as string | null) ?? undefined,
    dueBy: (row.due_by as string | null) ?? undefined,
    status: (row.status as Inspection['status']) ?? 'draft',
    narrative: (row.narrative as string | null) ?? undefined,
    aiOverallCompliance: (row.ai_overall_compliance as number | null) ?? undefined,
    qspOverallCompliance: (row.qsp_overall_compliance as number | null) ?? undefined,
    reportId: (row.report_id as string | null) ?? undefined,
    submittedAt: (row.submitted_at as string | null) ?? undefined,
    missionIds: options.missionIds ?? [],
    updatedAt: (row.updated_at as string | null) ?? undefined,
  };
}
