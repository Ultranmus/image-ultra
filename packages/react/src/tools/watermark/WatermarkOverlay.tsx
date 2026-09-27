import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import {
  getOutputSize,
  layoutWatermark,
  normalizeDegrees,
  watermarkAspect,
  watermarkFullHeight,
  type BoxHandle,
} from '@image-ultra/core/internal';
import { useEditorState, useEditorStore, useLabels, useWatermarkLocked } from '../../context';
import { cursorFor } from '../annotate/AnnotateOverlay';
import { snapAngle } from '../annotate/snapping';

const CORNERS: BoxHandle[] = ['nw', 'ne', 'se', 'sw'];

type Drag =
  | { kind: 'move'; pointerId: number; startX: number; startY: number; cx: number; cy: number }
  | { kind: 'resize'; pointerId: number; distance: number; height: number }
  | { kind: 'rotate'; pointerId: number; angle: number; rotation: number };

/**
 * The watermark on the photo, like other elements: drag to move (→ custom position), corner
 * handles to resize (proportions kept → Size), the round handle to rotate. Arrow keys move it.
 * Not shown for a tiled or app-locked watermark.
 */
export function WatermarkOverlay() {
  const store = useEditorStore();
  const labels = useLabels();
  const locked = useWatermarkLocked();
  const image = useEditorState((s) => s.image);
  const edit = useEditorState((s) => s.edit);
  const viewport = useEditorState((s) => s.viewport);
  const layerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<Drag['kind'] | null>(null);

  const wm = edit.watermark;
  if (!image || !wm || locked || wm.position === 'tile') return null;
  const asset = wm.kind === 'image' && wm.assetId ? edit.assets[wm.assetId] : undefined;
  const aspect = watermarkAspect(wm, asset);
  if (aspect === null) return null;
  const out = getOutputSize(image, edit);
  const box = layoutWatermark(wm, out, aspect);
  const full = watermarkFullHeight(wm, out, aspect);

  /** The mark's centre in client (window) px. */
  const centre = () => {
    const rect = layerRef.current!.getBoundingClientRect();
    return {
      x: rect.left + viewport.x + (box.x + box.width / 2) * viewport.scale,
      y: rect.top + viewport.y + (box.y + box.height / 2) * viewport.scale,
    };
  };

  const setWatermark = (label: string, patch: Partial<NonNullable<typeof wm>>) =>
    store.getState().update(label, (draft) => {
      if (draft.watermark) Object.assign(draft.watermark, patch);
    });

  /** Moves the mark's centre (output px) and stores it as a custom position. */
  const moveTo = (cx: number, cy: number) =>
    setWatermark(labels.watermarkPosition, {
      position: 'custom',
      x: Math.min(1, Math.max(0, cx / out.width)),
      y: Math.min(1, Math.max(0, cy / out.height)),
    });

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const handle = (event.target as HTMLElement).dataset['handle'];
    const c = centre();
    let next: Drag;
    let label: string;
    if (handle === 'rotate') {
      next = {
        kind: 'rotate',
        pointerId: event.pointerId,
        angle: Math.atan2(event.clientY - c.y, event.clientX - c.x),
        rotation: wm.rotation,
      };
      label = labels.rotate;
    } else if (handle) {
      next = {
        kind: 'resize',
        pointerId: event.pointerId,
        distance: Math.max(1, Math.hypot(event.clientX - c.x, event.clientY - c.y)),
        height: box.height,
      };
      label = labels.watermarkSize;
    } else {
      next = {
        kind: 'move',
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        cx: box.x + box.width / 2,
        cy: box.y + box.height / 2,
      };
      label = labels.watermarkPosition;
    }
    drag.current = next;
    setDragging(next.kind);
    store.getState().beginChange(label);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    if (d.kind === 'move') {
      const k = 1 / viewport.scale;
      moveTo(d.cx + (event.clientX - d.startX) * k, d.cy + (event.clientY - d.startY) * k);
    } else if (d.kind === 'resize') {
      // Scale with the pointer's distance from the centre; proportions stay.
      const c = centre();
      const ratio = Math.hypot(event.clientX - c.x, event.clientY - c.y) / d.distance;
      const size = Math.min(1, Math.max(0.01, (d.height * ratio) / full));
      setWatermark(labels.watermarkSize, { size });
    } else {
      const c = centre();
      const angle = Math.atan2(event.clientY - c.y, event.clientX - c.x);
      const degrees = normalizeDegrees(d.rotation + ((angle - d.angle) * 180) / Math.PI);
      setWatermark(labels.rotate, { rotation: snapAngle(degrees, event.shiftKey) });
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(null);
    store.getState().endChange();
  };

  /** The stage took the pointer (a second finger pinches): undo the drag. */
  const onLostPointerCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(null);
    store.getState().cancelChange();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = (event.shiftKey ? 0.05 : 0.01) * Math.min(out.width, out.height);
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    event.stopPropagation();
    moveTo(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy);
  };

  return (
    <div ref={layerRef} className="iu-watermark-layer">
      <div
        className="iu-watermark-box"
        role="button"
        tabIndex={0}
        aria-label={labels.watermarkDrag}
        data-dragging={dragging ?? undefined}
        style={{
          left: viewport.x + box.x * viewport.scale,
          top: viewport.y + box.y * viewport.scale,
          width: box.width * viewport.scale,
          height: box.height * viewport.scale,
          transform: wm.rotation ? `rotate(${wm.rotation}deg)` : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={onLostPointerCapture}
        onKeyDown={onKeyDown}
      >
        {CORNERS.map((corner) => (
          <span
            key={corner}
            className="iu-watermark-box__handle"
            data-handle={corner}
            data-corner={corner}
            data-cursor={cursorFor(corner, wm.rotation)}
            aria-hidden="true"
          />
        ))}
        <span className="iu-watermark-box__stem" aria-hidden="true" />
        <span
          className="iu-watermark-box__rotate"
          data-handle="rotate"
          title={labels.rotate}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
