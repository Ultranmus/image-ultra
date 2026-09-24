import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface Preset<T extends string> {
  value: T;
  label: string;
  /** Optional small visual before the label, e.g. an aspect-ratio glyph. */
  glyph?: ReactNode;
  /** Extra text for screen readers, e.g. "1080 by 1350 pixels". */
  description?: string;
}

export interface PresetStripProps<T extends string> {
  label: string;
  presets: readonly Preset<T>[];
  /** `null` when no preset matches the current state. */
  value: T | null;
  onSelect: (value: T) => void;
}

/** Horizontally scrolling row of choice chips (UI_VISION §5 PresetStrip, compact variant). */
export function PresetStrip<T extends string>({
  label,
  presets,
  value,
  onSelect,
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
    const dir = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    event.preventDefault();
    const current = refs.current.indexOf(document.activeElement as HTMLButtonElement);
    const next = refs.current[(Math.max(0, current) + dir + presets.length) % presets.length];
    next?.focus();
    next?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  return (
    <div
      ref={stripRef}
      className="iu-presets"
      role="radiogroup"
      aria-label={label}
      data-more-start={more.start ? '' : undefined}
      data-more-end={more.end ? '' : undefined}
      onKeyDown={onKeyDown}
    >
      {presets.map((preset, index) => {
        const checked = preset.value === value;
        return (
          <button
            key={preset.value}
            ref={(el) => {
              if (el) refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-description={preset.description}
            tabIndex={index === focusIndex ? 0 : -1}
            className="iu-chip"
            onClick={() => onSelect(preset.value)}
          >
            {preset.glyph}
            <span>{preset.label}</span>
          </button>
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
