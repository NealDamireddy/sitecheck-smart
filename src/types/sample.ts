/**
 * One sample collected at one `MonitoringLocation` during one `SmartsEvent`.
 *
 * The (smartsEventId, monitoringLocationId) pair is UNIQUE at the DB level
 * — at most one sample per location per event. Re-sampling a location
 * during the same event updates the existing row rather than creating
 * a new one.
 *
 * `parameterResults` is hydrated server-side by the samples API route
 * when the caller asks for the joined view. It's optional because the
 * raw `samples` row does not carry it.
 */

import type { ParameterResult } from './parameter-result';

export interface Sample {
  id: string;
  projectId: string;
  smartsEventId: string;
  monitoringLocationId: string;
  /** ISO 8601 — when the sample was physically collected. */
  sampleDatetime: string;
  /** Free-text — name of the QSP / QSE who collected the sample. */
  qspName: string;
  createdAt: string;
  updatedAt: string;
  /** Resolved server-side from `parameter_results`. Empty array when none. */
  parameterResults?: ParameterResult[];
}
