import { z } from 'zod';

const qspInfo = z.object({
  name: z.string().optional(),
  licenseNumber: z.string().optional(),
  company: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
}).optional();

const corridorInfo = z.object({
  centerline: z.array(z.tuple([z.number(), z.number()])).min(2),
  corridorWidthFeet: z.number().optional(),
  totalLength: z.number().optional(),
  linearUnit: z.string().optional(),
}).optional();

const segmentInput = z.object({
  id: z.string().optional(),
  name: z.string(),
  startStation: z.number().optional(),
  endStation: z.number().optional(),
  centerlineSlice: z.array(z.tuple([z.number(), z.number()])).optional(),
});

export const projectCreate = z.object({
  id: z.string().min(1, 'id is required'),
  name: z.string().min(1, 'name is required').max(500),
  address: z.string().max(1000).optional(),
  permitNumber: z.string().optional(),
  wdid: z.string().optional(),
  riskLevel: z.number().min(1).max(3).optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  estimatedCompletion: z.string().optional(),
  acreage: z.number().optional(),
  projectType: z.enum(['bounded-site', 'linear']).optional(),
  coordinates: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
  bounds: z.array(z.tuple([z.number(), z.number()])).length(2).optional(),
  qsp: qspInfo,
  corridor: corridorInfo,
  linearMileage: z.number().optional(),
  segments: z.array(segmentInput).optional(),
  rowBoundaries: z.object({
    left: z.array(z.unknown()).optional(),
    right: z.array(z.unknown()).optional(),
    easementDescription: z.string().optional(),
    widthFeet: z.number().optional(),
  }).optional(),
});
