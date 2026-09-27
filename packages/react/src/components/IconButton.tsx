import {
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { focusNeighbour } from './focusFallback';

/** Props for `IconButton`. */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name, also shown as the hover tooltip. */
  label: string;
  icon: ReactNode;
  /** Show the label next to the icon (TopBar text buttons). */
  showLabel?: boolean;
  variant?: 'ghost' | 'primary';
  /** `sm` = 24px, for secondary actions inside dense panels. Default `md` (40px touch target). */
  size?: 'md' | 'sm';
}

/** A square icon button with a tooltip, styled like the editor's own. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, showLabel = false, variant = 'ghost', size = 'md', className, ...props },
  ref,
) {
  const own = useRef<HTMLButtonElement>(null);
  useImperativeHandle(ref, () => own.current!, []);
  // A button that disables itself while focused (Undo at the first step, Reset once reset) hands
  // focus to its neighbour instead of dropping it to the page.
  useLayoutEffect(() => {
    const el = own.current;
    if (props.disabled && el && el === el.ownerDocument.activeElement) focusNeighbour(el);
  }, [props.disabled]);
  return (
    <button
      ref={own}
      type="button"
      aria-label={showLabel ? undefined : label}
      data-tooltip={showLabel ? undefined : label}
      data-variant={variant}
      data-size={size === 'sm' ? 'sm' : undefined}
      className={['iu-button', showLabel ? 'iu-button--text' : '', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {icon}
      {showLabel && <span className="iu-button__label">{label}</span>}
    </button>
  );
});
