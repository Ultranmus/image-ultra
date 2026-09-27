import { useRef, type KeyboardEvent } from 'react';
import { useEditorState, useEditorStore, useLabels } from '../context';
import type { ToolDefinition } from '../tools/defineTool';
import { toolLabel } from '../tools/toolLabel';

export interface ToolRailProps {
  tools: readonly ToolDefinition[];
  idPrefix: string;
}

export function ToolRail({ tools, idPrefix }: ToolRailProps) {
  const store = useEditorStore();
  const labels = useLabels();
  const activeTool = useEditorState((s) => s.activeTool);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  // Roving focus: arrow keys move between tools (WAI-ARIA tabs pattern).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = tools.findIndex((t) => t.id === activeTool);
    const last = tools.length - 1;
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowDown' || event.key === 'ArrowRight'
            ? (index + 1) % tools.length
            : (index - 1 + tools.length) % tools.length;
    const tool = tools[next];
    if (!tool) return;
    store.getState().setActiveTool(tool.id);
    buttons.current.get(tool.id)?.focus();
  };

  return (
    <nav className="iu-rail" aria-label={labels.toolbarLabel}>
      <div
        className="iu-rail__list"
        role="tablist"
        aria-label={labels.toolbarLabel}
        onKeyDown={onKeyDown}
      >
        {tools.map((tool) => {
          const Icon = tool.icon;
          const selected = tool.id === activeTool;
          return (
            <button
              key={tool.id}
              ref={(el) => {
                if (el) buttons.current.set(tool.id, el);
                else buttons.current.delete(tool.id);
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${tool.id}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel`}
              tabIndex={selected ? 0 : -1}
              className="iu-rail__item"
              onClick={() => store.getState().setActiveTool(tool.id)}
            >
              <Icon size={20} />
              <span className="iu-rail__label">{toolLabel(tool, labels)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
