import { describe, expect, it } from 'vitest';
import {
  deriveQpeInspectionRequirements,
  evaluateQpeForecast,
  type ForecastWindow24h,
  type PermitProfile,
} from '@/lib/cgp/2022';

const traditionalRisk2: PermitProfile = {
  projectType: 'traditional',
  riskLevel: 2,
  siteTimezone: 'America/Los_Angeles',
};

function window(
  id: string,
  day: number,
  probabilityPercent: number | null,
  qpfInches: number | null
): ForecastWindow24h {
  const startsAt = new Date(Date.UTC(2026, 0, day, 16));
  const endsAt = new Date(startsAt.getTime() + 24 * 60 * 60 * 1000);
  return {
    id,
    sourceSnapshotId: `snapshot-${day}`,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    probabilityPercent,
    qpfInches,
  };
}

function endedQpeWindows(): ForecastWindow24h[] {
  return [
    window('initial', 10, 60, 0.6),
    window('extension', 11, 10, 0.25),
    window('ending-evidence', 12, 90, 0.1),
  ];
}

describe('deriveQpeInspectionRequirements', () => {
  it.each([
    { projectType: 'linear' as const, riskLevel: 2 as const },
    { projectType: 'traditional' as const, riskLevel: 1 as const },
  ])('requires expert review outside the pilot scope: %o', (partial) => {
    const windows = endedQpeWindows();
    const result = deriveQpeInspectionRequirements({
      permitProfile: { ...traditionalRisk2, ...partial },
      qpeDecision: evaluateQpeForecast(windows),
      forecastWindows: windows,
    });
    expect(result).toMatchObject({
      status: 'review-required',
      reasonCodes: ['PILOT_PROFILE_UNSUPPORTED'],
      proposals: [],
    });
  });

  it('does not propose requirements from an unknown QPE decision', () => {
    const result = deriveQpeInspectionRequirements({
      permitProfile: traditionalRisk2,
      qpeDecision: evaluateQpeForecast([]),
      forecastWindows: [],
    });
    expect(result).toMatchObject({
      status: 'unknown',
      reasonCodes: ['QPE_DECISION_UNKNOWN'],
      proposals: [],
    });
  });

  it('does not propose QPE requirements for a known non-qualifying forecast', () => {
    const windows = [window('dry', 10, 20, 0.1)];
    const result = deriveQpeInspectionRequirements({
      permitProfile: traditionalRisk2,
      qpeDecision: evaluateQpeForecast(windows),
      forecastWindows: windows,
    });
    expect(result).toMatchObject({
      status: 'not-required',
      reasonCodes: ['QPE_NOT_QUALIFYING'],
      proposals: [],
    });
  });

  it('creates a 72-hour pre-QPE window by default', () => {
    const windows = endedQpeWindows();
    const result = deriveQpeInspectionRequirements({
      permitProfile: traditionalRisk2,
      qpeDecision: evaluateQpeForecast(windows),
      forecastWindows: windows,
    });
    const pre = result.proposals.find((item) => item.kind === 'pre-qpe');
    expect(pre).toMatchObject({
      status: 'proposed',
      requiredRole: 'qsp',
      dueAt: windows[0].startsAt,
      reasonCodes: ['PRE_QPE_72_HOUR_WINDOW'],
    });
    expect(Date.parse(pre!.dueAt!) - Date.parse(pre!.opensAt!)).toBe(
      72 * 60 * 60 * 1000
    );
  });

  it('only uses the 120-hour pre-QPE window with explicit evidence', () => {
    const windows = endedQpeWindows();
    const result = deriveQpeInspectionRequirements({
      permitProfile: traditionalRisk2,
      qpeDecision: evaluateQpeForecast(windows),
      forecastWindows: windows,
      extendedPreInspectionEvidence: { evidenceId: 'extended-nws-forecast-1' },
    });
    const pre = result.proposals.find((item) => item.kind === 'pre-qpe');
    expect(pre?.reasonCodes).toEqual(['PRE_QPE_120_HOUR_EXTENDED_WINDOW']);
    expect(pre?.evidenceIds).toEqual(['extended-nws-forecast-1']);
    expect(Date.parse(pre!.dueAt!) - Date.parse(pre!.opensAt!)).toBe(
      120 * 60 * 60 * 1000
    );
  });

  it('creates one during-QPE requirement for each event period, not the ending period', () => {
    const windows = endedQpeWindows();
    const result = deriveQpeInspectionRequirements({
      permitProfile: traditionalRisk2,
      qpeDecision: evaluateQpeForecast(windows),
      forecastWindows: windows,
    });
    const during = result.proposals.filter((item) => item.kind === 'during-qpe');
    expect(during).toHaveLength(2);
    expect(during.map((item) => item.evidenceWindowIds)).toEqual([
      ['initial'],
      ['extension'],
    ]);
    expect(during.every((item) => item.requiredRole === 'qsp-or-trained-delegate')).toBe(true);
  });

  it('keeps post-QPE pending when the forecast does not establish the event end', () => {
    const windows = [window('initial', 10, 60, 0.6)];
    const result = deriveQpeInspectionRequirements({
      permitProfile: traditionalRisk2,
      qpeDecision: evaluateQpeForecast(windows),
      forecastWindows: windows,
    });
    const post = result.proposals.find((item) => item.kind === 'post-qpe');
    expect(post).toMatchObject({
      status: 'pending-evidence',
      opensAt: null,
      dueAt: null,
      reasonCodes: ['QPE_END_NOT_ESTABLISHED'],
    });
  });

  it('keeps post-QPE pending until an on-site gauge total is recorded', () => {
    const windows = endedQpeWindows();
    const result = deriveQpeInspectionRequirements({
      permitProfile: traditionalRisk2,
      qpeDecision: evaluateQpeForecast(windows),
      forecastWindows: windows,
    });
    const post = result.proposals.find((item) => item.kind === 'post-qpe');
    expect(post).toMatchObject({
      status: 'pending-evidence',
      reasonCodes: ['ONSITE_GAUGE_REQUIRED'],
    });
  });

  it('marks post-QPE not required below the gauge threshold', () => {
    const windows = endedQpeWindows();
    const result = deriveQpeInspectionRequirements({
      permitProfile: traditionalRisk2,
      qpeDecision: evaluateQpeForecast(windows),
      forecastWindows: windows,
      onsiteGauge: {
        evidenceId: 'gauge-1',
        observedAt: windows[1].endsAt,
        inches: 0.49,
      },
    });
    const post = result.proposals.find((item) => item.kind === 'post-qpe');
    expect(post).toMatchObject({
      status: 'not-required',
      opensAt: null,
      dueAt: null,
      evidenceIds: ['gauge-1'],
      reasonCodes: ['POST_QPE_GAUGE_BELOW_THRESHOLD'],
    });
  });

  it('proposes post-QPE at exactly 0.50 inches with a 96-hour due window', () => {
    const windows = endedQpeWindows();
    const decision = evaluateQpeForecast(windows);
    const result = deriveQpeInspectionRequirements({
      permitProfile: traditionalRisk2,
      qpeDecision: decision,
      forecastWindows: windows,
      onsiteGauge: {
        evidenceId: 'gauge-1',
        observedAt: windows[1].endsAt,
        inches: 0.5,
      },
    });
    const post = result.proposals.find((item) => item.kind === 'post-qpe');
    expect(post).toMatchObject({
      status: 'proposed',
      opensAt: decision.predictedEndsAt,
      reasonCodes: ['POST_QPE_96_HOUR_WINDOW'],
    });
    expect(Date.parse(post!.dueAt!) - Date.parse(post!.opensAt!)).toBe(
      96 * 60 * 60 * 1000
    );
  });

  it('fails closed on invalid gauge evidence', () => {
    const windows = endedQpeWindows();
    const result = deriveQpeInspectionRequirements({
      permitProfile: traditionalRisk2,
      qpeDecision: evaluateQpeForecast(windows),
      forecastWindows: windows,
      onsiteGauge: {
        evidenceId: 'gauge-1',
        observedAt: windows[1].endsAt,
        inches: -0.1,
      },
    });
    expect(result).toMatchObject({
      status: 'unknown',
      reasonCodes: ['ONSITE_GAUGE_INVALID'],
      proposals: [],
    });
  });

  it('rejects a gauge total recorded before the forecast QPE ended', () => {
    const windows = endedQpeWindows();
    const result = deriveQpeInspectionRequirements({
      permitProfile: traditionalRisk2,
      qpeDecision: evaluateQpeForecast(windows),
      forecastWindows: windows,
      onsiteGauge: {
        evidenceId: 'gauge-early',
        observedAt: windows[0].endsAt,
        inches: 0.75,
      },
    });
    expect(result).toMatchObject({
      status: 'unknown',
      reasonCodes: ['ONSITE_GAUGE_INVALID'],
      proposals: [],
    });
  });

  it('rejects a QPE decision whose predicted end conflicts with its event periods', () => {
    const windows = endedQpeWindows();
    const decision = evaluateQpeForecast(windows);
    const result = deriveQpeInspectionRequirements({
      permitProfile: traditionalRisk2,
      qpeDecision: {
        ...decision,
        predictedEndsAt: windows[0].endsAt,
      },
      forecastWindows: windows,
    });
    expect(result).toMatchObject({
      status: 'unknown',
      reasonCodes: ['QPE_EVENT_EVIDENCE_MISSING'],
      proposals: [],
    });
  });

  it('fails closed when an event forecast period is missing', () => {
    const windows = endedQpeWindows();
    const result = deriveQpeInspectionRequirements({
      permitProfile: traditionalRisk2,
      qpeDecision: evaluateQpeForecast(windows),
      forecastWindows: [windows[0], windows[2]],
    });
    expect(result).toMatchObject({
      status: 'unknown',
      reasonCodes: ['QPE_EVENT_EVIDENCE_MISSING'],
      proposals: [],
    });
  });
});
