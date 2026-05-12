export type BMPCategory =
  | 'erosion-control'
  | 'sediment-control'
  | 'tracking-control'
  | 'wind-erosion'
  | 'materials-management'
  | 'non-storm-water'
  // Linear infrastructure-specific BMP types
  | 'trench-plug'
  | 'slope-breaker'
  | 'water-bar'
  | 'hdd-containment'
  | 'stream-crossing-erosion';

export type CheckpointStatus = 'compliant' | 'deficient' | 'needs-review';
export type Priority = 'high' | 'medium' | 'low';
export type Zone = 'north' | 'south' | 'east' | 'west' | 'central';

export interface LinearReference {
  /** Station number in project units (e.g., 1525 for STA 15+25) */
  station: number;
  /** Offset from centerline in feet (positive = right, negative = left) */
  offset: number;
  /** Which segment this checkpoint belongs to */
  segmentId?: string;
  /** Optional crossing this checkpoint is associated with */
  crossingId?: string;
}

export interface Checkpoint {
  id: string;
  name: string;
  bmpType: BMPCategory;
  status: CheckpointStatus;
  priority: Priority;
  zone?: Zone;
  description: string;
  cgpSection: string;
  location: { lat: number; lng: number };
  lat?: number;
  lng?: number;
  lastInspectionDate: string;
  lastInspectionPhoto: string;
  previousPhoto?: string;
  installDate: string;
  swpppPage: number;
  /** Linear referencing for corridor projects */
  linearRef?: LinearReference;
  /** Formatted station label (e.g., "STA 15+25") */
  stationLabel?: string;
}
