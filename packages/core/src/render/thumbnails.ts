import type { EditState } from '../state/editState';
import { getOutputSize } from '../state/geometry';
import type { LoadedImage } from '../types';
import { createCanvas, createRenderer } from './createRenderer';
import type { AnyCanvas, Renderer } from './renderer';

/**
 * Renders many small previews (e.g. filter thumbnails) quickly: one GPU context, one downscaled
 * copy of the image, square "cover" crops of the edited result.
 */
export interface ThumbnailRenderer {
  /** Draws `state` into `target` as a `size`×`size` px square (sets the canvas size). */
  render(state: EditState, target: HTMLCanvasElement | OffscreenCanvas, size: number): void;
  dispose(): void;
}

export async function createThumbnailRenderer(
  image: LoadedImage,
  maxSide = 256,
): Promise<ThumbnailRenderer> {
  const k = Math.min(1, maxSide / Math.max(image.width, image.height));
  const bitmap =
    k < 1
      ? await createImageBitmap(image.bitmap, {
          resizeWidth: Math.max(1, Math.round(image.width * k)),
          resizeHeight: Math.max(1, Math.round(image.height * k)),
          resizeQuality: 'high',
        })
      : image.bitmap;
  const mini: LoadedImage = { ...image, bitmap, width: bitmap.width, height: bitmap.height };
  const scaleX = mini.width / image.width;
  const canvas: AnyCanvas = createCanvas(1, 1);
  const renderer: Renderer = createRenderer(canvas, {
    preserveDrawingBuffer: true,
    ownsCanvas: true,
  });
  await renderer.prepare(mini);

  return {
    render(state, target, size) {
      const scaled = scaleEditState(state, scaleX);
      const output = getOutputSize(mini, scaled);
      const cover = size / Math.min(output.width, output.height);
      const ox = (output.width - size / cover) / 2;
      const oy = (output.height - size / cover) / 2;
      renderer.render({
        image: mini,
        state: scaled,
        canvasSize: { width: size, height: size },
        outputSize: output,
        outputScale: 1,
        canvasToOutput: [1 / cover, 0, 0, 1 / cover, ox, oy],
        checker: null,
        smooth: true,
      });
      if (target.width !== size) target.width = size;
      if (target.height !== size) target.height = size;
      const ctx = target.getContext('2d') as
        CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
      if (!ctx) return;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(canvas, 0, 0);
    },
    dispose() {
      renderer.dispose();
      if (bitmap !== image.bitmap) bitmap.close();
    },
  };
}

/** The same edits for a copy of the image scaled by `k` (crop scaled, resize dropped). */
export function scaleEditState(state: EditState, k: number): EditState {
  const crop = state.geometry.crop;
  return {
    ...state,
    resize: null,
    geometry: {
      ...state.geometry,
      crop: crop
        ? { x: crop.x * k, y: crop.y * k, width: crop.width * k, height: crop.height * k }
        : null,
    },
  };
}
