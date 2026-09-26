import { loadImage } from '../loader/loadImage';
import { createEditState, parseEditState, type EditState } from '../state/editState';
import {
  compose,
  getOrientedSize,
  getOutputSize,
  IDENTITY,
  scale as scaleBy,
} from '../state/geometry';
import { redactReference } from '../state/redactions';
import {
  drawAnnotations,
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
import type { AnyCanvas, RendererKind } from '../render/renderer';
import type { ImageSource, LoadedImage, Size } from '../types';

export type ExportMimeType = 'image/png' | 'image/jpeg' | 'image/webp';

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
}

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
      const { size, scale } = fitOutput(full, options, renderer.maxOutputSize);
      await renderer.prepare(image);
      renderer.render({
        image,
        state,
        canvasSize: size,
        outputSize: size,
        outputScale: scale,
        canvasToOutput: IDENTITY,
        checker: null,
        smooth: true,
      });
      // Copy onto a 2D canvas: a uniform encoder, and room for the 2D layers below.
      let out = createCanvas(size.width, size.height);
      let ctx = context2d(out);
      ctx.drawImage(canvas, 0, 0);

      const transform = compose(scaleBy(scale), getOrientedToOutput(image, state));
      const roundClip = (c: Context2D) => {
        if (state.geometry.cropShape !== 'ellipse') return;
        c.beginPath();
        c.ellipse(
          size.width / 2,
          size.height / 2,
          size.width / 2,
          size.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        c.clip();
      };

      // 1. Redactions (from the rendered pixels), inside a round crop.
      if (state.redactions.length > 0) {
        ctx.save();
        roundClip(ctx);
        drawRedactions(ctx, out, state.redactions, {
          transform,
          reference: redactReference(getOrientedSize(image, state.geometry)),
        });
        ctx.restore();
      }

      // 2. Fill underneath (its blur uses the already redacted result), or flatten for JPEG.
      if (state.background || options.background) {
        const flat = createCanvas(size.width, size.height);
        const fctx = context2d(flat);
        if (options.background) {
          fctx.fillStyle = options.background;
          fctx.fillRect(0, 0, size.width, size.height);
        }
        if (state.background) {
          const asset =
            state.background.kind === 'image' ? state.assets[state.background.assetId] : undefined;
          const bitmap = asset ? await loadAssetBitmap(asset.src) : null;
          drawBackground(fctx, state.background, size, {
            result: out,
            ...(bitmap && { image: bitmap }),
          });
        }
        fctx.drawImage(out, 0, 0);
        out = flat;
        ctx = fctx;
      }

      // 3. Vector annotations (sharp at any size), inside a round crop.
      if (state.annotations.length > 0) {
        const [assets] = await Promise.all([
          loadAnnotationAssets(state),
          ensureAnnotationFonts(state.annotations),
        ]);
        ctx.save();
        roundClip(ctx);
        drawAnnotations(ctx, state.annotations, { transform, assets });
        ctx.restore();
      }

      // 4. The frame, then 5. the watermark on top of everything.
      if (state.frame) drawFrame(ctx, state.frame, size);
      if (state.watermark) {
        const wm = state.watermark;
        const asset = wm.kind === 'image' && wm.assetId ? state.assets[wm.assetId] : undefined;
        const logo = asset ? await loadAssetBitmap(asset.src) : null;
        if (wm.kind === 'text') await ensureWatermarkFont(wm);
        drawWatermark(ctx, wm, size, logo ?? undefined);
      }

      return { canvas: out, width: size.width, height: size.height, renderer: renderer.kind };
    } catch (error) {
      lastError = error;
    } finally {
      renderer.dispose();
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
  const blob = await canvasToBlob(rendered.canvas, mimeType, quality);
  const actualType = blob.type || mimeType;
  const baseName = options.fileName ?? image.name ?? 'image';
  return {
    blob,
    width: rendered.width,
    height: rendered.height,
    mimeType: actualType,
    fileName: `${baseName}.${EXTENSIONS[actualType] ?? 'png'}`,
    state,
    renderer: rendered.renderer,
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
