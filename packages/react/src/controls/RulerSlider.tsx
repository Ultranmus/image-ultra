import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/** What started a change: a drag / double-click, or the keyboard. */
export type ChangeSource = 'pointer' | 'keyboard';

export interface RulerSliderProps {
  /** Accessible name. */
  label: string;
  value: number;
  min: number;
  max: number;
  /** Precision of the value when dragging. Default 1. */
  step?: number;
  /** Distance between ticks, also the arrow-key step (Shift = ×10). Default `step`. */
  tickEvery?: number;
  /** Double-click / Enter resets to this. Default 0. */
  defaultValue?: number;
  /** Screen pixels per unit of value. Default 6. */
  unitWidth?: number;
  /** Draw a taller tick every N units. Default 5. */
  majorEvery?: number;
  /** Values that attract the ruler when dragged close (e.g. 0). Default `[defaultValue]`. */
  snapTo?: number[];
  format?: (value: number) => string;
  onChange: (value: number) => void;
  /**
   * A drag or key-press burst begins — use it to open one undo step. Separate key presses each
   * start one; `undoStep()` merges them in the store.
   */
  onChangeStart?: (source: ChangeSource) => void;
  /** …and ends. */
  onChangeEnd?: () => void;
  disabled?: boolean;
}

/** Snap distance in screen pixels. */
const SNAP_PX = 6;

/**
 * Pintura-style ruler: a tick scale scrolls under a fixed centre marker (UI_VISION §5).
 * Drag it, use the arrow keys (Shift = ×10), or double-click to reset.
 */
export function RulerSlider({
  label,
  value,
  min,
  max,
  step = 1,
  tickEvery = step,
  defaultValue = 0,
  unitWidth = 6,
  majorEvery = 5,
  snapTo,
  format = (v) => String(Math.round(v)),
  onChange,
  onChangeStart,
  onChangeEnd,
  disabled = false,
}: RulerSliderProps) {
  const drag = useRef<{ x: number; value: number } | null>(null);
  const keyActive = useRef(false);
  const [dragging, setDragging] = useState(false);
  const snaps = snapTo ?? [defaultValue];

  const ticks = useMemo(() => {
    const list: { value: number; major: boolean }[] = [];
    const count = Math.round((max - min) / tickEvery);
    for (let i = 0; i <= count; i++) {
      const v = Number((min + i * tickEvery).toFixed(6));
      list.push({ value: v, major: Math.abs(v / majorEvery - Math.round(v / majorEvery)) < 1e-6 });
    }
    return list;
  }, [min, max, tickEvery, majorEvery]);

  const clampValue = (v: number) => {
    const stepped = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, Number(stepped.toFixed(6))));
  };

  const emit = (v: number) => {
    if (v !== value) onChange(v);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, value };
    setDragging(true);
    onChangeStart?.('pointer');
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // Dragging the scale right moves lower values under the marker.
    let next = drag.current.value - (event.clientX - drag.current.x) / unitWidth;
    for (const snap of snaps) {
      if (Math.abs(next - snap) * unitWidth < SNAP_PX) next = snap;
    }
    emit(clampValue(next));
  };

  const onPointerEnd = () => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    onChangeEnd?.();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const big = event.shiftKey ? 10 : 1;
    const deltas: Record<string, number> = {
      ArrowLeft: -tickEvery * big,
      ArrowDown: -tickEvery * big,
      ArrowRight: tickEvery * big,
      ArrowUp: tickEvery * big,
      PageDown: -tickEvery * 10,
      PageUp: tickEvery * 10,
    };
    let next: number | null = null;
    if (event.key in deltas) next = clampValue(value + deltas[event.key]!);
    else if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    else if (event.key === 'Enter') next = defaultValue;
    if (next === null) return;
    event.preventDefault();
    if (!keyActive.current) {
      keyActive.current = true;
      onChangeStart?.('keyboard');
    }
    emit(next);
  };

  const onKeyUp = () => {
    if (!keyActive.current) return;
    keyActive.current = false;
    onChangeEnd?.();
  };

  const reset = () => {
    if (disabled || value === defaultValue) return;
    onChangeStart?.('pointer');
    onChange(defaultValue);
    onChangeEnd?.();
  };

  const offset = (value - min) * unitWidth;
  const fillFrom = (Math.min(value, defaultValue) - min) * unitWidth;
  const fillWidth = Math.abs(value - defaultValue) * unitWidth;

  return (
    <div
      className="iu-ruler"
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={format(value)}
      aria-disabled={disabled || undefined}
      data-dragging={dragging ? '' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onKeyUp}
      onDoubleClick={reset}
    >
      <span className="iu-ruler__value" data-changed={value !== defaultValue ? '' : undefined}>
        {format(value)}
      </span>
      <div className="iu-ruler__viewport" aria-hidden="true">
        <div
          className="iu-ruler__track"
          style={{ width: (max - min) * unitWidth, transform: `translateX(${-offset}px)` }}
        >
          <span className="iu-ruler__fill" style={{ left: fillFrom, width: fillWidth }} />
          {ticks.map((tick) => (
            <span
              key={tick.value}
              className="iu-ruler__tick"
              data-major={tick.major ? '' : undefined}
              data-default={tick.value === defaultValue ? '' : undefined}
              style={{ left: (tick.value - min) * unitWidth }}
            />
          ))}
        </div>
        <span className="iu-ruler__marker" />
      </div>
    </div>
  );
}
