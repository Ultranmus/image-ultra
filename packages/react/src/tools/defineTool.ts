import type { ComponentType } from 'react';
import type { IconProps } from '../icons/Icon';

/**
 * A tool in the ToolRail. Built-in tools use exactly this API, so custom tools are first-class:
 *
 * ```tsx
 * const stamp = defineTool({
 *   id: 'stamp',
 *   label: 'Stamp',
 *   icon: MyStampIcon,
 *   Controls: () => <button onClick={…}>Add stamp</button>,
 * });
 * <ImageEditor tools={['adjust', 'finetune', stamp]} />
 * ```
 * Inside `Controls` / `StageOverlay`, use `useEditorStore()`, `useEditorState()` and `useLabels()`.
 */
export interface ToolDefinition {
  /** Unique id. Built-in ids: see `ToolId`. */
  id: string;
  /** Text under the icon. Built-in tools read theirs from `labels.tools`. */
  label?: string;
  icon: ComponentType<IconProps>;
  /** Rendered in the ControlBar while the tool is active. */
  Controls: ComponentType;
  /** Rendered on top of the stage while the tool is active (e.g. the crop box). */
  StageOverlay?: ComponentType;
}

/** Identity helper that gives you type-checking and autocompletion for a tool definition. */
export function defineTool<T extends ToolDefinition>(tool: T): T {
  return tool;
}
