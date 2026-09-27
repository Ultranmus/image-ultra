import { useEffect, useRef, useState } from 'react';
import { parseLooks, type Look } from '@image-ultra/core/internal';

export const DEFAULT_LOOKS_KEY = 'image-ultra:looks';

/**
 * Looks are controlled (`looks` + `onLooksChange`) or kept internally, persisted in localStorage
 * under `persist` (default key) unless `persist` is `false`.
 */
export function useLooksState(
  controlled: Look[] | undefined,
  onChange: ((looks: Look[]) => void) | undefined,
  persist: boolean | string,
): [readonly Look[], (looks: Look[]) => void] {
  const key = persist === true ? DEFAULT_LOOKS_KEY : persist || null;
  const [internal, setInternal] = useState<Look[]>([]);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Read storage after mount (SSR-safe). Storage can be unavailable (private mode) — ignore then.
  useEffect(() => {
    if (controlled || !key) return;
    try {
      const stored = window.localStorage.getItem(key);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing from browser storage
      if (stored) setInternal(parseLooks(JSON.parse(stored)));
    } catch {
      // ignore
    }
  }, [controlled, key]);

  const setLooks = (next: Look[]) => {
    if (!controlled) {
      setInternal(next);
      if (key) {
        try {
          window.localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
    }
    onChangeRef.current?.(next);
  };

  return [controlled ?? internal, setLooks];
}
