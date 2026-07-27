/**
 * Authoritative QSP identity for regulator-facing artifacts (ACC-02).
 *
 * The practitioner's name, license number, company and contact details
 * live in two places:
 *
 *   * `qsp_profiles`  — one row per user, edited on the Account page.
 *     This is the live truth; a QSP who corrects a mistyped license
 *     number does it here.
 *   * `projects.qsp_*` — a copy snapshotted into each project by the
 *     onboarding wizard, never re-synced.
 *
 * Reports used to read the project copy only, so a correction on the
 * Account page never reached any existing project — every new report on
 * that site kept carrying the stale license number. A report signed with
 * the wrong practitioner credentials is a legal defect, so generation
 * now prefers the profile and falls back to the project copy field by
 * field (a blank profile field must not erase a populated project one).
 *
 * Already-generated reports are untouched: their text is frozen in
 * `reports.sections` at generation time, which is the correct behavior
 * for a historical record.
 */

import type { createAuthClient } from '@/lib/supabase/server';

type AuthedSupabase = Awaited<ReturnType<typeof createAuthClient>>;

export interface QspIdentity {
  name: string;
  licenseNumber: string;
  company: string;
  phone: string;
  email: string;
  /** Which store won for the name field — useful for debugging reports. */
  source: 'profile' | 'project' | 'none';
}

export interface ProjectQspFallback {
  qsp_name?: string | null;
  qsp_license_number?: string | null;
  qsp_company?: string | null;
  qsp_phone?: string | null;
  qsp_email?: string | null;
}

interface QspProfileRow {
  name: string | null;
  license_number: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
}

/** Trimmed value, or null when absent/blank. */
function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function mergeQspIdentity(
  profile: QspProfileRow | null,
  project: ProjectQspFallback | null
): QspIdentity {
  const pick = (
    profileValue: string | null | undefined,
    projectValue: string | null | undefined
  ): string => clean(profileValue) ?? clean(projectValue) ?? '';

  const name = pick(profile?.name, project?.qsp_name);
  const source: QspIdentity['source'] = clean(profile?.name)
    ? 'profile'
    : clean(project?.qsp_name)
      ? 'project'
      : 'none';

  return {
    name,
    licenseNumber: pick(profile?.license_number, project?.qsp_license_number),
    company: pick(profile?.company, project?.qsp_company),
    phone: pick(profile?.phone, project?.qsp_phone),
    email: pick(profile?.email, project?.qsp_email),
    source,
  };
}

/**
 * Resolve the identity to print on a report for `userId` (the QSP who is
 * generating, and who will sign it). Never throws — a profile read
 * failure degrades to the project copy rather than failing generation.
 */
export async function resolveQspIdentity(
  supabase: AuthedSupabase,
  userId: string,
  project: ProjectQspFallback | null
): Promise<QspIdentity> {
  let profile: QspProfileRow | null = null;
  try {
    const { data } = await supabase
      .from('qsp_profiles')
      .select('name, license_number, company, phone, email')
      .eq('user_id', userId)
      .maybeSingle();
    profile = (data as QspProfileRow | null) ?? null;
  } catch {
    profile = null;
  }
  return mergeQspIdentity(profile, project);
}
