import * as Menu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import type { Shape } from '@image-ultra/core';
import { useEditorState, useEditorStore, useLabels, usePortalContainer } from '../../context';
import { canMove, shapeActions, type StackMove } from './actions';
import { referenceSize } from './state';

export interface ShapeMenuProps {
  shape: Shape;
  /** The element the menu opens from (a "⋯" button, or an invisible anchor at the pointer). */
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called with the shape to select after an action (the copy after Duplicate, `null` after Delete). */
  onSelect: (id: string | null) => void;
  /** Adds "Show in Layers" (left out inside the Layers panel itself). */
  onShowInLayers?: (() => void) | undefined;
  /** Stop Radix from moving focus back to the trigger on close (for invisible anchors). */
  onCloseAutoFocus?: (event: Event) => void;
  side?: 'bottom' | 'right';
  align?: 'start' | 'end';
}

/**
 * Actions for one shape: lock, show/hide, stacking order, duplicate, delete. Used by the canvas
 * (right-click, long-press, Shift+F10) and the "⋯" button on each Layers row. Works on locked
 * shapes too — it's how they get unlocked from the photo.
 */
export function ShapeMenu({
  shape,
  trigger,
  open,
  onOpenChange,
  onSelect,
  onShowInLayers,
  onCloseAutoFocus,
  side = 'bottom',
  align = 'start',
}: ShapeMenuProps) {
  const store = useEditorStore();
  const labels = useLabels();
  const container = usePortalContainer();
  const shapes = useEditorState((s) => s.edit.annotations);
  const actions = shapeActions(store, labels);
  const index = shapes.findIndex((s) => s.id === shape.id);

  const order: [StackMove, string][] = [
    ['front', labels.bringToFront],
    ['forward', labels.bringForward],
    ['backward', labels.sendBackward],
    ['back', labels.sendToBack],
  ];

  const duplicate = () => {
    const { image, edit } = store.getState();
    const offset = image ? referenceSize(image, edit) * 0.03 : 0;
    onSelect(actions.duplicate(shape, offset));
  };

  return (
    <Menu.Root
      modal={false}
      {...(open !== undefined && { open })}
      {...(onOpenChange && { onOpenChange })}
    >
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal container={container}>
        <Menu.Content
          className="iu-popover iu-contextmenu"
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          aria-label={labels.shapeMenu}
          loop
          {...(onCloseAutoFocus && { onCloseAutoFocus })}
          // Portalled, but React still bubbles its events to the canvas overlay: keep them here.
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Menu.Item className="iu-menu__item" onSelect={() => actions.toggleLocked(shape)}>
            {shape.locked ? labels.unlockLayer : labels.lockLayer}
          </Menu.Item>
          <Menu.Item className="iu-menu__item" onSelect={() => actions.toggleHidden(shape)}>
            {shape.hidden ? labels.showLayer : labels.hideLayer}
          </Menu.Item>
          <Menu.Separator className="iu-menu__separator" />
          {order.map(([to, label]) => (
            <Menu.Item
              key={to}
              className="iu-menu__item"
              disabled={!canMove(index, shapes.length, to)}
              onSelect={() => actions.move(shape.id, to)}
            >
              {label}
            </Menu.Item>
          ))}
          <Menu.Separator className="iu-menu__separator" />
          <Menu.Item className="iu-menu__item" onSelect={duplicate}>
            {labels.duplicate}
          </Menu.Item>
          <Menu.Item
            className="iu-menu__item"
            data-danger=""
            disabled={shape.locked === true}
            onSelect={() => {
              actions.remove(shape.id);
              onSelect(null);
            }}
          >
            {labels.deleteShape}
          </Menu.Item>
          {onShowInLayers && (
            <>
              <Menu.Separator className="iu-menu__separator" />
              <Menu.Item className="iu-menu__item" onSelect={onShowInLayers}>
                {labels.showInLayers}
              </Menu.Item>
            </>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
