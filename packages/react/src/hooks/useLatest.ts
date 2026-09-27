import { useLayoutEffect, useRef } from 'react';

/**
 * A ref that always holds the latest `value`. For listeners registered once (wheel, keydown): they
 * read `ref.current` at event time, so e.g. history step names follow a language switch.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
