import {
  CGP_2022_DRAFT_RULE_VERSION,
  POST_QPE_GAUGE_THRESHOLD_INCHES,
  POST_QPE_WINDOW_HOURS,
  PRE_QPE_EXTENDED_WINDOW_HOURS,
  PRE_QPE_WINDOW_HOURS,
  type ExtendedPreInspectionEvidence,
  type ForecastWindow24h,
  type InspectionRequirementEvaluation,
  type InspectionRequirementProposal,
  type InspectionRequirementReasonCode,
  type OnsiteGaugeEvidence,
  type PermitProfile,
  type QpeForecastDecision,
} from './types';

const HOUR_MS = 60 * 60 * 1000;

export interface InspectionRequirementInput {
  permitProfile: PermitProfile;
  qpeDecision: QpeForecastDecision;
  forecastWindows: readonly ForecastWindow24h[];
  onsiteGauge?: OnsiteGaugeEvidence | null;
  extendedPreInspectionEvidence?: ExtendedPreInspectionEvidence | null;
}

function evaluation(
  status: InspectionRequirementEvaluation['status'],
  reasonCodes: InspectionRequirementReasonCode[],
  proposals: InspectionRequirementProposal[] = []
): InspectionRequirementEvaluation {
  return {
    status,
    ruleVersion: CGP_2022_DRAFT_RULE_VERSION,
    proposals,
    reasonCodes,
  };
}

function shiftHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * HOUR_MS).toISOString();
}

function validGauge(gauge: OnsiteGaugeEvidence): boolean {
  return (
    gauge.evidenceId.trim().length > 0 &&
    Number.isFinite(Date.parse(gauge.observedAt)) &&
    Number.isFinite(gauge.inches) &&
    gauge.inches >= 0
  );
}

function proposal(
  value: Omit<InspectionRequirementProposal, 'ruleVersion'>
): InspectionRequirementProposal {
  return { ...value, ruleVersion: CGP_2022_DRAFT_RULE_VERSION };
}

/**
 * Convert a reviewed QPE forecast decision into draft inspection
 * requirements. The evaluator is intentionally limited to the initial
 * pilot profile: active Traditional Construction Risk Level 2 and 3.
 *
 * It has no persistence or notification side effects. Unsupported permit
 * profiles return `review-required`; missing event/gauge evidence never
 * turns into a not-required decision.
 */
export function deriveQpeInspectionRequirements(
  input: InspectionRequirementInput
): InspectionRequirementEvaluation {
  const { permitProfile, qpeDecision } = input;

  if (
    permitProfile.projectType !== 'traditional' ||
    (permitProfile.riskLevel !== 2 && permitProfile.riskLevel !== 3)
  ) {
    return evaluation('review-required', ['PILOT_PROFILE_UNSUPPORTED']);
  }

  if (qpeDecision.status === 'unknown') {
    return evaluation('unknown', ['QPE_DECISION_UNKNOWN']);
  }

  if (qpeDecision.status === 'does-not-qualify') {
    return evaluation('not-required', ['QPE_NOT_QUALIFYING']);
  }

  if (
    qpeDecision.ruleVersion !== CGP_2022_DRAFT_RULE_VERSION ||
    !qpeDecision.startsAt ||
    !qpeDecision.initialWindowId ||
    qpeDecision.eventWindowIds.length === 0
  ) {
    return evaluation('unknown', ['QPE_EVENT_EVIDENCE_MISSING']);
  }

  const windowsById = new Map<string, ForecastWindow24h>();
  for (const window of input.forecastWindows) {
    if (windowsById.has(window.id)) {
      return evaluation('unknown', ['QPE_EVENT_EVIDENCE_MISSING']);
    }
    windowsById.set(window.id, window);
  }

  const eventWindows: ForecastWindow24h[] = [];
  const seenEventWindowIds = new Set<string>();
  for (const id of qpeDecision.eventWindowIds) {
    const window = windowsById.get(id);
    if (
      seenEventWindowIds.has(id) ||
      !window ||
      !Number.isFinite(Date.parse(window.startsAt)) ||
      !Number.isFinite(Date.parse(window.endsAt)) ||
      Date.parse(window.startsAt) >= Date.parse(window.endsAt)
    ) {
      return evaluation('unknown', ['QPE_EVENT_EVIDENCE_MISSING']);
    }
    seenEventWindowIds.add(id);
    eventWindows.push(window);
  }

  const initialWindow = eventWindows[0];
  if (
    initialWindow.id !== qpeDecision.initialWindowId ||
    Date.parse(initialWindow.startsAt) !== Date.parse(qpeDecision.startsAt)
  ) {
    return evaluation('unknown', ['QPE_EVENT_EVIDENCE_MISSING']);
  }

  for (let index = 1; index < eventWindows.length; index += 1) {
    if (
      Date.parse(eventWindows[index].startsAt) !==
      Date.parse(eventWindows[index - 1].endsAt)
    ) {
      return evaluation('unknown', ['QPE_EVENT_EVIDENCE_MISSING']);
    }
  }

  if (
    qpeDecision.predictedEndsAt !== null &&
    (!Number.isFinite(Date.parse(qpeDecision.predictedEndsAt)) ||
      Date.parse(qpeDecision.predictedEndsAt) !==
        Date.parse(eventWindows[eventWindows.length - 1].endsAt))
  ) {
    return evaluation('unknown', ['QPE_EVENT_EVIDENCE_MISSING']);
  }

  if (input.onsiteGauge && !validGauge(input.onsiteGauge)) {
    return evaluation('unknown', ['ONSITE_GAUGE_INVALID']);
  }

  if (
    input.onsiteGauge &&
    qpeDecision.predictedEndsAt &&
    Date.parse(input.onsiteGauge.observedAt) < Date.parse(qpeDecision.predictedEndsAt)
  ) {
    return evaluation('unknown', ['ONSITE_GAUGE_INVALID']);
  }

  if (
    input.extendedPreInspectionEvidence &&
    input.extendedPreInspectionEvidence.evidenceId.trim().length === 0
  ) {
    return evaluation('unknown', ['QPE_EVENT_EVIDENCE_MISSING']);
  }

  const useExtendedPreWindow = Boolean(input.extendedPreInspectionEvidence);
  const preWindowHours = useExtendedPreWindow
    ? PRE_QPE_EXTENDED_WINDOW_HOURS
    : PRE_QPE_WINDOW_HOURS;
  const proposals: InspectionRequirementProposal[] = [
    proposal({
      id: `pre-qpe:${qpeDecision.initialWindowId}`,
      kind: 'pre-qpe',
      status: 'proposed',
      requiredRole: 'qsp',
      opensAt: shiftHours(qpeDecision.startsAt, -preWindowHours),
      dueAt: qpeDecision.startsAt,
      eventPeriodStartsAt: initialWindow.startsAt,
      eventPeriodEndsAt: initialWindow.endsAt,
      evidenceWindowIds: [initialWindow.id],
      evidenceSnapshotIds: [initialWindow.sourceSnapshotId],
      evidenceIds: input.extendedPreInspectionEvidence
        ? [input.extendedPreInspectionEvidence.evidenceId]
        : [],
      reasonCodes: [
        useExtendedPreWindow
          ? 'PRE_QPE_120_HOUR_EXTENDED_WINDOW'
          : 'PRE_QPE_72_HOUR_WINDOW',
      ],
    }),
  ];

  for (const window of eventWindows) {
    proposals.push(
      proposal({
        id: `during-qpe:${window.id}`,
        kind: 'during-qpe',
        status: 'proposed',
        requiredRole: 'qsp-or-trained-delegate',
        opensAt: window.startsAt,
        dueAt: window.endsAt,
        eventPeriodStartsAt: window.startsAt,
        eventPeriodEndsAt: window.endsAt,
        evidenceWindowIds: [window.id],
        evidenceSnapshotIds: [window.sourceSnapshotId],
        evidenceIds: [],
        reasonCodes: ['DURING_QPE_24_HOUR_PERIOD'],
      })
    );
  }

  const postEvidenceWindowIds = [...qpeDecision.evidenceWindowIds];
  const postEvidenceSnapshotIds = [...qpeDecision.evidenceSnapshotIds];
  if (!qpeDecision.predictedEndsAt) {
    proposals.push(
      proposal({
        id: `post-qpe:${qpeDecision.initialWindowId}`,
        kind: 'post-qpe',
        status: 'pending-evidence',
        requiredRole: 'qsp-or-trained-delegate',
        opensAt: null,
        dueAt: null,
        eventPeriodStartsAt: qpeDecision.startsAt,
        eventPeriodEndsAt: null,
        evidenceWindowIds: postEvidenceWindowIds,
        evidenceSnapshotIds: postEvidenceSnapshotIds,
        evidenceIds: [],
        reasonCodes: ['QPE_END_NOT_ESTABLISHED'],
      })
    );
  } else if (!input.onsiteGauge) {
    proposals.push(
      proposal({
        id: `post-qpe:${qpeDecision.initialWindowId}`,
        kind: 'post-qpe',
        status: 'pending-evidence',
        requiredRole: 'qsp-or-trained-delegate',
        opensAt: qpeDecision.predictedEndsAt,
        dueAt: shiftHours(qpeDecision.predictedEndsAt, POST_QPE_WINDOW_HOURS),
        eventPeriodStartsAt: qpeDecision.startsAt,
        eventPeriodEndsAt: qpeDecision.predictedEndsAt,
        evidenceWindowIds: postEvidenceWindowIds,
        evidenceSnapshotIds: postEvidenceSnapshotIds,
        evidenceIds: [],
        reasonCodes: ['ONSITE_GAUGE_REQUIRED'],
      })
    );
  } else if (input.onsiteGauge.inches < POST_QPE_GAUGE_THRESHOLD_INCHES) {
    proposals.push(
      proposal({
        id: `post-qpe:${qpeDecision.initialWindowId}`,
        kind: 'post-qpe',
        status: 'not-required',
        requiredRole: 'qsp-or-trained-delegate',
        opensAt: null,
        dueAt: null,
        eventPeriodStartsAt: qpeDecision.startsAt,
        eventPeriodEndsAt: qpeDecision.predictedEndsAt,
        evidenceWindowIds: postEvidenceWindowIds,
        evidenceSnapshotIds: postEvidenceSnapshotIds,
        evidenceIds: [input.onsiteGauge.evidenceId],
        reasonCodes: ['POST_QPE_GAUGE_BELOW_THRESHOLD'],
      })
    );
  } else {
    proposals.push(
      proposal({
        id: `post-qpe:${qpeDecision.initialWindowId}`,
        kind: 'post-qpe',
        status: 'proposed',
        requiredRole: 'qsp-or-trained-delegate',
        opensAt: qpeDecision.predictedEndsAt,
        dueAt: shiftHours(qpeDecision.predictedEndsAt, POST_QPE_WINDOW_HOURS),
        eventPeriodStartsAt: qpeDecision.startsAt,
        eventPeriodEndsAt: qpeDecision.predictedEndsAt,
        evidenceWindowIds: postEvidenceWindowIds,
        evidenceSnapshotIds: postEvidenceSnapshotIds,
        evidenceIds: [input.onsiteGauge.evidenceId],
        reasonCodes: ['POST_QPE_96_HOUR_WINDOW'],
      })
    );
  }

  return evaluation('requirements-proposed', [], proposals);
}
