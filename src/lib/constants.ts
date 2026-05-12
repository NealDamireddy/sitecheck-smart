import { BMPCategory } from '@/types/checkpoint';

export const BMP_CATEGORY_LABELS: Record<BMPCategory, string> = {
  'erosion-control': 'Erosion Control',
  'sediment-control': 'Sediment Control',
  'tracking-control': 'Tracking Control',
  'wind-erosion': 'Wind Erosion',
  'materials-management': 'Materials Management',
  'non-storm-water': 'Non-Storm Water',
  // Linear infrastructure BMPs
  'trench-plug': 'Trench Plug',
  'slope-breaker': 'Slope Breaker',
  'water-bar': 'Water Bar',
  'hdd-containment': 'HDD Containment',
  'stream-crossing-erosion': 'Stream Crossing Erosion',
};

export const BMP_CATEGORY_COLORS: Record<BMPCategory, string> = {
  'erosion-control': '#3B82F6',
  'sediment-control': '#F59E0B',
  'tracking-control': '#8B5CF6',
  'wind-erosion': '#06B6D4',
  'materials-management': '#EC4899',
  'non-storm-water': '#10B981',
  // Linear infrastructure BMPs
  'trench-plug': '#EAB308',
  'slope-breaker': '#14B8A6',
  'water-bar': '#0EA5E9',
  'hdd-containment': '#F97316',
  'stream-crossing-erosion': '#A855F7',
};

export const STATUS_COLORS = {
  compliant: '#22C55E',
  deficient: '#EF4444',
  'needs-review': '#8B5CF6',
} as const;

export const STATUS_LABELS = {
  compliant: 'Compliant',
  deficient: 'Deficient',
  'needs-review': 'Needs Review',
} as const;

export const INSPECTION_TYPE_LABELS = {
  routine: 'Routine',
  'pre-storm': 'Pre-Storm',
  'post-storm': 'Post-Storm',
  qpe: 'QPE Response',
} as const;

export const WEATHER_ICONS: Record<string, string> = {
  clear: '☀️',
  'partly-cloudy': '⛅',
  cloudy: '☁️',
  'light-rain': '🌦️',
  rain: '🌧️',
  'heavy-rain': '⛈️',
  thunderstorm: '🌩️',
  fog: '🌫️',
};

// --- Phase 16: Drone mission constants ---

import type {
  MissionScope,
  MissionStatus,
  EndOfMissionAction,
  CaptureMode,
  WaypointOutcome,
  ManualOverrideAction,
  QSPReviewDecision,
  ReportReadiness,
} from '@/types/drone';

export const MISSION_SCOPE_LABELS: Record<MissionScope, string> = {
  full: 'Full Project',
  'selected-bmps': 'Selected BMPs',
  priority: 'Priority Only',
  deficient: 'Deficient Only',
  reinspection: 'Reinspection',
  'ad-hoc': 'Ad Hoc',
  segment: 'Corridor Segment',
};

export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  planned: 'Planned',
  'in-progress': 'In Progress',
  paused: 'Paused',
  completed: 'Completed',
  aborted: 'Aborted',
  'returning-home': 'Returning Home',
};

export const MISSION_STATUS_COLORS: Record<MissionStatus, { bg: string; text: string; border: string }> = {
  planned: { bg: 'bg-blue-500/10', text: 'text-blue-500', border: 'border-blue-500/20' },
  'in-progress': { bg: 'bg-amber-500/10', text: 'text-amber-500', border: 'border-amber-500/20' },
  paused: { bg: 'bg-orange-500/10', text: 'text-orange-500', border: 'border-orange-500/20' },
  completed: { bg: 'bg-green-500/10', text: 'text-green-500', border: 'border-green-500/20' },
  aborted: { bg: 'bg-red-500/10', text: 'text-red-500', border: 'border-red-500/20' },
  'returning-home': { bg: 'bg-purple-500/10', text: 'text-purple-500', border: 'border-purple-500/20' },
};

export const END_OF_MISSION_LABELS: Record<EndOfMissionAction, string> = {
  'return-home': 'Return to Home',
  'hover-final': 'Hover at Final Waypoint',
  'land-safe-point': 'Land at Safe Point',
  'wait-for-input': 'Wait for Operator Input',
};

export const CAPTURE_MODE_LABELS: Record<CaptureMode, string> = {
  auto: 'Auto Capture',
  'photo-only': 'Photo Only',
  'video-pass': 'Video Pass',
  'manual-review': 'Manual Review',
  'hover-inspect': 'Hover & Inspect',
};

export const WAYPOINT_OUTCOME_LABELS: Record<WaypointOutcome, string> = {
  pending: 'Pending',
  captured: 'Captured',
  missed: 'Missed',
  skipped: 'Skipped',
  compliant: 'Compliant',
  deficient: 'Deficient',
  'needs-maintenance': 'Needs Maintenance',
  'not-visible': 'Not Visible',
  blocked: 'Blocked',
  unsafe: 'Unsafe',
  'ground-follow-up': 'Ground Follow-up',
};

export const WAYPOINT_OUTCOME_COLORS: Record<WaypointOutcome, string> = {
  pending: 'text-gray-400 bg-gray-400/10',
  captured: 'text-blue-400 bg-blue-400/10',
  missed: 'text-amber-400 bg-amber-400/10',
  skipped: 'text-gray-500 bg-gray-500/10',
  compliant: 'text-green-400 bg-green-400/10',
  deficient: 'text-red-400 bg-red-400/10',
  'needs-maintenance': 'text-orange-400 bg-orange-400/10',
  'not-visible': 'text-purple-400 bg-purple-400/10',
  blocked: 'text-rose-400 bg-rose-400/10',
  unsafe: 'text-red-500 bg-red-500/10',
  'ground-follow-up': 'text-yellow-400 bg-yellow-400/10',
};

// --- Mission Control constants ---

export const MANUAL_OVERRIDE_ACTION_LABELS: Record<ManualOverrideAction, string> = {
  'reposition': 'Reposition',
  'hover-longer': 'Hover Longer',
  'retake-photo': 'Retake Photo',
  'adjust-camera-angle': 'Adjust Camera',
  'resume-mission': 'Resume Mission',
};

export const REPORT_READINESS_LABELS: Record<ReportReadiness, string> = {
  'not-ready': 'Not Ready',
  'partially-reviewed': 'Partially Reviewed',
  'ready': 'Ready for Report',
};

export const REPORT_READINESS_COLORS: Record<ReportReadiness, { bg: string; text: string; border: string }> = {
  'not-ready': { bg: 'bg-gray-500/10', text: 'text-gray-400', border: 'border-gray-500/20' },
  'partially-reviewed': { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  'ready': { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
};

export const QSP_DECISION_LABELS: Record<QSPReviewDecision, string> = {
  'accept': 'Accept',
  'override': 'Override',
  'pending': 'Pending',
};

export const MAPBOX_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';

export const SITE_CENTER = {
  latitude: 36.7801,
  longitude: -119.4161,
  zoom: 16,
} as const;
