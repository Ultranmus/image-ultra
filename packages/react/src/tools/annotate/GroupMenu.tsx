import * as Menu from '@radix-ui/react-dropdown-menu';
import type { ReactNode } from 'react';
import { getCanvasRect, type AlignEdge } from '@image-ultra/core';
import { copySelection, pasteSelection, useClipboardKind } from '../../clipboard';
import { useEditorStore, useLabels, usePortalContainer } from '../../context';
import { formatCount } from '../../i18n';
import { IconChevronRight } from '../../icons/Icon';
import { shapeActions } from './actions';
import { referenceSize } from './state';

const EDGES: AlignEdge[] = ['left', 'centerX', 'right', 'top', 'centerY', 'bottom'];

export interface GroupMenuProps {
  /** The selected shapes. */
  ids: readonly string[];
  trigger: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Called with the new selection after an action (the copies, or none after Delete / Lock / Hide). */
  onSelect: (ids: string[]) => void;
  onCloseAutoFocus?: (event: Event) => void;
}

/**
 * Menu for a multi-selection (right-click / long-press on a member, Shift+F10): copy, paste,
 * duplicate, delete · align ▸ · front / back · lock or hide all. The group stays selected.
 */
export function GroupMenu({
  ids,
  trigger,
  open,
  onOpenChange,
  onSelect,
  onCloseAutoFocus,
}: GroupMenuProps) {
  const store = useEditorStore();
  const labels = useLabels();
  const container = usePortalContainer();
  const canPaste = useClipboardKind() === 'shape';
  const actions = shapeActions(store, labels);
  const members = store.getState().edit.annotations.filter((s) => ids.includes(s.id));
  const anyLocked = members.some((s) => s.locked);
  const anyUnlocked = members.some((s) => !s.locked);

  const offset = () => {
    const { image, edit } = store.getState();
    return image ? referenceSize(image, edit) * 0.03 : 0;
  };
  const photo = () => {
    const { image, edit } = store.getState();
    return image ? getCanvasRect(image, edit) : null;
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
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          aria-label={labels.groupMenu}
          loop
          {...(onCloseAutoFocus && { onCloseAutoFocus })}
          onKeyDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <Menu.Label className="iu-contextmenu__label">
            {formatCount(labels.selectedCount, ids.length)}
          </Menu.Label>
          <Menu.Item className="iu-menu__item" onSelect={() => copySelection(store, labels)}>
            {labels.copy}
          </Menu.Item>
          <Menu.Item
            className="iu-menu__item"
            disabled={!canPaste}
            onSelect={() => {
              const pasted = pasteSelection(store, labels, [store.getState().activeTool]);
              if (pasted) onSelect(pasted);
            }}
          >
            {labels.paste}
          </Menu.Item>
          <Menu.Item
            className="iu-menu__item"
            onSelect={() => onSelect(actions.duplicateMany(ids, offset()))}
          >
            {labels.duplicate}
          </Menu.Item>
          <Menu.Item
            className="iu-menu__item"
            data-danger=""
            disabled={!anyUnlocked}
            onSelect={() => {
              actions.removeMany(ids);
              onSelect([]);
            }}
          >
            {labels.deleteShape}
          </Menu.Item>
          <Menu.Separator className="iu-menu__separator" />
          <Menu.Sub>
            <Menu.SubTrigger className="iu-menu__item iu-contextmenu__sub">
              {labels.arrange}
              <IconChevronRight size={16} />
            </Menu.SubTrigger>
            <Menu.Portal container={container}>
              <Menu.SubContent
                className="iu-popover iu-contextmenu"
                sideOffset={4}
                collisionPadding={8}
                onKeyDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {EDGES.map((edge) => (
                  <Menu.Item
                    key={edge}
                    className="iu-menu__item"
                    onSelect={() => {
                      const area = photo();
                      if (area) actions.align(ids, edge, area);
                    }}
                  >
                    {labels.alignEdges[edge]}
                  </Menu.Item>
                ))}
                <Menu.Separator className="iu-menu__separator" />
                <Menu.Item
                  className="iu-menu__item"
                  disabled={ids.length < 3}
                  onSelect={() => actions.distribute(ids, 'x')}
                >
                  {labels.distributeX}
                </Menu.Item>
                <Menu.Item
                  className="iu-menu__item"
                  disabled={ids.length < 3}
                  onSelect={() => actions.distribute(ids, 'y')}
                >
                  {labels.distributeY}
                </Menu.Item>
              </Menu.SubContent>
            </Menu.Portal>
          </Menu.Sub>
          <Menu.Item className="iu-menu__item" onSelect={() => actions.moveMany(ids, 'front')}>
            {labels.bringToFront}
          </Menu.Item>
          <Menu.Item className="iu-menu__item" onSelect={() => actions.moveMany(ids, 'back')}>
            {labels.sendToBack}
          </Menu.Item>
          <Menu.Separator className="iu-menu__separator" />
          {/* The group stays selected after locking, so it can be unlocked right away. */}
          {anyUnlocked && (
            <Menu.Item
              className="iu-menu__item"
              onSelect={() => actions.setFlagMany(ids, 'locked')}
            >
              {labels.lockAll}
            </Menu.Item>
          )}
          {anyLocked && (
            <Menu.Item
              className="iu-menu__item"
              onSelect={() => actions.setFlagMany(ids, 'locked', false)}
            >
              {labels.unlockAll}
            </Menu.Item>
          )}
          <Menu.Item
            className="iu-menu__item"
            onSelect={() => {
              actions.setFlagMany(ids, 'hidden');
              onSelect([]);
            }}
          >
            {labels.hideAll}
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
