import {
  forwardRef,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type PointerEvent,
} from 'react';
import { useLabels } from '../context';

/** Default annotation palette (the last one is the brand plum). */
export const DEFAULT_SWATCHES = [
  '#ffffff',
  '#000000',
  '#ff3b30',
  '#ff9500',
  '#ffcc00',
  '#34c759',
  '#00c7be',
  '#0a84ff',
  '#5856d6',
  '#af52de',
  '#ff2d55',
  '#4d194d',
] as const;

/** Props for `SwatchPicker`. */
export interface SwatchPickerProps {
  /** Hex colour or `null` (none). */
  value: string | null;
  onChange: (value: string | null) => void;
  /** Offer "none" (e.g. for fills). */
  allowNone?: boolean;
  swatches?: readonly string[];
}

/** Swatches + a compact HSV picker with hex input and eyedropper (UI_VISION §5). */
export function SwatchPicker({
  value,
  onChange,
  allowNone = false,
  swatches = DEFAULT_SWATCHES,
}: SwatchPickerProps) {
  const labels = useLabels();
  const [custom, setCustom] = useState(false);
  const hex = value && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : '#ff3b30';

  return (
    <div className="iu-swatches">
      <div className="iu-swatches__row" role="radiogroup" aria-label={labels.color}>
        {allowNone && (
          <button
            type="button"
            role="radio"
            aria-checked={value === null}
            aria-label={labels.colorNone}
            className="iu-swatch iu-swatch--none"
            onClick={() => onChange(null)}
          />
        )}
        {swatches.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={value?.toLowerCase() === color}
            aria-label={color}
            className="iu-swatch"
            style={{ background: color }}
            onClick={() => onChange(color)}
          />
        ))}
        <button
          type="button"
          aria-expanded={custom}
          aria-label={labels.colorCustom}
          className="iu-swatch iu-swatch--custom"
          onClick={() => setCustom((v) => !v)}
        />
      </div>
      {custom && <HsvPicker value={hex} onChange={onChange} />}
    </div>
  );
}

/** Round colour button that shows the current colour (or "none"). */
export const ColorButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { swatch: string | null; label: string; ring?: boolean }
>(function ColorButton({ swatch, label, ring = false, className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      data-tooltip={label}
      className={['iu-button', 'iu-colorbutton', className].filter(Boolean).join(' ')}
      {...props}
    >
      <span
        className="iu-colorbutton__dot"
        data-none={swatch === null ? '' : undefined}
        data-ring={ring ? '' : undefined}
        style={swatch ? { ['--iu-dot' as string]: swatch } : undefined}
      />
    </button>
  );
});

/* ── HSV ───────────────────────────────────────────────────────────────── */

interface Hsv {
  h: number;
  s: number;
  v: number;
}

function hexToHsv(hex: string): Hsv {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max ? d / max : 0, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return `#${[f(5), f(3), f(1)]
    .map((c) =>
      Math.round(c * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Saturation/brightness area, hue slider, hex input and eyedropper. */
export function HsvPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  const labels = useLabels();
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [text, setText] = useState(value);
  const lastEmitted = useRef(value);

  // Follow outside changes (e.g. swatch clicks) without fighting the user's drag.
  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setHsv(hexToHsv(value));
    setText(value);
  }, [value]);

  const emit = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setText(hex);
    lastEmitted.current = hex;
    onChange(hex);
  };

  const onArea = (event: PointerEvent<HTMLDivElement>) =>
    trackPointer(event, (x, y) => emit({ ...hsv, s: x, v: 1 - y }));
  const onHue = (event: PointerEvent<HTMLDivElement>) =>
    trackPointer(event, (x) => emit({ ...hsv, h: x * 359.9 }));

  const eyeDropper =
    typeof window !== 'undefined' && 'EyeDropper' in window
      ? (window as unknown as { EyeDropper: new () => { open(): Promise<{ sRGBHex: string }> } })
          .EyeDropper
      : null;

  return (
    <div className="iu-hsv">
      <div
        className="iu-hsv__area"
        style={{ ['--iu-hue' as string]: `hsl(${hsv.h} 100% 50%)` }}
        onPointerDown={onArea}
        onPointerMove={onArea}
        role="slider"
        tabIndex={0}
        aria-label={labels.colorSaturation}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.02;
          const moves: Record<string, Hsv> = {
            ArrowLeft: { ...hsv, s: Math.max(0, hsv.s - step) },
            ArrowRight: { ...hsv, s: Math.min(1, hsv.s + step) },
            ArrowUp: { ...hsv, v: Math.min(1, hsv.v + step) },
            ArrowDown: { ...hsv, v: Math.max(0, hsv.v - step) },
          };
          const next = moves[e.key];
          if (next) {
            e.preventDefault();
            emit(next);
          }
        }}
      >
        <span
          className="iu-hsv__thumb"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <div
        className="iu-hsv__hue"
        onPointerDown={onHue}
        onPointerMove={onHue}
        role="slider"
        tabIndex={0}
        aria-label={labels.colorHue}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hsv.h)}
        onKeyDown={(e) => {
          const d =
            e.key === 'ArrowRight' || e.key === 'ArrowUp'
              ? 1
              : e.key === 'ArrowLeft' || e.key === 'ArrowDown'
                ? -1
                : 0;
          if (!d) return;
          e.preventDefault();
          emit({ ...hsv, h: (hsv.h + d * (e.shiftKey ? 30 : 5) + 360) % 360 });
        }}
      >
        <span
          className="iu-hsv__thumb iu-hsv__thumb--hue"
          style={{ left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>
      <div className="iu-hsv__row">
        <label className="iu-field">
          <span className="iu-field__label">HEX</span>
          <input
            className="iu-field__input iu-field__input--hex"
            value={text}
            maxLength={7}
            onChange={(e) => {
              const next = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
              setText(next);
              if (/^#[0-9a-f]{6}$/i.test(next)) emit(hexToHsv(next.toLowerCase()));
            }}
          />
        </label>
        {eyeDropper && (
          <button
            type="button"
            className="iu-button iu-button--text"
            data-variant="secondary"
            onClick={() => {
              void new eyeDropper()
                .open()
                .then((r) => emit(hexToHsv(r.sRGBHex)))
                .catch(() => {});
            }}
          >
            <span className="iu-button__label">{labels.colorPick}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Captures the pointer on press and reports its position inside the element (0…1). */
function trackPointer(
  event: PointerEvent<HTMLDivElement>,
  apply: (x: number, y: number) => void,
): void {
  const el = event.currentTarget;
  if (event.type === 'pointerdown') el.setPointerCapture(event.pointerId);
  else if (!el.hasPointerCapture(event.pointerId)) return;
  const rect = el.getBoundingClientRect();
  apply(
    Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  );
}
