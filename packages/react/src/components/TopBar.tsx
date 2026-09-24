import { selectCanRedo, selectCanUndo, selectIsDirty } from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels } from '../context';
import {
  IconCheck,
  IconClose,
  IconMinus,
  IconPlus,
  IconRedo,
  IconReset,
  IconUndo,
} from '../icons/Icon';
import { useDelayedFlag } from '../hooks/useDelayedFlag';
import { IconButton } from './IconButton';

const ZOOM_STEP = 1.25;

export interface TopBarProps {
  onCancel?: (() => void) | undefined;
  onDone: () => void;
  /** Export in progress: Done is disabled and, after a short delay, says "Saving…". */
  saving: boolean;
}

export function TopBar({ onCancel, onDone, saving }: TopBarProps) {
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
          label={labels.reset}
          icon={<IconReset />}
          disabled={!ready || !isDirty}
          onClick={() => store.getState().reset()}
        />
      </div>

      <div className="iu-topbar__group iu-topbar__center">
        <IconButton
          label={labels.undo}
          icon={<IconUndo />}
          disabled={!ready || !canUndo}
          onClick={() => store.getState().undo()}
        />
        <IconButton
          label={labels.redo}
          icon={<IconRedo />}
          disabled={!ready || !canRedo}
          onClick={() => store.getState().redo()}
        />
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
        <IconButton
          label={showSaving ? labels.saving : labels.done}
          icon={<IconCheck size={18} />}
          showLabel
          variant="primary"
          disabled={!ready || saving}
          aria-busy={saving}
          onClick={onDone}
        />
      </div>
    </header>
  );
}
