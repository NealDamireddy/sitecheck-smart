/**
 * Predefined sampling point at a project. During a qualifying storm the
 * QSP collects pH and turbidity samples at every `active` location.
 *
 * Locations are project-scoped, RLS-protected via `project_id`, and
 * managed independently of any individual smarts event — they are
 * site fixtures, not per-storm.
 */

export type MonitoringLocationStatus = 'active' | 'inactive';

/**
 * SMARTS-defined discharge point classifications.
 * Mirrors the dropdown in the SMARTS monitoring-location wizard.
 * Enforced at the DB level by migration 010's CHECK constraint.
 */
export type DischargePointType =
  | 'Effluent'
  | 'Infiltration-Groundwater'
  | 'Influent'
  | 'Internal'
  | 'Receiving Water';

export interface MonitoringLocation {
  id: string;
  projectId: string;
  name: string;
  /** Free-text label for the drainage area served (e.g. "DA-1", "5.2 ac"). */
  drainageArea: string;
  /** SMARTS dropdown — one of five fixed values. */
  dischargePointType: DischargePointType;
  /** True when this discharge passes through an Active Treatment System. */
  isAts: boolean;
  /** True when this location relies on passive treatment (basin, swale, etc). */
  isPassiveTreatment: boolean;
  description?: string;
  latitude?: number;
  longitude?: number;
  status: MonitoringLocationStatus;
  createdAt: string;
  updatedAt: string;
}
