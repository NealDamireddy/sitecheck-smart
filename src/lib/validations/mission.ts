import { z } from 'zod';

const waypointInput = z.object({
  checkpointId: z.string().optional(),
  number: z.number().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  captureStatus: z.string().optional(),
  arrivalTime: z.string().optional(),
  photo: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  altitudeOverride: z.number().nullable().optional(),
  hoverTimeSeconds: z.number().optional(),
  captureMode: z.string().optional(),
  operatorNotes: z.string().nullable().optional(),
  sortOrder: z.number().nullable().optional(),
});

export const missionCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  name: z.string().min(1).max(500),
  status: z.string().optional(),
  date: z.string().optional(),
  inspectionType: z.string().optional(),
  flightTimeMinutes: z.number().optional(),
  altitude: z.number().min(0).max(400).optional(),
  batteryStart: z.number().min(0).max(100).optional(),
  batteryEnd: z.number().min(0).max(100).optional(),
  weatherTemperature: z.number().optional(),
  weatherCondition: z.string().optional(),
  weatherWindSpeedMph: z.number().optional(),
  weatherHumidity: z.number().optional(),
  flightPath: z.array(z.tuple([z.number(), z.number()])).optional(),
  waypoints: z.array(waypointInput).optional(),
  scope: z.string().optional(),
  endOfMissionAction: z.string().optional(),
  editedFlightPath: z.array(z.tuple([z.number(), z.number()])).optional(),
  lastCompletedWaypoint: z.number().optional(),
  resumeValid: z.boolean().optional(),
  sourceDocumentPages: z.array(z.number()).optional(),
  manualOverrideActive: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
});

export const missionUpdate = missionCreate.partial().extend({
  _previousStatus: z.string().optional(),
});

export const missionComplete = z.object({
  trigger: z.enum(['auto', 'manual']).optional(),
}).optional();

export const waypointUpdate = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  captureStatus: z.string().optional(),
  photo: z.string().nullable().optional(),
  enabled: z.boolean().optional(),
  altitudeOverride: z.number().nullable().optional(),
  hoverTimeSeconds: z.number().optional(),
  captureMode: z.string().optional(),
  operatorNotes: z.string().nullable().optional(),
  sortOrder: z.number().nullable().optional(),
});

export const waypointAnalyze = z.object({
  photoIndex: z.number().optional(),
  hint: z.string().max(1000).optional(),
}).optional();

export const generateMission = z.object({
  checkpoints: z.array(z.object({
    id: z.string(),
    name: z.string(),
    bmpType: z.string(),
    lat: z.number(),
    lng: z.number(),
    linearRef: z.object({
      station: z.number(),
      offset: z.number().optional(),
      segmentId: z.string().optional(),
    }).optional(),
  })).min(1, 'At least one checkpoint required'),
  siteInfo: z.object({
    centerLat: z.number(),
    centerLng: z.number(),
  }),
  scope: z.string().optional(),
  endOfMissionAction: z.string().optional(),
  inspectionType: z.string().optional(),
  altitude: z.number().min(0).max(400).optional(),
  name: z.string().optional(),
  notes: z.string().optional(),
  sourceDocumentPages: z.array(z.number()).optional(),
  projectType: z.enum(['bounded-site', 'linear']).optional(),
  centerline: z.array(z.tuple([z.number(), z.number()])).optional(),
  projectId: z.string().optional(),
});
