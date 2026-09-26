import type { EditorStore } from '@image-ultra/core';
import type { ChangeSource } from './RulerSlider';

/**
 * `onChangeStart` / `onChangeEnd` for a slider that changes the edit: a drag is one undo step, and
 * quick arrow-key presses on the same control merge into one too (DECISIONS #90).
 * `enabled = false` makes both no-ops (e.g. nothing selected to change).
 */
export function undoStep(store: EditorStore, label: string, enabled = true) {
  return {
    onChangeStart: (source: ChangeSource) => {
      if (enabled) store.getState().beginChange(label, { coalesce: source === 'keyboard' });
    },
    onChangeEnd: () => {
      if (enabled) store.getState().endChange();
    },
  };
}
