import { useEffect, useRef, useState, type PointerEvent } from 'react';
import type { Shape } from '@image-ultra/core/internal';
import { shapeName } from './shapeName';
import { useEditorStore, useLabels } from '../../context';
import { IconButton } from '../../components/IconButton';
import { shapeActions } from './actions';
import { ShapeMenu } from './ShapeMenu';
import { WATERMARK_ELEMENT_ID } from './watermarkElement';
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
  IconRedact,
  IconSquare,
  IconText,
  IconUnlock,
  IconWatermark,
} from '../../icons/Icon';
import type { IconProps } from '../../icons/Icon';

const TYPE_ICONS: Record<Shape['type'], (p: IconProps) => React.JSX.Element> = {
  rect: IconSquare,
  ellipse: IconCircle,
  line: IconLine,
  path: IconPen,
  text: IconText,
  image: IconImage,
  redact: IconRedact,
  watermark: IconWatermark,
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

  const panelRef = useRef<HTMLElement>(null);

  // Opened with the TopBar button from the keyboard: focus moves into the panel (the selected row,
  // else the top one), so arrow keys and Tab work in it straight away.
  useEffect(() => {
    const panel = panelRef.current;
    const active = panel?.ownerDocument.activeElement;
    if (!panel || !active?.matches('.iu-topbar__layers')) return;
    const row =
      panel.querySelector<HTMLElement>('.iu-layers__row[data-selected] .iu-layers__name') ??
      panel.querySelector<HTMLElement>('.iu-layers__name');
    (row ?? panel).focus({ preventScroll: true });
  }, []);

  /** Closes the panel; focus inside it goes back to the TopBar button instead of the page. */
  const close = () => {
    const panel = panelRef.current;
    const hadFocus = panel?.contains(panel.ownerDocument.activeElement) ?? false;
    const button = panel?.closest('.iu-root')?.querySelector<HTMLElement>('.iu-topbar__layers');
    onClose();
    if (hadFocus) button?.focus({ preventScroll: true });
  };

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
    if (shape.hidden) return;
    const current = selectedIds.filter((id) => shapes.some((s) => s.id === id && !s.hidden));
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
      ref={panelRef}
      className="iu-layers"
      aria-label={labels.layers}
      tabIndex={-1}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // (Not from a row's "⋯" menu: it portals out of the panel and closes on its own.)
        const inPanel = panelRef.current?.contains(e.target as Node) ?? false;
        if (e.key === 'Escape' && inPanel && !renaming && !e.defaultPrevented) {
          e.preventDefault();
          close();
        }
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
            onClick={close}
          />
        </span>
      </header>
      {ordered.length === 0 ? (
        <p className="iu-layers__empty">{labels.noLayers}</p>
      ) : (
        <ul ref={listRef} className="iu-layers__list">
          {ordered.map((shape, index) => {
            const isMark = shape.id === WATERMARK_ELEMENT_ID;
            const Icon = isMark ? IconWatermark : TYPE_ICONS[shape.type];
            const name = isMark ? labels.tools.watermark : shapeName(shape, labels);
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
                    placeholder={shapeName({ ...shape, name: '' }, labels)}
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
                    title={isMark ? undefined : labels.renameLayer}
                    onPointerDown={(e) => onRowPointerDown(e, shape)}
                    onPointerMove={onRowPointerMove}
                    onPointerUp={onRowPointerUp}
                    onPointerCancel={onRowPointerUp}
                    onClick={(e) => {
                      if (e.shiftKey || e.metaKey || e.ctrlKey) toggle(shape);
                      else onSelect(shape.id);
                    }}
                    onDoubleClick={() => !isMark && setRenaming(shape.id)}
                    onKeyDown={(e) => {
                      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                        e.preventDefault();
                        actions.move(shape.id, e.key === 'ArrowUp' ? 'forward' : 'backward');
                      } else if (e.key === 'F2' && !isMark) {
                        e.preventDefault();
                        setRenaming(shape.id);
                      }
                    }}
                  >
                    <Icon size={16} />
                    <span>{name}</span>
                  </button>
                )}
                {/* The watermark can't be hidden or locked here (the Watermark tool has None). */}
                <IconButton
                  size="sm"
                  disabled={isMark}
                  label={shape.hidden ? labels.showLayer : labels.hideLayer}
                  icon={shape.hidden ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                  onClick={() => actions.toggleHidden(shape)}
                />
                <IconButton
                  size="sm"
                  disabled={isMark}
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
      dir="auto"
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
