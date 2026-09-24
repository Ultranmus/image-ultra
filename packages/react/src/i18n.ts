import type { CurveChannel, FinetuneState, ToolId } from '@image-ultra/core';

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

  /* Finetune */
  /** Names of the 16 adjustments. */
  finetune: Record<keyof FinetuneState, string>;
  modeAdjust: string;
  modeCurves: string;
  modeLevels: string;
  adjustments: string;
  auto: string;
  autoHint: string;
  curveChannels: Record<CurveChannel, string>;
  curvePoint: string;
  curveHint: string;
  levelsBlack: string;
  levelsMid: string;
  levelsWhite: string;
  saveLook: string;
  lookName: string;
  save: string;
  cancelEdit: string;

  /* Filter */
  filters: string;
  filterNone: string;
  intensity: string;
  myLooks: string;
  removeLook: string;
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

  finetune: {
    brightness: 'Brightness',
    contrast: 'Contrast',
    saturation: 'Saturation',
    vibrance: 'Vibrance',
    exposure: 'Exposure',
    highlights: 'Highlights',
    shadows: 'Shadows',
    temperature: 'Temperature',
    tint: 'Tint',
    hue: 'Hue',
    gamma: 'Gamma',
    clarity: 'Clarity',
    sharpen: 'Sharpen',
    blur: 'Blur',
    grain: 'Grain',
    vignette: 'Vignette',
  },
  modeAdjust: 'Adjust',
  modeCurves: 'Curves',
  modeLevels: 'Levels',
  adjustments: 'Adjustments',
  auto: 'Auto',
  autoHint: 'Auto-enhance: fix exposure, contrast and colour',
  curveChannels: { rgb: 'RGB', red: 'Red', green: 'Green', blue: 'Blue' },
  curvePoint: 'Curve point',
  curveHint: 'Click to add a point, drag to shape, double-click a point to remove it.',
  levelsBlack: 'Black point',
  levelsMid: 'Mid-tones',
  levelsWhite: 'White point',
  saveLook: 'Save look',
  lookName: 'Look name',
  save: 'Save',
  cancelEdit: 'Cancel',

  filters: 'Filters',
  filterNone: 'Original',
  intensity: 'Intensity',
  myLooks: 'My looks',
  removeLook: 'Remove look',
};

type NestedKey = 'tools' | 'finetune' | 'curveChannels';

export type LabelOverrides = Partial<Omit<Labels, NestedKey>> & {
  [K in NestedKey]?: Partial<Labels[K]>;
};

export function mergeLabels(overrides: LabelOverrides | undefined): Labels {
  if (!overrides) return defaultLabels;
  return {
    ...defaultLabels,
    ...overrides,
    tools: { ...defaultLabels.tools, ...overrides.tools },
    finetune: { ...defaultLabels.finetune, ...overrides.finetune },
    curveChannels: { ...defaultLabels.curveChannels, ...overrides.curveChannels },
  };
}
