import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  getImageQuad,
  getCropRect,
  getCropView,
  lerpCropView,
  moveCrop,
  resizeCrop,
  syncResizeToCrop,
  type CropHandle,
  type CropView,
  type EditorStore,
  type Rect,
} from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels } from '../../context';

/** Space kept around the crop box on the stage, in CSS px. */
const STAGE_PADDING = 40;
/** Smallest crop box on screen, in CSS px. */
const MIN_BOX_PX = 48;

const HANDLES: CropHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

type DragKind = 'move' | CropHandle;

interface DragState {
  kind: DragKind;
  pointerId: number;
  x: number;
  y: number;
  crop: Rect;
  view: CropView;
}

/**
 * The crop box (UI_VISION §6): the image moves under the box when dragging anywhere; handles resize
 * the box, which then animates back to the centre on release.
 */
export function CropOverlay() {
  const store = useEditorStore();
  const labels = useLabels();
  const hintId = useId();
  const photoClipId = `${useId().replace(/:/g, '')}-photo`;
  const image = useEditorState((s) => s.image);
  const geometry = useEditorState((s) => s.edit.geometry);
  const view = useEditorState((s) => s.cropView);
  const stage = useEditorState((s) => s.stageSize);
  const pendingLabel = useEditorState((s) => s.pendingChange?.label ?? null);
  const [drag, setDrag] = useState<DragKind | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const keyActive = useRef(false);
  const { refit, freeze } = useCropView(store);

  if (!image || !view) return null;

  const crop = getCropRect(image, geometry);
  const box = {
    x: crop.x * view.scale + view.x,
    y: crop.y * view.scale + view.y,
    width: crop.width * view.scale,
    height: crop.height * view.scale,
  };
  const round = geometry.cropShape === 'ellipse';
  // The photo's own outline on the stage (turned by straighten/perspective): only the photo
  // outside the crop is shaded, the empty stage around it keeps the normal stage colour.
  const photo = getImageQuad(image, geometry)
    .map((p) => `${p.x * view.scale + view.x} ${p.y * view.scale + view.y}`)
    .join('L');
  const showGrid = drag !== null || pendingLabel !== null;

  const applyCrop = (rect: Rect) => {
    store.getState().update('Crop', (draft) => {
      draft.geometry.crop = rect;
      draft.resize = syncResizeToCrop(draft.resize, rect);
    });
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || dragRef.current) return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-handle]')?.dataset[
      'handle'
    ];
    const kind = (handle as CropHandle | undefined) ?? 'move';
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      kind,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      crop,
      view,
    };
    freeze(kind !== 'move');
    setDrag(kind);
    store.getState().beginChange(kind === 'move' ? 'Move crop' : 'Resize crop');
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const state = store.getState();
    if (!d || d.pointerId !== event.pointerId || !state.image) return;
    const dx = (event.clientX - d.x) / d.view.scale;
    const dy = (event.clientY - d.y) / d.view.scale;
    const g = state.edit.geometry;
    const next =
      d.kind === 'move'
        ? // The image follows the pointer, so the crop moves the opposite way.
          moveCrop(state.image, g, d.crop, -dx, -dy)
        : resizeCrop(
            state.image,
            g,
            d.crop,
            d.kind,
            dx,
            dy,
            g.cropAspect,
            MIN_BOX_PX / d.view.scale,
          );
    applyCrop(next);
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDrag(null);
    store.getState().endChange();
    freeze(false);
    if (d.kind !== 'move') refit();
  };

  // Arrow keys move the crop (Shift = 10 screen px per press).
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = (event.shiftKey ? 10 : 1) / view.scale;
    const delta: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = delta[event.key];
    const state = store.getState();
    if (!move || !state.image) return;
    event.preventDefault();
    if (!keyActive.current) {
      keyActive.current = true;
      state.beginChange('Move crop');
    }
    applyCrop(
      moveCrop(
        state.image,
        state.edit.geometry,
        getCropRect(state.image, state.edit.geometry),
        move[0],
        move[1],
      ),
    );
  };
  const onKeyUp = () => {
    if (!keyActive.current) return;
    keyActive.current = false;
    store.getState().endChange();
  };

  const cutout = round
    ? ellipsePath(box.x + box.width / 2, box.y + box.height / 2, box.width / 2, box.height / 2)
    : `M${box.x} ${box.y}h${box.width}v${box.height}h${-box.width}z`;

  return (
    <div
      className="iu-crop"
      data-dragging={drag ?? undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <svg className="iu-crop__svg" width={stage.width} height={stage.height} aria-hidden="true">
        <defs>
          <clipPath id={photoClipId}>
            <path d={`M${photo}z`} />
          </clipPath>
        </defs>
        {/* Outside the crop, but only where the photo is (never the empty stage). */}
        <path
          className="iu-crop__shade"
          fillRule="evenodd"
          clipPath={`url(#${photoClipId})`}
          d={`M0 0H${stage.width}V${stage.height}H0z ${cutout}`}
        />
        {showGrid && (
          <g className="iu-crop__grid">
            {[1, 2].map((i) => (
              <line
                key={`v${i}`}
                x1={box.x + (box.width * i) / 3}
                x2={box.x + (box.width * i) / 3}
                y1={box.y}
                y2={box.y + box.height}
              />
            ))}
            {[1, 2].map((i) => (
              <line
                key={`h${i}`}
                y1={box.y + (box.height * i) / 3}
                y2={box.y + (box.height * i) / 3}
                x1={box.x}
                x2={box.x + box.width}
              />
            ))}
          </g>
        )}
        {round && <rect className="iu-crop__bounds" {...rectAttrs(box)} />}
        <path className="iu-crop__frame" d={cutout} />
        {HANDLES.map((handle) => (
          <path key={handle} className="iu-crop__handle" d={handlePath(handle, box)} />
        ))}
      </svg>

      <div
        className="iu-crop__box"
        role="group"
        tabIndex={0}
        aria-label={labels.cropArea}
        aria-describedby={hintId}
        style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={onKeyUp}
      >
        {HANDLES.map((handle) => (
          <span key={handle} className="iu-crop__hit" data-handle={handle} />
        ))}
      </div>
      <span id={hintId} className="iu-sr-only">
        {labels.cropAreaHint}
      </span>
    </div>
  );
}

/**
 * Keeps `store.cropView` framing the crop while this overlay is mounted. Follows edits live
 * during continuous changes, animates after discrete ones, and can be frozen during a handle drag.
 */
function useCropView(store: EditorStore) {
  const api = useRef<{ refit: () => void; freeze: (frozen: boolean) => void }>({
    refit: () => {},
    freeze: () => {},
  });

  useEffect(() => {
    let frame = 0;
    let frozen = false;
    const target = (): CropView | null => {
      const s = store.getState();
      if (!s.image || s.stageSize.width === 0) return null;
      return getCropView(getCropRect(s.image, s.edit.geometry), s.stageSize, STAGE_PADDING);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    const animateTo = (to: CropView | null) => {
      stop();
      if (!to) return;
      const { cropView: from, animationMs, setCropView } = store.getState();
      if (!from || animationMs <= 0) {
        setCropView(to);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / animationMs);
        store.getState().setCropView(lerpCropView(from, to, 1 - Math.pow(1 - t, 3)));
        frame = t < 1 ? requestAnimationFrame(step) : 0;
      };
      frame = requestAnimationFrame(step);
    };

    store.getState().setCropView(target());
    const unsubscribe = store.subscribe((s, prev) => {
      if (frozen) return;
      const changed = s.edit.geometry !== prev.edit.geometry || s.image !== prev.image;
      const resized = s.stageSize !== prev.stageSize;
      if (!changed && !resized) return;
      const to = target();
      if (!to) return;
      if (resized || s.pendingChange) {
        stop();
        s.setCropView(to);
      } else {
        animateTo(to);
      }
    });

    api.current = {
      refit: () => animateTo(target()),
      freeze: (value) => {
        frozen = value;
      },
    };
    return () => {
      unsubscribe();
      stop();
      store.getState().setCropView(null);
    };
  }, [store]);

  return {
    refit: () => api.current.refit(),
    freeze: (frozen: boolean) => api.current.freeze(frozen),
  };
}

function rectAttrs(r: { x: number; y: number; width: number; height: number }) {
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0z`;
}

/** L-shaped corners and short bars on the edges. */
function handlePath(
  handle: CropHandle,
  b: { x: number; y: number; width: number; height: number },
): string {
  const len = Math.min(18, b.width / 3, b.height / 3);
  const x0 = b.x;
  const y0 = b.y;
  const x1 = b.x + b.width;
  const y1 = b.y + b.height;
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  switch (handle) {
    case 'nw':
      return `M${x0} ${y0 + len}V${y0}H${x0 + len}`;
    case 'ne':
      return `M${x1 - len} ${y0}H${x1}V${y0 + len}`;
    case 'se':
      return `M${x1} ${y1 - len}V${y1}H${x1 - len}`;
    case 'sw':
      return `M${x0 + len} ${y1}H${x0}V${y1 - len}`;
    case 'n':
      return `M${cx - len / 2} ${y0}H${cx + len / 2}`;
    case 's':
      return `M${cx - len / 2} ${y1}H${cx + len / 2}`;
    case 'e':
      return `M${x1} ${cy - len / 2}V${cy + len / 2}`;
    case 'w':
      return `M${x0} ${cy - len / 2}V${cy + len / 2}`;
  }
}
