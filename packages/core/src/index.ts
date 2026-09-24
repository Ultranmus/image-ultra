export type { EditorStatus, ImageSource, LoadedImage, Point, Size, ToolId } from './types';
export { TOOL_IDS } from './types';

export { loadImage, ImageLoadError, type LoadImageOptions } from './loader/loadImage';

/* Edit state */
export {
  EDIT_STATE_VERSION,
  FINETUNE_KEYS,
  EditStateError,
  MAX_OUTPUT_SIDE,
  createEditState,
  createFinetuneState,
  createGeometryState,
  isNeutralFinetune,
  parseEditState,
  type EditAsset,
  type EditState,
  type FinetuneState,
  type GeometryState,
  type QuarterTurn,
  type CropShape,
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
  type History,
  type HistoryEntry,
} from './history/history';

/* Rendering & export */
export { adjustColor } from './render/color';
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
