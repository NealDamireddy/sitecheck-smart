/**
 * Shared input shape for SMARTS export targets (Excel + walkthrough).
 *
 * Both renderers consume the same data — an event, the project's
 * monitoring locations, and the samples (with nested parameter_results)
 * for the event — and just emit different formats. Co-locating the
 * input type here prevents drift between excel-export.ts and
 * walkthrough.ts as new fields land.
 *
 * Use `Pick` on the SmartsEvent fields actually needed for export so
 * that hydration code paths can build an input without populating the
 * created_at/updated_at columns. Add new picked fields here when an
 * export target needs them.
 */

import type { MonitoringLocation, Sample, SmartsEvent } from '@/types';

export interface SmartsExportInput {
  event: Pick<
    SmartsEvent,
    | 'id'
    | 'projectId'
    | 'status'
    | 'source'
    | 'forecastDetectedAt'
    | 'startedAt'
    | 'endedAt'
    | 'precipitationInches'
    | 'notes'
  >;
  projectName: string;
  wdid: string | null;
  monitoringLocations: MonitoringLocation[];
  samples: Sample[];
}
