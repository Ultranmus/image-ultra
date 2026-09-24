import { useEffect, useRef, type PointerEvent } from 'react';
import {
  applyToPoint,
  compose,
  drawMask,
  invert,
  scale,
  simplifyPoints,
  type MaskStroke,
  type Point,
} from '@image-ultra/core';
import { useEditorState } from '../context';
import { getOrientedToStage } from '../tools/annotate/state';

export interface MaskBrushOverlayProps {
  strokes: readonly MaskStroke[];
  onChange: (strokes: MaskStroke[]) => void;
  /** Brush diameter in image (oriented) pixels. */
  size: number;
  mode: 'paint' | 'erase';
  /** Any CSS colour for the mask preview. Default: accent at 45%. */
  color?: string;
}

/**
 * A paintable mask over the stage (for tools like the future AI object eraser). Strokes are in
 * oriented image space — rasterise them with `rasterizeMask` from `@image-ultra/core`.
 * Render it as (part of) a tool's `StageOverlay`.
 */
export function MaskBrushOverlay({ strokes, onChange, size, mode, color }: MaskBrushOverlayProps) {
  const image = useEditorState((s) => s.image);
  const edit = useEditorState((s) => s.edit);
  const viewport = useEditorState((s) => s.viewport);
  const stage = useEditorState((s) => s.stageSize);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const current = useRef<{ pointerId: number; points: Point[] } | null>(null);
  const toStage = image ? getOrientedToStage(image, edit, viewport) : null;

  // Draw committed strokes + the one in progress as a translucent layer.
  const paint = (extra?: MaskStroke) => {
    const canvas = canvasRef.current;
    if (!canvas || !toStage) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(stage.width * dpr);
    canvas.height = Math.round(stage.height * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(...compose(scale(dpr), toStage));
    drawMask(ctx, extra ? [...strokes, extra] : strokes);
    // Tint: keep alpha, replace colour.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle =
      color ?? getComputedStyle(canvas).getPropertyValue('--iu-accent').trim() ?? '#9c479c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => paint());

  if (!image || !toStage) return null;
  const fromStage = invert(toStage);
  const at = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return applyToPoint(fromStage, { x: event.clientX - rect.left, y: event.clientY - rect.top });
  };

  return (
    <canvas
      ref={canvasRef}
      className="iu-maskbrush"
      style={{
        ['--iu-brush' as string]: `${size * Math.sqrt(Math.abs(toStage[0] * toStage[3]))}px`,
      }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        current.current = { pointerId: event.pointerId, points: [at(event)] };
        paint({ points: current.current.points, size, mode });
      }}
      onPointerMove={(event) => {
        const c = current.current;
        if (!c || c.pointerId !== event.pointerId) return;
        c.points.push(at(event));
        paint({ points: c.points, size, mode });
      }}
      onPointerUp={(event) => {
        const c = current.current;
        if (!c || c.pointerId !== event.pointerId) return;
        current.current = null;
        onChange([...strokes, { points: simplifyPoints(c.points, size * 0.05), size, mode }]);
      }}
      onPointerCancel={() => {
        current.current = null;
        paint();
      }}
    />
  );
}
