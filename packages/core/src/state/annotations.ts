import type { Point, Size } from '../types';

/*
 * Annotations are vector shapes drawn on top of the photo. Coordinates are in ORIENTED space — the
 * same space as the crop — so cropping never moves a shape relative to the photo, and rotate/flip
 * carry shapes along (see `rotateAnnotations` / `flipAnnotations`). Straighten and perspective leave
 * them upright. Sizes (stroke width, font size) are in image pixels, so they scale with the export.
 */

export type ShapeType = 'rect' | 'ellipse' | 'line' | 'path' | 'text' | 'image';

interface ShapeBase {
  id: string;
  type: ShapeType;
  /** Clockwise degrees around the shape's centre. */
  rotation: number;
  /** 0…1. */
  opacity: number;
  /** Optional layer name; a readable default is derived when missing. */
  name?: string;
  /** Can't be selected on the canvas (still listed in Layers). */
  locked?: boolean;
  /** Not drawn and can't be selected. */
  hidden?: boolean;
}

/** Any CSS colour, or `null` for none. */
export type Paint = string | null;

export interface RectShape extends ShapeBase {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: Paint;
  stroke: Paint;
  strokeWidth: number;
  cornerRadius: number;
}

export interface EllipseShape extends ShapeBase {
  type: 'ellipse';
  /** Bounding box. */
  x: number;
  y: number;
  width: number;
  height: number;
  fill: Paint;
  stroke: Paint;
  strokeWidth: number;
}

export type LineCap = 'none' | 'arrow' | 'circle';

export interface LineShape extends ShapeBase {
  type: 'line';
  /** Start and end. */
  points: [Point, Point];
  stroke: string;
  strokeWidth: number;
  startCap: LineCap;
  endCap: LineCap;
}

/** Freehand pen stroke or polygon. */
export interface PathShape extends ShapeBase {
  type: 'path';
  points: Point[];
  closed: boolean;
  /** Draw with smooth curves through the points (pen) instead of straight segments (polygon). */
  smooth: boolean;
  fill: Paint;
  stroke: Paint;
  strokeWidth: number;
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextShape extends ShapeBase {
  type: 'text';
  /** Top-left of the text box; the height follows the wrapped text. */
  x: number;
  y: number;
  /** Wrap width. */
  width: number;
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: 400 | 700;
  fontStyle: 'normal' | 'italic';
  align: TextAlign;
  /** Line height as a multiple of the font size. */
  lineHeight: number;
  color: string;
  /** Optional box behind the text (label / highlight style). */
  background: Paint;
}

export interface ImageShape extends ShapeBase {
  type: 'image';
  x: number;
  y: number;
  width: number;
  height: number;
  /** Key into `EditState.assets`. */
  assetId: string;
}

export type Shape = RectShape | EllipseShape | LineShape | PathShape | TextShape | ImageShape;

/** Axis-aligned rectangle before rotation. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/* ── Geometry ──────────────────────────────────────────────────────────── */

/**
 * The shape's box before rotation. Text needs its measured height (`textHeight`); without it a
 * single-line estimate is used.
 */
export function getShapeBox(shape: Shape, textHeight?: number): Box {
  switch (shape.type) {
    case 'rect':
    case 'ellipse':
    case 'image':
      return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
    case 'text':
      return {
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: textHeight ?? shape.fontSize * shape.lineHeight,
      };
    case 'line':
    case 'path':
      return pointsBox(shape.points);
  }
}

export function pointsBox(points: readonly Point[]): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

export function boxCenter(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Rotates `p` around `c` by `degrees` clockwise (y down). */
export function rotatePoint(p: Point, c: Point, degrees: number): Point {
  if (degrees === 0) return { ...p };
  const r = (degrees * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

/** The four corners of the shape's (rotated) box, clockwise from top-left. */
export function getShapeCorners(shape: Shape, textHeight?: number): [Point, Point, Point, Point] {
  const b = getShapeBox(shape, textHeight);
  const c = boxCenter(b);
  return [
    rotatePoint({ x: b.x, y: b.y }, c, shape.rotation),
    rotatePoint({ x: b.x + b.width, y: b.y }, c, shape.rotation),
    rotatePoint({ x: b.x + b.width, y: b.y + b.height }, c, shape.rotation),
    rotatePoint({ x: b.x, y: b.y + b.height }, c, shape.rotation),
  ];
}

/** Axis-aligned bounds of the rotated shape (used for snapping). */
export function getShapeBounds(shape: Shape, textHeight?: number): Box {
  return pointsBox(getShapeCorners(shape, textHeight));
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function insidePolygon(p: Point, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * `true` if `point` (oriented space) hits the shape. `tolerance` is in oriented pixels — pass
 * the size of a few screen pixels so thin lines are easy to grab.
 */
export function hitTestShape(
  shape: Shape,
  point: Point,
  tolerance: number,
  textHeight?: number,
): boolean {
  if (shape.hidden) return false;
  const box = getShapeBox(shape, textHeight);
  // Work in the shape's unrotated frame.
  const p = rotatePoint(point, boxCenter(box), -shape.rotation);
  switch (shape.type) {
    case 'rect':
    case 'image':
    case 'text':
      return (
        p.x >= box.x - tolerance &&
        p.x <= box.x + box.width + tolerance &&
        p.y >= box.y - tolerance &&
        p.y <= box.y + box.height + tolerance
      );
    case 'ellipse': {
      const rx = box.width / 2 + tolerance;
      const ry = box.height / 2 + tolerance;
      const c = boxCenter(box);
      return ((p.x - c.x) / rx) ** 2 + ((p.y - c.y) / ry) ** 2 <= 1;
    }
    case 'line':
      return (
        distanceToSegment(p, shape.points[0], shape.points[1]) <= shape.strokeWidth / 2 + tolerance
      );
    case 'path': {
      if (shape.closed && shape.fill && insidePolygon(p, shape.points)) return true;
      const pts = shape.closed ? [...shape.points, shape.points[0]!] : shape.points;
      for (let i = 1; i < pts.length; i++) {
        if (distanceToSegment(p, pts[i - 1]!, pts[i]!) <= shape.strokeWidth / 2 + tolerance)
          return true;
      }
      return (
        pts.length === 1 &&
        Math.hypot(p.x - pts[0]!.x, p.y - pts[0]!.y) <= shape.strokeWidth / 2 + tolerance
      );
    }
  }
}

/** Topmost visible shape at `point` (unlocked only, unless `includeLocked`), or `null`. */
export function shapeAt(
  shapes: readonly Shape[],
  point: Point,
  tolerance: number,
  textHeights: (shape: TextShape) => number | undefined = () => undefined,
  options: { includeLocked?: boolean } = {},
): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    const s = shapes[i]!;
    if ((s.locked && !options.includeLocked) || s.hidden) continue;
    if (hitTestShape(s, point, tolerance, s.type === 'text' ? textHeights(s) : undefined)) return s;
  }
  return null;
}

/* ── Transforms ────────────────────────────────────────────────────────── */

export function moveShape<T extends Shape>(shape: T, dx: number, dy: number): T {
  if (shape.type === 'line') {
    return {
      ...shape,
      points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) as [Point, Point],
    };
  }
  if (shape.type === 'path') {
    return { ...shape, points: shape.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
  }
  return { ...shape, x: (shape as RectShape).x + dx, y: (shape as RectShape).y + dy };
}

/**
 * Gives the shape a new unrotated box (keeps rotation). Lines/paths scale their points; text
 * changes its wrap width, and scales its font when `scaleText` is true (corner handles).
 */
export function setShapeBox<T extends Shape>(
  shape: T,
  box: Box,
  options: { scaleText?: boolean; textHeight?: number } = {},
): T {
  const old = getShapeBox(shape, options.textHeight);
  const width = Math.max(1, box.width);
  const height = Math.max(1, box.height);
  switch (shape.type) {
    case 'rect':
    case 'ellipse':
    case 'image':
      return { ...shape, x: box.x, y: box.y, width, height };
    case 'text': {
      const k = old.width > 0 ? width / old.width : 1;
      return {
        ...shape,
        x: box.x,
        y: box.y,
        width,
        fontSize: options.scaleText ? Math.max(4, shape.fontSize * k) : shape.fontSize,
      };
    }
    case 'line':
    case 'path': {
      const sx = old.width > 0 ? box.width / old.width : 1;
      const sy = old.height > 0 ? box.height / old.height : 1;
      const map = (p: Point) => ({ x: box.x + (p.x - old.x) * sx, y: box.y + (p.y - old.y) * sy });
      return { ...shape, points: shape.points.map(map) } as T;
    }
  }
  return shape;
}

export type BoxHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * Resizes a box by dragging `handle` by `delta` given in the shape's UNROTATED frame. The opposite
 * side stays put; `keepAspect` locks the ratio for corner handles.
 */
export function resizeBox(
  box: Box,
  handle: BoxHandle,
  delta: Point,
  keepAspect: boolean,
  minSize = 2,
): Box {
  let left = box.x;
  let top = box.y;
  let right = box.x + box.width;
  let bottom = box.y + box.height;
  if (handle.includes('w')) left = Math.min(left + delta.x, right - minSize);
  if (handle.includes('e')) right = Math.max(right + delta.x, left + minSize);
  if (handle.includes('n')) top = Math.min(top + delta.y, bottom - minSize);
  if (handle.includes('s')) bottom = Math.max(bottom + delta.y, top + minSize);
  if (keepAspect && handle.length === 2 && box.width > 0 && box.height > 0) {
    const aspect = box.width / box.height;
    let w = right - left;
    let h = bottom - top;
    if (w / aspect > h) h = w / aspect;
    else w = h * aspect;
    if (handle.includes('w')) left = right - w;
    else right = left + w;
    if (handle.includes('n')) top = bottom - h;
    else bottom = top + h;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/**
 * Resizing a rotated shape: the handle's opposite corner must stay fixed on screen. Returns the new
 * unrotated box whose rotated version keeps that anchor in place.
 */
export function resizeRotatedBox(
  box: Box,
  rotation: number,
  handle: BoxHandle,
  worldDelta: Point,
  keepAspect: boolean,
  minSize = 2,
): Box {
  const local = rotatePoint(worldDelta, { x: 0, y: 0 }, -rotation);
  const next = resizeBox(box, handle, local, keepAspect, minSize);
  // Anchor: the opposite point, in world space, before and after.
  const ax = handle.includes('w') ? 1 : handle.includes('e') ? 0 : 0.5;
  const ay = handle.includes('n') ? 1 : handle.includes('s') ? 0 : 0.5;
  const anchorBefore = rotatePoint(
    { x: box.x + box.width * ax, y: box.y + box.height * ay },
    boxCenter(box),
    rotation,
  );
  const anchorAfter = rotatePoint(
    { x: next.x + next.width * ax, y: next.y + next.height * ay },
    boxCenter(next),
    rotation,
  );
  return {
    ...next,
    x: next.x + anchorBefore.x - anchorAfter.x,
    y: next.y + anchorBefore.y - anchorAfter.y,
  };
}

/* ── Rotate / flip with the photo ─────────────────────────────────────── */

/** Carries shapes along when the photo turns 90° (`1` = clockwise). `size` = oriented size before. */
export function rotateAnnotations(
  shapes: readonly Shape[],
  size: Size,
  direction: 1 | -1,
): Shape[] {
  const map = (p: Point): Point =>
    direction === 1 ? { x: size.height - p.y, y: p.x } : { x: p.y, y: size.width - p.x };
  return shapes.map((shape) => {
    if (shape.type === 'line') return { ...shape, points: shape.points.map(map) as [Point, Point] };
    if (shape.type === 'path') return { ...shape, points: shape.points.map(map) };
    // Box shapes: move the centre, keep the box, and turn it with the photo.
    const box = getShapeBox(shape);
    const c = map(boxCenter(box));
    return {
      ...shape,
      x: c.x - box.width / 2,
      y: c.y - box.height / 2,
      rotation: normalizeDegrees(shape.rotation + 90 * direction),
    };
  });
}

/**
 * Mirrors shape positions when the photo is flipped. Text and images move and mirror their angle
 * but are never drawn mirrored, so they stay readable.
 */
export function flipAnnotations(shapes: readonly Shape[], size: Size, axis: 'x' | 'y'): Shape[] {
  const map = (p: Point): Point =>
    axis === 'x' ? { x: size.width - p.x, y: p.y } : { x: p.x, y: size.height - p.y };
  return shapes.map((shape) => {
    const rotation = normalizeDegrees(-shape.rotation);
    if (shape.type === 'line')
      return { ...shape, rotation, points: shape.points.map(map) as [Point, Point] };
    if (shape.type === 'path') return { ...shape, rotation, points: shape.points.map(map) };
    const box = getShapeBox(shape);
    const c = map(boxCenter(box));
    return { ...shape, rotation, x: c.x - box.width / 2, y: c.y - box.height / 2 };
  });
}

export function normalizeDegrees(degrees: number): number {
  const d = ((degrees % 360) + 360) % 360;
  return d > 180 ? d - 360 : d + 0; // `+ 0` turns -0 into 0
}

/** A readable layer name, e.g. "Text: Hello" or "Rectangle". */
export function defaultShapeName(shape: Shape): string {
  switch (shape.type) {
    case 'rect':
      return 'Rectangle';
    case 'ellipse':
      return 'Ellipse';
    case 'line':
      return shape.endCap === 'arrow' || shape.startCap === 'arrow' ? 'Arrow' : 'Line';
    case 'path':
      return shape.smooth ? 'Drawing' : 'Polygon';
    case 'text':
      return `Text: ${shape.text.split('\n')[0]!.slice(0, 24) || '…'}`;
    case 'image':
      return 'Image';
  }
}

export function createShapeId(): string {
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
