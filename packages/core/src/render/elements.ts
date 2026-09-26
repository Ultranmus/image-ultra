import type { RedactShape, Shape } from '../state/annotations';
import { drawAnnotations, type DrawAnnotationsOptions } from './annotations';
import { drawRedactions } from './redactions';

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface DrawElementsOptions extends Omit<
  DrawAnnotationsOptions,
  'onRedact' | 'onWatermark'
> {
  /** The image's short side in oriented px (`redactReference`): redaction strength is relative to it. */
  reference: number;
  /** Draws the watermark where its marker sits (called with the context's transform reset). */
  drawWatermark?: (() => void) | undefined;
}

/** Visible redaction areas, in order. */
export function redactElements(shapes: readonly Shape[]): RedactShape[] {
  return shapes.filter((s): s is RedactShape => s.type === 'redact' && !s.hidden);
}

/**
 * Draws the elements bottom → top on a transparent layer (DECISIONS #88): shapes as usual, a
 * redaction area hides what the layer already holds under it (the elements below — the photo is
 * handled separately), and the watermark at its marker. Returns whether the watermark was drawn.
 */
export function drawElements(
  ctx: Context2D,
  shapes: readonly Shape[],
  options: DrawElementsOptions,
): { watermarkDrawn: boolean } {
  let watermarkDrawn = false;
  const { reference, drawWatermark, ...rest } = options;
  drawAnnotations(ctx, shapes, {
    ...rest,
    onRedact: (shape) =>
      drawRedactions(ctx, ctx.canvas, [shape], {
        transform: rest.transform,
        reference,
        replace: true,
      }),
    onWatermark: () => {
      if (!drawWatermark) return;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawWatermark();
      ctx.restore();
      watermarkDrawn = true;
    },
  });
  return { watermarkDrawn };
}
