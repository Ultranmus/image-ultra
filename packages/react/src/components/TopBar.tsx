import { selectCanRedo, selectCanUndo, selectIsDirty } from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels } from '../context';
import { useRef } from 'react';
import {
  IconCheck,
  IconClose,
  IconCompare,
  IconHistory,
  IconKeyboard,
  IconLayers,
  IconMinus,
  IconPlus,
  IconRedo,
  IconReset,
  IconUndo,
} from '../icons/Icon';
import { Popover } from '../controls/Popover';
import { useCompareHold } from '../hooks/useCompareHold';
import { useDelayedFlag } from '../hooks/useDelayedFlag';
import { HistoryPanel } from './HistoryPanel';
import { IconButton } from './IconButton';
import { ShortcutsPanel } from './ShortcutsPanel';
import { isLayersShown, toggleLayers } from '../tools/annotate/layers';

const ZOOM_STEP = 1.25;
/** Pressing the Compare button this long shows the original until released. */
const HOLD_MS = 250;

export interface TopBarProps {
  onCancel?: (() => void) | undefined;
  onDone: () => void;
  /** Export in progress: Done is disabled and, after a short delay, says "Saving…". */
  saving: boolean;
  /** Keyboard shortcuts popover (also opened with `?`). */
  shortcutsOpen: boolean;
  onShortcutsOpenChange: (open: boolean) => void;
  /** Tool the Layers button opens when the active one doesn't show elements; `null` = no button. */
  layersTool: string | null;
}

export function TopBar({
  onCancel,
  onDone,
  saving,
  shortcutsOpen,
  onShortcutsOpenChange,
  layersTool,
}: TopBarProps) {
  const store = useEditorStore();
  const labels = useLabels();
  const ready = useEditorState((s) => s.status === 'ready');
  const scale = useEditorState((s) => s.cropView?.scale ?? s.viewport.scale);
  const isFitted = useEditorState((s) => s.isFitted);
  const cropping = useEditorState((s) => s.cropView !== null);
  const canZoom = ready && !cropping;
  const canUndo = useEditorState(selectCanUndo);
  const canRedo = useEditorState(selectCanRedo);
  const isDirty = useEditorState(selectIsDirty);
  const layersShown = useEditorState(isLayersShown);

  const showSaving = useDelayedFlag(saving, 300);

  const zoomBy = (factor: number) => store.getState().zoomBy(factor, { animate: true });
  const toggleFit = () => {
    const state = store.getState();
    if (state.isFitted) state.zoomTo(1, { animate: true });
    else state.fit({ animate: true });
  };

  return (
    <header className="iu-topbar">
      <div className="iu-topbar__group">
        {onCancel && <IconButton label={labels.cancel} icon={<IconClose />} onClick={onCancel} />}
        <IconButton
          className="iu-topbar__reset"
          label={labels.reset}
          icon={<IconReset />}
          disabled={!ready || !isDirty}
          onClick={() => store.getState().reset(labels.reset)}
        />
      </div>

      <div className="iu-topbar__group iu-topbar__center">
        <IconButton
          className="iu-topbar__undo"
          label={labels.undo}
          icon={<IconUndo />}
          disabled={!ready || !canUndo}
          onClick={() => store.getState().undo()}
        />
        <IconButton
          className="iu-topbar__redo"
          label={labels.redo}
          icon={<IconRedo />}
          disabled={!ready || !canRedo}
          onClick={() => store.getState().redo()}
        />
        <span className="iu-topbar__divider" aria-hidden="true" />
        <CompareButton disabled={!ready} />
        <Popover
          label={labels.history}
          side="bottom"
          trigger={
            <IconButton
              className="iu-topbar__history"
              label={labels.history}
              icon={<IconHistory />}
              disabled={!ready || (!canUndo && !canRedo)}
            />
          }
        >
          <HistoryPanel />
        </Popover>
        {layersTool && (
          <IconButton
            className="iu-topbar__layers"
            label={labels.layers}
            icon={<IconLayers />}
            disabled={!ready}
            aria-pressed={layersShown}
            data-active={layersShown ? '' : undefined}
            onClick={() => toggleLayers(store, layersTool)}
          />
        )}
        <span className="iu-topbar__divider" aria-hidden="true" />
        <div className="iu-zoom" role="group" aria-label={labels.zoomLevel}>
          <IconButton
            label={labels.zoomOut}
            icon={<IconMinus size={18} />}
            disabled={!canZoom || isFitted}
            onClick={() => zoomBy(1 / ZOOM_STEP)}
          />
          <button
            type="button"
            className="iu-zoom__value"
            disabled={!canZoom}
            onClick={toggleFit}
            data-tooltip={labels.zoomFit}
            aria-label={`${labels.zoomLevel} ${Math.round(scale * 100)}%. ${labels.zoomFit}`}
          >
            {ready ? `${Math.round(scale * 100)}%` : '–'}
          </button>
          <IconButton
            label={labels.zoomIn}
            icon={<IconPlus size={18} />}
            disabled={!canZoom}
            onClick={() => zoomBy(ZOOM_STEP)}
          />
        </div>
      </div>

      <div className="iu-topbar__group iu-topbar__end">
        <Popover
          label={labels.shortcuts}
          side="bottom"
          open={shortcutsOpen}
          onOpenChange={onShortcutsOpenChange}
          trigger={
            <IconButton
              className="iu-topbar__shortcuts"
              label={labels.shortcuts}
              icon={<IconKeyboard />}
            />
          }
        >
          <ShortcutsPanel />
        </Popover>
        <IconButton
          label={showSaving ? labels.saving : labels.done}
          icon={<IconCheck size={18} />}
          showLabel
          variant="primary"
          // While saving it stays focusable (aria-disabled), so keyboard focus stays on it.
          disabled={!ready}
          aria-disabled={saving || undefined}
          aria-busy={saving}
          onClick={() => {
            if (!saving) onDone();
          }}
        />
      </div>
    </header>
  );
}

/** Click = split view on/off; press and hold = the whole original until released. */
function CompareButton({ disabled }: { disabled: boolean }) {
  const store = useEditorStore();
  const labels = useLabels();
  const compare = useEditorState((s) => s.compare);
  const hold = useCompareHold(store);
  const timer = useRef(0);
  const held = useRef(false);
  const split = compare !== null && compare < 1;

  const release = () => {
    window.clearTimeout(timer.current);
    hold.end();
  };

  return (
    <IconButton
      label={labels.compare}
      icon={<IconCompare />}
      disabled={disabled}
      aria-pressed={split}
      data-active={split ? '' : undefined}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        held.current = false;
        timer.current = window.setTimeout(() => {
          held.current = true;
          hold.start();
        }, HOLD_MS);
      }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onClick={() => {
        // A hold already did its job; only a quick click toggles the split view.
        if (held.current) {
          held.current = false;
          return;
        }
        store.getState().setCompare(split ? null : 0.5);
      }}
    />
  );
}
