import {
  compose,
  createShapeId,
  getCropRect,
  getOrientedToOutput,
  scale,
  translate,
  type Affine,
  type EditState,
  type EditorStore,
  type LoadedImage,
  type Point,
  type Shape,
  type TextAlign,
  type Viewport,
} from '@image-ultra/core';
import { useToolState } from '../../context';

export type AnnotateMode =
  'select' | 'pen' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'polygon' | 'text';
/** Single-key shortcuts for the drawing tools (active while Annotate is open). */
export const MODE_SHORTCUTS: Record<AnnotateMode, string> = {
  select: 'V',
  pen: 'P',
  line: 'L',
  arrow: 'A',
  rect: 'R',
  ellipse: 'O',
  polygon: 'G',
  text: 'T',
};

export type SizeStep = 'S' | 'M' | 'L' | 'XL';

/** Style used for new shapes; updated whenever the user styles something (Pintura-like memory). */
export interface AnnotateStyle {
  stroke: string;
  fill: string | null;
  strokeSize: SizeStep;
  opacity: number;
  fontFamily: string;
  fontSize: SizeStep;
  fontWeight: 400 | 700;
  align: TextAlign;
  textColor: string;
  textBackground: string | null;
}

export interface AnnotateState {
  mode: AnnotateMode;
  selectedId: string | null;
  /** Text shape being edited in place (hidden from the canvas while editing). */
  editingId: string | null;
  layersOpen: boolean;
  style: AnnotateStyle;
}

export const ANNOTATE_TOOL_ID = 'annotate';

export const INITIAL_ANNOTATE_STATE: AnnotateState = {
  mode: 'select',
  selectedId: null,
  editingId: null,
  layersOpen: false,
  style: {
    stroke: '#ff3b30',
    fill: null,
    strokeSize: 'M',
    opacity: 1,
    fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    fontSize: 'M',
    fontWeight: 700,
    align: 'left',
    textColor: '#ffffff',
    textBackground: null,
  },
};

export function useAnnotateState() {
  return useToolState<AnnotateState>(INITIAL_ANNOTATE_STATE);
}

/** Reads the Annotate UI state outside React (e.g. from the Stage painter). */
export function getAnnotateState(store: EditorStore): AnnotateState {
  return (
    (store.getState().toolState[ANNOTATE_TOOL_ID] as AnnotateState | undefined) ??
    INITIAL_ANNOTATE_STATE
  );
}

/* ── Sizes are relative to the visible (cropped) image, so defaults look right on any photo ── */

const STROKE_FACTORS: Record<SizeStep, number> = { S: 0.003, M: 0.006, L: 0.012, XL: 0.024 };
const FONT_FACTORS: Record<SizeStep, number> = { S: 0.03, M: 0.05, L: 0.08, XL: 0.12 };

export function referenceSize(image: LoadedImage, edit: EditState): number {
  const crop = getCropRect(image, edit.geometry);
  return Math.min(crop.width, crop.height);
}

export function strokeWidthFor(step: SizeStep, ref: number): number {
  return Math.max(1, Math.round(ref * STROKE_FACTORS[step] * 10) / 10);
}

export function fontSizeFor(step: SizeStep, ref: number): number {
  return Math.max(6, Math.round(ref * FONT_FACTORS[step]));
}

/** Closest size step to an absolute value (for highlighting the S/M/L/XL chips). */
export function nearestStep(value: number, ref: number, kind: 'stroke' | 'font'): SizeStep | null {
  const factors = kind === 'stroke' ? STROKE_FACTORS : FONT_FACTORS;
  const steps = Object.keys(factors) as SizeStep[];
  const match = steps.find(
    (s) =>
      Math.abs((kind === 'stroke' ? strokeWidthFor(s, ref) : fontSizeFor(s, ref)) - value) < 0.5,
  );
  return match ?? null;
}

/* ── Coordinates ───────────────────────────────────────────────────────── */

/** Oriented px → stage CSS px in the normal (result) view. */
export function getOrientedToStage(
  image: LoadedImage,
  edit: EditState,
  viewport: Viewport,
): Affine {
  return compose(
    translate(viewport.x, viewport.y),
    scale(viewport.scale),
    getOrientedToOutput(image, edit),
  );
}

/* ── Shape factories ───────────────────────────────────────────────────── */

export function createShape(
  mode: Exclude<AnnotateMode, 'select' | 'polygon' | 'text' | 'pen'>,
  from: Point,
  to: Point,
  style: AnnotateStyle,
  ref: number,
): Shape {
  const base = { id: createShapeId(), rotation: 0, opacity: style.opacity };
  const strokeWidth = strokeWidthFor(style.strokeSize, ref);
  if (mode === 'line' || mode === 'arrow') {
    return {
      ...base,
      type: 'line',
      points: [from, to],
      stroke: style.stroke,
      strokeWidth,
      startCap: 'none',
      endCap: mode === 'arrow' ? 'arrow' : 'none',
    };
  }
  const box = {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.max(1, Math.abs(to.x - from.x)),
    height: Math.max(1, Math.abs(to.y - from.y)),
  };
  if (mode === 'ellipse') {
    return {
      ...base,
      type: 'ellipse',
      ...box,
      fill: style.fill,
      stroke: style.stroke,
      strokeWidth,
    };
  }
  return {
    ...base,
    type: 'rect',
    ...box,
    fill: style.fill,
    stroke: style.stroke,
    strokeWidth,
    cornerRadius: 0,
  };
}

export function createPath(
  points: Point[],
  closed: boolean,
  smooth: boolean,
  style: AnnotateStyle,
  ref: number,
): Shape {
  return {
    id: createShapeId(),
    type: 'path',
    rotation: 0,
    opacity: style.opacity,
    points,
    closed,
    smooth,
    fill: closed ? style.fill : null,
    stroke: style.stroke,
    strokeWidth: strokeWidthFor(style.strokeSize, ref),
  };
}

export function createText(at: Point, style: AnnotateStyle, ref: number, text: string): Shape {
  const fontSize = fontSizeFor(style.fontSize, ref);
  return {
    id: createShapeId(),
    type: 'text',
    rotation: 0,
    opacity: style.opacity,
    x: at.x,
    y: at.y - fontSize * 0.6,
    width: Math.max(fontSize * 4, ref * 0.4),
    text,
    fontFamily: style.fontFamily,
    fontSize,
    fontWeight: style.fontWeight,
    fontStyle: 'normal',
    align: style.align,
    lineHeight: 1.25,
    color: style.textColor,
    background: style.textBackground,
  };
}
