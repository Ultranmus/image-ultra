import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  defaultShapeName,
  getOutputSize,
  type EditorStore,
  type EditorStoreState,
} from '@image-ultra/core';
import type { Labels } from '../i18n';
import { selectionIds, type AnnotateState } from '../tools/annotate/state';
import { elementsOf } from '../tools/annotate/watermarkElement';

/** Says `message` to screen readers; `urgent` interrupts (errors). */
export type Announce = (message: string, urgent?: boolean) => void;

/** Zoom and crop change continuously (wheel, pinch, drag): speak once it settles. */
const SETTLE_MS = 500;

/**
 * Two visually hidden live regions (polite + assertive) and `announce` to fill them. Saying the same
 * message twice still speaks: a no-break space is toggled on the end.
 */
export function useAnnouncer(): [ReactNode, Announce] {
  const [polite, setPolite] = useState('');
  const [urgent, setUrgent] = useState('');
  const announce = useCallback<Announce>((message, isUrgent = false) => {
    const set = isUrgent ? setUrgent : setPolite;
    set((previous) => (previous === message ? `${message}\u00a0` : message));
  }, []);
  const regions = (
    <>
      <div className="iu-sr-only iu-announcer" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="iu-sr-only" aria-live="assertive" aria-atomic="true">
        {urgent}
      </div>
    </>
  );
  return [regions, announce];
}

/**
 * Speaks what the editor did that isn't otherwise visible to a screen reader: undo / redo / history
 * jumps, zoom, the crop size (Adjust), and what is selected (Annotate, Sticker, Redact).
 */
export function useStoreAnnouncements(
  store: EditorStore,
  labels: Labels,
  announce: Announce,
  watermarkLocked: boolean,
) {
  const latest = useRef({ labels, announce, watermarkLocked });
  useEffect(() => {
    latest.current = { labels, announce, watermarkLocked };
  });

  useEffect(() => {
    const timers = new Map<string, number>();
    const later = (key: string, message: () => string) => {
      window.clearTimeout(timers.get(key));
      timers.set(
        key,
        window.setTimeout(() => latest.current.announce(message()), SETTLE_MS),
      );
    };

    const unsubscribe = store.subscribe((s, prev) => {
      const { labels: l, announce: say, watermarkLocked: locked } = latest.current;
      if (s.status !== 'ready' || prev.status !== 'ready') return;

      // Undo / redo / History panel jumps (a new edit clears the future: not announced).
      const back = prev.history.past.length - s.history.past.length;
      const moved = s.history.future.length - prev.history.future.length;
      if (back !== 0 && moved === back) {
        const current = s.history.past.at(-1)?.label ?? l.historyOriginal;
        if (back === 1) say(l.announceUndo.replace('{step}', s.history.future[0]?.label ?? ''));
        else if (back === -1) say(l.announceRedo.replace('{step}', current));
        else say(l.announceHistory.replace('{step}', current));
      }

      // Zoom the user asked for: into / out of "fit". A re-fit (the stage changed size, a tool
      // switch) keeps it fitted and says nothing.
      const scale = (x: EditorStoreState) => x.cropView?.scale ?? x.viewport.scale;
      if (scale(s) !== scale(prev) && !(s.isFitted && prev.isFitted)) {
        later('zoom', () =>
          l.announceZoom.replace('{percent}', String(Math.round(scale(store.getState()) * 100))),
        );
      }

      // The crop size, in Adjust.
      if (s.activeTool === 'adjust' && s.image && s.edit.geometry !== prev.edit.geometry) {
        const size = getOutputSize(s.image, s.edit);
        const before = prev.image ? getOutputSize(prev.image, prev.edit) : null;
        if (!before || size.width !== before.width || size.height !== before.height) {
          later('crop', () => {
            const now = store.getState();
            if (!now.image) return '';
            const { width, height } = getOutputSize(now.image, now.edit);
            return l.announceCrop
              .replace('{width}', String(width))
              .replace('{height}', String(height));
          });
        }
      }

      // What's selected, in the element tools.
      // (Tool state can be anything — Resize keeps a plain string — so check it's a selection.)
      const ui = selectionState(s.toolState[s.activeTool]);
      const prevUi = selectionState(prev.toolState[prev.activeTool]);
      if (s.activeTool === prev.activeTool && ui && ui !== prevUi) {
        const ids = idsOf(ui);
        const was = prevUi ? idsOf(prevUi) : [];
        if (ids.join() !== was.join()) {
          if (ids.length === 0) say(l.announceNothingSelected);
          else if (ids.length > 1) say(l.selectedCount.replace('{count}', String(ids.length)));
          else {
            const shape = elementsOf(s.image, s.edit, locked).find((e) => e.id === ids[0]);
            if (shape)
              say(l.announceSelected.replace('{name}', shape.name ?? defaultShapeName(shape)));
          }
        }
      }
    });
    return () => {
      unsubscribe();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [store]);
}

/** The selection in a tool's UI state (Annotate, Sticker and Redact share the shape). */
function idsOf(ui: Partial<AnnotateState>): string[] {
  return selectionIds({
    selectedId: ui.selectedId ?? null,
    ...(ui.selectedIds && { selectedIds: ui.selectedIds }),
  });
}

/** A tool's UI state when it holds a selection (Annotate, Sticker, Redact), else `null`. */
function selectionState(value: unknown): Partial<AnnotateState> | null {
  return typeof value === 'object' && value !== null && 'selectedId' in value
    ? (value as Partial<AnnotateState>)
    : null;
}
