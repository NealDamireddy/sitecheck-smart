/**
 * UX-02 — field photo downscaling. The canvas path needs a browser, so
 * these cover the pure sizing math and the fallback guarantees that keep
 * an upload from ever being blocked by compression.
 */
import { describe, expect, it } from 'vitest';
import {
  COMPRESS_THRESHOLD_BYTES,
  MAX_UPLOAD_EDGE_PX,
  compressFieldPhoto,
  describeCompression,
  fitWithin,
} from '@/lib/image-compress';

describe('fitWithin', () => {
  it('leaves images already within the cap untouched', () => {
    expect(fitWithin(1600, 1200)).toEqual({ width: 1600, height: 1200 });
  });

  it('scales a landscape phone photo by its long edge', () => {
    // iPhone 12 MP: 4032x3024 → 2048x1536
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 });
  });

  it('scales a portrait photo by its long edge', () => {
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048 });
  });

  it('preserves aspect ratio within a pixel', () => {
    const { width, height } = fitWithin(4000, 2250); // 16:9
    expect(width).toBe(MAX_UPLOAD_EDGE_PX);
    expect(Math.abs(width / height - 4000 / 2250)).toBeLessThan(0.01);
  });

  it('never produces a zero dimension for extreme panoramas', () => {
    const { width, height } = fitWithin(20000, 3);
    expect(width).toBe(MAX_UPLOAD_EDGE_PX);
    expect(height).toBeGreaterThanOrEqual(1);
  });

  it('honors a custom max edge', () => {
    expect(fitWithin(4000, 2000, 1000)).toEqual({ width: 1000, height: 500 });
  });
});

describe('compressFieldPhoto fallbacks — must never block an upload', () => {
  function fakeFile(bytes: number, type = 'image/jpeg', name = 'IMG_0001.jpg'): File {
    return new File([new Uint8Array(bytes)], name, { type });
  }

  it('returns small photos untouched without touching a canvas', async () => {
    const small = fakeFile(200 * 1024);
    const result = await compressFieldPhoto(small);
    expect(result.compressed).toBe(false);
    expect(result.file).toBe(small);
    expect(result.finalBytes).toBe(result.originalBytes);
  });

  it('passes HEIC through — browsers often cannot decode it to canvas', async () => {
    const heic = fakeFile(6 * 1024 * 1024, 'image/heic', 'IMG_0002.heic');
    const result = await compressFieldPhoto(heic);
    expect(result.compressed).toBe(false);
    expect(result.file).toBe(heic);
  });

  it('returns the original when decoding fails rather than throwing', async () => {
    // Not a real image: the decode path must swallow and fall back.
    const bogus = fakeFile(3 * 1024 * 1024, 'image/jpeg', 'corrupt.jpg');
    const result = await compressFieldPhoto(bogus);
    expect(result.file).toBe(bogus);
    expect(result.compressed).toBe(false);
  });

  it('uses a 1 MB threshold', () => {
    expect(COMPRESS_THRESHOLD_BYTES).toBe(1024 * 1024);
  });
});

describe('describeCompression', () => {
  it('is null when nothing was compressed', () => {
    expect(
      describeCompression({
        file: new File([], 'x.jpg'),
        compressed: false,
        originalBytes: 100,
        finalBytes: 100,
      })
    ).toBeNull();
  });

  it('reads as a plain before/after for the field UI', () => {
    expect(
      describeCompression({
        file: new File([], 'x.jpg'),
        compressed: true,
        originalBytes: 8.4 * 1024 * 1024,
        finalBytes: 780 * 1024,
      })
    ).toBe('8.4 MB → 780 KB');
  });
});
