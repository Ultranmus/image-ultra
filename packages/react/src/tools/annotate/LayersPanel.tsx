import { useEffect, useRef, useState, type PointerEvent } from 'react';
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

/** Pointer travel (CSS px) before a press on a row becomes a drag. */
const DRAG_START = 4;

interface RowDrag {
  id: string;
  pointerId: number;
  startY: number;
  dragging: boolean;
  /** Insertion slot in the list as shown (0 = above the top row). */
  slot: number;
}

/**
 * Floating list of annotations, top layer first: select (Shift / ⌘-click for several), drag to
 * reorder, double-click to rename, show/hide, lock, and a "⋯" menu with every shape action.
 */
export function LayersPanel({
  shapes,
  selectedIds,
  revealId,
  onSelect,
  onSelectMany,
  onClose,
}: {
  shapes: readonly Shape[];
  selectedIds: readonly string[];
  /** Scroll to this layer and focus it ("Show in Layers"). Changes to a new object each time. */
  revealId: { id: string } | null;
  onSelect: (id: string | null) => void;
  onSelectMany: (ids: string[]) => void;
  onClose: () => void;
}) {
  const labels = useLabels();
  const store = useEditorStore();
  const actions = shapeActions(store, labels);
  const ordered = [...shapes].reverse();
  const listRef = useRef<HTMLUListElement>(null);
  const drag = useRef<RowDrag | null>(null);
  const [dropSlot, setDropSlot] = useState<number | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  useEffect(() => {
    if (!revealId) return;
    const row = listRef.current?.querySelector<HTMLElement>(
      `[data-layer-id="${CSS.escape(revealId.id)}"] .iu-layers__name`,
    );
    row?.scrollIntoView({ block: 'nearest' });
    row?.focus({ preventScroll: true });
  }, [revealId]);

  /** Shift / ⌘ / Ctrl-click adds a layer to the selection or takes it out. */
  const toggle = (shape: Shape) => {
    if (shape.locked || shape.hidden) return;
    const current = selectedIds.filter((id) =>
      shapes.some((s) => s.id === id && !s.locked && !s.hidden),
    );
    onSelectMany(
      current.includes(shape.id) ? current.filter((id) => id !== shape.id) : [...current, shape.id],
    );
  };

  /* ── Drag to reorder ─────────────────────────────────────────────── */

  const slotAt = (clientY: number): number => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('.iu-layers__row') ?? [])];
    const index = rows.findIndex((row) => {
      const r = row.getBoundingClientRect();
      return clientY < r.top + r.height / 2;
    });
    return index < 0 ? rows.length : index;
  };

  const onRowPointerDown = (event: PointerEvent<HTMLButtonElement>, shape: Shape) => {
    if (event.button !== 0 || renaming) return;
    drag.current = {
      id: shape.id,
      pointerId: event.pointerId,
      startY: event.clientY,
      dragging: false,
      slot: 0,
    };
  };
  const onRowPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointerId !== event.pointerId) return;
    if (!d.dragging) {
      if (Math.abs(event.clientY - d.startY) < DRAG_START) return;
      d.dragging = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    d.slot = slotAt(event.clientY);
    setDropSlot(d.slot);
  };
  const onRowPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    setDropSlot(null);
    if (!d?.dragging || d.pointerId !== event.pointerId) return;
    const from = ordered.findIndex((s) => s.id === d.id);
    const slot = d.slot > from ? d.slot - 1 : d.slot;
    if (from < 0 || slot === from) return;
    // Shown top-first; stored bottom-first.
    actions.moveTo(d.id, ordered.length - 1 - slot);
  };

  const anyHidden = shapes.some((s) => s.hidden);

  return (
    <section
      className="iu-layers"
      aria-label={labels.layers}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // ⌘/Ctrl shortcuts (copy, paste, select all, undo…) still reach the editor.
        if (!(e.metaKey || e.ctrlKey)) e.stopPropagation();
      }}
    >
      <header className="iu-layers__header">
        <span>{labels.layers}</span>
        <span className="iu-layers__actions">
          {anyHidden && (
            <button type="button" className="iu-layers__link" onClick={() => actions.showAll()}>
              {labels.showAllLayers}
            </button>
          )}
          <IconButton
            label={labels.cancelEdit}
            icon={<IconClose size={16} />}
            size="sm"
            onClick={onClose}
          />
        </span>
      </header>
      {ordered.length === 0 ? (
        <p className="iu-layers__empty">{labels.noLayers}</p>
      ) : (
        <ul ref={listRef} className="iu-layers__list">
          {ordered.map((shape, index) => {
            const Icon = TYPE_ICONS[shape.type];
            const name = shape.name ?? defaultShapeName(shape);
            const isSelected = selectedIds.includes(shape.id);
            return (
              <li
                key={shape.id}
                className="iu-layers__row"
                data-layer-id={shape.id}
                data-selected={isSelected ? '' : undefined}
                data-hidden={shape.hidden ? '' : undefined}
                data-drop={
                  dropSlot === index
                    ? 'before'
                    : dropSlot === index + 1 && index === ordered.length - 1
                      ? 'after'
                      : undefined
                }
              >
                {renaming === shape.id ? (
                  <RenameField
                    initial={shape.name ?? ''}
                    placeholder={defaultShapeName(shape)}
                    label={labels.renameLayer}
                    onDone={(value) => {
                      setRenaming(null);
                      if (value !== null) actions.rename(shape.id, value);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    className="iu-layers__name"
                    aria-current={isSelected}
                    title={labels.renameLayer}
                    onPointerDown={(e) => onRowPointerDown(e, shape)}
                    onPointerMove={onRowPointerMove}
                    onPointerUp={onRowPointerUp}
                    onPointerCancel={onRowPointerUp}
                    onClick={(e) => {
                      if (e.shiftKey || e.metaKey || e.ctrlKey) toggle(shape);
                      else onSelect(shape.id);
                    }}
                    onDoubleClick={() => setRenaming(shape.id)}
                    onKeyDown={(e) => {
                      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                        e.preventDefault();
                        actions.move(shape.id, e.key === 'ArrowUp' ? 'forward' : 'backward');
                      } else if (e.key === 'F2') {
                        e.preventDefault();
                        setRenaming(shape.id);
                      }
                    }}
                  >
                    <Icon size={16} />
                    <span>{name}</span>
                  </button>
                )}
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

/** Inline name editor: Enter or leaving the field saves, Escape cancels (`onDone(null)`). */
function RenameField({
  initial,
  placeholder,
  label,
  onDone,
}: {
  initial: string;
  placeholder: string;
  label: string;
  onDone: (value: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (result: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(result);
  };
  return (
    <input
      className="iu-layers__rename"
      aria-label={label}
      value={value}
      placeholder={placeholder}
      maxLength={80}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(value);
        else if (e.key === 'Escape') finish(null);
      }}
    />
  );
}
