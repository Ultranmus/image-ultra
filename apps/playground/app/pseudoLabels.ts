import { defaultLabels, type LabelOverrides } from '@image-ultra/react';

/**
 * A fake language for testing: every label wrapped in ⟦ ⟧. Any text in the editor without the
 * brackets didn't come from the labels (so it can't be translated). Open `/?locale=pseudo`.
 */
export const pseudoLabels = wrap(defaultLabels) as LabelOverrides;

function wrap(value: unknown): unknown {
  if (typeof value === 'string') return `⟦${value}⟧`;
  if (typeof value === 'function')
    return (...args: unknown[]) => `⟦${String((value as (...a: unknown[]) => unknown)(...args))}⟧`;
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, wrap(v)]));
  return value;
}
