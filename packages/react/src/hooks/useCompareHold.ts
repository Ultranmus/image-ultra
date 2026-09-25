import { useCallback, useRef } from 'react';
import type { EditorStore } from '@image-ultra/core';

/**
 * "Hold to see the original": `start` shows the whole before image, `end` returns to whatever
 * compare mode was on before (off or split view). Safe to call `end` without `start`.
 */
export function useCompareHold(store: EditorStore) {
  const previous = useRef<number | null | undefined>(undefined);
  const start = useCallback(() => {
    if (previous.current !== undefined || store.getState().status !== 'ready') return;
    previous.current = store.getState().compare;
    store.getState().setCompare(1);
  }, [store]);
  const end = useCallback(() => {
    if (previous.current === undefined) return;
    store.getState().setCompare(previous.current);
    previous.current = undefined;
  }, [store]);
  return { start, end };
}
