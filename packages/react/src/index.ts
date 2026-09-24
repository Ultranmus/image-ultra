export {
  ImageEditor,
  type ImageEditorHandle,
  type ImageEditorProps,
} from './components/ImageEditor';
export { useImageEditor } from './hooks/useImageEditor';
export { defineTool, type ToolDefinition } from './tools/defineTool';
export { BUILT_IN_TOOLS, type ToolInput } from './tools/builtins';
export { SIZE_PRESETS, type SizePreset } from './tools/resize/ResizeControls';
export type { IconProps } from './icons/Icon';

// Building blocks for custom tools, styled like the built-ins.
export { IconButton, type IconButtonProps } from './components/IconButton';
export { RulerSlider, type RulerSliderProps } from './controls/RulerSlider';
export { SegmentedControl, type SegmentedControlProps } from './controls/SegmentedControl';
export {
  PresetStrip,
  AspectGlyph,
  type Preset,
  type PresetStripProps,
} from './controls/PresetStrip';
export { NumberField, type NumberFieldProps } from './controls/NumberField';
export { useEditorState, useEditorStore, useLabels, useLooks } from './context';
export { defaultLabels, type LabelOverrides, type Labels } from './i18n';
export type { ThemeMode, ThemeOverrides } from './theme';

// Re-export the core API most apps need, so one package is enough.
export {
  autoEnhance,
  createEditState,
  createLook,
  applyLook,
  FILTER_PRESETS,
  filterFromPreset,
  parseEditState,
  renderImage,
  selectCanRedo,
  selectCanUndo,
  selectIsDirty,
  EditStateError,
} from '@image-ultra/core';
export type {
  EditRecipe,
  EditState,
  EditorStore,
  ExportMimeType,
  ExportOptions,
  ExportResult,
  CurvePoint,
  CurvesState,
  FilterPreset,
  FilterState,
  FinetuneState,
  GeometryState,
  LevelsState,
  Look,
  ImageSource,
  LoadedImage,
  Rect,
  ResizeState,
  ToolId,
} from '@image-ultra/core';
