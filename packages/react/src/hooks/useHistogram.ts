import { useEffect, useRef, useState } from 'react';
import {
  analysisState,
  computeHistogram,
  type EditState,
  type Histogram,
  type ThumbnailRenderer,
} from '@image-ultra/core/internal';

/** Longest side of the copy the histograms are counted on. */
const SIZE = 200;
/** Wait for a pause in slider drags before recounting. */
const DEBOUNCE_MS = 120;

export interface Histograms {
  /** The photo with its geometry only (what Curves / Levels work on). */
  before: Histogram;
  /** …and with the colour edits (finetune, levels, curves, filter). */
  after: Histogram;
}

function count(renderer: ThumbnailRenderer, state: EditState, canvas: HTMLCanvasElement) {
  renderer.render(state, canvas, SIZE, { fit: 'contain' });
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Transparent bars around the result are ignored by `computeHistogram`.
  return computeHistogram(ctx.getImageData(0, 0, SIZE, SIZE).data);
}

/**
 * Before / after histograms of the photo, recounted shortly after the geometry or colour edits
 * change. `renderer` = the shared thumbnail renderer; `null` turns the hook off.
 */
export function useHistograms(
  renderer: ThumbnailRenderer | null,
  edit: EditState,
): Histograms | null {
  const [before, setBefore] = useState<{ key: unknown; value: Histogram } | null>(null);
  const [after, setAfter] = useState<{ key: unknown; value: Histogram } | null>(null);
  const { geometry, finetune, levels, curves, filter } = edit;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvas = (): HTMLCanvasElement => (canvasRef.current ??= document.createElement('canvas'));

  useEffect(() => {
    if (!renderer) return;
    const timer = setTimeout(() => {
      const value = count(renderer, analysisState(edit), canvas());
      if (value) setBefore({ key: renderer, value });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // Only geometry changes the "before" histogram.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, geometry]);

  useEffect(() => {
    if (!renderer) return;
    const timer = setTimeout(() => {
      const state = analysisState(edit, { colour: true });
      const value = count(renderer, state, canvas());
      if (value) setAfter({ key: renderer, value });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, geometry, finetune, levels, curves, filter]);

  if (!renderer || before?.key !== renderer) return null;
  return { before: before.value, after: after?.key === renderer ? after.value : before.value };
}
