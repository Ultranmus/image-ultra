import { createShapeId, type RasterAsset } from '@image-ultra/core/internal';

/**
 * Reads an image file into an `EditState.assets` entry: downscaled to at most `maxSide` px and
 * stored as a WebP data URL, so the edit state stays self-contained. `null` for non-images.
 */
export async function fileToAsset(
  file: File,
  createdBy: string,
  maxSide = 1600,
): Promise<{ id: string; value: RasterAsset } | null> {
  if (!file.type.startsWith('image/')) return null;
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * k));
  const height = Math.max(1, Math.round(bitmap.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return {
    id: `asset-${createShapeId()}`,
    value: {
      kind: 'raster',
      src: canvas.toDataURL('image/webp', 0.9),
      width,
      height,
      mimeType: 'image/webp',
      createdBy,
    },
  };
}
