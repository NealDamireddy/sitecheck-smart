/**
 * Geofence — an allowed-area polygon for a project.
 *
 * Drone missions are validated against the project's geofence at planning time.
 * If a mission's flight path leaves the geofence (or exceeds the optional altitude
 * ceiling), it is rejected with a 422 violation.
 *
 * For linear projects the default geofence is auto-derived by buffering the
 * corridor centerline. For bounded-site projects it is auto-derived from the
 * project bounding box. Manual overrides are stored with `source: 'manual'`.
 */
export interface Geofence {
  id: string;
  projectId: string;
  name: string;
  /** Closed ring of [lng, lat] points; first == last */
  polygon: [number, number][];
  /** Optional altitude ceiling in feet AGL */
  ceilingFeet?: number;
  /** Optional altitude floor in feet AGL (rare; usually 0) */
  floorFeet?: number;
  /** Source of the polygon: 'auto' (derived from corridor/ROW/bounds) or 'manual' (override) */
  source: 'auto' | 'manual';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}
