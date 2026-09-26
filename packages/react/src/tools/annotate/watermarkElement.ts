import {
  applyToPoint,
  getOrientedToOutput,
  getOutputSize,
  invert,
  layoutWatermark,
  WATERMARK_ELEMENT_ID,
  watermarkAspect,
  watermarkFullHeight,
  type EditorStore,
  type EditState,
  type ImageShape,
  type LoadedImage,
  type Shape,
  type WatermarkState,
} from '@image-ultra/core';

/*
 * The watermark as an element on the photo (DECISIONS #88). Its look and layout live in
 * `EditState.watermark`; the element list only holds a marker for its place in the order (none =
 * on top). On the photo it's shown as a box shape with the id `watermark`, so selecting, moving,
 * resizing, rotating, grouping and reordering work like for any element — edits to that box are
 * written back as a custom position, size and angle. Not for a tiled watermark (it covers the whole
 * photo) or one the app locked (always on top, never selectable).
 */

export { WATERMARK_ELEMENT_ID };

/** Apps lock their watermark per editor: kept here so element actions can read it. */
const lockedFor = new WeakMap<EditorStore, boolean>();

export function setWatermarkLocked(store: EditorStore, locked: boolean): void {
  lockedFor.set(store, locked);
}

export function isWatermarkLocked(store: EditorStore): boolean {
  return lockedFor.get(store) ?? false;
}

function aspectOf(edit: EditState, wm: WatermarkState): number | null {
  const asset = wm.kind === 'image' && wm.assetId ? edit.assets[wm.assetId] : undefined;
  return watermarkAspect(wm, asset);
}

/** The watermark's box on the photo (oriented px), or `null` when it can't be an element. */
export function watermarkBox(
  image: LoadedImage,
  edit: EditState,
  locked: boolean,
): ImageShape | null {
  const wm = edit.watermark;
  if (!wm || locked || wm.position === 'tile') return null;
  const aspect = aspectOf(edit, wm);
  if (aspect === null) return null;
  const out = getOutputSize(image, edit);
  const box = layoutWatermark(wm, out, aspect);
  const toOriented = invert(getOrientedToOutput(image, edit));
  const a = applyToPoint(toOriented, { x: box.x, y: box.y });
  const b = applyToPoint(toOriented, { x: box.x + box.width, y: box.y + box.height });
  return {
    id: WATERMARK_ELEMENT_ID,
    type: 'image',
    assetId: '',
    rotation: wm.rotation,
    opacity: wm.opacity,
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

/** Watermark settings for a moved / resized / rotated box (a custom position). */
export function watermarkFromBox(
  image: LoadedImage,
  edit: EditState,
  box: Pick<ImageShape, 'x' | 'y' | 'width' | 'height' | 'rotation'>,
): Partial<WatermarkState> {
  const wm = edit.watermark;
  if (!wm) return {};
  const aspect = aspectOf(edit, wm) ?? 1;
  const out = getOutputSize(image, edit);
  const toOutput = getOrientedToOutput(image, edit);
  const c = applyToPoint(toOutput, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const height = box.height * Math.abs(toOutput[3]);
  const full = watermarkFullHeight(wm, out, aspect);
  return {
    position: 'custom',
    x: Math.min(1, Math.max(0, c.x / out.width)),
    y: Math.min(1, Math.max(0, c.y / out.height)),
    size: Math.min(1, Math.max(0.01, height / full)),
    rotation: box.rotation,
  };
}

/**
 * The elements as the editor shows them on the photo: the list, with the watermark's box at its
 * marker (or on top when there's no marker). The marker itself is never returned.
 */
export function elementsOf(image: LoadedImage | null, edit: EditState, locked: boolean): Shape[] {
  const list = edit.annotations.filter((s) => s.type !== 'watermark');
  const box = image ? watermarkBox(image, edit, locked) : null;
  if (!box) return list;
  const at = edit.annotations.findIndex((s) => s.type === 'watermark');
  if (at < 0) return [...list, box];
  // Index among the other elements = the marker's index (everything before it isn't the marker).
  return [...list.slice(0, at), box, ...list.slice(at)];
}

/** `elementsOf` for a store (reads its app-lock flag). */
export function storeElements(store: EditorStore): Shape[] {
  const { image, edit } = store.getState();
  return elementsOf(image, edit, isWatermarkLocked(store));
}

/**
 * The element list for reordering: the marker made explicit (appended when missing, i.e. on
 * top). Call `normalizeMarker` afterwards.
 */
export function ensureMarker(draft: EditState): void {
  if (!draft.watermark || draft.annotations.some((s) => s.type === 'watermark')) return;
  draft.annotations.push({ id: WATERMARK_ELEMENT_ID, type: 'watermark', rotation: 0, opacity: 1 });
}

/** A marker on top means "on top of everything": drop it, so new shapes still go under it. */
export function normalizeMarker(draft: EditState): void {
  if (!draft.watermark) {
    draft.annotations = draft.annotations.filter((s) => s.type !== 'watermark');
    return;
  }
  const at = draft.annotations.findIndex((s) => s.type === 'watermark');
  if (at >= 0 && at === draft.annotations.length - 1) draft.annotations.splice(at, 1);
}
