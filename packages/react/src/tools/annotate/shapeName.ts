import type { Shape } from '@image-ultra/core';
import type { Labels } from '../../i18n';

/** An element's name for Layers and screen readers: the user's name, else one from the labels. */
export function shapeName(shape: Shape, labels: Labels): string {
  if (shape.name) return shape.name;
  const names = labels.shapeNames;
  switch (shape.type) {
    case 'rect':
      return names.rectangle;
    case 'ellipse':
      return names.ellipse;
    case 'line':
      return shape.endCap === 'arrow' || shape.startCap === 'arrow' ? names.arrow : names.line;
    case 'path':
      return shape.smooth ? names.drawing : names.polygon;
    case 'text':
      return names.text.replace('{text}', shape.text.split('\n')[0]!.slice(0, 24) || '…');
    case 'image':
      return names.image;
    case 'redact':
      return labels.redactStyles[shape.style];
    case 'watermark':
      return labels.tools.watermark;
  }
}
