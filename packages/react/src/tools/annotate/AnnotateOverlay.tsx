import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import {
  applyToPoint,
  boxCenter,
  createShapeId,
  getCropRect,
  getShapeBounds,
  getShapeBox,
  getShapeCorners,
  invert,
  measureTextHeight,
  moveShape,
  normalizeDegrees,
  resizeRotatedBox,
  setShapeBox,
  shapeAt,
  simplifyPoints,
  type Affine,
  type Box,
  type BoxHandle,
  type Point,
  type Shape,
  type TextShape,
} from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels } from '../../context';
import { LayersPanel } from './LayersPanel';
import { MODE_SHORTCUTS } from './AnnotateControls';
import { snapAngle, snapBox } from './snapping';
import {
  createPath,
  createShape,
  createText,
  getOrientedToStage,
  referenceSize,
  useAnnotateState,
  type AnnotateMode,
} from './state';

/** Screen distances (CSS px). */
const DRAG_START = 3;
const HIT_TOLERANCE = 6;
const SNAP = 6;
const ROTATE_HANDLE = 28;

const BOX_HANDLES: BoxHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type Interaction =
  | { kind: 'move'; pointerId: number; start: Point; shape: Shape }
  | { kind: 'resize'; pointerId: number; start: Point; shape: Shape; box: Box; handle: BoxHandle }
  | { kind: 'rotate'; pointerId: number; center: Point; startAngle: number; shape: Shape }
  | { kind: 'endpoint'; pointerId: number; index: 0 | 1; shape: Shape }
  | {
      kind: 'create';
      pointerId: number;
      mode: AnnotateMode;
      start: Point;
      startScreen: Point;
      id: string | null;
    }
  | { kind: 'pen'; pointerId: number; points: Point[]; id: string };

const textHeight = (s: Shape) => (s.type === 'text' ? measureTextHeight(s) : undefined);

/** Drawing, selection and transform handles for the Annotate tool (UI_VISION §6). */
export function AnnotateOverlay() {
  const store = useEditorStore();
  const labels = useLabels();
  const [ui, setUi] = useAnnotateState();
  const image = useEditorState((s) => s.image);
  const edit = useEditorState((s) => s.edit);
  const viewport = useEditorState((s) => s.viewport);
  const stage = useEditorState((s) => s.stageSize);
  const rootRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction | null>(null);
  const creatingText = useRef(false);
  const [guides, setGuides] = useState<{ x?: number; y?: number }[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [polygon, setPolygon] = useState<Point[]>([]);
  const [cursor, setCursor] = useState<Point | null>(null);

  const toStage: Affine | null = image ? getOrientedToStage(image, edit, viewport) : null;
  const fromStage = toStage ? invert(toStage) : null;
  /** Screen px per oriented px (average for a non-uniform resize). */
  const k = toStage ? Math.sqrt(Math.abs(toStage[0] * toStage[3] - toStage[1] * toStage[2])) : 1;
  const shapes = edit.annotations;
  const selected = shapes.find((s) => s.id === ui.selectedId && !s.hidden) ?? null;
  const editing =
    shapes.find((s): s is TextShape => s.id === ui.editingId && s.type === 'text') ?? null;
  const ref = image ? referenceSize(image, edit) : 1000;

  // Latest values for the window-level keyboard handler.
  const latest = useRef({ ui, selected, polygon, k, ref });
  useEffect(() => {
    latest.current = { ui, selected, polygon, k, ref };
  });

  const local = (event: { clientX: number; clientY: number }): Point => {
    const rect = rootRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const toO = (screen: Point): Point => applyToPoint(fromStage!, screen);
  const toS = (p: Point): Point => applyToPoint(toStage!, p);

  const update = (label: string, recipe: (shapes: Shape[]) => Shape[]) =>
    store.getState().update(label, (draft) => {
      draft.annotations = recipe(draft.annotations as Shape[]);
    });
  const replace = (label: string, shape: Shape) =>
    update(label, (list) => list.map((s) => (s.id === shape.id ? shape : s)));
  const select = (id: string | null) => setUi((u) => ({ ...u, selectedId: id }));

  /* ── Text editing ───────────────────────────────────────────────── */

  const startEditing = (shape: TextShape, isNew: boolean) => {
    creatingText.current = isNew;
    if (!isNew) store.getState().beginChange(labels.editText);
    setUi((u) => ({ ...u, selectedId: shape.id, editingId: shape.id }));
  };

  const commitText = () => {
    const state = store.getState();
    const current = state.edit.annotations.find((s) => s.id === latest.current.ui.editingId);
    if (!current || current.type !== 'text') return;
    if (current.text.trim() === '') {
      if (creatingText.current) state.cancelChange();
      else {
        update(labels.deleteShape, (list) => list.filter((s) => s.id !== current.id));
        state.endChange();
      }
      setUi((u) => ({ ...u, editingId: null, selectedId: null }));
    } else {
      state.endChange();
      setUi((u) => ({ ...u, editingId: null }));
    }
    creatingText.current = false;
  };

  /* ── Polygon ────────────────────────────────────────────────────── */

  const finishPolygon = (points: Point[]) => {
    setPolygon([]);
    if (points.length < 2) return;
    const shape = createPath(
      points,
      points.length >= 3,
      false,
      latest.current.ui.style,
      latest.current.ref,
    );
    update(labels.annotateModes.polygon, (list) => [...list, shape]);
    select(shape.id);
  };

  /* ── Pointer ────────────────────────────────────────────────────── */

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!image || event.button !== 0 || !fromStage) return;
    if ((event.target as HTMLElement).closest('.iu-textedit, .iu-layers')) return;
    // Take keyboard focus so Delete / Enter / Escape / shortcuts work after clicking the photo.
    rootRef.current?.focus({ preventScroll: true });
    if (ui.editingId) commitText();
    const screen = local(event);
    const p = toO(screen);
    const tol = HIT_TOLERANCE / k;
    const handle = (event.target as Element).closest('[data-handle]')?.getAttribute('data-handle');
    const capture = () => {
      event.stopPropagation();
      rootRef.current?.setPointerCapture(event.pointerId);
    };

    // 1. Handles of the selected shape.
    if (handle && selected && !selected.locked) {
      capture();
      if (handle === 'rotate') {
        const c = toS(boxCenter(getShapeBox(selected, textHeight(selected))));
        interaction.current = {
          kind: 'rotate',
          pointerId: event.pointerId,
          center: c,
          startAngle: Math.atan2(screen.y - c.y, screen.x - c.x),
          shape: selected,
        };
        store.getState().beginChange(labels.rotate);
      } else if (handle === 'p0' || handle === 'p1') {
        interaction.current = {
          kind: 'endpoint',
          pointerId: event.pointerId,
          index: handle === 'p0' ? 0 : 1,
          shape: selected,
        };
        store.getState().beginChange(labels.annotateModes.line);
      } else {
        interaction.current = {
          kind: 'resize',
          pointerId: event.pointerId,
          start: p,
          shape: selected,
          box: getShapeBox(selected, textHeight(selected)),
          handle: handle as BoxHandle,
        };
        store.getState().beginChange(labels.strokeWidth);
      }
      return;
    }

    // 2. Polygon: each click adds a point; clicking the first point closes it.
    if (ui.mode === 'polygon') {
      capture();
      const first = polygon[0];
      if (
        first &&
        polygon.length >= 3 &&
        Math.hypot(screen.x - toS(first).x, screen.y - toS(first).y) < 10
      ) {
        finishPolygon(polygon);
      } else {
        setPolygon((pts) => [...pts, p]);
      }
      return;
    }

    // 3. Pen: always draws.
    if (ui.mode === 'pen') {
      capture();
      const shape = createPath([p], false, true, ui.style, ref);
      store.getState().beginChange(labels.annotateModes.pen);
      update(labels.annotateModes.pen, (list) => [...list, shape]);
      interaction.current = { kind: 'pen', pointerId: event.pointerId, points: [p], id: shape.id };
      return;
    }

    const hit = shapeAt(shapes, p, tol, measureTextHeight);

    // 4. Text tool: click text to select, empty space to type.
    if (ui.mode === 'text' && !(hit && hit.type === 'text')) {
      capture();
      // Stop the browser's mouse-down focus change, which would blur the new text box at once.
      event.preventDefault();
      const shape = createText(p, ui.style, ref);
      store.getState().beginChange(labels.annotateModes.text);
      update(labels.annotateModes.text, (list) => [...list, shape]);
      startEditing(shape as TextShape, true);
      return;
    }

    // 5. Select / move (any tool can grab the already selected shape).
    if (hit && (ui.mode === 'select' || ui.mode === 'text' || hit.id === ui.selectedId)) {
      capture();
      select(hit.id);
      interaction.current = { kind: 'move', pointerId: event.pointerId, start: p, shape: hit };
      store.getState().beginChange(labels.annotateModes.select);
      return;
    }

    // 6. Shape tools start a new shape (created once the pointer moves).
    if (ui.mode !== 'select') {
      capture();
      interaction.current = {
        kind: 'create',
        pointerId: event.pointerId,
        mode: ui.mode,
        start: p,
        startScreen: screen,
        id: null,
      };
      return;
    }

    // 7. Empty space with Select: deselect and let the stage pan.
    select(null);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!image || !fromStage) return;
    const screen = local(event);
    const p = toO(screen);
    const it = interaction.current;
    if (ui.mode === 'polygon') setCursor(p);
    if (!it) {
      if (ui.mode === 'select')
        setHoverId(shapeAt(shapes, p, HIT_TOLERANCE / k, measureTextHeight)?.id ?? null);
      return;
    }
    if (it.pointerId !== event.pointerId) return;

    switch (it.kind) {
      case 'move': {
        const moved = moveShape(it.shape, p.x - it.start.x, p.y - it.start.y);
        if (event.altKey) {
          setGuides([]);
          replace(labels.annotateModes.select, moved);
          break;
        }
        const crop = getCropRect(image, edit.geometry);
        const targets = [
          crop,
          ...shapes
            .filter((s) => s.id !== it.shape.id && !s.hidden)
            .map((s) => getShapeBounds(s, textHeight(s))),
        ];
        const snap = snapBox(getShapeBounds(moved, textHeight(moved)), targets, SNAP / k);
        setGuides(snap.guides);
        replace(labels.annotateModes.select, moveShape(moved, snap.dx, snap.dy));
        break;
      }
      case 'resize': {
        const s = it.shape;
        const corner = it.handle.length === 2;
        const keepAspect =
          s.type === 'image'
            ? corner !== event.shiftKey
            : s.type === 'text'
              ? corner
              : event.shiftKey && corner;
        const box = resizeRotatedBox(
          it.box,
          s.rotation,
          it.handle,
          { x: p.x - it.start.x, y: p.y - it.start.y },
          keepAspect,
          4 / k,
        );
        replace(
          labels.strokeWidth,
          setShapeBox(s, box, {
            scaleText: s.type === 'text' && corner,
            ...(s.type === 'text' && { textHeight: it.box.height }),
          }),
        );
        break;
      }
      case 'rotate': {
        const angle = Math.atan2(screen.y - it.center.y, screen.x - it.center.x);
        const degrees = normalizeDegrees(
          it.shape.rotation + ((angle - it.startAngle) * 180) / Math.PI,
        );
        replace(labels.rotate, { ...it.shape, rotation: snapAngle(degrees, event.shiftKey) });
        break;
      }
      case 'endpoint': {
        if (it.shape.type !== 'line') break;
        const other = it.shape.points[it.index === 0 ? 1 : 0];
        const next = event.shiftKey ? snapLine(other, p) : p;
        const points = [...it.shape.points] as [Point, Point];
        points[it.index] = next;
        replace(labels.annotateModes.line, { ...it.shape, points });
        break;
      }
      case 'pen': {
        const last = it.points[it.points.length - 1]!;
        if (Math.hypot(p.x - last.x, p.y - last.y) * k < 2) break;
        it.points.push(p);
        const current = store.getState().edit.annotations.find((s) => s.id === it.id);
        if (current?.type === 'path')
          replace(labels.annotateModes.pen, { ...current, points: [...it.points] });
        break;
      }
      case 'create': {
        if (
          !it.id &&
          Math.hypot(screen.x - it.startScreen.x, screen.y - it.startScreen.y) < DRAG_START
        )
          break;
        const mode = it.mode as Parameters<typeof createShape>[0];
        let end = p;
        if (event.shiftKey)
          end =
            mode === 'line' || mode === 'arrow' ? snapLine(it.start, p) : squareEnd(it.start, p);
        const shape = createShape(mode, it.start, end, ui.style, ref);
        if (!it.id) {
          it.id = shape.id;
          store.getState().beginChange(labels.annotateModes[it.mode]);
          update(labels.annotateModes[it.mode], (list) => [...list, shape]);
          select(shape.id);
        } else {
          replace(labels.annotateModes[it.mode], { ...shape, id: it.id });
        }
        break;
      }
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const it = interaction.current;
    if (!it || it.pointerId !== event.pointerId) return;
    interaction.current = null;
    setGuides([]);
    if (it.kind === 'create' && !it.id) {
      // A click without dragging: drop a default-size shape centred on the point.
      const mode = it.mode as Parameters<typeof createShape>[0];
      const half = ref * 0.1;
      const from =
        mode === 'line' || mode === 'arrow'
          ? { x: it.start.x - half, y: it.start.y }
          : { x: it.start.x - half, y: it.start.y - half };
      const to =
        mode === 'line' || mode === 'arrow'
          ? { x: it.start.x + half, y: it.start.y }
          : { x: it.start.x + half, y: it.start.y + half };
      const shape = createShape(mode, from, to, ui.style, ref);
      update(labels.annotateModes[it.mode], (list) => [...list, shape]);
      select(shape.id);
      return;
    }
    if (it.kind === 'pen') {
      const current = store.getState().edit.annotations.find((s) => s.id === it.id);
      if (current?.type === 'path' && it.points.length > 2) {
        replace(labels.annotateModes.pen, {
          ...current,
          points: simplifyPoints(it.points, 0.75 / k),
        });
      }
      select(it.id);
    }
    if (it.kind !== 'create' || it.id) store.getState().endChange();
  };

  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!fromStage) return;
    if (ui.mode === 'polygon') {
      finishPolygon(polygon);
      return;
    }
    const hit = shapeAt(shapes, toO(local(event)), HIT_TOLERANCE / k, measureTextHeight);
    if (hit?.type === 'text' && !hit.locked) startEditing(hit, false);
  };

  /* ── Keyboard ───────────────────────────────────────────────────── */

  useEffect(() => {
    const root = rootRef.current?.closest('.iu-root');
    if (!root) return;
    const onKeyDown = (event: Event) => {
      const e = event as KeyboardEvent;
      const target = e.target as HTMLElement;
      if (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
        return;
      // Keys inside popovers / the layers panel belong to them (e.g. Escape closes the popover).
      if (target.closest('.iu-popover, .iu-layers')) return;
      const { ui: u, selected: sel, polygon: poly, k: scale, ref: r } = latest.current;
      const mod = e.metaKey || e.ctrlKey;
      const state = store.getState();

      if (e.key === 'Escape') {
        if (poly.length) setPolygon([]);
        else if (u.selectedId) setUi((v) => ({ ...v, selectedId: null }));
        else return;
      } else if (e.key === 'Enter') {
        if (poly.length) finishPolygon(poly);
        else if (sel?.type === 'text' && !sel.locked) startEditing(sel, false);
        else return;
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !sel.locked) {
        state.update(labels.deleteShape, (draft) => {
          draft.annotations = draft.annotations.filter((s) => s.id !== sel.id);
        });
        setUi((v) => ({ ...v, selectedId: null }));
      } else if (mod && e.key.toLowerCase() === 'd' && sel) {
        const copy = { ...moveShape(sel, r * 0.03, r * 0.03), id: createShapeId() };
        state.update(labels.duplicate, (draft) => {
          const index = draft.annotations.findIndex((s) => s.id === sel.id);
          draft.annotations.splice(index + 1, 0, copy);
        });
        setUi((v) => ({ ...v, selectedId: copy.id }));
      } else if (e.key.startsWith('Arrow') && sel && !sel.locked && !mod) {
        const step = (e.shiftKey ? 10 : 1) / scale;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const moved = moveShape(sel, dx, dy);
        state.update(labels.annotateModes.select, (draft) => {
          draft.annotations = draft.annotations.map((s) => (s.id === sel.id ? moved : s));
        });
      } else if (!mod && !e.altKey) {
        const mode = (Object.entries(MODE_SHORTCUTS) as [AnnotateMode, string][]).find(
          ([, key]) => key.toLowerCase() === e.key.toLowerCase(),
        )?.[0];
        if (!mode) return;
        setPolygon([]);
        setUi((v) => ({ ...v, mode }));
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads latest values from a ref
  }, [store]);

  // Leaving the tool mid-edit: commit text, drop an unfinished polygon.
  useEffect(
    () => () => {
      if (store.getState().pendingChange) store.getState().endChange();
      setUi((u) => ({ ...u, editingId: null }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!image || !toStage) return null;

  const poly = (points: Point[]) =>
    points
      .map((p) => toS(p))
      .map((p) => `${p.x},${p.y}`)
      .join(' ');
  const hover = hoverId && hoverId !== ui.selectedId ? shapes.find((s) => s.id === hoverId) : null;

  return (
    <div
      ref={rootRef}
      className="iu-annotate-layer"
      data-mode={ui.mode}
      tabIndex={-1}
      aria-label={labels.tools.annotate}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => setHoverId(null)}
      onDoubleClick={onDoubleClick}
    >
      <svg className="iu-annotate-layer__svg" width={stage.width} height={stage.height}>
        {hover && (
          <polygon
            className="iu-annotate__hover"
            points={poly(getShapeCorners(hover, textHeight(hover)))}
          />
        )}
        {guides.map((g, i) => {
          const crop = getCropRect(image, edit.geometry);
          const a = g.x !== undefined ? toS({ x: g.x, y: crop.y }) : toS({ x: crop.x, y: g.y! });
          const b =
            g.x !== undefined
              ? toS({ x: g.x, y: crop.y + crop.height })
              : toS({ x: crop.x + crop.width, y: g.y! });
          return (
            <line key={i} className="iu-annotate__guide" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          );
        })}
        {selected && !editing && <Selection shape={selected} toS={toS} />}
        {polygon.length > 0 && (
          <g className="iu-annotate__draft">
            <polyline points={poly(cursor ? [...polygon, cursor] : polygon)} />
            {polygon.map((p, i) => {
              const s = toS(p);
              return (
                <circle
                  key={i}
                  cx={s.x}
                  cy={s.y}
                  r={i === 0 ? 6 : 4}
                  data-first={i === 0 ? '' : undefined}
                />
              );
            })}
          </g>
        )}
      </svg>
      {editing && (
        <TextEditor
          shape={editing}
          toStage={toStage}
          scale={k}
          placeholder={labels.textPlaceholder}
          onChange={(text) => replace(labels.editText, { ...editing, text })}
          onDone={commitText}
        />
      )}
      {ui.layersOpen && (
        <LayersPanel
          shapes={shapes}
          selectedId={ui.selectedId}
          onSelect={(id) => select(id)}
          onClose={() => setUi((u) => ({ ...u, layersOpen: false }))}
        />
      )}
    </div>
  );
}

/** Outline + handles for the selected shape. */
function Selection({ shape, toS }: { shape: Shape; toS: (p: Point) => Point }) {
  const labels = useLabels();
  const corners = getShapeCorners(shape, textHeight(shape)).map(toS);
  const outline = corners.map((p) => `${p.x},${p.y}`).join(' ');
  if (shape.locked)
    return <polygon className="iu-annotate__selection" data-locked="" points={outline} />;

  if (shape.type === 'line') {
    return (
      <g>
        {shape.points.map((p, i) => {
          const s = toS(p);
          return (
            <circle
              key={i}
              className="iu-annotate__handle"
              data-handle={`p${i}`}
              cx={s.x}
              cy={s.y}
              r={6}
            />
          );
        })}
      </g>
    );
  }

  const [nw, ne, se, sw] = corners as [Point, Point, Point, Point];
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
  // Text keeps its height from the wrapped content: no top/bottom handles.
  const handles =
    shape.type === 'text' ? BOX_HANDLES.filter((h) => h !== 'n' && h !== 's') : BOX_HANDLES;
  // Rotation handle sits above the top edge, perpendicular to it.
  const top = at.n;
  const center = mid(nw, se);
  const len = Math.hypot(top.x - center.x, top.y - center.y) || 1;
  const rot = {
    x: top.x + ((top.x - center.x) / len) * ROTATE_HANDLE,
    y: top.y + ((top.y - center.y) / len) * ROTATE_HANDLE,
  };

  return (
    <g>
      <polygon className="iu-annotate__selection" points={outline} />
      <line className="iu-annotate__stem" x1={top.x} y1={top.y} x2={rot.x} y2={rot.y} />
      <circle
        className="iu-annotate__handle iu-annotate__handle--rotate"
        data-handle="rotate"
        cx={rot.x}
        cy={rot.y}
        r={6}
      >
        <title>{labels.rotate}</title>
      </circle>
      {handles.map((h) => (
        <rect
          key={h}
          className="iu-annotate__handle"
          data-handle={h}
          data-cursor={cursorFor(h, shape.rotation)}
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

/** In-place text editing with a transparent textarea matched to the canvas text. */
function TextEditor({
  shape,
  toStage,
  scale,
  placeholder,
  onChange,
  onDone,
}: {
  shape: TextShape;
  toStage: Affine;
  scale: number;
  placeholder: string;
  onChange: (text: string) => void;
  onDone: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    // Next frame: after the click that created the box has fully finished.
    const frame = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      // Caret at the end: re-editing shouldn't replace the text on the first keystroke.
      el.setSelectionRange(el.value.length, el.value.length);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const box = getShapeBox(shape, measureTextHeight(shape));
  const c = applyToPoint(toStage, boxCenter(box));
  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      onDone();
    }
  };
  return (
    <textarea
      ref={ref}
      className="iu-textedit"
      value={shape.text}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onKeyDown={onKeyDown}
      style={{
        left: c.x,
        top: c.y,
        width: box.width * scale,
        height: box.height * scale,
        transform: `translate(-50%, -50%) rotate(${shape.rotation}deg)`,
        // Separate longhand properties: mixing the `font` shorthand with `lineHeight` makes React warn
        // (a shorthand update on re-render can reset the line height).
        fontFamily: shape.fontFamily,
        fontSize: shape.fontSize * scale,
        fontWeight: shape.fontWeight,
        fontStyle: shape.fontStyle,
        lineHeight: shape.lineHeight,
        color: shape.color,
        textAlign: shape.align,
        background: shape.background ?? 'transparent',
        opacity: shape.opacity,
      }}
    />
  );
}

function snapLine(from: Point, to: Point): Point {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const snapped = (Math.round((angle * 180) / Math.PI / 15) * 15 * Math.PI) / 180;
  const len = Math.hypot(to.x - from.x, to.y - from.y);
  return { x: from.x + Math.cos(snapped) * len, y: from.y + Math.sin(snapped) * len };
}

function squareEnd(from: Point, to: Point): Point {
  const size = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  return {
    x: from.x + Math.sign(to.x - from.x || 1) * size,
    y: from.y + Math.sign(to.y - from.y || 1) * size,
  };
}

/** Resize cursor that matches the handle direction after rotation. */
function cursorFor(handle: BoxHandle, rotation: number): string {
  const base: Record<BoxHandle, number> = {
    n: 0,
    ne: 45,
    e: 90,
    se: 135,
    s: 180,
    sw: 225,
    w: 270,
    nw: 315,
  };
  const angle = (((base[handle] + rotation) % 180) + 180) % 180;
  const cursors = ['ns', 'nesw', 'ew', 'nwse'];
  return cursors[Math.round(angle / 45) % 4]!;
}
