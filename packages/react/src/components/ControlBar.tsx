import { ToolIdContext } from '../context';
import type { ToolDefinition } from '../tools/defineTool';

export interface ControlBarProps {
  idPrefix: string;
  tool: ToolDefinition;
}

/** Shows the active tool's controls (UI_VISION §4). Fixed height: switching tools never shifts layout. */
export function ControlBar({ idPrefix, tool }: ControlBarProps) {
  const Controls = tool.Controls;
  return (
    <section
      className="iu-controlbar"
      role="tabpanel"
      id={`${idPrefix}-panel`}
      aria-labelledby={`${idPrefix}-tab-${tool.id}`}
    >
      {/* `key` restarts the enter animation on every tool switch. */}
      <div key={tool.id} className="iu-controlbar__content">
        <ToolIdContext.Provider value={tool.id}>
          <Controls />
        </ToolIdContext.Provider>
      </div>
    </section>
  );
}
