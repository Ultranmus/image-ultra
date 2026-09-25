import type { BackgroundState, FrameState } from '../state/frame';
import type { Size } from '../types';
import { createCanvas } from './createRenderer';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Draws the frame over the edges of a `size` output. The context's transform maps output px to
 * its own px (identity for export). Used by the preview, export and the Frame thumbnails.
 */
export function drawFrame(ctx: Context2D, frame: FrameState, size: Size): void {
  const { width: w, height: h } = size;
  const t = Math.max(1, frame.size * Math.min(w, h));
  ctx.save();
  ctx.fillStyle = frame.color;
  ctx.strokeStyle = frame.color;
  switch (frame.style) {
    case 'border':
      band(ctx, w, h, t, t, t, t, 0);
      break;
    case 'rounded':
      band(ctx, w, h, t, t, t, t, t * 2);
      break;
    case 'polaroid':
      band(ctx, w, h, t, t, t * 3.5, t, 0);
      break;
    case 'bevel': {
      // A raised band: light falls on the top and left, shade on the bottom and right.
      band(ctx, w, h, t, t, t, t, 0);
      const side = (points: [number, number][], shade: string) => {
        ctx.fillStyle = shade;
        ctx.beginPath();
        points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
        ctx.fill();
      };
      const light = 'rgba(255, 255, 255, 0.35)';
      const dark = 'rgba(0, 0, 0, 0.35)';
      side(
        [
          [0, 0],
          [w, 0],
          [w - t, t],
          [t, t],
        ],
        light,
      );
      side(
        [
          [0, 0],
          [t, t],
          [t, h - t],
          [0, h],
        ],
        light,
      );
      side(
        [
          [0, h],
          [t, h - t],
          [w - t, h - t],
          [w, h],
        ],
        dark,
      );
      side(
        [
          [w, 0],
          [w, h],
          [w - t, h - t],
          [w - t, t],
        ],
        dark,
      );
      break;
    }
    case 'inset':
    case 'plus':
    case 'lumber': {
      // Four separate edge lines: short of the corners (inset), crossing a little past them
      // (plus), or running edge to edge (lumber).
      const inset = t * 1.5;
      ctx.lineWidth = Math.max(1, t * 0.25);
      const extend =
        frame.style === 'inset' ? -t * 1.2 : frame.style === 'plus' ? t * 0.8 : Infinity;
      const x0 = Math.max(0, inset - extend);
      const x1 = Math.min(w, w - inset + extend);
      const y0 = Math.max(0, inset - extend);
      const y1 = Math.min(h, h - inset + extend);
      ctx.beginPath();
      ctx.moveTo(x0, inset);
      ctx.lineTo(x1, inset);
      ctx.moveTo(x0, h - inset);
      ctx.lineTo(x1, h - inset);
      ctx.moveTo(inset, y0);
      ctx.lineTo(inset, y1);
      ctx.moveTo(w - inset, y0);
      ctx.lineTo(w - inset, y1);
      ctx.stroke();
      break;
    }
    case 'line': {
      ctx.lineWidth = Math.max(1, t * 0.25);
      const inset = t * 1.5;
      ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
      break;
    }
    case 'double': {
      ctx.lineWidth = Math.max(1, t * 0.2);
      for (const inset of [t, t * 1.8]) ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
      break;
    }
    case 'corners': {
      const inset = t;
      const arm = Math.min(t * 4, Math.min(w, h) / 3);
      ctx.lineWidth = Math.max(1, t * 0.35);
      ctx.lineCap = 'square';
      ctx.beginPath();
      for (const [x, y, dx, dy] of [
        [inset, inset, 1, 1],
        [w - inset, inset, -1, 1],
        [w - inset, h - inset, -1, -1],
        [inset, h - inset, 1, -1],
      ] as const) {
        ctx.moveTo(x + dx * arm, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + dy * arm);
      }
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/** The area between the outer edge and an inner (optionally rounded) rectangle. */
function band(
  ctx: Context2D,
  w: number,
  h: number,
  top: number,
  right: number,
  bottom: number,
  left: number,
  radius: number,
): void {
  const iw = Math.max(0, w - left - right);
  const ih = Math.max(0, h - top - bottom);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  if (radius > 0 && 'roundRect' in ctx) {
    ctx.roundRect(left, top, iw, ih, Math.min(radius, iw / 2, ih / 2));
  } else {
    ctx.rect(left, top, iw, ih);
  }
  ctx.fill('evenodd');
}

export interface DrawBackgroundOptions {
  /** The result itself (for `blur`), already in output px layout. */
  result: CanvasImageSource & { width: number; height: number };
  /** Source rectangle of the result inside `result` (default: all of it). */
  resultRect?: { x: number; y: number; width: number; height: number };
  /** Decoded image for `image` backgrounds, if loaded. */
  image?: CanvasImageSource & { width: number; height: number };
}

/**
 * Fills the output area (`size`, in the context's transformed px) with the background: a colour,
 * an image scaled to cover, or a heavily blurred, slightly enlarged copy of the result.
 */
export function drawBackground(
  ctx: Context2D,
  background: BackgroundState,
  size: Size,
  { result, resultRect, image }: DrawBackgroundOptions,
): void {
  const { width: w, height: h } = size;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  if (background.kind === 'color') {
    ctx.fillStyle = background.color;
    ctx.fillRect(0, 0, w, h);
  } else if (background.kind === 'image' && image) {
    const k = Math.max(w / image.width, h / image.height);
    const iw = image.width * k;
    const ih = image.height * k;
    ctx.drawImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih);
  } else if (background.kind === 'blur') {
    // The solid middle of the result (clear of round-crop corners), shrunk to ~1/16 and scaled
    // back up smoothly to cover the output: a strong, deterministic blur with no empty edges.
    const full = resultRect ?? { x: 0, y: 0, width: result.width, height: result.height };
    const inner = 0.7;
    const src = {
      x: full.x + (full.width * (1 - inner)) / 2,
      y: full.y + (full.height * (1 - inner)) / 2,
      width: full.width * inner,
      height: full.height * inner,
    };
    const small = createCanvas(
      Math.max(2, Math.round(src.width / 16)),
      Math.max(2, Math.round(src.height / 16)),
    );
    const sctx = small.getContext('2d') as Context2D | null;
    if (sctx) {
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(result, src.x, src.y, src.width, src.height, 0, 0, small.width, small.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(small, 0, 0, w, h);
    }
  }
  ctx.restore();
}
