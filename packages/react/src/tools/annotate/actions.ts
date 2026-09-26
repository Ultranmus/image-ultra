import {
  alignShapes,
  createShapeId,
  distributeShapes,
  groupBounds,
  measureTextHeight,
  moveShape,
  type AlignEdge,
  type Box,
  type EditorStore,
  type EditState,
  type Shape,
} from '@image-ultra/core';
import type { Labels } from '../../i18n';
import {
  ensureMarker,
  normalizeMarker,
  storeElements,
  watermarkFromBox,
  WATERMARK_ELEMENT_ID,
} from './watermarkElement';

/** Where to move a shape in the stack. `forward`/`backward` = one step; `front`/`back` = all the way. */
export type StackMove = 'forward' | 'backward' | 'front' | 'back';

/**
 * Element commands shared by the canvas context menu, the Layers panel and keyboard shortcuts.
 * Each one is a single undoable step. The watermark takes part through its box and marker
 * (`watermarkElement.ts`): it can be moved, resized, rotated, reordered and deleted — not copied,
 * locked or hidden.
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

  const movable = (ids: readonly string[]) =>
    storeElements(store).filter((s) => ids.includes(s.id) && !s.locked && !s.hidden);
  const isWatermark = (id: string) => id === WATERMARK_ELEMENT_ID;
  /** A change to the order: the watermark's marker made explicit for it, tidied after. */
  const reorder = (label: string, change: (draft: EditState) => void) =>
    store.getState().update(label, (draft) => {
      ensureMarker(draft);
      change(draft);
      normalizeMarker(draft);
    });

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
      reorder(moveLabels[to], (draft) => {
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

    /** Moves a shape to `index` in the list (0 = bottom), e.g. after dragging it in Layers. */
    moveTo(id: string, index: number) {
      reorder(labels.reorderLayer, (draft) => {
        const from = draft.annotations.findIndex((s) => s.id === id);
        if (from < 0 || from === index) return;
        const [item] = draft.annotations.splice(from, 1);
        draft.annotations.splice(Math.max(0, Math.min(index, draft.annotations.length)), 0, item!);
      });
    },

    /** Renames a layer; an empty name brings back the default one. */
    rename(id: string, name: string) {
      patch(labels.renameLayer, id, (s) => {
        const trimmed = name.trim().slice(0, 80);
        if (trimmed) s.name = trimmed;
        else delete s.name;
      });
    },

    /** Makes every hidden shape visible again (one step). */
    showAll() {
      store.getState().update(labels.showAllLayers, (draft) => {
        for (const s of draft.annotations) delete s.hidden;
      });
    },

    /** Copies the shape just above the original, slightly offset. Returns the copy's id. */
    duplicate(shape: Shape, offset: number): string {
      // There's only one watermark.
      if (isWatermark(shape.id)) return shape.id;
      const copy = { ...moveShape(shape, offset, offset), id: createShapeId() };
      store.getState().update(labels.duplicate, (draft) => {
        const index = draft.annotations.findIndex((s) => s.id === shape.id);
        draft.annotations.splice(index + 1, 0, copy);
      });
      return copy.id;
    },

    remove(id: string) {
      this.removeMany([id]);
    },

    /* ── Several shapes (a multi-selection) ───────────────────────────── */

    /** Deletes these shapes, except locked ones (one step). */
    removeMany(ids: readonly string[]) {
      store.getState().update(labels.deleteShape, (draft) => {
        draft.annotations = draft.annotations.filter((s) => !ids.includes(s.id) || s.locked);
        if (ids.some(isWatermark)) draft.watermark = null;
        normalizeMarker(draft);
      });
    },

    /** Copies the shapes on top of everything, slightly offset, keeping their order. Returns the new ids. */
    duplicateMany(ids: readonly string[], offset: number): string[] {
      const originals = store
        .getState()
        .edit.annotations.filter((s) => ids.includes(s.id) && s.type !== 'watermark');
      // Copies are always editable, like a paste.
      const copies = originals.map((s) => {
        const copy: Shape = { ...moveShape(s, offset, offset), id: createShapeId() };
        delete copy.locked;
        return copy;
      });
      store.getState().update(labels.duplicate, (draft) => {
        draft.annotations.push(...copies);
      });
      return copies.map((c) => c.id);
    },

    /** Brings several shapes to the front (or sends them to the back), keeping their order. */
    moveMany(ids: readonly string[], to: 'front' | 'back') {
      reorder(to === 'front' ? labels.bringToFront : labels.sendToBack, (draft) => {
        const moving = draft.annotations.filter((s) => ids.includes(s.id));
        const rest = draft.annotations.filter((s) => !ids.includes(s.id));
        draft.annotations = to === 'front' ? [...rest, ...moving] : [...moving, ...rest];
      });
    },

    /** Locks / unlocks or hides / shows several shapes (one step). */
    setFlagMany(ids: readonly string[], flag: 'locked' | 'hidden', on = true) {
      const label =
        flag === 'locked'
          ? on
            ? labels.lockAll
            : labels.unlockAll
          : on
            ? labels.hideAll
            : labels.showAllLayers;
      store.getState().update(label, (draft) => {
        for (const s of draft.annotations) {
          if (!ids.includes(s.id) || s.type === 'watermark') continue;
          if (on) s[flag] = true;
          else if (flag === 'locked') delete s.locked;
          else delete s.hidden;
        }
      });
    },

    /** Replaces shapes by id (a group move / resize / rotate step). */
    replaceMany(label: string, shapes: readonly Shape[]) {
      const byId = new Map(shapes.map((s) => [s.id, s]));
      const mark = byId.get(WATERMARK_ELEMENT_ID);
      const { image } = store.getState();
      store.getState().update(label, (draft) => {
        draft.annotations = draft.annotations.map((s) =>
          s.type === 'watermark' ? s : (byId.get(s.id) ?? s),
        );
        // The watermark's box → its custom position, size and angle.
        if (mark && mark.type === 'image' && image && draft.watermark)
          Object.assign(draft.watermark, watermarkFromBox(image, draft, mark));
      });
    },

    /**
     * Aligns the shapes: a group to its own bounds, a single shape to `photo` (the visible area).
     * Locked shapes don't move.
     */
    align(ids: readonly string[], edge: AlignEdge, photo: Box) {
      const shapes = movable(ids);
      const target = shapes.length > 1 ? groupBounds(shapes, measureTextHeight) : photo;
      if (!target || shapes.length === 0) return;
      this.replaceMany(
        labels.alignEdges[edge],
        alignShapes(shapes, edge, target, measureTextHeight),
      );
    },

    /** Equal gaps between 3+ shapes along `axis`. */
    distribute(ids: readonly string[], axis: 'x' | 'y') {
      const shapes = movable(ids);
      if (shapes.length < 3) return;
      this.replaceMany(
        axis === 'x' ? labels.distributeX : labels.distributeY,
        distributeShapes(shapes, axis, measureTextHeight),
      );
    },
  };
}

export type ShapeActions = ReturnType<typeof shapeActions>;

/** Whether a stack move would change anything for the shape at `index` of `count`. */
export function canMove(index: number, count: number, to: StackMove): boolean {
  return to === 'forward' || to === 'front' ? index < count - 1 : index > 0;
}
