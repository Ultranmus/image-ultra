import { defaultShapeName, type Shape } from '@image-ultra/core';
import { useEditorStore, useLabels } from '../../context';
import { IconButton } from '../../components/IconButton';
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

/** Floating list of annotations, top layer first: select, show/hide, lock, reorder. */
export function LayersPanel({
  shapes,
  selectedId,
  onSelect,
  onClose,
}: {
  shapes: readonly Shape[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const labels = useLabels();
  const store = useEditorStore();
  const ordered = [...shapes].reverse();

  const patch = (label: string, id: string, change: (s: Shape) => void) =>
    store.getState().update(label, (draft) => {
      const s = draft.annotations.find((x) => x.id === id);
      if (s) change(s as Shape);
    });

  /** Moves a shape one step up (towards the top) or down in the stack. */
  const reorder = (id: string, direction: 1 | -1) =>
    store
      .getState()
      .update(direction === 1 ? labels.bringForward : labels.sendBackward, (draft) => {
        const i = draft.annotations.findIndex((s) => s.id === id);
        const j = i + direction;
        if (i < 0 || j < 0 || j >= draft.annotations.length) return;
        const [item] = draft.annotations.splice(i, 1);
        draft.annotations.splice(j, 0, item!);
      });

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
        <ul className="iu-layers__list">
          {ordered.map((shape, index) => {
            const Icon = TYPE_ICONS[shape.type];
            const name = shape.name ?? defaultShapeName(shape);
            return (
              <li
                key={shape.id}
                className="iu-layers__row"
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
                      reorder(shape.id, e.key === 'ArrowUp' ? 1 : -1);
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
                  onClick={() =>
                    patch(shape.hidden ? labels.showLayer : labels.hideLayer, shape.id, (s) => {
                      if (s.hidden) delete s.hidden;
                      else s.hidden = true;
                    })
                  }
                />
                <IconButton
                  size="sm"
                  label={shape.locked ? labels.unlockLayer : labels.lockLayer}
                  icon={shape.locked ? <IconLock size={16} /> : <IconUnlock size={16} />}
                  onClick={() =>
                    patch(shape.locked ? labels.unlockLayer : labels.lockLayer, shape.id, (s) => {
                      if (s.locked) delete s.locked;
                      else s.locked = true;
                    })
                  }
                />
                <IconButton
                  size="sm"
                  label={labels.bringForward}
                  icon={<IconChevronUp size={16} />}
                  disabled={index === 0}
                  onClick={() => reorder(shape.id, 1)}
                />
                <IconButton
                  size="sm"
                  label={labels.sendBackward}
                  icon={<IconChevronDown size={16} />}
                  disabled={index === ordered.length - 1}
                  onClick={() => reorder(shape.id, -1)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
