import * as RadixPopover from '@radix-ui/react-popover';
import type { ReactNode } from 'react';
import { usePortalContainer } from '../context';

/** Props for `Popover`. */
export interface PopoverProps {
  /** The element that opens the popover (usually an `IconButton` or `ColorButton`). */
  trigger: ReactNode;
  /** Accessible name of the popover panel. */
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Floating panel for secondary controls (colours, widths, fonts). Radix handles focus, Escape and
 * outside clicks; it renders inside the editor root so it keeps the theme.
 */
export function Popover({
  trigger,
  label,
  children,
  side = 'top',
  open,
  onOpenChange,
}: PopoverProps) {
  const container = usePortalContainer();
  return (
    <RadixPopover.Root
      {...(open !== undefined && { open })}
      {...(onOpenChange && { onOpenChange })}
    >
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal container={container}>
        <RadixPopover.Content
          className="iu-popover"
          side={side}
          sideOffset={8}
          collisionPadding={8}
          aria-label={label}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
