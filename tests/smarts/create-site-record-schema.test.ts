import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'supabase/migrations/022_create_site_record.sql'),
  'utf8'
);

describe('migration 022 atomic site-record creation', () => {
  it('uses one security-invoker transaction boundary', () => {
    expect(sql).toContain(
      'CREATE OR REPLACE FUNCTION public.create_site_record_with_detail'
    );
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).not.toContain('SECURITY DEFINER');
    expect(sql).toContain("SET search_path = ''");
  });

  it('binds the record to the authenticated inspector and active assignment', () => {
    expect(sql).toContain('v_actor UUID := (SELECT auth.uid())');
    expect(sql).not.toContain('p_inspector_user_id');
    expect(sql).toMatch(/FROM public\.projects\s+WHERE id = p_project_id/);
    expect(sql).toContain('project_inspector_assignments');
    expect(sql).toContain('inspector_user_id = v_actor');
    expect(sql).toContain("status = 'active'");
    expect(sql).toContain('ended_at IS NULL OR ended_at > NOW()');
    expect(sql).toContain('NO_ACTIVE_SITE_ASSIGNMENT');
    expect(sql).toContain('ACTIVE_INSPECTOR_PROFILE_REQUIRED');
  });

  it('validates retained source input before attempting inserts', () => {
    expect(sql).toContain('INVALID_SOURCE_TYPE');
    expect(sql).toContain('SOURCE_SCHEMA_VERSION_REQUIRED');
    expect(sql).toContain('SOURCE_CONTENT_REQUIRED');
  });

  it('serializes same-key retries and returns an existing matching record', () => {
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toMatch(
      /WHERE org_id = v_org_id\s+AND idempotency_key = p_idempotency_key\s+FOR UPDATE/
    );
    expect(sql).toContain('SITE_RECORD_IDEMPOTENCY_CONFLICT');
    expect(sql).toContain("'created', FALSE");
  });

  it('creates exactly the normalized branch selected by record type', () => {
    expect(sql).toContain('INSERT INTO public.site_records');
    expect(sql).toContain('INSERT INTO public.inspections');
    expect(sql).toContain('INSERT INTO public.site_record_inspections');
    expect(sql).toContain('INSERT INTO public.smarts_events');
    expect(sql).toContain('INSERT INTO public.smarts_report_records');
    expect(sql).toContain('INSERT INTO public.site_record_sources');
  });

  it('derives SMARTS reporting year in California time and rejects closed years', () => {
    expect(sql).toContain("AT TIME ZONE 'America/Los_Angeles'");
    expect(sql).toContain(
      'v_reporting_year_start < v_current_reporting_year_start'
    );
    expect(sql).toContain('CLOSED_SMARTS_REPORTING_YEAR');
    expect(sql).toContain('SMARTS_REPORTING_YEAR_NOT_OPEN');
    expect(sql).toContain("'inspector_upload'");
  });

  it('is callable only by authenticated and service-role sessions', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_site_record_with_detail\([\s\S]*?FROM PUBLIC/
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_site_record_with_detail\([\s\S]*?TO authenticated, service_role/
    );
  });
});
