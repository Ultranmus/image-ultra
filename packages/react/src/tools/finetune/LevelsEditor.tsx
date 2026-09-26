import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import {
  createLevelsState,
  isNeutralLevels,
  type ChangeOptions,
  type LevelsState,
} from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels } from '../../context';
import { IconButton } from '../../components/IconButton';
import { IconReset } from '../../icons/Icon';
import type { Histograms } from '../../hooks/useHistogram';
import { histogramPaths } from './histogramPath';

type Handle = 'black' | 'mid' | 'white';
const GAP = 0.02;

/** Input position (0…1) of the mid-tone handle: the input that maps to 50% grey. */
export function midHandlePosition(levels: LevelsState): number {
  const power = Math.pow(2, -levels.mid);
  return levels.black + (levels.white - levels.black) * Math.pow(0.5, 1 / power);
}

/** The `mid` value that puts the mid-tone handle at input position `p`. */
export function midFromPosition(levels: LevelsState, p: number): number {
  const v = Math.min(0.98, Math.max(0.02, (p - levels.black) / (levels.white - levels.black)));
  const power = Math.log(0.5) / Math.log(v);
  return Math.min(1, Math.max(-1, -Math.log2(power)));
}

/** Histogram with black / mid-tone / white handles (classic "Levels"). */
export function LevelsEditor({ histogram }: { histogram: Histograms | null }) {
  const labels = useLabels();
  const store = useEditorStore();
  const levels = useEditorState((s) => s.edit.levels);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; pointerId: number } | null>(null);

  const setLevels = (next: LevelsState, options?: ChangeOptions) =>
    store.getState().update(
      labels.modeLevels,
      (draft) => {
        draft.levels = next;
      },
      options,
    );

  const place = (handle: Handle, p: number, current: LevelsState): LevelsState => {
    if (handle === 'black')
      return { ...current, black: Math.min(current.white - GAP, Math.max(0, p)) };
    if (handle === 'white')
      return { ...current, white: Math.max(current.black + GAP, Math.min(1, p)) };
    return { ...current, mid: midFromPosition(current, p) };
  };

  const position = (event: { clientX: number }) => {
    const rect = track.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>, handle: Handle) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { handle, pointerId: event.pointerId };
    store.getState().beginChange(labels.modeLevels);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    setLevels(place(d.handle, position(event), store.getState().edit.levels));
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    store.getState().endChange();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>, handle: Handle) => {
    const step = (event.shiftKey ? 10 : 1) / 255;
    const dir =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? 1
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -1
          : 0;
    if (!dir) return;
    event.preventDefault();
    const current = handle === 'mid' ? midHandlePosition(levels) : levels[handle];
    setLevels(place(handle, current + dir * step, levels), { coalesce: true });
  };

  const handles: { id: Handle; label: string; at: number; text: string }[] = [
    {
      id: 'black',
      label: labels.levelsBlack,
      at: levels.black,
      text: String(Math.round(levels.black * 255)),
    },
    {
      id: 'mid',
      label: labels.levelsMid,
      at: midHandlePosition(levels),
      text: Math.pow(2, levels.mid).toFixed(2),
    },
    {
      id: 'white',
      label: labels.levelsWhite,
      at: levels.white,
      text: String(Math.round(levels.white * 255)),
    },
  ];

  const hist = histogram && histogramPaths(histogram.before.luma, histogram.after.luma, 256, 32);

  return (
    <div className="iu-levels">
      <div className="iu-levels__main">
        <svg
          className="iu-levels__histogram"
          viewBox="0 0 256 32"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {hist && <path className="iu-levels__before" d={hist.before} />}
          {hist?.after && <path className="iu-levels__after" d={hist.after} />}
          <rect className="iu-levels__clip" x={0} y={0} width={levels.black * 256} height={32} />
          <rect
            className="iu-levels__clip"
            x={levels.white * 256}
            y={0}
            width={(1 - levels.white) * 256}
            height={32}
          />
        </svg>
        <div
          ref={track}
          className="iu-levels__track"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          {handles.map((h) => (
            <div
              key={h.id}
              className="iu-levels__handle"
              data-handle={h.id}
              style={{ left: `${h.at * 100}%` }}
              role="slider"
              tabIndex={0}
              aria-label={h.label}
              aria-valuemin={0}
              aria-valuemax={255}
              aria-valuenow={Math.round(h.at * 255)}
              aria-valuetext={h.text}
              onPointerDown={(e) => onPointerDown(e, h.id)}
              onKeyDown={(e) => onKeyDown(e, h.id)}
            />
          ))}
        </div>
      </div>
      <div className="iu-levels__values">
        {handles.map((h) => (
          <span key={h.id}>
            <span className="iu-levels__label">{h.label}</span> {h.text}
          </span>
        ))}
        <IconButton
          label={labels.resetTool}
          icon={<IconReset size={16} />}
          size="sm"
          disabled={isNeutralLevels(levels)}
          onClick={() => setLevels(createLevelsState())}
        />
      </div>
    </div>
  );
}
