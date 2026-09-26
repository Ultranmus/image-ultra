import type { Point } from '../types';
import { boxCenter, createShapeId, getShapeBox, type Box, type Shape } from './annotations';
import { groupBounds, transformShape } from './arrange';
import type { EditAsset, EditState } from './editState';

/*
 * Copy / paste of shapes and redaction areas, also between photos (DECISIONS #78). A copied item
 * remembers the visible area (crop) of its photo, so a paste lands at the same relative spot and
 * the same size relative to the new photo. Several shapes are copied and pasted as one group,
 * keeping their layout. Everything here is plain data — the clipboard itself lives in the UI.
 */

/** Copied elements (shapes, text, images, redaction areas — never the watermark, there's one). */
export interface ClipboardItem {
  kind: 'shape';
  /** Bottom to top, as in `annotations`. */
  shapes: Shape[];
  /** Images the shapes need (stickers, logos), so they paste into any photo. */
  assets: Record<string, EditAsset>;
}

export interface ClipboardEntry {
  item: ClipboardItem;
  /** The visible area (crop, oriented px) of the photo it was copied from. */
  area: Box;
}

/**
 * Copies the shapes with these ids (in stacking order) and the images they use; `null` when none
 * of them exists.
 */
export function copyShapes(
  state: EditState,
  ids: readonly string[],
  area: Box,
): ClipboardEntry | null {
  const shapes = state.annotations.filter((s) => ids.includes(s.id) && s.type !== 'watermark');
  if (shapes.length === 0) return null;
  const assets: Record<string, EditAsset> = {};
  for (const shape of shapes) {
    if (shape.type !== 'image') continue;
    const asset = state.assets[shape.assetId];
    if (asset) assets[shape.assetId] = clone(asset);
  }
  return { item: { kind: 'shape', shapes: clone(shapes), assets }, area: { ...area } };
}

/**
 * Adds the clipboard item to `draft` (call inside a store `update`) and returns the new ids (on
 * top, in the copied order). `area` = the visible area of the photo being pasted into. The copy
 * is centred on `at` (e.g. the mouse pointer) when given, else it lands at the same relative spot.
 * When an identical item already sits there (pasting into the same photo, or pasting twice) it
 * moves down-right by 3% of the photo until the spot is free.
 */
export function pasteClipboard(
  draft: EditState,
  entry: ClipboardEntry,
  area: Box,
  at?: Point,
): string[] {
  const { item } = entry;
  const step = Math.min(area.width, area.height) * 0.03;
  const nudge = (p: Point) => ({ x: p.x + step, y: p.y + step });
  let shapes = fitShapes(item.shapes, entry.area, area, at);
  const taken = () => shapes.some((shape) => draft.annotations.some((o) => sameShapeBox(o, shape)));
  for (let i = 0; i < 50 && taken(); i++) {
    shapes = shapes.map((s) => transformShape(s, nudge, 1));
  }
  // Same asset id, different image (another photo's asset): store it under a new id.
  const renamed = new Map<string, string>();
  for (const [id, asset] of Object.entries(item.assets)) {
    const existing = draft.assets[id];
    if (!existing) draft.assets[id] = clone(asset);
    else if (existing.src !== asset.src) {
      const next = `asset-${createShapeId()}`;
      draft.assets[next] = clone(asset);
      renamed.set(id, next);
    }
  }
  return shapes.map((shape) => {
    // A copy is always visible and editable, whatever the original was.
    const copy: Shape = { ...shape, id: createShapeId() };
    delete copy.locked;
    delete copy.hidden;
    if (copy.type === 'image') copy.assetId = renamed.get(copy.assetId) ?? copy.assetId;
    draft.annotations.push(copy);
    return copy.id;
  });
}

/* ── Placement ─────────────────────────────────────────────────────────── */

/**
 * The map from one photo's visible area to another's: the item's centre keeps its relative
 * position (or moves to `at`), and its size keeps its ratio to the short side.
 */
function fit(
  center: Point,
  from: Box,
  to: Box,
  at?: Point,
): { map: (p: Point) => Point; k: number } {
  const k = Math.min(to.width, to.height) / Math.max(1e-6, Math.min(from.width, from.height));
  const target = at ?? {
    x: to.x + ((center.x - from.x) / Math.max(1e-6, from.width)) * to.width,
    y: to.y + ((center.y - from.y) / Math.max(1e-6, from.height)) * to.height,
  };
  return {
    k,
    map: (p) => ({ x: target.x + (p.x - center.x) * k, y: target.y + (p.y - center.y) * k }),
  };
}

/** Places shapes as one group (their layout is kept) from one visible area into another. */
export function fitShapes(shapes: readonly Shape[], from: Box, to: Box, at?: Point): Shape[] {
  const bounds = groupBounds(shapes);
  if (!bounds) return [];
  const { map, k } = fit(boxCenter(bounds), from, to, at);
  return shapes.map((s) => transformShape(s, map, k));
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

const near = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) < 0.5 &&
  Math.abs(a.y - b.y) < 0.5 &&
  Math.abs(a.width - b.width) < 0.5 &&
  Math.abs(a.height - b.height) < 0.5;

function sameShapeBox(a: Shape, b: Shape): boolean {
  return a.type === b.type && near(getShapeBox(a), getShapeBox(b));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
