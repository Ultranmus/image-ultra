import { createShapeId, getCanvasRect, type EditorStore, type Point } from '@image-ultra/core';
import { fileToAsset } from '../assets';

/**
 * Adds an image file as an image shape (one undo step) and returns its id: 40% of the result's
 * width, centred on `at` (oriented px) or on the result. `null` when the file isn't an image.
 */
export async function insertImageFile(
  store: EditorStore,
  label: string,
  file: File,
  options: { at?: Point | undefined; createdBy?: string } = {},
): Promise<string | null> {
  const asset = await fileToAsset(file, options.createdBy ?? 'annotate');
  const { image, edit } = store.getState();
  if (!asset || !image) return null;
  const area = getCanvasRect(image, edit);
  const width = area.width * 0.4;
  const height = (width * asset.value.height) / asset.value.width;
  const center = options.at ?? { x: area.x + area.width / 2, y: area.y + area.height / 2 };
  const id = createShapeId();
  store.getState().update(label, (draft) => {
    draft.assets[asset.id] = asset.value;
    draft.annotations.push({
      id,
      type: 'image',
      rotation: 0,
      opacity: 1,
      x: center.x - width / 2,
      y: center.y - height / 2,
      width,
      height,
      assetId: asset.id,
    });
  });
  return id;
}
