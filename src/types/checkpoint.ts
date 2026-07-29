import type { AnyBmpType, DbBmpType } from '@/lib/cgp/bmp-types';

/**
 * Every BMP category the UI can display. Derived from
 * src/lib/cgp/bmp-types.ts so this can no longer drift from the Zod
 * schema or the database CHECK constraint (DRF-01).
 *
 * NOTE: this is wider than what can be PERSISTED — the five
 * linear-infrastructure values are display-only until the CHECK
 * constraint is widened. Use `PersistableBMPCategory` for writes.
 */
export type BMPCategory = AnyBmpType;

/** The subset `checkpoints.bmp_type` will actually accept. */
export type PersistableBMPCategory = DbBmpType;

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
  /** Most recent QSP-uploaded field photo (Supabase Storage URL). */
  qspPhotoUrl?: string | null;
  /** ISO timestamp of the most recent QSP photo upload. */
  qspPhotoUploadedAt?: string | null;
  installDate: string;
  swpppPage: number;
  /** Linear referencing for corridor projects */
  linearRef?: LinearReference;
  /** Formatted station label (e.g., "STA 15+25") */
  stationLabel?: string;
}
