import type { ToolId } from '@image-ultra/core';
import type { Labels } from '../i18n';
import type { ToolDefinition } from './defineTool';

export function toolLabel(tool: ToolDefinition, labels: Labels): string {
  return tool.label ?? labels.tools[tool.id as ToolId] ?? tool.id;
}
