import type { EditState } from '../state/editState';
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
}

export interface Renderer {
  readonly kind: RendererKind;
  /** Resolves when `image` can be drawn (e.g. texture prepared). Safe to call repeatedly. */
  prepare(image: LoadedImage): Promise<void>;
  isReady(image: LoadedImage): boolean;
  render(params: RenderParams): void;
  /** Largest output width/height this renderer can produce. */
  readonly maxOutputSize: number;
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
