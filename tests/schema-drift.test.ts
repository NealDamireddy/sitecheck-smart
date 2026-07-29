/**
 * DRF-01 — the three layers that describe a BMP category must agree.
 *
 * TypeScript, Zod and the Postgres CHECK constraint each declared this
 * list independently and all three disagreed. This test reads the
 * migration SQL and compares it against the canonical arrays, so the
 * next divergence fails the build instead of surfacing as a runtime
 * database error.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_BMP_TYPES,
  DB_BMP_TYPES,
  LINEAR_BMP_TYPES,
  isPersistableBmpType,
} from '@/lib/cgp/bmp-types';
import { checkpointCreate, checkpointUpdate } from '@/lib/validations/checkpoint';

/** Pull the accepted values out of the bmp_type CHECK in migration 001. */
function bmpTypesFromMigration(): string[] {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/001_initial_schema.sql'),
    'utf8'
  );
  const match = sql.match(/bmp_type TEXT NOT NULL CHECK \(bmp_type IN \(([\s\S]*?)\)\)/);
  if (!match) throw new Error('Could not locate the bmp_type CHECK constraint');
  return [...match[1].matchAll(/'([a-z-]+)'/g)].map((m) => m[1]).sort();
}

describe('bmp_type: database CHECK vs canonical list', () => {
  it('DB_BMP_TYPES matches the CHECK constraint exactly', () => {
    expect(bmpTypesFromMigration()).toEqual([...DB_BMP_TYPES].sort());
  });

  it('the linear values are NOT yet accepted by the database', () => {
    // If this fails, a migration widened the constraint — move those
    // values into DB_BMP_TYPES so writes are allowed to use them.
    const dbValues = bmpTypesFromMigration();
    for (const linear of LINEAR_BMP_TYPES) {
      expect(dbValues).not.toContain(linear);
    }
  });
});

describe('bmp_type: Zod vs canonical list', () => {
  const base = {
    id: 'cp-1',
    name: 'SC-1 Silt Fence',
    description: 'North perimeter',
    cgpSection: 'X.H.1.a',
    lat: 36.78,
    lng: -119.42,
    installDate: '2026-01-01',
  };

  for (const value of DB_BMP_TYPES) {
    it(`accepts persistable value "${value}"`, () => {
      expect(checkpointCreate.safeParse({ ...base, bmpType: value }).success).toBe(true);
    });
  }

  for (const value of LINEAR_BMP_TYPES) {
    it(`rejects display-only value "${value}" at the write boundary`, () => {
      // Better a clear 400 than a confusing database CHECK violation.
      expect(checkpointCreate.safeParse({ ...base, bmpType: value }).success).toBe(false);
    });
  }

  it('rejects arbitrary text — the original hole', () => {
    for (const bad of ['', 'not-a-bmp', 'DROP TABLE checkpoints', 'x'.repeat(150)]) {
      expect(checkpointCreate.safeParse({ ...base, bmpType: bad }).success).toBe(false);
    }
  });

  it('the update schema inherits the same constraint', () => {
    expect(checkpointUpdate.safeParse({ bmpType: 'sediment-control' }).success).toBe(true);
    expect(checkpointUpdate.safeParse({ bmpType: 'trench-plug' }).success).toBe(false);
    expect(checkpointUpdate.safeParse({ bmpType: 'garbage' }).success).toBe(false);
  });
});

describe('canonical helpers', () => {
  it('ALL_BMP_TYPES is the union with no duplicates', () => {
    expect(ALL_BMP_TYPES).toHaveLength(
      DB_BMP_TYPES.length + LINEAR_BMP_TYPES.length
    );
    expect(new Set(ALL_BMP_TYPES).size).toBe(ALL_BMP_TYPES.length);
  });

  it('isPersistableBmpType agrees with DB_BMP_TYPES', () => {
    for (const v of DB_BMP_TYPES) expect(isPersistableBmpType(v)).toBe(true);
    for (const v of LINEAR_BMP_TYPES) expect(isPersistableBmpType(v)).toBe(false);
    expect(isPersistableBmpType('nonsense')).toBe(false);
  });

  it('every displayable type has a label and a color', async () => {
    const { BMP_CATEGORY_LABELS, BMP_CATEGORY_COLORS } = await import('@/lib/constants');
    for (const t of ALL_BMP_TYPES) {
      expect(BMP_CATEGORY_LABELS[t], `missing label for ${t}`).toBeTruthy();
      expect(BMP_CATEGORY_COLORS[t], `missing color for ${t}`).toBeTruthy();
    }
  });
});
