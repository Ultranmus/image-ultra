import { loadImage } from '../loader/loadImage';
import { cleanExif, insertJpegExif } from './exif';
import { createEditState, parseEditState, type EditState } from '../state/editState';
import {
  compose,
  getOrientedSize,
  getOutputSize,
  getOutputToSource,
  getPhotoRect,
  IDENTITY,
  mat3Apply,
  scale as scaleBy,
  translate,
  type Mat3,
} from '../state/geometry';
import type { Rect } from '../state/editState';
import { detailSigmas } from '../render/color';
import { redactReference } from '../state/redactions';
import {
  ensureAnnotationFonts,
  getOrientedToOutput,
  loadAnnotationAssets,
  loadAssetBitmap,
} from '../render/annotations';
import { drawBackground, drawFrame } from '../render/frame';
import { drawWatermark, watermarkFont } from '../render/watermark';
import type { WatermarkState } from '../state/watermark';
import { canvasToBlob, createCanvas, createRenderer } from '../render/createRenderer';
import { drawRedactions } from '../render/redactions';
import { drawElements, redactElements } from '../render/elements';
import type { AnyCanvas, Renderer, RendererKind } from '../render/renderer';
import type { ImageSource, LoadedImage, Size } from '../types';

/** Output formats: JPEG, PNG or WebP. */
export type ExportMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

/** How an export is encoded and sized. */
export interface ExportOptions {
  /** Default: the source type when it's PNG/JPEG/WebP, otherwise PNG. */
  mimeType?: ExportMimeType;
  /** 0…1 for JPEG/WebP. Default 0.92 (JPEG) / 0.9 (WebP). */
  quality?: number;
  /** Scale the result down (never up) to fit these bounds. */
  maxWidth?: number;
  maxHeight?: number;
  /** File name without extension. Default: the source name, else `image`. */
  fileName?: string;
  /** Fills transparent areas for formats without alpha (JPEG). Default `#ffffff`. */
  background?: string;
  /** Force a renderer; default tries WebGL2 then Canvas2D. */
  renderer?: RendererKind | 'auto';
  /**
   * Keep the photo's EXIF (camera, lens, date, copyright…) — JPEG to JPEG only. Default `false`:
   * exports carry no metadata. GPS location is removed even when `true`; pass
   * `{ location: true }` to keep it too. The embedded thumbnail and maker notes are never kept,
   * orientation is reset (the pixels are already turned) and the size fields are updated.
   */
  keepMetadata?: boolean | { location?: boolean };
  /**
   * @internal Testing only: always render in tiles of this many output px (normally tiles are
   * used only above the GPU's limits).
   */
  tileSize?: number;
}

/** The exported image, its size and type, and the edits that produced it. */
export interface ExportResult {
  blob: Blob;
  width: number;
  height: number;
  /** The type actually produced (browsers may fall back to PNG for unsupported types). */
  mimeType: string;
  /** File name with extension, e.g. `photo-edited.jpg`. */
  fileName: string;
  /** The edits that produced this image — store it to re-open the editor later. */
  state: EditState;
  renderer: RendererKind;
  /**
   * The result is smaller than asked for: the browser can't hold a canvas that big (e.g. ~16 MP
   * on iPhones, ~268 MP on desktop browsers), so it was scaled down to fit.
   */
  downscaled: boolean;
}

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

/** A rendered result on a 2D canvas, before encoding. */
export interface RenderedCanvas {
  canvas: AnyCanvas;
  width: number;
  height: number;
  renderer: RendererKind;
  /** Smaller than asked for (see `ExportResult.downscaled`). */
  downscaled: boolean;
}

/**
 * Renders the edited image onto a 2D canvas (WebGL2 first, Canvas2D fallback).
 * `background` flattens transparency (used for JPEG). Browser only.
 */
export async function renderToCanvas(
  image: LoadedImage,
  state: EditState,
  options: Pick<ExportOptions, 'maxWidth' | 'maxHeight' | 'renderer'> & {
    background?: string;
    /** @internal Testing only (see `ExportOptions.tileSize`). */
    tileSize?: number;
  } = {},
): Promise<RenderedCanvas> {
  const full = getOutputSize(image, state);
  const kinds: RendererKind[] =
    options.renderer === 'webgl2' || options.renderer === 'canvas2d'
      ? [options.renderer]
      : ['webgl2', 'canvas2d'];

  let lastError: unknown = null;
  for (const kind of kinds) {
    const canvas = createCanvas(1, 1);
    let renderer;
    try {
      renderer = createRenderer(canvas, {
        prefer: kind,
        preserveDrawingBuffer: true,
        ownsCanvas: true,
      });
    } catch (error) {
      lastError = error;
      continue;
    }
    try {
      // Full size (or the app's max size) — scaled down only if the browser can't hold it.
      const wanted = fitOutput(full, options);
      const { size, scale, canvas: target } = fitCanvas(full, wanted.scale);
      const downscaled = size.width < wanted.size.width || size.height < wanted.size.height;
      // The photo pass lands on a 2D canvas: a uniform encoder, and room for the 2D layers below.
      let out = target;
      let ctx = context2d(out);
      await drawPhoto(ctx, renderer, canvas, image, state, size, scale, options.tileSize);

      const transform = compose(scaleBy(scale), getOrientedToOutput(image, state));
      // The round crop is the photo's ellipse (inside any added canvas space).
      const photo = getPhotoRect(image, state, scale);
      const roundClip = (c: Context2D) => {
        if (state.geometry.cropShape !== 'ellipse') return;
        c.beginPath();
        c.ellipse(
          photo.x + photo.width / 2,
          photo.y + photo.height / 2,
          photo.width / 2,
          photo.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        c.clip();
      };

      const reference = redactReference(getOrientedSize(image, state.geometry));

      // 1. Every redaction area hides the photo under it, inside a round crop. (The Fill's blur
      //    samples this, so hidden content can't leak through it.)
      const redacts = redactElements(state.annotations);
      if (redacts.length > 0) {
        ctx.save();
        roundClip(ctx);
        drawRedactions(ctx, out, redacts, { transform, reference });
        ctx.restore();
      }

      // 2. Fill underneath, or flatten for JPEG.
      if (options.background && !state.background) {
        // Colour behind the photo on the same canvas: a second full-size canvas would double the
        // memory (a 48MP JPEG went over iPhones' ~384 MB canvas budget — DECISIONS #104).
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = options.background;
        ctx.fillRect(0, 0, size.width, size.height);
        ctx.restore();
      } else if (state.background) {
        const flat = createCanvas(size.width, size.height);
        const fctx = context2d(flat);
        if (options.background) {
          fctx.fillStyle = options.background;
          fctx.fillRect(0, 0, size.width, size.height);
        }
        const asset =
          state.background.kind === 'image' ? state.assets[state.background.assetId] : undefined;
        const bitmap = asset ? await loadAssetBitmap(asset.src) : null;
        drawBackground(fctx, state.background, size, {
          result: out,
          ...(bitmap && { image: bitmap }),
        });
        fctx.drawImage(out, 0, 0);
        releaseCanvas(out);
        out = flat;
        ctx = fctx;
      }

      // 3. The frame, on the photo (elements can sit over it).
      if (state.frame) drawFrame(ctx, state.frame, size);

      // 4. Elements in order on their own layer (a redaction area also hides the elements below
      //    it), with the watermark at its place — 5. or on top of everything.
      let drawMark: ((c: Context2D) => void) | null = null;
      if (state.watermark) {
        const wm = state.watermark;
        const asset = wm.kind === 'image' && wm.assetId ? state.assets[wm.assetId] : undefined;
        const logo = asset ? await loadAssetBitmap(asset.src) : null;
        if (wm.kind === 'text') await ensureWatermarkFont(wm);
        drawMark = (c) => drawWatermark(c, wm, size, logo ?? undefined);
      }
      let markDrawn = false;
      if (state.annotations.length > 0) {
        const [assets] = await Promise.all([
          loadAnnotationAssets(state),
          ensureAnnotationFonts(state.annotations),
        ]);
        const layer = createCanvas(size.width, size.height);
        const lctx = context2d(layer);
        lctx.save();
        // With added canvas space, shapes may sit on that space: no round clip then.
        if (!state.canvas) roundClip(lctx);
        const mark = drawMark;
        markDrawn = drawElements(lctx, state.annotations, {
          transform,
          assets,
          reference,
          drawWatermark: mark ? () => mark(lctx) : undefined,
        }).watermarkDrawn;
        lctx.restore();
        ctx.drawImage(layer, 0, 0);
        releaseCanvas(layer);
      }
      if (drawMark && !markDrawn) drawMark(ctx);

      return {
        canvas: out,
        width: size.width,
        height: size.height,
        renderer: renderer.kind,
        downscaled,
      };
    } catch (error) {
      lastError = error;
    } finally {
      renderer.dispose();
      releaseCanvas(canvas);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('image-ultra: rendering failed.');
}

/** Renders the edited image at full quality and encodes it. Browser only. */
export async function exportImage(
  image: LoadedImage,
  state: EditState,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const mimeType = options.mimeType ?? defaultMimeType(image.mimeType);
  const quality =
    options.quality ??
    (mimeType === 'image/jpeg' ? 0.92 : mimeType === 'image/webp' ? 0.9 : undefined);
  const rendered = await renderToCanvas(image, state, {
    ...options,
    ...(mimeType === 'image/jpeg' && { background: options.background ?? '#ffffff' }),
  });
  let blob: Blob;
  try {
    blob = await canvasToBlob(rendered.canvas, mimeType, quality);
  } finally {
    releaseCanvas(rendered.canvas);
  }
  const actualType = blob.type || mimeType;
  if (options.keepMetadata && image.exif && actualType === 'image/jpeg') {
    const exif = cleanExif(image.exif, {
      width: rendered.width,
      height: rendered.height,
      location: typeof options.keepMetadata === 'object' && options.keepMetadata.location === true,
    });
    if (exif) {
      const bytes = insertJpegExif(new Uint8Array(await blob.arrayBuffer()), exif);
      blob = new Blob([bytes], { type: actualType });
    }
  }
  const baseName = options.fileName ?? image.name ?? 'image';
  return {
    blob,
    width: rendered.width,
    height: rendered.height,
    mimeType: actualType,
    fileName: `${baseName}.${EXTENSIONS[actualType] ?? 'png'}`,
    state,
    renderer: rendered.renderer,
    downscaled: rendered.downscaled,
  };
}

/**
 * Headless rendering: apply a saved `EditState` to an image without any UI.
 * `state` may be an `EditState` or untrusted JSON (it is validated).
 */
export async function renderImage(
  source: ImageSource | LoadedImage,
  state?: EditState | unknown,
  options: ExportOptions = {},
): Promise<ExportResult> {
  const edit = state === undefined ? createEditState() : parseEditState(state);
  const owned = !isLoadedImage(source);
  const image = isLoadedImage(source) ? source : await loadImage(source);
  try {
    return await exportImage(image, edit, options);
  } finally {
    if (owned) image.bitmap.close();
  }
}

function isLoadedImage(value: unknown): value is LoadedImage {
  return typeof value === 'object' && value !== null && 'bitmap' in value && 'width' in value;
}

function defaultMimeType(source: string | null): ExportMimeType {
  return source === 'image/jpeg' || source === 'image/webp' ? source : 'image/png';
}

/** Output size after `maxWidth`/`maxHeight` and the renderer's hard limit. */
export function fitOutput(
  full: Size,
  options: Pick<ExportOptions, 'maxWidth' | 'maxHeight'>,
  hardLimit = Infinity,
): { size: Size; scale: number } {
  const scale = Math.min(
    1,
    (options.maxWidth ?? Infinity) / full.width,
    (options.maxHeight ?? Infinity) / full.height,
    hardLimit / full.width,
    hardLimit / full.height,
  );
  return {
    scale,
    size: {
      width: Math.max(1, Math.round(full.width * scale)),
      height: Math.max(1, Math.round(full.height * scale)),
    },
  };
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Frees a canvas's pixels now (width / height 0) instead of whenever it's garbage collected —
 * Safari counts canvas memory until then.
 */
function releaseCanvas(canvas: AnyCanvas): void {
  canvas.width = 0;
  canvas.height = 0;
}

/** Canvases up to this size work in every browser (iOS Safari's area limit); no probe needed. */
const SAFE_CANVAS_AREA = 16_777_216;
const SAFE_CANVAS_SIDE = 8192;

/**
 * The output canvas at `scale`, or scaled down until the browser can hold it. Browsers don't
 * report their limit, so a big canvas is probed: draw its last pixel and read it back.
 */
function fitCanvas(full: Size, wanted: number): { size: Size; scale: number; canvas: AnyCanvas } {
  let scale = wanted;
  for (let attempt = 0; ; attempt++) {
    const size = {
      width: Math.max(1, Math.round(full.width * scale)),
      height: Math.max(1, Math.round(full.height * scale)),
    };
    const canvas = usableCanvas(size, attempt >= 20);
    if (canvas) return { size, scale, canvas };
    scale *= 0.85;
  }
}

function usableCanvas({ width, height }: Size, force: boolean): AnyCanvas | null {
  const safe = width * height <= SAFE_CANVAS_AREA && Math.max(width, height) <= SAFE_CANVAS_SIDE;
  try {
    const canvas = createCanvas(width, height);
    if (safe || force) return canvas;
    const ctx = canvas.getContext('2d') as Context2D | null;
    if (!ctx) return null;
    ctx.fillStyle = '#000';
    ctx.fillRect(width - 1, height - 1, 1, 1);
    const ok = ctx.getImageData(width - 1, height - 1, 1, 1).data[3] === 255;
    ctx.clearRect(width - 1, height - 1, 1, 1);
    return ok ? canvas : null;
  } catch {
    return null;
  }
}

/**
 * The photo pass (geometry + colour + detail + finish) onto `ctx`. One render when it fits the
 * renderer; otherwise in tiles (Phase 7.7d): each tile is rendered with a margin wide enough for
 * blur / sharpen / clarity, so no seams show, and — when the source is above the texture limit —
 * uploads only the part of the photo it shows. Vignette and grain use output positions, so they
 * line up across tiles.
 */
async function drawPhoto(
  ctx: Context2D,
  renderer: Renderer,
  rendered: AnyCanvas,
  image: LoadedImage,
  state: EditState,
  size: Size,
  scale: number,
  tileSize: number | undefined,
): Promise<void> {
  const common = {
    image,
    state,
    outputSize: size,
    outputScale: scale,
    checker: null,
    smooth: true,
  };
  const bigSource = Math.max(image.width, image.height) > renderer.maxTextureSize;
  // Above ~16.7 MP the GPU's own drawing surface is kept tile-sized too: iPhones allow ~384 MB of
  // canvases per page, and a 48MP output plus a 48MP drawing surface is already 384 MB.
  const bigOutput =
    Math.max(size.width, size.height) > renderer.maxOutputSize ||
    size.width * size.height > SAFE_CANVAS_AREA;
  if (tileSize === undefined && !bigSource && !bigOutput) {
    await renderer.prepare(image);
    renderer.render({ ...common, canvasSize: size, canvasToOutput: IDENTITY });
    ctx.drawImage(rendered, 0, 0);
    return;
  }

  const limit = renderer.maxOutputSize;
  const margin = Math.min(tileMargin(state, size), roundDown4((limit - 256) / 2));
  const inner = tileSize ?? Math.max(256, Math.min(2048, roundDown4(limit - 2 * margin)));
  // WebGL tiles upload only their part of the photo — never a second full-size copy of it (the
  // preview already holds one).
  const partial = renderer.kind === 'webgl2';
  if (!partial) await renderer.prepare(image);
  const toSource = getOutputToSource(image, state, scale);

  for (let y = 0; y < size.height; y += inner) {
    for (let x = 0; x < size.width; x += inner) {
      const w = Math.min(inner, size.width - x);
      const h = Math.min(inner, size.height - y);
      // The margin stops at the output's edges: there the canvas edge is the output edge, as in a
      // one-pass render (blurs repeat the edge pixel instead of mixing in empty space).
      const x0 = Math.max(0, x - margin);
      const y0 = Math.max(0, y - margin);
      const box = {
        x: x0,
        y: y0,
        width: Math.min(size.width, x + w + margin) - x0,
        height: Math.min(size.height, y + h + margin) - y0,
      };
      let source: { bitmap: ImageBitmap; rect: Rect } | undefined;
      if (partial) {
        const rect = sourceRect(toSource, box, image);
        if (!rect) continue; // no photo in this tile
        const k = Math.min(1, renderer.maxTextureSize / Math.max(rect.width, rect.height));
        const bitmap = await createImageBitmap(
          image.bitmap,
          rect.x,
          rect.y,
          rect.width,
          rect.height,
          k < 1
            ? {
                resizeWidth: Math.max(1, Math.floor(rect.width * k)),
                resizeHeight: Math.max(1, Math.floor(rect.height * k)),
                resizeQuality: 'high',
              }
            : {},
        );
        source = { bitmap, rect };
      }
      try {
        renderer.render({
          ...common,
          ...(source && { source }),
          canvasSize: { width: box.width, height: box.height },
          canvasToOutput: translate(box.x, box.y),
        });
        ctx.drawImage(rendered, x - x0, y - y0, w, h, x, y, w, h);
      } finally {
        source?.bitmap.close();
      }
    }
  }
}

/** Output px a tile needs around it: 3σ of the widest detail blur (multiple of 4: blur grids). */
function tileMargin(state: EditState, size: Size): number {
  const sigmas = detailSigmas(state.finetune, size);
  const sigma = Math.max(sigmas.sharpen, sigmas.clarity, sigmas.blur);
  return Math.max(4, Math.ceil((3 * sigma + 4) / 4) * 4);
}

function roundDown4(n: number): number {
  return Math.max(0, Math.floor(n / 4) * 4);
}

/** Source px under an output box (bounding box of its corners, +2 px for filtering), or null. */
function sourceRect(toSource: Mat3, box: Rect, image: Size): Rect | null {
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.width, y: box.y },
    { x: box.x, y: box.y + box.height },
    { x: box.x + box.width, y: box.y + box.height },
  ].map((p) => mat3Apply(toSource, p));
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))) - 2);
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))) - 2);
  const x1 = Math.min(image.width, Math.ceil(Math.max(...corners.map((p) => p.x))) + 2);
  const y1 = Math.min(image.height, Math.ceil(Math.max(...corners.map((p) => p.y))) + 2);
  if (!(x1 > x0 && y1 > y0)) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function context2d(canvas: AnyCanvas): Context2D {
  const ctx = canvas.getContext('2d') as Context2D | null;
  if (!ctx) throw new Error('image-ultra: no 2D canvas context available.');
  return ctx;
}

/** Loads the watermark's font first, so the export never falls back to another font. */
async function ensureWatermarkFont(wm: WatermarkState): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;
  // Loading needs the family and weight; the size doesn't matter.
  await document.fonts.load(watermarkFont(wm, 16)).catch(() => []);
}
