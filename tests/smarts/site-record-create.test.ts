import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createSiteRecord,
  SiteRecordCreateError,
} from '@/lib/site-records/create';
import {
  reportingYearStart,
  siteRecordCreate,
} from '@/lib/validations/site-record';

const common = {
  projectId: 'site-1',
  idempotencyKey: 'mobile:site-1:submission-1',
};

function clientWithRpc(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe('siteRecordCreate validation', () => {
  it.each(['weekly_inspection', 'monthly_inspection'] as const)(
    'accepts a structured %s record',
    (recordType) => {
      const parsed = siteRecordCreate.parse({
        ...common,
        recordType,
        detail: { inspectionDate: '2026-08-07T10:00:00-07:00' },
      });
      expect(parsed.recordType).toBe(recordType);
      expect(parsed).toMatchObject({
        detail: { inspectionType: 'routine' },
      });
    }
  );

  it('accepts 2026-2027 SMARTS data and derives its year', () => {
    const startedAt = '2026-08-07T10:00:00-07:00';
    expect(reportingYearStart(startedAt)).toBe(2026);
    const parsed = siteRecordCreate.parse({
      ...common,
      recordType: 'smarts_ad_hoc',
      detail: { startedAt, precipitationInches: 0.75 },
      source: {
        sourceType: 'form',
        schemaVersion: 'smarts-inspector-v1',
        rawPayload: { rainfall: 0.75 },
      },
    });
    expect(parsed.recordType).toBe('smarts_ad_hoc');
  });

  it('rejects closed SMARTS years and reversed event windows', () => {
    expect(() =>
      siteRecordCreate.parse({
        ...common,
        recordType: 'smarts_ad_hoc',
        detail: { startedAt: '2026-05-01T10:00:00-07:00' },
      })
    ).toThrow(/closed/i);

    expect(() =>
      siteRecordCreate.parse({
        ...common,
        recordType: 'smarts_ad_hoc',
        detail: {
          startedAt: '2026-08-08T10:00:00-07:00',
          endedAt: '2026-08-07T10:00:00-07:00',
        },
      })
    ).toThrow(/end/i);
  });
});

describe('createSiteRecord', () => {
  it('passes one normalized request to the atomic RPC', async () => {
    const { client, rpc } = clientWithRpc({
      data: {
        siteRecordId: '22222222-2222-4222-8222-222222222222',
        detailId: 'smarts-evt-1',
        recordType: 'smarts_ad_hoc',
        workflowStatus: 'draft',
        reportingYearStart: 2026,
        created: true,
      },
      error: null,
    });
    const result = await createSiteRecord(client, {
      ...common,
      recordType: 'smarts_ad_hoc',
      detail: { startedAt: '2026-08-07T10:00:00-07:00' },
    });

    expect(result.reportingYearStart).toBe(2026);
    expect(rpc).toHaveBeenCalledWith('create_site_record_with_detail', {
      p_project_id: 'site-1',
      p_record_type: 'smarts_ad_hoc',
      p_idempotency_key: common.idempotencyKey,
      p_title: null,
      p_observed_from: null,
      p_observed_to: null,
      p_detail: {
        startedAt: '2026-08-07T10:00:00-07:00',
      },
      p_source: null,
    });
  });

  it.each([
    ['PROJECT_NOT_FOUND', 'project_not_found'],
    ['NO_ACTIVE_SITE_ASSIGNMENT', 'assignment_required'],
    ['SITE_RECORD_IDEMPOTENCY_CONFLICT', 'idempotency_conflict'],
    ['CLOSED_SMARTS_REPORTING_YEAR', 'closed_reporting_year'],
  ] as const)('maps %s to the safe %s code', async (message, code) => {
    const { client } = clientWithRpc({
      data: null,
      error: { message },
    });
    await expect(
      createSiteRecord(client, {
        ...common,
        recordType: 'weekly_inspection',
        detail: { inspectionDate: '2026-08-07T10:00:00-07:00' },
      })
    ).rejects.toEqual(expect.objectContaining<Partial<SiteRecordCreateError>>({ code }));
  });

  it('fails closed when the RPC returns an invalid shape', async () => {
    const { client } = clientWithRpc({ data: { created: true }, error: null });
    await expect(
      createSiteRecord(client, {
        ...common,
        recordType: 'monthly_inspection',
        detail: { inspectionDate: '2026-08-07T10:00:00-07:00' },
      })
    ).rejects.toEqual(
      expect.objectContaining<Partial<SiteRecordCreateError>>({
        code: 'persistence_failed',
      })
    );
  });
});
