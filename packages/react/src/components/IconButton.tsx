import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name, also shown as the hover tooltip. */
  label: string;
  icon: ReactNode;
  /** Show the label next to the icon (TopBar text buttons). */
  showLabel?: boolean;
  variant?: 'ghost' | 'primary';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, showLabel = false, variant = 'ghost', className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={showLabel ? undefined : label}
      data-tooltip={showLabel ? undefined : label}
      data-variant={variant}
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
