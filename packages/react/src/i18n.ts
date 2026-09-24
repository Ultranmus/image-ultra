import type { ToolId } from '@image-ultra/core';

/** Every user-facing string. Pass a partial object to `labels` to translate or rename. */
export interface Labels {
  cancel: string;
  reset: string;
  undo: string;
  redo: string;
  done: string;
  saving: string;
  zoomIn: string;
  zoomOut: string;
  zoomFit: string;
  zoomLevel: string;
  /** Built-in tool names. Custom tools pass their own `label`. */
  tools: Record<ToolId, string>;
  toolbarLabel: string;
  loading: string;
  loadError: string;
  emptyTitle: string;
  emptyHint: string;
  browse: string;
  comingSoon: string;

  /* Adjust */
  rotateLeft: string;
  flipHorizontal: string;
  flipVertical: string;
  straighten: string;
  tiltVertical: string;
  tiltHorizontal: string;
  resetTool: string;
  aspectRatio: string;
  aspectFree: string;
  aspectOriginal: string;
  aspectCircle: string;
  cropArea: string;
  /** Screen-reader hint on the crop area. */
  cropAreaHint: string;

  /* Resize */
  width: string;
  height: string;
  keepAspect: string;
  sizePresets: string;
  originalSize: string;
  upscaleWarning: string;
}

export const defaultLabels: Labels = {
  cancel: 'Cancel',
  reset: 'Reset',
  undo: 'Undo',
  redo: 'Redo',
  done: 'Done',
  saving: 'Saving…',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomFit: 'Fit to screen',
  zoomLevel: 'Zoom level',
  tools: {
    adjust: 'Adjust',
    finetune: 'Finetune',
    filter: 'Filter',
    annotate: 'Annotate',
    redact: 'Redact',
    sticker: 'Sticker',
    frame: 'Frame',
    fill: 'Fill',
    resize: 'Resize',
    watermark: 'Watermark',
  },
  toolbarLabel: 'Editing tools',
  loading: 'Loading image…',
  loadError: 'This image could not be loaded.',
  emptyTitle: 'Drop an image here',
  emptyHint: 'PNG, JPEG, WebP, GIF or AVIF',
  browse: 'Browse files',
  comingSoon: 'Controls for this tool are coming soon.',

  rotateLeft: 'Rotate left',
  flipHorizontal: 'Flip horizontal',
  flipVertical: 'Flip vertical',
  straighten: 'Straighten',
  tiltVertical: 'Vertical',
  tiltHorizontal: 'Horizontal',
  resetTool: 'Reset',
  aspectRatio: 'Aspect ratio',
  aspectFree: 'Free',
  aspectOriginal: 'Original',
  aspectCircle: 'Circle',
  cropArea: 'Crop area',
  cropAreaHint: 'Drag to move the image. Arrow keys move the crop; Shift moves faster.',

  width: 'Width',
  height: 'Height',
  keepAspect: 'Keep aspect ratio',
  sizePresets: 'Size presets',
  originalSize: 'Original size',
  upscaleWarning: 'Larger than the crop — may look soft',
};

export type LabelOverrides = Partial<Omit<Labels, 'tools'>> & { tools?: Partial<Labels['tools']> };

export function mergeLabels(overrides: LabelOverrides | undefined): Labels {
  if (!overrides) return defaultLabels;
  return { ...defaultLabels, ...overrides, tools: { ...defaultLabels.tools, ...overrides.tools } };
}
