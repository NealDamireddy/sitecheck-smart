import { describe, expect, it } from 'vitest';
import {
  ChecklistExpansionError,
  NO_BMP_EXCEPTIONS_MESSAGE,
  TRADITIONAL_RISK_2_CHECKLIST_VERSION,
  expandChecklist,
  type ExpandChecklistInput,
} from '@/lib/cgp/checklist-expansion';

const baseInput: ExpandChecklistInput = {
  projectType: 'traditional',
  riskLevel: 2,
  checklistVersion: TRADITIONAL_RISK_2_CHECKLIST_VERSION,
  observedAt: '2026-03-09T11:30:00-07:00',
  unflaggedItemsConfirmed: true,
  exceptions: [],
};

function expectExpansionError(
  run: () => unknown,
  code: ChecklistExpansionError['code']
) {
  try {
    run();
    throw new Error('Expected checklist expansion to fail.');
  } catch (error) {
    expect(error).toBeInstanceOf(ChecklistExpansionError);
    expect((error as ChecklistExpansionError).code).toBe(code);
  }
}

describe('expandChecklist', () => {
  it('expands a no-exception attestation into the complete 22-item checklist', () => {
    const result = expandChecklist(baseInput);

    expect(result.items).toHaveLength(22);
    expect(new Set(result.items.map((item) => item.categoryNumber))).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7, 8])
    );
    expect(new Set(result.items.map((item) => item.itemId)).size).toBe(22);
    expect(result.items.every((item) => item.answer === 'Yes')).toBe(true);
    expect(
      result.items.every(
        (item) => item.answerSource === 'qsp-unflagged-attestation'
      )
    ).toBe(true);
    expect(result.deficiencies).toEqual([]);
    expect(result.compliantCount).toBe(22);
    expect(result.deficientCount).toBe(0);
    expect(result.part3EmptyMessage).toBe(NO_BMP_EXCEPTIONS_MESSAGE);
  });

  it('changes only the specifically flagged item to No', () => {
    const result = expandChecklist({
      ...baseInput,
      exceptions: [
        {
          itemId: 'gh-wm-6',
          description: ' Concrete washout is overflowing. ',
          recommendation: ' Pump down and restore containment. ',
          checkpointId: 'MM-4',
          location: ' West retaining wall ',
          photoUrls: [' https://example.test/washout.jpg '],
        },
      ],
    });

    const noItems = result.items.filter((item) => item.answer === 'No');
    expect(noItems).toHaveLength(1);
    expect(noItems[0]).toMatchObject({
      itemId: 'gh-wm-6',
      categoryNumber: 2,
      itemNumber: 6,
      answerSource: 'qsp-exception',
      actionImplementedAt: null,
    });
    expect(result.deficiencies).toEqual([
      expect.objectContaining({
        checklistItemId: 'gh-wm-6',
        description: 'Concrete washout is overflowing.',
        recommendation: 'Pump down and restore containment.',
        checkpointId: 'MM-4',
        location: 'West retaining wall',
        photoUrls: ['https://example.test/washout.jpg'],
        identifiedAt: '2026-03-09T18:30:00.000Z',
        repairStartDueAt: '2026-03-12T18:30:00.000Z',
      }),
    ]);
    expect(result.compliantCount).toBe(21);
    expect(result.deficientCount).toBe(1);
    expect(result.part3EmptyMessage).toBeNull();
  });

  it('returns exceptions in canonical checklist order, not client order', () => {
    const result = expandChecklist({
      ...baseInput,
      exceptions: [
        {
          itemId: 'ror-1',
          description: 'Run-on reaches a disturbed slope.',
          recommendation: 'Install a diversion berm.',
        },
        {
          itemId: 'gh-cm-1',
          description: 'Inactive stockpile is uncovered.',
          recommendation: 'Cover and secure the stockpile.',
        },
      ],
    });

    expect(result.deficiencies.map((item) => item.checklistItemId)).toEqual([
      'gh-cm-1',
      'ror-1',
    ]);
  });

  it('uses an exception-specific identification time for its 72-hour clock', () => {
    const result = expandChecklist({
      ...baseInput,
      exceptions: [
        {
          itemId: 'sc-3',
          description: 'Inlet protection is displaced.',
          recommendation: 'Reset and secure inlet protection.',
          // Crosses the 2026 US spring-forward boundary. The deadline is
          // 72 elapsed hours, independent of the local wall-clock change.
          identifiedAt: '2026-03-07T10:00:00-08:00',
        },
      ],
    });

    const deficiency = result.deficiencies[0];
    expect(deficiency.identifiedAt).toBe('2026-03-07T18:00:00.000Z');
    expect(deficiency.repairStartDueAt).toBe('2026-03-10T18:00:00.000Z');
    expect(
      Date.parse(deficiency.repairStartDueAt) -
        Date.parse(deficiency.identifiedAt)
    ).toBe(72 * 60 * 60 * 1000);
  });

  it('requires explicit QSP attestation even when there are no exceptions', () => {
    expectExpansionError(
      () =>
        expandChecklist({
          ...baseInput,
          unflaggedItemsConfirmed: false,
        }),
      'REVIEW_ATTESTATION_REQUIRED'
    );
  });

  it.each([
    { projectType: 'linear' as const, riskLevel: 2 as const },
    { projectType: 'traditional' as const, riskLevel: 1 as const },
    { projectType: 'traditional' as const, riskLevel: 3 as const },
  ])('fails closed for unsupported profile $projectType Risk $riskLevel', (profile) => {
    expectExpansionError(
      () => expandChecklist({ ...baseInput, ...profile }),
      'UNSUPPORTED_PROFILE'
    );
  });

  it('rejects an unrecognized checklist version', () => {
    expectExpansionError(
      () => expandChecklist({ ...baseInput, checklistVersion: 'unreviewed-v2' }),
      'CHECKLIST_VERSION_MISMATCH'
    );
  });

  it('rejects duplicate exceptions for the same checklist item', () => {
    const duplicate = {
      itemId: 'ec-1',
      description: 'Wind controls are missing.',
      recommendation: 'Install wind controls.',
    };
    expectExpansionError(
      () =>
        expandChecklist({
          ...baseInput,
          exceptions: [duplicate, duplicate],
        }),
      'DUPLICATE_EXCEPTION'
    );
  });

  it('rejects unknown checklist item IDs', () => {
    expectExpansionError(
      () =>
        expandChecklist({
          ...baseInput,
          exceptions: [
            {
              itemId: 'swppp-generated-checkpoint-40',
              description: 'Not a checklist item.',
              recommendation: 'Do not infer checklist answers from it.',
            },
          ],
        }),
      'UNKNOWN_CHECKLIST_ITEM'
    );
  });

  it.each([
    { description: '', recommendation: 'Install control.' },
    { description: 'Control is missing.', recommendation: '   ' },
  ])('requires both deficiency description and recommendation', (fields) => {
    expectExpansionError(
      () =>
        expandChecklist({
          ...baseInput,
          exceptions: [{ itemId: 'ec-1', ...fields }],
        }),
      'INVALID_EXCEPTION'
    );
  });

  it.each([
    '2026-03-09',
    '2026-03-09T11:30:00',
    'not-a-date',
  ])('rejects ambiguous or invalid observedAt timestamp %s', (observedAt) => {
    expectExpansionError(
      () => expandChecklist({ ...baseInput, observedAt }),
      'INVALID_TIMESTAMP'
    );
  });

  it('rejects an invalid exception identification timestamp', () => {
    expectExpansionError(
      () =>
        expandChecklist({
          ...baseInput,
          exceptions: [
            {
              itemId: 'ec-1',
              description: 'Wind controls are missing.',
              recommendation: 'Install wind controls.',
              identifiedAt: '2026-03-09T11:30:00',
            },
          ],
        }),
      'INVALID_TIMESTAMP'
    );
  });
});
