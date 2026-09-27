import { TOOL_IDS, type ToolId } from '@image-ultra/core/internal';
import {
  IconAdjust,
  IconAnnotate,
  IconFill,
  IconFilter,
  IconFinetune,
  IconFrame,
  IconRedact,
  IconResize,
  IconSticker,
  IconWatermark,
} from '../icons/Icon';
import { AdjustControls } from './adjust/AdjustControls';
import { CropOverlay } from './adjust/CropOverlay';
import { defineTool, type ToolDefinition } from './defineTool';
import { ResizeControls } from './resize/ResizeControls';
import { FinetuneControls } from './finetune/FinetuneControls';
import { FilterControls } from './filter/FilterControls';
import { AnnotateControls } from './annotate/AnnotateControls';
import { AnnotateOverlay } from './annotate/AnnotateOverlay';
import { RedactControls } from './redact/RedactControls';
import { FrameControls } from './frame/FrameControls';
import { FillControls } from './fill/FillControls';
import { WatermarkControls } from './watermark/WatermarkControls';
import { WatermarkOverlay } from './watermark/WatermarkOverlay';
import { StickerControls } from './sticker/StickerControls';

/** Stickers are image annotations: select, move, resize, rotate — no drawing tools. */
function StickerOverlay() {
  return <AnnotateOverlay selectOnly />;
}
import { RedactOverlay } from './redact/RedactOverlay';

/** The built-in tools by id, in their default order. */
export const BUILT_IN_TOOLS: Record<ToolId, ToolDefinition> = {
  adjust: defineTool({
    id: 'adjust',
    icon: IconAdjust,
    Controls: AdjustControls,
    StageOverlay: CropOverlay,
  }),
  finetune: defineTool({ id: 'finetune', icon: IconFinetune, Controls: FinetuneControls }),
  filter: defineTool({ id: 'filter', icon: IconFilter, Controls: FilterControls }),
  annotate: defineTool({
    id: 'annotate',
    icon: IconAnnotate,
    Controls: AnnotateControls,
    StageOverlay: AnnotateOverlay,
  }),
  redact: defineTool({
    id: 'redact',
    icon: IconRedact,
    Controls: RedactControls,
    StageOverlay: RedactOverlay,
  }),
  sticker: defineTool({
    id: 'sticker',
    icon: IconSticker,
    Controls: StickerControls,
    StageOverlay: StickerOverlay,
  }),
  frame: defineTool({ id: 'frame', icon: IconFrame, Controls: FrameControls }),
  fill: defineTool({ id: 'fill', icon: IconFill, Controls: FillControls }),
  resize: defineTool({ id: 'resize', icon: IconResize, Controls: ResizeControls }),
  watermark: defineTool({
    id: 'watermark',
    icon: IconWatermark,
    Controls: WatermarkControls,
    StageOverlay: WatermarkOverlay,
  }),
};

/** An entry of the `tools` prop: a built-in tool id or your own `defineTool(...)`. */
export type ToolInput = ToolId | ToolDefinition;

/** Turns the `tools` prop (ids and/or custom definitions) into definitions, dropping duplicates. */
export function resolveTools(tools: readonly ToolInput[] = TOOL_IDS): ToolDefinition[] {
  const seen = new Set<string>();
  const result: ToolDefinition[] = [];
  for (const tool of tools) {
    const def = typeof tool === 'string' ? BUILT_IN_TOOLS[tool] : tool;
    if (!def || seen.has(def.id)) continue;
    seen.add(def.id);
    result.push(def);
  }
  return result;
}
