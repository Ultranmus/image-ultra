import type { Point, Size } from '../types';

/**
 * Freehand stroke helpers shared by the pen tool and the brush/mask tool (used by the future
 * AI eraser): point simplification and smooth path building.
 */

/** Ramer–Douglas–Peucker simplification; `tolerance` in the points' units. */
export function simplifyPoints(points: readonly Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    const a = points[start]!;
    const b = points[end]!;
    let maxDist = -1;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i]!, a, b);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance && index > 0) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]).map((p) => ({ ...p }));
}

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / len;
}

/** Minimal 2D path sink — both `CanvasRenderingContext2D` and `Path2D` satisfy it. */
export interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  closePath(): void;
}

/**
 * Traces `points` into `sink`: straight segments, or a smooth curve through the midpoints
 * (quadratic, passes through the ends) when `smooth` is true.
 */
export function tracePath(
  sink: PathSink,
  points: readonly Point[],
  smooth: boolean,
  closed: boolean,
): void {
  if (points.length === 0) return;
  const first = points[0]!;
  sink.moveTo(first.x, first.y);
  if (points.length === 1) {
    sink.lineTo(first.x + 0.01, first.y);
    return;
  }
  if (!smooth || points.length < 3) {
    for (let i = 1; i < points.length; i++) sink.lineTo(points[i]!.x, points[i]!.y);
    if (closed) sink.closePath();
    return;
  }
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i]!;
    const next = points[i + 1]!;
    sink.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
  }
  const last = points[points.length - 1]!;
  sink.lineTo(last.x, last.y);
  if (closed) sink.closePath();
}

/** A brush stroke for masks: centre line + diameter. */
export interface MaskStroke {
  points: Point[];
  size: number;
  /** `erase` removes from the mask. */
  mode: 'paint' | 'erase';
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Draws mask strokes into a 2D context as white-on-transparent (alpha = mask). The context's
 * transform maps stroke coordinates to its pixels. Browser only.
 */
export function drawMask(ctx: Context2D, strokes: readonly MaskStroke[]): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const stroke of strokes) {
    ctx.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    tracePath(ctx, stroke.points, true, false);
    ctx.stroke();
  }
  ctx.restore();
}

/** Rasterises mask strokes at `size` into alpha (0…255 per pixel). Browser only. */
export function rasterizeMask(strokes: readonly MaskStroke[], size: Size): Uint8ClampedArray {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('image-ultra: no 2D canvas context available.');
  drawMask(ctx, strokes);
  const rgba = ctx.getImageData(0, 0, size.width, size.height).data;
  const alpha = new Uint8ClampedArray(size.width * size.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3]!;
  return alpha;
}
