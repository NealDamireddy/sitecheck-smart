import { z } from 'zod';

const VALID_TYPES = ['routine', 'pre-storm', 'post-storm', 'qpe'] as const;
const VALID_TRIGGERS = ['manual', 'routine', 'rain-event', 'post-storm', 'pre-storm', 'qpe'] as const;
const VALID_STATUSES = ['draft', 'in-progress', 'submitted', 'archived'] as const;

const findingInput = z.object({
  checkpointId: z.string(),
  status: z.string(),
  notes: z.string().optional(),
});

export const inspectionCreate = z.object({
  id: z.string().optional(),
  projectId: z.string().optional(),
  date: z.string().optional(),
  type: z.enum(VALID_TYPES).optional(),
  inspector: z.string().optional(),
  weather: z.object({
    temperature: z.number().optional(),
    condition: z.string().optional(),
    windSpeedMph: z.number().optional(),
    humidity: z.number().optional(),
  }).optional(),
  weatherTemperature: z.number().optional(),
  weatherCondition: z.string().optional(),
  weatherWindSpeedMph: z.number().optional(),
  weatherHumidity: z.number().optional(),
  overallCompliance: z.number().min(0).max(100).optional(),
  missionId: z.string().optional(),
  trigger: z.enum(VALID_TRIGGERS).optional(),
  triggerEventId: z.string().optional(),
  dueBy: z.string().optional(),
  status: z.enum(VALID_STATUSES).optional(),
  narrative: z.string().max(10000).optional(),
  findings: z.array(findingInput).optional(),
  missionIds: z.array(z.string()).optional(),
  segmentId: z.string().optional(),
});

export const inspectionUpdate = z.object({
  narrative: z.string().max(10000).nullable().optional(),
  inspector: z.string().optional(),
  status: z.enum(VALID_STATUSES).optional(),
  dueBy: z.string().nullable().optional(),
  reportId: z.string().nullable().optional(),
});

export const inspectionSubmit = z.object({
  reportId: z.string().optional(),
}).optional();

export const inspectionAddMission = z.object({
  missionId: z.string().min(1, 'missionId is required'),
});

export const checkRainEvents = z.object({
  projectId: z.string().optional(),
}).optional();
