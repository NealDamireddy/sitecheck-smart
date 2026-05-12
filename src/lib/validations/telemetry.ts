import { z } from 'zod';

export const telemetrySample = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  altitudeFeet: z.number().min(0).max(2000),
  speedMph: z.number().min(0).max(200),
  headingDeg: z.number().min(0).max(360),
  batteryPercent: z.number().min(0).max(100),
  signalStrengthPercent: z.number().min(0).max(100),
  gpsSatellites: z.number().min(0).max(50),
  timestamp: z.string(),
});
