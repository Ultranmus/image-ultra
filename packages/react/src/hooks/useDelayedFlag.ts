import { useEffect, useState } from 'react';

/** `true` only after `value` has stayed true for `delayMs`. */
export function useDelayedFlag(value: boolean, delayMs: number): boolean {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!value) return;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [value, delayMs]);
  return value && elapsed;
}
