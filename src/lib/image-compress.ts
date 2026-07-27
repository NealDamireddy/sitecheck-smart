/**
 * Client-side photo downscaling for field uploads (UX-02).
 *
 * A current phone camera produces 3–12 MB JPEGs at 4000+ px wide. The
 * upload route caps at 5 MiB, so an inspector's photo could simply be
 * REJECTED after they walked to the BMP and took it — and even under
 * the cap, a 8 MB upload over one bar of rural cellular is a long wait
 * in the rain.
 *
 * Downscaling to 2048 px on the long edge keeps far more detail than
 * Claude Vision resolves (it works at ~1568 px) and than a compliance
 * photo needs, while typically cutting the payload by 5–15×.
 *
 * Deliberate EXIF decision: re-encoding through a canvas DROPS all EXIF,
 * including GPS. That is the behavior we want. The photo's evidentiary
 * link to a place and time comes from the checkpoint it is attached to
 * and the server-side upload timestamp — both of which we control and
 * neither of which a stripped header can contradict. Carrying the
 * phone's raw GPS would embed the inspector's precise location in a
 * file that may be shared with a regulator or a client, for no
 * compliance gain. If a future requirement needs geotagging, capture
 * the coordinates explicitly into the checkpoint record rather than
 * relying on EXIF.
 *
 * Falls back to the original file on any failure — a browser without
 * canvas support or an image the decoder rejects must not block an
 * upload.
 */

export const MAX_UPLOAD_EDGE_PX = 2048;
export const JPEG_QUALITY = 0.82;
/** Skip the work entirely for images already small enough. */
export const COMPRESS_THRESHOLD_BYTES = 1024 * 1024;

export interface CompressResult {
  file: File;
  /** True when the returned file is a re-encoded, smaller image. */
  compressed: boolean;
  originalBytes: number;
  finalBytes: number;
}

/** Target dimensions preserving aspect ratio, capped at `maxEdge`. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_UPLOAD_EDGE_PX
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image'));
    };
    img.src = url;
  });
}

/**
 * Downscale and re-encode a field photo. Returns the original untouched
 * when it is already small, when the browser can't do the work, or when
 * re-encoding would not actually save bytes.
 */
export async function compressFieldPhoto(file: File): Promise<CompressResult> {
  const originalBytes = file.size;
  const unchanged: CompressResult = {
    file,
    compressed: false,
    originalBytes,
    finalBytes: originalBytes,
  };

  if (originalBytes <= COMPRESS_THRESHOLD_BYTES) return unchanged;
  if (typeof document === 'undefined') return unchanged;
  // HEIC often can't be decoded by the browser canvas; let the server
  // take the original rather than risk a blank re-encode.
  if (file.type === 'image/heic' || file.type === 'image/heif') return unchanged;

  try {
    const source = await decode(file);
    const sourceWidth = 'width' in source ? source.width : 0;
    const sourceHeight = 'height' in source ? source.height : 0;
    if (!sourceWidth || !sourceHeight) return unchanged;

    const { width, height } = fitWithin(sourceWidth, sourceHeight);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return unchanged;
    ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
    if ('close' in source && typeof source.close === 'function') source.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob || blob.size >= originalBytes) return unchanged;

    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return {
      file: new File([blob], name, {
        type: 'image/jpeg',
        lastModified: file.lastModified,
      }),
      compressed: true,
      originalBytes,
      finalBytes: blob.size,
    };
  } catch {
    return unchanged;
  }
}

/** "8.4 MB → 780 KB" for the upload progress line. */
export function describeCompression(result: CompressResult): string | null {
  if (!result.compressed) return null;
  const mb = (n: number) =>
    n >= 1024 * 1024
      ? `${(n / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(n / 1024)} KB`;
  return `${mb(result.originalBytes)} → ${mb(result.finalBytes)}`;
}
