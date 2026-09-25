export type { EditorStatus, ImageSource, LoadedImage, Point, Size, ToolId } from './types';
export { TOOL_IDS } from './types';

export {
  loadImage,
  ImageLoadError,
  type ImageLoadErrorCode,
  type LoadImageOptions,
} from './loader/loadImage';
export { detectImageFormat, type ImageFormat } from './loader/detectFormat';

/* Edit state */
export {
  EDIT_STATE_VERSION,
  FINETUNE_KEYS,
  FINETUNE_RANGES,
  EditStateError,
  MAX_OUTPUT_SIDE,
  createEditState,
  getBeforeState,
  createCurvesState,
  createFinetuneState,
  createGeometryState,
  createIdentityCurve,
  createLevelsState,
  isIdentityCurve,
  isNeutralCurves,
  isNeutralFinetune,
  isNeutralLevels,
  parseCurve,
  parseEditState,
  type EditAsset,
  type EditState,
  type FinetuneState,
  type GeometryState,
  type QuarterTurn,
  type CropShape,
  type CurveChannel,
  type CurvePoint,
  type CurvesState,
  type FilterState,
  type LevelsState,
  type RasterAsset,
  type Rect,
  type ResizeState,
} from './state/editState';
export {
  applyToPoint,
  compose,
  getCropRect,
  getCropSize,
  getImageBounds,
  getImageQuad,
  getOrientedSize,
  getOrientedToSource,
  getOutputSize,
  getOutputToSource,
  getSourceToOriented,
  invert,
  isAffine,
  rotate,
  scale,
  translate,
  mat3Apply,
  mat3Compose,
  mat3Invert,
  MAX_TILT_DEGREES,
  type Affine,
  type Mat3,
} from './state/geometry';
export {
  cropFits,
  cropForAspect,
  fitCrop,
  flipGeometry,
  getImageCenter,
  largestFit,
  moveCrop,
  rectCenter,
  resizeCrop,
  rotateGeometry,
  rotateResize,
  syncResizeToCrop,
  type CropHandle,
} from './state/cropMath';

/* History */
export {
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  jumpHistory,
  type History,
  type HistoryEntry,
} from './history/history';

/* Rendering & export */
export {
  colorPixel,
  compileColor,
  detailPixel,
  finishPixel,
  hueRotation,
  type ColorProgram,
} from './render/color';
export {
  createThumbnailRenderer,
  scaleEditState,
  type ThumbnailRenderer,
} from './render/thumbnails';
export { buildToneLUT, createCurveFunction, createLevelsFunction, sampleLUT } from './state/curves';
export {
  boxCenter,
  createShapeId,
  defaultShapeName,
  flipAnnotations,
  getShapeBounds,
  getShapeBox,
  getShapeCorners,
  hitTestShape,
  moveShape,
  normalizeDegrees,
  pointsBox,
  resizeBox,
  resizeRotatedBox,
  rotateAnnotations,
  rotatePoint,
  setShapeBox,
  shapeAt,
  type Box,
  type BoxHandle,
  type EllipseShape,
  type ImageShape,
  type LineCap,
  type LineShape,
  type Paint,
  type PathShape,
  type RectShape,
  type Shape,
  type ShapeType,
  type TextAlign,
  type TextShape,
} from './state/annotations';
export { parseAnnotations } from './state/parseAnnotations';
export {
  drawMask,
  rasterizeMask,
  simplifyPoints,
  tracePath,
  type MaskStroke,
  type PathSink,
} from './state/strokes';
export {
  arrowHeadLength,
  drawAnnotations,
  ensureAnnotationFonts,
  getOrientedToOutput,
  layoutText,
  loadAnnotationAssets,
  measureTextHeight,
  textFont,
  textIndexAt,
  type DrawAnnotationsOptions,
  type TextLayout,
} from './render/annotations';
export {
  DEFAULT_REDACT_COLOR,
  DEFAULT_REDACT_STRENGTH,
  REDACT_STYLES,
  flipRedactions,
  hitTestRedaction,
  moveRedaction,
  redactBlockSize,
  redactBlurRadius,
  redactReference,
  redactionAt,
  redactionBounds,
  redactionCorners,
  resizeRedaction,
  rotateRedactions,
  type RedactBox,
  type RedactBrush,
  type RedactStyle,
  type Redaction,
} from './state/redactions';
export { drawRedactions, type DrawRedactionsOptions } from './render/redactions';
export { applyLook, createLook, lookMatches, parseLooks, type Look } from './state/looks';
export {
  FILTER_PRESETS,
  filterFromPreset,
  type FilterCategory,
  type FilterPreset,
} from './filters/presets';
export {
  autoEnhance,
  computeAutoEnhance,
  computeHistogram,
  percentile,
  renderAnalysisPixels,
  type AutoEnhanceResult,
  type Histogram,
} from './analysis/analyze';
export { createCanvas, createRenderer } from './render/createRenderer';
export type {
  AnyCanvas,
  CheckerStyle,
  CreateRendererOptions,
  Renderer,
  RendererKind,
  RenderParams,
} from './render/renderer';
export {
  exportImage,
  renderImage,
  renderToCanvas,
  type RenderedCanvas,
  type ExportMimeType,
  type ExportOptions,
  type ExportResult,
} from './export/exportImage';

/* Viewport */
export {
  centerAt,
  clampViewport,
  fitViewport,
  getCropView,
  getFitScale,
  lerpCropView,
  getScaleLimits,
  lerpViewport,
  panBy,
  stageToImage,
  viewportsEqual,
  zoomAt,
  type CropView,
  type Viewport,
  type ViewportOptions,
} from './viewport/viewport';

/* Store */
export {
  createEditorStore,
  selectCanRedo,
  selectCanUndo,
  selectIsDirty,
  type CreateEditorStoreOptions,
  type EditorActions,
  type EditorState,
  type EditorStore,
  type EditorStoreState,
  type EditorTask,
  type EditRecipe,
  type TaskContext,
  type ViewportChangeOptions,
} from './store/editorStore';
