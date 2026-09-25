import { useEffect, useRef, useState, type PointerEvent } from 'react';
import {
  applyToPoint,
  invert,
  moveRedaction,
  redactionAt,
  redactionBounds,
  resizeRotatedBox,
  boxCenter,
  normalizeDegrees,
  rotatePoint,
  redactionCorners,
  resizeRedaction,
  simplifyPoints,
  type Box,
  type BoxHandle,
  type Point,
  type Redaction,
} from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels } from '../../context';
import { cursorFor } from '../annotate/AnnotateOverlay';
import { snapAngle } from '../annotate/snapping';
import { getOrientedToStage } from '../annotate/state';
import { createRedactId, redactRef, useRedactState } from './state';

/** Screen distances (CSS px). */
const DRAG_START = 3;
const HIT_TOLERANCE = 4;
const BOX_HANDLES: BoxHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const ROTATE_HANDLE = 28;

type Interaction =
  | {
      kind: 'box';
      pointerId: number;
      start: Point;
      startScreen: Point;
      id: string | null;
      hitId: string | null;
    }
  | { kind: 'brush'; pointerId: number; points: Point[]; id: string; hitId: string | null }
  | { kind: 'move'; pointerId: number; start: Point; area: Redaction }
  | { kind: 'rotate'; pointerId: number; center: Point; startAngle: number; area: Redaction }
  | {
      kind: 'resize';
      pointerId: number;
      start: Point;
      area: Redaction;
      /** The area's outer bounds when the drag started. */
      bounds: Box;
      handle: BoxHandle;
    };

/** Drawing and editing redaction areas on the photo (UI_VISION §5b "Redact stage"). */
export function RedactOverlay() {
  const store = useEditorStore();
  const labels = useLabels();
  const [ui, setUi] = useRedactState();
  const image = useEditorState((s) => s.image);
  const edit = useEditorState((s) => s.edit);
  const viewport = useEditorState((s) => s.viewport);
  const stage = useEditorState((s) => s.stageSize);
  const rootRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  /** Cursor for what's under the pointer / what the current drag does (see `data-cursor`). */
  const [hoverCursor, setHoverCursor] = useState<string | undefined>(undefined);
  const [dragCursor, setDragCursor] = useState<string | undefined>(undefined);

  const toStage = image ? getOrientedToStage(image, edit, viewport) : null;
  const fromStage = toStage ? invert(toStage) : null;
  const k = toStage ? Math.abs(toStage[0]) : 1;
  const list = edit.redactions;
  const selected = list.find((r) => r.id === ui.selectedId) ?? null;
  const ref = image ? redactRef(image, edit) : 1000;
  const brushSize = (ui.brushSize / 100) * ref;

  const latest = useRef({ selected });
  useEffect(() => {
    latest.current = { selected };
  });

  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = rootRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const toO = (screen: Point): Point => applyToPoint(fromStage!, screen);
  const toS = (p: Point): Point => applyToPoint(toStage!, p);
  const select = (id: string | null) => setUi((u) => ({ ...u, selectedId: id }));
  const replace = (label: string, area: Redaction) =>
    store.getState().update(label, (draft) => {
      draft.redactions = draft.redactions.map((r) => (r.id === area.id ? area : r));
    });
  const add = (label: string, area: Redaction) =>
    store.getState().update(label, (draft) => {
      draft.redactions.push(area);
    });
  const newArea = () => ({
    id: createRedactId(),
    rotation: 0,
    style: ui.style,
    strength: ui.strength,
    color: ui.color,
  });

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerDown(event);
    setDragCursor(dragCursorFor(interaction.current));
  };

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!image || event.button !== 0 || !fromStage) return;
    rootRef.current?.focus({ preventScroll: true });
    const screen = local(event);
    const p = toO(screen);
    const capture = () => {
      event.stopPropagation();
      rootRef.current?.setPointerCapture(event.pointerId);
    };
    const handle = (event.target as Element).closest('[data-handle]')?.getAttribute('data-handle');

    // 1. Rotate / resize handles of the selected area (box or brush).
    if (handle === 'rotate' && selected) {
      capture();
      const center = toS(boxCenter(redactionBounds(selected)));
      interaction.current = {
        kind: 'rotate',
        pointerId: event.pointerId,
        center,
        startAngle: Math.atan2(screen.y - center.y, screen.x - center.x),
        area: selected,
      };
      store.getState().beginChange(labels.rotate);
      return;
    }
    if (handle && selected) {
      capture();
      interaction.current = {
        kind: 'resize',
        pointerId: event.pointerId,
        start: p,
        area: selected,
        bounds: redactionBounds(selected),
        handle: handle as BoxHandle,
      };
      store.getState().beginChange(labels.redactArea);
      return;
    }

    const hit = redactionAt(list, p, HIT_TOLERANCE / k);

    // 2. The selected area: a press anywhere inside its outline moves it (for a brush area too,
    //    not only on the painted stroke).
    if (selected && insideArea(selected, p, HIT_TOLERANCE / k)) {
      capture();
      interaction.current = { kind: 'move', pointerId: event.pointerId, start: p, area: selected };
      store.getState().beginChange(labels.redactMove);
      return;
    }

    capture();
    // 3. Brush: paints (also over areas); a click without painting on an area selects it.
    if (ui.mode === 'brush') {
      const area: Redaction = { ...newArea(), kind: 'brush', points: [p], size: brushSize };
      store.getState().beginChange(labels.redactArea);
      add(labels.redactArea, area);
      interaction.current = {
        kind: 'brush',
        pointerId: event.pointerId,
        points: [p],
        id: area.id,
        hitId: hit?.id ?? null,
      };
      return;
    }

    // 4. Box: drag draws; a click selects the area under it (or deselects).
    interaction.current = {
      kind: 'box',
      pointerId: event.pointerId,
      start: p,
      startScreen: screen,
      id: null,
      hitId: hit?.id ?? null,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!image || !fromStage) return;
    const screen = local(event);
    const p = toO(screen);
    const it = interaction.current;
    if (!it) {
      const over = redactionAt(list, p, HIT_TOLERANCE / k);
      setHoverId(over?.id ?? null);
      // Anywhere inside the selected outline a drag moves it; over another area a click selects it.
      const onSelected = selected && insideArea(selected, p, HIT_TOLERANCE / k);
      setHoverCursor(onSelected ? 'move' : over ? 'pointer' : undefined);
      return;
    }
    if (it.pointerId !== event.pointerId) return;

    switch (it.kind) {
      case 'box': {
        if (
          !it.id &&
          Math.hypot(screen.x - it.startScreen.x, screen.y - it.startScreen.y) < DRAG_START
        )
          break;
        const box = {
          x: Math.min(it.start.x, p.x),
          y: Math.min(it.start.y, p.y),
          width: Math.max(1, Math.abs(p.x - it.start.x)),
          height: Math.max(1, Math.abs(p.y - it.start.y)),
        };
        if (!it.id) {
          const area: Redaction = { ...newArea(), kind: 'box', ...box };
          it.id = area.id;
          store.getState().beginChange(labels.redactArea);
          add(labels.redactArea, area);
          select(area.id);
        } else {
          const current = store.getState().edit.redactions.find((r) => r.id === it.id);
          if (current?.kind === 'box') replace(labels.redactArea, { ...current, ...box });
        }
        break;
      }
      case 'brush': {
        const last = it.points[it.points.length - 1]!;
        if (Math.hypot(p.x - last.x, p.y - last.y) * k < 2) break;
        it.points.push(p);
        const current = store.getState().edit.redactions.find((r) => r.id === it.id);
        if (current?.kind === 'brush')
          replace(labels.redactArea, { ...current, points: [...it.points] });
        break;
      }
      case 'move':
        replace(labels.redactMove, moveRedaction(it.area, p.x - it.start.x, p.y - it.start.y));
        break;
      case 'rotate': {
        const angle = Math.atan2(screen.y - it.center.y, screen.x - it.center.x);
        const degrees = normalizeDegrees(
          it.area.rotation + ((angle - it.startAngle) * 180) / Math.PI,
        );
        replace(labels.rotate, { ...it.area, rotation: snapAngle(degrees, event.shiftKey) });
        break;
      }
      case 'resize': {
        const bounds = resizeRotatedBox(
          it.bounds,
          it.area.rotation,
          it.handle,
          { x: p.x - it.start.x, y: p.y - it.start.y },
          event.shiftKey,
          4 / k,
        );
        replace(labels.redactArea, resizeRedaction(it.area, bounds));
        break;
      }
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    setDragCursor(undefined);
    const it = interaction.current;
    if (!it || it.pointerId !== event.pointerId) return;
    interaction.current = null;
    const state = store.getState();
    if (it.kind === 'box' && !it.id) {
      select(it.hitId); // a click: pick the area under it, or deselect
      return;
    }
    if (it.kind === 'brush') {
      if (it.points.length === 1 && it.hitId) {
        state.cancelChange(); // a click on an area selects it instead of painting a dot
        select(it.hitId);
        return;
      }
      const current = state.edit.redactions.find((r) => r.id === it.id);
      if (current?.kind === 'brush' && it.points.length > 2) {
        replace(labels.redactArea, { ...current, points: simplifyPoints(it.points, 0.75 / k) });
      }
      select(it.id);
    }
    state.endChange();
  };

  // Delete / Backspace removes the selected area, Escape deselects.
  useEffect(() => {
    const root = rootRef.current?.closest('.iu-root');
    if (!root) return;
    const onKeyDown = (event: Event) => {
      const e = event as KeyboardEvent;
      const target = e.target as HTMLElement;
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
        return;
      if (target.closest('.iu-popover, .iu-compare')) return;
      const sel = latest.current.selected;
      if (!sel) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        store.getState().update(labels.redactDelete, (draft) => {
          draft.redactions = draft.redactions.filter((r) => r.id !== sel.id);
        });
        setUi((u) => ({ ...u, selectedId: null }));
      } else if (e.key === 'Escape') {
        setUi((u) => ({ ...u, selectedId: null }));
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads latest values from a ref
  }, [store]);

  // Leaving the tool mid-drag: close the open step.
  useEffect(
    () => () => {
      if (store.getState().pendingChange) store.getState().endChange();
    },
    [store],
  );

  if (!image || !toStage) return null;

  const outline = (area: Redaction) => redactionCorners(area).map(toS);
  const points = (corners: Point[]) => corners.map((c) => `${c.x},${c.y}`).join(' ');
  const hover = hoverId && hoverId !== ui.selectedId ? list.find((r) => r.id === hoverId) : null;

  return (
    <div
      ref={rootRef}
      className="iu-annotate-layer iu-redact-layer"
      data-mode={ui.mode}
      data-cursor={dragCursor ?? hoverCursor}
      tabIndex={-1}
      aria-label={labels.tools.redact}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        setHoverId(null);
        setHoverCursor(undefined);
      }}
    >
      <svg className="iu-annotate-layer__svg" width={stage.width} height={stage.height}>
        {hover && <polygon className="iu-annotate__hover" points={points(outline(hover))} />}
        {selected && (
          <SelectionOutline
            corners={outline(selected) as [Point, Point, Point, Point]}
            rotation={selected.rotation}
            label={labels.rotate}
          />
        )}
      </svg>
    </div>
  );
}

/** Outline, 8 resize handles and the rotate handle — the same for boxes and brush areas. */
function SelectionOutline({
  corners,
  rotation,
  label,
}: {
  corners: [Point, Point, Point, Point];
  rotation: number;
  label: string;
}) {
  const [nw, ne, se, sw] = corners;
  const mid = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const at: Record<BoxHandle, Point> = {
    nw,
    ne,
    se,
    sw,
    n: mid(nw, ne),
    e: mid(ne, se),
    s: mid(se, sw),
    w: mid(sw, nw),
  };
  // Rotate handle: above the top edge, perpendicular to it.
  const top = at.n;
  const center = mid(nw, se);
  const len = Math.hypot(top.x - center.x, top.y - center.y) || 1;
  const knob = {
    x: top.x + ((top.x - center.x) / len) * ROTATE_HANDLE,
    y: top.y + ((top.y - center.y) / len) * ROTATE_HANDLE,
  };
  return (
    <g>
      <polygon
        className="iu-annotate__selection"
        points={corners.map((c) => `${c.x},${c.y}`).join(' ')}
      />
      <line className="iu-annotate__stem" x1={top.x} y1={top.y} x2={knob.x} y2={knob.y} />
      <circle
        className="iu-annotate__handle iu-annotate__handle--rotate"
        data-handle="rotate"
        cx={knob.x}
        cy={knob.y}
        r={6}
      >
        <title>{label}</title>
      </circle>
      {BOX_HANDLES.map((h) => (
        <rect
          key={h}
          className="iu-annotate__handle"
          data-handle={h}
          data-cursor={cursorFor(h, rotation)}
          x={at[h].x - 5}
          y={at[h].y - 5}
          width={10}
          height={10}
          rx={2}
        />
      ))}
    </g>
  );
}

/** Is `point` inside the area's (rotated) outline? */
function insideArea(area: Redaction, point: Point, tolerance: number): boolean {
  const box = redactionBounds(area);
  const p = area.rotation ? rotatePoint(point, boxCenter(box), -area.rotation) : point;
  return (
    p.x >= box.x - tolerance &&
    p.x <= box.x + box.width + tolerance &&
    p.y >= box.y - tolerance &&
    p.y <= box.y + box.height + tolerance
  );
}

/** Cursor while a drag is under way (the pointer is captured, so the layer's cursor shows). */
function dragCursorFor(it: Interaction | null): string | undefined {
  if (!it) return undefined;
  if (it.kind === 'resize') return cursorFor(it.handle, it.area.rotation);
  if (it.kind === 'move' || it.kind === 'rotate') return 'grabbing';
  return undefined; // drawing: keep the tool's crosshair
}
