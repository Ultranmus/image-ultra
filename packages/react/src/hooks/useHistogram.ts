import { useEffect, useState } from 'react';
import {
  computeHistogram,
  renderAnalysisPixels,
  type EditState,
  type Histogram,
  type LoadedImage,
} from '@image-ultra/core';

/**
 * Histogram of the image with its current geometry (before colour edits), recomputed shortly after
 * the crop/rotation changes.
 */
export function useHistogram(image: LoadedImage | null, edit: EditState): Histogram | null {
  const [histogram, setHistogram] = useState<{ key: unknown; value: Histogram } | null>(null);
  const geometry = edit.geometry;
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void renderAnalysisPixels(image, { ...edit, geometry }, 200).then(({ data }) => {
        if (!cancelled) setHistogram({ key: geometry, value: computeHistogram(data) });
      });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Only geometry matters: colour edits don't change the input histogram.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image, geometry]);
  return histogram?.value ?? null;
}
