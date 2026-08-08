import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TRADITIONAL_RISK_2_CHECKLIST_VERSION,
} from '@/lib/cgp/checklist-expansion';
import { getBmpCategoriesForRiskLevel } from '@/lib/cgp/risk-level-bmps';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/018_inspection_checklist_history.sql'
);
const sql = readFileSync(migrationPath, 'utf8');

interface SeedItem {
  item_id: string;
  category_number: number;
  category_title: string;
  item_number: number;
  prompt: string;
}

function seededItems(): SeedItem[] {
  const match = sql.match(
    /-- CHECKLIST_SEED_JSON_BEGIN[\s\S]*?\$checklist\$(\[[\s\S]*?\])\$checklist\$::jsonb[\s\S]*?-- CHECKLIST_SEED_JSON_END/
  );
  if (!match) throw new Error('Could not locate checklist seed JSON');
  return JSON.parse(match[1]) as SeedItem[];
}

function canonicalItems(): SeedItem[] {
  return getBmpCategoriesForRiskLevel(2).flatMap((category) =>
    category.questions.map((question, index) => ({
      item_id: question.id,
      category_number: category.number,
      category_title: category.title,
      item_number: index + 1,
      prompt: question.prompt,
    }))
  );
}

describe('migration 018 checklist master data', () => {
  it('uses the same version identifier as the Phase 1 domain logic', () => {
    expect(sql).toContain(`'${TRADITIONAL_RISK_2_CHECKLIST_VERSION}'`);
  });

  it('seeds the exact canonical 22 items in official order', () => {
    expect(seededItems()).toEqual(canonicalItems());
    expect(seededItems()).toHaveLength(22);
  });

  it('locks item identity and ordering within a template', () => {
    expect(sql).toMatch(
      /PRIMARY KEY \(checklist_template_id, item_id\)/
    );
    expect(sql).toMatch(
      /UNIQUE \(checklist_template_id, category_number, item_number\)/
    );
  });
});

describe('migration 018 per-inspection history', () => {
  it('snapshots Part 1 site, QPE, observation, and practitioner values', () => {
    for (const column of [
      'site_name_snapshot',
      'wdid_snapshot',
      'risk_level_snapshot',
      'construction_stage_snapshot',
      'photos_taken',
      'inspector_title_snapshot',
      'qsp_license_number_snapshot',
      'qsp_company_snapshot',
      'qpe_start',
      'qpe_end',
      'qpe_duration_hours',
      'rain_gauge_inches',
      'obs_precipitation',
      'obs_discolorations',
      'obs_odors',
      'obs_turbidity',
      'obs_sheen',
      'obs_floating_material',
      'obs_suspended_material',
      'observation_comments',
      'exemption_documentation',
    ]) {
      expect(sql, `missing historical Part 1 field ${column}`).toContain(column);
    }
  });

  it('adds explicit attestation, observer, and history-summary fields', () => {
    for (const column of [
      'checklist_template_id',
      'checklist_observed_at',
      'unflagged_items_confirmed',
      'unflagged_items_confirmed_at',
      'unflagged_items_confirmed_by',
      'checklist_attested_by_name',
      'checklist_compliant_count',
      'checklist_deficient_count',
    ]) {
      expect(sql, `missing inspections.${column}`).toContain(column);
    }
    expect(sql).toContain('idx_inspections_project_history');
  });

  it('stores copied question and exception fields instead of live-only references', () => {
    expect(sql).toContain('CREATE TABLE inspection_checklist_results');
    for (const column of [
      'category_title',
      'prompt',
      'answer',
      'answer_source',
      'exception_description',
      'recommendation',
      'identified_at',
      'repair_start_due_at',
      'checkpoint_id_snapshot',
      'location_snapshot',
      'photo_urls',
    ]) {
      expect(sql, `missing result snapshot field ${column}`).toContain(column);
    }
  });

  it('allows only one answer per inspection checklist item', () => {
    expect(sql).toMatch(
      /UNIQUE \(inspection_id, checklist_item_id\)/
    );
  });

  it('enforces exception details and the exact 72-hour repair-start clock', () => {
    expect(sql).toContain("answer IN ('yes', 'no')");
    expect(sql).toContain("answer = 'no'");
    expect(sql).toContain("repair_start_due_at = identified_at + INTERVAL '72 hours'");
  });

  it('keeps normal-user history append-only and tenant scoped', () => {
    expect(sql).toContain(
      'ALTER TABLE inspection_checklist_results ENABLE ROW LEVEL SECURITY'
    );
    expect(sql).toContain('CREATE POLICY inspection_checklist_results_select');
    expect(sql).toContain('CREATE POLICY inspection_checklist_results_insert');
    expect(sql).not.toMatch(
      /CREATE POLICY inspection_checklist_results_(?:update|delete)/
    );
    expect(sql).toContain('SELECT auth_user_project_ids()');
  });
});

describe('migration 018 deficiency linkage', () => {
  it('allows checklist deficiencies without a physical checkpoint', () => {
    expect(sql).toMatch(/ALTER COLUMN checkpoint_id DROP NOT NULL/);
  });

  it('links a deficiency to the exact result row and inspection', () => {
    expect(sql).toContain('inspection_checklist_result_id BIGINT');
    expect(sql).toMatch(
      /FOREIGN KEY \(inspection_id, inspection_checklist_result_id\)[\s\S]*?REFERENCES inspection_checklist_results\(inspection_id, id\)/
    );
    expect(sql).toMatch(/UNIQUE \(inspection_checklist_result_id\)/);
  });

  it('stores repair start, completion, and verification separately', () => {
    for (const column of [
      'repair_start_due_at',
      'repair_started_at',
      'repair_completed_at',
      'verified_at',
      'verified_by',
      'action_implemented_at',
    ]) {
      expect(sql, `missing deficiency timeline field ${column}`).toContain(column);
    }
  });
});
