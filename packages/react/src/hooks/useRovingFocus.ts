import {
  useLayoutEffect,
  useRef,
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { rowStep } from '../controls/rowStep';

/**
 * One Tab stop for a long row of buttons (e.g. the sticker tiles): only the current item is
 * tabbable; ←/→ (and Home/End) move between items. `resetKey` changing (a new category, a search)
 * starts again at the first item.
 */
export function useRovingFocus(
  ref: RefObject<HTMLElement | null>,
  itemSelector: string,
  resetKey: unknown,
) {
  const active = useRef(0);
  const lastKey = useRef(resetKey);

  const items = () => [...(ref.current?.querySelectorAll<HTMLElement>(itemSelector) ?? [])];
  const sync = () => {
    const all = items();
    if (active.current >= all.length) active.current = 0;
    all.forEach((el, i) => (el.tabIndex = i === active.current ? 0 : -1));
  };

  // Every render: items come and go (lazy lists, search results).
  useLayoutEffect(() => {
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey;
      active.current = 0;
    }
    sync();
  });

  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const index = items().indexOf(event.target as HTMLElement);
    if (index < 0 || index === active.current) return;
    active.current = index;
    sync();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const all = items();
    const current = all.indexOf(event.target as HTMLElement);
    if (current < 0) return;
    const step = rowStep(event.key, event.currentTarget);
    const next =
      step !== 0
        ? current + step
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? all.length - 1
            : null;
    if (next === null) return;
    event.preventDefault();
    const target = all[Math.max(0, Math.min(all.length - 1, next))];
    target?.focus();
    target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return { onFocus, onKeyDown };
}
