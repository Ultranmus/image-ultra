import { useLayoutEffect, type RefObject } from 'react';

/**
 * Marks a sideways-scrolling row with `data-more-start` / `data-more-end` while content is hidden
 * past that edge; `.iu-fade-x` fades it. Follows scrolling, resizing and changing content.
 */
export function useEdgeFade(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      el.toggleAttribute('data-more-start', el.scrollLeft > 1);
      el.toggleAttribute('data-more-end', el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    const mutation = new MutationObserver(measure);
    mutation.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', measure);
      resize.disconnect();
      mutation.disconnect();
    };
  }, [ref]);
}
