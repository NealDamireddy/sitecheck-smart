/**
 * Zod schemas for CLAUDE MODEL OUTPUT (SEC-07).
 *
 * Model responses are untrusted input: a prompt-injected SWPPP PDF or
 * photo can shape what the model returns. Every field that gets
 * persisted or shown to a user is validated here first — wrong shape
 * halts the request loudly (502), it never coerces to defaults and
 * never persists garbage.
 *
 * Length caps are deliberate: they bound what an injected document can
 * smuggle into the DB/UI, without being tight enough to reject real
 * analyses.
 */

import { z } from 'zod';

const shortText = z.string().max(2_000);
const textList = z.array(shortText).max(50);

/**
 * Output of the text-only checkpoint analysis (/api/analyze).
 * The prompt requests exactly these five fields; `status` is NOT part of
 * the model contract there (the route preserves the caller's status).
 */
export const bmpTextAnalysisOutput = z.object({
  summary: z.string().min(1).max(2_000),
  confidence: z.number().min(0).max(100),
  details: textList,
  cgpReference: z.string().max(500),
  recommendations: textList,
});

/**
 * Output of the photo (vision) analysis — lib/ai-vision.ts. Same fields
 * plus the model's compliance verdict, which must be one of the three
 * statuses the DB CHECK accepts.
 */
export const bmpVisionAnalysisOutput = bmpTextAnalysisOutput.extend({
  status: z.enum(['compliant', 'deficient', 'needs-review']),
});

/** Output of the SWPPP PDF extraction (/api/scan-swppp). */
export const swpppExtractionOutput = z.object({
  siteInfo: z.object({
    projectName: z.string().max(300),
    address: z.string().max(500),
    totalAcres: z.number().min(0).max(100_000),
    riskLevel: z.string().max(50),
    centerLat: z.number().min(-90).max(90),
    centerLng: z.number().min(-180).max(180),
  }),
  checkpoints: z
    .array(
      z.object({
        id: z.string().min(1).max(50),
        name: z.string().min(1).max(300),
        bmpType: z.string().min(1).max(100),
        description: z.string().max(5_000),
        cgpSection: z.string().max(200),
        zone: z.string().max(50),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
    )
    .max(500),
});

export type BmpTextAnalysisOutput = z.infer<typeof bmpTextAnalysisOutput>;
export type BmpVisionAnalysisOutput = z.infer<typeof bmpVisionAnalysisOutput>;
export type SwpppExtractionOutput = z.infer<typeof swpppExtractionOutput>;
