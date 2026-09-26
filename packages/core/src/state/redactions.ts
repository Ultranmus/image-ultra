import type { Point, Size } from '../types';
import {
  boxCenter,
  distanceToSegment,
  normalizeDegrees,
  pointsBox,
  rotatePoint,
  type Box,
} from './annotations';
import { finite, isRecord, num, paint, points as parsePoints } from './parseAnnotations';

/**
 * Redactions hide parts of the photo (faces, plates, names). They live in oriented space, like
 * annotations, and are drawn after the colour pipeline and before annotations (DECISIONS #68).
 */
export type RedactStyle = 'pixelate' | 'blur' | 'solid';

interface RedactionBase {
  id: string;
  style: RedactStyle;
  /** 0…1: block size (pixelate) or blur radius, relative to the image's short side. */
  strength: number;
  /** Fill colour for `solid`. */
  color: string;
  /** Degrees clockwise around the centre of the area's bounds. 0 = upright. */
  rotation: number;
}

/** A rectangular area. */
export interface RedactBox extends RedactionBase {
  kind: 'box';
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A painted area: a round brush along `points`, `size` = diameter (oriented px). */
export interface RedactBrush extends RedactionBase {
  kind: 'brush';
  points: Point[];
  size: number;
}

export type Redaction = RedactBox | RedactBrush;

export const REDACT_STYLES = [
  'pixelate',
  'blur',
  'solid',
] as const satisfies readonly RedactStyle[];

export const DEFAULT_REDACT_STRENGTH = 0.5;
export const DEFAULT_REDACT_COLOR = '#000000';

/** Pixelate block size in oriented px. `ref` = the image's short side (see `redactReference`). */
export function redactBlockSize(strength: number, ref: number): number {
  return Math.max(2, ref * (0.008 + 0.05 * strength));
}

/** Blur radius in oriented px. */
export function redactBlurRadius(strength: number, ref: number): number {
  return Math.max(1, ref * (0.004 + 0.03 * strength));
}

/** Short side of the oriented image: sizes stay the same when the crop changes. */
export function redactReference(orientedSize: Size): number {
  return Math.min(orientedSize.width, orientedSize.height);
}

/** The area's box before rotation (brush: includes the brush radius). */
export function redactionBounds(r: Redaction): Box {
  if (r.kind === 'box') return { x: r.x, y: r.y, width: r.width, height: r.height };
  const box = pointsBox(r.points);
  const half = r.size / 2;
  return {
    x: box.x - half,
    y: box.y - half,
    width: box.width + r.size,
    height: box.height + r.size,
  };
}

export function hitTestRedaction(r: Redaction, point: Point, tolerance: number): boolean {
  // Test in the area's own (unrotated) frame.
  const p = r.rotation ? rotatePoint(point, boxCenter(redactionBounds(r)), -r.rotation) : point;
  if (r.kind === 'box') {
    return (
      p.x >= r.x - tolerance &&
      p.x <= r.x + r.width + tolerance &&
      p.y >= r.y - tolerance &&
      p.y <= r.y + r.height + tolerance
    );
  }
  const reach = r.size / 2 + tolerance;
  if (r.points.length === 1) {
    const only = r.points[0]!;
    return Math.hypot(p.x - only.x, p.y - only.y) <= reach;
  }
  for (let i = 1; i < r.points.length; i++) {
    if (distanceToSegment(p, r.points[i - 1]!, r.points[i]!) <= reach) return true;
  }
  return false;
}

/** The four corners of the (rotated) outline: top-left, top-right, bottom-right, bottom-left. */
export function redactionCorners(r: Redaction): [Point, Point, Point, Point] {
  const b = redactionBounds(r);
  const c = boxCenter(b);
  return [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ].map((p) => rotatePoint(p, c, r.rotation)) as [Point, Point, Point, Point];
}

/** Topmost area at `p`, or `null`. */
export function redactionAt(
  list: readonly Redaction[],
  p: Point,
  tolerance: number,
): Redaction | null {
  for (let i = list.length - 1; i >= 0; i--) {
    if (hitTestRedaction(list[i]!, p, tolerance)) return list[i]!;
  }
  return null;
}

export function moveRedaction<T extends Redaction>(r: T, dx: number, dy: number): T {
  if (r.kind === 'box') return { ...r, x: r.x + dx, y: r.y + dy };
  return { ...r, points: r.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
}

/**
 * Gives the area new outer bounds (as from `redactionBounds`): a box takes them as they are, a
 * brush stroke is scaled to fit (its width scales with the average of the two stretch factors).
 */
export function resizeRedaction<T extends Redaction>(r: T, bounds: Box): T {
  if (r.kind === 'box') return { ...r, ...bounds };
  const old = redactionBounds(r);
  const sx = old.width > 0 ? bounds.width / old.width : 1;
  const sy = old.height > 0 ? bounds.height / old.height : 1;
  const size = Math.max(1, r.size * Math.sqrt(sx * sy));
  // Fit the stroke's centre line into the new bounds minus the new radius, so the outline
  // lands exactly on `bounds`.
  const half = size / 2;
  const from = pointsBox(r.points);
  const to = {
    x: bounds.x + half,
    y: bounds.y + half,
    width: Math.max(0, bounds.width - size),
    height: Math.max(0, bounds.height - size),
  };
  const map = (v: number, a: number, aw: number, b: number, bw: number) =>
    aw > 0 ? b + ((v - a) / aw) * bw : b + bw / 2;
  return {
    ...r,
    points: r.points.map((p) => ({
      x: map(p.x, from.x, from.width, to.x, to.width),
      y: map(p.y, from.y, from.height, to.y, to.height),
    })),
    size,
  };
}

/**
 * Carries areas along when the photo turns 90° (`1` = clockwise). `size` = oriented size before.
 * The centre moves with the photo; a box swaps its sides (same as turning it 90°), angles stay.
 */
export function rotateRedactions(
  list: readonly Redaction[],
  size: Size,
  direction: 1 | -1,
): Redaction[] {
  const map = (p: Point): Point =>
    direction === 1 ? { x: size.height - p.y, y: p.x } : { x: p.y, y: size.width - p.x };
  return list.map((r) => {
    if (r.kind === 'brush') return { ...r, points: r.points.map(map) };
    const c = map(boxCenter(redactionBounds(r)));
    return { ...r, x: c.x - r.height / 2, y: c.y - r.width / 2, width: r.height, height: r.width };
  });
}

/** Mirrors areas when the photo is flipped (`size` = oriented size); angles mirror too. */
export function flipRedactions(
  list: readonly Redaction[],
  size: Size,
  axis: 'x' | 'y',
): Redaction[] {
  const map = (p: Point): Point =>
    axis === 'x' ? { x: size.width - p.x, y: p.y } : { x: p.x, y: size.height - p.y };
  return list.map((r) => {
    const rotation = normalizeDegrees(-r.rotation);
    if (r.kind === 'brush') return { ...r, rotation, points: r.points.map(map) };
    const c = map(boxCenter(redactionBounds(r)));
    return { ...r, rotation, x: c.x - r.width / 2, y: c.y - r.height / 2 };
  });
}

/** Validates untrusted JSON; broken areas are dropped, fields get defaults. */
export function parseRedactions(input: unknown): Redaction[] {
  if (!Array.isArray(input)) return [];
  const list: Redaction[] = [];
  const seen = new Set<string>();
  for (const item of input.slice(0, 1000)) {
    const r = parseRedaction(item);
    if (r && !seen.has(r.id)) {
      seen.add(r.id);
      list.push(r);
    }
  }
  return list;
}

export function parseRedaction(input: unknown): Redaction | null {
  if (!isRecord(input) || typeof input['id'] !== 'string') return null;
  const style = REDACT_STYLES.find((s) => s === input['style']) ?? 'pixelate';
  const base = {
    id: input['id'].slice(0, 80),
    style,
    strength: num(input['strength'], DEFAULT_REDACT_STRENGTH, 0, 1),
    color: paint(input['color']) ?? DEFAULT_REDACT_COLOR,
    rotation: num(input['rotation'], 0, -360, 360),
  };
  if (input['kind'] === 'box') {
    const x = finite(input['x']);
    const y = finite(input['y']);
    const width = finite(input['width']);
    const height = finite(input['height']);
    if (x === null || y === null || !width || !height || width <= 0 || height <= 0) return null;
    return { ...base, kind: 'box', x, y, width, height };
  }
  if (input['kind'] === 'brush') {
    const pts = parsePoints(input['points']);
    if (!pts || pts.length === 0) return null;
    return {
      ...base,
      kind: 'brush',
      points: pts.slice(0, 20000),
      size: num(input['size'], 20, 1, 100000),
    };
  }
  return null;
}
