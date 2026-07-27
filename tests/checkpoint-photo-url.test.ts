/**
 * SEC-01 — stored photo values must map to the right serving behavior:
 * checkpoint-photos objects get signed, everything else passes through.
 */
import { describe, expect, it } from 'vitest';
import { checkpointPhotoPathFromUrl } from '@/lib/supabase/storage';

describe('checkpointPhotoPathFromUrl (SEC-01)', () => {
  it('extracts the object path from a stored public URL', () => {
    expect(
      checkpointPhotoPathFromUrl(
        'https://abc.supabase.co/storage/v1/object/public/checkpoint-photos/proj-1/cp-2/1720000000000.jpg'
      )
    ).toBe('proj-1/cp-2/1720000000000.jpg');
  });

  it('strips query strings from stored URLs', () => {
    expect(
      checkpointPhotoPathFromUrl(
        'https://abc.supabase.co/storage/v1/object/public/checkpoint-photos/p/c/1.jpg?t=123'
      )
    ).toBe('p/c/1.jpg');
  });

  it('accepts a bare object path', () => {
    expect(checkpointPhotoPathFromUrl('proj-1/cp-2/1.jpg')).toBe('proj-1/cp-2/1.jpg');
  });

  it('passes through bundled demo assets and foreign URLs', () => {
    expect(checkpointPhotoPathFromUrl('/demo-photos/erosion-control/photo-1.jpg')).toBeNull();
    expect(checkpointPhotoPathFromUrl('https://example.com/a.jpg')).toBeNull();
    expect(
      checkpointPhotoPathFromUrl(
        'https://abc.supabase.co/storage/v1/object/public/mission-photos/p/m/1.jpg'
      )
    ).toBeNull();
  });

  it('handles null and empty values', () => {
    expect(checkpointPhotoPathFromUrl(null)).toBeNull();
    expect(checkpointPhotoPathFromUrl('')).toBeNull();
  });
});
