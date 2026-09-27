import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { rowStep } from './rowStep';

export interface Preset<T extends string> {
  value: T;
  label: string;
  /** Optional small visual before the label, e.g. an aspect-ratio glyph. */
  glyph?: ReactNode;
  /** Extra text for screen readers, e.g. "1080 by 1350 pixels". */
  description?: string;
  /** Shows a remove badge (and Delete key removes it) — needs `onRemove` on the strip. */
  removable?: boolean;
  /** Draw a thin divider before this item (to separate groups). */
  separatorBefore?: boolean;
  /** Small marker in the corner, e.g. a bookmark for the user's own looks. */
  badge?: ReactNode;
}

export interface PresetStripProps<T extends string> {
  label: string;
  presets: readonly Preset<T>[];
  /** `null` when no preset matches the current state. */
  value: T | null;
  onSelect: (value: T) => void;
  /** `thumbs`: large glyph (e.g. a preview image) above the label. */
  variant?: 'chips' | 'thumbs';
  onRemove?: (value: T) => void;
  /** Accessible name of the remove badge, e.g. "Remove look". */
  removeLabel?: string;
}

/** Horizontally scrolling row of choice chips (UI_VISION §5 PresetStrip, compact variant). */
export function PresetStrip<T extends string>({
  label,
  presets,
  value,
  onSelect,
  variant = 'chips',
  onRemove,
  removeLabel = 'Remove',
}: PresetStripProps<T>) {
  const refs = useRef<HTMLButtonElement[]>([]);
  const stripRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });

  // Track whether chips are hidden past either edge, to fade that edge.
  useLayoutEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const measure = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setMore((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [presets.length]);
  const focusIndex = Math.max(
    0,
    presets.findIndex((p) => p.value === value),
  );

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = refs.current.indexOf(document.activeElement as HTMLButtonElement);
    const focused = presets[current];
    if ((event.key === 'Delete' || event.key === 'Backspace') && focused?.removable && onRemove) {
      event.preventDefault();
      onRemove(focused.value);
      refs.current[Math.max(0, current - 1)]?.focus();
      return;
    }
    const dir = rowStep(event.key, event.currentTarget);
    if (!dir) return;
    event.preventDefault();
    const next = refs.current[(Math.max(0, current) + dir + presets.length) % presets.length];
    next?.focus();
    next?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <div
      ref={stripRef}
      className={variant === 'thumbs' ? 'iu-presets iu-presets--thumbs' : 'iu-presets'}
      role="radiogroup"
      aria-label={label}
      data-more-start={more.start ? '' : undefined}
      data-more-end={more.end ? '' : undefined}
      onKeyDown={onKeyDown}
    >
      {presets.map((preset, index) => {
        const checked = preset.value === value;
        return (
          <Fragment key={preset.value}>
            {preset.separatorBefore && <span className="iu-presets__divider" aria-hidden="true" />}
            <button
              ref={(el) => {
                if (el) refs.current[index] = el;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-description={
                preset.removable && onRemove
                  ? [preset.description, `Delete: ${removeLabel}`].filter(Boolean).join('. ')
                  : preset.description
              }
              tabIndex={index === focusIndex ? 0 : -1}
              className={variant === 'thumbs' ? 'iu-chip iu-chip--thumb' : 'iu-chip'}
              onClick={() => onSelect(preset.value)}
            >
              {preset.glyph}
              {preset.badge && (
                <span className="iu-chip__badge" aria-hidden="true">
                  {preset.badge}
                </span>
              )}
              <span className="iu-chip__label">{preset.label}</span>
              {preset.removable && onRemove && (
                // Pointer shortcut; keyboard users press Delete (announced via aria-description).
                <span
                  className="iu-chip__remove"
                  aria-hidden="true"
                  title={removeLabel}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(preset.value);
                  }}
                >
                  ×
                </span>
              )}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

/** Tiny rectangle showing an aspect ratio (or a circle). */
export function AspectGlyph({ aspect, round = false }: { aspect: number | null; round?: boolean }) {
  const max = 14;
  const width = aspect === null ? max : aspect >= 1 ? max : max * aspect;
  const height = aspect === null ? max : aspect >= 1 ? max / aspect : max;
  return (
    <span
      className="iu-chip__glyph"
      data-free={aspect === null ? '' : undefined}
      data-round={round ? '' : undefined}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
