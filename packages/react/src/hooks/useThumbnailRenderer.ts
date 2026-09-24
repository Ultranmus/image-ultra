import { useEffect, useState } from 'react';
import {
  createThumbnailRenderer,
  type LoadedImage,
  type ThumbnailRenderer,
} from '@image-ultra/core';

/** One shared renderer for all thumbnails of the current image. */
export function useThumbnailRenderer(image: LoadedImage | null): ThumbnailRenderer | null {
  const [renderer, setRenderer] = useState<{
    image: LoadedImage;
    renderer: ThumbnailRenderer;
  } | null>(null);
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    let created: ThumbnailRenderer | null = null;
    void createThumbnailRenderer(image, 240).then((r) => {
      if (cancelled) {
        r.dispose();
        return;
      }
      created = r;
      setRenderer({ image, renderer: r });
    });
    return () => {
      cancelled = true;
      created?.dispose();
    };
  }, [image]);
  return renderer && renderer.image === image ? renderer.renderer : null;
}
