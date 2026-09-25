import {
  DEFAULT_REDACT_COLOR,
  DEFAULT_REDACT_STRENGTH,
  getOrientedSize,
  redactReference,
  type EditState,
  type LoadedImage,
  type RedactStyle,
} from '@image-ultra/core';
import { useToolState } from '../../context';

export type RedactMode = 'box' | 'brush';

/** Redact tool UI state (outside history): the drawing mode and the style for new areas. */
export interface RedactUiState {
  mode: RedactMode;
  style: RedactStyle;
  strength: number;
  color: string;
  /** Brush diameter in % of the image's short side. */
  brushSize: number;
  selectedId: string | null;
}

export const INITIAL_REDACT_STATE: RedactUiState = {
  mode: 'box',
  style: 'pixelate',
  strength: DEFAULT_REDACT_STRENGTH,
  color: DEFAULT_REDACT_COLOR,
  brushSize: 5,
  selectedId: null,
};

export function useRedactState() {
  return useToolState<RedactUiState>(INITIAL_REDACT_STATE);
}

/** The image's short side in oriented px — strength and brush size are relative to it. */
export function redactRef(image: LoadedImage, edit: EditState): number {
  return redactReference(getOrientedSize(image, edit.geometry));
}

export function createRedactId(): string {
  return `redact-${Math.random().toString(36).slice(2, 10)}`;
}
