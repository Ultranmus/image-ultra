import { loadImage } from '../loader/loadImage';
import {
  boxCenter,
  getShapeBox,
  rotatePoint,
  type LineShape,
  type Shape,
  type TextShape,
} from '../state/annotations';
import type { EditState } from '../state/editState';
import {
  compose,
  getCropRect,
  getOutputSize,
  scale,
  translate,
  type Affine,
} from '../state/geometry';
import { tracePath } from '../state/strokes';
import type { LoadedImage, Point } from '../types';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Oriented px → output px (crop offset, then the resize scale). */
export function getOrientedToOutput(
  image: LoadedImage | { width: number; height: number },
  state: EditState,
): Affine {
  const crop = getCropRect(image, state.geometry);
  const output = getOutputSize(image, state);
  return compose(
    scale(output.width / crop.width, output.height / crop.height),
    translate(-crop.x, -crop.y),
  );
}

/* ── Text layout ───────────────────────────────────────────────────────── */

export function textFont(
  shape: Pick<TextShape, 'fontStyle' | 'fontWeight' | 'fontSize' | 'fontFamily'>,
): string {
  return `${shape.fontStyle} ${shape.fontWeight} ${shape.fontSize}px ${shape.fontFamily}`;
}

interface Measurer {
  font: string;
  measureText(text: string): { width: number };
}

let sharedMeasurer: Measurer | null = null;

function measurer(): Measurer | null {
  if (sharedMeasurer) return sharedMeasurer;
  if (typeof OffscreenCanvas !== 'undefined')
    sharedMeasurer = new OffscreenCanvas(1, 1).getContext('2d');
  else if (typeof document !== 'undefined')
    sharedMeasurer = document.createElement('canvas').getContext('2d');
  return sharedMeasurer;
}

export interface TextLayout {
  lines: string[];
  lineHeight: number;
  height: number;
}

/** Word-wraps a text shape to its width. Long words break by character. */
export function layoutText(shape: TextShape, measure: Measurer | null = measurer()): TextLayout {
  const lineHeight = shape.fontSize * shape.lineHeight;
  const lines: string[] = [];
  if (!measure) {
    const paragraphs = shape.text.split('\n');
    return { lines: paragraphs, lineHeight, height: Math.max(1, paragraphs.length) * lineHeight };
  }
  measure.font = textFont(shape);
  const fits = (s: string) => measure.measureText(s).width <= shape.width + 0.5;
  for (const paragraph of shape.text.split('\n')) {
    const words = paragraph.split(/(\s+)/).filter((w) => w.length > 0);
    let line = '';
    for (const word of words) {
      const candidate = line + word;
      if (fits(candidate) || line.trim() === '') {
        if (!fits(candidate) && line.trim() === '') {
          // A single word wider than the box: break it by characters.
          let chunk = line;
          for (const char of word) {
            if (fits(chunk + char) || chunk === '') chunk += char;
            else {
              lines.push(chunk);
              chunk = char;
            }
          }
          line = chunk;
        } else {
          line = candidate;
        }
      } else {
        lines.push(line.trimEnd());
        line = word.trimStart();
      }
    }
    lines.push(line.trimEnd());
  }
  return { lines, lineHeight, height: Math.max(1, lines.length) * lineHeight };
}

/** Height of a text shape's box (wrapped). */
export function measureTextHeight(shape: TextShape): number {
  return layoutText(shape).height;
}

/**
 * Index in `shape.text` closest to `point` (oriented px), e.g. to put the caret where the user
 * clicked. Follows the same wrapping, alignment and rotation as the drawn text.
 */
export function textIndexAt(shape: TextShape, point: Point): number {
  const measure = measurer();
  const layout = layoutText(shape, measure);
  const box = getShapeBox(shape, layout.height);
  const p = rotatePoint(point, boxCenter(box), -shape.rotation);
  const lastRow = Math.max(0, layout.lines.length - 1);
  const row = Math.min(Math.max(Math.floor((p.y - box.y) / layout.lineHeight), 0), lastRow);

  // Wrapped lines drop the spaces they broke at: find each one's start in the original text.
  let start = 0;
  let cursor = 0;
  for (let i = 0; i <= row; i++) {
    const found = shape.text.indexOf(layout.lines[i] ?? '', cursor);
    start = found >= 0 ? found : cursor;
    cursor = start + (layout.lines[i]?.length ?? 0);
  }
  const line = layout.lines[row] ?? '';
  if (measure) measure.font = textFont(shape);
  const width = (text: string) =>
    measure ? measure.measureText(text).width : text.length * shape.fontSize * 0.55;
  const lineWidth = width(line);
  const left =
    shape.align === 'center'
      ? box.x + (box.width - lineWidth) / 2
      : shape.align === 'right'
        ? box.x + box.width - lineWidth
        : box.x;
  const x = p.x - left;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i <= line.length; i++) {
    const distance = Math.abs(width(line.slice(0, i)) - x);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return start + best;
}

/* ── Assets & fonts ────────────────────────────────────────────────────── */

const assetCache = new Map<string, Promise<ImageBitmap | null>>();

/** Decodes an asset's image once (cached by source); `null` if it can't be loaded. */
export function loadAssetBitmap(src: string): Promise<ImageBitmap | null> {
  let pending = assetCache.get(src);
  if (!pending) {
    pending = loadImage(src).then(
      (img) => img.bitmap,
      () => null,
    );
    assetCache.set(src, pending);
  }
  return pending;
}

/** Loads every image used by image shapes (cached by source). */
export async function loadAnnotationAssets(state: EditState): Promise<Map<string, ImageBitmap>> {
  const result = new Map<string, ImageBitmap>();
  await Promise.all(
    state.annotations.map(async (shape) => {
      if (shape.type !== 'image') return;
      const asset = state.assets[shape.assetId];
      if (!asset) return;
      const bitmap = await loadAssetBitmap(asset.src);
      if (bitmap) result.set(shape.assetId, bitmap);
    }),
  );
  return result;
}

/** Waits until the fonts used by text shapes are loaded (so exports never use a fallback font). */
export async function ensureAnnotationFonts(shapes: readonly Shape[]): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  const fonts = new Set(
    shapes.filter((s): s is TextShape => s.type === 'text').map((s) => textFont(s)),
  );
  await Promise.all([...fonts].map((font) => document.fonts.load(font).catch(() => [])));
}

/* ── Drawing ───────────────────────────────────────────────────────────── */

export interface DrawAnnotationsOptions {
  /** Oriented px → canvas px. */
  transform: Affine;
  assets?: ReadonlyMap<string, CanvasImageSource>;
  /** Shape ids to leave out (e.g. the text currently being edited in place). */
  skip?: ReadonlySet<string>;
}

/** Draws shapes bottom → top. The context's clip (e.g. round crop) is respected. */
export function drawAnnotations(
  ctx: Context2D,
  shapes: readonly Shape[],
  options: DrawAnnotationsOptions,
): void {
  for (const shape of shapes) {
    if (shape.hidden || options.skip?.has(shape.id) || shape.opacity <= 0) continue;
    ctx.save();
    ctx.setTransform(...options.transform);
    ctx.globalAlpha = shape.opacity;
    const box = getShapeBox(shape, shape.type === 'text' ? measureTextHeight(shape) : undefined);
    if (shape.rotation) {
      const c = boxCenter(box);
      ctx.translate(c.x, c.y);
      ctx.rotate((shape.rotation * Math.PI) / 180);
      ctx.translate(-c.x, -c.y);
    }
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    switch (shape.type) {
      case 'rect':
        ctx.beginPath();
        roundRect(ctx, shape.x, shape.y, shape.width, shape.height, shape.cornerRadius);
        paintShape(ctx, shape.fill, shape.stroke, shape.strokeWidth);
        break;
      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse(
          shape.x + shape.width / 2,
          shape.y + shape.height / 2,
          shape.width / 2,
          shape.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        paintShape(ctx, shape.fill, shape.stroke, shape.strokeWidth);
        break;
      case 'path':
        ctx.beginPath();
        tracePath(ctx, shape.points, shape.smooth, shape.closed);
        paintShape(ctx, shape.closed ? shape.fill : null, shape.stroke, shape.strokeWidth);
        break;
      case 'line':
        drawLine(ctx, shape);
        break;
      case 'text':
        drawText(ctx, shape);
        break;
      case 'image': {
        const source = options.assets?.get(shape.assetId);
        if (source) ctx.drawImage(source, shape.x, shape.y, shape.width, shape.height);
        break;
      }
    }
    ctx.restore();
  }
}

function paintShape(
  ctx: Context2D,
  fill: string | null,
  stroke: string | null,
  width: number,
): void {
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke && width > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function roundRect(ctx: Context2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  if (radius === 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Arrow head length for a stroke width (also used by hit areas in the UI). */
export function arrowHeadLength(strokeWidth: number): number {
  return Math.max(8, strokeWidth * 4);
}

function drawLine(ctx: Context2D, shape: LineShape): void {
  const [a, b] = shape.points;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const head = Math.min(arrowHeadLength(shape.strokeWidth), len * 0.45);
  // Stop the line under the arrow heads so the tip stays sharp.
  const start: Point =
    shape.startCap === 'arrow' ? { x: a.x + ux * head * 0.6, y: a.y + uy * head * 0.6 } : a;
  const end: Point =
    shape.endCap === 'arrow' ? { x: b.x - ux * head * 0.6, y: b.y - uy * head * 0.6 } : b;
  ctx.strokeStyle = shape.stroke;
  ctx.fillStyle = shape.stroke;
  ctx.lineWidth = shape.strokeWidth;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  const capAt = (tip: Point, dx: number, dy: number, cap: LineShape['startCap']) => {
    if (cap === 'arrow') {
      const wing = head * 0.55;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - dx * head - dy * wing, tip.y - dy * head + dx * wing);
      ctx.lineTo(tip.x - dx * head + dy * wing, tip.y - dy * head - dx * wing);
      ctx.closePath();
      ctx.fill();
    } else if (cap === 'circle') {
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, shape.strokeWidth * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  capAt(b, ux, uy, shape.endCap);
  capAt(a, -ux, -uy, shape.startCap);
}

function drawText(ctx: Context2D, shape: TextShape): void {
  const layout = layoutText(shape);
  if (shape.background) {
    const pad = shape.fontSize * 0.25;
    ctx.beginPath();
    roundRect(
      ctx,
      shape.x - pad,
      shape.y - pad,
      shape.width + pad * 2,
      layout.height + pad * 2,
      shape.fontSize * 0.2,
    );
    ctx.fillStyle = shape.background;
    ctx.fill();
  }
  ctx.font = textFont(shape);
  ctx.fillStyle = shape.color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = shape.align;
  const x =
    shape.align === 'left'
      ? shape.x
      : shape.align === 'center'
        ? shape.x + shape.width / 2
        : shape.x + shape.width;
  layout.lines.forEach((line, i) => {
    ctx.fillText(line, x, shape.y + layout.lineHeight * (i + 0.5));
  });
}
