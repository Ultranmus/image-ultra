import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';
import {
  createCurveFunction,
  createIdentityCurve,
  isIdentityCurve,
  type ChangeOptions,
  type CurveChannel,
  type CurvePoint,
} from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels } from '../../context';
import { PresetStrip } from '../../controls/PresetStrip';
import { IconButton } from '../../components/IconButton';
import { IconReset } from '../../icons/Icon';
import type { Histograms } from '../../hooks/useHistogram';
import { histogramPaths } from './histogramPath';

/** Graph height in px; the width follows the ControlBar and is measured. */
const H = 80;
/** Pointer distance (screen px) that grabs an existing point. */
const GRAB_PX = 12;
const MIN_GAP = 0.02;

const CHANNEL_HIST: Record<CurveChannel, 'luma' | 'red' | 'green' | 'blue'> = {
  rgb: 'luma',
  red: 'red',
  green: 'green',
  blue: 'blue',
};

/** Tone-curve editor for RGB or one channel. */
export function CurveEditor({ histogram }: { histogram: Histograms | null }) {
  const labels = useLabels();
  const store = useEditorStore();
  const hintId = useId();
  const curves = useEditorState((s) => s.edit.curves);
  const [channel, setChannel] = useState<CurveChannel>('rgb');
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ index: number; pointerId: number } | null>(null);
  const points = curves[channel];
  const W = useMeasuredWidth(svgRef);

  const path = useMemo(() => {
    const f = createCurveFunction(points);
    let d = '';
    for (let i = 0; i <= 64; i++) {
      const x = i / 64;
      d += `${i === 0 ? 'M' : 'L'}${(x * W).toFixed(1)} ${((1 - f(x)) * H).toFixed(1)}`;
    }
    return d;
  }, [points, W]);

  const setPoints = (next: CurvePoint[], options?: ChangeOptions) =>
    store.getState().update(
      labels.modeCurves,
      (draft) => {
        draft.curves[channel] = next;
      },
      options,
    );

  const toCurve = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, 1 - (event.clientY - rect.top) / rect.height)),
      rect,
    };
  };

  /** Moves point `index`, keeping x between its neighbours (end points only move vertically). */
  const movePoint = (list: CurvePoint[], index: number, x: number, y: number): CurvePoint[] => {
    const next = list.map((p) => [p[0], p[1]] as CurvePoint);
    const last = next.length - 1;
    const lo = index === 0 ? 0 : next[index - 1]![0] + MIN_GAP;
    const hi = index === last ? 1 : next[index + 1]![0] - MIN_GAP;
    next[index] = [index === 0 ? 0 : index === last ? 1 : Math.min(hi, Math.max(lo, x)), y];
    return next;
  };

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    const { x, y, rect } = toCurve(event);
    let index = points.findIndex(
      (p) => Math.hypot((p[0] - x) * rect.width, (p[1] - y) * rect.height) < GRAB_PX,
    );
    store.getState().beginChange(labels.modeCurves);
    if (index === -1) {
      // Add a point on the curve under the pointer.
      const f = createCurveFunction(points);
      const next = [...points.map((p) => [p[0], p[1]] as CurvePoint), [x, f(x)] as CurvePoint].sort(
        (a, b) => a[0] - b[0],
      );
      if (next.some((p, i) => i > 0 && p[0] - next[i - 1]![0] < MIN_GAP) || next.length > 16) {
        store.getState().cancelChange();
        return;
      }
      index = next.findIndex((p) => p[0] === x);
      setPoints(movePoint(next, index, x, y));
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { index, pointerId: event.pointerId };
    setActive(index);
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    const { x, y } = toCurve(event);
    setPoints(movePoint(store.getState().edit.curves[channel], d.index, x, y));
  };

  const onPointerEnd = (event: PointerEvent<SVGSVGElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    store.getState().endChange();
  };

  const removePoint = (index: number) => {
    if (index === 0 || index === points.length - 1) return;
    setPoints(points.filter((_, i) => i !== index));
    setActive(null);
  };

  const onPointKey = (event: KeyboardEvent<SVGCircleElement>, index: number) => {
    const step = event.shiftKey ? 0.05 : 0.01;
    const [px, py] = points[index]!;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [px, py + step],
      ArrowDown: [px, py - step],
      ArrowLeft: [px - step, py],
      ArrowRight: [px + step, py],
    };
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      removePoint(index);
      return;
    }
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    setPoints(movePoint(points, index, move[0], Math.min(1, Math.max(0, move[1]))), {
      coalesce: true,
    });
  };

  const hist =
    histogram &&
    histogramPaths(
      histogram.before[CHANNEL_HIST[channel]],
      histogram.after[CHANNEL_HIST[channel]],
      W,
      H,
    );

  return (
    <div className="iu-curves" data-channel={channel}>
      <div className="iu-curves__side">
        <PresetStrip
          label={labels.modeCurves}
          value={channel}
          onSelect={(c) => {
            setChannel(c);
            setActive(null);
          }}
          presets={(['rgb', 'red', 'green', 'blue'] as const).map((c) => ({
            value: c,
            label: labels.curveChannels[c],
            glyph: <span className="iu-curves__swatch" data-channel={c} aria-hidden="true" />,
          }))}
        />
        <IconButton
          label={labels.resetTool}
          icon={<IconReset size={16} />}
          size="sm"
          disabled={isIdentityCurve(points)}
          onClick={() => setPoints(createIdentityCurve())}
        />
      </div>
      <svg
        ref={svgRef}
        className="iu-curves__graph"
        viewBox={`0 0 ${W} ${H}`}
        aria-describedby={hintId}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {hist && <path className="iu-curves__histogram" d={hist.before} />}
        {hist?.after && <path className="iu-curves__histogram-after" d={hist.after} />}
        {[0.25, 0.5, 0.75].map((t) => (
          <g key={t} className="iu-curves__grid">
            <line x1={t * W} x2={t * W} y1={0} y2={H} />
            <line y1={t * H} y2={t * H} x1={0} x2={W} />
          </g>
        ))}
        <line className="iu-curves__diagonal" x1={0} y1={H} x2={W} y2={0} />
        <path className="iu-curves__line" d={path} />
        {points.map(([x, y], i) => (
          <circle
            key={i}
            className="iu-curves__point"
            data-active={active === i ? '' : undefined}
            cx={x * W}
            cy={(1 - y) * H}
            r={4}
            tabIndex={0}
            role="slider"
            aria-label={`${labels.curvePoint} ${i + 1}`}
            aria-valuemin={0}
            aria-valuemax={255}
            aria-valuenow={Math.round(y * 255)}
            aria-valuetext={`${Math.round(x * 255)} → ${Math.round(y * 255)}`}
            onFocus={() => setActive(i)}
            onKeyDown={(e) => onPointKey(e, i)}
            onDoubleClick={() => removePoint(i)}
          />
        ))}
      </svg>
      <span id={hintId} className="iu-sr-only">
        {labels.curveHint}
      </span>
    </div>
  );
}

/** Width of an element in CSS px (drawn 1:1 so points stay round). */
function useMeasuredWidth(ref: RefObject<SVGSVGElement | null>): number {
  const [width, setWidth] = useState(256);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(1, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}
