import type { ImageSource, LoadedImage } from '../types';
import { readJpegExif } from '../export/exif';
import { detectImageFormat, type ImageFormat } from './detectFormat';

export interface LoadImageOptions {
  /** Abort a slow load, e.g. when the user picks another image. */
  signal?: AbortSignal;
  /** Sent with URL requests. Defaults to `anonymous` so the canvas stays exportable. */
  crossOrigin?: 'anonymous' | 'use-credentials';
}

/**
 * Why an image didn't open:
 * - `unsupported` — a real image, but in a format this browser can't show (e.g. HEIC in Chrome).
 * - `damaged` — looks like a supported image but can't be decoded (truncated/corrupt file).
 * - `not-image` — the file isn't an image at all (PDF, text…).
 * - `network` — the URL couldn't be downloaded (404, offline, blocked by CORS).
 */
export type ImageLoadErrorCode = 'unsupported' | 'damaged' | 'not-image' | 'network';

export class ImageLoadError extends Error {
  override readonly name = 'ImageLoadError';
  readonly code: ImageLoadErrorCode;
  /** Detected format (e.g. `ico`, `heic`), when known. */
  readonly format: ImageFormat | null;

  constructor(
    message: string,
    code: ImageLoadErrorCode,
    options: { format?: ImageFormat | null; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.format = options.format ?? null;
  }
}

/**
 * Decodes any supported source into an `ImageBitmap`, applying EXIF orientation.
 * Browser only — call it from effects/event handlers, never during SSR.
 * Every failure is an `ImageLoadError` (or the abort reason when `signal` fires).
 */
export async function loadImage(
  source: ImageSource,
  options: LoadImageOptions = {},
): Promise<LoadedImage> {
  const { signal, crossOrigin = 'anonymous' } = options;
  signal?.throwIfAborted();

  try {
    if (typeof source === 'string') {
      return await loadFromUrl(source, crossOrigin, signal);
    }
    if (source instanceof Blob) {
      return await fromBlob(source, fileName(source), signal);
    }
    if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
      if (!source.complete || source.naturalWidth === 0) await source.decode();
      return fromBitmap(await createImageBitmap(source), null, null);
    }
    return fromBitmap(await createImageBitmap(source), null, null);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (error instanceof ImageLoadError) throw error;
    throw new ImageLoadError('The image could not be loaded.', 'damaged', { cause: error });
  }
}

async function loadFromUrl(
  url: string,
  crossOrigin: 'anonymous' | 'use-credentials',
  signal: AbortSignal | undefined,
): Promise<LoadedImage> {
  let blob: Blob | null = null;
  let status: number | null = null;
  try {
    const init: RequestInit = {
      credentials: crossOrigin === 'use-credentials' ? 'include' : 'same-origin',
    };
    if (signal) init.signal = signal;
    const response = await fetch(url, init);
    if (response.ok) blob = await response.blob();
    else status = response.status;
  } catch (error) {
    if (signal?.aborted) throw error;
    // fetch can fail on CORS/network — fall back to an <img> element below.
  }

  if (blob) return fromBlob(blob, nameFromUrl(url), signal);
  if (status !== null) {
    throw new ImageLoadError(`Couldn't download the image (HTTP ${status}).`, 'network');
  }

  try {
    const bitmap = await decodeWithImageElement(url, crossOrigin);
    signal?.throwIfAborted();
    return fromBitmap(bitmap, null, nameFromUrl(url));
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new ImageLoadError("Couldn't download the image.", 'network', { cause: error });
  }
}

async function fromBlob(
  blob: Blob,
  name: string | null,
  signal: AbortSignal | undefined,
): Promise<LoadedImage> {
  const format = await detectImageFormat(blob);
  const declaredImage = blob.type.startsWith('image/');
  if (!format && blob.type && !declaredImage) {
    throw new ImageLoadError(`This file isn't an image (${blob.type}).`, 'not-image');
  }
  const mimeType = blob.type || null;

  let firstError: unknown;
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const loaded = fromBitmap(bitmap, mimeType, name);
    if (format === 'jpeg') {
      // EXIF lives in the first 64 KB (one APP1 segment); kept for `keepMetadata` exports.
      const exif = readJpegExif(new Uint8Array(await blob.slice(0, 0x20000).arrayBuffer()));
      if (exif) loaded.exif = exif;
    }
    return loaded;
  } catch (error) {
    firstError = error;
  }
  signal?.throwIfAborted();

  // Some formats only decode through <img> (SVG everywhere; ICO/HEIC in some browsers).
  const url = URL.createObjectURL(blob);
  try {
    const size = format === 'svg' ? await svgSize(blob) : undefined;
    return fromBitmap(await decodeWithImageElement(url, null, size), mimeType, name);
  } catch {
    throw describeDecodeFailure(format, declaredImage, firstError);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function describeDecodeFailure(
  format: ImageFormat | null,
  declaredImage: boolean,
  cause: unknown,
): ImageLoadError {
  if (format && !COMMON_FORMATS.has(format)) {
    return new ImageLoadError(
      `This file type isn't supported (${format.toUpperCase()}).`,
      'unsupported',
      { format, cause },
    );
  }
  if (format || declaredImage) {
    return new ImageLoadError('The image file is damaged.', 'damaged', { format, cause });
  }
  return new ImageLoadError("This file isn't an image.", 'not-image', { cause });
}

/** Formats every current browser decodes; failing on one of these means the file is damaged. */
const COMMON_FORMATS = new Set<ImageFormat>(['jpeg', 'png', 'gif', 'webp', 'bmp', 'svg']);

/** SVGs without width/height are drawn at this size (longest side), shaped by their viewBox. */
const SVG_FALLBACK_SIZE = 1024;

async function svgSize(blob: Blob): Promise<{ width: number; height: number }> {
  const text = await blob.slice(0, 4096).text();
  const box = /viewBox\s*=\s*["']\s*[-\d.e]+[\s,]+[-\d.e]+[\s,]+([\d.e]+)[\s,]+([\d.e]+)/i.exec(
    text,
  );
  const w = Number(box?.[1]);
  const h = Number(box?.[2]);
  if (!(w > 0 && h > 0)) return { width: SVG_FALLBACK_SIZE, height: SVG_FALLBACK_SIZE };
  const ratio = SVG_FALLBACK_SIZE / Math.max(w, h);
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

async function decodeWithImageElement(
  url: string,
  crossOrigin: 'anonymous' | 'use-credentials' | null,
  fallbackSize?: { width: number; height: number },
): Promise<ImageBitmap> {
  const img = new Image();
  if (crossOrigin) img.crossOrigin = crossOrigin;
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  try {
    return await createImageBitmap(img);
  } catch (error) {
    if (!fallbackSize) throw error;
  }
  // No intrinsic size (e.g. an SVG with only a viewBox): draw it at an explicit size.
  const canvas = document.createElement('canvas');
  canvas.width = fallbackSize.width;
  canvas.height = fallbackSize.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('image-ultra: no 2D canvas context available.');
  ctx.drawImage(img, 0, 0, fallbackSize.width, fallbackSize.height);
  return createImageBitmap(canvas);
}

function fromBitmap(
  bitmap: ImageBitmap,
  mimeType: string | null,
  name: string | null,
): LoadedImage {
  return { bitmap, width: bitmap.width, height: bitmap.height, mimeType, name };
}

function fileName(blob: Blob): string | null {
  return 'name' in blob && typeof blob.name === 'string' ? stripExtension(blob.name) : null;
}

function nameFromUrl(url: string): string | null {
  if (url.startsWith('data:') || url.startsWith('blob:')) return null;
  try {
    const last = new URL(url, 'http://local').pathname.split('/').pop();
    return last ? stripExtension(decodeURIComponent(last)) : null;
  } catch {
    return null;
  }
}

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}
