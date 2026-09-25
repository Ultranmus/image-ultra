import { useRef, useState, type KeyboardEvent } from 'react';
import { useLabels } from '../context';
import { Popover } from './Popover';
import { DEFAULT_SWATCHES, HsvPicker } from './SwatchPicker';

export interface ColorStripProps {
  /** Accessible name of the group, e.g. "Fill colour". */
  label: string;
  /** Hex colour. */
  value: string;
  onChange: (value: string) => void;
  swatches?: readonly string[];
}

/**
 * Colours laid out inline, like the filter strip: one tap picks a swatch; the last button opens the
 * full picker (HSV, hex, eyedropper) for any other colour. Scrolls sideways when narrow.
 */
export function ColorStrip({
  label,
  value,
  onChange,
  swatches = DEFAULT_SWATCHES,
}: ColorStripProps) {
  const labels = useLabels();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const current = value.toLowerCase();
  const isCustom = !swatches.some((s) => s.toLowerCase() === current);

  // Arrow keys move between swatches (and select), like other radio groups.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const dir = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    const index = refs.current.findIndex((el) => el === document.activeElement);
    const next = refs.current[index + dir];
    if (!next) return;
    event.preventDefault();
    next.focus();
    next.click();
  };

  return (
    <div className="iu-colorstrip" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {swatches.map((swatch, i) => {
        const checked = swatch.toLowerCase() === current;
        return (
          <button
            key={swatch}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={swatch}
            tabIndex={checked || (isCustom && i === 0) ? 0 : -1}
            className="iu-colorstrip__swatch"
            style={{ ['--iu-dot' as string]: swatch }}
            onClick={() => onChange(swatch)}
          />
        );
      })}
      <Popover
        label={labels.colorCustom}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        trigger={
          <button
            type="button"
            role="radio"
            aria-checked={isCustom}
            aria-label={labels.colorCustom}
            data-tooltip={labels.colorCustom}
            className="iu-colorstrip__swatch iu-colorstrip__custom"
            style={isCustom ? { ['--iu-dot' as string]: value } : undefined}
          />
        }
      >
        <HsvPicker value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff'} onChange={onChange} />
      </Popover>
    </div>
  );
}
