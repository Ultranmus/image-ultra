import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Hover this long before a tooltip appears (UI_VISION §5). */
const SHOW_DELAY_MS = 400;
/** Moving to a neighbour within this time shows its tooltip at once (scanning a toolbar). */
const SKIP_DELAY_MS = 300;
/** Gap between the element and its tooltip, and the minimum distance to the window edge. */
const GAP_PX = 6;
const EDGE_PX = 8;

export interface TooltipLayerProps {
  /** The editor root; any element inside it with `data-tooltip="…"` gets a tooltip. */
  root: HTMLElement | null;
  /** Where the tooltip renders (inside the root, so it keeps the theme). */
  container: HTMLElement | null;
}

interface Tip {
  target: HTMLElement;
  text: string;
}

/**
 * One shared tooltip for every `[data-tooltip]` element in the editor. It renders in the portal
 * layer with fixed positioning, so scrolling panels (`overflow: auto/hidden`) never clip it, and
 * flips above the element when there's no room below. Mouse hover and keyboard focus only —
 * never on touch. The text repeats the element's `aria-label`, so it's hidden from screen readers.
 */
export function TooltipLayer({ root, container }: TooltipLayerProps) {
  const [tip, setTip] = useState<Tip | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!root) return;
    let timer = 0;
    let current: HTMLElement | null = null;
    let visible = false;
    let hiddenAt = -Infinity;

    const show = (target: HTMLElement, immediate: boolean) => {
      const text = target.dataset['tooltip'];
      if (!text || current === target) return;
      window.clearTimeout(timer);
      current = target;
      const open = () => {
        visible = true;
        setTip({ target, text });
      };
      if (immediate || performance.now() - hiddenAt < SKIP_DELAY_MS) open();
      else timer = window.setTimeout(open, SHOW_DELAY_MS);
    };
    const hide = () => {
      window.clearTimeout(timer);
      if (visible) hiddenAt = performance.now();
      visible = false;
      current = null;
      setTip(null);
    };
    const targetOf = (event: Event): HTMLElement | null => {
      const element = event.target instanceof Element ? event.target : null;
      const target = element?.closest<HTMLElement>('[data-tooltip]') ?? null;
      if (!target || !root.contains(target) || isDisabled(target)) return null;
      return target;
    };

    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const target = targetOf(event);
      if (target) show(target, false);
      else if (current) hide();
    };
    const onPointerOut = (event: PointerEvent) => {
      const next = event.relatedTarget instanceof Node ? event.relatedTarget : null;
      if (current && !(next && current.contains(next))) hide();
    };
    const onFocusIn = (event: FocusEvent) => {
      const target = targetOf(event);
      if (target?.matches(':focus-visible')) show(target, true);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && current) hide();
    };

    root.addEventListener('pointerover', onPointerOver);
    root.addEventListener('pointerout', onPointerOut);
    root.addEventListener('pointerdown', hide);
    root.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', hide);
    root.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      window.clearTimeout(timer);
      root.removeEventListener('pointerover', onPointerOver);
      root.removeEventListener('pointerout', onPointerOut);
      root.removeEventListener('pointerdown', hide);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', hide);
      root.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, [root]);

  // Place below the element, or above when there's no room; keep it inside the window.
  // Written straight to the node: it's measured first, so it stays hidden until placed.
  useLayoutEffect(() => {
    const element = tipRef.current;
    if (!tip || !element || !tip.target.isConnected) return;
    const anchor = tip.target.getBoundingClientRect();
    const { width, height } = element.getBoundingClientRect();
    const below = anchor.bottom + GAP_PX;
    const top =
      below + height + EDGE_PX <= window.innerHeight ? below : anchor.top - GAP_PX - height;
    const centred = anchor.left + anchor.width / 2 - width / 2;
    const left = Math.min(Math.max(centred, EDGE_PX), window.innerWidth - width - EDGE_PX);
    element.style.top = `${Math.max(top, EDGE_PX)}px`;
    element.style.left = `${left}px`;
    element.dataset['placed'] = '';
  }, [tip]);

  if (!tip || !container) return null;
  return createPortal(
    <div ref={tipRef} className="iu-tooltip" aria-hidden="true">
      {tip.text}
    </div>,
    container,
  );
}

function isDisabled(element: HTMLElement): boolean {
  return element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true';
}
