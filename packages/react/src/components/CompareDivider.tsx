import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { useEditorStore, useLabels } from '../context';

/** Keep the divider off the very edges so its handle stays reachable. */
const MIN = 0.02;
const MAX = 0.98;

/**
 * Split-view compare: "before" left of the divider, "after" right of it. `split === 1` means the
 * whole image shows "before" (press-and-hold) — then only the "Before" pill is shown.
 */
export function CompareDivider({ split }: { split: number }) {
  const store = useEditorStore();
  const labels = useLabels();
  const dragging = useRef(false);
  const style = { ['--iu-compare']: split } as CSSProperties;

  if (split >= 1) {
    return (
      <div className="iu-compare" style={style}>
        <span className="iu-compare__pill" data-side="full">
          {labels.before}
        </span>
      </div>
    );
  }

  const setFromPointer = (event: PointerEvent<HTMLElement>) => {
    const stage = event.currentTarget.closest('.iu-stage');
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const value = (event.clientX - rect.left) / rect.width;
    store.getState().setCompare(Math.min(MAX, Math.max(MIN, value)));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const next: Record<string, number> = {
      ArrowLeft: split - step,
      ArrowRight: split + step,
      Home: MIN,
      End: MAX,
    };
    const value = next[event.key];
    if (value === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    store.getState().setCompare(Math.min(MAX, Math.max(MIN, value)));
  };

  return (
    <div className="iu-compare" style={style}>
      <span className="iu-compare__pill" data-side="before">
        {labels.before}
      </span>
      <span className="iu-compare__pill" data-side="after">
        {labels.after}
      </span>
      <div
        className="iu-compare__divider"
        role="slider"
        tabIndex={0}
        aria-label={labels.compareDivider}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split * 100)}
        aria-valuetext={`${Math.round(split * 100)}%`}
        aria-orientation="horizontal"
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          // The divider is its own control: no panning, drawing or selecting underneath.
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragging.current = true;
          setFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (dragging.current) setFromPointer(event);
        }}
        onPointerUp={() => {
          dragging.current = false;
        }}
        onPointerCancel={() => {
          dragging.current = false;
        }}
      >
        <span className="iu-compare__handle" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor">
            <path
              d="M10 7l-5 5 5 5M14 7l5 5-5 5"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}
