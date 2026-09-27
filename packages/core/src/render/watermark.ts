import type { WatermarkState } from '../state/watermark';
import type { Size } from '../types';
import { createCanvas } from './createRenderer';
import { textDirection } from './textDirection';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Box = { x: number; y: number; width: number; height: number };

/** Tile angle (degrees, counter-clockwise) and spacing between marks (× the mark's height). */
const TILE_ANGLE = -30;
const TILE_GAP = 1.2;
/** Text is measured at this size, then scaled. */
const MEASURE_PX = 100;

export function watermarkFont(w: Pick<WatermarkState, 'fontWeight' | 'fontFamily'>, px: number) {
  return `${w.fontWeight} ${px}px ${w.fontFamily}`;
}

let measurer: Context2D | null = null;

/**
 * Width ÷ height of the mark: text measured in its font, a logo from its pixel size. `null` when
 * there is nothing to draw (empty text, logo not loaded).
 */
export function watermarkAspect(
  watermark: WatermarkState,
  logo?: { width: number; height: number },
): number | null {
  if (watermark.kind === 'image') {
    return logo && logo.width > 0 && logo.height > 0 ? logo.width / logo.height : null;
  }
  if (!watermark.text.trim()) return null;
  measurer ??= createCanvas(1, 1).getContext('2d') as Context2D | null;
  if (!measurer) return null;
  measurer.font = watermarkFont(watermark, MEASURE_PX);
  return Math.max(0.1, measurer.measureText(watermark.text).width / MEASURE_PX);
}

/**
 * Height of the mark at `size` = 1 (100 %): as large as fits inside the margin; tile marks are half
 * that. Resizing on the photo divides by this to get `size`.
 */
export function watermarkFullHeight(watermark: WatermarkState, size: Size, aspect: number): number {
  const margin = watermark.margin * Math.min(size.width, size.height);
  const fit = Math.min(size.height - margin * 2, (size.width - margin * 2) / aspect);
  return Math.max(1, fit * (watermark.position === 'tile' ? 0.5 : 1));
}

function markHeight(watermark: WatermarkState, size: Size, aspect: number): number {
  return Math.max(1, watermark.size * watermarkFullHeight(watermark, size, aspect));
}

/**
 * Where the mark sits on a `size` output (not for `tile`): one of the nine spots inside the
 * margin, or centred on `x`/`y` (kept inside the photo) for `custom`.
 */
export function layoutWatermark(watermark: WatermarkState, size: Size, aspect: number): Box {
  const height = markHeight(watermark, size, aspect);
  const width = height * aspect;
  const margin = watermark.margin * Math.min(size.width, size.height);
  if (watermark.position === 'custom' || watermark.position === 'tile') {
    const x = watermark.x * size.width - width / 2;
    const y = watermark.y * size.height - height / 2;
    return {
      x: Math.min(Math.max(x, 0), Math.max(0, size.width - width)),
      y: Math.min(Math.max(y, 0), Math.max(0, size.height - height)),
      width,
      height,
    };
  }
  const [col, row] = anchor(watermark.position);
  const x = col === 0 ? margin : col === 1 ? (size.width - width) / 2 : size.width - margin - width;
  const y =
    row === 0 ? margin : row === 1 ? (size.height - height) / 2 : size.height - margin - height;
  return { x, y, width, height };
}

/**
 * Draws the watermark on a `size` output (the context's transform maps output px to its px).
 * `logo` is the decoded asset for an image watermark; without it an image watermark draws nothing.
 */
export function drawWatermark(
  ctx: Context2D,
  watermark: WatermarkState,
  size: Size,
  logo?: CanvasImageSource & { width: number; height: number },
): void {
  const aspect = watermarkAspect(watermark, logo);
  if (aspect === null) return;
  const height = markHeight(watermark, size, aspect);
  const width = height * aspect;

  const drawAt = (x: number, y: number) => {
    // (x, y) = top-left of the mark.
    if (watermark.kind === 'image') ctx.drawImage(logo!, x, y, width, height);
    else ctx.fillText(watermark.text, x, y + height / 2);
  };

  ctx.save();
  if (watermark.kind === 'text') {
    // Arabic / Hebrew reads right-to-left; the text still starts at the mark's left edge ('start'
    // would mean the right edge in right-to-left).
    ctx.direction = textDirection(watermark.text);
    ctx.textAlign = 'left';
  }
  ctx.globalAlpha = watermark.opacity;
  ctx.fillStyle = watermark.color;
  ctx.textBaseline = 'middle';
  ctx.font = watermarkFont(watermark, height);

  if (watermark.position === 'tile') {
    // A tilted brick pattern of marks, large enough to cover the output at any angle.
    ctx.beginPath();
    ctx.rect(0, 0, size.width, size.height);
    ctx.clip();
    ctx.translate(size.width / 2, size.height / 2);
    ctx.rotate((TILE_ANGLE * Math.PI) / 180);
    const stepX = width + height * TILE_GAP * 2;
    const stepY = height * (1 + TILE_GAP * 2);
    const reach = Math.hypot(size.width, size.height) / 2 + Math.max(stepX, stepY);
    let row = 0;
    for (let y = -reach; y <= reach; y += stepY, row++) {
      const offset = row % 2 === 0 ? 0 : stepX / 2;
      for (let x = -reach - offset; x <= reach; x += stepX) drawAt(x, y);
    }
  } else {
    const box = layoutWatermark(watermark, size, aspect);
    if (watermark.rotation) {
      // Turn around the mark's centre.
      ctx.translate(box.x + width / 2, box.y + height / 2);
      ctx.rotate((watermark.rotation * Math.PI) / 180);
      drawAt(-width / 2, -height / 2);
    } else {
      drawAt(box.x, box.y);
    }
  }
  ctx.restore();
}

/** Column / row of a spot: 0 = start, 1 = middle, 2 = end. */
function anchor(
  position: Exclude<WatermarkState['position'], 'tile' | 'custom'>,
): [number, number] {
  const col = position.endsWith('left') ? 0 : position.endsWith('right') ? 2 : 1;
  const row = position.startsWith('top') ? 0 : position.startsWith('bottom') ? 2 : 1;
  return [col, row];
}
