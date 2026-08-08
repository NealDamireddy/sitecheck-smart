/**
 * ACC-02 — the practitioner block on a report must reflect the QSP's
 * current credentials, with the project's snapshotted copy as fallback.
 */
import { describe, expect, it } from 'vitest';
import {
  mergeQspIdentity,
  resolveQspIdentity,
  type ProjectQspFallback,
} from '@/lib/qsp-identity';
import type { createAuthClient } from '@/lib/supabase/server';

type AuthedSupabase = Awaited<ReturnType<typeof createAuthClient>>;

const projectCopy: ProjectQspFallback = {
  qsp_name: 'Jane Doe',
  qsp_license_number: 'QSD-00001-STALE',
  qsp_company: 'Old Firm LLC',
  qsp_phone: '555-0100',
  qsp_email: 'jane@oldfirm.com',
};

describe('mergeQspIdentity', () => {
  it('prefers the live profile over the project snapshot', () => {
    const identity = mergeQspIdentity(
      {
        name: 'Jane Doe',
        license_number: 'QSD-12345',
        company: 'New Firm LLC',
        phone: '555-0199',
        email: 'jane@newfirm.com',
      },
      projectCopy
    );
    expect(identity.licenseNumber).toBe('QSD-12345');
    expect(identity.company).toBe('New Firm LLC');
    expect(identity.source).toBe('profile');
  });

  it('falls back field by field — a blank profile field never erases the project copy', () => {
    const identity = mergeQspIdentity(
      {
        name: 'Jane Doe',
        license_number: 'QSD-12345',
        company: '',
        phone: '   ',
        email: null,
      },
      projectCopy
    );
    expect(identity.licenseNumber).toBe('QSD-12345'); // profile wins
    expect(identity.company).toBe('Old Firm LLC'); // blank -> project
    expect(identity.phone).toBe('555-0100');
    expect(identity.email).toBe('jane@oldfirm.com');
  });

  it('uses the project copy entirely when no profile row exists', () => {
    const identity = mergeQspIdentity(null, projectCopy);
    expect(identity).toMatchObject({
      name: 'Jane Doe',
      licenseNumber: 'QSD-00001-STALE',
      source: 'project',
    });
  });

  it('reports empty strings, never undefined, when both stores are empty', () => {
    const identity = mergeQspIdentity(null, null);
    expect(identity).toEqual({
      name: '',
      licenseNumber: '',
      company: '',
      phone: '',
      email: '',
      source: 'none',
    });
  });
});

describe('resolveQspIdentity', () => {
  function stubSupabase(
    result: { data: unknown; error: unknown } | (() => never)
  ): AuthedSupabase {
    return {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              if (typeof result === 'function') result();
              return result as { data: unknown; error: unknown };
            },
          }),
        }),
      }),
    } as unknown as AuthedSupabase;
  }

  it('reads the profile and merges it over the project copy', async () => {
    const identity = await resolveQspIdentity(
      stubSupabase({
        data: {
          name: 'Jane Doe',
          license_number: 'QSD-12345',
          company: 'New Firm LLC',
          phone: '555-0199',
          email: 'jane@newfirm.com',
        },
        error: null,
      }),
      'user-a',
      projectCopy
    );
    expect(identity.licenseNumber).toBe('QSD-12345');
  });

  it('degrades to the project copy when the profile read throws', async () => {
    const identity = await resolveQspIdentity(
      stubSupabase(() => {
        throw new Error('network down');
      }),
      'user-a',
      projectCopy
    );
    expect(identity.licenseNumber).toBe('QSD-00001-STALE');
    expect(identity.source).toBe('project');
  });

  it('does not throw when the project has no QSP copy either', async () => {
    const identity = await resolveQspIdentity(
      stubSupabase({ data: null, error: null }),
      'user-a',
      null
    );
    expect(identity.source).toBe('none');
  });
});

describe('report identity precedence (ACC-02 regression)', () => {
  it('a corrected license number reaches reports on existing projects', () => {
    // The exact bug: project row still carries the typo'd number.
    const beforeFix = projectCopy.qsp_license_number;
    const afterProfileEdit = mergeQspIdentity(
      {
        name: 'Jane Doe',
        license_number: 'QSD-99999',
        company: null,
        phone: null,
        email: null,
      },
      projectCopy
    );
    expect(beforeFix).toBe('QSD-00001-STALE');
    expect(afterProfileEdit.licenseNumber).toBe('QSD-99999');
  });
});

// The legacy report editor still resolves current identity, while immutable
// inspection PDFs must use the QSP snapshot captured at submission.
describe('call sites', () => {
  it('report generator resolves identity but inspection PDF never reads it live', async () => {
    const { readFileSync } = await import('node:fs');
    const legacyGenerator = readFileSync(
      'src/app/api/reports/generate/route.ts',
      'utf8'
    );
    expect(legacyGenerator).toContain('resolveQspIdentity');
    expect(legacyGenerator).not.toContain('${project.qsp_license_number}');

    const inspectionPdf = readFileSync(
      'src/app/api/inspections/[id]/pdf/route.ts',
      'utf8'
    );
    expect(inspectionPdf).toContain('buildInspectionReportContract');
    expect(inspectionPdf).not.toContain('resolveQspIdentity');
    expect(inspectionPdf).not.toContain("from('projects')");
    expect(inspectionPdf).not.toContain("from('checkpoints')");

    const reportPdf = readFileSync(
      'src/app/api/reports/[id]/pdf/route.ts',
      'utf8'
    );
    expect(reportPdf).toContain('buildInspectionReportContract');
    expect(reportPdf).not.toContain('PdfReportSection');
    expect(reportPdf).not.toContain("from('projects')");
  });
});
