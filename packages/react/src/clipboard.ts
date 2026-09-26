import { useSyncExternalStore } from 'react';
import {
  applyToPoint,
  copyShapes,
  getCanvasRect,
  invert,
  pasteClipboard,
  type ClipboardEntry,
  type EditorStore,
  type Point,
} from '@image-ultra/core';
import type { Labels } from './i18n';
import {
  getOrientedToStage,
  INITIAL_ANNOTATE_STATE,
  selectionIds,
  selectPatch,
  type AnnotateState,
} from './tools/annotate/state';
import { insertImageFile } from './tools/annotate/insertImage';

/*
 * One clipboard for every editor on the page, kept in memory (DECISIONS #78): copy on one photo,
 * load the next, paste. Shapes never go to the system clipboard — only a marker does, so a later
 * paste can tell whether our copy is still the newest thing copied. Images copied in other apps
 * (screenshots…) paste in as image shapes (DECISIONS #84).
 */

let entry: ClipboardEntry | null = null;
/** Bumped on every copy; the marker on the system clipboard names it. */
let copyCount = 0;
const MARKER = 'image-ultra/clipboard:';
const listeners = new Set<() => void>();
/** Where the pointer last was over each editor's stage (stage CSS px), `null` when elsewhere. */
const pointers = new WeakMap<EditorStore, Point | null>();

/** Called by the editor on pointer moves: a paste lands here when it's over the photo. */
export function setPastePoint(store: EditorStore, point: Point | null): void {
  pointers.set(store, point);
}

function setEntry(next: ClipboardEntry | null) {
  entry = next;
  copyCount += 1;
  for (const listener of listeners) listener();
}

/** The marker text for the current copy (written to the system clipboard on `copy` / `cut`). */
export function clipboardMarker(): string | null {
  return entry ? `${MARKER}${copyCount}` : null;
}

/** Oriented point under the pointer when it's over the result, else `undefined`. */
function pointerOnResult(store: EditorStore): Point | undefined {
  const { image, edit, viewport } = store.getState();
  const pointer = pointers.get(store);
  if (!image || !pointer) return undefined;
  const area = getCanvasRect(image, edit);
  const at = applyToPoint(invert(getOrientedToStage(image, edit, viewport)), pointer);
  const inside =
    at.x >= area.x && at.y >= area.y && at.x <= area.x + area.width && at.y <= area.y + area.height;
  return inside ? at : undefined;
}

/** What the clipboard holds, `null` when empty (re-renders when that changes). */
export function useClipboardKind(): ClipboardEntry['item']['kind'] | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => entry?.item.kind ?? null,
    () => null,
  );
}

/** Copies one shape, selected or not (the shape menu). */
export function copyShapeById(store: EditorStore, id: string): void {
  const { image, edit } = store.getState();
  if (!image) return;
  const copied = copyShapes(edit, [id], getCanvasRect(image, edit));
  if (copied) setEntry(copied);
}

/** Tools that select elements (shapes, stickers, redaction areas…) on the photo. */
const SHAPE_TOOLS = ['annotate', 'sticker', 'redact'];

/**
 * Copies the active tool's selection — one element or a group (shapes, stickers, redaction areas;
 * never the watermark, there's only one). `cut` also removes it (one undo step; locked elements
 * stay). Returns `false` when nothing is selected.
 */
export function copySelection(store: EditorStore, labels: Labels, cut = false): boolean {
  const state = store.getState();
  const { image, edit, activeTool } = state;
  const ui = state.toolState[activeTool] as Partial<AnnotateState> | undefined;
  if (!image || !ui?.selectedId || !SHAPE_TOOLS.includes(activeTool)) return false;
  const ids = selectionIds({ selectedId: ui.selectedId, selectedIds: ui.selectedIds ?? [] });
  const copied = copyShapes(edit, ids, getCanvasRect(image, edit));
  if (!copied) return false;
  setEntry(copied);
  if (!cut) return true;
  const removable = copied.item.shapes
    .filter((s) => !edit.annotations.find((o) => o.id === s.id)?.locked)
    .map((s) => s.id);
  if (removable.length === 0) return true;
  state.update(labels.cut, (draft) => {
    draft.annotations = draft.annotations.filter((s) => !removable.includes(s.id));
  });
  state.setToolState(activeTool, { ...ui, ...selectPatch([]) });
  return true;
}

/**
 * Pastes the clipboard as one undo step and selects the copy: centred on the mouse pointer when
 * it's over the photo, else next to the original / at the same relative spot. Pastes into the
 * open tool when it selects elements (Annotate, Sticker, Redact), else switches to Annotate.
 * `tools` = the tool ids shown in this editor. Returns the copies' ids, or `null` when there's
 * nothing to paste or no tool to paste into.
 */
export function pasteSelection(
  store: EditorStore,
  labels: Labels,
  tools: readonly string[],
): string[] | null {
  const state = store.getState();
  const { image, activeTool } = state;
  if (!entry || !image) return null;
  const target = SHAPE_TOOLS.includes(activeTool)
    ? activeTool
    : (SHAPE_TOOLS.find((t) => tools.includes(t)) ?? null);
  if (!target) return null;

  const pasted = entry;
  const area = getCanvasRect(image, state.edit);
  // Over the photo: centre the copy on the pointer. Elsewhere: next to the original.
  const at = pointerOnResult(store);
  let ids: string[] = [];
  state.update(labels.paste, (draft) => {
    ids = pasteClipboard(draft, pasted, area, at);
  });
  const current =
    (store.getState().toolState[target] as object | undefined) ?? INITIAL_ANNOTATE_STATE;
  store.getState().setToolState(target, { ...current, ...selectPatch(ids) });
  if (target !== activeTool) store.getState().setActiveTool(target);
  return ids;
}

/**
 * A `paste` event on the editor: our own copy when the system clipboard still holds our marker,
 * else an image copied elsewhere (added as an image shape in Annotate or Sticker), else our copy
 * if the clipboard is empty. Returns `true` when it pasted something.
 */
export async function pasteFromSystem(
  store: EditorStore,
  labels: Labels,
  tools: readonly string[],
  data: DataTransfer,
): Promise<boolean> {
  const text = data.getData('text/plain');
  if (text && text === clipboardMarker()) return pasteSelection(store, labels, tools) !== null;
  const file = [...data.files].find((f) => f.type.startsWith('image/'));
  if (file) {
    const { activeTool } = store.getState();
    const target = SHAPE_TOOLS.includes(activeTool)
      ? activeTool
      : SHAPE_TOOLS.find((t) => tools.includes(t));
    if (!target) return false;
    const id = await insertImageFile(store, labels.paste, file, {
      at: pointerOnResult(store),
      createdBy: 'paste',
    });
    if (!id) return false;
    const current =
      (store.getState().toolState[target] as object | undefined) ?? INITIAL_ANNOTATE_STATE;
    store.getState().setToolState(target, { ...current, ...selectPatch([id]) });
    if (target !== store.getState().activeTool) store.getState().setActiveTool(target);
    return true;
  }
  // Text copied elsewhere isn't ours to paste; with nothing at all, our copy is the newest.
  if (text || data.types.length > 0) return false;
  return pasteSelection(store, labels, tools) !== null;
}
