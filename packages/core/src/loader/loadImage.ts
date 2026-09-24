import type { ImageSource, LoadedImage } from '../types';

export interface LoadImageOptions {
  /** Abort a slow load, e.g. when the user picks another image. */
  signal?: AbortSignal;
  /** Sent with URL requests. Defaults to `anonymous` so the canvas stays exportable. */
  crossOrigin?: 'anonymous' | 'use-credentials';
}

export class ImageLoadError extends Error {
  override readonly name = 'ImageLoadError';
}

/**
 * Decodes any supported source into an `ImageBitmap`, applying EXIF orientation.
 * Browser only — call it from effects/event handlers, never during SSR.
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
      return await fromBlob(source, fileName(source));
    }
    if (typeof HTMLImageElement !== 'undefined' && source instanceof HTMLImageElement) {
      if (!source.complete || source.naturalWidth === 0) await source.decode();
      return fromBitmap(await createImageBitmap(source), null, null);
    }
    return fromBitmap(await createImageBitmap(source), null, null);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    if (error instanceof ImageLoadError) throw error;
    throw new ImageLoadError('The image could not be loaded.', { cause: error });
  }
}

async function loadFromUrl(
  url: string,
  crossOrigin: 'anonymous' | 'use-credentials',
  signal: AbortSignal | undefined,
): Promise<LoadedImage> {
  let blob: Blob | null = null;
  try {
    const init: RequestInit = {
      credentials: crossOrigin === 'use-credentials' ? 'include' : 'same-origin',
    };
    if (signal) init.signal = signal;
    const response = await fetch(url, init);
    if (response.ok) blob = await response.blob();
  } catch (error) {
    if (signal?.aborted) throw error;
    // fetch can fail on CORS/network — fall back to an <img> element below.
  }

  if (blob) return fromBlob(blob, nameFromUrl(url));

  const img = new Image();
  img.crossOrigin = crossOrigin;
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  signal?.throwIfAborted();
  return fromBitmap(await createImageBitmap(img), null, nameFromUrl(url));
}

async function fromBlob(blob: Blob, name: string | null): Promise<LoadedImage> {
  if (blob.type && !blob.type.startsWith('image/')) {
    throw new ImageLoadError(`Unsupported file type: ${blob.type}`);
  }
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  return fromBitmap(bitmap, blob.type || null, name);
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
