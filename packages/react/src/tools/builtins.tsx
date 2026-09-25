import { TOOL_IDS, type ToolId } from '@image-ultra/core';
import { useLabels } from '../context';
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
import { RedactOverlay } from './redact/RedactOverlay';

/** Placeholder panel for tools whose UI arrives in a later phase. */
function ComingSoon() {
  const labels = useLabels();
  return <p className="iu-controlbar__hint">{labels.comingSoon}</p>;
}

const placeholder = (id: ToolId, icon: ToolDefinition['icon']) =>
  defineTool({ id, icon, Controls: ComingSoon });

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
  sticker: placeholder('sticker', IconSticker),
  frame: placeholder('frame', IconFrame),
  fill: placeholder('fill', IconFill),
  resize: defineTool({ id: 'resize', icon: IconResize, Controls: ResizeControls }),
  watermark: placeholder('watermark', IconWatermark),
};

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
