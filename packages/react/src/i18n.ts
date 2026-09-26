import type { EmojiGroup } from './tools/sticker/emojiData';
import type {
  CurveChannel,
  FinetuneState,
  FrameStyle,
  RedactStyle,
  ToolId,
  WatermarkPosition,
} from '@image-ultra/core';

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
  zoomActual: string;
  /** Compare button tooltip ("hold" = press and hold). */
  compare: string;
  showOriginal: string;
  before: string;
  after: string;
  /** Accessible name of the split-view divider. */
  compareDivider: string;
  history: string;
  historyOriginal: string;
  shortcuts: string;
  shortcutsGeneral: string;
  shortcutsShow: string;
  nudge: string;
  finishOrEdit: string;
  deselect: string;
  /** Built-in tool names. Custom tools pass their own `label`. */
  tools: Record<ToolId, string>;
  toolbarLabel: string;
  loading: string;
  loadError: string;
  /** `{format}` is replaced with the file type, e.g. `HEIC`. */
  loadErrorUnsupported: string;
  loadErrorDamaged: string;
  loadErrorNotImage: string;
  loadErrorNetwork: string;
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
  /** `{name}` is replaced with the look's name. */
  lookSaved: string;
  viewInFilters: string;
  lookName: string;
  save: string;
  cancelEdit: string;

  /* Annotate */
  annotateTools: string;
  annotateModes: Record<
    'select' | 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'polygon' | 'text',
    string
  >;
  insertImage: string;
  strokeColor: string;
  fillColor: string;
  textColor: string;
  textBackground: string;
  strokeWidth: string;
  fontSize: string;
  opacity: string;
  cornerRadius: string;
  font: string;
  bold: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  arrowStart: string;
  arrowEnd: string;
  duplicate: string;
  copy: string;
  zoomCrop: string;
  resizeModeSize: string;
  resizeModeCanvas: string;
  /** Aspect chips for the canvas; `canvasOriginal` = no shape change, padding only. */
  canvasShape: string;
  canvasOriginal: string;
  canvasPadding: string;
  canvasAnchor: string;
  canvasReset: string;
  canvasHint: string;
  selectAll: string;
  /** Shift-click hint in the shortcuts panel. */
  addToSelection: string;
  panPhoto: string;
  /** `{count}` = number of selected shapes. */
  selectedCount: string;
  resizeSelection: string;
  arrange: string;
  alignEdges: Record<'left' | 'centerX' | 'right' | 'top' | 'centerY' | 'bottom', string>;
  distributeX: string;
  distributeY: string;
  renameLayer: string;
  groupMenu: string;
  lockAll: string;
  unlockAll: string;
  hideAll: string;
  reorderLayer: string;
  showAllLayers: string;
  cut: string;
  paste: string;
  deleteShape: string;
  layers: string;
  noLayers: string;
  bringForward: string;
  sendBackward: string;
  bringToFront: string;
  sendToBack: string;
  showInLayers: string;
  /** Accessible name of the "⋯" menu button on each layer and of the canvas context menu. */
  shapeMenu: string;
  showLayer: string;
  hideLayer: string;
  lockLayer: string;
  unlockLayer: string;
  sizeSmall: string;
  sizeMedium: string;
  sizeLarge: string;
  sizeHuge: string;
  annotateHint: string;
  polygonHint: string;
  textPlaceholder: string;
  /** Content of a new text box (selected, so typing replaces it). */
  textDefault: string;
  editText: string;
  rotate: string;

  /* Redact */
  redactTools: string;
  redactBox: string;
  redactBrush: string;
  redactStyle: string;
  redactStyles: Record<RedactStyle, string>;
  redactStrength: string;
  brushSize: string;
  redactColor: string;
  redactClear: string;
  redactDelete: string;
  /** History label for a new area. */
  redactArea: string;
  redactMove: string;
  redactHint: string;
  redactBlurHint: string;

  /* Frame & Fill */
  stickers: string;
  stickerTabs: Record<'stickers' | 'emoji', string>;
  stickerUpload: string;
  stickerBasic: string;
  stickerSearch: string;
  stickerCategories: string;
  emojiGroups: Record<EmojiGroup, string>;
  stickerNoResults: string;
  /** History label for placing a sticker. */
  stickerAdd: string;
  watermarkKind: string;
  watermarkKinds: Record<'none' | 'text' | 'logo', string>;
  watermarkText: string;
  watermarkColor: string;
  watermarkChooseLogo: string;
  watermarkPosition: string;
  watermarkPositions: Record<WatermarkPosition, string>;
  watermarkSize: string;
  watermarkBold: string;
  watermarkLocked: string;
  /** Accessible name of the draggable watermark on the photo. */
  watermarkDrag: string;
  frames: string;
  frameNone: string;
  frameStyles: Record<FrameStyle, string>;
  frameSize: string;
  frameColor: string;
  fillKind: string;
  fillKinds: Record<'none' | 'color' | 'image' | 'blur', string>;
  backgroundColor: string;
  fillChooseImage: string;
  fillHint: string;

  /* Colour picker */
  color: string;
  colorNone: string;
  colorCustom: string;
  colorSaturation: string;
  colorHue: string;
  colorPick: string;

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
  zoomActual: 'Actual size (100%)',
  compare: 'Compare · hold to see the original',
  showOriginal: 'Show the original (hold)',
  before: 'Before',
  after: 'After',
  compareDivider: 'Before / after divider',
  history: 'History',
  historyOriginal: 'Original',
  shortcuts: 'Keyboard shortcuts',
  shortcutsGeneral: 'General',
  shortcutsShow: 'Show keyboard shortcuts',
  nudge: 'Move the selected shape (Shift: 10×)',
  finishOrEdit: 'Finish polygon · edit text',
  deselect: 'Deselect · cancel',
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
  loadErrorUnsupported: 'This file type ({format}) isn’t supported.',
  loadErrorDamaged: 'This image file is damaged and can’t be opened.',
  loadErrorNotImage: 'This file isn’t an image.',
  loadErrorNetwork: 'Couldn’t download the image.',
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
  lookSaved: 'Saved “{name}”',
  viewInFilters: 'View in Filters',
  lookName: 'Look name',
  save: 'Save',
  cancelEdit: 'Cancel',

  annotateTools: 'Drawing tools',
  annotateModes: {
    select: 'Select',
    pen: 'Pen',
    line: 'Line',
    arrow: 'Arrow',
    rect: 'Rectangle',
    ellipse: 'Ellipse',
    polygon: 'Polygon',
    text: 'Text',
  },
  insertImage: 'Add image',
  strokeColor: 'Colour',
  fillColor: 'Fill',
  textColor: 'Text colour',
  textBackground: 'Background',
  strokeWidth: 'Line width',
  fontSize: 'Text size',
  opacity: 'Opacity',
  cornerRadius: 'Corner radius',
  font: 'Font',
  bold: 'Bold',
  alignLeft: 'Align left',
  alignCenter: 'Align centre',
  alignRight: 'Align right',
  arrowStart: 'Arrow at start',
  arrowEnd: 'Arrow at end',
  duplicate: 'Duplicate',
  copy: 'Copy',
  zoomCrop: 'Zoom',
  resizeModeSize: 'Size',
  resizeModeCanvas: 'Canvas',
  canvasShape: 'Canvas shape',
  canvasOriginal: 'Photo shape',
  canvasPadding: 'Padding',
  canvasAnchor: 'Photo position',
  canvasReset: 'Remove added space',
  canvasHint: 'Adds space around the photo — the Fill shows there.',
  selectAll: 'Select all',
  addToSelection: 'Add to or remove from the selection',
  panPhoto: 'Pan the photo',
  selectedCount: '{count} selected',
  resizeSelection: 'Resize',
  arrange: 'Align',
  alignEdges: {
    left: 'Align left',
    centerX: 'Align centre',
    right: 'Align right',
    top: 'Align top',
    centerY: 'Align middle',
    bottom: 'Align bottom',
  },
  distributeX: 'Distribute horizontally',
  distributeY: 'Distribute vertically',
  renameLayer: 'Rename',
  groupMenu: 'Selection',
  lockAll: 'Lock all',
  unlockAll: 'Unlock all',
  hideAll: 'Hide all',
  reorderLayer: 'Reorder layers',
  showAllLayers: 'Show all',
  cut: 'Cut',
  paste: 'Paste',
  deleteShape: 'Delete',
  layers: 'Layers',
  noLayers: 'Nothing drawn yet',
  bringForward: 'Bring forward',
  sendBackward: 'Send backward',
  bringToFront: 'Bring to front',
  sendToBack: 'Send to back',
  showInLayers: 'Show in Layers',
  shapeMenu: 'Layer actions',
  showLayer: 'Show',
  hideLayer: 'Hide',
  lockLayer: 'Lock',
  unlockLayer: 'Unlock',
  sizeSmall: 'S',
  sizeMedium: 'M',
  sizeLarge: 'L',
  sizeHuge: 'XL',
  annotateHint: 'Pick a tool and draw on the photo, or select a shape to change it.',
  polygonHint: 'Click to add points · click the first point or press Enter to finish · Esc cancels',
  textPlaceholder: 'Type something',
  textDefault: 'Text',
  editText: 'Edit text',
  rotate: 'Rotate',

  redactTools: 'Redact tools',
  redactBox: 'Box',
  redactBrush: 'Brush',
  redactStyle: 'Style',
  redactStyles: { pixelate: 'Pixelate', blur: 'Blur', solid: 'Solid' },
  redactStrength: 'Strength',
  brushSize: 'Brush size',
  redactColor: 'Fill colour',
  redactClear: 'Clear all',
  redactDelete: 'Delete area',
  redactArea: 'Redact',
  redactMove: 'Move area',
  redactHint: 'Drag over a face, name or number to hide it.',
  redactBlurHint: 'For faces, names and numbers, Pixelate or Solid is safer.',

  stickers: 'Stickers',
  stickerTabs: { stickers: 'Stickers', emoji: 'Emoji' },
  stickerUpload: 'Upload your own',
  stickerBasic: 'Basic',
  stickerSearch: 'Search',
  stickerCategories: 'Categories',
  emojiGroups: {
    smileys: 'Smileys',
    people: 'People',
    animals: 'Animals & nature',
    food: 'Food & drink',
    travel: 'Travel & places',
    activities: 'Activities',
    objects: 'Objects',
    symbols: 'Symbols',
    flags: 'Flags',
  },
  stickerNoResults: 'Nothing found',
  stickerAdd: 'Add sticker',
  watermarkKind: 'Watermark',
  watermarkKinds: { none: 'None', text: 'Text', logo: 'Logo' },
  watermarkText: 'Watermark text',
  watermarkColor: 'Watermark colour',
  watermarkChooseLogo: 'Choose logo…',
  watermarkPosition: 'Position',
  watermarkPositions: {
    'top-left': 'Top left',
    top: 'Top',
    'top-right': 'Top right',
    left: 'Left',
    center: 'Centre',
    right: 'Right',
    'bottom-left': 'Bottom left',
    bottom: 'Bottom',
    'bottom-right': 'Bottom right',
    custom: 'Where you dragged it',
    tile: 'Tile across the photo',
  },
  watermarkSize: 'Size',
  watermarkBold: 'Bold',
  watermarkLocked: 'This watermark is added by the app and can’t be changed.',
  watermarkDrag: 'Watermark — drag or use the arrow keys to move it',
  frames: 'Frames',
  frameNone: 'None',
  frameStyles: {
    border: 'Border',
    rounded: 'Rounded',
    bevel: 'Bevel',
    line: 'Line',
    double: 'Double line',
    inset: 'Inset',
    plus: 'Plus',
    lumber: 'Lumber',
    corners: 'Corners',
    polaroid: 'Polaroid',
  },
  frameSize: 'Size',
  frameColor: 'Frame colour',
  fillKind: 'Fill',
  fillKinds: { none: 'None', color: 'Colour', image: 'Image', blur: 'Blurred photo' },
  backgroundColor: 'Fill colour',
  fillChooseImage: 'Choose image…',
  fillHint:
    'Fill shows where the photo is transparent — PNGs, round crops and space added in Resize › Canvas.',

  color: 'Colour',
  colorNone: 'None',
  colorCustom: 'Custom colour',
  colorSaturation: 'Saturation and brightness',
  colorHue: 'Hue',
  colorPick: 'Pick from screen',

  filters: 'Filters',
  filterNone: 'Original',
  intensity: 'Intensity',
  myLooks: 'My looks',
  removeLook: 'Remove look',
};

type NestedKey =
  | 'tools'
  | 'finetune'
  | 'curveChannels'
  | 'annotateModes'
  | 'redactStyles'
  | 'frameStyles'
  | 'watermarkKinds'
  | 'stickerTabs'
  | 'emojiGroups'
  | 'watermarkPositions'
  | 'fillKinds'
  | 'alignEdges';

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
    annotateModes: { ...defaultLabels.annotateModes, ...overrides.annotateModes },
    redactStyles: { ...defaultLabels.redactStyles, ...overrides.redactStyles },
    frameStyles: { ...defaultLabels.frameStyles, ...overrides.frameStyles },
    watermarkKinds: { ...defaultLabels.watermarkKinds, ...overrides.watermarkKinds },
    stickerTabs: { ...defaultLabels.stickerTabs, ...overrides.stickerTabs },
    emojiGroups: { ...defaultLabels.emojiGroups, ...overrides.emojiGroups },
    watermarkPositions: { ...defaultLabels.watermarkPositions, ...overrides.watermarkPositions },
    fillKinds: { ...defaultLabels.fillKinds, ...overrides.fillKinds },
    alignEdges: { ...defaultLabels.alignEdges, ...overrides.alignEdges },
  };
}
