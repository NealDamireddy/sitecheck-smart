/**
 * No-Fly Zone — a forbidden-area polygon for a project.
 *
 * Each project may have any number of no-fly zones. Drone missions are
 * validated against all `active: true` zones for the project at planning time.
 * If any waypoint or flight-path segment intersects a no-fly zone polygon
 * (and the waypoint altitude falls within the zone's floor/ceiling band),
 * the mission is rejected with a 422 violation.
 */

export type NoFlyZoneCategory =
  | 'airport'         // FAA Class B/C/D airspace, airport buffers
  | 'school'          // school buffer
  | 'critical-infra'  // power plant, water treatment, substation, etc.
  | 'wildlife'        // sensitive habitat
  | 'private'         // landowner restriction
  | 'temporary';      // temporary flight restriction (NOTAM-equivalent)

export interface NoFlyZone {
  id: string;
  projectId: string;
  name: string;
  category: NoFlyZoneCategory;
  /** Closed ring of [lng, lat] points; first == last */
  polygon: [number, number][];
  /** Lower bound in feet AGL (default 0). Below this altitude the zone does not apply. */
  floorFeet?: number;
  /** Upper bound in feet AGL (default Infinity). Above this altitude the zone does not apply. */
  ceilingFeet?: number;
  description?: string;
  /** Provenance label, e.g. 'FAA', 'manual', 'imported' */
  source?: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export const NOFLY_CATEGORY_LABELS: Record<NoFlyZoneCategory, string> = {
  airport: 'Airport / Class B-D',
  school: 'School Buffer',
  'critical-infra': 'Critical Infrastructure',
  wildlife: 'Wildlife Sensitive',
  private: 'Private Restriction',
  temporary: 'Temporary (TFR)',
};

export const NOFLY_CATEGORY_COLORS: Record<NoFlyZoneCategory, string> = {
  airport: '#dc2626',         // red-600
  school: '#f97316',          // orange-500
  'critical-infra': '#a855f7', // purple-500
  wildlife: '#16a34a',        // green-600
  private: '#64748b',         // slate-500
  temporary: '#eab308',       // yellow-500
};
