import type { EditState, Rect } from '../state/editState';
import type { Affine } from '../state/geometry';
import type { LoadedImage, Size } from '../types';

export type RendererKind = 'webgl2' | 'canvas2d';
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface CheckerStyle {
  /** Any CSS colour. */
  a: string;
  b: string;
  /** Square size in canvas (device) pixels. */
  size: number;
  /**
   * Also behind the parts of the output with no image (space added around the photo). Default:
   * only where the image is — e.g. the crop view, where the stage shows around the photo.
   */
  coverOutput?: boolean;
}

export interface RenderParams {
  image: LoadedImage;
  state: EditState;
  /** Canvas backing-store size in device pixels. */
  canvasSize: Size;
  /** Size of the (possibly scaled) output in output pixels. */
  outputSize: Size;
  /** Output pixels per crop pixel: 1 = full resolution. */
  outputScale: number;
  /** Canvas pixel (y down) → output pixel. Identity when exporting. */
  canvasToOutput: Affine;
  /** Draw a transparency checkerboard behind the image (preview only). */
  checker: CheckerStyle | null;
  /** `false` shows crisp pixels (nearest neighbour) — used when zoomed far in. */
  smooth: boolean;
  /**
   * The photo's area in output px — vignette and the round crop are measured on it. Default: the
   * crop inside any added canvas space (`getPhotoRect`). The crop view passes the crop here.
   */
  photoRect?: Rect;
  /**
   * Nothing is drawn outside the photo rectangle, so added canvas space stays empty (and never
   * shows the cropped-away image). Default `true`; the crop view turns it off to show everything.
   */
  clipToPhoto?: boolean;
  /**
   * Draw from this bitmap, which holds only `rect` of the source image (in source px, possibly
   * scaled down): a tile's part of the photo in tiled exports, or the preview's smaller copy of a
   * big photo. Canvas2D uses it only without perspective.
   */
  source?: { bitmap: ImageBitmap; rect: Rect };
}

export interface Renderer {
  readonly kind: RendererKind;
  /** Resolves when `image` can be drawn (e.g. texture prepared). Safe to call repeatedly. */
  prepare(image: LoadedImage): Promise<void>;
  isReady(image: LoadedImage): boolean;
  render(params: RenderParams): void;
  /** Largest output width/height this renderer can produce in one pass. */
  readonly maxOutputSize: number;
  /** Largest source image side it can sample without scaling it down (`Infinity` = no limit). */
  readonly maxTextureSize: number;
  dispose(): void;
}

export interface CreateRendererOptions {
  /** Force a renderer. `'auto'` (default) tries WebGL2 first. */
  prefer?: RendererKind | 'auto';
  /** Keep the drawing buffer after rendering (needed to read pixels back, e.g. export). */
  preserveDrawingBuffer?: boolean;
  /**
   * The renderer owns the canvas and may destroy its GPU context on `dispose()`.
   * Leave `false` for on-screen canvases that can be re-used (e.g. React StrictMode remounts).
   */
  ownsCanvas?: boolean;
  /**
   * Premultiplied canvas output. Use `true` for on-screen previews that always draw the checkerboard
   * (every pixel is fully opaque or fully transparent, so it looks identical) — it avoids a slow
   * GPU read-back when the browser composites the canvas. Exports need `false` (the default) to keep
   * exact colours in semi-transparent pixels.
   */
  premultipliedAlpha?: boolean;
}

/** Parses any CSS colour into 0…1 RGB using the browser's own parser. */
export function cssColorToRgb(color: string): [number, number, number] {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (hex) return hexToRgb(hex[1]!);
  if (typeof document === 'undefined') return [0, 0, 0];
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return [0, 0, 0];
  ctx.fillStyle = '#000';
  ctx.fillStyle = color;
  const normalized = ctx.fillStyle;
  if (normalized.startsWith('#')) return hexToRgb(normalized.slice(1));
  const parts = normalized.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
  return [(parts[0] ?? 0) / 255, (parts[1] ?? 0) / 255, (parts[2] ?? 0) / 255];
}

function hexToRgb(hex: string): [number, number, number] {
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
