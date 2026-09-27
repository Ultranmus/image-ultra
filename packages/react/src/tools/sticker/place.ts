import {
  createShapeId,
  getCanvasRect,
  loadImage,
  type EditorStore,
  type RasterAsset,
} from '@image-ultra/core/internal';

type Asset = { id: string; value: RasterAsset };

const EMOJI_FONT = "'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";

function canvasAsset(canvas: HTMLCanvasElement, createdBy: string): Asset {
  return {
    id: `asset-${createShapeId()}`,
    value: {
      kind: 'raster',
      src: canvas.toDataURL('image/webp', 0.92),
      width: canvas.width,
      height: canvas.height,
      mimeType: 'image/webp',
      createdBy,
    },
  };
}

/** Draws an image URL (e.g. an SVG sticker) into a `size`-px asset, keeping its aspect ratio. */
export async function rasterizeUrl(src: string, size: number, createdBy: string): Promise<Asset> {
  const img = new Image();
  // Remote images (the 3D library) must allow CORS, or the canvas can't be read back.
  if (/^https?:/.test(src)) img.crossOrigin = 'anonymous';
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  const k = size / Math.max(img.naturalWidth || size, img.naturalHeight || size);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((img.naturalWidth || size) * k));
  canvas.height = Math.max(1, Math.round((img.naturalHeight || size) * k));
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvasAsset(canvas, createdBy);
}

/**
 * An emoji as an image. Emoji fonts differ between systems, so the picture is taken once, here,
 * and every export shows the same one.
 */
export function rasterizeEmoji(emoji: string, size = 256): Asset {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.font = `${Math.round(size * 0.82)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size / 2 + size * 0.04);
  }
  return canvasAsset(canvas, 'sticker/emoji');
}

/** An app-provided sticker keeps its URL; only its size is read. */
export async function urlAsset(src: string): Promise<Asset> {
  let width = 1;
  let height = 1;
  try {
    const loaded = await loadImage(src);
    width = loaded.width;
    height = loaded.height;
    loaded.bitmap.close();
  } catch {
    // Unreadable (e.g. no CORS): keep it square; it may not export, but it still shows up.
  }
  return {
    id: `asset-${createShapeId()}`,
    value: { kind: 'raster', src, width, height, mimeType: 'image/*', createdBy: 'sticker/app' },
  };
}

/**
 * Adds the asset as an image shape in the middle of the photo (a quarter of its short side) as one
 * undo step, and returns the new shape's id.
 */
export function placeSticker(store: EditorStore, asset: Asset, label: string): string | null {
  const { image, edit } = store.getState();
  if (!image) return null;
  const crop = getCanvasRect(image, edit);
  const side = Math.min(crop.width, crop.height) * 0.25;
  const aspect = asset.value.width / asset.value.height || 1;
  const width = aspect >= 1 ? side : side * aspect;
  const height = aspect >= 1 ? side / aspect : side;
  const id = createShapeId();
  store.getState().update(label, (draft) => {
    draft.assets[asset.id] = asset.value;
    draft.annotations.push({
      id,
      type: 'image',
      rotation: 0,
      opacity: 1,
      x: crop.x + (crop.width - width) / 2,
      y: crop.y + (crop.height - height) / 2,
      width,
      height,
      assetId: asset.id,
    });
  });
  return id;
}
