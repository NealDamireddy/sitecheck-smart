export interface QSP {
  name: string;
  licenseNumber: string;
  company: string;
  phone: string;
  email: string;
}

export type ProjectType = 'bounded-site' | 'linear';

export interface CorridorGeometry {
  /** GeoJSON LineString coordinates [[lng, lat], ...] representing the project centerline */
  centerline: [number, number][];
  /** Width of the corridor in feet (used for buffer visualization) */
  corridorWidthFeet: number;
  /** Total length in the project's linear unit */
  totalLength: number;
  /** Unit for linear referencing */
  linearUnit: 'feet' | 'miles';
}

export interface ProjectSegment {
  id: string;
  name: string;
  /** Station range start (in project's linear unit) */
  startStation: number;
  /** Station range end (in project's linear unit) */
  endStation: number;
  /** Subset of centerline coordinates for this segment */
  centerlineSlice?: [number, number][];
}

export interface RowBoundaries {
  /** Left ROW boundary line: GeoJSON LineString [[lng, lat], ...] */
  left: [number, number][];
  /** Right ROW boundary line: GeoJSON LineString [[lng, lat], ...] */
  right: [number, number][];
  /** Easement description (legal language, agency, etc.) */
  easementDescription?: string;
  /** Total ROW width in feet (used to auto-generate boundaries from centerline) */
  widthFeet?: number;
}

export interface Project {
  id: string;
  name: string;
  address: string;
  permitNumber: string;
  wdid: string;
  riskLevel: 1 | 2 | 3;
  qsp: QSP;
  status: 'active' | 'inactive';
  startDate: string;
  estimatedCompletion: string;
  acreage: number;
  coordinates: { lat: number; lng: number };
  bounds: [[number, number], [number, number]];
  /** Project type — defaults to 'bounded-site' for backwards compatibility */
  projectType?: ProjectType;
  /** Corridor geometry (only for linear projects) */
  corridor?: CorridorGeometry;
  /** Named segments (only for linear projects) */
  segments?: ProjectSegment[];
  /** Total linear mileage (only for linear projects) */
  linearMileage?: number;
  /** Right-of-way boundaries (linear projects only) */
  rowBoundaries?: RowBoundaries;
  /** Allowed flight area for drone missions (any project type). When omitted,
   *  the geofences API auto-derives one from the corridor or bounding box. */
  geofence?: import('./geofence').Geofence;
  /** Forbidden flight zones for drone missions (any project type). */
  noFlyZones?: import('./nofly-zone').NoFlyZone[];
}
