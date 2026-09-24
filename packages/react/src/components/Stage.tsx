import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type ComponentType,
} from 'react';
import {
  createRenderer,
  getImageBounds,
  getOutputSize,
  panBy,
  zoomAt,
  type EditorState,
  type Point,
  type Renderer,
} from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels } from '../context';
import { useDelayedFlag } from '../hooks/useDelayedFlag';
import { IconAlert, IconImage, IconUpload } from '../icons/Icon';

/** Loading indicator only appears if loading takes longer than this (UI_VISION §7). */
const LOADING_DELAY_MS = 300;

export interface StageProps {
  /** The active tool's overlay (e.g. the crop box), drawn above the image. */
  overlay?: ComponentType | undefined;
}

export function Stage({ overlay: Overlay }: StageProps) {
  const store = useEditorStore();
  const labels = useLabels();
  const status = useEditorState((s) => s.status);
  const isFitted = useEditorState((s) => s.isFitted);
  const cropping = useEditorState((s) => s.cropView !== null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const showLoading = useDelayedFlag(status === 'loading', LOADING_DELAY_MS);

  // Keep the store in sync with the stage element size.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      store.getState().setStageSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [store]);

  // Paint outside React: subscribe to the store and redraw at most once per frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const renderer = createRenderer(canvas);
    let frame = 0;
    let disposed = false;
    const draw = () => {
      frame = 0;
      const state = store.getState();
      const { image } = state;
      if (!image || state.stageSize.width === 0) return;
      if (!renderer.isReady(image)) {
        void renderer.prepare(image).then(() => {
          if (!disposed) schedule();
        });
        return;
      }
      renderPreview(renderer, container, state);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    schedule();
    const unsubscribe = store.subscribe((state, prev) => {
      if (
        state.viewport !== prev.viewport ||
        state.image !== prev.image ||
        state.stageSize !== prev.stageSize ||
        state.edit !== prev.edit ||
        state.cropView !== prev.cropView
      ) {
        schedule();
      }
    });
    // Theme changes swap the checkerboard colours.
    const themeObserver = new MutationObserver(schedule);
    const root = container.closest('.iu-root');
    if (root) {
      themeObserver.observe(root, {
        attributes: true,
        attributeFilter: ['data-iu-theme', 'style'],
      });
    }
    return () => {
      disposed = true;
      unsubscribe();
      themeObserver.disconnect();
      cancelAnimationFrame(frame);
      renderer.dispose();
    };
  }, [store]);

  // Wheel / trackpad zoom. Registered manually because React wheel listeners are passive.
  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const state = store.getState();
      if (state.status !== 'ready') return;
      event.preventDefault();
      if (state.cropView) return; // the crop view is framed by the crop, not zoomable
      // Pinch gestures arrive as ctrl+wheel with small deltas; mouse wheels in lines or big steps.
      const speed = event.deltaMode === 1 ? 0.05 : event.ctrlKey ? 0.01 : 0.002;
      const factor = Math.exp(-event.deltaY * speed);
      store.getState().zoomBy(factor, { anchor: localPoint(element, event) });
    };
    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [store]);

  // Pointer pan (1 pointer) and pinch zoom (2 pointers).
  const pointers = useRef(new Map<number, Point>());
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (status !== 'ready' || event.button !== 0 || cropping) return;
    const element = containerRef.current;
    if (!element) return;
    element.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, localPoint(element, event));
    setIsDragging(true);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const element = containerRef.current;
    const map = pointers.current;
    const previous = map.get(event.pointerId);
    if (!element || !previous) return;
    const before = [...map.values()];
    map.set(event.pointerId, localPoint(element, event));
    const after = [...map.values()];
    const state = store.getState();

    if (after.length === 1) {
      const current = after[0]!;
      state.setViewport(panBy(state.viewport, current.x - previous.x, current.y - previous.y));
      return;
    }
    const [a0, b0] = before as [Point, Point];
    const [a1, b1] = after as [Point, Point];
    const c0 = midpoint(a0, b0);
    const c1 = midpoint(a1, b1);
    const ratio = distance(a1, b1) / Math.max(1, distance(a0, b0));
    const zoomed = zoomAt(state.viewport, state.viewport.scale * ratio, c0);
    state.setViewport(panBy(zoomed, c1.x - c0.x, c1.y - c0.y));
  };
  const onPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) setIsDragging(false);
  };

  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const element = containerRef.current;
    if (!element || status !== 'ready' || cropping) return;
    const state = store.getState();
    if (state.isFitted) {
      const target = state.viewport.scale < 1 ? 1 : state.viewport.scale * 2;
      state.zoomTo(target, { anchor: localPoint(element, event), animate: true });
    } else {
      state.fit({ animate: true });
    }
  };

  // Empty / error state: accept a dropped or picked file.
  const canPick = status === 'idle' || status === 'error';
  const openFile = (file: File | undefined) => {
    if (file) void store.getState().load(file);
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!canPick) return;
    event.preventDefault();
    setIsDropTarget(true);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!canPick) return;
    event.preventDefault();
    setIsDropTarget(false);
    openFile(event.dataTransfer.files[0]);
  };

  return (
    <div
      ref={containerRef}
      className="iu-stage"
      data-pannable={status === 'ready' && !isFitted && !cropping ? '' : undefined}
      data-dragging={isDragging ? '' : undefined}
      data-drop-target={isDropTarget ? '' : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onDoubleClick={onDoubleClick}
      onDragOver={onDragOver}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={onDrop}
    >
      <canvas
        ref={canvasRef}
        className="iu-stage__canvas"
        data-hidden={status !== 'ready' ? '' : undefined}
        aria-hidden="true"
      />

      {status === 'ready' && Overlay && <Overlay />}

      {showLoading && (
        <div className="iu-stage__overlay" role="status">
          <div className="iu-skeleton" />
          <span className="iu-sr-only">{labels.loading}</span>
        </div>
      )}

      {canPick && (
        <div className="iu-stage__overlay">
          <div className="iu-empty">
            <span className="iu-empty__icon" data-error={status === 'error' ? '' : undefined}>
              {status === 'error' ? <IconAlert size={28} /> : <IconImage size={28} />}
            </span>
            <p className="iu-empty__title">
              {status === 'error' ? labels.loadError : labels.emptyTitle}
            </p>
            <p className="iu-empty__hint">{labels.emptyHint}</p>
            <label className="iu-button iu-button--text" data-variant="secondary">
              <IconUpload size={18} />
              <span className="iu-button__label">{labels.browse}</span>
              <input
                type="file"
                accept="image/*"
                className="iu-sr-only"
                onChange={(event) => {
                  openFile(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

/** Renders into the stage canvas: the edited result, or the whole image while cropping. */
function renderPreview(renderer: Renderer, container: HTMLElement, state: EditorState): void {
  const { image, edit, viewport: vp, stageSize, cropView } = state;
  if (!image) return;
  const dpr = window.devicePixelRatio || 1;
  const styles = getComputedStyle(container);
  const common = {
    image,
    canvasSize: {
      width: Math.round(stageSize.width * dpr),
      height: Math.round(stageSize.height * dpr),
    },
    outputScale: 1,
    checker: {
      a: styles.getPropertyValue('--iu-checker-a').trim() || '#26262b',
      b: styles.getPropertyValue('--iu-checker-b').trim() || '#1d1d21',
      size: 8 * dpr,
    },
  };

  if (cropView) {
    // Render the image's whole bounding box, positioned so the crop sits where the overlay draws it.
    const bounds = getImageBounds(image, edit.geometry);
    const k = 1 / (dpr * cropView.scale);
    renderer.render({
      ...common,
      state: {
        ...edit,
        geometry: { ...edit.geometry, crop: bounds, cropShape: 'rect' },
        resize: { width: bounds.width, height: bounds.height },
      },
      outputSize: { width: bounds.width, height: bounds.height },
      canvasToOutput: [
        k,
        0,
        0,
        k,
        -cropView.x / cropView.scale - bounds.x,
        -cropView.y / cropView.scale - bounds.y,
      ],
      smooth: true,
    });
    return;
  }

  // Canvas px → stage CSS px → output px.
  const k = 1 / (dpr * vp.scale);
  renderer.render({
    ...common,
    state: edit,
    outputSize: getOutputSize(image, edit),
    canvasToOutput: [k, 0, 0, k, -vp.x / vp.scale, -vp.y / vp.scale],
    // Show crisp pixels when zoomed in far enough to inspect them.
    smooth: vp.scale < 3,
  });
}

function localPoint(element: HTMLElement, event: { clientX: number; clientY: number }): Point {
  const rect = element.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
