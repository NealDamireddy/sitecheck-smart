import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/019_atomic_checklist_submission.sql'
  ),
  'utf8'
);
const cgpReferenceFixSql = readFileSync(
  join(
    process.cwd(),
    'supabase/migrations/020_fix_checklist_cgp_reference.sql'
  ),
  'utf8'
);

describe('migration 019 atomic checklist submission', () => {
  it('uses one security-invoker PostgreSQL function and locks the inspection', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION submit_inspection_checklist');
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toMatch(/WHERE id = p_inspection_id\s+FOR UPDATE/);
    expect(sql).not.toContain('SECURITY DEFINER');
  });

  it('persists the inspection, 22 results, deficiencies, and activity together', () => {
    expect(sql).toContain('UPDATE inspections');
    expect(sql).toContain('INSERT INTO inspection_checklist_results');
    expect(sql).toContain('INSERT INTO deficiencies');
    expect(sql).toContain('INSERT INTO activity_events');
  });

  it('checks profile, attestation, template, count, and item identity', () => {
    for (const marker of [
      'UNSUPPORTED_PROFILE',
      'REVIEW_ATTESTATION_REQUIRED',
      'UNSUPPORTED_CHECKLIST',
      'CHECKLIST_RESULT_COUNT_MISMATCH',
      'UNKNOWN_CHECKLIST_ITEM',
    ]) {
      expect(sql).toContain(marker);
    }
  });

  it('makes same-key retries idempotent and different-key retries conflicts', () => {
    expect(sql).toContain('checklist_submission_key');
    expect(sql).toContain("'created', FALSE");
    expect(sql).toContain('INSPECTION_ALREADY_SUBMITTED');
    expect(sql).toContain('idx_inspections_checklist_submission_key');
  });

  it('derives project and practitioner identity inside the database function', () => {
    expect(sql).toMatch(/FROM projects\s+WHERE id = v_inspection\.project_id/);
    expect(sql).toContain('LEFT JOIN qsp_profiles profile ON profile.user_id = auth.uid()');
    expect(sql).toContain('site_name_snapshot = v_project.name');
    expect(sql).toContain('wdid_snapshot = v_project.wdid');
  });

  it('is callable only by authenticated or service-role sessions', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION submit_inspection_checklist\(TEXT, JSONB, JSONB\)[\s\S]*?FROM PUBLIC/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION submit_inspection_checklist\(TEXT, JSONB, JSONB\)[\s\S]*?TO authenticated, service_role/
    );
  });

  it('constructs the CGP reference as text without invoking JSON concatenation', () => {
    expect(sql).toContain(
      "'2022 CGP Part 2 checklist item ' || item->>'checklist_item_id'"
    );
    expect(cgpReferenceFixSql).toContain('pg_get_functiondef');
    expect(cgpReferenceFixSql).toContain('v_old_expression');
    expect(cgpReferenceFixSql).toContain('v_new_expression');
    expect(cgpReferenceFixSql).toContain(
      "FORMAT('2022 CGP Part 2 checklist item %s', item->>'checklist_item_id')"
    );
  });
});
