import type { Point } from '../types';
import { boxCenter, createShapeId, getShapeBox, type Box, type Shape } from './annotations';
import type { EditAsset, EditState } from './editState';
import { redactionBounds, type Redaction } from './redactions';

/*
 * Copy / paste of shapes and redaction areas, also between photos (DECISIONS #78). A copied item
 * remembers the visible area (crop) of its photo, so a paste lands at the same relative spot and
 * the same size relative to the new photo. Everything here is plain data — the clipboard itself
 * lives in the UI.
 */

export type ClipboardItem =
  | {
      kind: 'shape';
      shape: Shape;
      /** Images the shape needs (stickers, logos), so it pastes into any photo. */
      assets: Record<string, EditAsset>;
    }
  | { kind: 'redaction'; redaction: Redaction };

export interface ClipboardEntry {
  item: ClipboardItem;
  /** The visible area (crop, oriented px) of the photo it was copied from. */
  area: Box;
}

/** Copies the shape with id `id` (and the images it uses); `null` if it doesn't exist. */
export function copyShape(state: EditState, id: string, area: Box): ClipboardEntry | null {
  const shape = state.annotations.find((s) => s.id === id);
  if (!shape) return null;
  const assets: Record<string, EditAsset> = {};
  if (shape.type === 'image') {
    const asset = state.assets[shape.assetId];
    if (asset) assets[shape.assetId] = clone(asset);
  }
  return { item: { kind: 'shape', shape: clone(shape), assets }, area: { ...area } };
}

/** Copies the redaction area with id `id`; `null` if it doesn't exist. */
export function copyRedaction(state: EditState, id: string, area: Box): ClipboardEntry | null {
  const redaction = state.redactions.find((r) => r.id === id);
  if (!redaction) return null;
  return { item: { kind: 'redaction', redaction: clone(redaction) }, area: { ...area } };
}

/**
 * Adds the clipboard item to `draft` (call inside a store `update`) and returns the new id.
 * `area` = the visible area of the photo being pasted into. The copy is centred on `at` (e.g. the
 * mouse pointer) when given, else it lands at the same relative spot. When an identical item already sits there (pasting into the same photo, or pasting twice)
 * it moves down-right by 3% of the photo until the spot is free.
 */
export function pasteClipboard(
  draft: EditState,
  entry: ClipboardEntry,
  area: Box,
  at?: Point,
): string {
  const { item } = entry;
  const step = Math.min(area.width, area.height) * 0.03;
  if (item.kind === 'redaction') {
    let r = fitRedaction(item.redaction, entry.area, area, at);
    for (let i = 0; i < 50 && draft.redactions.some((o) => sameBox(o, r)); i++) {
      r = transformRedaction(r, (p) => ({ x: p.x + step, y: p.y + step }), 1);
    }
    const id = `redact-${Math.random().toString(36).slice(2, 10)}`;
    draft.redactions.push({ ...r, id });
    return id;
  }

  let shape = fitShape(item.shape, entry.area, area, at);
  for (let i = 0; i < 50 && draft.annotations.some((o) => sameShapeBox(o, shape)); i++) {
    shape = transformShape(shape, (p) => ({ x: p.x + step, y: p.y + step }), 1);
  }
  if (shape.type === 'image') {
    const asset = item.assets[shape.assetId];
    const existing = draft.assets[shape.assetId];
    if (asset && existing && existing.src !== asset.src) {
      // Same id, different image (another photo's asset): store it under a new id.
      const assetId = `asset-${createShapeId()}`;
      draft.assets[assetId] = clone(asset);
      shape = { ...shape, assetId };
    } else if (asset && !existing) {
      draft.assets[shape.assetId] = clone(asset);
    }
  }
  // A copy is always visible and editable, whatever the original was.
  const copy: Shape = { ...shape, id: createShapeId() };
  delete copy.locked;
  delete copy.hidden;
  draft.annotations.push(copy);
  return copy.id;
}

/* ── Placement ─────────────────────────────────────────────────────────── */

/**
 * The map from one photo's visible area to another's: the item's centre keeps its relative
 * position, and its size keeps its ratio to the short side.
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

export function fitShape(shape: Shape, from: Box, to: Box, at?: Point): Shape {
  const { map, k } = fit(boxCenter(getShapeBox(shape)), from, to, at);
  return transformShape(shape, map, k);
}

export function fitRedaction(r: Redaction, from: Box, to: Box, at?: Point): Redaction {
  const { map, k } = fit(boxCenter(redactionBounds(r)), from, to, at);
  return transformRedaction(r, map, k);
}

/** Moves points with `map` and scales sizes (stroke, font, box) by `k`. Rotation is kept. */
function transformShape(shape: Shape, map: (p: Point) => Point, k: number): Shape {
  switch (shape.type) {
    case 'line':
      return {
        ...shape,
        points: [map(shape.points[0]), map(shape.points[1])],
        strokeWidth: shape.strokeWidth * k,
      };
    case 'path':
      return { ...shape, points: shape.points.map(map), strokeWidth: shape.strokeWidth * k };
    case 'text': {
      const p = map({ x: shape.x, y: shape.y });
      return { ...shape, ...p, width: shape.width * k, fontSize: shape.fontSize * k };
    }
    case 'rect': {
      const p = map({ x: shape.x, y: shape.y });
      return {
        ...shape,
        ...p,
        width: shape.width * k,
        height: shape.height * k,
        strokeWidth: shape.strokeWidth * k,
        cornerRadius: shape.cornerRadius * k,
      };
    }
    case 'ellipse': {
      const p = map({ x: shape.x, y: shape.y });
      return {
        ...shape,
        ...p,
        width: shape.width * k,
        height: shape.height * k,
        strokeWidth: shape.strokeWidth * k,
      };
    }
    case 'image': {
      const p = map({ x: shape.x, y: shape.y });
      return { ...shape, ...p, width: shape.width * k, height: shape.height * k };
    }
  }
}

function transformRedaction(r: Redaction, map: (p: Point) => Point, k: number): Redaction {
  if (r.kind === 'brush') return { ...r, points: r.points.map(map), size: r.size * k };
  const p = map({ x: r.x, y: r.y });
  return { ...r, ...p, width: r.width * k, height: r.height * k };
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

function sameBox(a: Redaction, b: Redaction): boolean {
  return a.kind === b.kind && near(redactionBounds(a), redactionBounds(b));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
