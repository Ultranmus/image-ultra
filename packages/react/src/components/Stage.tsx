import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type PointerEvent,
  type ComponentType,
  type CSSProperties,
} from 'react';
import {
  compose,
  createRenderer,
  drawAnnotations,
  ensureAnnotationFonts,
  getImageBounds,
  getOrientedToOutput,
  getBeforeState,
  getOutputSize,
  ImageLoadError,
  loadAnnotationAssets,
  scale,
  translate,
  panBy,
  zoomAt,
  type EditorState,
  type EditState,
  type LoadedImage,
  type Point,
  type Renderer,
} from '@image-ultra/core';
import { ToolIdContext, useEditorState, useEditorStore, useLabels } from '../context';
import type { Labels } from '../i18n';
import { CompareDivider } from './CompareDivider';
import { useDelayedFlag } from '../hooks/useDelayedFlag';
import { IconAlert, IconImage, IconUpload } from '../icons/Icon';
import { getAnnotateState } from '../tools/annotate/state';

/** Loading indicator only appears if loading takes longer than this (UI_VISION §7). */
const LOADING_DELAY_MS = 300;

export interface StageProps {
  /** The active tool's overlay (e.g. the crop box), drawn above the image. */
  overlay?: ComponentType | undefined;
  /** Id of the active tool (for `useToolState` inside the overlay). */
  toolId?: string | undefined;
}

export function Stage({ overlay: Overlay, toolId = '' }: StageProps) {
  const store = useEditorStore();
  const labels = useLabels();
  const status = useEditorState((s) => s.status);
  const error = useEditorState((s) => s.error);
  const isFitted = useEditorState((s) => s.isFitted);
  const cropping = useEditorState((s) => s.cropView !== null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationsRef = useRef<HTMLCanvasElement>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const compare = useEditorState((s) => s.compare);
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
    const beforeCanvas = beforeRef.current;
    const container = containerRef.current;
    if (!canvas || !beforeCanvas || !container) return;
    // A preview that can't be drawn shows the error screen instead of throwing (never uncaught).
    const fail = (error: unknown) => {
      if (disposed) return;
      store.getState().fail(error instanceof Error ? error : new Error(String(error)));
    };
    let renderer: Renderer;
    try {
      // Premultiplied: the preview always has the checkerboard, so pixels are opaque or empty.
      renderer = createRenderer(canvas, { premultipliedAlpha: true });
    } catch (error) {
      store.getState().fail(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    let frame = 0;
    let disposed = false;
    // "Before" side of compare: its own canvas + renderer, created the first time it's needed.
    let beforeRenderer: Renderer | null = null;
    let beforeFor: EditState | null = null;
    let beforeState: EditState | null = null;
    const drawBefore = (state: EditorState, image: LoadedImage) => {
      beforeRenderer ??= createRenderer(beforeCanvas, { premultipliedAlpha: true });
      if (!beforeRenderer.isReady(image)) {
        beforeRenderer.prepare(image).then(() => {
          if (!disposed) schedule();
        }, fail);
        return;
      }
      if (beforeFor !== state.edit) {
        beforeFor = state.edit;
        beforeState = getBeforeState(state.edit);
      }
      renderPreview(beforeRenderer, container, { ...state, edit: beforeState! });
    };
    const draw = () => {
      frame = 0;
      const state = store.getState();
      const { image } = state;
      if (!image || state.stageSize.width === 0) return;
      try {
        if (!renderer.isReady(image)) {
          renderer.prepare(image).then(() => {
            if (!disposed) schedule();
          }, fail);
          return;
        }
        renderPreview(renderer, container, state);
        if (state.compare !== null) drawBefore(state, image);
      } catch (error) {
        fail(error);
      }
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
        state.cropView !== prev.cropView ||
        (state.compare === null) !== (prev.compare === null)
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
      beforeRenderer?.dispose();
    };
  }, [store]);

  // Annotation layer: vector shapes drawn with Canvas2D above the GPU image (sharp at any zoom).
  useEffect(() => {
    const canvas = annotationsRef.current;
    if (!canvas) return;
    let frame = 0;
    let assets = new Map<string, ImageBitmap>();
    let assetsFor: unknown = null;
    let fontsFor: unknown = null;
    const draw = () => {
      frame = 0;
      const state = store.getState();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(state.stageSize.width * dpr);
      const h = Math.round(state.stageSize.height * dpr);
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const { image, edit, viewport: vp, cropView } = state;
      if (!image || edit.annotations.length === 0) return;

      // Images and fonts load asynchronously; redraw once they're ready.
      if (assetsFor !== edit.assets) {
        assetsFor = edit.assets;
        void loadAnnotationAssets(edit).then((loaded) => {
          assets = loaded;
          schedule();
        });
      }
      if (fontsFor !== edit.annotations) {
        fontsFor = edit.annotations;
        void ensureAnnotationFonts(edit.annotations).then(schedule);
      }

      const transform = cropView
        ? compose(scale(dpr), translate(cropView.x, cropView.y), scale(cropView.scale))
        : compose(
            scale(dpr),
            translate(vp.x, vp.y),
            scale(vp.scale),
            getOrientedToOutput(image, edit),
          );
      ctx.save();
      if (!cropView && edit.geometry.cropShape === 'ellipse') {
        const out = getOutputSize(image, edit);
        ctx.setTransform(...compose(scale(dpr), translate(vp.x, vp.y), scale(vp.scale)));
        ctx.beginPath();
        ctx.ellipse(
          out.width / 2,
          out.height / 2,
          out.width / 2,
          out.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.clip();
      }
      const editingId = getAnnotateState(store).editingId;
      drawAnnotations(ctx, edit.annotations, {
        transform,
        assets,
        ...(editingId && { skip: new Set([editingId]) }),
      });
      ctx.restore();
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(draw);
    };
    schedule();
    const unsubscribe = store.subscribe((state, prev) => {
      if (
        state.edit !== prev.edit ||
        state.viewport !== prev.viewport ||
        state.stageSize !== prev.stageSize ||
        state.cropView !== prev.cropView ||
        state.image !== prev.image ||
        state.toolState !== prev.toolState
      ) {
        schedule();
      }
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
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
  // Did the last press reach the stage, or did a tool overlay claim it (stopPropagation)?
  // Double-click zoom only follows unclaimed presses, e.g. never while editing a text box.
  const pressClaimed = useRef(false);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pressClaimed.current = false;
    if (status !== 'ready' || event.button !== 0 || cropping) return;
    const element = containerRef.current;
    if (!element) return;
    element.focus({ preventScroll: true }); // zoom shortcuts work right after clicking the photo
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
    if (pressClaimed.current) return;
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

  const compareStyle =
    compare === null ? undefined : ({ ['--iu-compare']: compare } as CSSProperties);

  return (
    <div
      ref={containerRef}
      className="iu-stage"
      tabIndex={-1}
      data-pannable={status === 'ready' && !isFitted && !cropping ? '' : undefined}
      data-dragging={isDragging ? '' : undefined}
      data-drop-target={isDropTarget ? '' : undefined}
      onPointerDownCapture={() => {
        pressClaimed.current = true;
      }}
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

      <canvas
        ref={beforeRef}
        className="iu-stage__canvas iu-stage__before"
        data-hidden={status !== 'ready' || compare === null ? '' : undefined}
        style={compareStyle}
        aria-hidden="true"
      />

      <canvas
        ref={annotationsRef}
        className="iu-stage__canvas iu-stage__annotations"
        data-hidden={status !== 'ready' ? '' : undefined}
        data-compare={compare !== null ? '' : undefined}
        style={compareStyle}
        aria-hidden="true"
      />

      {status === 'ready' && Overlay && (
        <ToolIdContext.Provider value={toolId}>
          <Overlay />
        </ToolIdContext.Provider>
      )}

      {status === 'ready' && compare !== null && <CompareDivider split={compare} />}

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
              {status === 'error' ? errorMessage(error, labels) : labels.emptyTitle}
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

function errorMessage(error: Error | null, labels: Labels): string {
  if (!(error instanceof ImageLoadError)) return labels.loadError;
  switch (error.code) {
    case 'unsupported':
      return labels.loadErrorUnsupported.replace('{format}', (error.format ?? '?').toUpperCase());
    case 'damaged':
      return labels.loadErrorDamaged;
    case 'not-image':
      return labels.loadErrorNotImage;
    case 'network':
      return labels.loadErrorNetwork;
  }
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
