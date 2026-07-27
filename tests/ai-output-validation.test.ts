/**
 * SEC-07 — model output schemas must reject malformed or injected
 * responses instead of coercing them into compliance records.
 */
import { describe, expect, it } from 'vitest';
import {
  bmpTextAnalysisOutput,
  bmpVisionAnalysisOutput,
  swpppExtractionOutput,
} from '@/lib/validations/ai-output';

const validAnalysis = {
  summary: 'Silt fence intact along the north perimeter; no undermining observed.',
  confidence: 88,
  details: ['Fabric taut, posts vertical', 'No sediment overtopping'],
  cgpReference: 'CGP 2022 § XV.A — Sediment Controls (SE-10)',
  recommendations: [],
};

describe('bmpTextAnalysisOutput', () => {
  it('accepts a well-formed analysis', () => {
    expect(bmpTextAnalysisOutput.safeParse(validAnalysis).success).toBe(true);
  });

  it('rejects a missing summary', () => {
    const { summary: _summary, ...rest } = validAnalysis;
    expect(bmpTextAnalysisOutput.safeParse(rest).success).toBe(false);
  });

  it('rejects confidence outside 0-100', () => {
    expect(
      bmpTextAnalysisOutput.safeParse({ ...validAnalysis, confidence: 140 }).success
    ).toBe(false);
    expect(
      bmpTextAnalysisOutput.safeParse({ ...validAnalysis, confidence: -1 }).success
    ).toBe(false);
  });

  it('rejects oversized injected content', () => {
    expect(
      bmpTextAnalysisOutput.safeParse({
        ...validAnalysis,
        summary: 'x'.repeat(5_000),
      }).success
    ).toBe(false);
    expect(
      bmpTextAnalysisOutput.safeParse({
        ...validAnalysis,
        details: Array.from({ length: 51 }, () => 'observation'),
      }).success
    ).toBe(false);
  });

  it('rejects non-object responses (prose, fenced JSON leftovers)', () => {
    expect(bmpTextAnalysisOutput.safeParse('Here is the analysis: {...}').success).toBe(false);
    expect(bmpTextAnalysisOutput.safeParse(null).success).toBe(false);
  });
});

describe('bmpVisionAnalysisOutput', () => {
  it('requires a valid status verdict — no coerced defaults', () => {
    expect(
      bmpVisionAnalysisOutput.safeParse({ ...validAnalysis, status: 'compliant' }).success
    ).toBe(true);
    // Missing status must fail — the old code silently substituted the
    // checkpoint's current status, fabricating a verdict.
    expect(bmpVisionAnalysisOutput.safeParse(validAnalysis).success).toBe(false);
    expect(
      bmpVisionAnalysisOutput.safeParse({ ...validAnalysis, status: 'PASSED' }).success
    ).toBe(false);
  });
});

describe('swpppExtractionOutput', () => {
  const validExtraction = {
    siteInfo: {
      projectName: 'Riverside Logistics Center',
      address: '100 Example Rd, Fresno, CA',
      totalAcres: 24.5,
      riskLevel: 'Level 2',
      centerLat: 36.7801,
      centerLng: -119.4161,
    },
    checkpoints: [
      {
        id: 'SC-1',
        name: 'Silt Fence - North Perimeter',
        bmpType: 'sediment-control',
        description: 'Silt fence along the north property line.',
        cgpSection: 'Section X.H.1.a',
        zone: 'north',
        lat: 36.782,
        lng: -119.418,
      },
    ],
  };

  it('accepts a well-formed extraction', () => {
    expect(swpppExtractionOutput.safeParse(validExtraction).success).toBe(true);
  });

  it('rejects out-of-range coordinates', () => {
    const bad = structuredClone(validExtraction);
    bad.checkpoints[0].lat = 200;
    expect(swpppExtractionOutput.safeParse(bad).success).toBe(false);
  });

  it('rejects a checkpoint flood (injection bloat guard)', () => {
    const bad = {
      ...validExtraction,
      checkpoints: Array.from({ length: 501 }, (_, i) => ({
        ...validExtraction.checkpoints[0],
        id: `SC-${i}`,
      })),
    };
    expect(swpppExtractionOutput.safeParse(bad).success).toBe(false);
  });

  it('rejects a missing siteInfo block', () => {
    expect(
      swpppExtractionOutput.safeParse({ checkpoints: validExtraction.checkpoints }).success
    ).toBe(false);
  });
});

describe('projectWdidPatch (SEC-11)', async () => {
  const { projectWdidPatch } = await import('@/lib/validations/project');
  it('accepts a normal WDID and trims it', () => {
    const parsed = projectWdidPatch.safeParse({ wdid: ' 5S34C123456 ' });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.wdid).toBe('5S34C123456');
  });
  it('rejects empty, missing, and oversized values', () => {
    expect(projectWdidPatch.safeParse({ wdid: '   ' }).success).toBe(false);
    expect(projectWdidPatch.safeParse({}).success).toBe(false);
    expect(projectWdidPatch.safeParse(null).success).toBe(false);
    expect(projectWdidPatch.safeParse({ wdid: 'x'.repeat(31) }).success).toBe(false);
  });
});
