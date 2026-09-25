import { boxCenter } from '../state/annotations';
import type { Affine } from '../state/geometry';
import { createCanvas } from './createRenderer';
import {
  redactBlockSize,
  redactBlurRadius,
  redactionBounds,
  redactionCorners,
  type Redaction,
} from '../state/redactions';
import { tracePath } from '../state/strokes';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface DrawRedactionsOptions {
  /** Oriented px → context px. Must be a scale + translation (no rotation), as in the editor. */
  transform: Affine;
  /** The image's short side in oriented px (`redactReference`): strength is relative to it. */
  reference: number;
}

/**
 * Hides each area of the rendered image in `ctx`. `source` is that same rendered image (a canvas
 * or bitmap in context pixels): every area is copied from it, pixelated / blurred / filled, masked
 * to the box or brush stroke and drawn back — so the result keeps no trace of the original pixels.
 * Browser only.
 */
export function drawRedactions(
  ctx: Context2D,
  source: CanvasImageSource,
  redactions: readonly Redaction[],
  { transform, reference }: DrawRedactionsOptions,
): void {
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  const [sx, , , sy, tx, ty] = transform;
  const scale = Math.abs(sx);

  for (const r of redactions) {
    // Area bounds in context px (around the rotated outline), clamped to the canvas.
    const blur = r.style === 'blur' ? redactBlurRadius(r.strength, reference) * scale : 0;
    const corners = redactionCorners(r).map((p) => ({ x: sx * p.x + tx, y: sy * p.y + ty }));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const x0 = Math.floor(Math.max(0, Math.min(...xs)));
    const y0 = Math.floor(Math.max(0, Math.min(...ys)));
    const x1 = Math.ceil(Math.min(canvasWidth, Math.max(...xs)));
    const y1 = Math.ceil(Math.min(canvasHeight, Math.max(...ys)));
    const width = x1 - x0;
    const height = y1 - y0;
    if (width < 1 || height < 1) continue;

    const area = createCanvas(width, height);
    const actx = area.getContext('2d') as Context2D | null;
    if (!actx) continue;

    if (r.style === 'solid') {
      actx.fillStyle = r.color;
      actx.fillRect(0, 0, width, height);
    } else if (r.style === 'pixelate') {
      // Average into blocks (high-quality downscale), then blow them up with hard edges.
      const block = Math.max(2, redactBlockSize(r.strength, reference) * scale);
      const cols = Math.max(1, Math.ceil(width / block));
      const rows = Math.max(1, Math.ceil(height / block));
      const small = createCanvas(cols, rows);
      const sctx = small.getContext('2d') as Context2D | null;
      if (!sctx) continue;
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(source, x0, y0, cols * block, rows * block, 0, 0, cols, rows);
      actx.imageSmoothingEnabled = false;
      actx.drawImage(small, 0, 0, cols * block, rows * block);
    } else {
      blurInto(actx, source, x0, y0, width, height, blur, canvasWidth, canvasHeight);
    }

    // Keep only the area's shape.
    actx.globalCompositeOperation = 'destination-in';
    actx.setTransform(sx, 0, 0, sy, tx - x0, ty - y0);
    if (r.rotation) {
      const c = boxCenter(redactionBounds(r));
      actx.translate(c.x, c.y);
      actx.rotate((r.rotation * Math.PI) / 180);
      actx.translate(-c.x, -c.y);
    }
    actx.fillStyle = '#000';
    actx.strokeStyle = '#000';
    if (r.kind === 'box') {
      actx.fillRect(r.x, r.y, r.width, r.height);
    } else {
      actx.lineCap = 'round';
      actx.lineJoin = 'round';
      actx.lineWidth = r.size;
      actx.beginPath();
      tracePath(actx, r.points.length === 1 ? [r.points[0]!, r.points[0]!] : r.points, true, false);
      actx.stroke();
    }

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(area, x0, y0);
    ctx.restore();
  }
}

/**
 * Blurs the source region into `actx` (0,0 = region's top-left). Downscales by about half the
 * radius and scales back up smoothly; where the browser supports `ctx.filter`, a Gaussian blur on
 * the way up makes it soft instead of blocky.
 */
function blurInto(
  actx: Context2D,
  source: CanvasImageSource,
  x0: number,
  y0: number,
  width: number,
  height: number,
  radius: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  // Sample a margin around the area so the blur near its edge uses real neighbours.
  const pad = Math.ceil(radius * 2);
  const px0 = Math.max(0, x0 - pad);
  const py0 = Math.max(0, y0 - pad);
  const px1 = Math.min(canvasWidth, x0 + width + pad);
  const py1 = Math.min(canvasHeight, y0 + height + pad);
  const pw = px1 - px0;
  const ph = py1 - py0;
  const factor = Math.max(1, radius / 2);
  const small = createCanvas(
    Math.max(1, Math.round(pw / factor)),
    Math.max(1, Math.round(ph / factor)),
  );
  const sctx = small.getContext('2d') as Context2D | null;
  if (!sctx) return;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(source, px0, py0, pw, ph, 0, 0, small.width, small.height);
  actx.imageSmoothingEnabled = true;
  actx.imageSmoothingQuality = 'high';
  if ('filter' in actx) actx.filter = `blur(${Math.max(1, radius / 2)}px)`;
  actx.drawImage(small, px0 - x0, py0 - y0, pw, ph);
  if ('filter' in actx) actx.filter = 'none';
}
