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
  drawElements,
  redactElements,
  ensureAnnotationFonts,
  getCropRect,
  getImageBounds,
  getOrientedToOutput,
  drawBackground,
  drawFrame,
  drawRedactions,
  drawWatermark,
  watermarkFont,
  loadAssetBitmap,
  getBeforeState,
  getOrientedSize,
  redactReference,
  getOutputSize,
  getOutputToSource,
  getPhotoRect,
  ImageLoadError,
  loadAnnotationAssets,
  scale,
  translate,
  panBy,
  zoomAt,
  type Affine,
  type EditorState,
  type EditState,
  type LoadedImage,
  type Point,
  type Renderer,
  type RenderParams,
} from '@image-ultra/core/internal';
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
  // The photo's accessible name: its size as it will be saved.
  const outputWidth = useEditorState((s) => (s.image ? getOutputSize(s.image, s.edit).width : 0));
  const outputHeight = useEditorState((s) => (s.image ? getOutputSize(s.image, s.edit).height : 0));
  const error = useEditorState((s) => s.error);
  const isFitted = useEditorState((s) => s.isFitted);
  const cropping = useEditorState((s) => s.cropView !== null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const annotationsRef = useRef<HTMLCanvasElement>(null);
  const beforeRef = useRef<HTMLCanvasElement>(null);
  const redactRef = useRef<HTMLCanvasElement>(null);
  const backgroundRef = useRef<HTMLCanvasElement>(null);
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
    const redactCanvas = redactRef.current;
    const backgroundCanvas = backgroundRef.current;
    const container = containerRef.current;
    if (!canvas || !beforeCanvas || !redactCanvas || !backgroundCanvas || !container) return;
    // Fill images, decoded once per source; a redraw follows when one arrives.
    const fillImages = new Map<string, ImageBitmap | null>();
    const fillImage = (state: EditorState): ImageBitmap | undefined => {
      const bg = state.edit.background;
      const asset = bg?.kind === 'image' ? state.edit.assets[bg.assetId] : undefined;
      keepOnly(fillImages, asset?.src);
      if (!asset) return undefined;
      if (!fillImages.has(asset.src)) {
        fillImages.set(asset.src, null);
        void loadAssetBitmap(asset.src).then((bitmap) => {
          fillImages.set(asset.src, bitmap);
          if (!disposed) schedule();
        });
      }
      return fillImages.get(asset.src) ?? undefined;
    };
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
    // Big photos: the preview draws a copy at most PREVIEW_MAX_SIDE long, made once per photo.
    let copyFor: LoadedImage | null = null;
    let copy: ImageBitmap | null = null;
    let copyFailed = false;
    const previewCopy = (image: LoadedImage): ImageBitmap | null | 'pending' => {
      const long = Math.max(image.width, image.height);
      if (long <= PREVIEW_MAX_SIDE) return null;
      if (copyFor !== image) {
        copy?.close();
        copy = null;
        copyFailed = false;
        copyFor = image;
        const k = PREVIEW_MAX_SIDE / long;
        createImageBitmap(image.bitmap, {
          resizeWidth: Math.max(1, Math.round(image.width * k)),
          resizeHeight: Math.max(1, Math.round(image.height * k)),
          resizeQuality: 'high',
        }).then(
          (bitmap) => {
            if (disposed || copyFor !== image) return bitmap.close();
            copy = bitmap;
            schedule();
          },
          () => {
            // Draw from the full photo instead.
            if (copyFor === image) copyFailed = true;
            if (!disposed) schedule();
          },
        );
      }
      return copy ?? (copyFailed ? null : 'pending');
    };
    // "Before" side of compare: its own canvas + renderer, created the first time it's needed.
    let beforeRenderer: Renderer | null = null;
    let beforeFor: EditState | null = null;
    let beforeState: EditState | null = null;
    const drawBefore = (state: EditorState, image: LoadedImage, copy: ImageBitmap | null) => {
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
      renderPreview(
        beforeRenderer,
        container,
        { ...state, edit: beforeState! },
        window.devicePixelRatio || 1,
        copy,
      );
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
        // Wait for a big photo's preview copy rather than uploading the full photo meanwhile.
        const copy = previewCopy(image);
        if (copy === 'pending') return;
        const ratio = previewRatio(renderer, state);
        renderPreview(renderer, container, state, ratio, copy);
        // Same task as the GPU frame: its canvas can still be read (no preserveDrawingBuffer).
        paintRedactions(redactCanvas, canvas, state, ratio);
        paintBackground(backgroundCanvas, [canvas, redactCanvas], state, fillImage(state), ratio);
        if (state.compare !== null) drawBefore(state, image, copy);
        else if (beforeRenderer) {
          // Compare closed: free its copy of the photo on the GPU and its drawing buffer (7.7c).
          beforeRenderer.dispose();
          beforeRenderer = null;
          beforeFor = null;
          beforeState = null;
          releaseCanvas(beforeCanvas);
        }
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
        // Sharp again when a drag ends (the Canvas2D preview draws fewer pixels during one).
        (state.pendingChange === null) !== (prev.pendingChange === null) ||
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
      copy?.close();
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
    const logos = new Map<string, ImageBitmap | null>();
    let fontsLoaded: string | null = null;
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
      if (!image) return;
      // Result view only: the frame (under the elements), and the watermark — at its place in
      // the element order, or on top of everything (DECISIONS #88).
      const out = getOutputSize(image, edit);
      const outToCanvas = compose(scale(dpr), translate(vp.x, vp.y), scale(vp.scale));
      if (edit.frame && !cropView) {
        ctx.setTransform(...outToCanvas);
        drawFrame(ctx, edit.frame, out);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      /** Draws the watermark (result view), in canvas px — the context's transform is set here. */
      const paintWatermark = () => {
        if (!edit.watermark || cropView) return;
        ctx.save();
        ctx.setTransform(...outToCanvas);
        const wm = edit.watermark;
        const asset = wm.kind === 'image' && wm.assetId ? edit.assets[wm.assetId] : undefined;
        let logo: ImageBitmap | undefined;
        keepOnly(logos, asset?.src);
        if (asset) {
          // Decoded once; redraw when it arrives.
          if (!logos.has(asset.src)) {
            logos.set(asset.src, null);
            void loadAssetBitmap(asset.src).then((bitmap) => {
              logos.set(asset.src, bitmap);
              schedule();
            });
          }
          logo = logos.get(asset.src) ?? undefined;
        }
        if (wm.kind === 'text') {
          const font = watermarkFont(wm, wm.size * Math.min(out.width, out.height));
          if (fontsLoaded !== font) {
            fontsLoaded = font;
            void document.fonts?.load(font).then(schedule, () => undefined);
          }
        }
        drawWatermark(ctx, wm, out, logo);
        ctx.restore();
      };
      if (edit.annotations.length === 0) {
        paintWatermark();
        return;
      }

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

      const transform = orientedToCanvas(state, dpr);
      ctx.save();
      // Round crop: shapes are cut to the circle — unless space was added around the photo,
      // where shapes may sit on that space.
      if (!cropView && edit.geometry.cropShape === 'ellipse' && !edit.canvas) {
        const photo = getPhotoRect(image, edit);
        ctx.setTransform(...compose(scale(dpr), translate(vp.x, vp.y), scale(vp.scale)));
        ctx.beginPath();
        ellipseIn(ctx, photo);
        ctx.clip();
      }
      const editingId = getAnnotateState(store).editingId;
      // Elements in order; a redaction area also hides the elements below it.
      const { watermarkDrawn } = drawElements(ctx, edit.annotations, {
        transform,
        assets,
        reference: redactReference(getOrientedSize(image, edit.geometry)),
        drawWatermark: paintWatermark,
        ...(editingId && { skip: new Set([editingId]) }),
      });
      ctx.restore();
      if (!watermarkDrawn) paintWatermark();
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
      // Over something that scrolls on its own (the Layers list, a long text box): let it scroll.
      // A pinch there does nothing (rather than zooming the whole page).
      if (scrollsItself(event.target, element)) {
        if (event.ctrlKey) event.preventDefault();
        return;
      }
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

  // Every finger on the stage, seen before the tool overlay gets it (capture phase). A second
  // finger always pinches / pans, whatever the tool started with the first one: the stage takes
  // both pointers, and the overlay cancels its action when it loses the first (lostpointercapture).
  const touches = useRef(new Map<number, Point>());
  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    pressClaimed.current = true;
    const element = containerRef.current;
    if (event.pointerType !== 'touch' || !element) return;
    touches.current.set(event.pointerId, localPoint(element, event));
    if (touches.current.size < 2 || status !== 'ready' || cropping) return;
    event.stopPropagation(); // the tool never sees the second finger
    for (const [id, point] of touches.current) {
      pointers.current.set(id, point);
      try {
        element.setPointerCapture(id);
      } catch {
        // The pointer is already gone.
      }
    }
    setIsDragging(true);
  };
  const onPointerMoveCapture = (event: PointerEvent<HTMLDivElement>) => {
    const element = containerRef.current;
    if (element && touches.current.has(event.pointerId))
      touches.current.set(event.pointerId, localPoint(element, event));
  };
  const onTouchEnd = (event: PointerEvent<HTMLDivElement>) => {
    touches.current.delete(event.pointerId);
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
      role="group"
      aria-label={
        outputWidth
          ? labels.photoLabel
              .replace('{width}', String(outputWidth))
              .replace('{height}', String(outputHeight))
          : labels.loading
      }
      data-pannable={status === 'ready' && !isFitted && !cropping ? '' : undefined}
      data-dragging={isDragging ? '' : undefined}
      data-drop-target={isDropTarget ? '' : undefined}
      onPointerDownCapture={onPointerDownCapture}
      onPointerMoveCapture={onPointerMoveCapture}
      onPointerUpCapture={onTouchEnd}
      onPointerCancelCapture={onTouchEnd}
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
        ref={backgroundRef}
        className="iu-stage__canvas iu-stage__background"
        data-hidden={status !== 'ready' ? '' : undefined}
        aria-hidden="true"
      />

      <canvas
        ref={canvasRef}
        className="iu-stage__canvas"
        data-hidden={status !== 'ready' ? '' : undefined}
        aria-hidden="true"
      />

      <canvas
        ref={redactRef}
        className="iu-stage__canvas iu-stage__redactions"
        data-hidden={status !== 'ready' ? '' : undefined}
        data-compare={compare !== null ? '' : undefined}
        style={compareStyle}
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
            <p className="iu-empty__title" role={status === 'error' ? 'alert' : undefined}>
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

/**
 * The Fill for the preview, on a canvas under the GPU canvas (which then skips the checkerboard).
 * Its blur is taken from the frame just drawn — GPU image plus redactions — so hidden areas stay
 * hidden. Result view only.
 */
function paintBackground(
  target: HTMLCanvasElement,
  sources: HTMLCanvasElement[],
  state: EditorState,
  image: ImageBitmap | undefined,
  dpr: number,
) {
  const main = sources[0]!;
  const { image: photo, edit, viewport: vp, cropView } = state;
  if (!photo || !edit.background || cropView) {
    releaseCanvas(target);
    return;
  }
  if (target.width !== main.width) target.width = main.width;
  if (target.height !== main.height) target.height = main.height;
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  const out = getOutputSize(photo, edit);
  let result: HTMLCanvasElement | OffscreenCanvas = main;
  let resultRect: { x: number; y: number; width: number; height: number } | undefined;
  if (edit.background.kind === 'blur') {
    // The result's area on the stage, GPU image + redactions flattened into one small copy.
    const x = Math.max(0, vp.x * dpr);
    const y = Math.max(0, vp.y * dpr);
    const w = Math.min(main.width, (vp.x + out.width * vp.scale) * dpr) - x;
    const h = Math.min(main.height, (vp.y + out.height * vp.scale) * dpr) - y;
    if (w < 1 || h < 1) return;
    const flat = new OffscreenCanvas(Math.ceil(w), Math.ceil(h));
    const fctx = flat.getContext('2d');
    if (!fctx) return;
    for (const source of sources) fctx.drawImage(source, x, y, w, h, 0, 0, w, h);
    result = flat;
    resultRect = { x: 0, y: 0, width: flat.width, height: flat.height };
  }
  ctx.setTransform(...compose(scale(dpr), translate(vp.x, vp.y), scale(vp.scale)));
  drawBackground(ctx, edit.background, out, {
    result,
    ...(resultRect && { resultRect }),
    ...(image && { image }),
  });
}

/** Oriented px → stage canvas (device) px, in the result view or the Adjust crop view. */
function orientedToCanvas(state: EditorState, dpr: number): Affine {
  const { image, edit, viewport: vp, cropView } = state;
  if (cropView)
    return compose(scale(dpr), translate(cropView.x, cropView.y), scale(cropView.scale));
  return compose(
    scale(dpr),
    translate(vp.x, vp.y),
    scale(vp.scale),
    getOrientedToOutput(image!, edit),
  );
}

/**
 * Redactions for the preview, drawn from the GPU frame onto their own layer (same function as
 * the export, so they look the same). Clipped to a round crop like the annotations.
 */
function paintRedactions(
  target: HTMLCanvasElement,
  source: HTMLCanvasElement,
  state: EditorState,
  dpr: number,
) {
  const { image, edit, cropView, viewport: vp } = state;
  const redacts = redactElements(edit.annotations);
  if (!image || redacts.length === 0) {
    releaseCanvas(target);
    return;
  }
  if (target.width !== source.width) target.width = source.width;
  if (target.height !== source.height) target.height = source.height;
  const ctx = target.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.save();
  if (!cropView && edit.geometry.cropShape === 'ellipse') {
    ctx.setTransform(...compose(scale(dpr), translate(vp.x, vp.y), scale(vp.scale)));
    ctx.beginPath();
    ellipseIn(ctx, getPhotoRect(image, edit));
    ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  drawRedactions(ctx, source, redacts, {
    transform: orientedToCanvas(state, dpr),
    reference: redactReference(getOrientedSize(image, edit.geometry)),
  });
  ctx.restore();
}

/**
 * An unused layer shrinks to 1×1 (and so shows nothing): a full-size stage canvas holds ~20 MB
 * on a Retina screen even when empty (7.7c).
 */
function releaseCanvas(canvas: HTMLCanvasElement): void {
  if (canvas.width !== 1) canvas.width = 1;
  if (canvas.height !== 1) canvas.height = 1;
}

/** Drops every decoded image but the one in use, so it can be freed (7.7c). */
function keepOnly(images: Map<string, ImageBitmap | null>, src: string | undefined): void {
  for (const key of images.keys()) if (key !== src) images.delete(key);
}

/**
 * Longest side of the preview's copy of a big photo (~50 MB at 4096 × 3072 instead of 192 MB for
 * 48MP — iPhones ran out of memory). The full photo is used only when zoomed in past the copy.
 */
const PREVIEW_MAX_SIDE = 4096;

/**
 * Draws from the preview copy while it has enough pixels — one of its pixels covers at most one
 * canvas pixel — otherwise from the full photo (the renderer uploads it then).
 */
function withPreviewCopy(params: RenderParams, copy: ImageBitmap | null): RenderParams {
  if (!copy) return params;
  const { image, state, canvasToOutput: c, outputScale } = params;
  const m = getOutputToSource(image, state, outputScale);
  const sourcePerCanvasPx =
    Math.sqrt(Math.abs(c[0] * c[3] - c[1] * c[2])) * Math.sqrt(Math.abs(m[0] * m[4] - m[1] * m[3]));
  if (sourcePerCanvasPx * (copy.width / image.width) < 1) return params;
  const rect = { x: 0, y: 0, width: image.width, height: image.height };
  return { ...params, source: { bitmap: copy, rect } };
}

/** Canvas pixels the Canvas2D fallback draws while a change is open (~0.35 MP ≈ 20 fps). */
const DRAG_PIXEL_BUDGET = 350_000;

/**
 * Canvas pixels per CSS pixel for the preview. The Canvas2D fallback does its colour work on the
 * CPU for every canvas pixel (3 fps on a Retina stage, PERF.md), so while a change is open (a
 * slider or crop drag) it draws at most `DRAG_PIXEL_BUDGET` pixels, and sharp again on release.
 */
function previewRatio(renderer: Renderer, state: EditorState): number {
  const dpr = window.devicePixelRatio || 1;
  if (renderer.kind !== 'canvas2d' || !state.pendingChange) return dpr;
  const area = Math.max(1, state.stageSize.width * state.stageSize.height);
  return Math.min(dpr, Math.sqrt(DRAG_PIXEL_BUDGET / area));
}

/**
 * Renders into the stage canvas: the edited result, or the whole image while cropping.
 * `dpr`: canvas pixels per CSS pixel (lower than the screen's while dragging on Canvas2D).
 */
function renderPreview(
  renderer: Renderer,
  container: HTMLElement,
  state: EditorState,
  dpr: number,
  copy: ImageBitmap | null,
): void {
  const { image, edit, viewport: vp, stageSize, cropView } = state;
  if (!image) return;
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
    const crop = getCropRect(image, edit.geometry);
    const k = 1 / (dpr * cropView.scale);
    renderer.render(
      withPreviewCopy(
        {
          ...common,
          state: {
            ...edit,
            geometry: { ...edit.geometry, crop: bounds, cropShape: 'rect' },
            canvas: null,
            resize: { width: bounds.width, height: bounds.height },
          },
          outputSize: { width: bounds.width, height: bounds.height },
          // Vignette follows the crop (as in the result), not the whole image shown around it.
          photoRect: { ...crop, x: crop.x - bounds.x, y: crop.y - bounds.y },
          // The crop view shows the whole photo, including what's outside the crop.
          clipToPhoto: false,
          canvasToOutput: [
            k,
            0,
            0,
            k,
            -cropView.x / cropView.scale - bounds.x,
            -cropView.y / cropView.scale - bounds.y,
          ],
          smooth: true,
        },
        copy,
      ),
    );
    return;
  }

  // Canvas px → stage CSS px → output px.
  const k = 1 / (dpr * vp.scale);
  // With a Fill, transparent parts show the fill layer underneath instead of the checkerboard.
  renderer.render(
    withPreviewCopy(
      {
        ...common,
        // Added canvas space is part of the result: show it (checkerboard) even where there's no photo.
        checker: edit.background ? null : { ...common.checker, coverOutput: true },
        state: edit,
        outputSize: getOutputSize(image, edit),
        canvasToOutput: [k, 0, 0, k, -vp.x / vp.scale, -vp.y / vp.scale],
        // Show crisp pixels when zoomed in far enough to inspect them.
        smooth: vp.scale < 3,
      },
      copy,
    ),
  );
}

/** Adds the ellipse inscribed in `r` to the current path. */
function ellipseIn(
  ctx: CanvasRenderingContext2D,
  r: { x: number; y: number; width: number; height: number },
) {
  ctx.ellipse(r.x + r.width / 2, r.y + r.height / 2, r.width / 2, r.height / 2, 0, 0, Math.PI * 2);
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

/**
 * Is there an element between `target` and the stage that scrolls (the Layers list…)? Then the
 * wheel belongs to it — even at its end, so scrolling a list never turns into a zoom.
 */
function scrollsItself(target: EventTarget | null, stage: HTMLElement): boolean {
  for (
    let el = target instanceof Element ? target : null;
    el && el !== stage;
    el = el.parentElement
  ) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight)
      return true;
  }
  return false;
}
