import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

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

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, showLabel = false, variant = 'ghost', size = 'md', className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
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
