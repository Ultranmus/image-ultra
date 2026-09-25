import { createShapeId, moveShape, type EditorStore, type Shape } from '@image-ultra/core';
import type { Labels } from '../../i18n';

/** Where to move a shape in the stack. `forward`/`backward` = one step; `front`/`back` = all the way. */
export type StackMove = 'forward' | 'backward' | 'front' | 'back';

/**
 * Shape commands shared by the canvas context menu, the Layers panel and keyboard shortcuts.
 * Each one is a single undoable step.
 */
export function shapeActions(store: EditorStore, labels: Labels) {
  const patch = (label: string, id: string, change: (shape: Shape) => void) =>
    store.getState().update(label, (draft) => {
      const shape = draft.annotations.find((s) => s.id === id);
      if (shape) change(shape as Shape);
    });

  const moveLabels: Record<StackMove, string> = {
    forward: labels.bringForward,
    backward: labels.sendBackward,
    front: labels.bringToFront,
    back: labels.sendToBack,
  };

  return {
    toggleLocked(shape: Shape) {
      patch(shape.locked ? labels.unlockLayer : labels.lockLayer, shape.id, (s) => {
        if (s.locked) delete s.locked;
        else s.locked = true;
      });
    },

    toggleHidden(shape: Shape) {
      patch(shape.hidden ? labels.showLayer : labels.hideLayer, shape.id, (s) => {
        if (s.hidden) delete s.hidden;
        else s.hidden = true;
      });
    },

    /** Changes the stacking order (the last shape in the list is drawn on top). */
    move(id: string, to: StackMove) {
      store.getState().update(moveLabels[to], (draft) => {
        const list = draft.annotations;
        const from = list.findIndex((s) => s.id === id);
        if (from < 0) return;
        const target =
          to === 'forward'
            ? from + 1
            : to === 'backward'
              ? from - 1
              : to === 'front'
                ? list.length - 1
                : 0;
        if (target === from || target < 0 || target >= list.length) return;
        const [item] = list.splice(from, 1);
        list.splice(target, 0, item!);
      });
    },

    /** Copies the shape just above the original, slightly offset. Returns the copy's id. */
    duplicate(shape: Shape, offset: number): string {
      const copy = { ...moveShape(shape, offset, offset), id: createShapeId() };
      store.getState().update(labels.duplicate, (draft) => {
        const index = draft.annotations.findIndex((s) => s.id === shape.id);
        draft.annotations.splice(index + 1, 0, copy);
      });
      return copy.id;
    },

    remove(id: string) {
      store.getState().update(labels.deleteShape, (draft) => {
        draft.annotations = draft.annotations.filter((s) => s.id !== id);
      });
    },
  };
}

export type ShapeActions = ReturnType<typeof shapeActions>;

/** Whether a stack move would change anything for the shape at `index` of `count`. */
export function canMove(index: number, count: number, to: StackMove): boolean {
  return to === 'forward' || to === 'front' ? index < count - 1 : index > 0;
}
