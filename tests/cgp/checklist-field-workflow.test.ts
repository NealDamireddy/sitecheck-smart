import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function source(path: string) {
  return readFileSync(resolve(root, path), 'utf8');
}

describe('Phase 4 inspector checklist workflow', () => {
  it('starts routine inspections on the stored inspection checklist, not checkpoints', () => {
    const picker = source('src/components/dashboard/inspection-picker.tsx');

    expect(picker).toContain('router.push(`/inspections/${inspectionId}`)');
    expect(picker).not.toContain(
      'router.push(`/checkpoints?inspectionId=${inspectionId}`)'
    );
    expect(picker).toContain("const endpoint = usesFieldRecord ? '/api/site-records' : '/api/inspections'");
    expect(picker).toContain('hasMounted && !!activeInspectionId');
    expect(picker).toContain('disabled={!hasMounted || !currentProjectId || starting}');
  });

  it('renders the canonical checklist and sends exception-only data atomically', () => {
    const form = source(
      'src/components/inspections/inspection-checklist-form.tsx'
    );

    expect(form).toContain('getBmpCategoriesForRiskLevel(2)');
    expect(form).toContain(
      '`/api/inspections/${inspectionId}/checklist/submit`'
    );
    expect(form).toContain('unflaggedItemsConfirmed: true');
    expect(form).toContain('exceptions: orderedExceptions');
    expect(form).toContain('Every unflagged item was');
  });

  it('requires descriptions and recommendations for every flagged exception', () => {
    const form = source(
      'src/components/inspections/inspection-checklist-form.tsx'
    );

    expect(form).toContain('!draft.description.trim()');
    expect(form).toContain('!draft.recommendation.trim()');
    expect(form).toContain('Deficiency description');
    expect(form).toContain('Recommended correction');
  });

  it('embeds the field form for drafts and shows immutable history afterward', () => {
    const detail = source('src/app/inspections/[id]/page.tsx');

    expect(detail).toContain('<InspectionChecklistForm');
    expect(detail).toContain('!isSubmitted && checklistCategories.length === 0');
    expect(detail).toContain('Stored BMP Checklist');
    expect(detail).not.toContain('submitInspection(id)');
  });
});
