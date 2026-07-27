/**
 * UX-01 — field controls must stay finger-sized.
 *
 * Static analysis rather than rendering: there is no jsdom/testing-
 * library in this repo, and the thing worth protecting is a source-level
 * convention (every control the QSP taps in the field carries a 44px
 * minimum). This catches the regression that matters — someone styling
 * a new field button with desktop paddings — without pulling in a
 * render stack.
 *
 * Real-device verification stays in docs/QA_CHECKLIST.md §4.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FIELD_ACTION_CLASS,
  FIELD_SECONDARY_CLASS,
  FIELD_ICON_CLASS,
  MIN_TOUCH_TARGET_PX,
} from '@/lib/field-ui';

/** Components the QSP operates standing on a site, on a phone. */
const FIELD_COMPONENTS = [
  'src/components/checkpoints/checkpoint-detail.tsx',
  'src/components/checkpoints/checkpoint-photo-viewer.tsx',
];

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), 'utf8');
}

describe('field control sizing constants', () => {
  it('44px is the documented minimum', () => {
    expect(MIN_TOUCH_TARGET_PX).toBe(44);
  });

  it('every field class carries the 44px floor (min-h-11 = 44px)', () => {
    for (const cls of [FIELD_ACTION_CLASS, FIELD_SECONDARY_CLASS, FIELD_ICON_CLASS]) {
      expect(cls).toMatch(/\bmin-h-11\b/);
    }
    expect(FIELD_ICON_CLASS).toMatch(/\bmin-w-11\b/);
  });
});

describe('checkpoint status actions (the most-tapped controls in the product)', () => {
  const src = read('src/components/checkpoints/checkpoint-detail.tsx');

  it('all three status buttons use the shared field action class', () => {
    const uses = src.match(/FIELD_ACTION_CLASS/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });

  it('no status button reintroduces the old cramped padding', () => {
    // px-2.5 py-1.5 text-xs rendered ~28px tall — below the floor.
    expect(src).not.toMatch(/px-2\.5 py-1\.5 text-xs font-medium transition-colors/);
  });

  it('each status action is still wired to setCheckpointStatus', () => {
    for (const status of ['compliant', 'deficient', 'needs-review']) {
      expect(src).toContain(`setCheckpointStatus('${status}')`);
    }
  });
});

describe('photo capture control', () => {
  const src = read('src/components/checkpoints/checkpoint-photo-viewer.tsx');

  it('uses the field action class', () => {
    expect(src).toContain('FIELD_ACTION_CLASS');
  });

  it('opens the rear camera directly on mobile', () => {
    expect(src).toMatch(/capture="environment"/);
  });

  it('downscales before uploading (UX-02)', () => {
    expect(src).toContain('compressFieldPhoto');
  });

  it('shows a distinct preparing state so the pause reads as progress', () => {
    expect(src).toMatch(/Preparing/);
  });
});

describe('no field component regresses to sub-44px tap targets', () => {
  for (const rel of FIELD_COMPONENTS) {
    it(`${rel} has no h-6/h-7/h-8 sized interactive control`, () => {
      const src = read(rel);
      // Grab className strings that sit on a <button> in these files and
      // assert none pins an explicit sub-44px height.
      const buttonBlocks = src.split('<button').slice(1);
      const offenders: string[] = [];
      for (const block of buttonBlocks) {
        const head = block.slice(0, 400);
        if (/\bh-(?:6|7|8|9|10)\b/.test(head)) offenders.push(head.slice(0, 120));
      }
      expect(offenders, offenders.join('\n---\n')).toEqual([]);
    });
  }
});

describe('AI output is framed as a draft (UX-03)', () => {
  const src = read('src/components/checkpoints/ai-analysis-panel.tsx');

  it('labels the analysis as a draft for QSP review', () => {
    expect(src).toMatch(/AI draft/i);
  });

  it('treats low confidence as visually distinct', () => {
    expect(src).toMatch(/confidence < 75/);
    expect(src).toMatch(/Low-confidence/i);
  });

  it('still surfaces the numeric confidence', () => {
    expect(src).toMatch(/displayAnalysis\.confidence/);
  });
});

describe('destructive actions are confirmed (UX-06)', () => {
  it('removing SMARTS credentials asks first', () => {
    const src = read('src/app/account/page.tsx');
    const removeFn = src.slice(src.indexOf('async function handleRemove'));
    const body = removeFn.slice(0, removeFn.indexOf('setRemoving(true)'));
    expect(body).toMatch(/window\.confirm/);
  });
});

describe('terminology is consistent (UX-04)', () => {
  it('navigation says Projects, matching routes, tables and types', () => {
    const sidebar = read('src/components/layout/sidebar.tsx');
    expect(sidebar).toContain("label: 'Projects'");
    expect(sidebar).not.toContain("label: 'Sites'");
  });
});
