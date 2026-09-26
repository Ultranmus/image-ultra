import { useCallback } from 'react';
import type { EditorStore, EditorStoreState } from '@image-ultra/core';
import { useEditorState, useEditorStore } from '../../context';

/**
 * The Layers panel is editor-wide (a TopBar button), not part of one tool. Its open flag lives in
 * `toolState` under this key, so it survives tool switches.
 */
export const LAYERS_STATE_KEY = 'layers';

/** Tools whose stage shows the elements, and so the Layers panel. Annotate first. */
export const ELEMENT_TOOLS: readonly string[] = ['annotate', 'sticker', 'redact'];

/** The panel is open and the active tool can show it. */
export function isLayersShown(state: EditorStoreState): boolean {
  return state.toolState[LAYERS_STATE_KEY] === true && ELEMENT_TOOLS.includes(state.activeTool);
}

export function useLayersOpen(): [boolean, (open: boolean) => void] {
  const store = useEditorStore();
  const open = useEditorState(isLayersShown);
  const setOpen = useCallback(
    (next: boolean) => store.getState().setToolState(LAYERS_STATE_KEY, next),
    [store],
  );
  return [open, setOpen];
}

/**
 * TopBar button: opens the panel (switching to `fallbackTool` when the active tool doesn't show
 * elements), or closes it.
 */
export function toggleLayers(store: EditorStore, fallbackTool: string) {
  const state = store.getState();
  if (isLayersShown(state)) {
    state.setToolState(LAYERS_STATE_KEY, false);
    return;
  }
  if (!ELEMENT_TOOLS.includes(state.activeTool)) state.setActiveTool(fallbackTool);
  store.getState().setToolState(LAYERS_STATE_KEY, true);
}
