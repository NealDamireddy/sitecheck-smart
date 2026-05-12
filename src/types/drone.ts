import { CheckpointStatus } from './checkpoint';
import { WeatherSnapshot } from './weather';

export type InspectionType = 'routine' | 'pre-storm' | 'post-storm' | 'qpe';

// --- New Phase 16 types ---

export type MissionScope =
  | 'full'
  | 'selected-bmps'
  | 'priority'
  | 'deficient'
  | 'reinspection'
  | 'ad-hoc'
  | 'segment';

export type MissionStatus =
  | 'planned'
  | 'in-progress'
  | 'paused'
  | 'completed'
  | 'aborted'
  | 'returning-home';

export type EndOfMissionAction =
  | 'return-home'
  | 'hover-final'
  | 'land-safe-point'
  | 'wait-for-input';

export type CaptureMode =
  | 'auto'
  | 'photo-only'
  | 'video-pass'
  | 'manual-review'
  | 'hover-inspect';

export type WaypointOutcome =
  | 'pending'
  | 'captured'
  | 'missed'
  | 'skipped'
  | 'compliant'
  | 'deficient'
  | 'needs-maintenance'
  | 'not-visible'
  | 'blocked'
  | 'unsafe'
  | 'ground-follow-up';

export type FlightControlAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'stop'
  | 'return-home'
  | 'emergency-hold'
  | 'manual-takeover'
  | 'resume-mission';

// --- Mission Control types ---

// Live telemetry streamed from drone hardware. Block 4: this shape is now also
// the persisted-sample shape — every emitted frame is POSTed to
// /api/missions/[id]/telemetry/sample and appended to the mission's
// actual_flight_path JSONB array.
export interface DroneTelemetry {
  lat: number;
  lng: number;
  altitudeFeet: number;
  speedMph: number;
  headingDeg: number;           // 0-360, 0 = north
  batteryPercent: number;
  signalStrengthPercent: number;
  gpsSatellites: number;
  timestamp: string;            // ISO 8601
}

// Block 4: alias for the persisted shape so callers that mean "a single
// recorded flight sample" can be self-documenting without diverging from
// the live telemetry contract.
export type DroneTelemetrySample = DroneTelemetry;

// Manual override actions available during manual control mode
export type ManualOverrideAction =
  | 'reposition'
  | 'hover-longer'
  | 'retake-photo'
  | 'adjust-camera-angle'
  | 'resume-mission';

// QSP review decision for a checkpoint's AI finding
export type QSPReviewDecision = 'accept' | 'override' | 'pending';

export interface QSPReviewEntry {
  checkpointId: string;
  waypointNumber: number;
  aiAnalysis: AIAnalysis;
  decision: QSPReviewDecision;
  overrideStatus?: CheckpointStatus;   // only when decision === 'override'
  overrideNotes?: string;
  reviewedAt?: string;                 // ISO 8601
}

// Report readiness derived from checkpoint review state
export type ReportReadiness = 'not-ready' | 'partially-reviewed' | 'ready';

// --- Existing types (unchanged) ---

export interface AIAnalysis {
  checkpointId: string;
  summary: string;
  status: CheckpointStatus;
  confidence: number;
  details: string[];
  cgpReference: string;
  recommendations?: string[];
}

// Extended Waypoint — all new fields are optional for backwards compatibility
export interface Waypoint {
  number: number;
  checkpointId: string;
  lat: number;
  lng: number;
  captureStatus: WaypointOutcome;
  arrivalTime: string;
  photo?: string;
  aiAssessment?: AIAnalysis;
  // Phase 16 additions
  enabled?: boolean;
  altitudeOverride?: number;
  hoverTimeSeconds?: number;
  captureMode?: CaptureMode;
  operatorNotes?: string;
  sortOrder?: number;
  // Mission Control additions
  photos?: string[];              // multiple captures per waypoint
  qspReview?: QSPReviewEntry;     // QSP review data
  // Block 4 additions: persisted captured-position metadata
  actualLat?: number;
  actualLng?: number;
  actualAltitude?: number;
  capturedAt?: string;            // ISO 8601 timestamp of the capture
}

// Extended DroneMission — all new fields are optional for backwards compatibility
export interface DroneMission {
  id: string;
  name: string;
  status: MissionStatus;
  date: string;
  inspectionType: InspectionType;
  flightTimeMinutes: number;
  altitude: number;
  batteryStart: number;
  batteryEnd: number;
  // Optional — freshly-planned missions and Block 4 records won't carry a
  // flight-time weather snapshot until the mission actually flies. Every
  // consumer must null-guard this read.
  weatherAtFlight?: WeatherSnapshot;
  waypoints: Waypoint[];
  flightPath: [number, number][];
  // Phase 16 additions
  scope?: MissionScope;
  endOfMissionAction?: EndOfMissionAction;
  editedFlightPath?: [number, number][] | null;
  lastCompletedWaypoint?: number | null;
  resumeValid?: boolean;
  sourceDocumentPages?: number[] | null;
  manualOverrideActive?: boolean;
  notes?: string;
  // Mission Control additions
  reportReadiness?: ReportReadiness;
  // Block 4 additions: persisted actual telemetry track + completion metadata
  actualFlightPath?: DroneTelemetrySample[];
  completedAt?: string;
  totalFlightSeconds?: number;
}

// Block 4: persisted Claude vision analysis for one captured photo, returned by
// the new mission_ai_analyses endpoints. Extends the legacy AIAnalysis shape so
// existing UI components keep working with no field renames.
export interface MissionAIAnalysis extends AIAnalysis {
  id: string;
  missionId: string;
  waypointNumber: number;
  photoUrl: string;
  model: string;
  createdAt: string;
}

// Block 4: aggregate flight-quality metrics rendered by MissionDeviationPanel.
export interface MissionDeviationStats {
  maxDeviationFeet: number;
  meanDeviationFeet: number;
  maxAltitudeDeviationFeet: number;
  capturedWaypointCount: number;
  plannedWaypointCount: number;
  meanGroundSpeedMph: number;
  totalFlightSeconds: number;
  sampleCount: number;
}

// --- Drone hardware abstraction ---

export interface DroneCapabilities {
  supportsVideo: boolean;
  supportsBurst: boolean;
  supportsGimbal: boolean;
  supportsZoom: boolean;
  supportsManualControl: boolean;
  maxAltitude: number;
  minAltitude: number;
}

export interface DroneProvider {
  startMission(missionId: string): Promise<void>;
  pauseMission(missionId: string): Promise<void>;
  resumeMission(missionId: string): Promise<void>;
  stopMission(missionId: string): Promise<void>;
  returnHome(missionId: string): Promise<void>;
  emergencyHold(missionId: string): Promise<void>;
  manualTakeover(missionId: string): Promise<void>;
  resumeFromManual(missionId: string): Promise<void>;
  captureImage(missionId: string, waypointNumber: number): Promise<string | null>;
  isConnected(): boolean;
  getCapabilities(): DroneCapabilities;
  // Mission Control: telemetry subscription
  subscribeTelemetry(
    missionId: string,
    flightPath: [number, number][],
    mission: { altitude: number; batteryStart: number; batteryEnd: number },
    onUpdate: (telemetry: DroneTelemetry) => void
  ): () => void; // returns unsubscribe function
  // Mission Control: manual override actions
  reposition(missionId: string, offsetLat: number, offsetLng: number): Promise<void>;
  hoverLonger(missionId: string, additionalSeconds: number): Promise<void>;
  retakePhoto(missionId: string, waypointNumber: number): Promise<string | null>;
  adjustCameraAngle(missionId: string, pitchDeg: number): Promise<void>;
}
