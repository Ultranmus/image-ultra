import { isNeutralFinetune } from '../state/editState';
import {
  applyToPoint,
  getOutputToSource,
  invert,
  isAffine,
  mat3Apply,
  mat3Compose,
  mat3Invert,
  mat3ToAffine,
  type Affine,
  type Mat3,
} from '../state/geometry';
import type { Point, Size } from '../types';
import { applyFinetune } from './color';
import type { AnyCanvas, CheckerStyle, Renderer, RenderParams } from './renderer';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Grid used to approximate perspective with affine triangles (fallback only). */
const WARP_GRID = 20;

/** Canvas2D fallback: same output as WebGL2, colour work done on the CPU (slower). */
export class Canvas2DRenderer implements Renderer {
  readonly kind = 'canvas2d' as const;
  /** Conservative limit that works on every browser, incl. iOS Safari. */
  readonly maxOutputSize = 8192;
  private readonly ctx: Context2D;
  private checkerCache: { key: string; pattern: CanvasPattern } | null = null;

  constructor(private readonly canvas: AnyCanvas) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true }) as Context2D | null;
    if (!ctx) throw new Error('image-ultra: no 2D canvas context available.');
    this.ctx = ctx;
  }

  isReady(): boolean {
    return true;
  }

  async prepare(): Promise<void> {}

  render(params: RenderParams): void {
    const { ctx, canvas } = this;
    const { canvasSize, outputSize, image, state, canvasToOutput } = params;
    if (canvas.width !== canvasSize.width) canvas.width = canvasSize.width;
    if (canvas.height !== canvasSize.height) canvas.height = canvasSize.height;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvasSize.width, canvasSize.height);

    const outputToCanvas = invert(canvasToOutput);
    const sourceToCanvas = mat3Compose(
      outputToCanvas,
      mat3Invert(getOutputToSource(image, state, params.outputScale)),
    );
    const quad = [
      { x: 0, y: 0 },
      { x: image.width, y: 0 },
      { x: image.width, y: image.height },
      { x: 0, y: image.height },
    ].map((p) => mat3Apply(sourceToCanvas, p));
    const ellipse = state.geometry.cropShape === 'ellipse';

    // 1. Geometry: draw the source clipped to the output shape.
    ctx.save();
    clipOutput(ctx, outputToCanvas, outputSize, ellipse);
    ctx.imageSmoothingEnabled = params.smooth;
    ctx.imageSmoothingQuality = 'high';
    if (isAffine(sourceToCanvas)) {
      ctx.setTransform(...mat3ToAffine(sourceToCanvas));
      ctx.drawImage(image.bitmap, 0, 0, image.width, image.height);
    } else {
      drawWarped(ctx, image.bitmap, image, sourceToCanvas);
    }
    ctx.restore();

    // 2. Colour: CPU pass over the visible output area.
    if (!isNeutralFinetune(state.finetune)) {
      const box = visibleBox(outputToCanvas, outputSize, canvasSize);
      if (box) {
        const pixels = ctx.getImageData(box.x, box.y, box.width, box.height);
        applyFinetune(pixels.data, box.width, box.height, state.finetune, (x, y) => {
          const o = applyToPoint(canvasToOutput, { x: x + box.x, y: y + box.y });
          if (o.x < 0 || o.y < 0 || o.x > outputSize.width || o.y > outputSize.height) return null;
          return [o.x / outputSize.width, o.y / outputSize.height];
        });
        ctx.putImageData(pixels, box.x, box.y);
      }
    }

    // 3. Checkerboard behind transparent pixels — only where the image is (preview only).
    if (params.checker) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      clipOutput(ctx, outputToCanvas, outputSize, false);
      clipPolygon(ctx, quad);
      ctx.fillStyle = this.checkerPattern(params.checker);
      ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
      ctx.restore();
    }
  }

  dispose(): void {
    this.checkerCache = null;
  }

  private checkerPattern(style: CheckerStyle): CanvasPattern | string {
    const key = `${style.a}|${style.b}|${style.size}`;
    if (this.checkerCache?.key === key) return this.checkerCache.pattern;
    const size = Math.max(1, Math.round(style.size));
    const tile = new OffscreenCanvas(size * 2, size * 2);
    const tctx = tile.getContext('2d');
    if (!tctx) return style.a;
    tctx.fillStyle = style.a;
    tctx.fillRect(0, 0, size * 2, size * 2);
    tctx.fillStyle = style.b;
    tctx.fillRect(size, 0, size, size);
    tctx.fillRect(0, size, size, size);
    const pattern = this.ctx.createPattern(tile, 'repeat');
    if (!pattern) return style.a;
    this.checkerCache = { key, pattern };
    return pattern;
  }
}

/** Clips to the output rectangle (or inscribed ellipse). Leaves the transform at identity. */
function clipOutput(ctx: Context2D, outputToCanvas: Affine, output: Size, ellipse: boolean): void {
  ctx.setTransform(...outputToCanvas);
  ctx.beginPath();
  if (ellipse) {
    const rx = output.width / 2;
    const ry = output.height / 2;
    ctx.ellipse(rx, ry, rx, ry, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(0, 0, output.width, output.height);
  }
  ctx.clip();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function clipPolygon(ctx: Context2D, points: Point[]): void {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
}

/**
 * Draws `bitmap` through a projective transform by splitting it into small triangles, each drawn
 * with its own affine transform. Triangles are grown by half a pixel to hide seams.
 */
function drawWarped(ctx: Context2D, bitmap: ImageBitmap, image: Size, sourceToCanvas: Mat3): void {
  const cw = image.width / WARP_GRID;
  const ch = image.height / WARP_GRID;
  const at = (i: number, j: number): Point => ({ x: i * cw, y: j * ch });
  const grid: Point[][] = [];
  for (let j = 0; j <= WARP_GRID; j++) {
    const row: Point[] = [];
    for (let i = 0; i <= WARP_GRID; i++) row.push(mat3Apply(sourceToCanvas, at(i, j)));
    grid.push(row);
  }
  for (let j = 0; j < WARP_GRID; j++) {
    for (let i = 0; i < WARP_GRID; i++) {
      const d00 = grid[j]![i]!;
      const d10 = grid[j]![i + 1]!;
      const d11 = grid[j + 1]![i + 1]!;
      const d01 = grid[j + 1]![i]!;
      const cell = { x: i * cw, y: j * ch, width: cw, height: ch };
      drawTriangle(
        ctx,
        bitmap,
        image,
        cell,
        [at(i, j), at(i + 1, j), at(i + 1, j + 1)],
        [d00, d10, d11],
      );
      drawTriangle(
        ctx,
        bitmap,
        image,
        cell,
        [at(i, j), at(i + 1, j + 1), at(i, j + 1)],
        [d00, d11, d01],
      );
    }
  }
}

function drawTriangle(
  ctx: Context2D,
  bitmap: ImageBitmap,
  image: Size,
  cell: { x: number; y: number; width: number; height: number },
  src: [Point, Point, Point],
  dst: [Point, Point, Point],
): void {
  const transform = triangleAffine(src, dst);
  if (!transform) return;
  const cx = (dst[0].x + dst[1].x + dst[2].x) / 3;
  const cy = (dst[0].y + dst[1].y + dst[2].y) / 3;
  const grow = (p: Point): Point => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dx / len) * 0.5, y: p.y + (dy / len) * 0.5 };
  };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  clipPolygon(ctx, dst.map(grow));
  ctx.setTransform(...transform);
  // Only the cell (plus a 1px margin) is drawn — much faster than the whole bitmap.
  const x0 = Math.max(0, Math.floor(cell.x - 1));
  const y0 = Math.max(0, Math.floor(cell.y - 1));
  const x1 = Math.min(image.width, Math.ceil(cell.x + cell.width + 1));
  const y1 = Math.min(image.height, Math.ceil(cell.y + cell.height + 1));
  ctx.drawImage(bitmap, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  ctx.restore();
}

/** Affine transform mapping triangle `src` onto triangle `dst`. */
function triangleAffine(src: [Point, Point, Point], dst: [Point, Point, Point]): Affine | null {
  const [p0, p1, p2] = src;
  const [q0, q1, q2] = dst;
  const x1 = p1.x - p0.x;
  const y1 = p1.y - p0.y;
  const x2 = p2.x - p0.x;
  const y2 = p2.y - p0.y;
  const det = x1 * y2 - x2 * y1;
  if (Math.abs(det) < 1e-9) return null;
  const u1 = q1.x - q0.x;
  const v1 = q1.y - q0.y;
  const u2 = q2.x - q0.x;
  const v2 = q2.y - q0.y;
  const a = (u1 * y2 - u2 * y1) / det;
  const c = (u2 * x1 - u1 * x2) / det;
  const b = (v1 * y2 - v2 * y1) / det;
  const d = (v2 * x1 - v1 * x2) / det;
  return [a, b, c, d, q0.x - a * p0.x - c * p0.y, q0.y - b * p0.x - d * p0.y];
}

/** Integer canvas-pixel box covering the output rectangle, clipped to the canvas. */
function visibleBox(
  outputToCanvas: Affine,
  output: Size,
  canvas: Size,
): { x: number; y: number; width: number; height: number } | null {
  const corners = [
    applyToPoint(outputToCanvas, { x: 0, y: 0 }),
    applyToPoint(outputToCanvas, { x: output.width, y: 0 }),
    applyToPoint(outputToCanvas, { x: 0, y: output.height }),
    applyToPoint(outputToCanvas, { x: output.width, y: output.height }),
  ];
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))));
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))));
  const x1 = Math.min(canvas.width, Math.ceil(Math.max(...corners.map((p) => p.x))));
  const y1 = Math.min(canvas.height, Math.ceil(Math.max(...corners.map((p) => p.y))));
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}
