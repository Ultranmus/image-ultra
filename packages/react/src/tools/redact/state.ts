import {
  createShapeId,
  DEFAULT_REDACT_COLOR,
  DEFAULT_REDACT_STRENGTH,
  getOrientedSize,
  redactReference,
  type EditState,
  type LoadedImage,
  type Point,
  type RedactShape,
  type RedactStyle,
} from '@image-ultra/core/internal';
import { useToolState } from '../../context';
import { INITIAL_ANNOTATE_STATE, type AnnotateState } from '../annotate/state';

export type RedactMode = 'select' | 'box' | 'brush';

/**
 * Redact tool UI state (outside history). The tool's stage is the shared element overlay, so the
 * selection fields are the Annotate ones; the rest set up the next area.
 */
export interface RedactUiState extends AnnotateState {
  redactMode: RedactMode;
  redactStyle: RedactStyle;
  strength: number;
  color: string;
  /** Brush diameter in % of the image's short side. */
  brushSize: number;
}

export const INITIAL_REDACT_STATE: RedactUiState = {
  ...INITIAL_ANNOTATE_STATE,
  redactMode: 'box',
  redactStyle: 'pixelate',
  strength: DEFAULT_REDACT_STRENGTH,
  color: DEFAULT_REDACT_COLOR,
  brushSize: 5,
};

/** Redact state with defaults filled in (the overlay may have stored only selection fields). */
export function useRedactState(): [
  RedactUiState,
  (next: (prev: RedactUiState) => RedactUiState) => void,
] {
  const [stored, set] = useToolState<Partial<RedactUiState>>(INITIAL_REDACT_STATE);
  const ui = { ...INITIAL_REDACT_STATE, ...stored };
  return [ui, (next) => set((prev) => next({ ...INITIAL_REDACT_STATE, ...prev }))];
}

/** The image's short side in oriented px — strength and brush size are relative to it. */
export function redactRef(image: LoadedImage, edit: EditState): number {
  return redactReference(getOrientedSize(image, edit.geometry));
}

/** What a new area looks like (from the Redact controls). */
export interface RedactDraw {
  mode: 'box' | 'brush';
  style: RedactStyle;
  strength: number;
  color: string;
  /** Brush diameter in image px. */
  brushSize: number;
}

const base = (d: RedactDraw) => ({
  id: createShapeId(),
  type: 'redact' as const,
  rotation: 0,
  opacity: 1,
  style: d.style,
  strength: d.strength,
  color: d.color,
});

export function createRedactBox(from: Point, to: Point, d: RedactDraw): RedactShape {
  return {
    ...base(d),
    kind: 'box',
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.max(1, Math.abs(to.x - from.x)),
    height: Math.max(1, Math.abs(to.y - from.y)),
  };
}

export function createRedactBrush(points: Point[], d: RedactDraw): RedactShape {
  return { ...base(d), kind: 'brush', points, size: d.brushSize };
}
