/**
 * Crossing types for linear infrastructure projects.
 *
 * A "crossing" is a specific point along a corridor where the infrastructure
 * intersects another linear feature (waterway, road, utility, etc.) and
 * typically requires special permits, construction methods (HDD, bore, etc.),
 * and additional inspection.
 */

export type CrossingType =
  | 'stream'
  | 'road'
  | 'utility'
  | 'railroad'
  | 'wetland';

export type CrossingStatus =
  | 'pending'
  | 'approved'
  | 'in-progress'
  | 'completed'
  | 'flagged';

export interface Crossing {
  id: string;
  projectId: string;
  /** Optional segment this crossing belongs to */
  segmentId?: string;
  crossingType: CrossingType;
  name: string;
  /** Station number along the corridor centerline (in project linear units) */
  stationNumber?: number;
  /** Pre-formatted station label, e.g. "STA 15+50" */
  stationLabel?: string;
  /** GeoJSON-style point: [lng, lat] */
  location?: [number, number];
  description?: string;
  /** List of permit type strings required for this crossing (e.g. ['404', '401']) */
  permitsRequired: string[];
  status: CrossingStatus;
  createdAt?: string;
  updatedAt?: string;
}

export const CROSSING_TYPE_LABELS: Record<CrossingType, string> = {
  stream: 'Stream / Waterway',
  road: 'Road / Highway',
  utility: 'Existing Utility',
  railroad: 'Railroad',
  wetland: 'Wetland',
};

export const CROSSING_TYPE_COLORS: Record<CrossingType, string> = {
  stream: '#0EA5E9',     // sky-500
  road: '#F59E0B',       // amber-500
  utility: '#A855F7',    // purple-500
  railroad: '#EF4444',   // red-500
  wetland: '#10B981',    // emerald-500
};

export const CROSSING_TYPE_ICONS: Record<CrossingType, string> = {
  stream: '〰️',
  road: '🛣️',
  utility: '⚡',
  railroad: '🚂',
  wetland: '🌿',
};

export const CROSSING_STATUS_LABELS: Record<CrossingStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  'in-progress': 'In Progress',
  completed: 'Completed',
  flagged: 'Flagged',
};

export const CROSSING_STATUS_COLORS: Record<
  CrossingStatus,
  { bg: string; text: string; border: string }
> = {
  pending: {
    bg: 'bg-gray-500/10',
    text: 'text-gray-300',
    border: 'border-gray-500/30',
  },
  approved: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-300',
    border: 'border-blue-500/30',
  },
  'in-progress': {
    bg: 'bg-amber-500/10',
    text: 'text-amber-300',
    border: 'border-amber-500/30',
  },
  completed: {
    bg: 'bg-green-500/10',
    text: 'text-green-300',
    border: 'border-green-500/30',
  },
  flagged: {
    bg: 'bg-red-500/10',
    text: 'text-red-300',
    border: 'border-red-500/30',
  },
};
