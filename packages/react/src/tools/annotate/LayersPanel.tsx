import { useEffect, useRef } from 'react';
import { defaultShapeName, type Shape } from '@image-ultra/core';
import { useEditorStore, useLabels } from '../../context';
import { IconButton } from '../../components/IconButton';
import { shapeActions } from './actions';
import { ShapeMenu } from './ShapeMenu';
import {
  IconChevronDown,
  IconChevronUp,
  IconCircle,
  IconClose,
  IconEye,
  IconEyeOff,
  IconImage,
  IconLine,
  IconLock,
  IconMore,
  IconPen,
  IconSquare,
  IconText,
  IconUnlock,
} from '../../icons/Icon';
import type { IconProps } from '../../icons/Icon';

const TYPE_ICONS: Record<Shape['type'], (p: IconProps) => React.JSX.Element> = {
  rect: IconSquare,
  ellipse: IconCircle,
  line: IconLine,
  path: IconPen,
  text: IconText,
  image: IconImage,
};

/**
 * Floating list of annotations, top layer first: select, show/hide, lock, reorder, and a "⋯" menu
 * with every shape action.
 */
export function LayersPanel({
  shapes,
  selectedId,
  revealId,
  onSelect,
  onClose,
}: {
  shapes: readonly Shape[];
  selectedId: string | null;
  /** Scroll to this layer and focus it ("Show in Layers"). Changes to a new object each time. */
  revealId: { id: string } | null;
  onSelect: (id: string | null) => void;
  onClose: () => void;
}) {
  const labels = useLabels();
  const store = useEditorStore();
  const actions = shapeActions(store, labels);
  const ordered = [...shapes].reverse();
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!revealId) return;
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-layer-id="${CSS.escape(revealId.id)}"] .iu-layers__name`,
    );
    row?.scrollIntoView({ block: 'nearest' });
    row?.focus({ preventScroll: true });
  }, [revealId]);

  return (
    <section
      className="iu-layers"
      aria-label={labels.layers}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <header className="iu-layers__header">
        <span>{labels.layers}</span>
        <IconButton
          label={labels.cancelEdit}
          icon={<IconClose size={16} />}
          size="sm"
          onClick={onClose}
        />
      </header>
      {ordered.length === 0 ? (
        <p className="iu-layers__empty">{labels.noLayers}</p>
      ) : (
        <ul ref={listRef} className="iu-layers__list">
          {ordered.map((shape, index) => {
            const Icon = TYPE_ICONS[shape.type];
            const name = shape.name ?? defaultShapeName(shape);
            return (
              <li
                key={shape.id}
                className="iu-layers__row"
                data-layer-id={shape.id}
                data-selected={shape.id === selectedId ? '' : undefined}
                data-hidden={shape.hidden ? '' : undefined}
              >
                <button
                  type="button"
                  className="iu-layers__name"
                  aria-current={shape.id === selectedId}
                  onClick={() => onSelect(shape.id)}
                  onKeyDown={(e) => {
                    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                      e.preventDefault();
                      actions.move(shape.id, e.key === 'ArrowUp' ? 'forward' : 'backward');
                    }
                  }}
                >
                  <Icon size={16} />
                  <span>{name}</span>
                </button>
                <IconButton
                  size="sm"
                  label={shape.hidden ? labels.showLayer : labels.hideLayer}
                  icon={shape.hidden ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                  onClick={() => actions.toggleHidden(shape)}
                />
                <IconButton
                  size="sm"
                  label={shape.locked ? labels.unlockLayer : labels.lockLayer}
                  icon={shape.locked ? <IconLock size={16} /> : <IconUnlock size={16} />}
                  onClick={() => actions.toggleLocked(shape)}
                />
                <IconButton
                  size="sm"
                  label={labels.bringForward}
                  icon={<IconChevronUp size={16} />}
                  disabled={index === 0}
                  onClick={() => actions.move(shape.id, 'forward')}
                />
                <IconButton
                  size="sm"
                  label={labels.sendBackward}
                  icon={<IconChevronDown size={16} />}
                  disabled={index === ordered.length - 1}
                  onClick={() => actions.move(shape.id, 'backward')}
                />
                <ShapeMenu
                  shape={shape}
                  onSelect={onSelect}
                  side="bottom"
                  align="end"
                  trigger={
                    <IconButton size="sm" label={labels.shapeMenu} icon={<IconMore size={16} />} />
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
