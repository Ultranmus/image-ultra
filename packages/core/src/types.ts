/** A point in CSS pixels. */
export interface Point {
  x: number;
  y: number;
}

/** A width/height pair in pixels. */
export interface Size {
  width: number;
  height: number;
}

/**
 * Anything the editor can open.
 * - `string`: an http(s) URL, `data:` URL or `blob:` URL
 * - `Blob` / `File`: e.g. from an `<input type="file">`
 * - DOM image sources you already have in memory
 */
export type ImageSource = string | Blob | HTMLImageElement | HTMLCanvasElement | ImageBitmap;

/** The decoded source image. Never mutated — every edit is described separately. */
export interface LoadedImage {
  /** Decoded pixels with EXIF orientation already applied. */
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** e.g. `image/jpeg`; `null` when unknown (DOM sources). */
  mimeType: string | null;
  /** Original file name without extension, when known. */
  name: string | null;
}

/** Built-in tool ids, in their default ToolRail order. */
export const TOOL_IDS = [
  'adjust',
  'finetune',
  'filter',
  'annotate',
  'redact',
  'sticker',
  'frame',
  'fill',
  'resize',
  'watermark',
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export type EditorStatus = 'idle' | 'loading' | 'ready' | 'error';
