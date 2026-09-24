import { Canvas2DRenderer } from './canvas2dRenderer';
import type { AnyCanvas, CreateRendererOptions, Renderer } from './renderer';
import { WebGLRenderer } from './webglRenderer';

/**
 * Picks the best renderer for `canvas`: WebGL2 when available, otherwise Canvas2D.
 * A canvas can only ever hold one kind of context, so call this once per canvas.
 */
export function createRenderer(canvas: AnyCanvas, options: CreateRendererOptions = {}): Renderer {
  const prefer = options.prefer ?? 'auto';
  if (prefer !== 'canvas2d') {
    const webgl = WebGLRenderer.create(canvas, options);
    if (webgl) return webgl;
    if (prefer === 'webgl2') throw new Error('image-ultra: WebGL2 is not available.');
  }
  return new Canvas2DRenderer(canvas);
}

/** An offscreen canvas when supported, otherwise a detached `<canvas>`. */
export function createCanvas(width: number, height: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export async function canvasToBlob(
  canvas: AnyCanvas,
  type: string,
  quality: number | undefined,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob(quality === undefined ? { type } : { type, quality });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('image-ultra: canvas export failed.'))),
      type,
      quality,
    );
  });
}
