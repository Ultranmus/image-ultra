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
  boxesIntersect,
  getCanvasRect,
  getCropRect,
  getShapeBounds,
  getShapeBox,
  getShapeCorners,
  groupBounds,
  invert,
  measureTextHeight,
  moveShape,
  normalizeDegrees,
  pointsBox,
  resizeRotatedBox,
  rotatePoint,
  rotateShapes,
  scaleShapes,
  setShapeBox,
  shapeAt,
  simplifyPoints,
  TEXT_WRAP_SLACK,
  textIndexAt,
  type Affine,
  type Box,
  type BoxHandle,
  type Point,
  type Shape,
  type TextShape,
} from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels, useWatermarkLocked } from '../../context';
import { createRedactBox, createRedactBrush, type RedactDraw } from '../redact/state';
import { elementsOf, WATERMARK_ELEMENT_ID } from './watermarkElement';
import { shapeActions } from './actions';
import { LayersPanel } from './LayersPanel';
import { GroupMenu } from './GroupMenu';
import { ShapeMenu } from './ShapeMenu';

import { snapAngle, snapBox } from './snapping';
import {
  createPath,
  createShape,
  createText,
  getAnnotateState,
  getOrientedToStage,
  MODE_SHORTCUTS,
  referenceSize,
  selectionIds,
  selectPatch,
  useAnnotateState,
  type AnnotateMode,
} from './state';

/** Screen distances (CSS px). */
const DRAG_START = 3;
const HIT_TOLERANCE = 6;
const SNAP = 6;
const ROTATE_HANDLE = 28;
/** Touch long-press that opens the shape menu (iOS has no native `contextmenu` event). */
const LONG_PRESS_MS = 500;

const BOX_HANDLES: BoxHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type Interaction =
  | {
      kind: 'move';
      pointerId: number;
      start: Point;
      startScreen: Point;
      shape: Shape;
      /** Text tool on a text box: a click (no drag) starts editing it instead. */
      editOnClick: boolean;
      dragged: boolean;
    }
  | { kind: 'resize'; pointerId: number; start: Point; shape: Shape; box: Box; handle: BoxHandle }
  | { kind: 'rotate'; pointerId: number; center: Point; startAngle: number; shape: Shape }
  | { kind: 'endpoint'; pointerId: number; index: 0 | 1; shape: Shape }
  | {
      kind: 'create';
      pointerId: number;
      mode: DrawMode;
      start: Point;
      startScreen: Point;
      id: string | null;
      /** Shape under the pointer: a click (no drag) selects it instead of drawing. */
      hitId: string | null;
    }
  | { kind: 'pen'; pointerId: number; points: Point[]; id: string; hitId: string | null }
  /* A multi-selection moves, resizes (corners, proportional) and rotates as one. */
  | {
      kind: 'groupMove';
      pointerId: number;
      start: Point;
      startScreen: Point;
      shapes: Shape[];
      dragged: boolean;
      /** The member pressed: a click without dragging selects only it. */
      clickId: string | null;
    }
  | {
      kind: 'groupScale';
      pointerId: number;
      /** Opposite corner of the group box (stays put). */
      anchor: Point;
      box: Box;
      handle: BoxHandle;
      shapes: Shape[];
    }
  | {
      kind: 'groupRotate';
      pointerId: number;
      /** Centre in stage px (for the angle) and oriented px (to turn around). */
      center: Point;
      centerO: Point;
      startAngle: number;
      box: Box;
      shapes: Shape[];
    }
  /* Mouse drag on empty space with Select: a selection box (Shift adds to the selection). */
  | { kind: 'marquee'; pointerId: number; start: Point; base: string[] };

/** Editor elements a press on which keeps the current selection. */
const INTERACTIVE =
  'button, input, select, textarea, label, a[href], [role="slider"], [role="radio"], [role="tab"], [role="menuitem"], [contenteditable="true"]';

const textHeight = (s: Shape) => (s.type === 'text' ? measureTextHeight(s) : undefined);

/** Drawing, selection and transform handles for the Annotate tool (UI_VISION §6). */
export interface AnnotateOverlayProps {
  /**
   * Only select / move / resize / rotate (the Sticker tool): no drawing, no tool shortcuts.
   * The tool keeps its own selection (tool state is per tool).
   */
  selectOnly?: boolean;
  /**
   * The Redact tool: draw redaction areas (box or brush) with this look. Selecting, moving and
   * grouping work as everywhere else.
   */
  redact?: RedactDraw | null;
}

/** Annotate's tools, plus drawing redaction areas (the Redact tool). */
type DrawMode = AnnotateMode | 'redactBox' | 'redactBrush';

export function AnnotateOverlay({ selectOnly = false, redact = null }: AnnotateOverlayProps = {}) {
  const store = useEditorStore();
  const labels = useLabels();
  const [storedUi, setUi] = useAnnotateState();
  const ui =
    selectOnly && storedUi.mode !== 'select' ? { ...storedUi, mode: 'select' as const } : storedUi;
  const image = useEditorState((s) => s.image);
  const edit = useEditorState((s) => s.edit);
  const viewport = useEditorState((s) => s.viewport);
  const stage = useEditorState((s) => s.stageSize);
  const rootRef = useRef<HTMLDivElement>(null);
  const interaction = useRef<Interaction | null>(null);
  const creatingText = useRef(false);
  const [guides, setGuides] = useState<{ x?: number; y?: number }[]>([]);
  const [hoverId, setHoverId] = useState<string | null>(null);
  /** Cursor for what's under the pointer / what the current drag does (see `data-cursor`). */
  const [hoverCursor, setHoverCursor] = useState<string | undefined>(undefined);
  const [dragCursor, setDragCursor] = useState<string | undefined>(undefined);
  const [polygon, setPolygon] = useState<Point[]>([]);
  // Switching tools (ControlBar, shortcut, anywhere) drops an unfinished polygon, like Esc.
  // Adjusted during render (React's pattern for resetting state when a value changes).
  const [polygonMode, setPolygonMode] = useState(ui.mode);
  if (polygonMode !== ui.mode) {
    setPolygonMode(ui.mode);
    if (polygon.length > 0) setPolygon([]);
  }
  const [cursor, setCursor] = useState<Point | null>(null);
  /** Selection box being dragged (stage px). */
  const [marquee, setMarquee] = useState<{ a: Point; b: Point } | null>(null);
  /** A group being rotated: its box turns with it until the drag ends. */
  const [groupFrame, setGroupFrame] = useState<{ box: Box; angle: number } | null>(null);
  /** Space held: presses pass through to the stage, which pans (like Figma / Canva). */
  const [spaceHeld, setSpaceHeld] = useState(false);
  const spaceRef = useRef(false);
  /** How the text editor opens: everything selected (new box) or the caret at an index. */
  const [editCaret, setEditCaret] = useState<number | 'all'>('all');
  /** Open shape menu: which shape, and where on the stage it opens. */
  /** `group`: the menu for the whole multi-selection (right-click on one of its members). */
  const [menu, setMenu] = useState<{ shapeId: string; at: Point; group?: boolean } | null>(null);
  const [revealLayer, setRevealLayer] = useState<{ id: string } | null>(null);
  const longPress = useRef<{ timer: number; screen: Point } | null>(null);
  const keepMenuFocus = useRef(false);
  const toStage: Affine | null = image ? getOrientedToStage(image, edit, viewport) : null;
  const fromStage = toStage ? invert(toStage) : null;
  /** Screen px per oriented px (average for a non-uniform resize). */
  const k = toStage ? Math.sqrt(Math.abs(toStage[0] * toStage[3] - toStage[1] * toStage[2])) : 1;
  const redactRef = useRef(redact);
  useEffect(() => {
    redactRef.current = redact;
  });
  const watermarkLocked = useWatermarkLocked();
  const watermarkLockedRef = useRef(watermarkLocked);
  useEffect(() => {
    watermarkLockedRef.current = watermarkLocked;
  });
  /** Every element on the photo, the watermark's box included (see `watermarkElement.ts`). */
  const shapes = elementsOf(image, edit, watermarkLocked);
  const mode: DrawMode = redact ? (redact.mode === 'box' ? 'redactBox' : 'redactBrush') : ui.mode;
  /** History label for drawing with `m`. */
  const modeLabel = (m: DrawMode) =>
    m === 'redactBox' || m === 'redactBrush' ? labels.redactArea : labels.annotateModes[m];
  const selected = shapes.find((s) => s.id === ui.selectedId && !s.hidden) ?? null;
  const selectedIds = selectionIds(ui);
  /** A multi-selection (visible members; locked ones may be in it but never move). */
  const group =
    selectedIds.length > 1 ? shapes.filter((s) => selectedIds.includes(s.id) && !s.hidden) : [];
  const isGroup = group.length > 1;
  /** The members a group move / resize / rotate changes. */
  const movableGroup = group.filter((s) => !s.locked);
  const groupBox = isGroup ? groupBounds(group, measureTextHeight) : null;
  const editing =
    shapes.find((s): s is TextShape => s.id === ui.editingId && s.type === 'text') ?? null;
  const ref = image ? referenceSize(image, edit) : 1000;

  // Latest values for the window-level keyboard handler.
  const latest = useRef({ ui, selected, polygon, k, ref, menu, toStage, group, isGroup, groupBox });
  const commitRef = useRef(() => {});
  /** The current drag started on a handle of the text being edited (editing continues after). */
  const handleWhileEditing = useRef(false);
  useEffect(() => {
    latest.current = { ui, selected, polygon, k, ref, menu, toStage, group, isGroup, groupBox };
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
  const replace = (label: string, shape: Shape) => actions.replaceMany(label, [shape]);
  /** Is this point (oriented px) on the result — the photo or space added around it? */
  const onPhoto = (p: Point): boolean => {
    if (!image) return false;
    const crop = getCanvasRect(image, edit);
    return (
      p.x >= crop.x && p.x <= crop.x + crop.width && p.y >= crop.y && p.y <= crop.y + crop.height
    );
  };
  const select = (id: string | null) => setUi((u) => ({ ...u, ...selectPatch(id ? [id] : []) }));
  const selectMany = (ids: readonly string[]) => setUi((u) => ({ ...u, ...selectPatch(ids) }));
  /** A click on a shape with a drawing tool: switch to Select and select it. */
  const selectWithSelectTool = (id: string) => {
    setPolygon([]);
    setUi((u) => ({ ...u, mode: 'select', ...selectPatch([id]) }));
  };
  /** Shapes that can join a multi-selection. */
  /** Shapes that can join a multi-selection: locked ones too (so a locked group can be unlocked). */
  const selectable = (s: Shape) => !s.hidden;
  const actions = shapeActions(store, labels);

  /* ── Shape menu ─────────────────────────────────────────────────── */

  const openMenu = (shapeId: string, at: Point) => {
    keepMenuFocus.current = false;
    // On a member of a multi-selection: the group menu, and the group stays selected.
    const { isGroup: multi, group: grp } = latest.current;
    if (multi && grp.some((s) => s.id === shapeId)) {
      setMenu({ shapeId, at, group: true });
      return;
    }
    select(shapeId);
    setMenu({ shapeId, at });
  };
  /**
   * Is a right-click / long-press at `screen` for the group? Anywhere inside the group's box counts
   * (also the empty space between members), unless another shape is on top there.
   */
  const groupMenuTarget = (screen: Point, hit: Shape | null): boolean => {
    const { isGroup: multi, groupBox: gb, group: grp } = latest.current;
    if (!multi || !gb || !fromStage) return false;
    if (hit && !grp.some((s) => s.id === hit.id)) return false;
    return insideRect(gb, toO(screen), HIT_TOLERANCE / k);
  };
  const openGroupMenu = (at: Point) => {
    const first = latest.current.group[0];
    if (!first) return;
    keepMenuFocus.current = false;
    setMenu({ shapeId: first.id, at, group: true });
  };
  /** Menu for the selection, opened from the keyboard: anchored below its centre. */
  const openMenuForSelection = () => {
    const { selected: sel, toStage: m, isGroup: multi, groupBox: gb, group: grp } = latest.current;
    if (multi && gb && m && grp[0]) {
      const bottom = applyToPoint(m, { x: gb.x + gb.width / 2, y: gb.y + gb.height });
      keepMenuFocus.current = false;
      setMenu({ shapeId: grp[0].id, at: bottom, group: true });
      return true;
    }
    if (!sel || !m) return false;
    const corners = getShapeCorners(sel, textHeight(sel)).map((c) => applyToPoint(m, c));
    const x = corners.reduce((sum, c) => sum + c.x, 0) / corners.length;
    const y = Math.max(...corners.map((c) => c.y));
    keepMenuFocus.current = false;
    setMenu({ shapeId: sel.id, at: { x, y } });
    return true;
  };
  const cancelLongPress = () => {
    if (longPress.current) window.clearTimeout(longPress.current.timer);
    longPress.current = null;
  };
  /* ── Text editing ───────────────────────────────────────────────── */

  /** Opens the in-place editor. `caret`: index to put the caret at; default = end of the text. */
  const startEditing = (shape: TextShape, isNew: boolean, caret?: number) => {
    creatingText.current = isNew;
    if (!isNew) store.getState().beginChange(labels.editText);
    setEditCaret(isNew ? 'all' : (caret ?? shape.text.length));
    setUi((u) => ({ ...u, ...selectPatch([shape.id]), editingId: shape.id }));
  };

  /** Leaves the editor. Text never vanishes: an emptied box gets its default text back. */
  const commitText = () => {
    const state = store.getState();
    const current = state.edit.annotations.find((s) => s.id === latest.current.ui.editingId);
    if (!current || current.type !== 'text') return;
    if (current.text.trim() === '')
      replace(labels.editText, { ...current, text: labels.textDefault });
    state.endChange();
    setUi((u) => ({ ...u, editingId: null }));
    creatingText.current = false;
  };

  useEffect(() => {
    commitRef.current = commitText;
  });

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
    pointerDown(event);
    setDragCursor(dragCursorFor(interaction.current));
  };

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!image || event.button !== 0 || !fromStage) return;
    if ((event.target as HTMLElement).closest('.iu-textedit, .iu-layers')) {
      // The text editor / Layers panel handle their own presses (no stage pan or zoom).
      event.stopPropagation();
      return;
    }
    // Space + drag pans the photo: leave the press to the stage.
    if (spaceRef.current) return;
    const handle = (event.target as Element).closest('[data-handle]')?.getAttribute('data-handle');
    // A handle of the text box being edited: resize/rotate it and keep typing (like Canva). Keep the
    // focus in the text box — no blur, so editing doesn't end.
    const editingHandle = Boolean(handle && ui.editingId && selected?.id === ui.editingId);
    handleWhileEditing.current = editingHandle;
    if (editingHandle) {
      event.preventDefault();
    } else {
      // Take keyboard focus so Delete / Enter / Escape / shortcuts work after clicking the photo.
      rootRef.current?.focus({ preventScroll: true });
      if (ui.editingId) commitText();
    }
    const screen = local(event);
    cancelLongPress();
    if (event.pointerType === 'touch') {
      longPress.current = {
        screen,
        timer: window.setTimeout(() => onLongPress(screen), LONG_PRESS_MS),
      };
    }
    const p = toO(screen);
    const tol = HIT_TOLERANCE / k;
    // While editing, the resize joins the open "Edit text" step instead of starting its own.
    const beginChange = (label: string) => {
      if (!editingHandle) store.getState().beginChange(label);
    };
    const capture = () => {
      event.stopPropagation();
      rootRef.current?.setPointerCapture(event.pointerId);
    };

    // 1a. Handles of a multi-selection: corners resize it (proportionally), the round one turns it.
    if (handle && isGroup && groupBox && movableGroup.length > 0) {
      capture();
      if (handle === 'rotate') {
        const centerO = boxCenter(groupBox);
        const c = toS(centerO);
        interaction.current = {
          kind: 'groupRotate',
          pointerId: event.pointerId,
          center: c,
          centerO,
          startAngle: Math.atan2(screen.y - c.y, screen.x - c.x),
          box: groupBox,
          shapes: movableGroup,
        };
        store.getState().beginChange(labels.rotate);
      } else {
        const h = handle as BoxHandle;
        interaction.current = {
          kind: 'groupScale',
          pointerId: event.pointerId,
          anchor: {
            x: h.includes('w') ? groupBox.x + groupBox.width : groupBox.x,
            y: h.includes('n') ? groupBox.y + groupBox.height : groupBox.y,
          },
          box: groupBox,
          handle: h,
          shapes: movableGroup,
        };
        store.getState().beginChange(labels.resizeSelection);
      }
      return;
    }

    // 1. Handles of the selected shape.
    if (handle && !isGroup && selected && !selected.locked) {
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
        beginChange(labels.rotate);
      } else if (handle === 'p0' || handle === 'p1') {
        interaction.current = {
          kind: 'endpoint',
          pointerId: event.pointerId,
          index: handle === 'p0' ? 0 : 1,
          shape: selected,
        };
        beginChange(labels.annotateModes.line);
      } else {
        interaction.current = {
          kind: 'resize',
          pointerId: event.pointerId,
          start: p,
          shape: selected,
          box: getShapeBox(selected, textHeight(selected)),
          handle: handle as BoxHandle,
        };
        beginChange(labels.strokeWidth);
      }
      return;
    }

    const hit = shapeAt(shapes, p, tol, measureTextHeight);
    const move = (shape: Shape, editOnClick = false) => {
      interaction.current = {
        kind: 'move',
        pointerId: event.pointerId,
        start: p,
        startScreen: screen,
        shape,
        editOnClick,
        dragged: false,
      };
      store.getState().beginChange(labels.annotateModes.select);
    };

    // Shift-click with Select: add the shape to the selection, or take it out.
    // (Any tool: with a drawing tool, Shift only changes a drag — a click on a shape is a select.)
    if (event.shiftKey && hit && selectable(hit)) {
      event.stopPropagation();
      const current = selectedIds.filter((id) => shapes.some((s) => s.id === id && selectable(s)));
      selectMany(
        current.includes(hit.id) ? current.filter((id) => id !== hit.id) : [...current, hit.id],
      );
      return;
    }

    // A multi-selection: a press inside its box (on a member, or between them) moves all of it.
    if (
      isGroup &&
      groupBox &&
      (!hit || selectedIds.includes(hit.id)) &&
      insideRect(groupBox, p, tol)
    ) {
      capture();
      interaction.current = {
        kind: 'groupMove',
        pointerId: event.pointerId,
        start: p,
        startScreen: screen,
        shapes: movableGroup,
        dragged: false,
        clickId: hit?.id ?? null,
      };
      store.getState().beginChange(labels.annotateModes.select);
      return;
    }

    // 2. Anywhere inside the selected shape's box (e.g. the empty middle of a line or polygon),
    //    unless another shape on top is under the pointer: move it.
    if (
      !isGroup &&
      selected &&
      !selected.locked &&
      (!hit || hit.id === selected.id) &&
      insideBox(selected, p, tol)
    ) {
      capture();
      move(selected, selected.type === 'text');
      return;
    }

    // 3. Select tool, or grabbing the already selected shape with any tool: move it.
    if (hit && (mode === 'select' || hit.id === ui.selectedId)) {
      capture();
      select(hit.id);
      // Text: a click on the box that's already selected (or any box with the Text tool) edits it.
      move(hit, hit.type === 'text' && (mode === 'text' || hit.id === ui.selectedId));
      return;
    }

    // 3. Text tool on a text box: a click edits it (caret where clicked), a drag moves it.
    if (mode === 'text' && hit?.type === 'text') {
      capture();
      event.preventDefault();
      select(hit.id);
      move(hit, true);
      return;
    }

    // 4. Text / Polygon (before its first point) on another shape: switch to Select, pick it up.
    if (hit && (mode === 'text' || (mode === 'polygon' && polygon.length === 0))) {
      capture();
      selectWithSelectTool(hit.id);
      move(hit);
      return;
    }

    // 5. Polygon: each click adds a point; clicking the first point closes it.
    if (mode === 'polygon') {
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

    // 6. Pen draws, also over shapes; a click without drawing on a shape selects it (on release).
    //    The Redact brush paints a redaction area the same way.
    if (mode === 'pen' || (mode === 'redactBrush' && redact)) {
      capture();
      const shape =
        mode === 'redactBrush' && redact
          ? createRedactBrush([p], redact)
          : createPath([p], false, true, ui.style, ref);
      store.getState().beginChange(modeLabel(mode));
      update(modeLabel(mode), (list) => [...list, shape]);
      interaction.current = {
        kind: 'pen',
        pointerId: event.pointerId,
        points: [p],
        id: shape.id,
        hitId: hit?.id ?? null,
      };
      return;
    }

    // 7. Text tool on empty photo: a new box reading "Text", all selected so typing replaces it.
    //    Outside the photo (the dark stage around it) a click only deselects.
    if (mode === 'text' && !onPhoto(p)) {
      select(null);
      return;
    }
    if (mode === 'text') {
      capture();
      // Stop the browser's mouse-down focus change, which would blur the new text box at once.
      event.preventDefault();
      const shape = createText(p, ui.style, ref, labels.textDefault);
      store.getState().beginChange(labels.annotateModes.text);
      update(labels.annotateModes.text, (list) => [...list, shape]);
      startEditing(shape as TextShape, true);
      return;
    }

    // 8. Shape tools start a new shape once the pointer moves (a click on a shape selects it).
    if (mode !== 'select') {
      capture();
      interaction.current = {
        kind: 'create',
        pointerId: event.pointerId,
        mode: mode,
        start: p,
        startScreen: screen,
        id: null,
        hitId: hit?.id ?? null,
      };
      return;
    }

    // 9. Empty space with Select: a mouse drag draws a selection box (Shift adds to the
    //    selection); a click deselects. Touch pans the stage instead (Space + drag pans with a mouse).
    if (event.pointerType !== 'touch') {
      capture();
      interaction.current = {
        kind: 'marquee',
        pointerId: event.pointerId,
        start: screen,
        base: event.shiftKey ? selectedIds : [],
      };
      if (!event.shiftKey) select(null);
      return;
    }
    select(null);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!image || !fromStage) return;
    const screen = local(event);
    const p = toO(screen);
    const it = interaction.current;
    if (mode === 'polygon') setCursor(p);
    const press = longPress.current;
    if (press && Math.hypot(screen.x - press.screen.x, screen.y - press.screen.y) >= DRAG_START)
      cancelLongPress();
    if (!it) {
      const over = shapeAt(shapes, p, HIT_TOLERANCE / k, measureTextHeight);
      if (mode === 'select') setHoverId(over?.id ?? null);
      // Over the selected shape a drag moves it; over another one a click selects it.
      const onSelected =
        isGroup && groupBox
          ? (!over || selectedIds.includes(over.id)) && insideRect(groupBox, p, HIT_TOLERANCE / k)
          : selected &&
            !selected.locked &&
            (!over || over.id === selected.id) &&
            insideBox(selected, p, HIT_TOLERANCE / k);
      setHoverCursor(onSelected ? 'move' : over ? 'pointer' : undefined);
      return;
    }
    if (it.pointerId !== event.pointerId) return;

    switch (it.kind) {
      case 'move': {
        if (
          !it.dragged &&
          Math.hypot(screen.x - it.startScreen.x, screen.y - it.startScreen.y) < DRAG_START
        )
          break;
        it.dragged = true;
        const moved = moveShape(it.shape, p.x - it.start.x, p.y - it.start.y);
        if (event.altKey) {
          setGuides([]);
          replace(labels.annotateModes.select, moved);
          break;
        }
        const targets = [
          getCanvasRect(image, edit),
          getCropRect(image, edit.geometry),
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
      case 'groupMove': {
        if (
          !it.dragged &&
          Math.hypot(screen.x - it.startScreen.x, screen.y - it.startScreen.y) < DRAG_START
        )
          break;
        it.dragged = true;
        let dx = p.x - it.start.x;
        let dy = p.y - it.start.y;
        const start = groupBounds(it.shapes, measureTextHeight);
        if (!event.altKey && start) {
          const members = new Set(it.shapes.map((s) => s.id));
          const targets = [
            getCanvasRect(image, edit),
            getCropRect(image, edit.geometry),
            ...shapes
              .filter((s) => !members.has(s.id) && !s.hidden)
              .map((s) => getShapeBounds(s, textHeight(s))),
          ];
          const snap = snapBox({ ...start, x: start.x + dx, y: start.y + dy }, targets, SNAP / k);
          setGuides(snap.guides);
          dx += snap.dx;
          dy += snap.dy;
        } else setGuides([]);
        actions.replaceMany(
          labels.annotateModes.select,
          it.shapes.map((s) => moveShape(s, dx, dy)),
        );
        break;
      }
      case 'groupScale': {
        const sx = it.handle.includes('w') ? -1 : 1;
        const sy = it.handle.includes('n') ? -1 : 1;
        const min = 8 / k / Math.max(1e-6, Math.min(it.box.width, it.box.height));
        const factor = Math.max(
          min,
          (sx * (p.x - it.anchor.x)) / Math.max(1e-6, it.box.width),
          (sy * (p.y - it.anchor.y)) / Math.max(1e-6, it.box.height),
        );
        actions.replaceMany(labels.resizeSelection, scaleShapes(it.shapes, it.anchor, factor));
        break;
      }
      case 'groupRotate': {
        const angle = Math.atan2(screen.y - it.center.y, screen.x - it.center.x);
        const degrees = snapAngle(
          normalizeDegrees(((angle - it.startAngle) * 180) / Math.PI),
          event.shiftKey,
        );
        actions.replaceMany(
          labels.rotate,
          rotateShapes(it.shapes, it.centerO, degrees, measureTextHeight),
        );
        setGroupFrame({ box: it.box, angle: degrees });
        break;
      }
      case 'marquee': {
        if (!marquee && Math.hypot(screen.x - it.start.x, screen.y - it.start.y) < DRAG_START)
          break;
        setMarquee({ a: it.start, b: screen });
        const area = pointsBox([it.start, screen]);
        const hits = shapes
          .filter(
            (s) =>
              selectable(s) &&
              boxesIntersect(area, pointsBox(getShapeCorners(s, textHeight(s)).map(toS))),
          )
          .map((s) => s.id);
        selectMany([...new Set([...it.base, ...hits])]);
        break;
      }
      case 'pen': {
        const last = it.points[it.points.length - 1]!;
        if (Math.hypot(p.x - last.x, p.y - last.y) * k < 2) break;
        it.points.push(p);
        const current = store.getState().edit.annotations.find((s) => s.id === it.id);
        if (current?.type === 'path')
          replace(labels.annotateModes.pen, { ...current, points: [...it.points] });
        else if (current?.type === 'redact' && current.kind === 'brush')
          replace(labels.redactArea, { ...current, points: [...it.points] });
        break;
      }
      case 'create': {
        if (
          !it.id &&
          Math.hypot(screen.x - it.startScreen.x, screen.y - it.startScreen.y) < DRAG_START
        )
          break;
        const drawMode = it.mode;
        let end = p;
        if (event.shiftKey)
          end =
            drawMode === 'line' || drawMode === 'arrow'
              ? snapLine(it.start, p)
              : squareEnd(it.start, p);
        const shape =
          drawMode === 'redactBox'
            ? redact
              ? createRedactBox(it.start, end, redact)
              : null
            : createShape(
                drawMode as Parameters<typeof createShape>[0],
                it.start,
                end,
                ui.style,
                ref,
              );
        if (!shape) break;
        if (!it.id) {
          it.id = shape.id;
          store.getState().beginChange(modeLabel(drawMode));
          update(modeLabel(drawMode), (list) => [...list, shape]);
          select(shape.id);
        } else {
          replace(modeLabel(drawMode), { ...shape, id: it.id });
        }
        break;
      }
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    cancelLongPress();
    setDragCursor(undefined);
    const it = interaction.current;
    if (!it || it.pointerId !== event.pointerId) return;
    interaction.current = null;
    setGuides([]);
    if (it.kind === 'marquee') {
      setMarquee(null);
      return;
    }
    if (it.kind === 'groupRotate') setGroupFrame(null);
    if (it.kind === 'groupMove' && !it.dragged) {
      // A click on a member of the selection (no drag): select only that one.
      store.getState().endChange();
      if (it.clickId) select(it.clickId);
      return;
    }
    if (it.kind === 'move' && it.editOnClick && !it.dragged) {
      store.getState().endChange();
      const current = store.getState().edit.annotations.find((s) => s.id === it.shape.id);
      if (current?.type === 'text') startEditing(current, false, textIndexAt(current, it.start));
      return;
    }
    if (it.kind === 'move' && !it.dragged && mode !== 'select') {
      // A click on a shape with a drawing tool: it's selected, and Select becomes the tool.
      store.getState().endChange();
      selectWithSelectTool(it.shape.id);
      return;
    }
    if (it.kind === 'create' && !it.id && it.hitId) {
      selectWithSelectTool(it.hitId);
      return;
    }
    if (it.kind === 'pen' && it.hitId && it.points.length === 1) {
      store.getState().cancelChange();
      selectWithSelectTool(it.hitId);
      return;
    }
    if (it.kind === 'create' && !it.id && !onPhoto(it.start)) {
      // A click (no drag) outside the photo doesn't drop a shape there.
      select(null);
      return;
    }
    if (it.kind === 'create' && !it.id && it.mode === 'redactBox') {
      // A click without dragging in Redact: nothing to hide there — just deselect.
      select(null);
      return;
    }
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
      update(modeLabel(it.mode), (list) => [...list, shape]);
      select(shape.id);
      return;
    }
    if (it.kind === 'pen') {
      const current = store.getState().edit.annotations.find((s) => s.id === it.id);
      const simplified = it.points.length > 2 ? simplifyPoints(it.points, 0.75 / k) : null;
      if (simplified && current?.type === 'path')
        replace(labels.annotateModes.pen, { ...current, points: simplified });
      else if (simplified && current?.type === 'redact' && current.kind === 'brush')
        replace(labels.redactArea, { ...current, points: simplified });
      select(it.id);
    }
    if (handleWhileEditing.current) {
      handleWhileEditing.current = false;
      return; // still editing: the "Edit text" step stays open
    }
    if (it.kind !== 'create' || it.id) store.getState().endChange();
  };

  /** Touch long-press: drop whatever the press started and open the menu for the shape under it. */
  function onLongPress(screen: Point) {
    longPress.current = null;
    if (!fromStage || latest.current.menu) return;
    const hit = shapeAt(shapes, toO(screen), HIT_TOLERANCE / k, measureTextHeight, {
      includeLocked: true,
    });
    const onGroup = groupMenuTarget(screen, hit);
    if (!hit && !onGroup) return;
    const it = interaction.current;
    interaction.current = null;
    if (it && rootRef.current?.hasPointerCapture(it.pointerId))
      rootRef.current.releasePointerCapture(it.pointerId);
    if (store.getState().pendingChange) store.getState().cancelChange();
    setGuides([]);
    if (onGroup) openGroupMenu(screen);
    else if (hit) openMenu(hit.id, screen);
  }

  /** Right-click (and Android long-press) on a shape — locked ones too — opens its menu. */
  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    // Text being edited keeps the browser's own menu (copy / paste / spelling).
    if ((event.target as HTMLElement).closest('.iu-textedit')) return;
    event.preventDefault();
    if (!fromStage || interaction.current || menu) return;
    const fromPointer =
      event.button === 2 || (event.nativeEvent as globalThis.PointerEvent).pointerType === 'touch';
    if (!fromPointer) {
      // Keyboard (Menu key): the selected shape's menu.
      openMenuForSelection();
      return;
    }
    const screen = local(event);
    const hit = shapeAt(shapes, toO(screen), HIT_TOLERANCE / k, measureTextHeight, {
      includeLocked: true,
    });
    if (groupMenuTarget(screen, hit)) openGroupMenu(screen);
    else if (hit) openMenu(hit.id, screen);
  };

  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!fromStage) return;
    // Double-clicks on the text editor / Layers panel are theirs (e.g. select a word): no zoom.
    if ((event.target as HTMLElement).closest('.iu-textedit, .iu-layers')) {
      event.stopPropagation();
      return;
    }
    if (mode === 'polygon') {
      event.stopPropagation();
      finishPolygon(polygon);
      return;
    }
    const hit = shapeAt(shapes, toO(local(event)), HIT_TOLERANCE / k, measureTextHeight);
    // On a shape, a double-click never zooms the photo (the Stage zooms on empty photo only).
    if (hit) event.stopPropagation();
    else if (mode === 'select' && !spaceRef.current) {
      // Presses on empty space start a selection box, so the Stage never saw this press: zoom
      // here, the way the Stage does (fitted → in at the pointer; zoomed → back to fit).
      event.stopPropagation();
      const state = store.getState();
      if (state.isFitted) {
        const target = state.viewport.scale < 1 ? 1 : state.viewport.scale * 2;
        state.zoomTo(target, { anchor: local(event), animate: true });
      } else state.fit({ animate: true });
      return;
    }
    // The second click of the double-click may already have opened the editor.
    if (getAnnotateState(store).editingId) return;
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
      // Keys inside popovers / the layers panel belong to them (e.g. Escape closes the popover);
      // ⌘/Ctrl shortcuts from the Layers panel (select all, duplicate) still apply to the selection.
      if (target.closest('.iu-popover, .iu-compare')) return;
      if (target.closest('.iu-layers') && !(e.metaKey || e.ctrlKey)) return;
      const {
        ui: u,
        selected: sel,
        polygon: poly,
        k: scale,
        ref: r,
        group: grp,
        isGroup: multi,
      } = latest.current;
      const mod = e.metaKey || e.ctrlKey;
      const state = store.getState();
      const movable = grp.filter((s) => !s.locked);

      if (e.key === ' ' && target.closest('.iu-stage')) {
        // Space + drag pans (the stage takes the press while it's held). Only with the photo
        // focused — elsewhere Space presses the focused button.
        if (!e.repeat) {
          spaceRef.current = true;
          setSpaceHeld(true);
        }
      } else if (mod && e.key.toLowerCase() === 'a') {
        // Every element, the watermark's box included.
        const all = elementsOf(state.image, state.edit, watermarkLockedRef.current)
          .filter(selectable)
          .map((s) => s.id);
        setPolygon([]);
        setUi((v) => ({ ...v, mode: 'select', ...selectPatch(all) }));
      } else if (multi && (e.key === 'Delete' || e.key === 'Backspace')) {
        actions.removeMany(grp.map((s) => s.id));
        setUi((v) => ({ ...v, ...selectPatch([]) }));
      } else if (multi && mod && e.key.toLowerCase() === 'd') {
        const ids = actions.duplicateMany(
          grp.map((s) => s.id),
          r * 0.03,
        );
        setUi((v) => ({ ...v, ...selectPatch(ids) }));
      } else if (multi && e.key.startsWith('Arrow') && !mod) {
        const step = (e.shiftKey ? 10 : 1) / scale;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        actions.replaceMany(
          labels.annotateModes.select,
          movable.map((s) => moveShape(s, dx, dy)),
        );
      } else if (multi && e.key === 'Enter') {
        return;
      } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
        if (!openMenuForSelection()) return;
      } else if (e.key === 'Escape') {
        if (poly.length) setPolygon([]);
        else if (u.selectedId) setUi((v) => ({ ...v, ...selectPatch([]) }));
        else return;
      } else if (e.key === 'Enter') {
        if (poly.length) finishPolygon(poly);
        else if (sel?.type === 'text' && !sel.locked) startEditing(sel, false);
        else return;
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && !sel.locked) {
        actions.remove(sel.id);
        setUi((v) => ({ ...v, ...selectPatch([]) }));
      } else if (mod && e.key.toLowerCase() === 'd' && sel) {
        const copyId = actions.duplicate(sel, r * 0.03);
        setUi((v) => ({ ...v, ...selectPatch([copyId]) }));
      } else if (e.key.startsWith('Arrow') && sel && !sel.locked && !mod) {
        const step = (e.shiftKey ? 10 : 1) / scale;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        const moved = moveShape(sel, dx, dy);
        state.update(labels.annotateModes.select, (draft) => {
          draft.annotations = draft.annotations.map((s) => (s.id === sel.id ? moved : s));
        });
      } else if (!mod && !e.altKey && !selectOnly && !redactRef.current) {
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
    const releaseSpace = (event: Event) => {
      if (event.type === 'keyup' && (event as KeyboardEvent).key !== ' ') return;
      spaceRef.current = false;
      setSpaceHeld(false);
    };
    root.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', releaseSpace);
    window.addEventListener('blur', releaseSpace);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', releaseSpace);
      window.removeEventListener('blur', releaseSpace);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads latest values from a ref
  }, [store]);

  // A press outside the editor, or on empty editor chrome (toolbar background…), deselects.
  // Controls keep the selection — they edit it — and so do popovers, menus and the Layers panel.
  useEffect(() => {
    const layer = rootRef.current;
    const root = layer?.closest('.iu-root');
    if (!layer || !root) return;
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      // Leaving a text box by pressing anywhere outside the photo layer finishes editing. Don't
      // rely on the editor's blur: Safari doesn't move focus to a clicked button, so it never fires.
      if (latest.current.ui.editingId && !layer.contains(target)) commitRef.current();
      if (!latest.current.ui.selectedId) return;
      if (
        root.contains(target) &&
        (layer.contains(target) || target.closest('.iu-portal') || target.closest(INTERACTIVE))
      )
        return;
      setUi((u) => ({ ...u, ...selectPatch([]) }));
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reads latest values from a ref
  }, []);

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
  const hover =
    hoverId && !selectedIds.includes(hoverId) ? shapes.find((s) => s.id === hoverId) : null;
  const menuShape = menu ? (shapes.find((s) => s.id === menu.shapeId) ?? null) : null;

  return (
    <div
      ref={rootRef}
      className="iu-annotate-layer"
      data-mode={mode}
      data-cursor={spaceHeld ? 'grab' : (dragCursor ?? hoverCursor)}
      tabIndex={-1}
      aria-label={labels.tools.annotate}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={() => {
        setHoverId(null);
        setHoverCursor(undefined);
      }}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <svg className="iu-annotate-layer__svg" width={stage.width} height={stage.height}>
        {hover && (
          <polygon
            className="iu-annotate__hover"
            points={poly(getShapeCorners(hover, textHeight(hover)))}
          />
        )}
        {guides.map((g, i) => {
          // Guides run across the whole result (photo + added space).
          const crop = getCanvasRect(image, edit);
          const a = g.x !== undefined ? toS({ x: g.x, y: crop.y }) : toS({ x: crop.x, y: g.y! });
          const b =
            g.x !== undefined
              ? toS({ x: g.x, y: crop.y + crop.height })
              : toS({ x: crop.x + crop.width, y: g.y! });
          return (
            <line key={i} className="iu-annotate__guide" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
          );
        })}
        {!isGroup && selected && !editing && <Selection shape={selected} toS={toS} />}
        {isGroup && groupBox && (
          <GroupSelection
            shapes={group}
            locked={movableGroup.length === 0}
            box={groupFrame?.box ?? groupBox}
            angle={groupFrame?.angle ?? 0}
            toS={toS}
          />
        )}
        {marquee && (
          <rect
            className="iu-annotate__marquee"
            x={Math.min(marquee.a.x, marquee.b.x)}
            y={Math.min(marquee.a.y, marquee.b.y)}
            width={Math.abs(marquee.b.x - marquee.a.x)}
            height={Math.abs(marquee.b.y - marquee.a.y)}
          />
        )}
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
          caret={editCaret}
          onChange={(text) => replace(labels.editText, { ...editing, text })}
          onDone={commitText}
        />
      )}
      {editing && selected?.id === editing.id && !selected.locked && (
        // Handles stay while typing (drawn above the text box so they can be grabbed).
        <svg
          className="iu-annotate-layer__svg iu-annotate-layer__svg--above"
          width={stage.width}
          height={stage.height}
        >
          <Selection shape={selected} toS={toS} outline={false} />
        </svg>
      )}
      {ui.layersOpen && (
        <LayersPanel
          shapes={shapes}
          selectedIds={selectedIds}
          revealId={revealLayer}
          onSelect={(id) => select(id)}
          onSelectMany={selectMany}
          onClose={() => setUi((u) => ({ ...u, layersOpen: false }))}
        />
      )}
      {menu?.group && isGroup && (
        <GroupMenu
          open
          ids={group.map((s) => s.id)}
          onOpenChange={(open) => {
            if (open) return;
            rootRef.current?.focus({ preventScroll: true });
            setMenu(null);
          }}
          onSelect={selectMany}
          onCloseAutoFocus={(event) => event.preventDefault()}
          trigger={
            <span
              className="iu-annotate__menu-anchor"
              style={{ left: menu.at.x, top: menu.at.y }}
            />
          }
        />
      )}
      {menuShape && menu && !menu.group && (
        <ShapeMenu
          open
          onOpenChange={(open) => {
            if (open) return;
            // The anchor can't take focus: give it back to the photo now, so shortcuts keep
            // working (unless "Show in Layers" moved it to the Layers row).
            // (Radix can report the close twice, so the flag is only reset when a menu opens.)
            if (!keepMenuFocus.current) rootRef.current?.focus({ preventScroll: true });
            setMenu(null);
          }}
          shape={menuShape}
          onSelect={select}
          onShowInLayers={() => {
            keepMenuFocus.current = true;
            setUi((u) => ({ ...u, layersOpen: true, ...selectPatch([menuShape.id]) }));
            setRevealLayer({ id: menuShape.id });
          }}
          onCloseAutoFocus={(event) => event.preventDefault()}
          trigger={
            <span
              className="iu-annotate__menu-anchor"
              style={{ left: menu.at.x, top: menu.at.y }}
            />
          }
        />
      )}
    </div>
  );
}

/** Outline + handles for the selected shape. */
function Selection({
  shape,
  toS,
  outline: showOutline = true,
}: {
  shape: Shape;
  toS: (p: Point) => Point;
  /** `false` while editing text: the text box draws its own (dashed) outline. */
  outline?: boolean;
}) {
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
              // An end with an arrow / dot: a hollow ring, so the head stays visible under it.
              data-hollow={(i === 0 ? shape.startCap : shape.endCap) !== 'none' ? '' : undefined}
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
  // Text keeps its height from the wrapped content: no top/bottom handles. The watermark only
  // scales (it can't be stretched): corners only.
  const handles =
    shape.id === WATERMARK_ELEMENT_ID
      ? BOX_HANDLES.filter((h) => h.length === 2)
      : shape.type === 'text'
        ? BOX_HANDLES.filter((h) => h !== 'n' && h !== 's')
        : BOX_HANDLES;
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
      {showOutline && <polygon className="iu-annotate__selection" points={outline} />}
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

/**
 * A multi-selection: a thin outline on each member, and one box around all of them with corner
 * handles (proportional resize) and a rotation handle. While rotating, the box turns with them.
 */
function GroupSelection({
  shapes,
  locked,
  box,
  angle,
  toS,
}: {
  shapes: Shape[];
  /** Every member is locked: a dashed outline, no handles. */
  locked: boolean;
  box: Box;
  angle: number;
  toS: (p: Point) => Point;
}) {
  const labels = useLabels();
  const c = boxCenter(box);
  const corner = (x: number, y: number) => toS(rotatePoint({ x, y }, c, angle));
  const at = {
    nw: corner(box.x, box.y),
    ne: corner(box.x + box.width, box.y),
    se: corner(box.x + box.width, box.y + box.height),
    sw: corner(box.x, box.y + box.height),
  };
  const outline = [at.nw, at.ne, at.se, at.sw].map((p) => `${p.x},${p.y}`).join(' ');
  const members = shapes.map((s) => (
    <polygon
      key={s.id}
      className="iu-annotate__member"
      data-locked={s.locked ? '' : undefined}
      points={getShapeCorners(s, textHeight(s))
        .map(toS)
        .map((p) => `${p.x},${p.y}`)
        .join(' ')}
    />
  ));
  if (locked) {
    return (
      <g>
        {members}
        <polygon className="iu-annotate__selection" data-group="" data-locked="" points={outline} />
      </g>
    );
  }
  const top = { x: (at.nw.x + at.ne.x) / 2, y: (at.nw.y + at.ne.y) / 2 };
  const center = toS(c);
  const len = Math.hypot(top.x - center.x, top.y - center.y) || 1;
  const rot = {
    x: top.x + ((top.x - center.x) / len) * ROTATE_HANDLE,
    y: top.y + ((top.y - center.y) / len) * ROTATE_HANDLE,
  };
  return (
    <g>
      {members}
      <polygon className="iu-annotate__selection" data-group="" points={outline} />
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
      {(['nw', 'ne', 'se', 'sw'] as const).map((h) => (
        <rect
          key={h}
          className="iu-annotate__handle"
          data-handle={h}
          data-cursor={cursorFor(h, angle)}
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
  caret,
  onChange,
  onDone,
}: {
  shape: TextShape;
  toStage: Affine;
  scale: number;
  placeholder: string;
  /** `'all'` selects the whole text (a new box: typing replaces it), a number places the caret. */
  caret: number | 'all';
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
      if (caret === 'all') el.select();
      else el.setSelectionRange(caret, caret);
    });
    return () => cancelAnimationFrame(frame);
    // Only when the editor opens; later caret moves belong to the user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        // Same wrap slack as the canvas layout, so both break lines at the same words.
        width: (box.width + TEXT_WRAP_SLACK) * scale,
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
export function cursorFor(handle: BoxHandle, rotation: number): string {
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

/** Cursor while a drag is under way (the pointer is captured, so the layer's cursor shows). */
function dragCursorFor(it: Interaction | null): string | undefined {
  if (!it) return undefined;
  if (it.kind === 'resize') return cursorFor(it.handle, it.shape.rotation);
  if (it.kind === 'groupScale') return cursorFor(it.handle, 0);
  if (
    it.kind === 'move' ||
    it.kind === 'rotate' ||
    it.kind === 'endpoint' ||
    it.kind === 'groupMove' ||
    it.kind === 'groupRotate'
  )
    return 'grabbing';
  return undefined; // drawing: keep the tool's crosshair
}

function insideRect(box: Box, p: Point, pad: number): boolean {
  return (
    p.x >= box.x - pad &&
    p.x <= box.x + box.width + pad &&
    p.y >= box.y - pad &&
    p.y <= box.y + box.height + pad
  );
}

/** Is `p` inside the shape's (rotated) selection box? Thin shapes get their stroke as margin. */
function insideBox(shape: Shape, p: Point, tolerance: number): boolean {
  const box = getShapeBox(shape, textHeight(shape));
  const local = rotatePoint(p, boxCenter(box), -shape.rotation);
  const pad = tolerance + ('strokeWidth' in shape ? shape.strokeWidth / 2 : 0);
  return (
    local.x >= box.x - pad &&
    local.x <= box.x + box.width + pad &&
    local.y >= box.y - pad &&
    local.y <= box.y + box.height + pad
  );
}
